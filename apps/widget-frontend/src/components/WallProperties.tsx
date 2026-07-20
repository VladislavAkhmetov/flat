import React from 'react';
import { useStore } from '../store';

export const WallProperties: React.FC = () => {
    const activeWallId = useStore((state) => state.activeWallId);
    const edges = useStore((state) => state.scene.edges);
    const updateNode = useStore((state) => state.updateNode);
    const deleteEdge = useStore((state) => state.deleteEdge);
    const setActiveWallId = useStore((state) => state.setActiveWallId);

    if (!activeWallId) return null;

    const edge = edges.find(e => e.id === activeWallId);
    if (!edge) return null;

    const isBearing = edge.kind === 'bearing';

    const handleTypeChange = (type: 'bearing' | 'partition') => {
        // Automatically set thickness based on type: 25cm for bearing, 15cm for partition
        const thickness = type === 'bearing' ? 0.25 : 0.15;
        
        useStore.setState((state) => ({
            scene: {
                ...state.scene,
                edges: state.scene.edges.map((e) =>
                    e.id === activeWallId ? { ...e, kind: type, thickness } : e
                )
            }
        }));
    };

    const handleThicknessChange = (val: number) => {
        const parsed = Math.max(0.05, Math.min(1.0, val));
        useStore.setState((state) => ({
            scene: {
                ...state.scene,
                edges: state.scene.edges.map((e) =>
                    e.id === activeWallId ? { ...e, thickness: parsed } : e
                )
            }
        }));
    };

    const handleHeightChange = (val: number) => {
        const parsed = Math.max(1.0, Math.min(5.0, val));
        useStore.setState((state) => ({
            scene: {
                ...state.scene,
                edges: state.scene.edges.map((e) =>
                    e.id === activeWallId ? { ...e, height: parsed } : e
                )
            }
        }));
    };

    const handleDelete = () => {
        if (isBearing) {
            alert("⚠️ Несущую стену невозможно снести! Снос несущих конструкций запрещен законодательством РФ.");
            return;
        }
        deleteEdge(activeWallId);
        setActiveWallId(null);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 w-full md:bottom-36 md:left-1/2 md:-translate-x-1/2 md:w-auto bg-white/95 backdrop-blur-2xl border-t border-slate-200 md:border md:border-white/40 shadow-2xl rounded-t-[2rem] md:rounded-3xl p-5 md:p-4 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 pointer-events-auto z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Visual Handle for swipeable sheet on mobile */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto -mt-2 mb-2 md:hidden" />

            <div className="flex justify-between items-center w-full md:w-auto">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Конструкция</span>
                    <span className="text-sm font-semibold text-slate-800">Стена</span>
                </div>
                <button
                    onClick={() => setActiveWallId(null)}
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
                {/* Wall Type Preset Toggle */}
                <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Тип стены</label>
                    <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                        <button
                            onClick={() => handleTypeChange('bearing')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 flex-1 ${
                                isBearing
                                    ? 'bg-slate-800 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            🔒 Несущая
                        </button>
                        <button
                            onClick={() => handleTypeChange('partition')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-1 text-center ${
                                !isBearing
                                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200/30'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            Перегородка
                        </button>
                    </div>
                </div>

                {/* Separator for desktop */}
                <div className="hidden md:block w-px h-8 bg-slate-300/50" />

                {/* Wall Properties */}
                <div className="flex gap-4">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Толщина (м)</label>
                        <input
                            type="number"
                            step="0.05"
                            min="0.05"
                            max="1.0"
                            value={edge.thickness}
                            onChange={(e) => handleThicknessChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-slate-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase">Высота (м)</label>
                        <input
                            type="number"
                            step="0.1"
                            min="1.0"
                            max="5.0"
                            value={edge.height}
                            onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-slate-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px h-8 bg-slate-300/50" />

            {/* Actions */}
            <div className="flex gap-2 border-t border-gray-100 pt-4 md:pt-0 md:border-none w-full md:w-auto">
                <button
                    onClick={handleDelete}
                    className={`flex-1 md:flex-none h-10 md:w-9 md:h-9 flex items-center justify-center gap-2 md:gap-0 rounded-xl transition-all font-bold ${
                        isBearing
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-red-50 text-red-500 hover:bg-red-100 active:scale-95'
                    }`}
                    title={isBearing ? "Несущую стену нельзя удалить" : "Удалить стену"}
                    disabled={isBearing}
                >
                    <span>{isBearing ? "🔒" : "🗑️"}</span>
                    <span className="md:hidden text-xs">
                        {isBearing ? "Несущая стена (удаление заблокировано)" : "Удалить стену"}
                    </span>
                </button>
                <button
                    onClick={() => setActiveWallId(null)}
                    className="hidden md:flex w-9 h-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 active:scale-90 transition-all font-bold"
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
