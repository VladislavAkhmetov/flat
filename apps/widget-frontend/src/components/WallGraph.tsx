import React, { useMemo, useRef } from 'react';
import { useStore } from '../store';
import { useThree, extend } from '@react-three/fiber';
import { useDrag } from '@use-gesture/react';
import { Line2, LineMaterial, LineGeometry } from 'three-stdlib';
import { WallNode, WallEdge, Opening } from '@flat/shared';
import * as THREE from 'three';
import { Box, Line } from '@react-three/drei';

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
    const wallCutaway3D = useStore((state) => state.wallCutaway3D ?? true);
    const isCutaway = cameraMode === '3d' && wallCutaway3D;
    const editorMode = useStore((state) => state.editorMode);

    const is2D = cameraMode === '2d';

    // Resolve nodes here and pass them as props: node objects keep referential
    // identity unless moved, so React.memo skips re-rendering (and geometry rebuild)
    // for every edge NOT connected to a dragged node.
    const nodeMap = useMemo(() => {
        const map = new Map<string, WallNode>();
        nodes.forEach(n => map.set(n.id, n));
        return map;
    }, [nodes]);

    return (
        <group name="WallGraph">
            {/* Render Edges */}
            {edges.map((edge) => {
                const startNode = nodeMap.get(edge.startNodeId);
                const endNode = nodeMap.get(edge.endNodeId);
                if (!startNode || !endNode) return null;
                return is2D ? (
                    <EdgeLine key={edge.id} edge={edge} startNode={startNode} endNode={endNode} />
                ) : (
                    <EdgeMesh key={edge.id} edge={edge} startNode={startNode} endNode={endNode} openings={openings} />
                );
            })}

            {/* Render Openings in 2D */}
            {is2D && openings.map((opening) => (
                <OpeningSymbol key={opening.id} opening={opening} edges={edges} nodes={nodes} />
            ))}

            {/* Render Nodes (Joints) in 3D to close gaps */}
            {!is2D && nodes.map((node) => (
                <JointColumn key={node.id} node={node} edges={edges} />
            ))}

            {/* Corner handles: walls tool, or select/view during structure review */}
            {is2D && (editorMode === 'walls' || editorMode === 'view') && nodes.map((node) => (
                <NodeHandle key={node.id} node={node} />
            ))}
        </group>
    );
};

/**
 * JointColumn - Fills the gap between walls in 3D
 */
const JointColumn: React.FC<{ node: WallNode, edges: WallEdge[] }> = React.memo(({ node, edges }) => {
    const wallColor = useStore((state) => state.scene.materials?.wallColor || '#faf9f6');
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const wallCutaway3D = useStore((state) => state.wallCutaway3D ?? true);
    const isCutaway = cameraMode === '3d' && wallCutaway3D;

    // Find connected edges to determine height/thickness
    const connectedEdges = edges.filter(e => e.startNodeId === node.id || e.endNodeId === node.id);

    // Leaf nodes (wall ends, door frames) should terminate in a clean, sharp box end
    // instead of being rounded by rendering a cylinder joint column
    if (connectedEdges.length <= 1) return null;

    // Use max thickness/height of connected walls
    const thickness = Math.max(...connectedEdges.map(e => e.thickness));
    const maxHeight = Math.max(...connectedEdges.map(e => e.height));
    const height = isCutaway ? 0.72 : maxHeight;

    return (
        <mesh position={[node.x, height / 2, node.y]} castShadow receiveShadow>
            {/* Box geometry makes for perfectly sharp rectangular corners */}
            <boxGeometry args={[thickness, height, thickness]} />
            <meshStandardMaterial color={wallColor} roughness={0.8} />
        </mesh>
    );
});

const OpeningSymbol: React.FC<{ opening: Opening; edges: WallEdge[]; nodes: WallNode[] }> = React.memo(({ opening, edges, nodes }) => {
    // Hooks first — never after early returns (white-screen crash)
    const activeOpeningId = useStore((state) => state.activeOpeningId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const updateOpening = useStore((state) => state.updateOpening);
    const setIsDragging = useStore((state) => state.setIsDragging);
    const editorMode = useStore((state) => state.editorMode);
    const planReviewActive = useStore((state) => state.planReviewActive);
    const { camera, gl } = useThree();

    const dragRef = useRef<{ pointerId: number } | null>(null);
    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
    const hit = useMemo(() => new THREE.Vector3(), []);

    const edge = edges.find(e => e.id === opening.wallId);
    const n1 = edge ? nodes.find(n => n.id === edge.startNodeId) : undefined;
    const n2 = edge ? nodes.find(n => n.id === edge.endNodeId) : undefined;

    const isSelected = activeOpeningId === opening.id;
    const isSwingDoor = opening.kind === 'door' || opening.kind === 'balcony_door';
    const isBalcony = opening.kind === 'balcony_door';
    const width = opening.width;
    const hingeLeft = (opening.hingeSide ?? 'left') === 'left';
    const swingIn = (opening.swingSide ?? (isBalcony ? 'out' : 'in')) === 'in';
    const canInteract = editorMode === 'view' || planReviewActive;

    const hingeX = hingeLeft ? -width / 2 : width / 2;
    const alongSign = hingeLeft ? 1 : -1;
    const swingSign = swingIn ? 1 : -1;

    // Fresh point list every orientation change — Line remounts via key below
    const arcPoints = useMemo(() => {
        if (!isSwingDoor) return [] as [number, number, number][];
        const hx = hingeLeft ? -width / 2 : width / 2;
        const along = hingeLeft ? 1 : -1;
        const swing = swingIn ? 1 : -1;
        const pts: [number, number, number][] = [];
        for (let i = 0; i <= 24; i++) {
            const a = (i / 24) * (Math.PI / 2);
            pts.push([
                hx + along * Math.cos(a) * width,
                0.02,
                swing * Math.sin(a) * width,
            ]);
        }
        return pts;
    }, [isSwingDoor, width, hingeLeft, swingIn]);

    if (!edge || !n1 || !n2) return null;

    const dx = n2.x - n1.x;
    const dy = n2.y - n1.y;
    const len = Math.hypot(dx, dy);
    const px = n1.x + dx * opening.t;
    const py = n1.y + dy * opening.t;
    const angle = Math.atan2(dy, dx);
    const thickness = edge.thickness;

    const worldFromClient = (clientX: number, clientY: number) => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
        return { x: hit.x, z: hit.z };
    };

    const tFromWorld = (wx: number, wz: number) => {
        if (len < 0.01) return opening.t;
        const t = ((wx - n1.x) * dx + (wz - n1.y) * dy) / (len * len);
        const halfT = (width / len) / 2;
        return Math.max(halfT, Math.min(1 - halfT, t));
    };

    const selectSelf = () => {
        setActiveOpeningId(opening.id);
        setActiveWallId(null);
        setActiveObjectId(null);
    };

    const onPointerDown = (e: any) => {
        if (!canInteract) return;
        e.stopPropagation();
        selectSelf();
        useStore.getState().pushHistory();
        dragRef.current = { pointerId: e.pointerId };
        setIsDragging(true);
        e.target.setPointerCapture?.(e.pointerId);
        document.body.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: any) => {
        if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
        e.stopPropagation();
        const pt = worldFromClient(e.clientX, e.clientY);
        if (!pt) return;
        updateOpening(opening.id, { t: tFromWorld(pt.x, pt.z) });
    };

    const onPointerUp = (e: any) => {
        if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
        e.stopPropagation();
        dragRef.current = null;
        setIsDragging(false);
        e.target.releasePointerCapture?.(e.pointerId);
        document.body.style.cursor = canInteract ? 'grab' : 'default';
    };

    // Open leaf: thin strip from hinge into the swing side (classic plan symbol)
    const leafCenterX = hingeX + alongSign * 0.02;
    const leafCenterZ = swingSign * (width / 2);

    return (
        <group
            position={[px, 0.2, py]}
            rotation={[0, -angle, 0]}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerOver={(e) => {
                if (!canInteract) return;
                e.stopPropagation();
                document.body.style.cursor = isSelected ? 'grab' : 'pointer';
            }}
            onPointerOut={() => {
                if (!dragRef.current) document.body.style.cursor = 'default';
            }}
        >
            {isSelected && (
                <mesh position={[0, -0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[width + 0.16, Math.max(thickness, 0.25) + 0.16]} />
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.18} />
                </mesh>
            )}

            {/* Opening cut in wall */}
            <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[width, Math.max(thickness * 1.15, 0.28)]} />
                <meshBasicMaterial color={isSelected ? '#eff6ff' : '#ffffff'} />
            </mesh>

            {isSwingDoor ? (
                <group key={`swing-${hingeLeft ? 'L' : 'R'}-${swingIn ? 'in' : 'out'}-${width.toFixed(2)}`}>
                    {/* Jambs */}
                    <mesh position={[-width / 2, 0.01, 0]}>
                        <boxGeometry args={[0.035, 0.012, thickness * 1.1]} />
                        <meshBasicMaterial color="#0f172a" />
                    </mesh>
                    <mesh position={[width / 2, 0.01, 0]}>
                        <boxGeometry args={[0.035, 0.012, thickness * 1.1]} />
                        <meshBasicMaterial color="#0f172a" />
                    </mesh>
                    {/* Hinge accent */}
                    <mesh position={[hingeX, 0.015, 0]}>
                        <boxGeometry args={[0.06, 0.014, thickness * 1.2]} />
                        <meshBasicMaterial color={isBalcony ? '#0284c7' : '#334155'} />
                    </mesh>
                    {/* Open leaf */}
                    <mesh position={[leafCenterX, 0.016, leafCenterZ]}>
                        <boxGeometry args={[isBalcony ? 0.04 : 0.03, 0.012, width]} />
                        <meshBasicMaterial color={isBalcony ? '#38bdf8' : '#1e293b'} transparent={isBalcony} opacity={isBalcony ? 0.75 : 1} />
                    </mesh>
                    {/* Swing arc — remounted on flip so geometry never sticks */}
                    {arcPoints.length > 0 && (
                        <Line
                            points={arcPoints}
                            color={isBalcony ? '#0ea5e9' : '#64748b'}
                            lineWidth={1.5}
                            transparent
                            opacity={0.9}
                        />
                    )}
                </group>
            ) : (
                <group>
                    <mesh position={[-width / 2 + 0.02, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#1f2937" />
                    </mesh>
                    <mesh position={[width / 2 - 0.02, 0.005, 0]}>
                        <boxGeometry args={[0.04, 0.01, thickness * 1.05]} />
                        <meshBasicMaterial color="#1f2937" />
                    </mesh>
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
    const nodes = useStore((state) => state.scene.nodes);
    const { camera, gl } = useThree();

    const [isHovered, setHovered] = React.useState(false);
    const meshRef = useRef<THREE.Mesh>(null);
    const isActive = activeNodeId === node.id;
    const visible = isHovered || isActive;

    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
    const hit = useMemo(() => new THREE.Vector3(), []);

    const bind = useDrag(
        ({ down, xy: [clientX, clientY], first, last, event }) => {
            if (first) {
                useStore.getState().pushHistory();
                setActiveNodeId(node.id);
                setIsDragging(true);
                event?.stopPropagation?.();
            }

            if (down) {
                // Use canvas bounding rect — client coords ≠ canvas NDC (was the corner offset bug)
                const rect = gl.domElement.getBoundingClientRect();
                const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
                const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
                raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
                if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;

                let x = hit.x;
                let z = hit.z;

                // Snap to nearby other corners first, else light grid
                let snappedToNode = false;
                for (const other of nodes) {
                    if (other.id === node.id) continue;
                    if (Math.hypot(other.x - x, other.y - z) < 0.35) {
                        x = other.x;
                        z = other.y;
                        snappedToNode = true;
                        break;
                    }
                }
                if (!snappedToNode) {
                    x = Math.round(x * 20) / 20; // 5 cm grid — tighter than cursor lag
                    z = Math.round(z * 20) / 20;
                }
                updateNode(node.id, x, z);
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
            <circleGeometry args={[isActive || isHovered ? 0.22 : 0.16, 16]} />
            <meshBasicMaterial
                color={isActive ? '#22c55e' : '#3b82f6'}
                transparent
                opacity={visible ? 0.85 : 0.15}
                depthTest={false}
            />
        </mesh>
    );
});

/**
 * EdgeLine - Fat line for 2D view
 */
const EdgeLine: React.FC<{ edge: WallEdge; startNode: WallNode; endNode: WallNode }> = React.memo(({ edge, startNode, endNode }) => {
    const activeWallId = useStore((state) => state.activeWallId);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const setActiveNodeId = useStore((state) => state.setActiveNodeId);
    const setEditorMode = useStore((state) => state.setEditorMode);
    const splitEdge = useStore((state) => state.splitEdge);
    const editorMode = useStore((state) => state.editorMode);
    const planReviewActive = useStore((state) => state.planReviewActive);
    const { camera, gl } = useThree();
    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
    const hit = useMemo(() => new THREE.Vector3(), []);

    const isSelected = activeWallId === edge.id;
    const canSelect = editorMode === 'view' || planReviewActive;

    // Build GPU objects once per geometry/style change (previously a fresh Line2 +
    // material was created on EVERY render and never disposed -> GPU memory leak)
    const { line, geometry, material, len, angle, mx, my } = useMemo(() => {
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

        return { line: new Line2(geo, mat), geometry: geo, material: mat, len, angle, mx, my };
    }, [startNode.x, startNode.y, endNode.x, endNode.y, isSelected, edge.kind]);

    // Dispose GPU resources when geometry/material are replaced or on unmount
    React.useEffect(() => {
        return () => {
            geometry.dispose();
            material.dispose();
        };
    }, [geometry, material]);

    const worldFromClient = (clientX: number, clientY: number) => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
        if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
        return { x: hit.x, z: hit.z };
    };

    const insertNodeAt = (wx: number, wz: number) => {
        // Keep off endpoints so we don't bounce into existing corners
        const dx = endNode.x - startNode.x;
        const dy = endNode.y - startNode.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1e-6) return;
        let t = ((wx - startNode.x) * dx + (wz - startNode.y) * dy) / lenSq;
        t = Math.max(0.12, Math.min(0.88, t));
        const px = startNode.x + t * dx;
        const py = startNode.y + t * dy;
        const nodeId = splitEdge(edge.id, px, py);
        if (nodeId) {
            setActiveNodeId(nodeId);
            setActiveWallId(null);
            setEditorMode('walls');
        }
    };

    const handleClick = (e: any) => {
        if (!canSelect) return;
        e.stopPropagation();
        setActiveWallId(edge.id);
        setActiveObjectId(null);
        setActiveOpeningId(null);
    };

    const handleDoubleClick = (e: any) => {
        // Like Bézier / CAD: double-click edge → insert corner vertex
        if (editorMode === 'walls' || editorMode === 'view' || planReviewActive) {
            e.stopPropagation();
            const pt = worldFromClient(e.clientX, e.clientY);
            if (pt) insertNodeAt(pt.x, pt.z);
        }
    };

    return (
        <group>
            {/* The visible line */}
            <primitive object={line} />

            {/* Selected glow indicator in 2D */}
            {isSelected && (
                <mesh position={[mx, 0.08, my]} rotation={[-Math.PI / 2, 0, -angle]}>
                    <planeGeometry args={[len, edge.thickness + 0.1]} />
                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} />
                </mesh>
            )}

            {/* Mid-edge “+” — click to add a corner (curve-style control point) */}
            {isSelected && len > 0.5 && (
                <group position={[mx, 0.2, my]}>
                    <mesh
                        rotation={[-Math.PI / 2, 0, 0]}
                        onClick={(e) => {
                            e.stopPropagation();
                            insertNodeAt(mx, my);
                        }}
                        onPointerOver={() => { document.body.style.cursor = 'copy'; }}
                        onPointerOut={() => { document.body.style.cursor = 'default'; }}
                    >
                        <circleGeometry args={[0.14, 20]} />
                        <meshBasicMaterial color="#22c55e" transparent opacity={0.9} depthTest={false} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => null}>
                        <planeGeometry args={[0.12, 0.03]} />
                        <meshBasicMaterial color="#ffffff" depthTest={false} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => null}>
                        <planeGeometry args={[0.03, 0.12]} />
                        <meshBasicMaterial color="#ffffff" depthTest={false} />
                    </mesh>
                </group>
            )}

            {/* Wide transparent interaction box */}
            <mesh 
                position={[mx, 0.12, my]} 
                rotation={[-Math.PI / 2, 0, -angle]}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onPointerOver={() => {
                    if (canSelect) document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                    document.body.style.cursor = 'default';
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
const EdgeMesh: React.FC<{ edge: WallEdge; startNode: WallNode; endNode: WallNode; openings: Opening[] }> = React.memo(({ edge, startNode, endNode, openings }) => {
    const activeWallId = useStore((state) => state.activeWallId);
    const activeOpeningId = useStore((state) => state.activeOpeningId);
    
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);
    const editorMode = useStore((state) => state.editorMode);
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const wallCutaway3D = useStore((state) => state.wallCutaway3D ?? true);
    const isCutaway = cameraMode === '3d' && wallCutaway3D;

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

        // Enrich openings with clamped center so hole and Window3D/Door3D share the same t
        const placedOpenings = wallOpenings.map(op => {
            const opWidthT = Math.min(op.width / Math.max(len, 0.01), 0.98);
            const halfT = opWidthT / 2;
            const clampedT = Math.max(halfT, Math.min(1 - halfT, op.t));
            return { ...op, clampedT, opStartT: clampedT - halfT, opEndT: clampedT + halfT };
        }).sort((a, b) => a.clampedT - b.clampedT);

        const isCutaway = cameraMode === '3d' && wallCutaway3D;
        const effectiveHeight = isCutaway ? 0.72 : edge.height;
        placedOpenings.forEach(op => {
            // Wall before opening
            if (op.opStartT > currentT) {
                const seg = createSegment(currentT, op.opStartT, 0, effectiveHeight, 'wall');
                if (seg) segments.push(seg);
            }

            // Sill (below window) — regular windows have sillHeight ≈ 0.9
            if (op.sillHeight > 0.01) {
                const seg = createSegment(op.opStartT, op.opEndT, 0, op.sillHeight, 'sill');
                if (seg) segments.push(seg);
            }

            // Lintel (above window/door)
            const topHeight = Math.min(edge.height, op.sillHeight + op.height);
            if (!isCutaway && topHeight < edge.height - 0.01) {
                const seg = createSegment(op.opStartT, op.opEndT, topHeight, edge.height, 'lintel');
                if (seg) segments.push(seg);
            }

            currentT = Math.max(currentT, op.opEndT);
        });

        // Remaining wall
        if (currentT < 1) {
            const seg = createSegment(currentT, 1, 0, effectiveHeight, 'wall');
            if (seg) segments.push(seg);
        }

        return { parts: segments, totalLength: len, angle: ang, midX, midZ, wallOpenings: placedOpenings };
    }, [startNode, endNode, edge.thickness, edge.height, openings, cameraMode, wallCutaway3D]);

    const wallColor = useStore((state) => state.scene.materials?.wallColor || '#faf9f6');

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
                    {/* Selected wall finish color with warm roughness */}
                    <meshStandardMaterial color={wallColor} roughness={0.8} />
                    {isWallSelected && (
                        <Box args={[part.args[0] + 0.03, part.args[1] + 0.03, part.args[2] + 0.03]} position={[0, 0, 0]}>
                            <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                        </Box>
                    )}
                </mesh>
            ))}

            {/* Portal Objects (Doors and Windows) — use clampedT so mesh matches the wall hole */}
            {wallOpenings.map((op: any) => {
                const t = op.clampedT ?? op.t;
                const x = (t - 0.5) * totalLength;
                const y = op.sillHeight + op.height / 2;
                const isSelected = activeOpeningId === op.id;
                const isPanoramic = op.kind === 'window' && op.sillHeight < 0.15;
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
                                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                                    <planeGeometry args={[op.width + 0.16, edge.thickness + 0.16]} />
                                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.25} depthWrite={false} />
                                </mesh>
                                <Box args={[op.width + 0.08, op.height + 0.08, edge.thickness + 0.08]} position={[0, y, 0]}>
                                    <meshBasicMaterial color="#2563eb" wireframe depthWrite={false} />
                                </Box>
                                <Box args={[op.width + 0.08, op.height + 0.08, edge.thickness + 0.08]} position={[0, y, 0]}>
                                    <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
                                </Box>
                            </>
                        )}
                        {!isCutaway && (op.kind === 'door' || op.kind === 'balcony_door') && (
                            <Door3D
                                position={[0, 0, 0]}
                                width={op.width}
                                height={op.height}
                                thickness={edge.thickness}
                                hingeLeft={(op.hingeSide ?? 'left') === 'left'}
                                swingIn={(op.swingSide ?? (op.kind === 'balcony_door' ? 'out' : 'in')) === 'in'}
                                balcony={op.kind === 'balcony_door'}
                            />
                        )}
                        {!isCutaway && op.kind !== 'door' && op.kind !== 'balcony_door' && (
                            <Window3D
                                position={[0, y, 0]}
                                width={op.width}
                                height={op.height}
                                thickness={edge.thickness}
                                panoramic={isPanoramic}
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
    thickness: number,
    panoramic?: boolean
}> = React.memo(({ position, width, height, thickness, panoramic = false }) => {
    const frameSize = panoramic ? 0.04 : 0.05;

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

            {/* Glass — standard transparent (no transmission) for FPS */}
            <mesh position={[0, 0, 0]}>
                <boxGeometry args={[width - frameSize * 2, height - frameSize * 2, 0.02]} />
                <meshStandardMaterial
                    color="#93c5fd"
                    metalness={0.05}
                    roughness={0.15}
                    transparent
                    opacity={0.45}
                />
            </mesh>
        </group>
    );
});

/**
 * Door3D - Frame + leaf; hinge/swing match 2D plan symbol.
 */
const Door3D: React.FC<{
    position: [number, number, number],
    width: number,
    height: number,
    thickness: number,
    hingeLeft?: boolean,
    swingIn?: boolean,
    balcony?: boolean,
}> = React.memo(({ position, width, height, thickness, hingeLeft = true, swingIn = true, balcony = false }) => {
    const frameSize = balcony ? 0.04 : 0.05;
    const hingeX = hingeLeft ? (-width / 2 + frameSize) : (width / 2 - frameSize);
    const openAngle = (hingeLeft ? 1 : -1) * (swingIn ? 0.6 : -0.6);
    const leafDir = hingeLeft ? 1 : -1;
    const frameColor = balcony ? '#334155' : '#78716c';

    return (
        <group position={position}>
            <mesh position={[0, height - frameSize / 2, 0]} castShadow>
                <boxGeometry args={[width, frameSize, thickness * 1.05]} />
                <meshStandardMaterial color={frameColor} roughness={0.7} />
            </mesh>
            <mesh position={[-width / 2 + frameSize / 2, height / 2, 0]} castShadow>
                <boxGeometry args={[frameSize, height, thickness * 1.05]} />
                <meshStandardMaterial color={frameColor} roughness={0.7} />
            </mesh>
            <mesh position={[width / 2 - frameSize / 2, height / 2, 0]} castShadow>
                <boxGeometry args={[frameSize, height, thickness * 1.05]} />
                <meshStandardMaterial color={frameColor} roughness={0.7} />
            </mesh>

            <group position={[hingeX, height / 2, 0]} rotation={[0, openAngle, 0]}>
                <mesh position={[leafDir * (width / 2 - frameSize), 0, 0]} castShadow>
                    <boxGeometry args={[width - frameSize * 2, height - frameSize, balcony ? 0.03 : 0.04]} />
                    {balcony ? (
                        <meshStandardMaterial color="#7dd3fc" metalness={0.1} roughness={0.15} transparent opacity={0.55} />
                    ) : (
                        <meshStandardMaterial color="#a8a29e" roughness={0.8} />
                    )}
                </mesh>
                {!balcony && (
                    <mesh position={[leafDir * (width - frameSize * 2 - 0.1), 0, swingIn ? 0.03 : -0.03]} castShadow>
                        <boxGeometry args={[0.03, 0.1, 0.02]} />
                        <meshStandardMaterial color="silver" metalness={0.9} roughness={0.1} />
                    </mesh>
                )}
            </group>
        </group>
    );
});

export default WallGraph;
