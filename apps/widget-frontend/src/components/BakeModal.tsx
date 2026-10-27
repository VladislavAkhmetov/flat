import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Sparkles, Camera, Box, CheckCircle2, AlertCircle, Play, Copy, Check, ExternalLink } from 'lucide-react';
import { PanoramaData } from '@flat/shared';

interface BakeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onViewPanoramas: (panoramas: PanoramaData[]) => void;
    onViewBakedGlb: (glbUrl: string) => void;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const BakeModal: React.FC<BakeModalProps> = ({
    isOpen,
    onClose,
    onViewPanoramas,
    onViewBakedGlb,
}) => {
    const [mode, setMode] = useState<'both' | 'panoramas' | 'glb'>('both');
    const [quality, setQuality] = useState<'fast' | 'high'>('high');
    const [isBaking, setIsBaking] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusStep, setStatusStep] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [bakedResult, setBakedResult] = useState<{
        bakedGlbUrl?: string;
        panoramas?: PanoramaData[];
        shareToken?: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setErrorMsg('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleStartBake = async () => {
        setIsBaking(true);
        setProgress(5);
        setErrorMsg('');
        setStatusStep('💾 Сохранение сцены на сервере...');

        try {
            // 1. Save current scene
            const sceneData = useStore.getState().scene;
            const saveRes = await fetch(`${API_BASE}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: sceneData }),
            });

            if (!saveRes.ok) throw new Error('Ошибка сохранения планировки');
            const { shareToken } = await saveRes.json();

            setProgress(15);
            setStatusStep('📐 Инициализация движка Cycles и сборка геометрии...');

            // 2. Trigger bake on backend
            const bakeRes = await fetch(`${API_BASE}/scenes/${shareToken}/bake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode,
                    samples: quality === 'fast' ? 64 : 128,
                }),
            });

            if (!bakeRes.ok) {
                const errData = await bakeRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Ошибка запуска запекания');
            }

            // 3. Poll for status
            let isComplete = false;
            let pollAttempts = 0;
            const maxPolls = 180; // 3 minutes timeout

            while (!isComplete && pollAttempts < maxPolls) {
                await new Promise((r) => setTimeout(r, 1200));
                pollAttempts++;

                const statusRes = await fetch(`${API_BASE}/scenes/${shareToken}/bake-status`);
                if (!statusRes.ok) continue;

                const statusData = await statusRes.json();

                if (statusData.status === 'processing') {
                    const dynamicProgress = Math.min(92, 15 + pollAttempts * 3);
                    setProgress(dynamicProgress);
                    if (dynamicProgress < 40) {
                        setStatusStep('☀️ Расстановка солнца, оконных порталов и люстр...');
                    } else if (dynamicProgress < 75) {
                        setStatusStep('📸 Рендеринг 360° сферических панорам (Cycles CUDA + OIDN)...');
                    } else {
                        setStatusStep('✨ Запекание лайтмапов и упаковка чистового GLB...');
                    }
                } else if (statusData.status === 'ready') {
                    setProgress(100);
                    setStatusStep('🎉 Чистовой рендер успешно готов!');
                    setIsBaking(false);
                    isComplete = true;
                    setBakedResult({
                        bakedGlbUrl: statusData.bakedGlbUrl,
                        panoramas: statusData.panoramas,
                        shareToken,
                    });
                    break;
                } else if (statusData.status === 'error') {
                    throw new Error(statusData.error || 'Ошибка при запекании в Blender');
                }
            }

            if (!isComplete) {
                throw new Error('Превышено время ожидания запекания');
            }
        } catch (err: any) {
            console.error('[BakeModal] Error:', err);
            setIsBaking(false);
            setErrorMsg(err.message || 'Произошла непредвиденная ошибка');
        }
    };

    const handleCopyClientLink = () => {
        if (!bakedResult?.shareToken) return;
        const clientUrl = `${window.location.origin}/client.html?s=${bakedResult.shareToken}`;
        navigator.clipboard.writeText(clientUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden p-6 md:p-8 text-white">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    disabled={isBaking}
                    className="absolute top-5 right-5 w-9 h-9 flex items-center justify-center rounded-full bg-slate-800 text-gray-400 hover:text-white hover:bg-slate-700 transition-all disabled:opacity-30"
                >
                    ✕
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl border border-amber-500/30 shadow-inner">
                        ⚡
                    </div>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">Запекание и чистовой рендер</h3>
                        <p className="text-xs text-slate-400 font-light">
                            Cycles Ray Tracing, запекание света и 360° тур
                        </p>
                    </div>
                </div>

                {!isBaking && !bakedResult && (
                    <>
                        <p className="text-xs text-slate-300 leading-relaxed mb-6">
                            Превратите редактируемую сцену в готовый презентационный материал.
                            Все тени, переотражения света и материалы будут предварительно рассчитаны,
                            что обеспечит максимальный реализм и 60 FPS на любых смартфонах клиентов.
                        </p>

                        {/* Format Selection */}
                        <div className="mb-5">
                            <label className="text-[11px] uppercase font-bold text-amber-500 tracking-wider block mb-2">
                                Формат артефакта
                            </label>
                            <div className="grid grid-cols-3 gap-2.5">
                                <button
                                    onClick={() => setMode('both')}
                                    className={`p-3 rounded-2xl border text-left transition-all ${
                                        mode === 'both'
                                            ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                                            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
                                    }`}
                                >
                                    <Sparkles size={18} className="text-amber-400 mb-2" />
                                    <p className="text-xs font-bold">Оба формата</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">360° Тур + 3D Walk</p>
                                </button>

                                <button
                                    onClick={() => setMode('panoramas')}
                                    className={`p-3 rounded-2xl border text-left transition-all ${
                                        mode === 'panoramas'
                                            ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                                            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
                                    }`}
                                >
                                    <Camera size={18} className="text-sky-400 mb-2" />
                                    <p className="text-xs font-bold">360° Панорамы</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Тур по комнатам</p>
                                </button>

                                <button
                                    onClick={() => setMode('glb')}
                                    className={`p-3 rounded-2xl border text-left transition-all ${
                                        mode === 'glb'
                                            ? 'bg-amber-500/15 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                                            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400'
                                    }`}
                                >
                                    <Box size={18} className="text-emerald-400 mb-2" />
                                    <p className="text-xs font-bold">3D Walk (GLB)</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Свободный обход</p>
                                </button>
                            </div>
                        </div>

                        {/* Quality Preset */}
                        <div className="mb-6">
                            <label className="text-[11px] uppercase font-bold text-amber-500 tracking-wider block mb-2">
                                Качество рендеринга
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setQuality('fast')}
                                    className={`flex-1 py-2.5 px-3 rounded-xl border text-center text-xs font-semibold transition-all ${
                                        quality === 'fast'
                                            ? 'bg-slate-800 border-amber-500 text-white'
                                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    ⚡ Быстрый (64 сэмпла, ~15–20 сек)
                                </button>
                                <button
                                    onClick={() => setQuality('high')}
                                    className={`flex-1 py-2.5 px-3 rounded-xl border text-center text-xs font-semibold transition-all ${
                                        quality === 'high'
                                            ? 'bg-slate-800 border-amber-500 text-white'
                                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    ✨ Кинематографический (128 сэмплов + Denoise)
                                </button>
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-400">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <button
                            onClick={handleStartBake}
                            className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold rounded-2xl shadow-lg shadow-amber-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 text-sm uppercase tracking-wider"
                        >
                            <Play size={16} fill="currentColor" />
                            Запустить запекание сцены
                        </button>
                    </>
                )}

                {/* State: In Progress */}
                {isBaking && (
                    <div className="py-8 text-center">
                        <div className="relative w-24 h-24 mx-auto mb-6">
                            <div className="absolute inset-0 border-4 border-slate-800 rounded-full" />
                            <div className="absolute inset-0 border-4 border-t-amber-500 rounded-full animate-spin" />
                            <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center text-2xl">
                                ⚙️
                            </div>
                        </div>
                        <h4 className="text-base font-bold mb-2">Идет запекание квартиры...</h4>
                        <p className="text-xs text-slate-400 mb-6 min-h-[24px]">{statusStep}</p>

                        <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5 mb-2">
                            <div
                                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300 shadow-md shadow-amber-500/50"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <span className="text-xs font-bold text-amber-500">{progress}%</span>
                    </div>
                )}

                {/* State: Finished */}
                {!isBaking && bakedResult && (
                    <div className="py-4 text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-2xl">
                            <CheckCircle2 size={32} />
                        </div>
                        <h4 className="text-lg font-bold mb-1">Запекание успешно завершено!</h4>
                        <p className="text-xs text-slate-400 mb-6">
                            Файлы сгенерированы и готовы для показа клиентам.
                        </p>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {bakedResult.panoramas && bakedResult.panoramas.length > 0 && (
                                <button
                                    onClick={() => {
                                        onViewPanoramas(bakedResult.panoramas!);
                                        onClose();
                                    }}
                                    className="p-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-all active:scale-95 border border-slate-700 shadow"
                                >
                                    <Camera size={16} className="text-amber-400" />
                                    Открыть 360° Тур
                                </button>
                            )}

                            {bakedResult.bakedGlbUrl && (
                                <button
                                    onClick={() => {
                                        onViewBakedGlb(bakedResult.bakedGlbUrl!);
                                        onClose();
                                    }}
                                    className="p-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-xs transition-all active:scale-95 border border-slate-700 shadow"
                                >
                                    <Box size={16} className="text-emerald-400" />
                                    Открыть 3D Walk (GLB)
                                </button>
                            )}
                        </div>

                        {/* Copy Link for Client */}
                        <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                            <div className="text-left overflow-hidden">
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                                    Ссылка для клиента
                                </p>
                                <p className="text-xs text-slate-300 truncate">
                                    {`${window.location.origin}/client.html?s=${bakedResult.shareToken}`}
                                </p>
                            </div>
                            <button
                                onClick={handleCopyClientLink}
                                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 transition-all active:scale-95 shadow"
                            >
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
