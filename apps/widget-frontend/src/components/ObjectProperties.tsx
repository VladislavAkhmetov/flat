import React from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { InspectorCard } from './InspectorCard';

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
        <InspectorCard>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Объект</div>
                    <div className="text-sm font-semibold text-gray-700">{catalogItem?.name || 'Unknown'}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => { removeObject(activeObjectId); setActiveObjectId(null); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                        title="Удалить"
                    >
                        🗑️
                    </button>
                    <button
                        onClick={() => setActiveObjectId(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100"
                        title="Закрыть"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-medium text-gray-500">Ширина, м</label>
                    <input
                        type="number" step="0.1"
                        value={currentW.toFixed(2)}
                        onChange={(e) => handleWidthChange(parseFloat(e.target.value))}
                        className="mt-1 w-full bg-white border border-gray-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-medium text-gray-500">Глубина, м</label>
                    <input
                        type="number" step="0.1"
                        value={currentD.toFixed(2)}
                        onChange={(e) => handleDepthChange(parseFloat(e.target.value))}
                        className="mt-1 w-full bg-white border border-gray-200 focus:outline-none focus:border-blue-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
            </div>

            <div>
                <label className="text-[10px] font-medium text-gray-500">Поворот</label>
                <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => handleRotChange(currentRot - 45)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm font-bold">↺</button>
                    <span className="text-xs font-mono font-bold w-10 text-center">{Math.round(currentRot)}°</span>
                    <button onClick={() => handleRotChange(currentRot + 45)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-sm font-bold">↻</button>
                </div>
            </div>
        </InspectorCard>
    );
};
