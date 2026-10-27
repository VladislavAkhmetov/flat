import React, { useState } from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { ROOM_PRESETS, buildPresetObjects } from '../roomPresets';

type Tab = 'presets' | 'furniture' | 'kitchen' | 'plumbing';

const PRESET_ICONS: Record<string, React.ReactNode> = {
    bedroom: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /><path d="M2 14h20" />
        </svg>
    ),
    living: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" /><path d="M2 13h20v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
        </svg>
    ),
    kitchen: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M3 11h18v9H3z" /><path d="M5 11V7h4v4" /><path d="M15 11V4h4v7" />
        </svg>
    ),
    bath: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M2 14h20" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M16 14V6h2" />
        </svg>
    ),
};

const ITEM_ICON = (type: string) => {
    const props = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 } as const;
    if (type.includes('bed')) return <svg {...props}><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /><path d="M2 14h20" /></svg>;
    if (type.includes('sofa') || type.includes('armchair')) return <svg {...props}><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" /><path d="M2 13h20v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></svg>;
    if (type.includes('table') || type.includes('desk')) return <svg {...props}><path d="M2 15h20" /><path d="M4 15v4" /><path d="M20 15v4" /><path d="M6 15V9h12v6" /></svg>;
    if (type.includes('chair')) return <svg {...props}><path d="M6 5h12v8H6z" /><path d="M5 13v6" /><path d="M19 13v6" /><path d="M5 13h14" /></svg>;
    if (type.includes('wardrobe') || type.includes('refrigerator')) return <svg {...props}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M12 3v18" /></svg>;
    if (type.includes('tv')) return <svg {...props}><rect x="3" y="7" width="18" height="11" rx="1" /><path d="M8 21h8" /></svg>;
    if (type.includes('bath')) return <svg {...props}><path d="M2 14h20" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
    if (type.includes('toilet')) return <svg {...props}><path d="M7 11h10v5a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-5" /><path d="M9 11V7h6v4" /></svg>;
    if (type.includes('shower')) return <svg {...props}><path d="M4 4h16v16H4z" /><path d="M12 4v5" /><circle cx="12" cy="4" r="1" /></svg>;
    if (type.includes('stove') || type.includes('kitchen')) return <svg {...props}><rect x="3" y="6" width="18" height="14" rx="1" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" /></svg>;
    if (type.includes('sink') || type.includes('washing')) return <svg {...props}><rect x="4" y="8" width="16" height="10" rx="2" /><circle cx="12" cy="13" r="3" /></svg>;
    return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
};

const NAMES: Record<string, string> = {
    bed_double: 'Кровать',
    bed_single: 'Кровать 1сп',
    sofa_corner: 'Угловой',
    sofa_3: 'Диван',
    sofa_2: 'Диван 2м',
    armchair: 'Кресло',
    bedside_table: 'Тумба',
    chair_dining: 'Стул',
    chair_office: 'Офис',
    table_dining: 'Стол',
    table_desk: 'Письм.',
    tv_stand: 'ТВ-тумба',
    tv: 'ТВ',
    wardrobe: 'Шкаф',
    kitchen_module: 'Модуль',
    stove: 'Плита',
    refrigerator: 'Холод.',
    sink_kitchen: 'Мойка',
    kitchen_set: 'Гарнитур',
    bath: 'Ванна',
    toilet: 'Унитаз',
    shower: 'Душ',
    washing_machine: 'Стиралка',
    sink: 'Раковина',
};

function sceneAnchor(nodes: { x: number; y: number }[]): { x: number; z: number } {
    if (nodes.length === 0) return { x: 0, z: 0 };
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        z: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
}

/**
 * Single furniture control surface for step 2 / client:
 * presets first, then a short item strip — no stacked competing panels.
 */
export const FurnitureDock: React.FC<{
    mode?: 'manager' | 'client';
}> = ({ mode = 'manager' }) => {
    const editorPhase = useStore((s) => s.editorPhase);
    const finishFurniturePhase = useStore((s) => s.finishFurniturePhase);
    const clearFurnitureObjects = useStore((s) => s.clearFurnitureObjects);
    const addObject = useStore((s) => s.addObject);
    const activeCatalogId = useStore((s) => s.activeCatalogId);
    const setActiveCatalogId = useStore((s) => s.setActiveCatalogId);
    const setEditorMode = useStore((s) => s.setEditorMode);
    const nodes = useStore((s) => s.scene.nodes);
    const objectCount = useStore(
        (s) => s.scene.objects.filter((o) => o.catalogId !== 'spawn_point').length,
    );
    const beginHistoryBatch = useStore((s) => s.beginHistoryBatch);
    const endHistoryBatch = useStore((s) => s.endHistoryBatch);

    const [tab, setTab] = useState<Tab>('presets');
    const isManagerStep = mode === 'manager' && editorPhase === 'furniture';

    const placePreset = (presetId: string) => {
        const preset = ROOM_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;
        const objs = buildPresetObjects(preset, sceneAnchor(nodes));
        beginHistoryBatch();
        objs.forEach((obj) => addObject(obj));
        endHistoryBatch();
        setActiveCatalogId(null);
        setEditorMode('furniture');
    };

    const items = FURNITURE_CATALOG.filter((c) => {
        if (tab === 'furniture') return c.category === 'furniture';
        if (tab === 'kitchen') return c.category === 'kitchen';
        if (tab === 'plumbing') return c.category === 'plumbing';
        return false;
    });

    const tabs: { id: Tab; label: string }[] = [
        { id: 'presets', label: 'Наборы' },
        { id: 'furniture', label: 'Мебель' },
        { id: 'kitchen', label: 'Кухня' },
        { id: 'plumbing', label: 'С/у' },
    ];

    return (
        <div className="w-[min(560px,94vw)] bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/70 overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-gray-100">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                        {isManagerStep ? 'Шаг 2 · Мебель' : 'Расстановка'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                        {tab === 'presets'
                            ? 'Набор комнаты → сразу на план'
                            : 'Предмет → клик по полу · R — поворот'}
                        {objectCount > 0 ? ` · ${objectCount}` : ''}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {objectCount > 0 && (
                        <button
                            type="button"
                            onClick={() => clearFurnitureObjects()}
                            className="px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-full"
                        >
                            Очистить
                        </button>
                    )}
                    {isManagerStep && (
                        <button
                            type="button"
                            onClick={() => finishFurniturePhase()}
                            className="px-3.5 py-1.5 bg-slate-950 text-white text-[11px] sm:text-xs font-bold rounded-full hover:scale-105 active:scale-95 transition-transform"
                        >
                            Готово → 3D
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-3 pt-2.5">
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                            setTab(t.id);
                            if (t.id === 'presets') setActiveCatalogId(null);
                        }}
                        className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                            tab === t.id
                                ? 'bg-slate-900 text-white shadow'
                                : 'text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Body */}
            <div className="p-3 pt-2.5">
                {tab === 'presets' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ROOM_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => placePreset(preset.id)}
                                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-50 hover:bg-slate-900 hover:text-white text-slate-800 transition-all border border-slate-100 hover:border-slate-900 group"
                                title={preset.hint}
                            >
                                <span className="text-slate-600 group-hover:text-white">
                                    {PRESET_ICONS[preset.id]}
                                </span>
                                <span className="text-xs font-bold leading-tight">{preset.name}</span>
                                <span className="text-[10px] opacity-60 leading-tight text-center hidden sm:block">
                                    {preset.hint}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                        {items.map((item) => {
                            const active = activeCatalogId === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        if (active) {
                                            setActiveCatalogId(null);
                                        } else {
                                            setEditorMode('furniture');
                                            setActiveCatalogId(item.id);
                                        }
                                    }}
                                    className={`flex flex-col items-center gap-1 min-w-[64px] p-2 rounded-2xl transition-all ${
                                        active
                                            ? 'bg-slate-900 text-white shadow-lg scale-105'
                                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                                    }`}
                                >
                                    <span className={active ? 'text-white' : 'text-slate-600'}>
                                        {ITEM_ICON(item.id)}
                                    </span>
                                    <span className="text-[10px] font-semibold truncate max-w-[64px]">
                                        {NAMES[item.id] || item.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
