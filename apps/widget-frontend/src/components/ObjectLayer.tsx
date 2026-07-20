import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { FurnitureRenderer } from './FurniturePrimitives';
import { Box, Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Move, RotateCw, Scaling } from 'lucide-react';

interface ObjectData {
    id: string;
    catalogId: string;
    pos: { x: number, y: number, z: number };
    rot: number;
    scale?: { x: number, y: number, z: number };
}

const ObjectItem = React.memo(({
    obj,
    isActive,
    activeObjectId,
    editorMode,
    setActiveObjectId,
    setIsDragging,
    updateObject,
    sceneWalls
}: {
    obj: ObjectData;
    isActive: boolean;
    activeObjectId: string | null;
    editorMode: string;
    setActiveObjectId: (id: string | null) => void;
    setIsDragging: (isDragging: boolean) => void;
    updateObject: (id: string, updates: Partial<ObjectData>) => void;
    sceneWalls: any[];
}) => {
    let catalogItem = FURNITURE_CATALOG.find(c => c.id === obj.catalogId);
    if (!catalogItem && obj.catalogId === 'spawn_point') {
        catalogItem = {
            id: 'spawn_point',
            name: 'Spawn Point',
            category: 'furniture',
            dimensions: { width: 0.6, height: 1.6, depth: 0.6 },
            color: '#10b981'
        };
    }
    if (!catalogItem) return null;

    const { camera, gl } = useThree();
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const groupRef = useRef<THREE.Group>(null);
    const furnitureRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);
    const [interactionMode, setInteractionMode] = useState<'move' | 'rotate' | 'scale'>('move');

    // Dynamically traverse and enable sharp real-time shadows for all child meshes of the furniture model
    useEffect(() => {
        if (furnitureRef.current) {
            furnitureRef.current.traverse((child) => {
                if ((child as any).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        }
    });

    useEffect(() => {
        if (!isActive) setInteractionMode('move');
    }, [isActive]);

    // Drag State Refs (stable across re-renders)
    const dragOffset = useRef<{ x: number, z: number, initialRot: number } | null>(null);

    // Scale drag state - using window events for reliability
    const dragScale = useRef<{
        startDistX: number;
        startDistZ: number;
        initialObjScale: { x: number, z: number };
        mode: 'corner' | 'width' | 'depth';
        objectCenter: THREE.Vector3;
        objectRotation: number;
    } | null>(null);

    const isInteractive = (editorMode === 'furniture' || editorMode === 'view') && cameraMode !== 'walk';
    const isSelected = isActive;
    const isHovered = hovered;

    const scaleX = obj.scale?.x || 1;
    const scaleZ = obj.scale?.z || 1;
    const w = catalogItem.dimensions.width * scaleX;
    const d = catalogItem.dimensions.depth * scaleZ;
    const h = catalogItem.dimensions.height;

    // Sync Ref with Props when NOT dragging
    useEffect(() => {
        if (groupRef.current && !dragOffset.current && !dragScale.current) {
            groupRef.current.position.set(obj.pos.x, obj.pos.y, obj.pos.z);
            groupRef.current.rotation.set(0, obj.rot, 0);
            groupRef.current.scale.set(1, 1, 1);
        }
    }, [obj.pos.x, obj.pos.y, obj.pos.z, obj.rot, scaleX, scaleZ]);

    // --- Helper: Raycast mouse to XZ plane ---
    const getWorldPointFromMouse = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
        const rect = gl.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        // Intersect with XZ plane at Y = object's Y position
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -obj.pos.y);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);

        return intersection || null;
    }, [camera, gl, obj.pos.y]);

    // --- Helper: Convert world point to object local space ---
    const worldToObjectLocal = useCallback((worldPoint: THREE.Vector3): THREE.Vector2 => {
        if (!dragScale.current) return new THREE.Vector2(0, 0);

        const { objectCenter, objectRotation } = dragScale.current;
        const delta = new THREE.Vector3().subVectors(worldPoint, objectCenter);

        const rot = -objectRotation;
        const localX = delta.x * Math.cos(rot) - delta.z * Math.sin(rot);
        const localZ = delta.x * Math.sin(rot) + delta.z * Math.cos(rot);

        return new THREE.Vector2(localX, localZ);
    }, []);

    // --- Window-level Scale Move Handler ---
    const handleWindowScaleMove = useCallback((e: PointerEvent) => {
        if (!dragScale.current || !groupRef.current) return;

        const worldPoint = getWorldPointFromMouse(e.clientX, e.clientY);
        if (!worldPoint) return;

        const local = worldToObjectLocal(worldPoint);
        const currentDistX = Math.max(0.05, Math.abs(local.x));
        const currentDistZ = Math.max(0.05, Math.abs(local.y));

        const { startDistX, startDistZ, mode } = dragScale.current;

        let newGroupScaleX = 1;
        let newGroupScaleZ = 1;

        if (mode === 'corner') {
            const ratioX = currentDistX / startDistX;
            const ratioZ = currentDistZ / startDistZ;
            const ratio = (ratioX + ratioZ) / 2;
            newGroupScaleX = Math.max(0.3, Math.min(3, ratio));
            newGroupScaleZ = newGroupScaleX;
        } else if (mode === 'width') {
            newGroupScaleX = Math.max(0.3, Math.min(3, currentDistX / startDistX));
        } else if (mode === 'depth') {
            newGroupScaleZ = Math.max(0.3, Math.min(3, currentDistZ / startDistZ));
        }

        groupRef.current.scale.set(newGroupScaleX, 1, newGroupScaleZ);
    }, [getWorldPointFromMouse, worldToObjectLocal]);

    // --- Window-level Scale Up Handler ---
    const handleWindowScaleUp = useCallback((e: PointerEvent) => {
        if (dragScale.current && groupRef.current) {
            const { initialObjScale } = dragScale.current;

            const finalScaleX = initialObjScale.x * groupRef.current.scale.x;
            const finalScaleZ = initialObjScale.z * groupRef.current.scale.z;

            updateObject(obj.id, {
                scale: {
                    x: Math.round(finalScaleX * 100) / 100,
                    y: 1,
                    z: Math.round(finalScaleZ * 100) / 100
                }
            });

            groupRef.current.scale.set(1, 1, 1);
        }

        // Cleanup
        dragScale.current = null;
        setIsDragging(false);
        window.removeEventListener('pointermove', handleWindowScaleMove);
        window.removeEventListener('pointerup', handleWindowScaleUp);
    }, [obj.id, updateObject, setIsDragging, handleWindowScaleMove]);

    // --- MOVE HANDLERS ---
    const handlePointerDown = (e: any) => {
        if (!isInteractive) return;
        e.stopPropagation();

        if (activeObjectId && activeObjectId !== obj.id) {
            setActiveObjectId(null);
            return;
        }

        setActiveObjectId(obj.id);

        if (interactionMode === 'move') {
            const worldPt = getWorldPointFromMouse(e.clientX, e.clientY);
            if (!worldPt) return;

            setIsDragging(true);
            dragOffset.current = {
                x: worldPt.x - obj.pos.x,
                z: worldPt.z - obj.pos.z,
                initialRot: obj.rot
            };
            (e.target as Element).setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e: any) => {
        if (!dragOffset.current) return;
        e.stopPropagation();

        const worldPt = getWorldPointFromMouse(e.clientX, e.clientY);
        if (!worldPt) return;

        let newX = worldPt.x - dragOffset.current.x;
        let newZ = worldPt.z - dragOffset.current.z;
        let newRot = obj.rot;

        if (obj.catalogId !== 'spawn_point') {
            const snapDist = 0.3;
            for (const wall of sceneWalls) {
                const { a, b } = wall;
                const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
                if (l2 === 0) continue;
                let t = ((newX - a.x) * (b.x - a.x) + (newZ - a.y) * (b.y - a.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                const projX = a.x + t * (b.x - a.x);
                const projZ = a.y + t * (b.y - a.y);

                const dist = Math.sqrt((newX - projX) ** 2 + (newZ - projZ) ** 2);
                if (dist < snapDist) {
                    newX = projX;
                    newZ = projZ;
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    newRot = -Math.atan2(dy, dx);
                    break;
                }
            }
        }

        if (groupRef.current) {
            groupRef.current.position.set(newX, obj.pos.y, newZ);
            groupRef.current.rotation.set(0, newRot, 0);
        }
    };

    const handlePointerUp = (e: any) => {
        if (dragOffset.current) {
            if (groupRef.current) {
                updateObject(obj.id, {
                    pos: { x: groupRef.current.position.x, y: obj.pos.y, z: groupRef.current.position.z },
                    rot: groupRef.current.rotation.y
                });
            }
            setIsDragging(false);
            dragOffset.current = null;
            (e.target as Element).releasePointerCapture(e.pointerId);
        }
    };

    // --- SCALE HANDLERS (Window-level for Reliability) ---
    const handleScaleDown = (e: any, mode: 'corner' | 'width' | 'depth') => {
        e.stopPropagation();

        if (!groupRef.current) return;

        // Capture stable reference data
        const objectCenter = groupRef.current.position.clone();
        const objectRotation = groupRef.current.rotation.y;

        // Calculate initial distance in local space
        const worldPoint = e.point as THREE.Vector3;
        const delta = new THREE.Vector3().subVectors(worldPoint, objectCenter);
        const rot = -objectRotation;
        const localX = delta.x * Math.cos(rot) - delta.z * Math.sin(rot);
        const localZ = delta.x * Math.sin(rot) + delta.z * Math.cos(rot);

        dragScale.current = {
            startDistX: Math.max(0.1, Math.abs(localX)),
            startDistZ: Math.max(0.1, Math.abs(localZ)),
            initialObjScale: { x: scaleX, z: scaleZ },
            mode,
            objectCenter,
            objectRotation
        };

        setIsDragging(true);

        // Attach window-level listeners for reliability
        window.addEventListener('pointermove', handleWindowScaleMove);
        window.addEventListener('pointerup', handleWindowScaleUp);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('pointermove', handleWindowScaleMove);
            window.removeEventListener('pointerup', handleWindowScaleUp);
        };
    }, [handleWindowScaleMove, handleWindowScaleUp]);

    return (
        <group
            ref={groupRef}
            onClick={(e) => {
                if (!isInteractive) return;
                e.stopPropagation();
                setActiveObjectId(obj.id);
            }}
        >
            {/* Object Body */}
            <group
                ref={furnitureRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerOver={(e) => {
                    e.stopPropagation();
                    if (isInteractive) {
                        setHovered(true);
                        if (interactionMode === 'move') document.body.style.cursor = 'move';
                    }
                }}
                onPointerOut={(e) => {
                    e.stopPropagation();
                    setHovered(false);
                    document.body.style.cursor = 'auto';
                }}
            >
                <FurnitureRenderer
                    id={obj.catalogId}
                    width={w}
                    height={h}
                    depth={d}
                    color={isSelected ? '#3b82f6' : (isHovered && isInteractive ? '#60a5fa' : catalogItem.color)}
                />

                {/* Glowing Bounding Box & Floor Halo for Selected State */}
                {isSelected && isInteractive && (
                    <>
                        {/* Floor Bounding Halo (Flat Plane) */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                            <planeGeometry args={[w + 0.16, d + 0.16]} />
                            <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} depthWrite={false} />
                        </mesh>
                        {/* Floor Bounding Outline (Thicker effect via offset plane wireframe) */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                            <planeGeometry args={[w + 0.16, d + 0.16]} />
                            <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                        </mesh>
                        {/* 3D Semi-transparent Volume Bounding Bage */}
                        <Box args={[w + 0.08, h + 0.08, d + 0.08]} position={[0, h / 2, 0]}>
                            <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
                        </Box>
                        {/* 3D Bounding Outline Cage */}
                        <Box args={[w + 0.08, h + 0.08, d + 0.08]} position={[0, h / 2, 0]}>
                            <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                        </Box>
                    </>
                )}

                {/* Soft Bounding Box & Floor Halo for Hovered State */}
                {isHovered && !isSelected && isInteractive && (
                    <>
                        {/* Floor Bounding Halo (Flat Plane) */}
                        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
                            <planeGeometry args={[w + 0.1, d + 0.1]} />
                            <meshBasicMaterial color="#60a5fa" transparent opacity={0.15} depthWrite={false} />
                        </mesh>
                        {/* 3D Bounding Outline Cage */}
                        <Box args={[w + 0.04, h + 0.04, d + 0.04]} position={[0, h / 2, 0]}>
                            <meshBasicMaterial color="#93c5fd" wireframe depthWrite={false} />
                        </Box>
                    </>
                )}

                <mesh visible={false}>
                    <boxGeometry args={[w + 0.3, h + 0.1, d + 0.3]} />
                    <meshBasicMaterial />
                </mesh>
            </group>

            {/* Contextual Toolbar */}
            {isSelected && isInteractive && (
                <Html position={[0, h + 0.5, 0]} center style={{ pointerEvents: 'none' }}>
                    <div
                        className="flex gap-1 bg-white p-1 rounded-lg shadow-xl border border-gray-200 pointer-events-auto transform -translate-y-full"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className={`p-1.5 rounded hover:bg-gray-100 ${interactionMode === 'move' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                            onClick={() => setInteractionMode('move')}
                            title="Move"
                        >
                            <Move size={16} />
                        </button>
                        <button
                            className={`p-1.5 rounded hover:bg-gray-100 ${interactionMode === 'rotate' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                            onClick={() => setInteractionMode('rotate')}
                            title="Rotate"
                        >
                            <RotateCw size={16} />
                        </button>
                        <button
                            className={`p-1.5 rounded hover:bg-gray-100 ${interactionMode === 'scale' ? 'bg-blue-100 text-blue-600' : 'text-gray-600'}`}
                            onClick={() => setInteractionMode('scale')}
                            title="Resize"
                        >
                            <Scaling size={16} />
                        </button>
                    </div>
                </Html>
            )}

            {isSelected && isInteractive && (
                <>
                    {interactionMode === 'scale' && (
                        <>
                            {/* Corner handles */}
                            {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([xDir, zDir], i) => (
                                <mesh
                                    key={`corner-${i}`}
                                    position={[xDir * w / 2, h + 0.1, zDir * d / 2]}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => handleScaleDown(e, 'corner')}
                                    onPointerOver={() => document.body.style.cursor = 'nwse-resize'}
                                    onPointerOut={() => document.body.style.cursor = 'auto'}
                                >
                                    <sphereGeometry args={[0.12]} />
                                    <meshBasicMaterial color="#f97316" depthTest={false} />
                                </mesh>
                            ))}

                            {/* Width handles */}
                            {[[-1, 0], [1, 0]].map(([xDir], i) => (
                                <mesh
                                    key={`width-${i}`}
                                    position={[xDir * w / 2, h / 2, 0]}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => handleScaleDown(e, 'width')}
                                    onPointerOver={() => document.body.style.cursor = 'ew-resize'}
                                    onPointerOut={() => document.body.style.cursor = 'auto'}
                                >
                                    <boxGeometry args={[0.1, 0.2, 0.1]} />
                                    <meshBasicMaterial color="#3b82f6" depthTest={false} />
                                </mesh>
                            ))}

                            {/* Depth handles */}
                            {[[0, -1], [0, 1]].map(([_, zDir], i) => (
                                <mesh
                                    key={`depth-${i}`}
                                    position={[0, h / 2, zDir * d / 2]}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => handleScaleDown(e, 'depth')}
                                    onPointerOver={() => document.body.style.cursor = 'ns-resize'}
                                    onPointerOut={() => document.body.style.cursor = 'auto'}
                                >
                                    <boxGeometry args={[0.1, 0.2, 0.1]} />
                                    <meshBasicMaterial color="#3b82f6" depthTest={false} />
                                </mesh>
                            ))}
                        </>
                    )}

                    {interactionMode === 'rotate' && (
                        <group position={[0, 0.05, 0]}>
                            <mesh
                                rotation={[-Math.PI / 2, 0, 0]}
                                renderOrder={2}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => {
                                    e.stopPropagation();
                                    setIsDragging(true);
                                    (e.target as Element).setPointerCapture(e.pointerId);
                                }}
                                onPointerUp={(e) => {
                                    e.stopPropagation();
                                    setIsDragging(false);
                                    (e.target as Element).releasePointerCapture(e.pointerId);
                                    if (groupRef.current) {
                                        updateObject(obj.id, { rot: groupRef.current.rotation.y });
                                    }
                                }}
                                onPointerMove={(e) => {
                                    e.stopPropagation();
                                    if (e.buttons !== 1) return;

                                    const dx = e.point.x - groupRef.current!.position.x;
                                    const dz = e.point.z - groupRef.current!.position.z;
                                    let angle = -Math.atan2(dz, dx);

                                    const snapRad = (10 * Math.PI) / 180;
                                    angle = Math.round(angle / snapRad) * snapRad;

                                    if (groupRef.current) {
                                        groupRef.current.rotation.y = angle;
                                    }
                                }}
                                onPointerOver={() => document.body.style.cursor = 'grab'}
                                onPointerOut={() => document.body.style.cursor = 'auto'}
                            >
                                <ringGeometry args={[Math.max(w, d) / 2 + 0.1, Math.max(w, d) / 2 + 0.7, 32]} />
                                <meshBasicMaterial color="red" visible={false} side={THREE.DoubleSide} />
                            </mesh>

                            <group rotation={[-Math.PI / 2, 0, 0]}>
                                <mesh>
                                    <extrudeGeometry
                                        args={[
                                            (() => {
                                                const r = Math.max(w, d) / 2 + 0.4;
                                                const shape = new THREE.Shape();
                                                shape.absarc(0, 0, r + 0.04, 0, Math.PI * 1.5, false);
                                                shape.absarc(0, 0, r - 0.04, Math.PI * 1.5, 0, true);
                                                return shape;
                                            })(),
                                            { depth: 0.02, bevelEnabled: false, curveSegments: 64 }
                                        ]}
                                    />
                                    <meshBasicMaterial color="#22c55e" />
                                </mesh>
                                <mesh position={[Math.max(w, d) / 2 + 0.4, 0, 0]} scale={[1, 1, 0.1]}>
                                    <coneGeometry args={[0.15, 0.3, 3]} />
                                    <meshBasicMaterial color="#22c55e" />
                                </mesh>
                                <mesh position={[0, -(Math.max(w, d) / 2 + 0.4), 0]} rotation={[0, 0, -Math.PI / 2]} scale={[1, 1, 0.1]}>
                                    <coneGeometry args={[0.15, 0.3, 3]} />
                                    <meshBasicMaterial color="#22c55e" />
                                </mesh>
                            </group>
                        </group>
                    )}
                </>
            )}
        </group>
    );
});

export const ObjectLayer: React.FC = () => {
    const objects = useStore((state) => state.scene.objects);
    const editorMode = useStore((state) => state.editorMode);
    const updateObject = useStore((state) => state.updateObject);
    const setIsDragging = useStore((state) => state.setIsDragging);
    const activeObjectId = useStore((state) => state.activeObjectId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const sceneWalls = useStore((state) => state.scene.walls);
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges);
    const allWalls = React.useMemo(() => {
        const wallSnapList = edges.map(edge => {
            const startNode = nodes.find(n => n.id === edge.startNodeId);
            const endNode = nodes.find(n => n.id === edge.endNodeId);
            if (startNode && endNode) {
                return {
                    id: edge.id,
                    a: { x: startNode.x, y: startNode.y },
                    b: { x: endNode.x, y: endNode.y },
                    thickness: edge.thickness,
                    height: edge.height,
                    kind: edge.kind
                };
            }
            return null;
        }).filter((w): w is NonNullable<typeof w> => w !== null);
        return [...wallSnapList, ...sceneWalls];
    }, [edges, nodes, sceneWalls]);

    useEffect(() => {
        const handleDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeObjectId) {
                    setActiveObjectId(null);
                } else if (editorMode === 'furniture') {
                    useStore.getState().setEditorMode('view');
                }
            }
        };
        window.addEventListener('keydown', handleDown);
        return () => window.removeEventListener('keydown', handleDown);
    }, [activeObjectId, editorMode, setActiveObjectId]);

    return (
        <group>
            {objects.map(obj => (
                <ObjectItem
                    key={obj.id}
                    obj={obj}
                    isActive={activeObjectId === obj.id}
                    activeObjectId={activeObjectId}
                    editorMode={editorMode}
                    setActiveObjectId={setActiveObjectId}
                    setIsDragging={setIsDragging}
                    updateObject={updateObject}
                    sceneWalls={allWalls}
                />
            ))}
        </group>
    );
};
