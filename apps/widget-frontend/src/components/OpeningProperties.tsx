import React from 'react';
import { useStore } from '../store';
import type { OpeningKind } from '@flat/shared';
import { InspectorCard } from './InspectorCard';

/** Mini door glyph for orientation picker (plan view metaphor). */
const DoorGlyph: React.FC<{ hingeLeft: boolean; swingIn: boolean; active?: boolean }> = ({
    hingeLeft, swingIn, active,
}) => {
    const hx = hingeLeft ? 6 : 26;
    const along = hingeLeft ? 1 : -1;
    const swing = swingIn ? 1 : -1;
    // Arc path roughly matching plan symbol
    const pts: string[] = [];
    for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2);
        const x = hx + along * Math.cos(a) * 18;
        const y = 16 + swing * Math.sin(a) * 14;
        pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const leafX = hx + along * 1;
    const leafY1 = 16;
    const leafY2 = 16 + swing * 14;
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" className="block">
            <rect x="4" y="14" width="24" height="4" rx="0.5" fill={active ? '#fef3c7' : '#e2e8f0'} stroke={active ? '#f59e0b' : '#94a3b8'} strokeWidth="1.2" />
            <path d={pts.join(' ')} fill="none" stroke={active ? '#0f172a' : '#64748b'} strokeWidth="1.4" />
            <line x1={leafX} y1={leafY1} x2={leafX} y2={leafY2} stroke={active ? '#0f172a' : '#334155'} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
};

export const OpeningProperties: React.FC = () => {
    const activeOpeningId = useStore((state) => state.activeOpeningId);
    const openings = useStore((state) => state.scene.openings);
    const edges = useStore((state) => state.scene.edges);
    const updateOpening = useStore((state) => state.updateOpening);
    const deleteOpening = useStore((state) => state.deleteOpening);
    const setActiveOpeningId = useStore((state) => state.setActiveOpeningId);

    const op = activeOpeningId ? openings.find((o) => o.id === activeOpeningId) : null;
    if (!activeOpeningId || !op) return null;

    const isSwing = op.kind === 'door' || op.kind === 'balcony_door';
    const isBalcony = op.kind === 'balcony_door';
    const isDoor = op.kind === 'door';
    const wall = edges.find((e) => e.id === op.wallId);
    const wallHeight = wall?.height ?? 2.7;
    const isPanoramic = op.kind === 'window' && op.sillHeight < 0.15;
    const hingeLeft = (op.hingeSide ?? 'left') === 'left';
    const swingIn = (op.swingSide ?? (isBalcony ? 'out' : 'in')) === 'in';

    const setKind = (kind: OpeningKind) => {
        if (kind === 'door') {
            updateOpening(activeOpeningId, {
                kind: 'door',
                width: 0.9,
                height: 2.1,
                sillHeight: 0,
                hingeSide: op.hingeSide ?? 'left',
                swingSide: op.swingSide ?? 'in',
            });
        } else if (kind === 'balcony_door') {
            updateOpening(activeOpeningId, {
                kind: 'balcony_door',
                width: Math.max(op.width, 0.9),
                height: 2.1,
                sillHeight: 0,
                hingeSide: op.hingeSide ?? 'left',
                swingSide: op.swingSide ?? 'out',
            });
        } else {
            updateOpening(activeOpeningId, {
                kind: 'window',
                width: 1.2,
                height: 1.5,
                sillHeight: 0.9,
                hingeSide: undefined,
                swingSide: undefined,
            });
        }
    };

    const handleWindowStyle = (panoramic: boolean) => {
        if (panoramic) {
            updateOpening(activeOpeningId, {
                kind: 'window',
                sillHeight: 0.05,
                height: Math.max(1.8, wallHeight - 0.1)
            });
        } else {
            updateOpening(activeOpeningId, {
                kind: 'window',
                sillHeight: 0.9,
                height: 1.5
            });
        }
    };

    const title = isBalcony ? 'Балконная дверь' : isDoor ? 'Дверь' : (isPanoramic ? 'Панорама' : 'Окно');

    return (
        <InspectorCard>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-[10px] uppercase font-bold text-amber-500 tracking-wide">Проём</div>
                    <div className="text-sm font-semibold text-slate-800">{title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Тяните по стене</div>
                </div>
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => { deleteOpening(activeOpeningId); setActiveOpeningId(null); }}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                        title="Удалить"
                    >
                        🗑️
                    </button>
                    <button
                        onClick={() => setActiveOpeningId(null)}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100"
                        title="Закрыть"
                    >
                        ✕
                    </button>
                </div>
            </div>

            <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">Тип</label>
                <div className="mt-1 flex bg-slate-100 p-0.5 rounded-xl">
                    {([
                        ['door', 'Дверь'],
                        ['balcony_door', 'Балкон'],
                        ['window', 'Окно'],
                    ] as const).map(([kind, label]) => (
                        <button
                            key={kind}
                            onClick={() => setKind(kind)}
                            className={`flex-1 px-1.5 py-1.5 rounded-lg text-[11px] font-bold ${
                                op.kind === kind ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {isSwing && (
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Открывание</label>
                    <div className="mt-1 grid grid-cols-4 gap-1">
                        {([
                            [true, true],
                            [false, true],
                            [true, false],
                            [false, false],
                        ] as const).map(([hL, sIn]) => {
                            const active = hingeLeft === hL && swingIn === sIn;
                            return (
                                <button
                                    key={`${hL}-${sIn}`}
                                    type="button"
                                    title="Вариант открывания"
                                    onClick={() => updateOpening(activeOpeningId, {
                                        hingeSide: hL ? 'left' : 'right',
                                        swingSide: sIn ? 'in' : 'out',
                                    })}
                                    className={`p-1 rounded-xl border ${
                                        active
                                            ? 'border-amber-500 bg-amber-50 shadow-sm'
                                            : 'border-slate-200 bg-white hover:border-slate-400'
                                    }`}
                                >
                                    <DoorGlyph hingeLeft={hL} swingIn={sIn} active={active} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {op.kind === 'window' && (
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Стиль</label>
                    <div className="mt-1 flex bg-slate-100 p-0.5 rounded-xl">
                        <button
                            onClick={() => handleWindowStyle(false)}
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${
                                !isPanoramic ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            Обычное
                        </button>
                        <button
                            onClick={() => handleWindowStyle(true)}
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold ${
                                isPanoramic ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500'
                            }`}
                        >
                            Панорама
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Ширина, м</label>
                    <input
                        type="number"
                        step="0.05"
                        min="0.4"
                        max="5.0"
                        value={op.width.toFixed(2)}
                        onChange={(e) => updateOpening(activeOpeningId, {
                            width: Math.max(0.4, Math.min(5.0, parseFloat(e.target.value) || 0.9)),
                        })}
                        className="mt-1 w-full bg-white border border-slate-200 focus:outline-none focus:border-amber-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Высота, м</label>
                    <input
                        type="number"
                        step="0.1"
                        min="0.4"
                        max="4.0"
                        value={op.height.toFixed(2)}
                        onChange={(e) => updateOpening(activeOpeningId, {
                            height: Math.max(0.4, Math.min(4.0, parseFloat(e.target.value) || 2.1)),
                        })}
                        className="mt-1 w-full bg-white border border-slate-200 focus:outline-none focus:border-amber-400 rounded-xl px-2.5 py-1.5 text-sm font-bold"
                    />
                </div>
            </div>
        </InspectorCard>
    );
};
