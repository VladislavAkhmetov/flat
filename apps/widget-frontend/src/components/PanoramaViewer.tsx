import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PanoramaData, PanoramaHotspot } from '@flat/shared';
import { Maximize2, Minimize2, Eye, Compass, ChevronLeft, MapPin } from 'lucide-react';

interface PanoramaViewerProps {
    panoramas: PanoramaData[];
    initialRoomId?: string;
    onClose?: () => void;
    onOpenLead?: () => void;
    ctaText?: string;
}

// Inner sphere component rendering the 360 equirectangular texture
const PanoSphere: React.FC<{
    url: string;
    hotspots: PanoramaHotspot[];
    onHotspotClick: (targetRoomId: string) => void;
    transitionOpacity: number;
}> = ({ url, hotspots, onHotspotClick, transitionOpacity }) => {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const { gl } = useThree();

    useEffect(() => {
        const loader = new THREE.TextureLoader();
        loader.load(
            url,
            (tex) => {
                tex.mapping = THREE.EquirectangularReflectionMapping;
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                setTexture(tex);
            },
            undefined,
            (err) => {
                console.error('[PanoramaViewer] Error loading pano texture:', url, err);
            }
        );

        return () => {
            if (texture) texture.dispose();
        };
    }, [url]);

    if (!texture) {
        return (
            <Html center>
                <div className="flex flex-col items-center justify-center text-white bg-slate-900/80 p-4 rounded-2xl backdrop-blur-md border border-slate-700">
                    <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-xs font-medium">Загрузка 360° панорамы...</p>
                </div>
            </Html>
        );
    }

    return (
        <group>
            {/* 360 Sky Sphere */}
            <mesh scale={[-1, 1, 1]} rotation={[0, -Math.PI / 2, 0]}>
                <sphereGeometry args={[500, 60, 40]} />
                <meshBasicMaterial
                    map={texture}
                    side={THREE.BackSide}
                    transparent={true}
                    opacity={transitionOpacity}
                />
            </mesh>

            {/* Directional 3D Hotspot markers */}
            {hotspots.map((hs, idx) => {
                // Convert yaw/pitch to 3D sphere coordinate
                const yawRad = THREE.MathUtils.degToRad(hs.yaw);
                const pitchRad = THREE.MathUtils.degToRad(hs.pitch || 0);
                const radius = 25; // Marker distance from center

                const x = radius * Math.sin(yawRad) * Math.cos(pitchRad);
                const y = radius * Math.sin(pitchRad);
                const z = radius * Math.cos(yawRad) * Math.cos(pitchRad);

                return (
                    <group key={idx} position={[x, y, z]}>
                        <Html center distanceFactor={15}>
                            <button
                                onClick={() => onHotspotClick(hs.targetRoomId)}
                                className="group flex items-center gap-2 bg-slate-950/80 hover:bg-amber-500 text-white hover:text-slate-950 px-3.5 py-2 rounded-full border border-white/20 hover:border-amber-400 backdrop-blur-md shadow-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 cursor-pointer whitespace-nowrap"
                            >
                                <div className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 group-hover:bg-slate-950 group-hover:text-amber-400 flex items-center justify-center font-bold text-xs shadow">
                                    ➔
                                </div>
                                <span className="text-xs font-semibold tracking-wide pr-1">
                                    {hs.targetRoomName || 'Перейти в комнату'}
                                </span>
                            </button>
                        </Html>
                    </group>
                );
            })}
        </group>
    );
};

export const PanoramaViewer: React.FC<PanoramaViewerProps> = ({
    panoramas,
    initialRoomId,
    onClose,
    onOpenLead,
    ctaText
}) => {
    const [currentRoomId, setCurrentRoomId] = useState<string>(
        initialRoomId || (panoramas.length > 0 ? panoramas[0].id : '')
    );
    const [transitionOpacity, setTransitionOpacity] = useState(1.0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const currentPano = useMemo(() => {
        return panoramas.find((p) => p.id === currentRoomId) || panoramas[0];
    }, [panoramas, currentRoomId]);

    const handleRoomSelect = (roomId: string) => {
        if (roomId === currentRoomId) return;
        // Smooth fade animation
        setTransitionOpacity(0.1);
        setTimeout(() => {
            setCurrentRoomId(roomId);
            setTransitionOpacity(1.0);
        }, 250);
    };

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch((err) => console.error(err));
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch((err) => console.error(err));
            setIsFullscreen(false);
        }
    };

    if (!panoramas || panoramas.length === 0 || !currentPano) {
        return (
            <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center text-white p-6">
                <p className="text-sm font-medium mb-4">Панорамы для этой квартиры ещё не запечены.</p>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold"
                    >
                        Вернуться в 3D
                    </button>
                )}
            </div>
        );
    }

    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const panoUrl = currentPano.url || `${API_BASE}/uploads/baked/${currentPano.file}`;

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-slate-950 select-none overflow-hidden"
        >
            {/* Top Toolbar cleanly placed below App header */}
            <div className="absolute top-20 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-2xl pointer-events-auto shadow-lg text-white">
                    <span className="text-amber-500 text-lg">📸</span>
                    <div>
                        <h4 className="text-xs font-bold tracking-wide">{currentPano.name}</h4>
                        <p className="text-[10px] text-slate-400 font-light">360° Виртуальный Тур</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 pointer-events-auto">
                    {onOpenLead && (
                        <button
                            onClick={onOpenLead}
                            className="px-4 py-2 rounded-xl flat-btn-primary font-bold text-xs shadow-lg active:scale-95 flex items-center gap-1.5 transition-all hover:scale-105"
                        >
                            <span>📋</span>
                            <span>{ctaText || 'Забронировать'}</span>
                        </button>
                    )}
                    <button
                        onClick={toggleFullscreen}
                        className="w-10 h-10 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white flex items-center justify-center border border-slate-800 shadow-lg transition-all active:scale-95"
                        title="Полноэкранный режим"
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                </div>
            </div>

            {/* Three.js Canvas for 360 Sphere */}
            <Canvas
                camera={{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 0.1] }}
                className="w-full h-full"
            >
                <OrbitControls
                    enableZoom={true}
                    enablePan={false}
                    rotateSpeed={-0.35}
                    zoomSpeed={0.5}
                    minDistance={0.1}
                    maxDistance={2.0}
                    maxPolarAngle={Math.PI - 0.05}
                    minPolarAngle={0.05}
                />
                <PanoSphere
                    url={panoUrl}
                    hotspots={currentPano.hotspots || []}
                    onHotspotClick={handleRoomSelect}
                    transitionOpacity={transitionOpacity}
                />
            </Canvas>

            {/* Bottom Room Selector Carousel */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 p-2 rounded-2xl shadow-2xl max-w-[90vw] overflow-x-auto">
                <div className="flex items-center gap-1 px-2 text-slate-400 text-xs font-medium">
                    <MapPin size={14} className="text-amber-500" />
                    <span>Комнаты:</span>
                </div>
                {panoramas.map((p) => {
                    const isSelected = p.id === currentRoomId;
                    return (
                        <button
                            key={p.id}
                            onClick={() => handleRoomSelect(p.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 whitespace-nowrap flex items-center gap-2 ${
                                isSelected
                                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 scale-105'
                                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                            }`}
                        >
                            <span>{p.name}</span>
                        </button>
                    );
                })}
            </div>

            {/* Helper Hint */}
            <div className="absolute bottom-6 right-6 z-20 hidden md:flex items-center gap-2 bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 px-3 py-1.5 rounded-xl text-[10px] text-slate-400 pointer-events-none">
                <span>🔄 Зажмите мышь для вращения обзора</span>
            </div>
        </div>
    );
};
