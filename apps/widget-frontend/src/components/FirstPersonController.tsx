import React, { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import * as THREE from 'three';

const WALK_SPEED = 2.2;     // m/s
const SPRINT_SPEED = 3.8;   // m/s
const BODY_RADIUS = 0.3;    // collision radius

export type PostureMode = 'standing' | 'sitting' | 'lying';

interface FirstPersonControllerProps {
    active?: boolean;
    onPostureChange?: (posture: PostureMode, objectName?: string) => void;
}

export const FirstPersonController: React.FC<FirstPersonControllerProps> = ({
    active = true,
    onPostureChange,
}) => {
    const { camera, gl } = useThree();
    const sceneObjects = useStore((state) => state.scene.objects);
    const nodes = useStore((state) => state.scene.nodes);
    const edges = useStore((state) => state.scene.edges);
    const openings = useStore((state) => state.scene.openings);

    const [posture, setPosture] = useState<PostureMode>('standing');
    const [currentFurnitureName, setCurrentFurnitureName] = useState<string>('');

    // Movement flags
    const keys = useRef<{ [code: string]: boolean }>({});
    const isLocked = useRef(false);
    const isDragging = useRef(false);
    const prevMousePos = useRef({ x: 0, y: 0 });

    // Euler camera rotation
    const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const targetPos = useRef<THREE.Vector3 | null>(null);
    const currentEyeHeight = useRef(1.6);

    // Initial positioning
    useEffect(() => {
        if (!active) return;

        // Find spawn point or entrance door
        const spawn = sceneObjects.find((o) => o.catalogId === 'spawn_point');
        if (spawn) {
            camera.position.set(spawn.pos.x, 1.6, spawn.pos.z);
            camera.lookAt(spawn.pos.x, 1.6, spawn.pos.z + 2.0);
        } else {
            // Find entrance door
            let entranceDoor: any = null;
            let entranceEdge: any = null;

            const doorOpenings = openings.filter((o) => (o.kind as any) === 'door' || (o.kind as any) === 'opening' || o.kind === 'balcony_door');
            if (doorOpenings.length > 0) {
                entranceDoor = doorOpenings[0];
                entranceEdge = edges.find((e) => e.id === entranceDoor.wallId);
            }

            if (entranceDoor && entranceEdge) {
                const n1 = nodes.find((n) => n.id === entranceEdge.startNodeId);
                const n2 = nodes.find((n) => n.id === entranceEdge.endNodeId);
                if (n1 && n2) {
                    const t = entranceDoor.t ?? 0.5;
                    const doorX = n1.x + t * (n2.x - n1.x);
                    const doorY = n1.y + t * (n2.y - n1.y);

                    const avgX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
                    const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
                    const toCenterX = avgX - doorX;
                    const toCenterY = avgY - doorY;
                    const len = Math.hypot(toCenterX, toCenterY) || 1.0;
                    const dirX = toCenterX / len;
                    const dirY = toCenterY / len;

                    // Stand 0.85m in front of the door at eye level looking into the apartment
                    const spawnX = doorX + dirX * 0.85;
                    const spawnZ = doorY + dirY * 0.85;
                    camera.position.set(spawnX, 1.6, spawnZ);
                    camera.lookAt(spawnX + dirX * 3.0, 1.6, spawnZ + dirY * 3.0);
                } else {
                    camera.position.set(0, 1.6, -1.8);
                    camera.lookAt(0, 1.6, 1.0);
                }
            } else if (nodes.length > 0) {
                const minY = Math.min(...nodes.map((n) => n.y));
                const avgX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
                camera.position.set(avgX, 1.6, minY + 0.85);
                camera.lookAt(avgX, 1.6, minY + 3.0);
            } else {
                camera.position.set(0, 1.6, -2.0);
                camera.lookAt(0, 1.6, 2.0);
            }
        }

        euler.current.setFromQuaternion(camera.quaternion, 'YXZ');
        currentEyeHeight.current = 1.6;
        setPosture('standing');
    }, [active, nodes, edges, openings, sceneObjects]);

    // Keyboard event listeners
    useEffect(() => {
        if (!active) return;

        const onKeyDown = (e: KeyboardEvent) => {
            keys.current[e.code] = true;

            // Stand up on movement keys or Escape
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Escape'].includes(e.code)) {
                if (posture !== 'standing') {
                    standUp();
                }
            }

            // Interact key (E or F) to sit/lie on nearest furniture
            if (e.code === 'KeyE' || e.code === 'KeyF') {
                interactWithNearestFurniture();
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            keys.current[e.code] = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [active, posture, sceneObjects]);

    // Pointer lock & drag-look event listeners
    useEffect(() => {
        if (!active) return;
        const dom = gl.domElement;

        const onMouseDown = (e: MouseEvent) => {
            if (e.button === 0) {
                // Left click: lock pointer for FPS look
                dom.requestPointerLock?.();
                isDragging.current = true;
                prevMousePos.current = { x: e.clientX, y: e.clientY };
            }
        };

        const onMouseUp = () => {
            isDragging.current = false;
        };

        const onMouseMove = (e: MouseEvent) => {
            if (document.pointerLockElement === dom) {
                // Pointer locked
                const movementX = e.movementX || 0;
                const movementY = e.movementY || 0;

                euler.current.y -= movementX * 0.0022;
                euler.current.x -= movementY * 0.0022;
                euler.current.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.current.x));
                camera.quaternion.setFromEuler(euler.current);
            } else if (isDragging.current) {
                // Dragging fallback without pointer lock
                const dx = e.clientX - prevMousePos.current.x;
                const dy = e.clientY - prevMousePos.current.y;
                prevMousePos.current = { x: e.clientX, y: e.clientY };

                euler.current.y -= dx * 0.003;
                euler.current.x -= dy * 0.003;
                euler.current.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, euler.current.x));
                camera.quaternion.setFromEuler(euler.current);
            }
        };

        const onPointerLockChange = () => {
            isLocked.current = document.pointerLockElement === dom;
        };

        dom.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mousemove', onMouseMove);
        document.addEventListener('pointerlockchange', onPointerLockChange);

        return () => {
            dom.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('pointerlockchange', onPointerLockChange);
            if (document.pointerLockElement === dom) {
                document.exitPointerLock?.();
            }
        };
    }, [active, gl, camera]);

    // Sit / Lie down on furniture logic
    const sitOnObject = (obj: any, label: string) => {
        const targetHeight = 1.05; // Sitting eye-level
        const targetX = obj.pos.x;
        const targetZ = obj.pos.z;
        targetPos.current = new THREE.Vector3(targetX, targetHeight, targetZ);
        currentEyeHeight.current = targetHeight;
        setPosture('sitting');
        setCurrentFurnitureName(label);
        onPostureChange?.('sitting', label);
    };

    const lieOnBed = (obj: any, label: string) => {
        const targetHeight = 0.7; // Lying eye-level
        const targetX = obj.pos.x;
        const targetZ = obj.pos.z;
        targetPos.current = new THREE.Vector3(targetX, targetHeight, targetZ);
        currentEyeHeight.current = targetHeight;
        setPosture('lying');
        setCurrentFurnitureName(label);
        onPostureChange?.('lying', label);
    };

    const standUp = () => {
        currentEyeHeight.current = 1.6;
        targetPos.current = null;
        setPosture('standing');
        setCurrentFurnitureName('');
        onPostureChange?.('standing');
    };

    const interactWithNearestFurniture = () => {
        const camPos = camera.position;
        let nearest: any = null;
        let minDist = 2.5; // Interaction range

        for (const obj of sceneObjects) {
            const dist = Math.hypot(camPos.x - obj.pos.x, camPos.z - obj.pos.z);
            if (dist < minDist) {
                minDist = dist;
                nearest = obj;
            }
        }

        if (!nearest) return;

        const cat = nearest.catalogId.toLowerCase();
        if (cat.includes('bed')) {
            lieOnBed(nearest, 'Кровать');
        } else if (cat.includes('sofa')) {
            sitOnObject(nearest, 'Диван');
        } else if (cat.includes('chair') || cat.includes('armchair')) {
            sitOnObject(nearest, 'Кресло');
        }
    };

    // Frame update loop
    useFrame((_, delta) => {
        if (!active) return;

        // Smooth transition to sit/lie position
        if (targetPos.current) {
            camera.position.lerp(targetPos.current, 6 * delta);
            if (camera.position.distanceTo(targetPos.current) < 0.05) {
                targetPos.current = null;
            }
            return;
        }

        // Only walk when standing
        if (posture !== 'standing') {
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, currentEyeHeight.current, 8 * delta);
            return;
        }

        const isShift = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
        const speed = (isShift ? SPRINT_SPEED : WALK_SPEED) * delta;

        const moveVector = new THREE.Vector3();
        if (keys.current['KeyW'] || keys.current['ArrowUp']) moveVector.z -= 1;
        if (keys.current['KeyS'] || keys.current['ArrowDown']) moveVector.z += 1;
        if (keys.current['KeyA'] || keys.current['ArrowLeft']) moveVector.x -= 1;
        if (keys.current['KeyD'] || keys.current['ArrowRight']) moveVector.x += 1;

        if (moveVector.lengthSq() > 0) {
            moveVector.normalize();
            // Rotate moveVector by camera yaw
            const yaw = euler.current.y;
            const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

            const moveDir = new THREE.Vector3()
                .addScaledVector(forward, -moveVector.z)
                .addScaledVector(right, moveVector.x)
                .normalize();

            camera.position.addScaledVector(moveDir, speed);
        }

        // Keep eye level at 1.6m
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.6, 10 * delta);
    });

    return null;
};
