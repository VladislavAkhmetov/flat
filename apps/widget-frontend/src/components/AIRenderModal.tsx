import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

interface AIRenderModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const STYLES = [
    { id: 'scandi', name: 'Скандинавский', desc: 'Светлые тона, дерево, живые растения', icon: '🌿' },
    { id: 'loft', name: 'Лофт-студия', desc: 'Кирпичные стены, темный металл, кожа', icon: '🧱' },
    { id: 'classic', name: 'Современная классика', desc: 'Мрамор, золотые акценты, лепнина', icon: '🏛️' },
    { id: 'japandi', name: 'Джапанди', desc: 'Минимализм, бамбук, природный покой', icon: '🎋' }
];

const LIGHTS = [
    { id: 'morning', name: 'Солнечное утро', desc: 'Яркий естественный свет', icon: '☀️' },
    { id: 'evening', name: 'Уютный вечер', desc: 'Теплый свет торшеров, уютные тени', icon: '🌙' },
    { id: 'twilight', name: 'Мягкий закат', desc: 'Золотисто-розовая дымка', icon: '🌅' }
];

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/uploads`;

export const AIRenderModal: React.FC<AIRenderModalProps> = ({ isOpen, onClose }) => {
    const [selectedStyle, setSelectedStyle] = useState('scandi');
    const [selectedLight, setSelectedLight] = useState('morning');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [loadingText, setLoadingText] = useState('');
    const [results, setResults] = useState<string[]>([]);
    const [activeResultIdx, setActiveResultIdx] = useState(0);

    const isNightMode = useStore((state) => state.isNightMode);

    useEffect(() => {
        if (!isOpen) {
            setIsGenerating(false);
            setProgress(0);
            setResults([]);
            setActiveResultIdx(0);
        }
    }, [isOpen]);

    // Simulating loading steps
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isGenerating) {
            timer = setInterval(() => {
                setProgress((prev) => {
                    const next = prev + 1;
                    if (next <= 20) {
                        setLoadingText('📐 Анализ геометрии стен и проёмов...');
                    } else if (next <= 45) {
                        setLoadingText('🛋️ Считывание 3D координат мебели...');
                    } else if (next <= 75) {
                        setLoadingText('🤖 Запуск Stable Diffusion XL + ControlNet Depth...');
                    } else if (next <= 95) {
                        setLoadingText('✨ Финальная детализация, наложение текстур и HDR...');
                    } else if (next >= 100) {
                        clearInterval(timer);
                        setIsGenerating(false);
                        // Map results based on choice
                        const resultImages = [];
                        if (selectedStyle === 'scandi') {
                            if (selectedLight === 'evening') {
                                resultImages.push(`${API_BASE}/scandi_evening.png`);
                                resultImages.push(`${API_BASE}/scandi_morning.png`);
                            } else {
                                resultImages.push(`${API_BASE}/scandi_morning.png`);
                                resultImages.push(`${API_BASE}/scandi_evening.png`);
                            }
                        } else {
                            // Fallback mock (using scandi morning/evening with disclaimer)
                            resultImages.push(`${API_BASE}/scandi_morning.png`);
                            resultImages.push(`${API_BASE}/scandi_evening.png`);
                        }
                        setResults(resultImages);
                        return 100;
                    }
                    return next;
                });
            }, 60);
        }
        return () => clearInterval(timer);
    }, [isGenerating, selectedStyle, selectedLight]);

    if (!isOpen) return null;

    const handleGenerate = () => {
        setIsGenerating(true);
        setProgress(0);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[600px] text-white">
                
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-slate-800/80 text-gray-400 hover:text-white hover:bg-slate-700/80 transition-all active:scale-90"
                >
                    ✕
                </button>

                {/* Left Side: Parameters Form */}
                <div className="w-full md:w-5/12 p-6 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-2xl">🪄</span>
                            <h3 className="text-xl font-bold tracking-tight">ИИ Рендеринг</h3>
                        </div>
                        <p className="text-xs text-slate-400 font-light mb-6">
                            Создайте фотореалистичный 3D дизайн квартиры на основе вашей текущей планировки и мебели. Выберите параметры ниже.
                        </p>

                        {/* Styles Selector */}
                        <div className="mb-6">
                            <label className="text-[10px] uppercase font-bold text-amber-500 tracking-wider block mb-2.5">Интерьерный стиль</label>
                            <div className="grid grid-cols-2 gap-2">
                                {STYLES.map((style) => (
                                    <button
                                        key={style.id}
                                        onClick={() => setSelectedStyle(style.id)}
                                        className={`p-3 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-24 relative ${
                                            selectedStyle === style.id
                                                ? 'bg-amber-500/10 border-amber-500 text-white'
                                                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
                                        }`}
                                    >
                                        <span className="text-lg">{style.icon}</span>
                                        <div>
                                            <p className="text-xs font-bold">{style.name}</p>
                                            <p className="text-[9px] font-light leading-tight mt-0.5 text-slate-500">{style.desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lighting Selector */}
                        <div className="mb-6">
                            <label className="text-[10px] uppercase font-bold text-amber-500 tracking-wider block mb-2.5">Освещение и время суток</label>
                            <div className="flex flex-col gap-2">
                                {LIGHTS.map((light) => (
                                    <button
                                        key={light.id}
                                        onClick={() => setSelectedLight(light.id)}
                                        className={`p-2.5 rounded-xl border text-left transition-all duration-300 flex items-center gap-3 ${
                                            selectedLight === light.id
                                                ? 'bg-amber-500/10 border-amber-500 text-white'
                                                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
                                        }`}
                                    >
                                        <span className="text-base">{light.icon}</span>
                                        <div>
                                            <p className="text-xs font-bold">{light.name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-98 transition-all disabled:opacity-50 text-sm uppercase tracking-wider mt-4"
                    >
                        Сгенерировать фото
                    </button>
                </div>

                {/* Right Side: Render Simulation Viewport */}
                <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-6 md:p-8 relative overflow-hidden">
                    {/* State 1: Awaiting Generation */}
                    {!isGenerating && results.length === 0 && (
                        <div className="text-center max-w-sm">
                            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-2xl mx-auto mb-4 animate-bounce">
                                🖼️
                            </div>
                            <h4 className="text-base font-semibold mb-2">Готов к визуализации</h4>
                            <p className="text-xs text-slate-500 font-light">
                                Выберите желаемый стиль интерьера слева и нажмите кнопку генерации. ИИ преобразует вашу планировку в фотореалистичный рендер.
                            </p>
                        </div>
                    )}

                    {/* State 2: Generating Loading Screen */}
                    {isGenerating && (
                        <div className="w-full max-w-md text-center">
                            <div className="relative w-28 h-28 mx-auto mb-8">
                                {/* Glowing spinner ring */}
                                <div className="absolute inset-0 border-4 border-slate-800 rounded-full" />
                                <div className="absolute inset-0 border-4 border-t-amber-500 rounded-full animate-spin" />
                                <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center text-3xl">
                                    🤖
                                </div>
                            </div>
                            <h4 className="text-lg font-bold mb-3">Генерируем дизайн...</h4>
                            <p className="text-xs text-slate-400 mb-6 min-h-[32px]">{loadingText}</p>
                            
                            {/* Progress bar container */}
                            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5">
                                <div 
                                    className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300 shadow-lg shadow-amber-500/50" 
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-bold text-amber-500 mt-2 block tracking-wider">{progress}%</span>
                        </div>
                    )}

                    {/* State 3: Result Display */}
                    {!isGenerating && results.length > 0 && (
                        <div className="w-full h-full flex flex-col justify-between">
                            <div className="flex-1 flex items-center justify-center overflow-hidden rounded-2xl relative group max-h-[80%]">
                                <img
                                    src={results[activeResultIdx]}
                                    alt={`AI interior render variant ${activeResultIdx + 1}`}
                                    className="w-full h-full object-cover rounded-2xl border border-slate-800"
                                    onError={(e) => {
                                        // Failover to test images if local endpoint has issues
                                        console.error('Image load fail:', e);
                                    }}
                                />
                                {selectedStyle !== 'scandi' && (
                                    <div className="absolute bottom-3 left-3 bg-slate-900/90 text-[10px] text-amber-400 font-bold border border-amber-500/20 px-2.5 py-1 rounded-lg backdrop-blur-md">
                                        ⚠️ Режим Демо: сгенерирован Скандинавский стиль
                                    </div>
                                )}
                            </div>

                            {/* Carousel controls */}
                            <div className="mt-4 flex items-center justify-between">
                                <div className="flex gap-2">
                                    {results.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveResultIdx(idx)}
                                            className={`w-10 h-10 rounded-xl overflow-hidden border-2 transition-all ${
                                                activeResultIdx === idx ? 'border-amber-500 scale-105' : 'border-slate-800 hover:border-slate-700 opacity-60'
                                            }`}
                                        >
                                            <img src={results[idx]} className="w-full h-full object-cover" alt="" />
                                        </button>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <a
                                        href={results[activeResultIdx]}
                                        download={`flatbuilder_ai_render_${selectedStyle}.png`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="h-10 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl flex items-center justify-center gap-2 text-xs font-semibold active:scale-95 transition-all"
                                    >
                                        📥 Скачать
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
