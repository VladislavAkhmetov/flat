import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { Html } from '@react-three/drei';

export const WallBuilder: React.FC = () => {
    const mode = useStore((state) => state.editorMode);
    // Graph Actions
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const addOpening = useStore((state) => state.addOpening);
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges); // Need edges to find thickness

    const { camera } = useThree();

    const [startPoint, setStartPoint] = useState<{ x: number, y: number, id?: string } | null>(null);
    const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);

    // Calculate inherited thickness from start node
    const inheritedThickness = React.useMemo(() => {
        if (!startPoint?.id) return 0.15;
        const connected = edges.find(e => e.startNodeId === startPoint.id || e.endNodeId === startPoint.id);
        return connected ? connected.thickness : 0.15;
    }, [startPoint, edges]);

    // Cancel on ESC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setStartPoint(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (mode !== 'walls' && mode !== 'openings') return null;

    const getSnappedPoint = (point: Vector3) => {
        // 1. Grid Snap
        const snap = 0.05;
        let x = Math.round(point.x / snap) * snap;
        let y = Math.round(point.z / snap) * snap;

        // 2. Node Snap (Magnetic)
        const snapDist = 0.5; // Increased from 0.3 to 0.5 for easier connection
        const closestNode = nodes.find(n => Math.hypot(n.x - x, n.y - y) < snapDist);

        if (closestNode) {
            return { x: closestNode.x, y: closestNode.y, id: closestNode.id };
        }
        return { x, y, id: undefined };
    };

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        const snapped = getSnappedPoint(e.point);
        // Important: preserve the ID in state so we know if we are snapped
        setCursorPos({ x: snapped.x, y: snapped.y, id: snapped.id || undefined } as any);
    };

    const handleClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!cursorPos) return;

        if (!startPoint) {
            // Start of chain
            const snapped = getSnappedPoint(e.point); // Re-snap on click to ensure ID is captured
            setStartPoint({ x: snapped.x, y: snapped.y, id: snapped.id });
        } else {
            // Finish Segment
            const dx = cursorPos.x - startPoint.x;
            const dy = cursorPos.y - startPoint.y;
            const len = Math.hypot(dx, dy);

            if (len > 0.1) {
                // 1. Get/Create Start Node
                let startNodeId = startPoint.id;
                if (!startNodeId) {
                    // Check again if node exists exactly at startPoint (if we snapped to grid but not node initially?)
                    // OR just create new
                    startNodeId = addNode(startPoint.x, startPoint.y);
                }

                // 2. Get/Create End Node
                // We use getSnappedPoint again to ensure we have the ID if we clicked on a node
                // (cursorPos might just be coordinates from hover)
                // Actually cursorPos IS from handlePointerMove, but let's re-verify against nodes logic if needed.
                // For simplicity, we trust snapping or creating new.

                // Check if end node exists at cursorPos
                const existingEndNode = nodes.find(n => Math.abs(n.x - cursorPos.x) < 0.01 && Math.abs(n.y - cursorPos.y) < 0.01);
                let endNodeId = existingEndNode ? existingEndNode.id : addNode(cursorPos.x, cursorPos.y);

                // 3. Create Edge with INHERITED THICKNESS
                // If end node is also connected to something, maybe check that?
                // For now startNode is good enough anchor.
                const edgeId = addEdge(startNodeId, endNodeId, {
                    thickness: inheritedThickness,
                    height: 2.7
                });

                // 4. If Openings Mode -> Add Full Window
                if (mode === 'openings') {
                    // Add window spanning 90% of the wall
                    // t=0.5 (center), width = len * 0.9
                    // Ensure width doesn't exceed len - 0.2
                    const winWidth = Math.max(0.5, len - 0.2);
                    // Use inherited thickness for window visual too?
                    // addOpening doesn't take geometry, it just marks the edge.
                    addOpening(edgeId, 0.5, 'window', winWidth);
                    // Note: addOpening defaults width to 1.2. We might need to update it immediately.
                    // Let's rely on default for now, or update store to accept width.
                    // The user requested "Manual Draw Window".
                    // Actually, let's update the opening to match the wall length!

                    // We need to access store to update.
                    // Wait, `addOpening` returns ID. We can update immediately.
                }

                // Continue chain
                setStartPoint({ x: cursorPos.x, y: cursorPos.y, id: endNodeId });

                // If Openings mode, maybe stop chain? Usually windows are single segments.
                // But let's allow chaining for balconies.
            }
        }
    };

    const handleRightClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setStartPoint(null);
    };

    return (
        <group>
            {/* Invisible Infinite Plane */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
                visible={false}
                onPointerMove={handlePointerMove}
                onClick={handleClick}
                onContextMenu={handleRightClick}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>

            {/* Visuals */}
            {cursorPos && (
                <>
                    {/* Tooltip/Cursor Color based on mode */}
                    <mesh position={[cursorPos.x, 0.2, cursorPos.y]} rotation={[-Math.PI / 2, 0, 0]}>
                        <circleGeometry args={[inheritedThickness / 2 + 0.05, 16]} />
                        <meshBasicMaterial
                            // Green if Snapped to Node, else Amber (Window) or Blue (Wall)
                            color={(cursorPos as any).id ? '#22c55e' : (mode === 'openings' ? '#fbbf24' : '#3b82f6')}
                            opacity={0.8} transparent
                        />
                    </mesh>

                    {/* Preview Wall */}
                    {startPoint && (
                        <GhostWall start={startPoint} end={cursorPos} mode={mode} thickness={inheritedThickness} />
                    )}

                    {/* Start Node */}
                    {startPoint && (
                        <mesh position={[startPoint.x, 0.2, startPoint.y]} rotation={[-Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[inheritedThickness / 2, 16]} />
                            <meshBasicMaterial color={mode === 'openings' ? '#fbbf24' : '#3b82f6'} opacity={0.5} transparent />
                        </mesh>
                    )}
                </>
            )}
        </group>
    );
};

const GhostWall: React.FC<{ start: { x: number, y: number }, end: { x: number, y: number }, mode?: string, thickness?: number }> = ({ start, end, mode, thickness = 0.15 }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    if (length < 0.05) return null;

    const isWindow = mode === 'openings';
    const color = isWindow ? '#fbbf24' : '#60a5fa'; // Amber for window, Blue for wall

    return (
        <group position={[midX, 1.25, midY]} rotation={[0, -angle, 0]}>
            {/* Wall Body Preview */}
            <mesh>
                <boxGeometry args={[length, 2.5, thickness]} />
                <meshStandardMaterial color={color} transparent opacity={0.4} />
            </mesh>

            {/* Central Guide Line */}
            <mesh position={[0, 1.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[length, 0.02]} />
                <meshBasicMaterial color={isWindow ? '#d97706' : '#2563eb'} />
            </mesh>

            {/* Length Label */}
            <Html position={[0, 1.5, 0]} center pointerEvents="none">
                <div style={{
                    color: isWindow ? '#92400e' : '#1e40af',
                    background: 'white',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                    border: `1px solid ${isWindow ? '#fcd34d' : '#bfdbfe'}`
                }}>
                    {length.toFixed(2)} m {isWindow && '(Win)'}
                </div>
            </Html>
        </group>
    );
};
