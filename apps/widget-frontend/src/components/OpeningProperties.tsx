import React from 'react';
import { useStore } from '../store';

export const OpeningProperties: React.FC = () => {
    const activeOpeningId = useStore((state) => state.activeOpeningId);
    const openings = useStore((state) => state.scene.openings);
    const updateOpening = useStore((state) => state.updateOpening);
    const deleteOpening = useStore((state) => state.deleteOpening);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);

    if (!activeOpeningId) return null;

    const op = openings.find(o => o.id === activeOpeningId);
    if (!op) return null;

    const isDoor = op.kind === 'door';

    const handleTypeChange = (type: 'door' | 'window') => {
        updateOpening(activeOpeningId, {
            kind: type,
            width: type === 'door' ? 0.9 : 1.2,
            height: type === 'door' ? 2.1 : 1.5,
            sillHeight: type === 'door' ? 0 : 0.9
        });
    };

    const handleWidthChange = (val: number) => {
        const width = Math.max(0.4, Math.min(5.0, val));
        updateOpening(activeOpeningId, { width });
    };

    const handleHeightChange = (val: number) => {
        const height = Math.max(0.4, Math.min(4.0, val));
        updateOpening(activeOpeningId, { height });
    };

    const handleSillChange = (val: number) => {
        const sillHeight = Math.max(0, Math.min(2.5, val));
        updateOpening(activeOpeningId, { sillHeight });
    };

    const handlePositionChange = (val: number) => {
        const t = Math.max(0.05, Math.min(0.95, val));
        updateOpening(activeOpeningId, { t });
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 w-full md:bottom-36 md:left-1/2 md:-translate-x-1/2 md:w-auto bg-white/95 backdrop-blur-2xl border-t border-slate-200 md:border md:border-white/40 shadow-2xl rounded-t-[2rem] md:rounded-3xl p-5 md:p-4 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 pointer-events-auto z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Visual Handle for swipeable sheet on mobile */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto -mt-2 mb-2 md:hidden" />

            <div className="flex justify-between items-center w-full md:w-auto">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-amber-500">Элемент стены</span>
                    <span className="text-sm font-semibold text-slate-800">{isDoor ? 'Дверной проем' : 'Оконный проем'}</span>
                </div>
                <button
                    onClick={() => setActiveOpeningId(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/80 text-slate-500 md:hidden hover:bg-gray-200"
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px h-8 bg-slate-300/50" />

            {/* Controls layout */}
            <div className="flex flex-col sm:flex-row md:flex gap-4 sm:items-center w-full md:w-auto">
                {/* Type selector */}
                <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Тип проема</label>
                    <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                        <button
                            onClick={() => handleTypeChange('door')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 text-center ${
                                isDoor
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Дверь
                        </button>
                        <button
                            onClick={() => handleTypeChange('window')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 text-center ${
                                !isDoor
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Окно
                        </button>
                    </div>
                </div>

                {/* Separator for desktop */}
                <div className="hidden md:block w-px h-8 bg-slate-300/50" />

                {/* Position Slider (t) */}
                <div className="flex flex-col gap-1 flex-1">
                    <div className="flex justify-between items-center w-full sm:w-36">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">Положение</span>
                        <span className="text-[10px] font-mono font-bold text-slate-600">{(op.t * 100).toFixed(0)}%</span>
                    </div>
                    <input
                        type="range"
                        min="0.05"
                        max="0.95"
                        step="0.01"
                        value={op.t}
                        onChange={(e) => handlePositionChange(parseFloat(e.target.value))}
                        className="w-full sm:w-36 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                </div>

                {/* Separator for desktop */}
                <div className="hidden md:block w-px h-8 bg-slate-300/50" />

                {/* Dimensions */}
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Ширина (м)</label>
                        <input
                            type="number"
                            step="0.05"
                            min="0.4"
                            max="5.0"
                            value={op.width.toFixed(2)}
                            onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-slate-200 focus:outline-none focus:border-amber-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Высота (м)</label>
                        <input
                            type="number"
                            step="0.1"
                            min="0.4"
                            max="4.0"
                            value={op.height.toFixed(2)}
                            onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-slate-200 focus:outline-none focus:border-amber-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                    {!isDoor && (
                        <div className="flex flex-col gap-1 flex-1">
                            <label className="text-[10px] font-semibold text-slate-400 uppercase">Подоконник (м)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="2.5"
                                value={op.sillHeight.toFixed(2)}
                                onChange={(e) => handleSillChange(parseFloat(e.target.value))}
                                className="w-full md:w-16 bg-white border border-slate-200 focus:outline-none focus:border-amber-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px h-8 bg-slate-300/50" />

            {/* Actions */}
            <div className="flex gap-2 border-t border-gray-100 pt-4 md:pt-0 md:border-none w-full md:w-auto">
                <button
                    onClick={() => { deleteOpening(activeOpeningId); setActiveOpeningId(null); }}
                    className="flex-1 md:flex-none h-10 md:w-9 md:h-9 flex items-center justify-center gap-2 md:gap-0 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all font-bold text-sm"
                    title="Удалить проем"
                >
                    <span>🗑️</span>
                    <span className="md:hidden">Удалить проем</span>
                </button>
                <button
                    onClick={() => setActiveOpeningId(null)}
                    className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 active:scale-90 transition-all font-bold"
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
