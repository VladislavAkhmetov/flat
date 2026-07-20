import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Euler } from 'three';
import { useStore } from '../store';
import { PointerLockControls } from '@react-three/drei';

export const FirstPersonController: React.FC = () => {
    const mode = useStore((state) => state.scene.camera.mode);
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);

    const spawnObject = useStore((state) => 
        state.scene.objects.find(o => o.catalogId === 'spawn_point')
    );

    // Dynamically position and orient camera on spawn point when walk mode starts
    useEffect(() => {
        if (mode === 'walk') {
            if (spawnObject) {
                camera.position.set(spawnObject.pos.x, 1.6, spawnObject.pos.z);
                camera.rotation.set(0, spawnObject.rot, 0, 'YXZ');
            } else {
                camera.position.set(0, 1.6, 0);
                camera.rotation.set(0, 0, 0, 'YXZ');
            }
        }
    }, [mode, spawnObject, camera]);

    // Basic movement logic
    const moveForward = useRef(false);
    const moveBackward = useRef(false);
    const moveLeft = useRef(false);
    const moveRight = useRef(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW': moveForward.current = true; break;
                case 'ArrowLeft':
                case 'KeyA': moveLeft.current = true; break;
                case 'ArrowDown':
                case 'KeyS': moveBackward.current = true; break;
                case 'ArrowRight':
                case 'KeyD': moveRight.current = true; break;
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowUp':
                case 'KeyW': moveForward.current = false; break;
                case 'ArrowLeft':
                case 'KeyA': moveLeft.current = false; break;
                case 'ArrowDown':
                case 'KeyS': moveBackward.current = false; break;
                case 'ArrowRight':
                case 'KeyD': moveRight.current = false; break;
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    useFrame((state, delta) => {
        if (mode !== 'walk' || !controlsRef.current?.isLocked) return;

        // Simple movement without physics for MVP
        const speed = 5.0 * delta;
        const controls = controlsRef.current;

        if (moveForward.current) controls.moveForward(speed);
        if (moveBackward.current) controls.moveForward(-speed);
        if (moveRight.current) controls.moveRight(speed);
        if (moveLeft.current) controls.moveRight(-speed);

        // Fix height to 1.6m (eye level)
        state.camera.position.y = 1.6;
    });

    if (mode !== 'walk') return null;

    return (
        <PointerLockControls
            ref={controlsRef}
            selector="#root" // Lock pointer on click
        />
    );
};
