import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Wall, WallNode, WallEdge, WallKind, SceneData, EditorMode, CameraMode } from '@flat/shared';

interface Vector2 {
    x: number;
    y: number;
}

interface StoreState {
    // Scene
    scene: SceneData;

    // UI State
    planOpacity: number;
    detectionThreshold: number;
    editorMode: EditorMode;
    activeWallId: string | null;
    wallDrawingStart: { x: number, y: number } | null;
    isDragging: boolean;

    // History
    past: SceneData[];
    future: SceneData[];

    // Actions
    setPlanImage: (image: string | { url: string; width: number; height: number; } | null, width?: number, height?: number) => void;
    setPlanOpacity: (opacity: number) => void;
    setThreshold: (threshold: number) => void;

    // History Actions
    undo: () => void;
    redo: () => void;
    pushHistory: () => void;

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
    openingToolMode: 'door' | 'window' | 'glass_wall';
    setOpeningToolMode: (mode: 'door' | 'window' | 'glass_wall') => void;

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
    addOpening: (wallId: string, t: number, kind: 'window' | 'door', width?: number) => string;
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

    // Image Processing Settings
    imageProcessing: {
        grayscale: boolean;
        contrast: number; // 1.0 = normal, 2.0 = high
    };
    setImageProcessing: (settings: Partial<StoreState['imageProcessing']>) => void;

    // Day/Night & Lights Toggles
    isNightMode: boolean;
    lightsOn: boolean;
    toggleNightMode: () => void;
    toggleLights: () => void;
}

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
    detectionThreshold: 50,
    editorMode: 'view',
    activeWallId: null,
    wallDrawingStart: null,
    isDragging: false,

    isNightMode: false,
    lightsOn: true,
    toggleNightMode: () => set((state) => ({ isNightMode: !state.isNightMode })),
    toggleLights: () => set((state) => ({ lightsOn: !state.lightsOn })),

    // History
    past: [],
    future: [],

    pushHistory: () => {
        // Deep clone the current scene to avoid reference issues
        const currentScene = JSON.parse(JSON.stringify(get().scene));
        set((state) => ({
            past: [...state.past, currentScene],
            future: [] // Clear future on new action
        }));
    },

    undo: () => {
        const { past, future, scene } = get();
        if (past.length === 0) return;

        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        set({
            past: newPast,
            future: [JSON.parse(JSON.stringify(scene)), ...future],
            scene: previous
        });
    },

    redo: () => {
        const { past, future, scene } = get();
        if (future.length === 0) return;

        const next = future[0];
        const newFuture = future.slice(1);

        set({
            past: [...past, JSON.parse(JSON.stringify(scene))],
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
    setThreshold: (detectionThreshold) => set({ detectionThreshold }),

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
    setEditorMode: (mode) => set({ editorMode: mode }),
    setCameraMode: (mode) => set((state) => ({ scene: { ...state.scene, camera: { ...state.scene.camera, mode } } })),
    setIsDragging: (isDragging) => set({ isDragging }),
    setWallDrawingStart: (point) => set({ wallDrawingStart: point }),
    openingToolMode: 'door',
    setOpeningToolMode: (openingToolMode) => set({ openingToolMode }),

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
    setActiveCatalogId: (id) => set({ activeCatalogId: id }),

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
                edges: state.scene.edges.filter((e) => e.id !== id)
            }
        }));
    },

    splitEdge: (edgeId, x, y) => {
        const state = get();
        const edge = state.scene.edges.find((e) => e.id === edgeId);
        if (!edge) return '';

        get().pushHistory();
        // Create new node at split point
        const newNodeId = uuidv4();
        const newNode: WallNode = { id: newNodeId, x, y };

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
                edges: [...state.scene.edges.filter((e) => e.id !== edgeId), edge1, edge2]
            }
        }));
        return newNodeId;
    },

    getEdgesForNode: (nodeId) => {
        const state = get();
        return state.scene.edges.filter((e) => e.startNodeId === nodeId || e.endNodeId === nodeId);
    },

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

        const isDoor = kind === 'door';
        const defaultWidth = isDoor ? 0.9 : 1.2;

        const newOpening: any = {
            id,
            wallId,
            kind,
            t, // 0..1
            width: width || defaultWidth, // Use provided width or default
            height: isDoor ? 2.1 : 1.5,
            sillHeight: isDoor ? 0 : 0.9
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
