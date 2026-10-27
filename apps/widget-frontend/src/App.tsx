import { useState, useEffect } from 'react';
import { SceneContainer } from './components/SceneContainer';
import { EditorToolbar } from './components/EditorToolbar';
import { LeadForm } from './components/LeadForm';
import { useStore } from './store';

import { OpacitySlider } from './components/OpacitySlider';
import { ObjectProperties } from './components/ObjectProperties';
import { WallProperties } from './components/WallProperties';
import { OpeningProperties } from './components/OpeningProperties';

import { PRESETS_MAP } from './presets';
import { AIRenderModal } from './components/AIRenderModal';
import { ShareModal } from './components/ShareModal';
import { MaterialPicker } from './components/MaterialPicker';
import { PDFPassportModal } from './components/PDFPassportModal';
import { ApartmentPicker } from './components/ApartmentPicker';
import { PanoramaViewer } from './components/PanoramaViewer';
import { BakedSceneViewer } from './components/BakedSceneViewer';
import { BakeModal } from './components/BakeModal';
import { PanoramaData, WhitelabelConfig } from '@flat/shared';
import { parseWhitelabelFromUrl, applyWhitelabelTheme, emitHostEvent } from './utils/whitelabel';

// Helper for API calls
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface AppProps {
    mode?: 'manager' | 'client';
}

function App({ mode = 'manager' }: AppProps) {
    const [whitelabel, setWhitelabel] = useState<WhitelabelConfig>(() => parseWhitelabelFromUrl());
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingClient, setIsLoadingClient] = useState(mode === 'client');
    const [clientError, setClientError] = useState('');

    const [isAIRenderOpen, setIsAIRenderOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);
    const [isMaterialsOpen, setIsMaterialsOpen] = useState(false);
    const [isPassportOpen, setIsPassportOpen] = useState(false);
    const [isBakeOpen, setIsBakeOpen] = useState(false);

    // Mode Switcher: editor | bakedOrbit (3D Облёт) | bakedWalk (3D Прогулка от 1 лица) | panoramas (360 Тур)
    const [viewMode, setViewMode] = useState<'editor' | 'bakedOrbit' | 'bakedWalk' | 'panoramas'>('editor');
    const [bakedGlbUrl, setBakedGlbUrl] = useState<string | null>(null);
    const [panoramas, setPanoramas] = useState<PanoramaData[]>([]);

    const atmosphereMode = useStore((state) => state.atmosphereMode || 'day');
    const setAtmosphereMode = useStore((state) => state.setAtmosphereMode);
    const lightsOn = useStore((state) => state.lightsOn);
    const toggleLights = useStore((state) => state.toggleLights);

    const SAMPLE_EURO2_PANOS: PanoramaData[] = [
        {
            id: 'living_room',
            name: 'Гостиная',
            file: 'pano_living_room.jpg',
            url: `${API_URL}/uploads/baked/euro2/pano_living_room.jpg`,
            position: [-2.0, -1.7, 1.55],
            hotspots: [
                { targetRoomId: 'bedroom', targetRoomName: 'Спальня', yaw: 50.2, pitch: 0, distance: 5.47 },
                { targetRoomId: 'kitchen', targetRoomName: 'Кухня', yaw: -4.3, pitch: 0, distance: 3.96 },
                { targetRoomId: 'bathroom', targetRoomName: 'Ванная комната', yaw: 106.7, pitch: 0, distance: 4.18 }
            ]
        },
        {
            id: 'bedroom',
            name: 'Спальня',
            file: 'pano_bedroom.jpg',
            url: `${API_URL}/uploads/baked/euro2/pano_bedroom.jpg`,
            position: [2.2, 1.8, 1.55],
            hotspots: [
                { targetRoomId: 'living_room', targetRoomName: 'Гостиная', yaw: -129.8, pitch: 0, distance: 5.47 },
                { targetRoomId: 'kitchen', targetRoomName: 'Кухня', yaw: -84.3, pitch: 0, distance: 4.52 },
                { targetRoomId: 'bathroom', targetRoomName: 'Ванная комната', yaw: -177.6, pitch: 0, distance: 4.7 }
            ]
        },
        {
            id: 'kitchen',
            name: 'Кухня',
            file: 'pano_kitchen.jpg',
            url: `${API_URL}/uploads/baked/euro2/pano_kitchen.jpg`,
            position: [-2.3, 2.25, 1.55],
            hotspots: [
                { targetRoomId: 'living_room', targetRoomName: 'Гостиная', yaw: 175.7, pitch: 0, distance: 3.96 },
                { targetRoomId: 'bedroom', targetRoomName: 'Спальня', yaw: 95.7, pitch: 0, distance: 4.52 },
                { targetRoomId: 'bathroom', targetRoomName: 'Ванная комната', yaw: 140.1, pitch: 0, distance: 6.71 }
            ]
        },
        {
            id: 'bathroom',
            name: 'Ванная комната',
            file: 'pano_bathroom.jpg',
            url: `${API_URL}/uploads/baked/euro2/pano_bathroom.jpg`,
            position: [2.0, -2.9, 1.55],
            hotspots: [
                { targetRoomId: 'living_room', targetRoomName: 'Гостиная', yaw: -73.3, pitch: 0, distance: 4.18 },
                { targetRoomId: 'bedroom', targetRoomName: 'Спальня', yaw: 2.4, pitch: 0, distance: 4.7 },
                { targetRoomId: 'kitchen', targetRoomName: 'Кухня', yaw: -39.9, pitch: 0, distance: 6.71 }
            ]
        }
    ];

    // Apply Whitelabel CSS Variables & Theme (Light/Dark)
    useEffect(() => {
        applyWhitelabelTheme(whitelabel);
    }, [whitelabel]);

    // Listen to parent window postMessage commands
    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (!e.data || typeof e.data !== 'object') return;
            const { type, payload } = e.data;
            if (!type || typeof type !== 'string' || !type.startsWith('flat:')) return;

            if (type === 'flat:set_apartment') {
                const id = payload?.sceneId || payload?.id;
                if (id && PRESETS_MAP[id]) {
                    useStore.setState({
                        scene: PRESETS_MAP[id],
                        editorPhase: 'done',
                        editorMode: 'furniture',
                        planReviewActive: false,
                    });
                    emitHostEvent('flat:apartment_changed', { id });
                }
            } else if (type === 'flat:set_theme') {
                const nextTheme: 'dark' | 'light' = payload?.theme === 'light' ? 'light' : 'dark';
                setWhitelabel(prev => {
                    const next: WhitelabelConfig = { ...prev, theme: nextTheme };
                    applyWhitelabelTheme(next);
                    return next;
                });
            } else if (type === 'flat:set_color') {
                const color = payload?.color;
                if (color) {
                    setWhitelabel(prev => {
                        const next = { ...prev, primaryColor: color };
                        applyWhitelabelTheme(next);
                        return next;
                    });
                }
            } else if (type === 'flat:set_atmosphere') {
                if (payload?.mode && ['day', 'sunset', 'night'].includes(payload.mode)) {
                    setAtmosphereMode(payload.mode);
                }
            } else if (type === 'flat:open_lead_modal') {
                setIsFormOpen(true);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setAtmosphereMode]);

    // Load scene if in client mode
    useEffect(() => {
        // Prepopulate demo baked artifacts for default layout
        setBakedGlbUrl(`${API_URL}/uploads/baked/euro2/scene_baked.glb`);
        setPanoramas(SAMPLE_EURO2_PANOS);

        if (mode === 'client') {
            const params = new URLSearchParams(window.location.search);
            const sceneId = params.get('s') || params.get('sceneId');

            if (!sceneId) {
                // Default to 'euro2' preset if no scene is specified
                useStore.setState({
                    scene: PRESETS_MAP['euro2'] || PRESETS_MAP['scandi'],
                    editorPhase: 'done',
                    editorMode: 'furniture',
                    planReviewActive: false,
                });
                setIsLoadingClient(false);
                emitHostEvent('flat:ready', { preset: 'euro2', whitelabel });
                return;
            }

            // Check if it's a predefined preset
            if (PRESETS_MAP[sceneId]) {
                useStore.setState({
                    scene: PRESETS_MAP[sceneId],
                    editorPhase: 'done',
                    editorMode: 'furniture',
                    planReviewActive: false,
                });
                setIsLoadingClient(false);
                emitHostEvent('flat:ready', { preset: sceneId, whitelabel });
                return;
            }

            // Fetch the scene data from backend API
            fetch(`${API_URL}/scenes/${sceneId}`)
                .then((res) => {
                    if (!res.ok) throw new Error('Failed to load layout');
                    return res.json();
                })
                .then((data) => {
                    // Update store with the loaded scene
                    useStore.setState({
                        scene: data.data || data,
                        editorPhase: 'done',
                        editorMode: 'furniture',
                        planReviewActive: false,
                    });
                    if (data.bakedGlbUrl) setBakedGlbUrl(data.bakedGlbUrl);
                    if (data.panoramas && data.panoramas.length > 0) {
                        setPanoramas(data.panoramas);
                    }
                    setIsLoadingClient(false);
                    emitHostEvent('flat:ready', { sceneId, whitelabel });
                })
                .catch((err) => {
                    console.error(err);
                    // Fallback to euro2 layout to prevent crashing
                    useStore.setState({
                        scene: PRESETS_MAP['euro2'] || PRESETS_MAP['scandi'],
                        editorPhase: 'done',
                        editorMode: 'furniture',
                        planReviewActive: false,
                    });
                    setIsLoadingClient(false);
                    emitHostEvent('flat:ready', { preset: 'euro2', error: err.message, whitelabel });
                });
        }
    }, [mode, whitelabel]);

    const handleShare = () => {
        setIsFormOpen(true);
    };

    const handleViewModeChange = (nextMode: 'editor' | 'bakedOrbit' | 'bakedWalk' | 'panoramas') => {
        setViewMode(nextMode);
        emitHostEvent('flat:mode_changed', { mode: nextMode });
    };

    const handleSubmit = async (data: { name: string; phone: string; comment: string }) => {
        setIsSubmitting(true);
        try {
            // 1. Save Scene
            const sceneRes = await fetch(`${API_URL}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: useStore.getState().scene }),
            });

            if (!sceneRes.ok) throw new Error('Scene save failed');
            const { sceneId, shareToken } = await sceneRes.json();

            // 2. Submit Lead
            const leadPayload = {
                ...data,
                sceneId,
                shareToken,
                brand: whitelabel.brandName,
                sourceUrl: window.location.href,
                webhookUrl: whitelabel.webhookUrl
            };

            const leadRes = await fetch(`${API_URL}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadPayload),
            });

            if (!leadRes.ok) throw new Error('Lead submit failed');

            emitHostEvent('flat:lead_submitted', leadPayload);

            if (mode === 'manager') {
                alert(`Успешно! Ссылка для клиента: ${window.location.origin}/client.html?s=${shareToken}`);
            } else {
                alert(`Спасибо! Ваша планировка и заявка сохранены. Менеджер «${whitelabel.brandName || 'проекта'}» свяжется с вами в течение 10 минут.`);
            }
            setIsFormOpen(false);
        } catch (e) {
            console.error(e);
            alert('Ошибка при отправке данных. Убедитесь, что сервер доступен.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingClient) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white gap-4">
                <div className="w-8 h-8 border-4 flat-border-primary border-t-transparent rounded-full animate-spin" />
                <div className="text-sm font-semibold tracking-wider uppercase text-slate-400">Загрузка 3D планировки...</div>
            </div>
        );
    }

    if (clientError) {
        return <div className="h-screen w-screen flex items-center justify-center text-xl font-bold text-red-500">{clientError}</div>;
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
            <header className="absolute top-0 left-0 p-3 sm:p-4 z-10 pointer-events-none w-full flex justify-between items-start">
                <div className="flex flex-col gap-2 pointer-events-auto">
                    <div className="flex items-center gap-2">
                        <div className="text-xs sm:text-sm font-bold bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-2 px-3 sm:px-4 rounded-xl sm:rounded-2xl shadow-md border border-white/80 dark:border-slate-800 flex items-center gap-2.5">
                            {whitelabel.brandLogo ? (
                                <img src={whitelabel.brandLogo} alt={whitelabel.brandName} className="h-5 sm:h-6 object-contain" />
                            ) : (
                                <span className="flat-text-primary font-serif font-black text-sm sm:text-base tracking-wider">
                                    {whitelabel.brandName}
                                </span>
                            )}
                            <span className="text-gray-300 dark:text-slate-700">|</span>
                            <span className="text-gray-600 dark:text-slate-300 font-normal">
                                {whitelabel.brandSubtitle || (mode === 'manager' ? 'Панель девелопера' : '3D Конфигуратор')}
                            </span>
                            {whitelabel.contactPhone && (
                                <>
                                    <span className="text-gray-300 dark:text-slate-700 hidden sm:inline">|</span>
                                    <a
                                        href={`tel:${whitelabel.contactPhone.replace(/\s+/g, '')}`}
                                        className="hidden sm:inline-flex items-center gap-1 font-semibold flat-text-primary hover:underline text-xs"
                                    >
                                        <span>📞</span>
                                        <span>{whitelabel.contactPhone}</span>
                                    </a>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Interactive Apartment Specs Card & Switcher (Only in client mode) */}
                    {mode === 'client' && whitelabel.features?.apartmentPicker !== false && (
                        <ApartmentPicker
                            brandName={whitelabel.brandName}
                            onSelectPreset={(id) => emitHostEvent('flat:apartment_changed', { id })}
                        />
                    )}
                </div>

                {/* Mode / Format Switcher (Draft 3D Editor / Clean 3D Orbit / Clean 3D Walk / 360 Virtual Tour) */}
                <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-2xl sm:rounded-3xl shadow-lg border border-white/80 dark:border-slate-800 flex items-center gap-1 pointer-events-auto">
                    <button
                        onClick={() => handleViewModeChange('editor')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            viewMode === 'editor'
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm font-bold'
                                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-slate-800'
                        }`}
                        title="Интерактивный редактор планировки и 3D расстановки"
                    >
                        <span>📐</span>
                        <span>Редактор</span>
                    </button>

                    {bakedGlbUrl && (
                        <>
                            <button
                                onClick={() => handleViewModeChange('bakedOrbit')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    viewMode === 'bakedOrbit'
                                        ? 'flat-btn-primary shadow-md font-bold'
                                        : 'text-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-slate-800 dark:text-amber-400'
                                }`}
                                title="Свободный 3D облёт квартиры сверху в разрезе"
                            >
                                <span>🚁</span>
                                <span>3D Облёт</span>
                            </button>

                            <button
                                onClick={() => handleViewModeChange('bakedWalk')}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                    viewMode === 'bakedWalk'
                                        ? 'flat-btn-primary shadow-md font-bold'
                                        : 'text-amber-800 bg-amber-50 hover:bg-amber-100 dark:bg-slate-800 dark:text-amber-400'
                                }`}
                                title="3D Прогулка от 1-го лица (старт у входа, WASD)"
                            >
                                <span>🚶‍♂️</span>
                                <span>3D Прогулка</span>
                            </button>
                        </>
                    )}

                    {panoramas && panoramas.length > 0 && (
                        <button
                            onClick={() => handleViewModeChange('panoramas')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                viewMode === 'panoramas'
                                    ? 'bg-sky-500 text-white shadow-md font-bold'
                                    : 'text-sky-700 bg-sky-50 hover:bg-sky-100 dark:bg-slate-800 dark:text-sky-400'
                            }`}
                            title="360° Виртуальный Тур по комнатам"
                        >
                            <span>📸</span>
                            <span>360° Тур</span>
                        </button>
                    )}
                </div>

                {/* Atmosphere & Lighting Controller (Day ☀️ / Sunset 🌅 / Night 🌙 + Lights 💡) */}
                {whitelabel.features?.atmosphere !== false && (
                    <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 py-1.5 sm:px-3 sm:py-2 rounded-2xl sm:rounded-3xl shadow-lg border border-white/80 dark:border-slate-800 flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
                        <div className="flex items-center bg-gray-100/80 dark:bg-slate-800 p-0.5 rounded-xl text-xs">
                            <button
                                onClick={() => setAtmosphereMode('day')}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    atmosphereMode === 'day' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                }`}
                                title="Дневное освещение"
                            >
                                ☀️ День
                            </button>
                            <button
                                onClick={() => setAtmosphereMode('sunset')}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    atmosphereMode === 'sunset' ? 'bg-amber-500 text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                }`}
                                title="Закатный золотой час"
                            >
                                🌅 Закат
                            </button>
                            <button
                                onClick={() => setAtmosphereMode('night')}
                                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                    atmosphereMode === 'night' ? 'bg-indigo-900 text-white shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                                }`}
                                title="Ночной уютный режим"
                            >
                                🌙 Ночь
                            </button>
                        </div>

                        <div className="w-px h-4 sm:h-5 bg-gray-300/60 dark:bg-slate-700" />

                        <button
                            onClick={toggleLights}
                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl flex items-center justify-center text-base sm:text-lg transition-all active:scale-95 ${
                                lightsOn ? 'bg-amber-400 text-white shadow-md shadow-amber-400/30' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 hover:bg-gray-200'
                            }`}
                            title={lightsOn ? 'Выключить интерьерный свет' : 'Включить интерьерный свет'}
                        >
                            💡
                        </button>
                    </div>
                )}
            </header>

            <main className="flex-1 relative h-full">
                {viewMode === 'panoramas' && panoramas && panoramas.length > 0 ? (
                    <PanoramaViewer
                        panoramas={panoramas}
                        onClose={() => handleViewModeChange('editor')}
                        onOpenLead={() => setIsFormOpen(true)}
                        ctaText={whitelabel.ctaText}
                    />
                ) : (viewMode === 'bakedOrbit' || viewMode === 'bakedWalk') && bakedGlbUrl ? (
                    <BakedSceneViewer
                        glbUrl={bakedGlbUrl}
                        initialCameraMode={viewMode === 'bakedWalk' ? 'walk' : 'orbit'}
                        onClose={() => handleViewModeChange('editor')}
                        onOpenLead={() => setIsFormOpen(true)}
                        ctaText={whitelabel.ctaText}
                    />
                ) : (
                    <>
                        <SceneContainer />
                        {mode === 'manager' && <OpacitySlider />}
                        <ObjectProperties />
                        <WallProperties />
                        <OpeningProperties />

                        <div className="absolute bottom-0 w-full z-10 pb-4 pointer-events-none flex justify-center px-3">
                            <div className="pointer-events-auto w-full max-w-5xl">
                                <EditorToolbar
                                    onShare={handleShare}
                                    onAIRender={whitelabel.features?.aiRender !== false ? () => setIsAIRenderOpen(true) : undefined}
                                    onShareCustom={whitelabel.features?.share !== false ? () => setIsShareOpen(true) : undefined}
                                    onOpenMaterials={whitelabel.features?.materials !== false ? () => setIsMaterialsOpen(true) : undefined}
                                    onOpenPassport={whitelabel.features?.passport !== false ? () => setIsPassportOpen(true) : undefined}
                                    onOpenBake={whitelabel.features?.bake ? () => setIsBakeOpen(true) : undefined}
                                    mode={mode}
                                    whitelabel={whitelabel}
                                />
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Modals */}
            <LeadForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                whitelabel={whitelabel}
            />

            <MaterialPicker
                isOpen={isMaterialsOpen}
                onClose={() => setIsMaterialsOpen(false)}
            />

            <PDFPassportModal
                isOpen={isPassportOpen}
                onClose={() => setIsPassportOpen(false)}
                whitelabel={whitelabel}
            />

            <AIRenderModal
                isOpen={isAIRenderOpen}
                onClose={() => setIsAIRenderOpen(false)}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
            />

            <BakeModal
                isOpen={isBakeOpen}
                onClose={() => setIsBakeOpen(false)}
                onViewPanoramas={(panos) => {
                    setPanoramas(panos);
                    setViewMode('panoramas');
                }}
                onViewBakedGlb={(url) => {
                    setBakedGlbUrl(url);
                    setViewMode('bakedOrbit');
                }}
            />
        </div>
    );
}

export default App;
