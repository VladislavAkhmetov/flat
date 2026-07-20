import React from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';

export const ObjectProperties: React.FC = () => {
    const activeObjectId = useStore((state) => state.activeObjectId);
    const objects = useStore((state) => state.scene.objects);
    const updateObject = useStore((state) => state.updateObject);
    const removeObject = useStore((state) => state.removeObject);
    const setActiveObjectId = useStore((state) => state.setActiveObjectId);

    if (!activeObjectId) return null;

    const obj = objects.find(o => o.id === activeObjectId);
    if (!obj) return null;

    const catalogItem = FURNITURE_CATALOG.find(c => c.id === obj.catalogId);

    // Determine dimensions (use instance override or catalog default)
    // Currently store doesn't support override in `addObject` in FurniturePlacer?
    // FurniturePlacer sets scale {1,1,1}.
    // We should probably rely on `obj.scale` for resizing?
    // Or add `dimensions` to object instance? 
    // Typescript inferred `SceneObject` from existing usage.
    // I'll assume usage of `scale` to modify dimensions.
    // W = baseW * scale.x

    const baseW = catalogItem?.dimensions.width || 1;
    const baseD = catalogItem?.dimensions.depth || 1;

    const currentW = baseW * (obj.scale?.x || 1);
    const currentD = baseD * (obj.scale?.z || 1);
    const currentRot = (obj.rot || 0) * 180 / Math.PI;

    const handleWidthChange = (val: number) => {
        updateObject(activeObjectId, { ...obj, scale: { ...obj.scale, x: val / baseW } });
    };

    const handleDepthChange = (val: number) => {
        updateObject(activeObjectId, { ...obj, scale: { ...obj.scale, z: val / baseD } });
    };

    const handleRotChange = (deg: number) => {
        const rad = deg * Math.PI / 180;
        updateObject(activeObjectId, { ...obj, rot: rad });
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 w-full md:bottom-36 md:left-1/2 md:-translate-x-1/2 md:w-auto bg-white/90 backdrop-blur-2xl border-t border-slate-200/60 md:border md:border-white/40 shadow-2xl rounded-t-[2rem] md:rounded-3xl p-5 md:p-4 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 pointer-events-auto z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Visual Handle for swipeable sheet on mobile */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto -mt-2 mb-2 md:hidden" />

            {/* Header / Title */}
            <div className="flex justify-between items-center w-full md:w-auto">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Объект</span>
                    <span className="text-sm font-semibold text-gray-700">{catalogItem?.name || 'Unknown'}</span>
                </div>
                <button
                    onClick={() => setActiveObjectId(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100/80 text-gray-500 md:hidden hover:bg-gray-200"
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px h-8 bg-gray-300/50" />

            {/* Controls layout */}
            <div className="grid grid-cols-2 md:flex gap-4 items-center">
                {/* Size Controls */}
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-medium text-gray-500">Ширина (м)</label>
                        <input
                            type="number" step="0.1"
                            value={currentW.toFixed(2)}
                            onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-gray-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-medium text-gray-500">Глубина (м)</label>
                        <input
                            type="number" step="0.1"
                            value={currentD.toFixed(2)}
                            onChange={(e) => handleDepthChange(parseFloat(e.target.value))}
                            className="w-full md:w-16 bg-white border border-gray-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold shadow-sm"
                        />
                    </div>
                </div>

                {/* Separator for desktop */}
                <div className="hidden md:block w-px h-8 bg-gray-300/50" />

                {/* Rotation */}
                <div className="flex flex-col gap-1 items-start md:items-center justify-center">
                    <label className="text-[10px] font-medium text-gray-500 md:self-center">Поворот</label>
                    <div className="flex items-center gap-2">
                        <button onClick={() => handleRotChange(currentRot - 45)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform">↺</button>
                        <span className="text-xs font-mono font-bold w-10 text-center">{Math.round(currentRot)}°</span>
                        <button onClick={() => handleRotChange(currentRot + 45)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm font-bold active:scale-90 transition-transform">↻</button>
                    </div>
                </div>
            </div>

            {/* Separator */}
            <div className="hidden md:block w-px h-8 bg-gray-300/50" />

            {/* Actions */}
            <div className="flex gap-2 border-t border-gray-100 pt-4 md:pt-0 md:border-none w-full md:w-auto">
                <button
                    onClick={() => { removeObject(activeObjectId); setActiveObjectId(null); }}
                    className="flex-1 md:flex-none h-10 md:w-8 md:h-8 flex items-center justify-center gap-2 md:gap-0 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all text-sm font-bold"
                    title="Удалить"
                >
                    <span>🗑️</span>
                    <span className="md:hidden">Удалить объект</span>
                </button>
                <button
                    onClick={() => setActiveObjectId(null)}
                    className="hidden md:flex w-8 h-8 items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>
        </div>
    );
};
