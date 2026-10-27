import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Wall, WallNode, WallEdge, WallKind, SceneData, EditorMode, CameraMode, FurnitureObject } from '@flat/shared';

interface Vector2 {
    x: number;
    y: number;
}

/** Wizard phase: structure QA → furnish → done (client-ready). */
export type EditorPhase = 'idle' | 'structure' | 'furniture' | 'done';

const isPlacedFurniture = (obj: FurnitureObject) => obj.catalogId !== 'spawn_point';

interface StoreState {
    // Scene
    scene: SceneData;

    // UI State
    planOpacity: number;
    detectionThreshold: number;
    /** True only after the user moves the sensitivity slider (forces OpenCV threshold). */
    thresholdManual: boolean;
    editorMode: EditorMode;
    /** After AI import: manager must confirm 2D structure before 3D/furniture. */
    planReviewActive: boolean;
    /** Explicit staged flow: structure → furniture → done. */
    editorPhase: EditorPhase;
    /** AI-detected furniture held until structure is confirmed. */
    pendingFurniture: FurnitureObject[];
    /** Sub-tool while editorMode === 'walls' (draw pencil vs erase segment). */
    wallToolMode: 'draw' | 'erase';
    activeWallId: string | null;
    wallDrawingStart: { x: number, y: number } | null;
    isDragging: boolean;

    // History
    past: SceneData[];
    future: SceneData[];

    // Actions
    setPlanImage: (image: string | { url: string; width: number; height: number; } | null, width?: number, height?: number) => void;
    setPlanOpacity: (opacity: number) => void;
    setThreshold: (threshold: number, manual?: boolean) => void;
    loadScene: (scene: SceneData) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;
    /** Pushes one history entry, then suppresses pushHistory until endHistoryBatch (for bulk ops like AI import) */
    beginHistoryBatch: () => void;
    endHistoryBatch: () => void;

    addWall: (a: Vector2, b: Vector2, data?: Partial<Wall>) => void;
    updateWall: (id: string, updates: Partial<Wall>) => void;
    deleteWall: (id: string) => void;
    clearWalls: () => void;
    setWalls: (walls: Wall[]) => void;

    setActiveWallId: (id: string | null) => void;
    setEditorMode: (mode: EditorMode) => void;
    setCameraMode: (mode: CameraMode) => void;
    setIsDragging: (isDragging: boolean) => void;
    setWallDrawingStart: (point: { x: number, y: number } | null) => void;
    openingToolMode: 'door' | 'balcony_door' | 'window' | 'glass_wall';
    setOpeningToolMode: (mode: 'door' | 'balcony_door' | 'window' | 'glass_wall') => void;
    setWallToolMode: (mode: 'draw' | 'erase') => void;
    startPlanReview: () => void;
    confirmPlanReview: () => void;
    /** Stitch near-miss wall corners (after AI import). */
    healWallGraph: () => void;
    finishFurniturePhase: () => void;
    /** Queue furniture for structure phase (or place immediately otherwise). */
    queueFurniture: (item: FurnitureObject) => void;
    applyPendingFurniture: () => void;
    clearPendingFurniture: () => void;
    clearFurnitureObjects: () => void;

    // Graph Actions (Node-Edge Architecture)
    addNode: (x: number, y: number) => string;
    updateNode: (id: string, x: number, y: number) => void;
    deleteNode: (id: string) => void;
    addEdge: (startNodeId: string, endNodeId: string, options?: Partial<WallEdge>) => string;
    deleteEdge: (id: string) => void;
    splitEdge: (edgeId: string, x: number, y: number) => string;
    getEdgesForNode: (nodeId: string) => WallEdge[];
    clearGraph: () => void;
    activeNodeId: string | null;
    setActiveNodeId: (id: string | null) => void;

    // Opening Actions
    addOpening: (wallId: string, t: number, kind: 'window' | 'door' | 'balcony_door', width?: number) => string;
    addWindowWall: (startNodeId: string, endNodeId: string, thickness?: number, options?: { type: 'standard' | 'panoramic' }) => void;
    updateOpening: (id: string, updates: Partial<any>) => void;
    deleteOpening: (id: string) => void;

    // Object Actions
    addObject: (item: any) => void;
    removeObject: (id: string) => void;
    updateObject: (id: string, updates: any) => void;

    activeObjectId: string | null;
    setActiveObjectId: (id: string | null) => void;

    activeOpeningId: string | null;
    setActiveOpeningId: (id: string | null) => void;

    activeCatalogId: string | null;
    setActiveCatalogId: (id: string | null) => void;

    /** Room preset armed for ghost placement (click a room to drop the set). */
    activePresetId: string | null;
    setActivePresetId: (id: string | null) => void;

    // Image Processing Settings
    imageProcessing: {
        grayscale: boolean;
        contrast: number; // 1.0 = normal, 2.0 = high
    };
    setImageProcessing: (settings: Partial<StoreState['imageProcessing']>) => void;

    // Day/Sunset/Night & Lights Toggles
    atmosphereMode: 'day' | 'sunset' | 'night';
    isNightMode: boolean;
    lightsOn: boolean;
    setAtmosphereMode: (mode: 'day' | 'sunset' | 'night') => void;
    toggleNightMode: () => void;
    toggleLights: () => void;
    wallCutaway3D: boolean;
    toggleWallCutaway: () => void;
    setWallCutaway: (cutaway: boolean) => void;

    // Materials Customization
    setFloorMaterial: (floorId: string) => void;
    setWallColor: (color: string) => void;

    // Window View Backdrops
    windowBackdrop: 'city_day' | 'park_day' | 'sunset' | 'night_city' | 'custom';
    customBackdropUrl?: string;
    setWindowBackdrop: (backdrop: 'city_day' | 'park_day' | 'sunset' | 'night_city' | 'custom', customUrl?: string) => void;
}

const HISTORY_LIMIT = 50;

/** Max gap (m) auto-closed when healing wall corners after AI import. */
const CORNER_HEAL_DIST = 0.45;
/** Any two nodes closer than this are treated as the same corner. */
const MERGE_ANY_DIST = 0.22;
/** Within this fraction of wall length, splitEdge snaps to an existing endpoint. */
const SPLIT_END_EPS = 0.08;

/**
 * Stitches near-miss wall corners: merges nearby nodes, attaches loose ends
 * onto nearby walls (T-junction via split), drops degenerate/duplicate edges.
 */
function healGraphScene(scene: SceneData): SceneData {
    let nodes = scene.nodes.map((n) => ({ ...n }));
    let edges = scene.edges.map((e) => ({ ...e }));
    let openings = scene.openings.map((o) => ({ ...o }));

    const degreeOf = (id: string) =>
        edges.reduce((acc, e) => acc + (e.startNodeId === id ? 1 : 0) + (e.endNodeId === id ? 1 : 0), 0);

    const mergeNodeInto = (fromId: string, targetId: string) => {
        edges.forEach((e) => {
            if (e.startNodeId === fromId) e.startNodeId = targetId;
            if (e.endNodeId === fromId) e.endNodeId = targetId;
        });
        nodes = nodes.filter((n) => n.id !== fromId);
    };

    // Pass 0: merge any nodes that sit on top of each other (broken AI corners)
    let merged = true;
    while (merged) {
        merged = false;
        outer: for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                if (Math.hypot(a.x - b.x, a.y - b.y) < MERGE_ANY_DIST) {
                    mergeNodeInto(b.id, a.id);
                    merged = true;
                    break outer;
                }
            }
        }
    }

    // Pass 1: merge loose endpoints (degree <= 1) into the nearest other node
    for (const node of [...nodes]) {
        if (!nodes.some((n) => n.id === node.id)) continue;
        if (degreeOf(node.id) > 1) continue;
        let best: WallNode | null = null;
        let bestDist = CORNER_HEAL_DIST;
        for (const other of nodes) {
            if (other.id === node.id) continue;
            const d = Math.hypot(other.x - node.x, other.y - node.y);
            if (d < bestDist) {
                bestDist = d;
                best = other;
            }
        }
        if (!best) continue;
        mergeNodeInto(node.id, best.id);
    }

    // Drop collapsed and duplicate edges (and their openings)
    const dropped = new Set<string>();
    const seenPairs = new Set<string>();
    edges = edges.filter((e) => {
        if (e.startNodeId === e.endNodeId) {
            dropped.add(e.id);
            return false;
        }
        const key = [e.startNodeId, e.endNodeId].sort().join('|');
        if (seenPairs.has(key)) {
            dropped.add(e.id);
            return false;
        }
        seenPairs.add(key);
        return true;
    });
    openings = openings.filter((o) => !dropped.has(o.wallId));

    // Pass 2: attach remaining loose ends onto a nearby wall (T-junction)
    for (const node of [...nodes]) {
        if (!nodes.some((n) => n.id === node.id)) continue;
        if (degreeOf(node.id) !== 1) continue;
        let bestEdge: WallEdge | null = null;
        let bestT = 0;
        let bestDist = CORNER_HEAL_DIST;
        let bestX = 0;
        let bestY = 0;
        for (const e of edges) {
            if (e.startNodeId === node.id || e.endNodeId === node.id) continue;
            const a = nodes.find((n) => n.id === e.startNodeId);
            const b = nodes.find((n) => n.id === e.endNodeId);
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) continue;
            let t = ((node.x - a.x) * dx + (node.y - a.y) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            const d = Math.hypot(node.x - px, node.y - py);
            if (d < bestDist) {
                bestDist = d;
                bestEdge = e;
                bestT = t;
                bestX = px;
                bestY = py;
            }
        }
        if (!bestEdge) continue;

        // Near an existing corner → just merge into that endpoint
        if (bestT <= SPLIT_END_EPS) {
            mergeNodeInto(node.id, bestEdge.startNodeId);
            continue;
        }
        if (bestT >= 1 - SPLIT_END_EPS) {
            mergeNodeInto(node.id, bestEdge.endNodeId);
            continue;
        }

        // Snap the loose node onto the wall axis and split the wall through it
        node.x = bestX;
        node.y = bestY;
        const tSplit = Math.max(0.02, Math.min(0.98, bestT));
        const half1: WallEdge = { ...bestEdge, id: uuidv4(), endNodeId: node.id };
        const half2: WallEdge = { ...bestEdge, id: uuidv4(), startNodeId: node.id };
        const splitId = bestEdge.id;
        openings = openings.map((o) => {
            if (o.wallId !== splitId) return o;
            if (o.t <= tSplit) return { ...o, wallId: half1.id, t: tSplit > 0 ? o.t / tSplit : 0.5 };
            return { ...o, wallId: half2.id, t: (o.t - tSplit) / (1 - tSplit) };
        });
        edges = edges.filter((e) => e.id !== splitId);
        edges.push(half1, half2);
    }

    return { ...scene, nodes, edges, openings };
}

// Module-level flag: while a batch is active, individual actions do not push history
let isHistoryBatchActive = false;

export const useStore = create<StoreState>((set, get) => ({
    scene: {
        schemaVersion: "1.0",
        walls: [],
        nodes: [],
        edges: [],
        openings: [],
        objects: [
            {
                id: 'default_spawn_point',
                catalogId: 'spawn_point',
                pos: { x: -6, y: 0, z: -6 },
                rot: 0,
                scale: { x: 1, y: 1, z: 1 }
            }
        ],
        materials: { wallIds: {} },
        planImage: null,
        camera: {
            mode: '2d',
            zoom: 1,
            position: { x: 0, y: 10, z: 0 },
            target: { x: 0, y: 0, z: 0 }
        }
    },
    planOpacity: 0.5,
    planReviewActive: false,
    editorPhase: 'idle',
    pendingFurniture: [],
    wallToolMode: 'draw',
    detectionThreshold: 50,
    thresholdManual: false,
    editorMode: 'view',
    activeWallId: null,
    wallDrawingStart: null,
    isDragging: false,

    atmosphereMode: 'day',
    isNightMode: false,
    lightsOn: true,
    setAtmosphereMode: (atmosphereMode) => set({
        atmosphereMode,
        isNightMode: atmosphereMode === 'night'
    }),
    toggleNightMode: () => set((state) => {
        const nextNight = !state.isNightMode;
        return {
            isNightMode: nextNight,
            atmosphereMode: nextNight ? 'night' : 'day'
        };
    }),
    toggleLights: () => set((state) => ({ lightsOn: !state.lightsOn })),
    wallCutaway3D: true,
    toggleWallCutaway: () => set((state) => ({ wallCutaway3D: !state.wallCutaway3D })),
    setWallCutaway: (wallCutaway3D) => set({ wallCutaway3D }),

    setFloorMaterial: (floorId) => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                materials: {
                    ...state.scene.materials,
                    floorId
                }
            }
        }));
    },

    setWallColor: (wallColor) => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                materials: {
                    ...state.scene.materials,
                    wallColor
                }
            }
        }));
    },

    // Window View Backdrops
    windowBackdrop: 'city_day',
    customBackdropUrl: undefined,
    setWindowBackdrop: (backdrop, customUrl) => {
        set({ windowBackdrop: backdrop, customBackdropUrl: customUrl });
    },

    // History
    past: [],
    future: [],

    pushHistory: () => {
        if (isHistoryBatchActive) return;
        // Deep clone the current scene to avoid reference issues
        const currentScene = structuredClone(get().scene);
        set((state) => ({
            // Cap the stack so long sessions don't accumulate unbounded scene copies
            past: [...state.past.slice(-(HISTORY_LIMIT - 1)), currentScene],
            future: [] // Clear future on new action
        }));
    },

    beginHistoryBatch: () => {
        get().pushHistory();
        isHistoryBatchActive = true;
    },

    endHistoryBatch: () => {
        isHistoryBatchActive = false;
    },

    undo: () => {
        const { past, future, scene } = get();
        if (past.length === 0) return;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        set({
            past: newPast,
            future: [structuredClone(scene), ...future],
            scene: previous
        });
    },

    redo: () => {
        const { past, future, scene } = get();
        if (future.length === 0) return;

        const next = future[0];
        const newFuture = future.slice(1);

        set({
            past: [...past, structuredClone(scene)],
            future: newFuture,
            scene: next
        });
    },

    setPlanImage: (image, width, height) => {
        let finalImage = image;
        if (typeof image === 'string' && width !== undefined && height !== undefined) {
            finalImage = { url: image, width, height };
        }
        set((state) => ({ scene: { ...state.scene, planImage: finalImage } }));
    },
    setPlanOpacity: (opacity) => set({ planOpacity: opacity }),
    loadScene: (newScene) => {
        get().pushHistory();
        const healed = healGraphScene(newScene);
        set({
            scene: healed,
            planReviewActive: false,
            editorPhase: (newScene.objects && newScene.objects.length > 0) ? 'done' : 'furniture',
            editorMode: 'view',
            pendingFurniture: [],
            activeWallId: null,
            activeNodeId: null,
            activeObjectId: null,
            activeOpeningId: null,
        });
    },
    setThreshold: (detectionThreshold, manual = true) =>
        set({ detectionThreshold, thresholdManual: manual }),

    addWall: (a, b, data) => {
        get().pushHistory(); // Save state
        const newWall: Wall = {
            id: uuidv4(),
            a,
            b,
            thickness: 0.15,
            height: 2.7,
            kind: 'user',
            ...data
        };
        set((state) => ({
            scene: { ...state.scene, walls: [...state.scene.walls, newWall] }
        }));
    },

    updateWall: (id, updates) => set((state) => ({
        scene: {
            ...state.scene,
            walls: state.scene.walls.map((w) => (w.id === id ? { ...w, ...updates } : w))
        }
    })),

    deleteWall: (id) => {
        get().pushHistory(); // Save state
        set((state) => ({
            scene: { ...state.scene, walls: state.scene.walls.filter((w) => w.id !== id) },
            activeWallId: state.activeWallId === id ? null : state.activeWallId
        }));
    },

    clearWalls: () => {
        get().pushHistory();
        set((state) => {
            const spawnPoint = state.scene.objects.find(o => o.catalogId === 'spawn_point');
            return {
                pendingFurniture: [],
                scene: {
                    ...state.scene,
                    walls: [],
                    nodes: [], // Also clear graph nodes
                    edges: [],  // Also clear graph edges
                    openings: [], // Also clear all door/window openings
                    objects: spawnPoint ? [spawnPoint] : [{
                        id: 'default_spawn_point',
                        catalogId: 'spawn_point',
                        pos: { x: -6, y: 0, z: -6 },
                        rot: 0,
                        scale: { x: 1, y: 1, z: 1 }
                    }]
                }
            };
        });
    },

    setWalls: (walls) => {
        get().pushHistory();
        set((state) => ({ scene: { ...state.scene, walls } }));
    },

    setActiveWallId: (id) => set({ activeWallId: id }),
    setEditorMode: (mode) => {
        const review = get().planReviewActive;
        const phase = get().editorPhase;
        // During plan review, furniture / free 3D workflow is locked
        if (review && mode === 'furniture') return;
        // Furniture step: keep focus on placement (structure soft-locked)
        if (phase === 'furniture' && (mode === 'walls' || mode === 'openings')) return;
        set({ editorMode: mode, wallToolMode: mode === 'walls' ? get().wallToolMode : 'draw' });
    },
    setCameraMode: (mode) => {
        if (get().planReviewActive && mode !== '2d') return;
        set((state) => ({ scene: { ...state.scene, camera: { ...state.scene.camera, mode } } }));
    },
    setIsDragging: (isDragging) => set({ isDragging }),
    setWallDrawingStart: (point) => set({ wallDrawingStart: point }),
    openingToolMode: 'door',
    setOpeningToolMode: (openingToolMode) => set({ openingToolMode }),
    setWallToolMode: (wallToolMode) => set({ wallToolMode, editorMode: 'walls' }),
    startPlanReview: () => set((state) => {
        // Park any furniture already on the scene so structure QA stays clean
        const parked = state.scene.objects.filter(isPlacedFurniture);
        const spawnOnly = state.scene.objects.filter((o) => !isPlacedFurniture(o));
        const healed = healGraphScene({
            ...state.scene,
            objects: spawnOnly.length > 0 ? spawnOnly : [{
                id: 'default_spawn_point',
                catalogId: 'spawn_point',
                pos: { x: -6, y: 0, z: -6 },
                rot: 0,
                scale: { x: 1, y: 1, z: 1 }
            }],
            camera: { ...state.scene.camera, mode: '2d' as CameraMode },
        });
        return {
            planReviewActive: true,
            editorPhase: 'structure' as EditorPhase,
            wallToolMode: 'draw' as const,
            editorMode: 'walls' as EditorMode,
            planOpacity: Math.max(state.planOpacity, 0.65),
            pendingFurniture: parked.length > 0
                ? [...state.pendingFurniture, ...parked]
                : state.pendingFurniture,
            activeObjectId: null,
            activeCatalogId: null,
            scene: healed,
        };
    }),
    confirmPlanReview: () => {
        const pending = get().pendingFurniture;
        get().pushHistory();
        set((state) => {
            const healed = healGraphScene(state.scene);
            return {
                planReviewActive: false,
                editorPhase: 'furniture' as EditorPhase,
                wallToolMode: 'draw' as const,
                editorMode: 'furniture' as EditorMode,
                pendingFurniture: [],
                activeWallId: null,
                activeOpeningId: null,
                activeNodeId: null,
                scene: {
                    ...healed,
                    objects: [
                        ...healed.objects.filter((o) => !isPlacedFurniture(o)),
                        ...pending,
                    ],
                },
            };
        });
    },
    finishFurniturePhase: () => set((state) => ({
        editorPhase: 'done' as EditorPhase,
        editorMode: 'view' as EditorMode,
        activeCatalogId: null,
        scene: {
            ...state.scene,
            camera: { ...state.scene.camera, mode: '3d' as CameraMode },
        },
    })),
    queueFurniture: (obj) => {
        if (get().planReviewActive || get().editorPhase === 'structure') {
            set((state) => ({ pendingFurniture: [...state.pendingFurniture, obj] }));
            return;
        }
        get().addObject(obj);
    },
    applyPendingFurniture: () => {
        const pending = get().pendingFurniture;
        if (pending.length === 0) return;
        get().pushHistory();
        set((state) => ({
            pendingFurniture: [],
            scene: {
                ...state.scene,
                objects: [...state.scene.objects, ...pending],
            },
        }));
    },
    clearPendingFurniture: () => set({ pendingFurniture: [] }),
    clearFurnitureObjects: () => {
        get().pushHistory();
        set((state) => {
            const spawnPoint = state.scene.objects.find((o) => o.catalogId === 'spawn_point');
            return {
                pendingFurniture: [],
                activeObjectId: null,
                scene: {
                    ...state.scene,
                    objects: spawnPoint ? [spawnPoint] : [{
                        id: 'default_spawn_point',
                        catalogId: 'spawn_point',
                        pos: { x: -6, y: 0, z: -6 },
                        rot: 0,
                        scale: { x: 1, y: 1, z: 1 }
                    }],
                },
            };
        });
    },

    addObject: (obj) => {
        get().pushHistory();
        set((state) => ({
            scene: { ...state.scene, objects: [...state.scene.objects, obj] }
        }));
    },

    removeObject: (id) => {
        const obj = get().scene.objects.find(o => o.id === id);
        if (obj?.catalogId === 'spawn_point') {
            return; // Protect spawn point from deletion!
        }
        get().pushHistory();
        set((state) => ({
            scene: { ...state.scene, objects: state.scene.objects.filter((o) => o.id !== id) },
            activeObjectId: state.activeObjectId === id ? null : state.activeObjectId // Clear selection if deleted
        }));
    },

    updateObject: (id, updates) => {
        set((state) => ({
            scene: {
                ...state.scene,
                objects: state.scene.objects.map((o) => (o.id === id ? { ...o, ...updates } : o))
            }
        }));
    },

    activeObjectId: null,
    setActiveObjectId: (id) => set({ activeObjectId: id }),

    activeOpeningId: null,
    setActiveOpeningId: (id) => set({ activeOpeningId: id }),

    activeCatalogId: null,
    setActiveCatalogId: (id) => set({ activeCatalogId: id, ...(id ? { activePresetId: null } : {}) }),

    activePresetId: null,
    setActivePresetId: (id) => {
        if (id && get().planReviewActive) return;
        set({ activePresetId: id, ...(id ? { activeCatalogId: null } : {}) });
        if (id) get().setEditorMode('furniture');
    },

    imageProcessing: {
        grayscale: false,
        contrast: 1.0,
    },
    setImageProcessing: (settings) => set((state) => ({
        imageProcessing: { ...state.imageProcessing, ...settings }
    })),

    // Opening Actions - Implemented below

    // Graph Actions (Node-Edge Architecture)
    activeNodeId: null,
    setActiveNodeId: (id) => set({ activeNodeId: id }),

    addNode: (x, y) => {
        // Reuse an existing corner instead of creating a near-duplicate gap
        const MERGE_DIST = 0.25;
        const existing = get().scene.nodes.find(
            (n) => Math.hypot(n.x - x, n.y - y) < MERGE_DIST
        );
        if (existing) return existing.id;

        const id = uuidv4();
        set((state) => ({
            scene: {
                ...state.scene,
                nodes: [...state.scene.nodes, { id, x, y }]
            }
        }));
        return id;
    },

    updateNode: (id, x, y) => {
        set((state) => ({
            scene: {
                ...state.scene,
                nodes: state.scene.nodes.map((n) => (n.id === id ? { ...n, x, y } : n))
            }
        }));
    },

    deleteNode: (id) => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                nodes: state.scene.nodes.filter((n) => n.id !== id),
                // Also delete all edges connected to this node
                edges: state.scene.edges.filter((e) => e.startNodeId !== id && e.endNodeId !== id)
            },
            activeNodeId: state.activeNodeId === id ? null : state.activeNodeId
        }));
    },

    addEdge: (startNodeId, endNodeId, options = {}) => {
        const id = uuidv4();
        get().pushHistory();
        const newEdge: WallEdge = {
            id,
            startNodeId,
            endNodeId,
            thickness: 0.15,
            height: 2.7,
            kind: 'user',
            ...options
        };
        set((state) => ({
            scene: {
                ...state.scene,
                edges: [...state.scene.edges, newEdge]
            }
        }));
        return id;
    },

    deleteEdge: (id) => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                edges: state.scene.edges.filter((e) => e.id !== id),
                // Drop openings that belonged to the removed wall
                openings: state.scene.openings.filter((o) => o.wallId !== id),
            },
            activeWallId: state.activeWallId === id ? null : state.activeWallId,
            activeOpeningId:
                state.activeOpeningId &&
                state.scene.openings.some((o) => o.id === state.activeOpeningId && o.wallId === id)
                    ? null
                    : state.activeOpeningId,
        }));
    },

    splitEdge: (edgeId, x, y) => {
        const state = get();
        const edge = state.scene.edges.find((e) => e.id === edgeId);
        if (!edge) return '';
        const a = state.scene.nodes.find((n) => n.id === edge.startNodeId);
        const b = state.scene.nodes.find((n) => n.id === edge.endNodeId);
        if (!a || !b) return '';

        // Project the click onto the wall axis so both halves stay collinear
        // (raw click coords would bend the wall through an off-axis point)
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return '';
        let t = ((x - a.x) * dx + (y - a.y) * dy) / lenSq;
        // Near a corner → reuse the existing endpoint (no bounce / gap)
        if (t <= SPLIT_END_EPS) return a.id;
        if (t >= 1 - SPLIT_END_EPS) return b.id;
        t = Math.max(0.02, Math.min(0.98, t));
        const px = a.x + t * dx;
        const py = a.y + t * dy;

        // Also snap to a nearby orphan node if one sits on this wall
        const nearNode = state.scene.nodes.find((n) => {
            if (n.id === a.id || n.id === b.id) return false;
            return Math.hypot(n.x - px, n.y - py) < 0.2;
        });
        if (nearNode) return nearNode.id;

        get().pushHistory();
        const newNodeId = uuidv4();
        const newNode: WallNode = { id: newNodeId, x: px, y: py };

        // Create two new edges replacing the old one
        const edge1: WallEdge = {
            id: uuidv4(),
            startNodeId: edge.startNodeId,
            endNodeId: newNodeId,
            thickness: edge.thickness,
            height: edge.height,
            kind: edge.kind
        };
        const edge2: WallEdge = {
            id: uuidv4(),
            startNodeId: newNodeId,
            endNodeId: edge.endNodeId,
            thickness: edge.thickness,
            height: edge.height,
            kind: edge.kind
        };

        set((state) => ({
            scene: {
                ...state.scene,
                nodes: [...state.scene.nodes, newNode],
                edges: [...state.scene.edges.filter((e) => e.id !== edgeId), edge1, edge2],
                // Re-home openings from the split wall onto the correct half
                openings: state.scene.openings.map((o) => {
                    if (o.wallId !== edgeId) return o;
                    if (o.t <= t) return { ...o, wallId: edge1.id, t: t > 0 ? o.t / t : 0.5 };
                    return { ...o, wallId: edge2.id, t: (o.t - t) / (1 - t) };
                }),
            }
        }));
        return newNodeId;
    },

    getEdgesForNode: (nodeId) => {
        const state = get();
        return state.scene.edges.filter((e) => e.startNodeId === nodeId || e.endNodeId === nodeId);
    },

    healWallGraph: () => set((state) => ({ scene: healGraphScene(state.scene) })),

    clearGraph: () => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                nodes: [],
                edges: []
            }
        }));
    },

    // Opening Actions Implementation
    addOpening: (wallId, t, kind, width) => {
        const id = uuidv4();
        get().pushHistory();

        const isSwing = kind === 'door' || kind === 'balcony_door';
        const isBalcony = kind === 'balcony_door';
        const defaultWidth = isBalcony ? 0.9 : (kind === 'door' ? 0.9 : 1.2);

        const newOpening: any = {
            id,
            wallId,
            kind,
            t, // 0..1
            width: width || defaultWidth,
            height: isSwing ? 2.1 : 1.5,
            sillHeight: isSwing ? 0 : 0.9,
            ...(isSwing
                ? {
                    hingeSide: 'left' as const,
                    swingSide: isBalcony ? ('out' as const) : ('in' as const),
                }
                : {}),
        };

        set((state) => ({
            scene: {
                ...state.scene,
                openings: [...state.scene.openings, newOpening]
            }
        }));
        return id;
    },

    // NEW: Atomic action to add a wall with a window
    addWindowWall: (startNodeId, endNodeId, thickness, options) => {
        get().pushHistory();
        const state = get();

        // 1. Create Edge
        const edgeId = uuidv4();
        const wallHeight = 2.7;
        const newEdge: WallEdge = {
            id: edgeId,
            startNodeId,
            endNodeId,
            thickness: thickness || 0.15,
            height: wallHeight,
            kind: 'user'
        };

        // 2. Create Full Width Opening
        const n1 = state.scene.nodes.find(n => n.id === startNodeId);
        const n2 = state.scene.nodes.find(n => n.id === endNodeId);
        if (!n1 || !n2) return;

        const dist = Math.hypot(n2.x - n1.x, n2.y - n1.y);
        const winWidth = Math.max(0.5, dist - 0.2);

        // Determine Window Properties based on Type
        // Standard: Sill 0.9, Height 1.5
        // Panoramic: Sill 0, Height 2.4 (or match wall - header)
        const isPanoramic = options?.type === 'panoramic';

        const sillHeight = isPanoramic ? 0.05 : 0.9; // 5cm frame for pano
        const winHeight = isPanoramic ? (wallHeight - 0.05) : 1.5;

        const openingId = uuidv4();
        const newOpening: any = {
            id: openingId,
            wallId: edgeId,
            kind: 'window',
            t: 0.5,
            width: winWidth,
            height: winHeight,
            sillHeight: sillHeight
        };

        set((state) => ({
            scene: {
                ...state.scene,
                edges: [...state.scene.edges, newEdge],
                openings: [...state.scene.openings, newOpening]
            }
        }));
    },

    updateOpening: (id, updates) => {
        set((state) => ({
            scene: {
                ...state.scene,
                openings: state.scene.openings.map((o) => (o.id === id ? { ...o, ...updates } : o))
            }
        }));
    },

    deleteOpening: (id) => {
        get().pushHistory();
        set((state) => ({
            scene: {
                ...state.scene,
                openings: state.scene.openings.filter((o) => o.id !== id)
            }
        }));
    },
}));
