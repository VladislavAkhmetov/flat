import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { v4 as uuidv4 } from 'uuid';
import * as THREE from 'three';
import { FurnitureRenderer } from './FurniturePrimitives';

export const FurniturePlacer: React.FC = () => {
    const editorMode = useStore((state) => state.editorMode);
    const activeCatalogId = useStore((state) => state.activeCatalogId);
    const addObject = useStore((state) => state.addObject);
    const sceneWalls = useStore((state) => state.scene.walls);

    // Use refs for performance (no re-renders)
    const userRotRef = useRef<number>(0);
    const targetPosRef = useRef<{ x: number, z: number } | null>(null);
    const currentPosRef = useRef<{ x: number, z: number }>({ x: 0, z: 0 });
    const rotRef = useRef<number>(0);
    const ghostGroupRef = useRef<THREE.Group>(null);

    const catalogItem = FURNITURE_CATALOG.find(c => c.id === activeCatalogId);
    const { camera, gl } = useThree();

    // Create raycaster and plane once
    const raycasterRef = useRef(new THREE.Raycaster());
    const groundPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const pointerRef = useRef(new THREE.Vector2());
    const intersectPointRef = useRef(new THREE.Vector3());

    // Global mouse tracking via DOM events
    useEffect(() => {
        if (editorMode !== 'furniture' || !catalogItem) return;

        const canvas = gl.domElement;

        const handleMouseMove = (event: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();

            // Convert to normalized device coordinates (-1 to 1)
            pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            // Set up raycaster from camera
            raycasterRef.current.setFromCamera(pointerRef.current, camera);

            // Intersect with ground plane
            if (raycasterRef.current.ray.intersectPlane(groundPlaneRef.current, intersectPointRef.current)) {
                let newX = intersectPointRef.current.x;
                let newZ = intersectPointRef.current.z;
                let newRot = userRotRef.current;

                // Wall Snapping - snap to wall EDGE, not center
                const snapDist = 0.3;
                let snapped = false;

                for (const wall of sceneWalls) {
                    const { a, b } = wall;
                    const wallThickness = wall.thickness || 0.15;
                    const halfThick = wallThickness / 2;

                    // Wall direction and normal
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len === 0) continue;

                    // Normal vector (perpendicular to wall)
                    const nx = -dy / len;
                    const ny = dx / len;

                    // Project point onto wall line
                    const l2 = len * len;
                    let t = ((newX - a.x) * dx + (newZ - a.y) * dy) / l2;
                    t = Math.max(0, Math.min(1, t));
                    const projX = a.x + t * dx;
                    const projZ = a.y + t * dy;

                    // Distance to wall center line
                    const dist = Math.sqrt((newX - projX) ** 2 + (newZ - projZ) ** 2);

                    if (dist < snapDist + halfThick) {
                        // Determine which side of wall the point is on
                        const side = (newX - projX) * nx + (newZ - projZ) * ny;
                        const sideSign = side >= 0 ? 1 : -1;

                        // Snap to wall EDGE (offset by half thickness)
                        newX = projX + nx * halfThick * sideSign;
                        newZ = projZ + ny * halfThick * sideSign;

                        const wallAngle = Math.atan2(dy, dx);
                        newRot = -wallAngle; // Align with wall
                        snapped = true;
                        break;
                    }
                }

                if (!snapped) {
                    const snapIncrement = Math.PI / 2;
                    newRot = Math.round(userRotRef.current / snapIncrement) * snapIncrement;
                }

                // Update target position
                targetPosRef.current = { x: newX, z: newZ };
                rotRef.current = newRot;
            }
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }, [editorMode, catalogItem, camera, gl.domElement, sceneWalls]);

    // R key rotation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'r') {
                userRotRef.current += Math.PI / 2;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Smooth animation using useFrame
    useFrame(() => {
        if (!targetPosRef.current || !ghostGroupRef.current) return;

        const lerp = 0.3;

        currentPosRef.current.x += (targetPosRef.current.x - currentPosRef.current.x) * lerp;
        currentPosRef.current.z += (targetPosRef.current.z - currentPosRef.current.z) * lerp;

        ghostGroupRef.current.position.set(currentPosRef.current.x, 0.1, currentPosRef.current.z);
        ghostGroupRef.current.rotation.y = rotRef.current;
    });

    if (editorMode !== 'furniture' || !catalogItem) return null;

    const handleClick = () => {
        if (!targetPosRef.current) return;

        const newId = uuidv4();

        addObject({
            id: newId,
            catalogId: activeCatalogId,
            pos: { x: targetPosRef.current.x, y: 0, z: targetPosRef.current.z },
            rot: rotRef.current,
            scale: { x: 1, y: 1, z: 1 }
        });

        // Auto-select the placed object and switch to edit mode
        useStore.getState().setActiveObjectId(newId);
        useStore.getState().setActiveCatalogId(null);
        useStore.getState().setEditorMode('view');
    };

    return (
        <group>
            {/* Click capture */}
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.05, 0]}
                onClick={handleClick}
            >
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* Ghost Preview */}
            <group ref={ghostGroupRef} position={[0, 0.1, 0]}>
                <FurnitureRenderer
                    id={catalogItem.id}
                    width={catalogItem.dimensions.width}
                    height={catalogItem.dimensions.height}
                    depth={catalogItem.dimensions.depth}
                    color={catalogItem.color}
                />
                <Html position={[0, catalogItem.dimensions.height + 0.3, 0]} center>
                    <div className="bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none">
                        {catalogItem.dimensions.width} x {catalogItem.dimensions.depth} м
                    </div>
                </Html>
            </group>
        </group>
    );
};
