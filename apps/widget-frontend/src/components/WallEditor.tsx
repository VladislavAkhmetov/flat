import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useStore } from '../store';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { computeSnap, findNearestEdge, findNearestNode, SnapResult } from '../hooks/useSnapSystem';

/**
 * WallEditor - Graph-based Wall Drawing Tool
 * 
 * Features:
 * - Click-click drawing (no drag required)
 * - Phantom (dashed) line preview before committing
 * - Snapping to grid, nodes, and axis
 * - Auto-split when ending on existing wall segment
 * 
 * Performance: cursor / phantom-line / ghost feedback is driven entirely through
 * refs and useFrame - pointermove does NOT touch React state, so the graph is
 * never re-rendered while just moving the mouse.
 */
export const WallEditor: React.FC = () => {
    const editorMode = useStore((state) => state.editorMode);
    const wallToolMode = useStore((state) => state.wallToolMode);
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges);
    const addNode = useStore((state) => state.addNode);
    const addEdge = useStore((state) => state.addEdge);
    const deleteEdge = useStore((state) => state.deleteEdge);
    const splitEdge = useStore((state) => state.splitEdge);
    const setEditorMode = useStore((state) => state.setEditorMode);
    const addOpening = useStore((state) => state.addOpening);
    const addWindowWall = useStore((state) => state.addWindowWall);

    // Drawing state (low-frequency, click-driven)
    const [startNodeId, setStartNodeId] = useState<string | null>(null);
    const openingToolMode = useStore((state) => state.openingToolMode);
    const isErase = editorMode === 'walls' && wallToolMode === 'erase';

    // High-frequency cursor state lives in refs (no re-renders on pointermove)
    const snapRef = useRef<SnapResult>({ x: 0, y: 0, snappedToNode: null, isAxisAligned: false, snapType: 'none' });
    const hasMouseMovedRef = useRef(false);
    const hoverRef = useRef<{ edgeId: string | null; t: number; x: number; y: number; angle: number }>({
        edgeId: null, t: 0, x: 0, y: 0, angle: 0
    });

    // Refs to the feedback meshes updated imperatively in useFrame
    const cursorRingRef = useRef<THREE.Mesh>(null);
    const cursorRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
    const snapDotRef = useRef<THREE.Mesh>(null);
    const phantomRef = useRef<THREE.Mesh>(null);
    const phantomMatRef = useRef<THREE.MeshBasicMaterial>(null);
    const dimGroupRef = useRef<THREE.Group>(null);
    const dimLabelRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<THREE.Mesh>(null);

    // Cleanup state on mode change
    useEffect(() => {
        if (editorMode !== 'walls' || wallToolMode === 'erase') setStartNodeId(null);
        if (editorMode !== 'openings') {
            hoverRef.current.edgeId = null;
        }
    }, [editorMode, wallToolMode]);

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

    // Handle pointer move: only update refs, never React state
    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
        if (editorMode !== 'walls' && editorMode !== 'openings') return;

        // Valid hit check
        if (Math.abs(e.point.y - 0.01) > 0.001) return;

        hasMouseMovedRef.current = true;

        const scene = useStore.getState().scene;
        const start = startNodeId ? scene.nodes.find(n => n.id === startNodeId) : null;
        snapRef.current = computeSnap(e.point.x, e.point.z, scene.nodes, {
            referencePoint: start ? { x: start.x, y: start.y } : null
        });

        // ERASE: highlight nearest wall segment
        if (editorMode === 'walls' && useStore.getState().wallToolMode === 'erase') {
            const nearest = findNearestEdge(e.point.x, e.point.z, scene.edges, scene.nodes, 0.45);
            if (nearest) {
                const edge = scene.edges.find(ed => ed.id === nearest.edgeId);
                const n1 = edge && scene.nodes.find(n => n.id === edge.startNodeId);
                const n2 = edge && scene.nodes.find(n => n.id === edge.endNodeId);
                if (edge && n1 && n2) {
                    hoverRef.current = {
                        edgeId: edge.id,
                        t: 0.5,
                        x: (n1.x + n2.x) / 2,
                        y: (n1.y + n2.y) / 2,
                        angle: Math.atan2(n2.y - n1.y, n2.x - n1.x),
                    };
                    return;
                }
            }
            hoverRef.current.edgeId = null;
            return;
        }

        // OPENING TOOL LOGIC
        if (editorMode === 'openings') {
            if (openingToolMode === 'glass_wall') {
                hoverRef.current.edgeId = null;
                return;
            }

            // Click-to-place Door/Window Mode
            const nearest = findNearestEdge(e.point.x, e.point.z, scene.edges, scene.nodes, 0.5);
            if (nearest) {
                const edge = scene.edges.find(ed => ed.id === nearest.edgeId);
                const n1 = edge && scene.nodes.find(n => n.id === edge.startNodeId);
                const n2 = edge && scene.nodes.find(n => n.id === edge.endNodeId);
                if (edge && n1 && n2) {
                    const dx = n2.x - n1.x;
                    const dy = n2.y - n1.y;
                    const len = Math.hypot(dx, dy);

                    // Calculate projection ratio t
                    let t = ((e.point.x - n1.x) * dx + (e.point.z - n1.y) * dy) / (len * len);
                    t = Math.max(0.05, Math.min(0.95, t)); // Keep away from joints

                    hoverRef.current = {
                        edgeId: edge.id,
                        t,
                        x: n1.x + t * dx,
                        y: n1.y + t * dy,
                        angle: Math.atan2(dy, dx)
                    };
                    return;
                }
            }
            hoverRef.current.edgeId = null;
        }
    }, [editorMode, startNodeId, openingToolMode]);

    // Imperative visual feedback (runs on the render loop, zero React work)
    useFrame(() => {
        const snap = snapRef.current;
        const eraseMode = editorMode === 'walls' && useStore.getState().wallToolMode === 'erase';
        const isDrawingFeedback =
            hasMouseMovedRef.current &&
            !eraseMode &&
            (editorMode === 'walls' || (editorMode === 'openings' && !!startNodeId));

        // Cursor ring
        if (cursorRingRef.current && cursorRingMatRef.current) {
            cursorRingRef.current.visible = isDrawingFeedback;
            cursorRingRef.current.position.set(snap.x, 0.12, snap.y);
            cursorRingMatRef.current.color.set(
                snap.snappedToNode ? '#22c55e' :
                    editorMode === 'openings' ? '#f59e0b' :
                        snap.isAxisAligned ? '#f59e0b' : '#3b82f6'
            );
        }

        // Snap indicator dot
        if (snapDotRef.current) {
            snapDotRef.current.visible = isDrawingFeedback && !!snap.snappedToNode;
            snapDotRef.current.position.set(snap.x, 0.13, snap.y);
        }

        // Phantom line + dimension label (only while a start node exists)
        const start = startNodeId ? useStore.getState().scene.nodes.find(n => n.id === startNodeId) : null;
        const dx = start ? snap.x - start.x : 0;
        const dy = start ? snap.y - start.y : 0;
        const dist = Math.hypot(dx, dy);
        const showLine = isDrawingFeedback && !!start && dist >= 0.05;

        if (phantomRef.current && phantomMatRef.current) {
            phantomRef.current.visible = showLine;
            if (showLine && start) {
                const angle = Math.atan2(dy, dx);
                phantomRef.current.position.set((start.x + snap.x) / 2, 0.1, (start.y + snap.y) / 2);
                phantomRef.current.rotation.set(0, -angle, 0);
                phantomRef.current.scale.set(dist, 1, 1);
                phantomMatRef.current.color.set(
                    editorMode === 'openings' ? '#fbbf24' :
                        snap.isAxisAligned ? '#f59e0b' : '#3b82f6'
                );
            }
        }

        if (dimGroupRef.current) {
            dimGroupRef.current.visible = showLine && dist >= 0.1;
            if (start) {
                dimGroupRef.current.position.set((start.x + snap.x) / 2, 0.5, (start.y + snap.y) / 2);
            }
        }
        if (dimLabelRef.current) {
            dimLabelRef.current.style.display = (showLine && dist >= 0.1) ? 'block' : 'none';
            dimLabelRef.current.textContent = `${dist.toFixed(2)} m`;
        }

        // Openings / erase ghost preview
        if (ghostRef.current) {
            const hover = hoverRef.current;
            const eraseMode = editorMode === 'walls' && useStore.getState().wallToolMode === 'erase';
            const showGhost =
                (editorMode === 'openings' && openingToolMode !== 'glass_wall' && !!hover.edgeId) ||
                (eraseMode && !!hover.edgeId);
            ghostRef.current.visible = showGhost;
            if (showGhost) {
                ghostRef.current.position.set(hover.x, eraseMode ? 0.2 : 0.75, hover.y);
                ghostRef.current.rotation.set(0, -hover.angle, 0);
            }
        }
    });

    // Handle click
    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
        if (e.button !== 0) return;

        const snapResult = snapRef.current;

        // ERASE MODE — delete nearest wall segment
        if (editorMode === 'walls' && useStore.getState().wallToolMode === 'erase') {
            e.stopPropagation();
            const hover = hoverRef.current;
            if (hover.edgeId) {
                deleteEdge(hover.edgeId);
                hoverRef.current.edgeId = null;
            }
            return;
        }

        // OPENINGS MODE
        if (editorMode === 'openings') {
            e.stopPropagation();

            if (openingToolMode !== 'glass_wall') {
                // Place window or door directly inside the hovered wall!
                const hover = hoverRef.current;
                if (hover.edgeId) {
                    const id = addOpening(hover.edgeId, hover.t, openingToolMode);
                    hoverRef.current.edgeId = null;
                    useStore.getState().setActiveOpeningId(id);
                    useStore.getState().setActiveWallId(null);
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

        // Prefer corner merge over mid-wall split (fixes bounce / gap at junctions)
        const NODE_JOIN_DIST = 0.5;
        const EDGE_JOIN_DIST = 0.35;

        const resolveClickNode = (): string => {
            if (snapResult.snappedToNode) return snapResult.snappedToNode.id;

            const nearNode = findNearestNode(clickX, clickY, nodes, NODE_JOIN_DIST);
            if (nearNode) return nearNode.node.id;

            const nearestEdge = findNearestEdge(clickX, clickY, edges, nodes, EDGE_JOIN_DIST);
            if (nearestEdge) {
                // splitEdge returns existing endpoint when click is near a corner
                return splitEdge(nearestEdge.edgeId, clickX, clickY);
            }
            return addNode(clickX, clickY);
        };

        if (!startNodeId) {
            setStartNodeId(resolveClickNode());
        } else {
            const start = nodes.find(n => n.id === startNodeId);
            if (!start) return;
            const dist = Math.hypot(clickX - start.x, clickY - start.y);
            if (dist < 0.1) return;

            const endNodeId = resolveClickNode();
            if (endNodeId === startNodeId) return;
            addEdge(startNodeId, endNodeId);
            setStartNodeId(endNodeId);
        }
    }, [editorMode, startNodeId, nodes, edges, addNode, addEdge, deleteEdge, splitEdge, addOpening, addWindowWall, openingToolMode]);

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

            {/* DRAWING FEEDBACK - meshes are always mounted, toggled/moved via useFrame */}
            <mesh ref={cursorRingRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.08, 0.12, 16]} />
                <meshBasicMaterial ref={cursorRingMatRef} color="#3b82f6" />
            </mesh>

            {/* Snap indicator */}
            <mesh ref={snapDotRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.06, 16]} />
                <meshBasicMaterial color="#22c55e" />
            </mesh>

            {/* Phantom line (unit box scaled along X each frame) */}
            <mesh ref={phantomRef} visible={false} raycast={() => null}>
                <boxGeometry args={[1, 0.12, 0.04]} />
                <meshBasicMaterial ref={phantomMatRef} color="#3b82f6" opacity={0.6} transparent />
            </mesh>

            {/* Dimension label (group is moved imperatively, Html tracks parent transform) */}
            <group ref={dimGroupRef} visible={false}>
                <Html center pointerEvents="none" zIndexRange={[100, 0]}>
                    <div
                        ref={dimLabelRef}
                        style={{ display: 'none' }}
                        className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-lg select-none whitespace-nowrap"
                    />
                </Html>
            </group>

            {/* OPENINGS / ERASE: Ghost Preview */}
            {(editorMode === 'openings' || isErase) && (
                <mesh ref={ghostRef} visible={false}>
                    <boxGeometry args={[
                        isErase ? 1.2 : (openingToolMode === 'window' ? 1.2 : 0.9),
                        isErase ? 0.25 : (openingToolMode === 'window' ? 1.5 : 2.1),
                        isErase ? 0.25 : 0.2,
                    ]} />
                    <meshBasicMaterial
                        color={isErase ? "#ef4444" : (openingToolMode === 'balcony_door' ? "#38bdf8" : (openingToolMode === 'door' ? "#fbbf24" : "#3b82f6"))}
                        opacity={0.5}
                        transparent
                    />
                </mesh>
            )}
        </group>
    );
};

export default WallEditor;
