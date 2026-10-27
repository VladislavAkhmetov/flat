import { useMemo } from 'react';
import { WallNode } from '@flat/shared';

export interface SnapResult {
    x: number;
    y: number;
    snappedToNode: WallNode | null;
    isAxisAligned: boolean;
    snapType: 'grid' | 'node' | 'axis' | 'none';
}

interface SnapOptions {
    gridSize?: number;
    nodeSnapRadius?: number;
    axisSnapThreshold?: number;
    referencePoint?: { x: number; y: number } | null;
}

const DEFAULT_OPTIONS: Required<SnapOptions> = {
    gridSize: 0.1,
    /** Generous magnet so AI-import corner gaps are easy to close by hand. */
    nodeSnapRadius: 0.45,
    axisSnapThreshold: 0.15,
    referencePoint: null,
};

/**
 * Nearest node within maxDistance, or null.
 */
export function findNearestNode(
    x: number,
    y: number,
    nodes: WallNode[],
    maxDistance: number
): { node: WallNode; distance: number } | null {
    let best: { node: WallNode; distance: number } | null = null;
    for (const node of nodes) {
        const distance = Math.hypot(node.x - x, node.y - y);
        if (distance < maxDistance && (!best || distance < best.distance)) {
            best = { node, distance };
        }
    }
    return best;
}

/**
 * computeSnap - Pure snapping logic for wall drawing (safe to call from event
 * handlers / useFrame without triggering React re-renders)
 *
 * Priority:
 * 1. Node snap (magnetic to nearest existing corner)
 * 2. Axis alignment (horizontal/vertical with reference point)
 * 3. Grid snap (only free axes — never undoes axis lock)
 */
export function computeSnap(
    rawX: number,
    rawY: number,
    nodes: WallNode[],
    options: SnapOptions = {}
): SnapResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    let x = rawX;
    let y = rawY;
    let snappedToNode: WallNode | null = null;
    let isAxisAligned = false;
    let snapType: SnapResult['snapType'] = 'none';
    let axisLockedX = false;
    let axisLockedY = false;

    // 1. Node Snap — nearest corner wins (not first match)
    const near = findNearestNode(rawX, rawY, nodes, opts.nodeSnapRadius);
    if (near) {
        x = near.node.x;
        y = near.node.y;
        snappedToNode = near.node;
        snapType = 'node';
    }

    // 2. Axis Alignment (if reference point exists and not snapped to node)
    if (!snappedToNode && opts.referencePoint) {
        const ref = opts.referencePoint;
        const dx = Math.abs(rawX - ref.x);
        const dy = Math.abs(rawY - ref.y);

        // Horizontal alignment (same Y)
        if (dy < opts.axisSnapThreshold && dx > opts.axisSnapThreshold) {
            y = ref.y;
            axisLockedY = true;
            isAxisAligned = true;
            snapType = 'axis';
        }
        // Vertical alignment (same X)
        else if (dx < opts.axisSnapThreshold && dy > opts.axisSnapThreshold) {
            x = ref.x;
            axisLockedX = true;
            isAxisAligned = true;
            snapType = 'axis';
        }
    }

    // 3. Grid Snap — skip axes already locked by node/axis snap
    if (!snappedToNode) {
        const gridSize = opts.gridSize;
        if (!axisLockedX) {
            x = Math.round(x / gridSize) * gridSize;
        }
        if (!axisLockedY) {
            y = Math.round(y / gridSize) * gridSize;
        }
        // After grid, re-check node snap (grid may have landed on a corner)
        const afterGrid = findNearestNode(x, y, nodes, opts.nodeSnapRadius * 0.75);
        if (afterGrid) {
            x = afterGrid.node.x;
            y = afterGrid.node.y;
            snappedToNode = afterGrid.node;
            snapType = 'node';
            isAxisAligned = false;
        } else if (snapType === 'none') {
            snapType = 'grid';
        }
    }

    return { x, y, snappedToNode, isAxisAligned, snapType };
}

/**
 * useSnapSystem - Memoized hook wrapper around computeSnap
 */
export function useSnapSystem(
    rawX: number,
    rawY: number,
    nodes: WallNode[],
    options: SnapOptions = {}
): SnapResult {
    return useMemo(
        () => computeSnap(rawX, rawY, nodes, options),
        [rawX, rawY, nodes, options.gridSize, options.nodeSnapRadius, options.axisSnapThreshold, options.referencePoint?.x, options.referencePoint?.y]
    );
}

/**
 * findNearestEdge - Find the nearest edge to a point (for auto-split)
 */
export function findNearestEdge(
    x: number,
    y: number,
    edges: { id: string; startNodeId: string; endNodeId: string }[],
    nodes: WallNode[],
    maxDistance: number = 0.3
): { edgeId: string; t: number; distance: number } | null {
    let nearest: { edgeId: string; t: number; distance: number } | null = null;

    for (const edge of edges) {
        const startNode = nodes.find(n => n.id === edge.startNodeId);
        const endNode = nodes.find(n => n.id === edge.endNodeId);
        if (!startNode || !endNode) continue;

        const { distance, t } = pointToSegmentDistance(
            x, y,
            startNode.x, startNode.y,
            endNode.x, endNode.y
        );

        if (distance < maxDistance && (!nearest || distance < nearest.distance)) {
            nearest = { edgeId: edge.id, t, distance };
        }
    }

    return nearest;
}

/**
 * Calculate distance from point (px, py) to line segment (ax, ay) - (bx, by)
 * Returns distance and t parameter (0-1 along segment)
 */
function pointToSegmentDistance(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number
): { distance: number; t: number } {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        return { distance: Math.hypot(px - ax, py - ay), t: 0 };
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const distance = Math.hypot(px - closestX, py - closestY);

    return { distance, t };
}
