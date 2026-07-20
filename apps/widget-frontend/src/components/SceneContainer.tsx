import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera, OrbitControls, Grid, ContactShadows, Box } from '@react-three/drei';
import { useStore } from '../store';
// WallLayer removed - using graph-based WallGraph now
import { WallEditor } from './WallEditor';
import { WallGraph } from './WallGraph';
import { ObjectLayer } from './ObjectLayer';
import { FurniturePlacer } from './FurniturePlacer';
import { FirstPersonController } from './FirstPersonController';
import { PlanUnderlay } from './PlanUnderlay';

export const SceneContainer: React.FC = () => {
    const scene = useStore((state) => state.scene);
    const editorMode = useStore((state) => state.editorMode);
    // Disable controls while dragging objects to prevent conflicts
    const isDragging = useStore((state) => state.isDragging);
        const activeWallId = useStore((state) => state.activeWallId);
    const activeObjectId = useStore((state) => state.activeObjectId);
    const wallDrawingStart = useStore((state) => state.wallDrawingStart);
    const walls = useStore((state) => state.scene.walls);
    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const mode = scene.camera.mode;
    const spawnObject = useStore((state) => 
        state.scene.objects.find(o => o.catalogId === 'spawn_point')
    );
    const isNightMode = useStore((state) => state.isNightMode);
    const lightsOn = useStore((state) => state.lightsOn);

    const bounds = React.useMemo(() => {
        const nodes = scene.nodes || [];
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
    }, [scene.nodes]);

    const controlsRef = React.useRef<any>(null);

    // Handle Undo/Redo Shortcuts
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

        // 1. Check Active Wall
        if (activeWallId) {
            const edge = scene.edges.find(e => e.id === activeWallId);
            if (edge) {
                const n1 = scene.nodes.find(n => n.id === edge.startNodeId);
                const n2 = scene.nodes.find(n => n.id === edge.endNodeId);
                if (n1 && n2) {
                    targetX = (n1.x + n2.x) / 2;
                    targetZ = (n1.y + n2.y) / 2;
                    found = true;
                }
            }
        }
        // 2. Check Active Object (Furniture)
        if (!found && activeObjectId) {
            const obj = scene.objects.find(o => o.id === activeObjectId);
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
        <Canvas 
            shadows 
            dpr={[1, 2]} 
            gl={{ antialias: true }}
            style={{ background: '#f8fafc', width: '100%', height: '100%' }}
        >
            {/* Ambient Lighting based on Day/Night & Lights Toggles */}
            <ambientLight 
                color={isNightMode ? (lightsOn ? "#1e293b" : "#0b0f19") : "#ffffff"} 
                intensity={isNightMode ? (lightsOn ? 0.25 : 0.08) : 0.65} 
            />
            {/* Cozy Soft Warm Ambient Fill Light when indoor lights are ON */}
            {lightsOn && (
                <ambientLight color="#fef08a" intensity={isNightMode ? 0.35 : 0.15} />
            )}

            {/* Sun or Moon Directional Light casting high-fidelity sharp shadows */}
            <directionalLight 
                position={[15, 25, 10]} 
                castShadow 
                color={isNightMode ? "#38bdf8" : "#fffbeb"} 
                intensity={isNightMode ? 0.12 : 0.75} 
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0003}
            >
                <orthographicCamera attach="shadow-camera" args={[-15, 15, 15, -15, 0.1, 50]} />
            </directionalLight>

            {/* Suspended Point Lights distributed across the plan when interior lights are ON */}
            {lightsOn && (
                <group name="InteriorPointLights">
                    {/* Bathroom/Kitchen area */}
                    <pointLight position={[-2.5, 2.3, -2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} castShadow />
                    {/* Corridor/Living area */}
                    <pointLight position={[2.5, 2.3, -2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} castShadow />
                    {/* Kitchen counter area */}
                    <pointLight position={[-2.5, 2.3, 2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} castShadow />
                    {/* Bedroom area */}
                    <pointLight position={[2.5, 2.3, 2.5]} color="#fef08a" intensity={isNightMode ? 1.5 : 0.5} distance={8} decay={1.5} castShadow />
                </group>
            )}
            {/* Global premium soft contact shadows & solid ground plane to ground all 3D furniture blocks */}
            {mode !== '2d' && (
                <>
                    <ContactShadows 
                        position={[0, 0.025, 0]} 
                        opacity={0.6} 
                        scale={30} 
                        blur={2.0} 
                        far={5} 
                    />
                    {/* High-fidelity ground plane that receives real-time shadows */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
                        <planeGeometry args={[100, 100]} />
                        <meshStandardMaterial color="#f1f5f9" roughness={0.9} metalness={0.05} />
                    </mesh>
                </>
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
                        // Lock polar angle to a tiny non-zero offset to prevent random 2D canvas rotation
                        minPolarAngle={0.001}
                        maxPolarAngle={0.001}
                        // We do NOT disable enabled={...} because it kills wheel zoom. 
                        // Instead relies on event propagation or custom logic if needed.
                        // But to prevent conflict with dragging node, we rely on `isDragging`.
                        enabled={!isDragging}
                        mouseButtons={{
                            LEFT: 2, // Right Click Pan (Standard CAD: Middle or Right pan)
                            MIDDLE: 2, // Middle Pan
                            RIGHT: 2   // Right Pan
                        }}
                    // In 2D, Left Click is for Selection/Drawing (handled by scene objects), 
                    // so we map OrbitControls Pan to Middle/Right.
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
                    <PerspectiveCamera makeDefault position={[5, 8, 5]} fov={50} />
                    <OrbitControls
                        makeDefault
                        ref={controlsRef}
                        enabled={!isDragging}
                        zoomSpeed={1.5}
                        mouseButtons={{
                            LEFT: undefined,   // Left Click = Select (handled by objects)
                            MIDDLE: 0, // 0 = ROTATE (Orbit)
                            RIGHT: 2   // 2 = PAN
                        }}
                    />
                    <Grid args={[20, 20]} cellColor="#e2e8f0" sectionColor="#cbd5e1" />
                    {/* Background Click to Deselect in 3D */}
                    <mesh
                        rotation={[-Math.PI / 2, 0, 0]}
                        position={[0, -0.01, 0]}
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
                    <PerspectiveCamera 
                        makeDefault 
                        position={spawnObject ? [spawnObject.pos.x, 1.6, spawnObject.pos.z] : [0, 1.6, 0]} 
                        fov={75} 
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

                    {/* Cozy and warm oak parquet wooden floor plane */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bounds.centerX, 0.002, bounds.centerZ]} receiveShadow>
                        <planeGeometry args={[bounds.width, bounds.depth]} />
                        <meshStandardMaterial color="#decba4" roughness={0.7} metalness={0.05} />
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
                <WallEditor /> // Re-using WallEditor which now handles openings
            )}

            <FurniturePlacer />
        </Canvas>
    );
};
