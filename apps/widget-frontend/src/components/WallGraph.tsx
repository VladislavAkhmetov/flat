import React, { useMemo, useRef } from 'react';
import { useStore } from '../store';
import { useThree, extend } from '@react-three/fiber';
import { useDrag } from '@use-gesture/react';
import { Line2, LineMaterial, LineGeometry } from 'three-stdlib';
import { WallNode, WallEdge, Opening } from '@flat/shared';
import * as THREE from 'three';
import { Box } from '@react-three/drei';

// Extend Three.js with Line2 components
extend({ Line2, LineMaterial, LineGeometry });

/**
 * WallGraph - Renders the Node-Edge graph structure
 * 
 * 2D Mode: Fat Lines (Line2) + draggable node handles
 * 3D Mode: Extruded wall meshes (Geometry Composition for holes)
 */
export const WallGraph: React.FC = () => {
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges);
    const openings = useStore((state) => state.scene.openings);
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const editorMode = useStore((state) => state.editorMode);

    const is2D = cameraMode === '2d';

    return (
        <group name="WallGraph">
            {/* Render Edges */}
            {edges.map((edge) => (
                is2D ? (
                    <EdgeLine key={edge.id} edge={edge} nodes={nodes} />
                ) : (
                    <EdgeMesh key={edge.id} edge={edge} nodes={nodes} openings={openings} />
                )
            ))}

            {/* Render Openings in 2D */}
            {is2D && openings.map((opening) => (
                <OpeningSymbol key={opening.id} opening={opening} edges={edges} nodes={nodes} />
            ))}

            {/* Render Nodes (Joints) in 3D to close gaps */}
            {!is2D && nodes.map((node) => (
                <JointColumn key={node.id} node={node} edges={edges} />
            ))}

            {/* Render Nodes Handles (only in 2D and when in walls mode) */}
            {is2D && editorMode === 'walls' && nodes.map((node) => (
                <NodeHandle key={node.id} node={node} />
            ))}
        </group>
    );
};

/**
 * JointColumn - Fills the gap between walls in 3D
 */
const JointColumn: React.FC<{ node: WallNode, edges: WallEdge[] }> = React.memo(({ node, edges }) => {
    // Find connected edges to determine height/thickness
    const connectedEdges = edges.filter(e => e.startNodeId === node.id || e.endNodeId === node.id);

    // Leaf nodes (wall ends, door frames) should terminate in a clean, sharp box end
    // instead of being rounded by rendering a cylinder joint column
    if (connectedEdges.length <= 1) return null;

    // Use max thickness/height of connected walls
    const thickness = Math.max(...connectedEdges.map(e => e.thickness));
    const height = Math.max(...connectedEdges.map(e => e.height));

    return (
        <mesh position={[node.x, height / 2, node.y]} castShadow receiveShadow>
            {/* Box geometry makes for perfectly sharp rectangular corners */}
            <boxGeometry args={[thickness, height, thickness]} />
            <meshStandardMaterial color="#faf9f6" roughness={0.8} />
        </mesh>
    );
});

const OpeningSymbol: React.FC<{ opening: Opening; edges: WallEdge[]; nodes: WallNode[] }> = React.memo(({ opening, edges, nodes }) => {
    const edge = edges.find(e => e.id === opening.wallId);
    if (!edge) return null;

    const n1 = nodes.find(n => n.id === edge.startNodeId);
    const n2 = nodes.find(n => n.id === edge.endNodeId);
    if (!n1 || !n2) return null;

    const activeOpeningId = useStore((state) => state.activeOpeningId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const editorMode = useStore((state) => state.editorMode);

    const isSelected = activeOpeningId === opening.id;

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len = Math.hypot(dx, dy);

    // Position
    const px = n1.x + dx * opening.t;
    const py = n1.y + dy * opening.t;
    const angle = Math.atan2(dy, dx);

    const isDoor = opening.kind === 'door';
    const width = opening.width;
    const thickness = edge.thickness;

    // Calculate door swing arc points using THREE.EllipseCurve
    const arcPoints = useMemo(() => {
        if (!isDoor) return [];
        const curve = new THREE.EllipseCurve(
            -width / 2, 0,             // ax, ay (center at door hinge!)
            width, width,              // xRadius, yRadius
            0, Math.PI / 2,            // startAngle, endAngle
            false,                     // clockwise
            0                          // aRotation
        );
        return curve.getPoints(32).map(p => new THREE.Vector3(p.x, 0.01, p.y));
    }, [isDoor, width]);

    const handleClick = (e: any) => {
        if (editorMode !== 'view') return;
        e.stopPropagation();
        setActiveOpeningId(opening.id);
        setActiveWallId(null);
        setActiveObjectId(null);
    };

    return (
        <group 
            position={[px, 0.2, py]} 
            rotation={[0, -angle, 0]}
            onClick={handleClick}
            onPointerOver={(e) => {
                if (editorMode === 'view') {
                    e.stopPropagation();
                    document.body.style.cursor = 'pointer';
                }
            }}
            onPointerOut={(e) => {
                if (editorMode === 'view') {
                    document.body.style.cursor = 'default';
                }
            }}
        >
            {/* Selection highlight glow */}
            {isSelected && (
                <>
                    <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width + 0.16, thickness + 0.16]} />
                        <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} />
                    </mesh>
                    <mesh position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width + 0.16, thickness + 0.16]} />
                        <meshBasicMaterial color="#2563eb" wireframe />
                    </mesh>
                </>
            )}

            {/* 1. "Eraser" background plane - rotated flat! */}
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[width, thickness * 1.1]} />
                <meshBasicMaterial color={isSelected ? "#e0f2fe" : "#ffffff"} />
            </mesh>

            {/* 2. Symbol Graphic */}
            {isDoor ? (
                <group>
                    {/* Hinge/Frame Box - Left */}
                    <mesh position={[-width / 2, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#000000" />
                    </mesh>
                    {/* Hinge/Frame Box - Right */}
                    <mesh position={[width / 2, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#000000" />
                    </mesh>
                    {/* Door Leaf (Open 90 degrees) - beautiful box pointing forward */}
                    <mesh position={[-width / 2 + 0.015, 0.01, width / 2]}>
                        <boxGeometry args={[0.03, 0.01, width]} />
                        <meshBasicMaterial color="#334155" />
                    </mesh>
                    {/* Door Swing Arc Segment */}
                    {arcPoints.length > 0 && (
                        <line>
                            <bufferGeometry attach="geometry" onUpdate={(self) => self.setFromPoints(arcPoints)} />
                            <lineBasicMaterial color="#64748b" />
                        </line>
                    )}
                </group>
            ) : (
                <group>
                    {/* Window Frame Sides */}
                    <mesh position={[-width / 2 + 0.02, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#1f2937" />
                    </mesh>
                    <mesh position={[width / 2 - 0.02, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#1f2937" />
                    </mesh>
                    {/* Glass/Sill lines - rotated flat! */}
                    <mesh position={[0, 0.01, -thickness / 4]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width, 0.02]} />
                        <meshBasicMaterial color="#64748b" />
                    </mesh>
                    <mesh position={[0, 0.01, thickness / 4]} rotation={[-Math.PI / 2, 0, 0]}>
                        <planeGeometry args={[width, 0.02]} />
                        <meshBasicMaterial color="#64748b" />
                    </mesh>
                </group>
            )}
        </group>
    );
});

/**
 * NodeHandle - Draggable corner handle
 */
const NodeHandle: React.FC<{ node: WallNode }> = React.memo(({ node }) => {
    const updateNode = useStore((state) => state.updateNode);
    const activeNodeId = useStore((state) => state.activeNodeId);
    const setActiveNodeId = useStore((state) => state.setActiveNodeId);
    const setIsDragging = useStore((state) => state.setIsDragging);
    const { camera, size } = useThree();

    const [isHovered, setHovered] = React.useState(false);
    const meshRef = useRef<THREE.Mesh>(null);
    const isActive = activeNodeId === node.id;
    const visible = isHovered || isActive;

    const bind = useDrag(
        ({ down, xy: [clientX, clientY], first, last }) => {
            if (first) {
                // Save state before dragging starts!
                useStore.getState().pushHistory();
                setActiveNodeId(node.id);
                setIsDragging(true);
            }

            if (down) {
                const x = ((clientX / size.width) * 2 - 1);
                const y = -((clientY / size.height) * 2 - 1);
                const vector = new THREE.Vector3(x, y, 0);
                vector.unproject(camera);

                if (camera instanceof THREE.OrthographicCamera) {
                    const dir = new THREE.Vector3(0, -1, 0);
                    const distance = -vector.y / dir.y;
                    vector.add(dir.multiplyScalar(distance));
                }

                const snappedX = Math.round(vector.x * 10) / 10;
                const snappedZ = Math.round(vector.z * 10) / 10;
                updateNode(node.id, snappedX, snappedZ);
            }

            if (last) {
                setIsDragging(false);
            }
        },
        { pointer: { touch: true } }
    );

    return (
        <mesh
            ref={meshRef}
            position={[node.x, 0.15, node.y]}
            rotation={[-Math.PI / 2, 0, 0]}
            {...(bind() as any)}
            onPointerOver={() => {
                document.body.style.cursor = 'grab';
                setHovered(true);
            }}
            onPointerOut={() => {
                document.body.style.cursor = 'default';
                setHovered(false);
            }}
        >
            <circleGeometry args={[isActive || isHovered ? 0.2 : 0.15, 16]} />
            <meshBasicMaterial
                color={isActive ? '#22c55e' : '#3b82f6'}
                transparent
                opacity={visible ? 0.8 : 0}
            />
        </mesh>
    );
});

/**
 * EdgeLine - Fat line for 2D view
 */
const EdgeLine: React.FC<{ edge: WallEdge; nodes: WallNode[] }> = React.memo(({ edge, nodes }) => {
    const startNode = nodes.find((n) => n.id === edge.startNodeId);
    const endNode = nodes.find((n) => n.id === edge.endNodeId);
    
    const activeWallId = useStore((state) => state.activeWallId);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const editorMode = useStore((state) => state.editorMode);

    const isSelected = activeWallId === edge.id;

    const { geometry, material, len, angle, mx, my } = useMemo(() => {
        if (!startNode || !endNode) return { geometry: null, material: null, len: 0, angle: 0, mx: 0, my: 0 };
        
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const mx = (startNode.x + endNode.x) / 2;
        const my = (startNode.y + endNode.y) / 2;

        const geo = new LineGeometry();
        geo.setPositions([startNode.x, 0.1, startNode.y, endNode.x, 0.1, endNode.y]);

        // Color coding:
        // Selected -> Bright Blue (0x3b82f6)
        // Bearing -> Dark Slate Charcoal (0x1e293b)
        // Partition -> Medium Blue Slate (0x64748b)
        const wallColor = isSelected 
            ? 0x3b82f6 
            : (edge.kind === 'bearing' ? 0x1e293b : 0x64748b);

        // Selected walls are slightly thicker
        const lineWidth = isSelected ? 8 : 4;

        const mat = new LineMaterial({ 
            color: wallColor, 
            linewidth: lineWidth, 
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight) 
        });

        return { geometry: geo, material: mat, len, angle, mx, my };
    }, [startNode?.x, startNode?.y, endNode?.x, endNode?.y, isSelected, edge.kind]);

    if (!geometry || !material) return null;

    const handleClick = (e: any) => {
        if (editorMode !== 'view') return;
        e.stopPropagation();
        setActiveWallId(edge.id);
        setActiveObjectId(null);
        setActiveOpeningId(null);
    };

    return (
        <group>
            {/* The visible line */}
            <primitive object={new Line2(geometry, material)} />

            {/* Selected glow indicator in 2D */}
            {isSelected && (
                <mesh position={[mx, 0.08, my]} rotation={[-Math.PI / 2, 0, -angle]}>
                    <planeGeometry args={[len, edge.thickness + 0.1]} />
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} />
                </mesh>
            )}

            {/* Wide transparent interaction box */}
            <mesh 
                position={[mx, 0.12, my]} 
                rotation={[-Math.PI / 2, 0, -angle]}
                onClick={handleClick}
                onPointerOver={() => {
                    if (editorMode === 'view') document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                    if (editorMode === 'view') document.body.style.cursor = 'default';
                }}
            >
                <planeGeometry args={[len, 0.4]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
        </group>
    );
});

/**
 * EdgeMesh - 3D wall with holes for openings
 */
const EdgeMesh: React.FC<{ edge: WallEdge; nodes: WallNode[]; openings: Opening[] }> = React.memo(({ edge, nodes, openings }) => {
    const startNode = nodes.find((n) => n.id === edge.startNodeId);
    const endNode = nodes.find((n) => n.id === edge.endNodeId);
    const activeWallId = useStore((state) => state.activeWallId);
    const activeOpeningId = useStore((state) => state.activeOpeningId);
    
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const editorMode = useStore((state) => state.editorMode);
    const cameraMode = useStore((state) => state.scene.camera.mode);

    const isWallSelected = activeWallId === edge.id;

    const { parts, totalLength, angle, midX, midZ, wallOpenings } = useMemo(() => {
        if (!startNode || !endNode) return { parts: [], totalLength: 0, angle: 0, midX: 0, midZ: 0, wallOpenings: [] };

        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const midX = (startNode.x + endNode.x) / 2;
        const midZ = (startNode.y + endNode.y) / 2;

        const wallOpenings = openings
            .filter(o => o.wallId === edge.id)
            .sort((a, b) => a.t - b.t);

        interface Segment {
            position: [number, number, number];
            args: [number, number, number];
            type: string;
        }
        const segments: Segment[] = [];
        let currentT = 0;

        // Correct Y positioning: CenterY = (hStart + hEnd) / 2
        const createSegment = (tStart: number, tEnd: number, hStart: number, hEnd: number, type: 'wall' | 'lintel' | 'sill') => {
            if (tEnd <= tStart) return null;
            const segLen = (tEnd - tStart) * len;
            const segCenterT = (tStart + tEnd) / 2;
            const segLocalX = (segCenterT - 0.5) * len;
            const height = hEnd - hStart;
            const centerY = (hStart + hEnd) / 2;

            return {
                position: [segLocalX, centerY, 0] as [number, number, number],
                args: [segLen, height, edge.thickness] as [number, number, number],
                type
            };
        };

        wallOpenings.forEach(op => {
            const opWidthT = op.width / len;
            const opStartT = Math.max(0, op.t - opWidthT / 2);
            const opEndT = Math.min(1, op.t + opWidthT / 2);

            // Fix 3D artifacts: if very close to ends, snap to ends
            const effectiveStartT = opStartT < 0.05 ? 0 : opStartT;
            const effectiveEndT = opEndT > 0.95 ? 1 : opEndT;

            // Wall before opening
            if (effectiveStartT > currentT) {
                const seg = createSegment(currentT, effectiveStartT, 0, edge.height, 'wall');
                if (seg) segments.push(seg);
            }

            // Sill (below window)
            if (op.sillHeight > 0) {
                const seg = createSegment(effectiveStartT, effectiveEndT, 0, op.sillHeight, 'sill');
                if (seg) segments.push(seg);
            }

            // Lintel (above window)
            const topHeight = op.sillHeight + op.height;
            if (topHeight < edge.height) {
                const seg = createSegment(effectiveStartT, effectiveEndT, topHeight, edge.height, 'lintel');
                if (seg) segments.push(seg);
            }

            currentT = effectiveEndT;
        });

        // Remaining wall
        if (currentT < 1) {
            const seg = createSegment(currentT, 1, 0, edge.height, 'wall');
            if (seg) segments.push(seg);
        }

        return { parts: segments, totalLength: len, angle: ang, midX, midZ, wallOpenings };
    }, [startNode, endNode, edge.thickness, edge.height, openings]);

    return (
        <group 
            position={[midX, 0, midZ]} 
            rotation={[0, -angle, 0]}
            onClick={(e) => {
                if (editorMode !== 'view' || cameraMode === 'walk') return;
                e.stopPropagation();
                setActiveWallId(edge.id);
                setActiveObjectId(null);
                setActiveOpeningId(null);
            }}
            onPointerOver={(e) => {
                if (editorMode === 'view' && cameraMode !== 'walk') {
                    e.stopPropagation();
                    document.body.style.cursor = 'pointer';
                }
            }}
            onPointerOut={(e) => {
                if (editorMode === 'view' && cameraMode !== 'walk') {
                    document.body.style.cursor = 'default';
                }
            }}
        >
            {/* Wall Segments */}
            {parts.map((part, i) => (
                <mesh key={i} position={part.position} castShadow receiveShadow>
                    <boxGeometry args={part.args} />
                    {/* Warm Off-White (Alabaster/Plaster) look instead of cold gray */}
                    <meshStandardMaterial color="#faf9f6" roughness={0.8} />
                    {isWallSelected && (
                        <Box args={[part.args[0] + 0.03, part.args[1] + 0.03, part.args[2] + 0.03]} position={[0, 0, 0]}>
                            <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                        </Box>
                    )}
                </mesh>
            ))}

            {/* Portal Objects (Doors and Windows) */}
            {wallOpenings.map(op => {
                const x = (op.t - 0.5) * totalLength;
                const y = op.sillHeight + op.height / 2;
                const isSelected = activeOpeningId === op.id;
                return (
                    <group 
                        key={op.id} 
                        position={[x, 0, 0]}
                        onClick={(e) => {
                            if (editorMode !== 'view' || cameraMode === 'walk') return;
                            e.stopPropagation();
                            setActiveOpeningId(op.id);
                            setActiveWallId(null);
                            setActiveObjectId(null);
                        }}
                        onPointerOver={(e) => {
                            if (editorMode === 'view' && cameraMode !== 'walk') {
                                e.stopPropagation();
                                document.body.style.cursor = 'pointer';
                            }
                        }}
                        onPointerOut={(e) => {
                            if (editorMode === 'view' && cameraMode !== 'walk') {
                                document.body.style.cursor = 'default';
                            }
                        }}
                    >
                        {isSelected && (
                            <>
                                {/* Floor Bounding Halo (Flat Plane) */}
                                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                                    <planeGeometry args={[op.width + 0.16, edge.thickness + 0.16]} />
                                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} depthWrite={false} />
                                </mesh>
                                {/* 3D Bounding Outline Cage */}
                                <Box args={[op.width + 0.08, op.height + 0.08, edge.thickness + 0.08]} position={[0, y, 0]}>
                                    <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                                </Box>
                                <Box args={[op.width + 0.08, op.height + 0.08, edge.thickness + 0.08]} position={[0, y, 0]}>
                                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
                                </Box>
                            </>
                        )}
                        {op.kind === 'door' ? (
                            <Door3D
                                position={[0, op.height / 2, 0]}
                                width={op.width}
                                height={op.height}
                                thickness={edge.thickness}
                            />
                        ) : (
                            <Window3D
                                position={[0, y, 0]}
                                width={op.width}
                                height={op.height}
                                thickness={edge.thickness}
                            />
                        )}
                    </group>
                );
            })}
        </group>
    );
});

/**
 * Window3D - Renders Frame and Glass
 */
const Window3D: React.FC<{
    position: [number, number, number],
    width: number,
    height: number,
    thickness: number
}> = React.memo(({ position, width, height, thickness }) => {
    const frameSize = 0.05;

    return (
        <group position={position}>
            {/* Frame - Top */}
            <mesh position={[0, height / 2 - frameSize / 2, 0]} castShadow>
                <boxGeometry args={[width, frameSize, thickness]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
            {/* Frame - Bottom */}
            <mesh position={[0, -height / 2 + frameSize / 2, 0]} castShadow>
                <boxGeometry args={[width, frameSize, thickness]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
            {/* Frame - Left */}
            <mesh position={[-width / 2 + frameSize / 2, 0, 0]} castShadow>
                <boxGeometry args={[frameSize, height - frameSize * 2, thickness]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>
            {/* Frame - Right */}
            <mesh position={[width / 2 - frameSize / 2, 0, 0]} castShadow>
                <boxGeometry args={[frameSize, height - frameSize * 2, thickness]} />
                <meshStandardMaterial color="#334155" roughness={0.5} />
            </mesh>

            {/* Glass */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width - frameSize * 2, height - frameSize * 2, 0.02]} />
                <meshPhysicalMaterial
                    color="#93c5fd"
                    metalness={0.1}
                    roughness={0}
                    transmission={0.9} // Glass-like
                    transparent
                    opacity={0.4}
                    thickness={0.02}
                />
            </mesh>
        </group>
    );
});

/**
 * Door3D - Renders Frame and Door Leaf
 */
const Door3D: React.FC<{
    position: [number, number, number],
    width: number,
    height: number,
    thickness: number
}> = React.memo(({ position, width, height, thickness }) => {
    const frameSize = 0.05;

    return (
        <group position={position}>
            {/* Frame - Top */}
            <mesh position={[0, height - frameSize / 2, 0]} castShadow>
                <boxGeometry args={[width, frameSize, thickness * 1.05]} />
                <meshStandardMaterial color="#78716c" roughness={0.7} />
            </mesh>
            {/* Frame - Left */}
            <mesh position={[-width / 2 + frameSize / 2, height / 2, 0]} castShadow>
                <boxGeometry args={[frameSize, height, thickness * 1.05]} />
                <meshStandardMaterial color="#78716c" roughness={0.7} />
            </mesh>
            {/* Frame - Right */}
            <mesh position={[width / 2 - frameSize / 2, height / 2, 0]} castShadow>
                <boxGeometry args={[frameSize, height, thickness * 1.05]} />
                <meshStandardMaterial color="#78716c" roughness={0.7} />
            </mesh>

            {/* Door Leaf (slightly open, e.g. rotated by 30 degrees) */}
            <group position={[-width / 2 + frameSize, height / 2, 0]} rotation={[0, 0.6, 0]}>
                <mesh position={[width / 2 - frameSize, 0, 0]} castShadow>
                    <boxGeometry args={[width - frameSize * 2, height - frameSize, 0.04]} />
                    <meshStandardMaterial color="#a8a29e" roughness={0.8} />
                </mesh>
                {/* Handle */}
                <mesh position={[width - frameSize * 2 - 0.1, 0, 0.03]} castShadow>
                    <boxGeometry args={[0.03, 0.1, 0.02]} />
                    <meshStandardMaterial color="silver" metalness={0.9} roughness={0.1} />
                </mesh>
            </group>
        </group>
    );
});

export default WallGraph;
