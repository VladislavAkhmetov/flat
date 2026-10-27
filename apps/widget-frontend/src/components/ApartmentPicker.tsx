import React, { useState } from 'react';
import { PRESET_METADATA_LIST, PRESETS_MAP, PresetMetadata } from '../presets';
import { useStore } from '../store';

interface ApartmentPickerProps {
    currentPresetId?: string;
    onSelectPreset?: (id: string) => void;
    brandName?: string;
}

export const ApartmentPicker: React.FC<ApartmentPickerProps> = ({ currentPresetId, onSelectPreset, brandName }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeId, setActiveId] = useState<string>(() => {
        const params = new URLSearchParams(window.location.search);
        const s = params.get('s') || params.get('sceneId');
        if (s && ['studio', 'euro2', 'family', 'penthouse', 'scandi', 'loft'].includes(s)) {
            if (s === 'scandi') return 'euro2';
            if (s === 'loft') return 'studio';
            return s;
        }
        return currentPresetId || 'euro2';
    });

    const activeMeta = PRESET_METADATA_LIST.find((p) => p.id === activeId) || PRESET_METADATA_LIST[1];

    const handleSelect = (meta: PresetMetadata) => {
        setActiveId(meta.id);
        setIsOpen(false);

        // Load scene preset into store
        const presetScene = PRESETS_MAP[meta.id];
        if (presetScene) {
            useStore.setState({
                scene: presetScene,
                editorPhase: 'done',
                editorMode: 'furniture',
                planReviewActive: false,
            });
        }

        // Update URL
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('s', meta.id);
        window.history.pushState({}, '', newUrl.toString());

        if (onSelectPreset) {
            onSelectPreset(meta.id);
        }
    };

    return (
        <>
            {/* Active Apartment Specs Card (Overlay) */}
            <div className="bg-slate-900/90 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-800/80 text-white p-3 sm:p-4 rounded-2xl shadow-xl w-64 animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col gap-2">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[11px] font-bold flat-text-primary uppercase tracking-wider">{activeMeta.title}</span>
                    </div>
                    <button
                        onClick={() => setIsOpen(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 transition-all hover:bg-indigo-500/20 active:scale-95"
                    >
                        Сменить ▾
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                    <div className="text-slate-400">Площадь:</div>
                    <div className="font-bold text-right text-white">{activeMeta.area}</div>
                    <div className="text-slate-400">Этаж:</div>
                    <div className="font-bold text-right text-white">{activeMeta.floor}</div>
                    <div className="text-slate-400">Потолки:</div>
                    <div className="font-bold text-right text-white">{activeMeta.ceiling}</div>
                </div>

                <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline mt-0.5">
                    <span className="text-[10px] text-slate-400">Стоимость:</span>
                    <span className="text-sm font-bold flat-text-primary font-serif">{activeMeta.price}</span>
                </div>
            </div>

            {/* Modal to Switch Apartment Layout */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center pb-4 border-b border-slate-800 mb-5">
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {brandName ? `Планировочные решения «${brandName}»` : 'Каталог планировок'}
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">Выберите квартиру для интерактивного 3D просмотра и меблировки</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {PRESET_METADATA_LIST.map((meta) => {
                                const isSelected = activeId === meta.id;
                                return (
                                    <div
                                        key={meta.id}
                                        onClick={() => handleSelect(meta)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                                            isSelected
                                                ? 'flat-bg-primary-subtle flat-border-primary ring-1 shadow-xl'
                                                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-1.5">
                                                <span className="text-sm font-bold text-white">{meta.title}</span>
                                                <span className="text-xs font-bold flat-text-primary font-serif">{meta.price}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{meta.desc}</p>
                                        </div>

                                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
                                            <span className="text-[9px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                                                {meta.area}
                                            </span>
                                            <span className="text-[9px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                                                Этаж {meta.floor}
                                            </span>
                                            <span className="text-[9px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded">
                                                Потолки {meta.ceiling}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
