import { useMemo } from 'react';
import { WallNode } from '@flat/shared';

interface SnapResult {
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
    nodeSnapRadius: 0.3,
    axisSnapThreshold: 0.15,
    referencePoint: null,
};

/**
 * useSnapSystem - Snapping logic for wall drawing
 * 
 * Priority:
 * 1. Node snap (magnetic to existing corners)
 * 2. Axis alignment (horizontal/vertical with reference point)
 * 3. Grid snap (0.1m default)
 */
export function useSnapSystem(
    rawX: number,
    rawY: number,
    nodes: WallNode[],
    options: SnapOptions = {}
): SnapResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return useMemo(() => {
        let x = rawX;
        let y = rawY;
        let snappedToNode: WallNode | null = null;
        let isAxisAligned = false;
        let snapType: SnapResult['snapType'] = 'none';

        // 1. Node Snap (Highest Priority)
        for (const node of nodes) {
            const dist = Math.hypot(node.x - rawX, node.y - rawY);
            if (dist < opts.nodeSnapRadius) {
                x = node.x;
                y = node.y;
                snappedToNode = node;
                snapType = 'node';
                break;
            }
        }

        // 2. Axis Alignment (if reference point exists and not snapped to node)
        if (!snappedToNode && opts.referencePoint) {
            const ref = opts.referencePoint;
            const dx = Math.abs(rawX - ref.x);
            const dy = Math.abs(rawY - ref.y);

            // Horizontal alignment (same Y)
            if (dy < opts.axisSnapThreshold && dx > opts.axisSnapThreshold) {
                y = ref.y;
                isAxisAligned = true;
                snapType = 'axis';
            }
            // Vertical alignment (same X)
            else if (dx < opts.axisSnapThreshold && dy > opts.axisSnapThreshold) {
                x = ref.x;
                isAxisAligned = true;
                snapType = 'axis';
            }
        }

        // 3. Grid Snap (if not snapped to node)
        if (!snappedToNode) {
            const gridSize = opts.gridSize;
            x = Math.round(x / gridSize) * gridSize;
            y = Math.round(y / gridSize) * gridSize;
            if (snapType === 'none') {
                snapType = 'grid';
            }
        }

        return { x, y, snappedToNode, isAxisAligned, snapType };
    }, [rawX, rawY, nodes, opts.gridSize, opts.nodeSnapRadius, opts.axisSnapThreshold, opts.referencePoint]);
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

        // Calculate distance from point to line segment
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
        // Segment is a point
        return { distance: Math.hypot(px - ax, py - ay), t: 0 };
    }

    // Project point onto line
    let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;
    const distance = Math.hypot(px - closestX, py - closestY);

    return { distance, t };
}
