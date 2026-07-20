import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import { useDrag } from '@use-gesture/react';
import { Vector3 } from 'three';
import { Html } from '@react-three/drei';
import { Line2, LineMaterial, LineGeometry } from 'three-stdlib';
import { useSnapSystem, findNearestEdge } from '../hooks/useSnapSystem';

/**
 * WallEditor - Graph-based Wall Drawing Tool
 * 
 * Features:
 * - Click-click drawing (no drag required)
 * - Phantom (dashed) line preview before committing
 * - Snapping to grid, nodes, and axis
 * - Auto-split when ending on existing wall segment
 */
export const WallEditor: React.FC = () => {
    const editorMode = useStore((state) => state.editorMode);
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges);
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const splitEdge = useStore((state) => state.splitEdge);
    const setEditorMode = useStore((state) => state.setEditorMode);
    const addOpening = useStore((state) => state.addOpening);
    const addWindowWall = useStore((state) => state.addWindowWall);

    // Drawing state
    const [startNodeId, setStartNodeId] = useState<string | null>(null);
    const [cursorPos, setCursorPos] = useState<Vector3>(new Vector3(0, 0, 0));
    const [rawCursorPos, setRawCursorPos] = useState<{ x: number; y: number } | null>(null);
    const [hasMouseMoved, setHasMouseMoved] = useState(false);

    // Opening Tool State
    const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
    const [hoverT, setHoverT] = useState<number>(0);
    const [ghostPos, setGhostPos] = useState<{ x: number, y: number, angle: number } | null>(null);
    const openingToolMode = useStore((state) => state.openingToolMode);
    const setOpeningToolMode = useStore((state) => state.setOpeningToolMode);

    // Get start node position for snapping reference
    const startNode = startNodeId ? nodes.find(n => n.id === startNodeId) : null;

    // Apply snapping (only if mouse has moved)
    const snapResult = useSnapSystem(
        rawCursorPos?.x ?? 0,
        rawCursorPos?.y ?? 0,
        nodes,
        {
            referencePoint: startNode ? { x: startNode.x, y: startNode.y } : null
        }
    );

    // Update visual cursor position when snap result changes
    useEffect(() => {
        if (hasMouseMoved) {
            setCursorPos(new Vector3(snapResult.x, 0.1, snapResult.y));
        }
    }, [snapResult.x, snapResult.y, hasMouseMoved]);

    // Cleanup state on mode change
    useEffect(() => {
        if (editorMode !== 'walls') setStartNodeId(null);
        if (editorMode !== 'openings') {
            setHoverEdgeId(null);
            setGhostPos(null);
        }
    }, [editorMode]);

    // ESC Key handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (startNodeId) {
                    setStartNodeId(null);
                } else if (editorMode !== 'view') {
                    setEditorMode('view');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [startNodeId, editorMode, setEditorMode]);

    // Handle pointer move
    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (editorMode !== 'walls' && editorMode !== 'openings') return;

        // Valid hit check
        if (Math.abs(e.point.y - 0.01) > 0.001) return;

        if (!hasMouseMoved) setHasMouseMoved(true);
        setRawCursorPos({ x: e.point.x, y: e.point.z });

        // OPENING TOOL LOGIC
        if (editorMode === 'openings') {
            if (openingToolMode === 'glass_wall') {
                // Glass wall drawing mode: hide ghost hover
                setHoverEdgeId(null);
                setGhostPos(null);
                return;
            }

            // Click-to-place Door/Window Mode
            const nearest = findNearestEdge(e.point.x, e.point.z, edges, nodes);
            if (nearest && nearest.distance < 0.5) { // 50cm snap radius
                const edge = edges.find(ed => ed.id === nearest.edgeId);
                if (edge) {
                    const n1 = nodes.find(n => n.id === edge.startNodeId);
                    const n2 = nodes.find(n => n.id === edge.endNodeId);
                    if (n1 && n2) {
                        const dx = n2.x - n1.x;
                        const dy = n2.y - n1.y;
                        const len = Math.hypot(dx, dy);
                        
                        // Calculate projection ratio t
                        let t = ((e.point.x - n1.x) * dx + (e.point.z - n1.y) * dy) / (len * len);
                        t = Math.max(0.05, Math.min(0.95, t)); // Keep away from joints
                        
                        const snapX = n1.x + t * dx;
                        const snapY = n1.y + t * dy;
                        const angle = Math.atan2(dy, dx);
                        
                        setHoverEdgeId(edge.id);
                        setHoverT(t);
                        setGhostPos({ x: snapX, y: snapY, angle });
                        return;
                    }
                }
            }
            setHoverEdgeId(null);
            setGhostPos(null);
        }
    }, [editorMode, hasMouseMoved, edges, nodes, openingToolMode]);

    // Handle click
    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        if (e.button !== 0) return;

        // OPENINGS MODE
        if (editorMode === 'openings') {
            e.stopPropagation();

            if (openingToolMode !== 'glass_wall') {
                // Place window or door directly inside the hovered wall!
                if (hoverEdgeId && ghostPos) {
                    addOpening(hoverEdgeId, hoverT, openingToolMode);
                    // Clear hover preview
                    setHoverEdgeId(null);
                    setGhostPos(null);
                }
                return;
            }

            // Glass wall drawing mode (click-click between points)
            const clickX = snapResult.x;
            const clickY = snapResult.y;

            if (!startNodeId) {
                // START DRAWING
                let nodeId: string;
                if (snapResult.snappedToNode) {
                    nodeId = snapResult.snappedToNode.id;
                } else {
                    // Always try to snap to node first for windows
                    const nearestEdge = findNearestEdge(clickX, clickY, edges, nodes);
                    if (nearestEdge && nearestEdge.distance < 0.15) {
                        nodeId = splitEdge(nearestEdge.edgeId, clickX, clickY);
                    } else {
                        nodeId = addNode(clickX, clickY);
                    }
                }
                setStartNodeId(nodeId);
            } else {
                // FINISH DRAWING
                const start = nodes.find(n => n.id === startNodeId);
                if (!start) return;
                const dist = Math.hypot(clickX - start.x, clickY - start.y);
                if (dist < 0.1) return;

                let endNodeId: string;
                if (snapResult.snappedToNode) {
                    endNodeId = snapResult.snappedToNode.id;
                } else {
                    const nearestEdge = findNearestEdge(clickX, clickY, edges, nodes);
                    if (nearestEdge && nearestEdge.distance < 0.15) {
                        endNodeId = splitEdge(nearestEdge.edgeId, clickX, clickY);
                    } else {
                        endNodeId = addNode(clickX, clickY);
                    }
                }

                // INHERIT THICKNESS
                // Check edges connected to startNode
                const connected = edges.find(ed => ed.startNodeId === startNodeId || ed.endNodeId === startNodeId);
                const thickness = connected ? connected.thickness : 0.15;

                // USE ATOMIC ACTION
                addWindowWall(startNodeId, endNodeId, thickness, { type: 'panoramic' });

                // Stop chain
                setStartNodeId(null);
            }
            return;
        }

        if (editorMode !== 'walls') return;
        e.stopPropagation();

        const clickX = snapResult.x;
        const clickY = snapResult.y;

        if (!startNodeId) {
            // ... (Existing Wall drawing start logic) ...
            // First click - start drawing
            let nodeId: string;
            if (snapResult.snappedToNode) {
                nodeId = snapResult.snappedToNode.id;
            } else {
                const nearestEdge = findNearestEdge(clickX, clickY, edges, nodes);
                if (nearestEdge && nearestEdge.distance < 0.15) {
                    nodeId = splitEdge(nearestEdge.edgeId, clickX, clickY);
                } else {
                    nodeId = addNode(clickX, clickY);
                }
            }
            setStartNodeId(nodeId);
        } else {
            // ... (Existing Wall drawing end logic) ...
            const start = nodes.find(n => n.id === startNodeId);
            if (!start) return;
            const dist = Math.hypot(clickX - start.x, clickY - start.y);
            if (dist < 0.1) return;

            let endNodeId: string;
            if (snapResult.snappedToNode) {
                endNodeId = snapResult.snappedToNode.id;
            } else {
                const nearestEdge = findNearestEdge(clickX, clickY, edges, nodes);
                if (nearestEdge && nearestEdge.distance < 0.15) {
                    endNodeId = splitEdge(nearestEdge.edgeId, clickX, clickY);
                } else {
                    endNodeId = addNode(clickX, clickY);
                }
            }
            addEdge(startNodeId, endNodeId);
            setStartNodeId(endNodeId);
        }
    }, [editorMode, startNodeId, snapResult, nodes, edges, addNode, addEdge, splitEdge, hoverEdgeId, hoverT, ghostPos, addOpening]);

    if (editorMode !== 'walls' && editorMode !== 'openings') return null;

    return (
        <group>
            {/* Invisible interaction plane */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
                onPointerMove={handlePointerMove}
                onClick={handleClick}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* DRAWING FEEDBACK (Walls OR Openings) */}
            {(editorMode === 'walls' || (editorMode === 'openings' && startNodeId)) && hasMouseMoved && (
                <group>
                    <mesh position={[cursorPos.x, 0.12, cursorPos.z]} rotation={[-Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[0.08, 0.12, 16]} />
                        <meshBasicMaterial color={
                            snapResult.snappedToNode ? '#22c55e' :
                                editorMode === 'openings' ? '#f59e0b' : // Amber for window
                                    snapResult.isAxisAligned ? '#f59e0b' : '#3b82f6'
                        } />
                    </mesh>
                    {/* Snap indicator */}
                    {snapResult.snappedToNode && (
                        <mesh position={[snapResult.x, 0.13, snapResult.y]} rotation={[-Math.PI / 2, 0, 0]}>
                            <circleGeometry args={[0.06, 16]} />
                            <meshBasicMaterial color="#22c55e" />
                        </mesh>
                    )}
                    {/* Phantom line */}
                    {startNodeId && startNode && (
                        <PhantomLine
                            start={{ x: startNode.x, y: startNode.y }}
                            end={{ x: cursorPos.x, y: cursorPos.z }}
                            isAxisAligned={snapResult.isAxisAligned}
                            color={editorMode === 'openings' ? '#fbbf24' : undefined}
                        />
                    )}
                    {/* Dimension label */}
                    {startNodeId && startNode && (
                        <DimensionLabel start={{ x: startNode.x, y: startNode.y }} end={{ x: cursorPos.x, y: cursorPos.z }} />
                    )}
                </group>
            )}

            {/* OPENINGS MODE: Ghost Preview */}
            {editorMode === 'openings' && ghostPos && (
                <mesh position={[ghostPos.x, 0.75, ghostPos.y]} rotation={[0, -ghostPos.angle, 0]}>
                    <boxGeometry args={[openingToolMode === 'door' ? 0.9 : 1.2, openingToolMode === 'door' ? 2.1 : 1.5, 0.2]} />
                    <meshBasicMaterial color={openingToolMode === 'door' ? "#fbbf24" : "#3b82f6"} opacity={0.5} transparent />
                </mesh>
            )}

            {/* WINDOW TYPE TOOLBAR (HUD) */}
            {editorMode === 'openings' && (
                <Html position={[0, 0, 0]} style={{ position: 'fixed', bottom: '130px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }} zIndexRange={[1000, 1000]}>
                    <div className="flex bg-white/90 backdrop-blur-xl rounded-full shadow-2xl p-1 gap-1 border border-slate-200">
                        <button
                            onClick={() => {
                                setOpeningToolMode('door');
                                setStartNodeId(null);
                            }}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${openingToolMode === 'door'
                                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            🚪 Дверь
                        </button>
                        <button
                            onClick={() => {
                                setOpeningToolMode('window');
                                setStartNodeId(null);
                            }}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${openingToolMode === 'window'
                                    ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            🪟 Окно
                        </button>
                        <button
                            onClick={() => setOpeningToolMode('glass_wall')}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${openingToolMode === 'glass_wall'
                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            💎 Окно-Стена (Панорама)
                        </button>
                    </div>
                </Html>
            )}
        </group>
    );
};

/**
 * PhantomLine - Dashed preview line
 */
const PhantomLine: React.FC<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    isAxisAligned: boolean;
    color?: string;
}> = React.memo(({ start, end, isAxisAligned, color }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) return null;

    const angle = Math.atan2(dy, dx);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;

    return (
        <mesh
            position={[mx, 0.1, my]}
            rotation={[0, -angle, 0]}
            raycast={() => null}
        >
            <boxGeometry args={[dist, 0.12, 0.04]} />
            <meshBasicMaterial
                color={color || (isAxisAligned ? '#f59e0b' : '#3b82f6')}
                opacity={0.6}
                transparent
            />
        </mesh>
    );
});

/**
 * DimensionLabel - Shows distance while drawing
 */
const DimensionLabel: React.FC<{
    start: { x: number; y: number };
    end: { x: number; y: number };
}> = React.memo(({ start, end }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;

    if (dist < 0.1) return null;

    return (
        <Html position={[cx, 0.5, cy]} center pointerEvents="none" zIndexRange={[100, 0]}>
            <div className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-lg select-none whitespace-nowrap">
                {dist.toFixed(2)} m
            </div>
        </Html>
    );
});

export default WallEditor;
