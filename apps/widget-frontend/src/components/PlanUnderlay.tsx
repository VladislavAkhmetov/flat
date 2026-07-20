import React, { Suspense } from 'react';
import { useStore } from '../store';
import { useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';

const PlanTexture: React.FC<{ url: string; width: number; height: number; opacity: number }> = ({ url, width, height, opacity }) => {
  const texture = useTexture(url);
  // Ensure color space is correct
  texture.colorSpace = THREE.SRGBColorSpace;
  console.log('[PlanUnderlay] Texture loaded via useTexture:', texture);

  return (
    <group>


      {/* Plan Texture Mesh */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={texture}
          transparent={true}
          opacity={opacity}
          side={THREE.FrontSide}
          roughness={0.9}
          metalness={0.1}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};

export const PlanUnderlay: React.FC = () => {
  const planImage = useStore((state) => state.scene.planImage);
  const planOpacity = useStore((state) => state.planOpacity);

  console.log('[PlanUnderlay] planImage from store:', planImage, 'type:', typeof planImage);

  // Handle both string URL and object with url property
  if (!planImage) {
    console.warn('[PlanUnderlay] No planImage');
    return null;
  }

  let url: string;
  let width = 10;
  let height = 10;

  if (typeof planImage === 'string') {
    url = planImage;
  } else if (typeof planImage === 'object' && planImage !== null && 'url' in planImage) {
    const planObj = planImage as any; // Type assertion for object with unknown shape
    url = planObj.url;
    width = planObj.width || 10;
    height = planObj.height || 10;
  } else {
    console.warn('[PlanUnderlay] Invalid planImage format');
    return null;
  }

  if (!url) {
    console.warn('[PlanUnderlay] No URL in planImage');
    return null;
  }

  return (
    <Suspense fallback={null}>
      <PlanTexture url={url} width={width} height={height} opacity={planOpacity} />
    </Suspense>
  );
};
