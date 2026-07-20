import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store';
import { Wall } from '@flat/shared';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { Box, Html } from '@react-three/drei';
import * as THREE from 'three';

interface WallSegmentProps {
    wall: Wall;
    editorMode: string;
    cameraMode: string;
    isActive: boolean;
    onSelect: (id: string) => void;
    onUpdate: (id: string, updates: Partial<Wall>) => void;
    setIsDragging: (isDragging: boolean) => void;
}

const WallSegment: React.FC<WallSegmentProps> = ({ wall, editorMode, cameraMode, isActive, onSelect, onUpdate, setIsDragging }) => {
    const { gl, raycaster } = useThree(); // Get raycaster from useThree
    const [isHovered, setIsHovered] = useState(false);
    const [dragMode, setDragMode] = useState<'wall' | 'endpointA' | 'endpointB' | null>(null);

    // Refs for drag state
    const dragStartRef = useRef<{ x: number, z: number } | null>(null);
    const wallStartRef = useRef<{ x: number, y: number } | null>(null);
    const wallEndRef = useRef<{ x: number, y: number } | null>(null);

    // Sync drag state with global store to disable controls
    useEffect(() => {
        setIsDragging(!!dragMode);
    }, [dragMode, setIsDragging]);

    // Geometry calculation
    const dx = wall.b.x - wall.a.x;
    const dy = wall.b.y - wall.a.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const midX = (wall.a.x + wall.b.x) / 2;
    const midY = (wall.a.y + wall.b.y) / 2;

    const thickness = wall.thickness || 0.15;
    const height = cameraMode === '3d' || cameraMode === 'walk' ? (wall.height || 2.7) : 2.5;

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (!dragMode || !dragStartRef.current) return;
        e.stopPropagation();

        // Calculate intersection with ground plane (y=0) for stable dragging
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        // use local raycaster from useThree which tracks mouse
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        if (!target) return; // Ray didn't hit floor

        if (dragMode === 'wall' && wallStartRef.current && wallEndRef.current) {
            const deltaX = target.x - dragStartRef.current.x;
            const deltaZ = target.z - dragStartRef.current.z;
            onUpdate(wall.id, {
                a: { x: wallStartRef.current.x + deltaX, y: wallStartRef.current.y + deltaZ },
                b: { x: wallEndRef.current.x + deltaX, y: wallEndRef.current.y + deltaZ }
            });
        } else if (dragMode === 'endpointA') {
            onUpdate(wall.id, { a: { x: target.x, y: target.z } });
        } else if (dragMode === 'endpointB') {
            onUpdate(wall.id, { b: { x: target.x, y: target.z } });
        }
    };

    const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (dragMode) {
            setIsDragging(false);
            setDragMode(null);
            dragStartRef.current = null;
            gl.domElement.releasePointerCapture(e.pointerId);
        }
    };

    const handleWallPointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (editorMode === 'walls') return;
        e.stopPropagation();
        onSelect(wall.id);

        setIsDragging(true);
        gl.domElement.setPointerCapture(e.pointerId);
        setDragMode('wall');

        // Initial hit on floor
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        // If target is null (horizon), fallback to e.point (which is on wall)
        const start = target || e.point;

        dragStartRef.current = { x: start.x, z: start.z };
        wallStartRef.current = { ...wall.a };
        wallEndRef.current = { ...wall.b };
    };

    // Wrapper for endpoints to use same floor logic
    const handleEndpointDown = (e: ThreeEvent<PointerEvent>, mode: 'endpointA' | 'endpointB') => {
        e.stopPropagation();
        setIsDragging(true);
        gl.domElement.setPointerCapture(e.pointerId);
        setDragMode(mode);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        const start = target || e.point;
        dragStartRef.current = { x: start.x, z: start.z };
    };

    // Color Logic - Light colors for realistic appearance (like CAD programs)
    const baseColor = wall.kind === 'bearing' ? '#f5f5f4' : '#e7e5e4'; // Light stone/cream
    const activeColor = '#3b82f6'; // Blue
    const hoverColor = '#60a5fa'; // Light Blue

    let color = baseColor;
    if (isActive) color = activeColor;
    else if (isHovered && editorMode !== 'walls') color = hoverColor;

    return (
        <group position={[midX, height / 2, midY]} rotation={[0, -angle, 0]}>
            {/* Wall Body */}
            <Box
                args={[length, height, thickness]}
                onPointerOver={(e) => { e.stopPropagation(); setIsHovered(true); document.body.style.cursor = 'pointer'; }}
                onPointerOut={(e) => { e.stopPropagation(); setIsHovered(false); document.body.style.cursor = 'auto'; }}
                onPointerDown={handleWallPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={(e) => e.stopPropagation()}
            >
                <meshStandardMaterial color={color} />
            </Box>

            {/* Selection Outline */}
            {isActive && (
                <Box args={[length + 0.05, height + 0.05, thickness + 0.05]} position={[0, 0, 0]}>
                    <meshBasicMaterial color="#2563eb" wireframe />
                </Box>
            )}

            {/* Dimension Label */}
            {isActive && (
                <Html position={[0, height / 2 + 0.5, 0]} center>
                    <div style={{
                        background: '#1e40af',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}>
                        {length.toFixed(2)} м
                    </div>
                </Html>
            )}

            {/* Endpoint A Handle */}
            {isActive && (
                <mesh position={[-length / 2, -height / 2 + 0.1, 0]} onPointerDown={(e) => handleEndpointDown(e, 'endpointA')} onPointerUp={handlePointerUp} onPointerMove={handlePointerMove}>
                    <cylinderGeometry args={[0.2, 0.2, 0.2]} />
                    <meshBasicMaterial color="#ef4444" />
                </mesh>
            )}

            {/* Endpoint B Handle */}
            {isActive && (
                <mesh position={[length / 2, -height / 2 + 0.1, 0]} onPointerDown={(e) => handleEndpointDown(e, 'endpointB')} onPointerUp={handlePointerUp} onPointerMove={handlePointerMove}>
                    <cylinderGeometry args={[0.2, 0.2, 0.2]} />
                    <meshBasicMaterial color="#ef4444" />
                </mesh>
            )}
        </group>
    );
};

export const WallLayer: React.FC = () => {
    const walls = useStore((state) => state.scene.walls);
    const editorMode = useStore((state) => state.editorMode);
    const cameraMode = useStore((state) => state.scene.camera.mode);

    const activeWallId = useStore((state) => state.activeWallId);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const updateWall = useStore((state) => state.updateWall);
    const deleteWall = useStore((state) => state.deleteWall);
    const setIsDragging = useStore((state) => state.setIsDragging);

    // Global Delete Key Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Delete key removes active wall
            if (e.key === 'Delete' && activeWallId && editorMode !== 'walls') {
                deleteWall(activeWallId);
                setActiveWallId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeWallId, deleteWall, setActiveWallId, editorMode]);

    // Clear selection when clicking outside (handled by SceneContainer usually, 
    // but we can rely on clicking the floor to clear if implemented there. 
    // Currently clicks propagate unless stopped. 
    // We can add a click handler on the group if we want bubble up?)

    return (
        <group>
            {walls.map(wall => (
                <WallSegment
                    key={wall.id}
                    wall={wall}
                    editorMode={editorMode}
                    cameraMode={cameraMode}
                    isActive={wall.id === activeWallId}
                    onSelect={setActiveWallId}
                    onUpdate={updateWall}
                    setIsDragging={setIsDragging}
                />
            ))}
        </group>
    );
};
