import React from 'react';
import { useStore } from '../store';
import { FLOOR_MATERIALS, WALL_COLORS } from '../utils/materialTextures';

interface MaterialPickerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const MaterialPicker: React.FC<MaterialPickerProps> = ({ isOpen, onClose }) => {
    const currentFloorId = useStore((state) => state.scene.materials?.floorId || 'wood_chevron');
    const currentWallColor = useStore((state) => state.scene.materials?.wallColor || '#faf9f6');
    const setFloorMaterial = useStore((state) => state.setFloorMaterial);
    const setWallColor = useStore((state) => state.setWallColor);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-xl bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/80 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎨</span>
                        <div>
                            <h3 className="text-base font-bold text-slate-900 leading-tight">Отделочные материалы</h3>
                            <p className="text-xs text-slate-500 font-light">Выберите напольное покрытие и цветовую палитру стен</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 transition-all active:scale-90"
                    >
                        ✕
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Floor Finishes */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-xs uppercase font-bold text-slate-700 tracking-wider">
                                🪵 Напольное покрытие (Паркет / Керамогранит)
                            </label>
                            <span className="text-[11px] text-amber-600 font-semibold">
                                {FLOOR_MATERIALS.find((m) => m.id === currentFloorId)?.name}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {FLOOR_MATERIALS.map((mat) => {
                                const isSelected = currentFloorId === mat.id;
                                return (
                                    <button
                                        key={mat.id}
                                        type="button"
                                        onClick={() => setFloorMaterial(mat.id)}
                                        className={`p-3 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                                            isSelected
                                                ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-500'
                                                : 'border-gray-200 hover:border-gray-300 bg-gray-50/70 hover:bg-white'
                                        }`}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-xl border border-black/10 shrink-0 shadow-inner mt-0.5"
                                            style={{ backgroundColor: mat.color }}
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold text-slate-900">{mat.name}</span>
                                                {isSelected && <span className="text-xs text-amber-600">✓</span>}
                                            </div>
                                            <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{mat.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Wall Colors */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-xs uppercase font-bold text-slate-700 tracking-wider">
                                🖌️ Цвет и фактура стен
                            </label>
                            <span className="text-[11px] text-slate-700 font-semibold">
                                {WALL_COLORS.find((c) => c.color === currentWallColor)?.name || 'По умолчанию'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {WALL_COLORS.map((wall) => {
                                const isSelected = currentWallColor === wall.color;
                                return (
                                    <button
                                        key={wall.id}
                                        type="button"
                                        onClick={() => setWallColor(wall.color)}
                                        className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                                            isSelected
                                                ? 'bg-slate-900 text-white shadow-md'
                                                : 'border-gray-200 hover:border-gray-300 bg-gray-50/70 hover:bg-white text-slate-900'
                                        }`}
                                    >
                                        <div
                                            className="w-8 h-8 rounded-full border-2 border-white shadow-md shrink-0"
                                            style={{ backgroundColor: wall.color }}
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-bold">{wall.name}</span>
                                                {isSelected && <span className="text-xs text-amber-400">✓</span>}
                                            </div>
                                            <p className={`text-[10px] leading-tight mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                                {wall.desc}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-[11px] text-gray-500">
                        ⚡ Материалы мгновенно отображаются в 3D и режиме Прогулки
                    </span>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-slate-950 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                    >
                        Применить
                    </button>
                </div>
            </div>
        </div>
    );
};
