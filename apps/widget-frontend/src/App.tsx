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

// Helper for API calls
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface AppProps {
    mode?: 'manager' | 'client';
}

function App({ mode = 'manager' }: AppProps) {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingClient, setIsLoadingClient] = useState(mode === 'client');
    const [clientError, setClientError] = useState('');
    const scene = useStore(state => state.scene);

    const [isAIRenderOpen, setIsAIRenderOpen] = useState(false);
    const [isShareOpen, setIsShareOpen] = useState(false);

    const isNightMode = useStore(state => state.isNightMode);
    const lightsOn = useStore(state => state.lightsOn);
    const toggleNightMode = useStore(state => state.toggleNightMode);
    const toggleLights = useStore(state => state.toggleLights);

    // Load scene if in client mode
    useEffect(() => {
        if (mode === 'client') {
            const params = new URLSearchParams(window.location.search);
            const sceneId = params.get('s') || params.get('sceneId');
            
            if (!sceneId) {
                // Default to 'scandi' preset if no scene is specified
                useStore.setState({ scene: PRESETS_MAP['scandi'] });
                setIsLoadingClient(false);
                return;
            }

            // Check if it's a predefined preset
            if (PRESETS_MAP[sceneId]) {
                useStore.setState({ scene: PRESETS_MAP[sceneId] });
                setIsLoadingClient(false);
                return;
            }

            // Fetch the scene data from backend API
            fetch(`${API_URL}/scenes/${sceneId}`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to load layout');
                    return res.json();
                })
                .then(data => {
                    // Update store with the loaded scene
                    useStore.setState({ scene: data.data });
                    setIsLoadingClient(false);
                })
                .catch(err => {
                    console.error(err);
                    // Fallback to scandi layout to prevent crashing
                    useStore.setState({ scene: PRESETS_MAP['scandi'] });
                    setIsLoadingClient(false);
                });
        }
    }, [mode]);

    const handleShare = () => {
        setIsFormOpen(true);
    };

    const handleSubmit = async (data: { name: string, phone: string, comment: string }) => {
        setIsSubmitting(true);
        try {
            // 1. Save Scene
            const sceneRes = await fetch(`${API_URL}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: scene })
            });

            if (!sceneRes.ok) throw new Error('Scene save failed');
            const { sceneId, shareToken } = await sceneRes.json();

            // 2. Submit Lead
            const leadRes = await fetch(`${API_URL}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    sceneId,
                    shareToken
                })
            });

            if (!leadRes.ok) throw new Error('Lead submit failed');

            if (mode === 'manager') {
                alert(`Success! Link: ${window.location.origin}/client.html?s=${shareToken}`);
            } else {
                alert('Спасибо! Ваша заявка успешно отправлена. Менеджер свяжется с вами в ближайшее время.');
            }
            setIsFormOpen(false);
        } catch (e) {
            console.error(e);
            alert('Ошибка при отправке данных. Убедитесь, что бэкенд запущен.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingClient) {
        return (
            <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white gap-4">
                <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-sm font-semibold tracking-wider uppercase text-slate-400">Загрузка планировки...</div>
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
                    <h1 className="text-xs sm:text-base font-bold text-gray-800 bg-white/90 backdrop-blur-md p-2 px-3 sm:px-4 rounded-xl sm:rounded-2xl shadow-md inline-block">
                        {mode === 'manager' ? 'Flat Builder MVP (Manager)' : 'Интерактивная Планировка'}
                    </h1>

                    {/* Premium Apartment Specs Card (Only in client mode) */}
                    {mode === 'client' && (
                        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 text-white p-3 sm:p-4 rounded-2xl shadow-xl w-60 animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col gap-2">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Квартира №45</span>
                                <span className="text-[10px] font-semibold text-slate-400">2-комн. студия</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                                <div>Площадь:</div>
                                <div className="font-bold text-right">78.4 м²</div>
                                <div>Этаж:</div>
                                <div className="font-bold text-right">12 / 24</div>
                                <div>Потолки:</div>
                                <div className="font-bold text-right">3.0 м</div>
                            </div>
                            <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline mt-1">
                                <span className="text-[10px] text-slate-400">Стоимость:</span>
                                <span className="text-sm font-bold text-amber-400">18 200 000 ₽</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Cozy Atmosphere & Lighting Controller */}
                <div className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl sm:rounded-3xl shadow-lg border border-white/50 flex items-center gap-2 sm:gap-3 pointer-events-auto">
                    <button 
                        onClick={toggleNightMode}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl flex items-center justify-center text-base sm:text-lg transition-all active:scale-95 ${isNightMode ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-100 text-yellow-600 hover:bg-yellow-50'}`}
                        title={isNightMode ? "Переключить на день" : "Переключить на ночь"}
                    >
                        {isNightMode ? '🌙' : '☀️'}
                    </button>
                    <div className="w-px h-4 sm:h-5 bg-gray-300/60" />
                    <button 
                        onClick={toggleLights}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl flex items-center justify-center text-base sm:text-lg transition-all active:scale-95 ${lightsOn ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                        title={lightsOn ? "Выключить свет" : "Включить свет"}
                    >
                        💡
                    </button>
                </div>
            </header>

            <main className="flex-1 relative h-full">
                <SceneContainer />
                {mode === 'manager' && <OpacitySlider />}
                <ObjectProperties />
                <WallProperties />
                <OpeningProperties />

                <div className="absolute bottom-0 w-full z-10 pb-6 pointer-events-none flex justify-center px-4">
                    <div className="pointer-events-auto w-full max-w-2xl">
                        <EditorToolbar 
                            onShare={handleShare}
                            onAIRender={() => setIsAIRenderOpen(true)}
                            onShareCustom={() => setIsShareOpen(true)}
                            mode={mode} 
                        />
                    </div>
                </div>
            </main>

            <LeadForm
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
            />

            {/* Client Side Modals */}
            <AIRenderModal
                isOpen={isAIRenderOpen}
                onClose={() => setIsAIRenderOpen(false)}
            />

            <ShareModal
                isOpen={isShareOpen}
                onClose={() => setIsShareOpen(false)}
            />
        </div>
    )
}

export default App;
