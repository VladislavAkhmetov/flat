import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, OrbitControls, Grid, Box, Environment, RoundedBox, ContactShadows } from '@react-three/drei';
import { useStore } from '../store';
import { WallEditor } from './WallEditor';
import { WallGraph } from './WallGraph';
import { ObjectLayer } from './ObjectLayer';
import { FurniturePlacer } from './FurniturePlacer';
import { FirstPersonController } from './FirstPersonController';
import { PlanUnderlay } from './PlanUnderlay';
import { getFloorTexture, FLOOR_MATERIALS } from '../utils/materialTextures';

export const SceneContainer: React.FC = () => {
    // Narrow selectors instead of subscribing to the whole scene object
    const sceneNodes = useStore((state) => state.scene.nodes);
    const editorMode = useStore((state) => state.editorMode);
    const planReviewActive = useStore((state) => state.planReviewActive);
    // Disable controls while dragging objects to prevent conflicts
    const isDragging = useStore((state) => state.isDragging);
    const activeWallId = useStore((state) => state.activeWallId);
    const activeObjectId = useStore((state) => state.activeObjectId);
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const mode = useStore((state) => state.scene.camera.mode);
    const spawnObject = useStore((state) => 
        state.scene.objects.find(o => o.catalogId === 'spawn_point')
    );
    const atmosphereMode = useStore((state) => state.atmosphereMode || 'day');
    const isNightMode = useStore((state) => state.isNightMode);
    const lightsOn = useStore((state) => state.lightsOn);

    const floorId = useStore((state) => state.scene.materials?.floorId || 'wood_chevron');
    const floorMatInfo = React.useMemo(() => {
        return FLOOR_MATERIALS.find((m) => m.id === floorId) || FLOOR_MATERIALS[0];
    }, [floorId]);

    const bounds = React.useMemo(() => {
        const nodes = sceneNodes || [];
        if (nodes.length === 0) {
            return { minX: -5, maxX: 5, minZ: -5, maxZ: 5, width: 10, depth: 10, centerX: 0, centerZ: 0 };
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minZ) minZ = n.y;
            if (n.y > maxZ) maxZ = n.y;
        });
        
        minX -= 0.5;
        maxX += 0.5;
        minZ -= 0.5;
        maxZ += 0.5;
        
        return {
            width: maxX - minX,
            depth: maxZ - minZ,
            centerX: (minX + maxX) / 2,
            centerZ: (minZ + maxZ) / 2
        };
    }, [sceneNodes]);

    const floorTexture = React.useMemo(() => {
        const tex = getFloorTexture(floorId);
        if (tex) {
            tex.repeat.set(Math.max(1, bounds.width / 2.2), Math.max(1, bounds.depth / 2.2));
            tex.needsUpdate = true;
        }
        return tex;
    }, [floorId, bounds.width, bounds.depth]);

    // Lighting colors based on atmosphere
    const lightConfig = React.useMemo(() => {
        if (atmosphereMode === 'night' || isNightMode) {
            return {
                ambientColor: lightsOn ? '#3f3a28' : '#0b0f19',
                ambientIntensity: lightsOn ? 0.35 : 0.08,
                hemiColor: '#1e293b',
                hemiGround: '#0b0f19',
                hemiIntensity: 0.1,
                sunColor: '#38bdf8',
                sunIntensity: 0.12,
                sunPos: [15, 25, 10] as [number, number, number],
                bg: '#050811'
            };
        }
        if (atmosphereMode === 'sunset') {
            return {
                ambientColor: '#fed7aa',
                ambientIntensity: lightsOn ? 0.45 : 0.35,
                hemiColor: '#fb923c',
                hemiGround: '#7c2d12',
                hemiIntensity: 0.25,
                sunColor: '#ea580c',
                sunIntensity: 0.85,
                sunPos: [25, 12, 18] as [number, number, number],
                bg: '#fdf2e9'
            };
        }
        // Default Day
        return {
            ambientColor: lightsOn ? '#fffbe8' : '#ffffff',
            ambientIntensity: 0.45,
            hemiColor: '#eaf2ff',
            hemiGround: '#d9c9a8',
            hemiIntensity: 0.35,
            sunColor: '#fffbeb',
            sunIntensity: 0.75,
            sunPos: [15, 25, 10] as [number, number, number],
            bg: '#ffffff'
        };
    }, [atmosphereMode, isNightMode, lightsOn]);

    const controlsRef = React.useRef<any>(null);

    // Handle Undo/Redo + Delete selected wall/opening
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey) {
                if (e.code === 'KeyZ') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        redo();
                    } else {
                        undo();
                    }
                } else if (e.code === 'KeyY') {
                    e.preventDefault();
                    redo();
                }
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
                    return;
                }
                const state = useStore.getState();
                if (state.activeOpeningId) {
                    e.preventDefault();
                    state.deleteOpening(state.activeOpeningId);
                    state.setActiveOpeningId(null);
                    return;
                }
                if (state.activeWallId) {
                    const edge = state.scene.edges.find((ed) => ed.id === state.activeWallId);
                    // Allow bearing delete during plan review QA
                    if (edge && (edge.kind !== 'bearing' || state.planReviewActive)) {
                        e.preventDefault();
                        state.deleteEdge(state.activeWallId);
                        state.setActiveWallId(null);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Focus Camera on Selection
    React.useEffect(() => {
        if (!controlsRef.current) return;
        if (isDragging) return; // Prevent focus movement while dragging an object

        let targetX = 0;
        let targetZ = 0;
        let found = false;

        // Read scene once on selection change (no reactive subscription needed here)
        const currentScene = useStore.getState().scene;

        // 1. Check Active Wall
        if (activeWallId) {
            const edge = currentScene.edges.find(e => e.id === activeWallId);
            if (edge) {
                const n1 = currentScene.nodes.find(n => n.id === edge.startNodeId);
                const n2 = currentScene.nodes.find(n => n.id === edge.endNodeId);
                if (n1 && n2) {
                    targetX = (n1.x + n2.x) / 2;
                    targetZ = (n1.y + n2.y) / 2;
                    found = true;
                }
            }
        }
        // 2. Check Active Object (Furniture)
        if (!found && activeObjectId) {
            const obj = currentScene.objects.find(o => o.id === activeObjectId);
            if (obj) {
                targetX = obj.pos.x;
                targetZ = obj.pos.z;
                found = true;
            }
        }

        // Apply Focus
        if (found) {
            if (mode === '2d') {
                const camera = controlsRef.current.object;
                if (camera) {
                    // Set camera position exactly above the new target with a tiny Z-offset
                    // to lock OrbitControls' azimuthal angle (theta) and prevent canvas spinning/rotation.
                    camera.position.set(targetX, camera.position.y || 10, targetZ + 0.001);
                }
            }
            controlsRef.current.target.set(targetX, 0, targetZ);
            controlsRef.current.update();
        }
    }, [activeWallId, activeObjectId, mode]);

    return (
        <>
        {/* Static crosshair in walk mode: a fixed visual anchor noticeably reduces motion sickness */}
        {mode === 'walk' && (
            <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
                aria-hidden
            >
                <div className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-[0_0_3px_rgba(0,0,0,0.6)]" />
            </div>
        )}
        <Canvas 
            shadows={mode === 'walk'} 
            dpr={mode === '2d' ? [1, 2] : [1, 1.25]} 
            gl={{ antialias: mode === '2d', powerPreference: 'high-performance' }}
            style={{ background: lightConfig.bg, width: '100%', height: '100%' }}
        >
            {/* Ambient and Hemisphere lighting based on atmosphere mode */}
            <ambientLight 
                color={lightConfig.ambientColor} 
                intensity={lightConfig.ambientIntensity} 
            />
            <hemisphereLight
                color={lightConfig.hemiColor}
                groundColor={lightConfig.hemiGround}
                intensity={lightConfig.hemiIntensity}
            />

            {/* Sun or Moon Directional Light - the ONLY shadow-casting light in the scene */}
            <directionalLight 
                position={lightConfig.sunPos} 
                castShadow={mode === 'walk'} 
                color={lightConfig.sunColor} 
                intensity={lightConfig.sunIntensity} 
                shadow-mapSize={mode === 'walk' ? [1024, 1024] : [512, 512]}
                shadow-bias={-0.0003}
            >
                <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15, 0.1, 50]} />
            </directionalLight>

            {/* Suspended Point Lights distributed across the plan when interior lights are ON (no shadows) */}
            {lightsOn && (
                <group name="InteriorPointLights">
                    {/* Bathroom/Kitchen area */}
                    <pointLight position={[-2.5, 2.3, -2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} />
                    {/* Corridor/Living area */}
                    <pointLight position={[2.5, 2.3, -2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} />
                    {/* Kitchen counter area */}
                    <pointLight position={[-2.5, 2.3, 2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} />
                    {/* Bedroom area */}
                    <pointLight position={[2.5, 2.3, 2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} />
                </group>
            )}

            {/* HDRI only in walk — expensive IBL in orbital 3D kills FPS */}
            {mode === 'walk' && (
                <Environment preset="apartment" />
            )}

            {/* Solid ground plane in Walk mode only (3D orbital has floating architectural podium) */}
            {mode === 'walk' && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
                    <planeGeometry args={[100, 100]} />
                    <meshStandardMaterial color={isNightMode ? '#0f172a' : '#f1f5f9'} roughness={0.9} metalness={0.05} />
                </mesh>
            )}

            {mode === '2d' && (
                <>
                    {/* Position slightly offset in Z to avoid 2D gimbal lock polar singularity in OrbitControls */}
                    <OrthographicCamera makeDefault position={[0, 10, 0.001]} zoom={50} />
                    <OrbitControls
                        ref={controlsRef}
                        makeDefault
                        enableRotate={false}
                        enableZoom={true} // Always allow zoom, just filter pointer events for drawing
                        zoomToCursor={true}
                        minPolarAngle={0.001}
                        maxPolarAngle={0.001}
                        enabled={!isDragging}
                        mouseButtons={{
                            LEFT: 2, // Right Click Pan (Standard CAD: Middle or Right pan)
                            MIDDLE: 2, // Middle Pan
                            RIGHT: 2   // Right Pan
                        }}
                    />
                    {/* Background Click to Deselect */}
                    <mesh
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, -0.05, 0]}
                        onClick={(e) => {
                            if (useStore.getState().editorMode === 'walls') return;
                            e.stopPropagation();
                            useStore.getState().setActiveWallId(null);
                            useStore.getState().setActiveObjectId(null);
                        }}
                    >
                        <planeGeometry args={[200, 200]} />
                        <meshBasicMaterial transparent opacity={0} />
                    </mesh>
                    <Grid
                        args={[20, 20]}
                        cellSize={1}
                        cellThickness={0.5}
                        cellColor="#e2e8f0"
                        sectionSize={5}
                        sectionThickness={1}
                        sectionColor="#cbd5e1"
                        fadeDistance={30}
                        position={[0, 0, 0]}
                    />
                </>
            )}

            {mode === '3d' && (
                <>
                    <PerspectiveCamera 
                        makeDefault 
                        position={[
                            bounds.centerX + Math.max(bounds.width, bounds.depth, 7) * 0.95,
                            Math.max(bounds.width, bounds.depth, 7) * 1.15,
                            bounds.centerZ + Math.max(bounds.width, bounds.depth, 7) * 0.95
                        ]} 
                        fov={34} 
                    />
                    <OrbitControls
                        makeDefault
                        ref={controlsRef}
                        target={[bounds.centerX, 0.3, bounds.centerZ]}
                        enabled={!isDragging}
                        zoomSpeed={1.5}
                        mouseButtons={{
                            LEFT: undefined,   // Left Click = Select (handled by objects)
                            MIDDLE: 0, // 0 = ROTATE (Orbit)
                            RIGHT: 2   // 2 = PAN
                        }}
                    />

                    {/* Airbnb-style Monolithic Beveled Podium Slab */}
                    <RoundedBox 
                        args={[bounds.width + 0.25, 0.14, bounds.depth + 0.25]} 
                        radius={0.06} 
                        smoothness={4} 
                        position={[bounds.centerX, -0.07, bounds.centerZ]}
                        receiveShadow
                    >
                        <meshStandardMaterial 
                            color="#faf8f5"
                            roughness={0.7} 
                            metalness={0.02} 
                        />
                    </RoundedBox>

                    {/* Airbnb Porcelain Floor is the top surface of the Monolithic Podium Slab */}

                    {/* Airbnb-style Soft Ambient Contact Drop Shadow */}
                    <ContactShadows 
                        position={[bounds.centerX, -0.145, bounds.centerZ]} 
                        opacity={0.65} 
                        scale={Math.max(bounds.width, bounds.depth) * 1.6} 
                        blur={2.4} 
                        far={4} 
                        color="#4a4237" 
                    />

                    {/* Background Click to Deselect in 3D */}
                    <mesh
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, -0.2, 0]}
                        onClick={(e) => {
                            e.stopPropagation();
                            useStore.getState().setActiveWallId(null);
                            useStore.getState().setActiveObjectId(null);
                        }}
                    >
                        <planeGeometry args={[200, 200]} />
                        <meshBasicMaterial visible={false} />
                    </mesh>
                </>
            )}

            {mode === 'walk' && (
                <>
                    {/* FOV 60: high FOV (75+) amplifies peripheral optical flow - a major motion sickness trigger */}
                    <PerspectiveCamera 
                        makeDefault 
                        position={spawnObject ? [spawnObject.pos.x, 1.6, spawnObject.pos.z] : [0, 1.6, 0]} 
                        fov={60} 
                    />
                    <FirstPersonController />
                    
                    {/* Immersive white plaster ceiling bounded to layout bounds */}
                    <mesh rotation={[Math.PI / 2, 0, 0]} position={[bounds.centerX, 2.7, bounds.centerZ]} receiveShadow>
                        <planeGeometry args={[bounds.width, bounds.depth]} />
                        <meshStandardMaterial color="#faf9f6" roughness={0.95} metalness={0.02} />
                    </mesh>

                    {/* Premium 3D solid concrete foundation slab */}
                    <Box args={[bounds.width, 0.2, bounds.depth]} position={[bounds.centerX, -0.1, bounds.centerZ]} receiveShadow>
                        <meshStandardMaterial color="#cbd5e1" roughness={0.8} metalness={0.1} />
                    </Box>

                    {/* Finished floor plane with chosen PBR material in Walk mode */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.centerX, 0.002, bounds.centerZ]} receiveShadow>
                        <planeGeometry args={[bounds.width, bounds.depth]} />
                        <meshStandardMaterial 
                            map={floorTexture || undefined} 
                            color={floorTexture ? '#ffffff' : (floorMatInfo.color || '#e8dfd1')}
                            roughness={floorMatInfo.roughness ?? 0.6} 
                            metalness={floorMatInfo.metalness ?? 0.02} 
                        />
                    </mesh>
                </>
            )}

            {mode !== 'walk' && <PlanUnderlay />}
            <WallGraph />
            <ObjectLayer />

            {/* Wall Editor - click to add walls in walls mode */}
            {editorMode === 'walls' && mode === '2d' && (
                <WallEditor />
            )}

            {/* Opening Editor - click to add openings in openings mode */}
            {editorMode === 'openings' && mode === '2d' && (
                <WallEditor />
            )}

            {!planReviewActive && <FurniturePlacer />}
        </Canvas>
        </>
    );
};

export default SceneContainer;
