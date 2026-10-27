import React from 'react';
import { useStore } from '../store';
import { InspectorCard } from './InspectorCard';

export const WallProperties: React.FC = () => {
    // All hooks must run unconditionally (before any early return)
    const activeWallId = useStore((state) => state.activeWallId);
    const edges = useStore((state) => state.scene.edges);
    const deleteEdge = useStore((state) => state.deleteEdge);
    const setActiveWallId = useStore((state) => state.setActiveWallId);
    const planReviewActive = useStore((state) => state.planReviewActive);

    const activeOpeningId = useStore((state) => state.activeOpeningId);
    const edge = activeWallId ? edges.find((e) => e.id === activeWallId) : null;
    if (!activeWallId || !edge || activeOpeningId) return null;

    const isBearing = edge.kind === 'bearing';
    // During AI QA review, managers may delete mis-detected "bearing" walls
    const canDelete = !isBearing || planReviewActive;

    const handleTypeChange = (type: 'bearing' | 'partition') => {
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
        if (isBearing && !planReviewActive) {
            alert("⚠️ Несущую стену невозможно снести! Снос несущих конструкций запрещен законодательством РФ.");
            return;
        }
        deleteEdge(activeWallId);
        setActiveWallId(null);
    };

    return (
        <InspectorCard>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Конструкция</div>
                    <div className="text-sm font-semibold text-slate-800">Стена</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">«+» или двойной клик — угол</div>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={handleDelete}
                        className={`w-8 h-8 flex items-center justify-center rounded-xl font-bold ${
                            !canDelete
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-red-50 text-red-500 hover:bg-red-100'
                        }`}
                        title={!canDelete ? 'Несущую стену нельзя удалить' : 'Удалить стену'}
                        disabled={!canDelete}
                    >
                        {!canDelete ? '🔒' : '🗑️'}
                    </button>
                    <button
                        onClick={() => setActiveWallId(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100"
                        title="Закрыть"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">Тип стены</label>
                <div className="mt-1 flex bg-slate-100 p-0.5 rounded-xl">
                    <button
                        onClick={() => handleTypeChange('bearing')}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${
                            isBearing ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        🔒 Несущая
                    </button>
                    <button
                        onClick={() => handleTypeChange('partition')}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${
                            !isBearing ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Перегородка
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Толщина, м</label>
                    <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        max="1.0"
                        value={edge.thickness}
                        onChange={(e) => handleThicknessChange(parseFloat(e.target.value))}
                        className="mt-1 w-full bg-white border border-slate-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Высота, м</label>
                    <input
                        type="number"
                        step="0.1"
                        min="1.0"
                        max="5.0"
                        value={edge.height}
                        onChange={(e) => handleHeightChange(parseFloat(e.target.value))}
                        className="mt-1 w-full bg-white border border-slate-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
            </div>
        </InspectorCard>
    );
};
