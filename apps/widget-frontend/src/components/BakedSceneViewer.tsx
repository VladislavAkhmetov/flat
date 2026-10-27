import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, Center, useTexture } from '@react-three/drei';
import { FirstPersonController } from './FirstPersonController';
import { useStore } from '../store';
import { Footprints, Rotate3d, Image as ImageIcon, Upload, Check } from 'lucide-react';
import * as THREE from 'three';

interface BakedSceneViewerProps {
    glbUrl: string;
    initialCameraMode?: 'orbit' | 'walk';
    onClose?: () => void;
    onOpenLead?: () => void;
    ctaText?: string;
}

const WindowBackdropDome: React.FC<{ backdrop: string; customUrl?: string }> = ({ backdrop, customUrl }) => {
    const url = customUrl || `/backgrounds/${backdrop}.jpg`;
    const texture = useTexture(url);

    useEffect(() => {
        if (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
        }
    }, [texture]);

    return (
        <mesh position={[0, 6, 0]}>
            <cylinderGeometry args={[32, 32, 22, 64, 1, true]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
        </mesh>
    );
};

const BakedModel: React.FC<{ url: string; cameraMode: 'orbit' | 'walk' }> = ({ url, cameraMode }) => {
    const gltf = useGLTF(url);

    useEffect(() => {
        if (!gltf.scene) return;
        gltf.scene.traverse((child) => {
            if ((child as THREE.Light).isLight) {
                (child as THREE.Light).intensity = 0;
            }
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                if (mesh.name.toLowerCase().includes('ceiling')) {
                    mesh.visible = cameraMode === 'walk';
                }
                if (mesh.material) {
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach((m) => {
                        if (m instanceof THREE.MeshStandardMaterial) {
                            m.envMapIntensity = 0.25;
                        }
                    });
                }
            }
        });
    }, [gltf, cameraMode]);

    return <primitive object={gltf.scene} />;
};

export const BakedSceneViewer: React.FC<BakedSceneViewerProps> = ({ glbUrl, initialCameraMode = 'orbit', onOpenLead, ctaText }) => {
    const [cameraMode, setCameraMode] = useState<'orbit' | 'walk'>(initialCameraMode);
    const [posture, setPosture] = useState<'standing' | 'sitting' | 'lying'>('standing');
    const [furnitureName, setFurnitureName] = useState<string>('');
    const [isBackdropOpen, setIsBackdropOpen] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialCameraMode) {
            setCameraMode(initialCameraMode);
        }
    }, [initialCameraMode]);

    const windowBackdrop = useStore((state) => state.windowBackdrop);
    const customBackdropUrl = useStore((state) => state.customBackdropUrl);
    const setWindowBackdrop = useStore((state) => state.setWindowBackdrop);

    const handlePostureChange = (newPosture: 'standing' | 'sitting' | 'lying', name?: string) => {
        setPosture(newPosture);
        setFurnitureName(name || '');
    };

    const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const objectUrl = URL.createObjectURL(file);
        setWindowBackdrop('custom', objectUrl);
        setIsBackdropOpen(false);
    };

    const backdropPresets = [
        { id: 'city_day', label: 'Город', icon: '🏙️', desc: 'Дневной мегаполис' },
        { id: 'park_day', label: 'Парк', icon: '🌳', desc: 'Зелёный двор' },
        { id: 'sunset', label: 'Закат', icon: '🌅', desc: 'Золотой час' },
        { id: 'night_city', label: 'Ночь', icon: '🌃', desc: 'Огни ночного города' }
    ];

    return (
        <div className="relative w-full h-full bg-slate-950 select-none overflow-hidden">
            {/* Top Toolbar placed cleanly below App header (top-20) */}
            <div className="absolute top-20 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
                {/* Left Info Badge */}
                <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-4 py-2 rounded-2xl pointer-events-auto shadow-lg text-white">
                    <span className="text-amber-500 text-lg">✨</span>
                    <div>
                        <h4 className="text-xs font-bold tracking-wide">Запечённый 3D Обход</h4>
                        <p className="text-[10px] text-slate-400 font-light">
                            {cameraMode === 'orbit'
                                ? '3D Облёт: планировка сверху в разрезе'
                                : posture === 'standing'
                                    ? 'Режим от 1-го лица (глаза 1.6м)'
                                    : posture === 'sitting'
                                        ? `Сидите: ${furnitureName || 'мебель'}`
                                        : `Лежите: ${furnitureName || 'кровать'}`}
                        </p>
                    </div>
                </div>

                {/* Right Actions: Window View Selector & Camera Mode Toggle */}
                <div className="flex items-center gap-2 pointer-events-auto">
                    {/* Window View Selector Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsBackdropOpen(!isBackdropOpen)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-white rounded-xl text-xs font-medium border border-slate-800 shadow-lg transition-all active:scale-95"
                            title="Выбрать вид из окон"
                        >
                            <ImageIcon size={14} className="text-sky-400" />
                            <span>Вид из окон</span>
                            <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                {windowBackdrop === 'custom' ? 'Свой вид' : backdropPresets.find(p => p.id === windowBackdrop)?.label}
                            </span>
                        </button>

                        {isBackdropOpen && (
                            <div className="absolute right-0 top-12 w-64 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-2xl p-2.5 shadow-2xl z-40 text-white animate-fade-in">
                                <p className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                                    Панорама за окнами
                                </p>
                                <div className="space-y-1 mt-1">
                                    {backdropPresets.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => {
                                                setWindowBackdrop(preset.id as any);
                                                setIsBackdropOpen(false);
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                                                windowBackdrop === preset.id
                                                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                                                    : 'hover:bg-slate-800 text-slate-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{preset.icon}</span>
                                                <div className="text-left">
                                                    <p>{preset.label}</p>
                                                    <p className={`text-[10px] ${windowBackdrop === preset.id ? 'text-slate-800' : 'text-slate-400'}`}>{preset.desc}</p>
                                                </div>
                                            </div>
                                            {windowBackdrop === preset.id && <Check size={14} />}
                                        </button>
                                    ))}

                                    <div className="pt-2 border-t border-slate-800">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs font-semibold text-sky-400 transition-all border border-dashed border-sky-500/30"
                                        >
                                            <Upload size={14} />
                                            <span>Загрузить фото с этажа</span>
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleCustomImageUpload}
                                            className="hidden"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Camera Mode Switcher */}
                    <div className="flex bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-lg">
                        <button
                            onClick={() => setCameraMode('orbit')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                cameraMode === 'orbit'
                                    ? 'bg-amber-500 text-slate-950 shadow'
                                    : 'text-slate-300 hover:text-white'
                            }`}
                        >
                            <Rotate3d size={14} />
                            <span>3D Облёт</span>
                        </button>
                        <button
                            onClick={() => setCameraMode('walk')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                cameraMode === 'walk'
                                    ? 'bg-amber-500 text-slate-950 shadow'
                                    : 'text-slate-300 hover:text-white'
                            }`}
                        >
                            <Footprints size={14} />
                            <span>Обход (WASD)</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Viewport */}
            <Canvas
                shadows
                camera={{ fov: 48, position: [0, 11, 13] }}
                className="w-full h-full"
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 0.9,
                }}
            >
                {/* Soft, balanced architectural lighting */}
                <ambientLight intensity={0.45} />
                <directionalLight
                    position={[10, 16, 8]}
                    intensity={0.8}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-bias={-0.0002}
                />
                <directionalLight position={[-8, 10, -8]} intensity={0.3} />

                {/* 360° Window Backdrop Dome visible through windows only in First Person Walk mode */}
                {cameraMode === 'walk' && (
                    <Suspense fallback={null}>
                        <WindowBackdropDome
                            backdrop={windowBackdrop === 'custom' ? 'city_day' : windowBackdrop}
                            customUrl={customBackdropUrl}
                        />
                    </Suspense>
                )}

                <Suspense
                    fallback={
                        <Html center>
                            <div className="flex flex-col items-center justify-center text-white bg-slate-900/80 p-5 rounded-2xl backdrop-blur-md border border-slate-700 shadow-2xl">
                                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
                                <p className="text-xs font-medium">Загрузка чистового 3D файла...</p>
                            </div>
                        </Html>
                    }
                >
                    <Center top>
                        <BakedModel url={glbUrl} cameraMode={cameraMode} />
                    </Center>
                </Suspense>

                {cameraMode === 'orbit' ? (
                    <OrbitControls
                        makeDefault
                        enableDamping
                        dampingFactor={0.05}
                        maxPolarAngle={Math.PI / 2.2}
                        minDistance={3}
                        maxDistance={35}
                    />
                ) : (
                    <FirstPersonController
                        active={cameraMode === 'walk'}
                        onPostureChange={handlePostureChange}
                    />
                )}
            </Canvas>

            {/* Stand Up Overlay Button if Sitting/Lying */}
            {cameraMode === 'walk' && posture !== 'standing' && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/90 border border-amber-500/50 px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md text-white animate-fade-in">
                    <span className="text-lg">{posture === 'sitting' ? '🛋️' : '🛏️'}</span>
                    <div className="text-xs">
                        <p className="font-bold text-amber-400">
                            {posture === 'sitting' ? `Вы сидите на: ${furnitureName}` : `Вы легли на: ${furnitureName}`}
                        </p>
                        <p className="text-[10px] text-slate-400">Вращайте мышь для кругового обзора</p>
                    </div>
                    <button
                        onClick={() => {
                            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
                        }}
                        className="ml-2 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-all shadow active:scale-95"
                    >
                        Встать (WASD / ESC)
                    </button>
                </div>
            )}

            {/* Footer Control Help */}
            <div className="absolute bottom-6 left-6 right-6 z-20 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md border border-slate-800/80 px-4 py-2 rounded-2xl text-[11px] text-slate-300 pointer-events-auto shadow-lg">
                    {cameraMode === 'walk' ? (
                        <div className="flex items-center gap-2">
                            <span>🎮 <b>WASD</b> / Стрелки — движение</span>
                            <span className="text-slate-600">|</span>
                            <span>🖱️ <b>Мышь</b> — круговой обзор</span>
                            <span className="text-slate-600">|</span>
                            <span>⚡ <b>Shift</b> — ускорение</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-amber-400">✨ <b>E / F</b> — сесть / прилечь рядом с мебелью</span>
                        </div>
                    ) : (
                        <span>🖱️ <b>Левая кнопка мыши</b> — вращение облёта, <b>Правая кнопка</b> — перемещение, <b>Колесико</b> — зум</span>
                    )}
                </div>

                {onOpenLead && (
                    <button
                        onClick={onOpenLead}
                        className="pointer-events-auto px-5 py-2.5 rounded-2xl flat-btn-primary font-bold text-xs shadow-xl active:scale-95 flex items-center gap-2 transition-all hover:scale-105"
                    >
                        <span>📋</span>
                        <span>{ctaText || 'Забронировать'}</span>
                    </button>
                )}
            </div>
        </div>
    );
};
