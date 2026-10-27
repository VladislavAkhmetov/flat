import React from 'react';
import { useStore } from '../store';
import { PlanUploader } from './PlanUploader';
import { CatalogPanel } from './CatalogPanel';
import { FurnitureDock } from './FurnitureDock';

import { WhitelabelConfig } from '@flat/shared';

// --- Icons (Lucide Style) ---
const Icon2D = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><path d="M9 3v18" /><path d="M3 9h18" /></svg>;
const Icon3D = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
const IconWalk = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10V4" /></svg>;

const IconSelect = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>;
const IconWalls = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
const IconOpenings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M13 11v10" /><path d="M5 11h14" /></svg>;
const IconFurniture = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" /><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z" /><path d="M5 18v2" /><path d="M19 18v2" /></svg>;
const IconErase = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>;
const IconCheck = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;

const IconUndo = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>;
const IconRedo = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>;


export const EditorToolbar: React.FC<{
    onShare: () => void;
    onAIRender?: () => void;
    onShareCustom?: () => void;
    onOpenMaterials?: () => void;
    onOpenPassport?: () => void;
    onOpenBake?: () => void;
    mode?: 'manager' | 'client';
    whitelabel?: WhitelabelConfig;
}> = ({ onShare, onAIRender, onShareCustom, onOpenMaterials, onOpenPassport, onOpenBake, mode = 'manager', whitelabel }) => {
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const editorMode = useStore((state) => state.editorMode);
    const editorPhase = useStore((state) => state.editorPhase);
    const threshold = useStore((state) => state.detectionThreshold);
    const setEditorMode = useStore((state) => state.setEditorMode);
    const setCameraMode = useStore((state) => state.setCameraMode);
    const setThreshold = useStore((state) => state.setThreshold);
    const clearWalls = useStore((state) => state.clearWalls);
    const imageProcessing = useStore((state) => state.imageProcessing);
    const openingToolMode = useStore((state) => state.openingToolMode);
    const setOpeningToolMode = useStore((state) => state.setOpeningToolMode);
    const planReviewActive = useStore((state) => state.planReviewActive);
    const wallToolMode = useStore((state) => state.wallToolMode);
    const setWallToolMode = useStore((state) => state.setWallToolMode);
    const confirmPlanReview = useStore((state) => state.confirmPlanReview);
    const edgeCount = useStore((state) => state.scene.edges.length);
    const openingCount = useStore((state) => state.scene.openings.length);
    const pendingFurnitureCount = useStore((state) => state.pendingFurniture.length);
    const wallCutaway3D = useStore((state) => state.wallCutaway3D);
    const toggleWallCutaway = useStore((state) => state.toggleWallCutaway);

    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const canUndo = useStore((state) => state.past.length > 0);
    const canRedo = useStore((state) => state.future.length > 0);

    const isClient = mode === 'client';
    const inFurniturePhase = editorPhase === 'furniture' || (isClient && !planReviewActive);
    const showCatalog =
        !planReviewActive &&
        (editorMode === 'furniture' || (isClient && editorMode === 'view'));

    const btnBase = "px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl text-xs md:text-sm font-medium transition-all duration-300 flex items-center gap-1 md:gap-2";
    const btnActive = "bg-white text-black shadow-lg shadow-black/5 scale-105";
    const btnInactive = "text-gray-500 hover:text-gray-900 hover:bg-white/40";
    const btnDisabled = "text-gray-300 cursor-not-allowed opacity-40";
    const btnIcon = "w-8.5 h-8.5 md:w-10 md:h-10 flex items-center justify-center rounded-xl md:rounded-2xl hover:bg-white/60 text-gray-600 transition-all active:scale-95 disabled:opacity-30";
    const separator = "hidden sm:block w-px h-6 bg-gray-400/20";

    const handleConfirmReview = () => {
        confirmPlanReview();
    };

    return (
        <div className="flex flex-col items-center gap-2 pointer-events-auto select-none">
            {/* Step 1 banner — top of screen, not stacked over tools */}
            {planReviewActive && mode === 'manager' && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-amber-500/95 backdrop-blur-2xl rounded-full shadow-xl px-4 py-2 border border-amber-300/40 text-slate-950 max-w-[min(36rem,calc(100vw-8rem))]">
                    <div className="min-w-0 hidden sm:block">
                        <div className="text-xs sm:text-sm font-bold leading-tight">Шаг 1 из 2 · Конструктив</div>
                        <div className="text-[10px] opacity-80 truncate">
                            Поправьте стены и проёмы · {edgeCount} стен · {openingCount} проёмов
                            {pendingFurnitureCount > 0 ? ` · ${pendingFurnitureCount} мебели` : ''}
                        </div>
                    </div>
                    <div className="sm:hidden text-xs font-bold whitespace-nowrap">Шаг 1 · 2D</div>
                    <button
                        onClick={handleConfirmReview}
                        disabled={edgeCount < 3}
                        className="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-950 text-white rounded-full text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 shadow-lg"
                        title={edgeCount < 3 ? 'Нужно хотя бы несколько стен' : 'Подтвердить конструктив и перейти к мебели'}
                    >
                        <IconCheck />
                        Подтвердить
                    </button>
                </div>
            )}

            {/* Step 2 / client — one unified furniture dock (presets + items) */}
            {inFurniturePhase && (
                <div className="z-50">
                    <FurnitureDock mode={mode} />
                </div>
            )}

            {/* Post-wizard furniture catalog (manager editing after "Готово") */}
            {showCatalog && !inFurniturePhase && (
                <div className="z-50">
                    <CatalogPanel hideOpenings />
                </div>
            )}

            {/* Review tools strip */}
            {planReviewActive && mode === 'manager' && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 bg-white/80 backdrop-blur-2xl rounded-2xl sm:rounded-full shadow-xl p-1.5 sm:px-3 sm:py-2 border border-white/50 max-w-[95vw]">
                    <button
                        onClick={() => setWallToolMode('draw')}
                        className={`${btnBase} ${editorMode === 'walls' && wallToolMode === 'draw' ? btnActive : btnInactive}`}
                        title="Нарисовать стену"
                    >
                        <IconWalls />
                        <span className="hidden sm:inline">Стена</span>
                    </button>
                    <button
                        onClick={() => setWallToolMode('erase')}
                        className={`${btnBase} ${editorMode === 'walls' && wallToolMode === 'erase' ? 'bg-red-500 text-white shadow-lg scale-105' : btnInactive}`}
                        title="Стереть сегмент стены"
                    >
                        <IconErase />
                        <span className="hidden sm:inline">Ластик</span>
                    </button>
                    <div className={separator} />
                    <button
                        onClick={() => { setEditorMode('openings'); setOpeningToolMode('door'); }}
                        className={`${btnBase} ${editorMode === 'openings' && openingToolMode === 'door' ? btnActive : btnInactive}`}
                    >
                        Дверь
                    </button>
                    <button
                        onClick={() => { setEditorMode('openings'); setOpeningToolMode('balcony_door'); }}
                        className={`${btnBase} ${editorMode === 'openings' && openingToolMode === 'balcony_door' ? btnActive : btnInactive}`}
                        title="Балконная дверь"
                    >
                        Балкон
                    </button>
                    <button
                        onClick={() => { setEditorMode('openings'); setOpeningToolMode('window'); }}
                        className={`${btnBase} ${editorMode === 'openings' && openingToolMode === 'window' ? btnActive : btnInactive}`}
                    >
                        Окно
                    </button>
                    <button
                        onClick={() => { setEditorMode('openings'); setOpeningToolMode('glass_wall'); }}
                        className={`${btnBase} ${editorMode === 'openings' && openingToolMode === 'glass_wall' ? btnActive : btnInactive}`}
                        title="Панорамное остекление / балкон"
                    >
                        Панорама
                    </button>
                    <div className={separator} />
                    <button
                        onClick={() => setEditorMode('view')}
                        className={`${btnBase} ${editorMode === 'view' ? btnActive : btnInactive}`}
                        title="Выбор — клик по стене/проёму, Delete для удаления"
                    >
                        <IconSelect />
                        <span className="hidden sm:inline">Выбор</span>
                    </button>
                    <div className={separator} />
                    <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-gray-400 pl-1">AI</span>
                    <input
                        type="range" min="10" max="250" value={threshold}
                        onChange={(e) => setThreshold(Number(e.target.value), true)}
                        className="w-16 sm:w-20 h-1 bg-gray-300 rounded-full appearance-none cursor-pointer accent-black"
                        title="Чувствительность — перезапуск распознавания"
                    />
                    <button
                        onClick={clearWalls}
                        className="text-[10px] sm:text-xs text-red-500 font-bold hover:bg-red-50 px-2 py-1 rounded"
                    >
                        Очистить
                    </button>
                </div>
            )}

            {/* Openings Helper Toast — only outside review (review already has type buttons) */}
            {editorMode === 'openings' && !isClient && !planReviewActive && (
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 bg-black/80 backdrop-blur-2xl rounded-2xl sm:rounded-full shadow-xl px-3 py-2 sm:px-5 sm:py-2.5 border border-white/10 text-white mb-1 text-center max-w-[90vw]">
                    {!planReviewActive && (
                        <div className="flex bg-white/10 rounded-full p-0.5 gap-0.5">
                            {([
                                ['door', 'Дверь'],
                                ['balcony_door', 'Балкон'],
                                ['window', 'Окно'],
                                ['glass_wall', 'Панорама'],
                            ] as const).map(([mode, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setOpeningToolMode(mode)}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                                        openingToolMode === mode ? 'bg-white text-slate-900' : 'text-white/70 hover:text-white'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                    <span className="text-xs sm:text-sm font-medium">
                        {openingToolMode === 'door' && "👉 Наведите на стену и кликните — обычная дверь"}
                        {openingToolMode === 'balcony_door' && "👉 Наведите на стену и кликните — балконная дверь"}
                        {openingToolMode === 'window' && "👉 Наведите на стену и кликните — окно"}
                        {openingToolMode === 'glass_wall' && "👉 Проведите линию между углами — панорамное остекление"}
                        {" · Двойной клик по стене — добавить угол"}
                    </span>
                </div>
            )}

            {/* Erase helper */}
            {planReviewActive && editorMode === 'walls' && wallToolMode === 'erase' && (
                <div className="flex items-center gap-3 bg-red-600/90 backdrop-blur-2xl rounded-full shadow-xl px-4 py-2 border border-white/10 text-white text-xs sm:text-sm font-medium">
                    👉 Кликните по сегменту стены, чтобы удалить его (вместе с проёмами на нём)
                </div>
            )}

            {/* Wall Settings (Floating Pill) — AI re-process outside review */}
            {(editorMode === 'walls' || planReviewActive) && mode === 'manager' && !planReviewActive && (
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 bg-white/60 backdrop-blur-2xl rounded-2xl sm:rounded-full shadow-xl p-3 sm:px-6 sm:py-3 border border-white/40 max-w-[90vw]">
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                        <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">Чувствительность</span>
                        <input
                            type="range" min="10" max="250" value={threshold}
                            onChange={(e) => setThreshold(Number(e.target.value), true)}
                            className="w-24 sm:w-28 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-black"
                        />
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-gray-400/20" />
                    <div className="flex items-center gap-1.5 justify-center">
                        <button
                            onClick={() => useStore.getState().setImageProcessing({ grayscale: !imageProcessing.grayscale })}
                            className={`p-1.5 rounded-lg border text-[10px] font-bold transition-all ${imageProcessing.grayscale ? 'bg-black text-white border-black' : 'text-gray-500 border-gray-300 hover:border-black'}`}
                            title="Convert to B&W (Ч/Б)"
                        >
                            B&W
                        </button>
                        <button
                            onClick={() => useStore.getState().setImageProcessing({ contrast: imageProcessing.contrast > 1 ? 1.0 : 1.5 })}
                            className={`p-1.5 rounded-lg border text-[10px] font-bold transition-all ${imageProcessing.contrast > 1 ? 'bg-black text-white border-black' : 'text-gray-500 border-gray-300 hover:border-black'}`}
                            title="Boost Contrast (Контраст)"
                        >
                            HDR
                        </button>
                    </div>
                    <div className="hidden sm:block w-px h-6 bg-gray-400/20" />
                    <button
                        onClick={clearWalls}
                        className="text-xs text-red-500 hover:text-red-700 font-bold hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    >
                        ОЧИСТИТЬ
                    </button>
                </div>
            )}

            {/* Main Toolbar (Dock) */}
            <div className="flex items-center flex-wrap sm:flex-nowrap justify-center gap-1.5 sm:gap-2 bg-white/60 backdrop-blur-3xl rounded-2xl sm:rounded-[2rem] shadow-2xl p-1.5 sm:p-3 border border-white/40 max-w-[95vw] sm:max-w-none">
                {/* View Modes */}
                <div className="flex bg-gray-200/30 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 gap-0.5 sm:gap-1">
                    <button onClick={() => setCameraMode('2d')} className={`${btnBase} ${cameraMode === '2d' ? btnActive : btnInactive}`}>
                        <Icon2D />
                    </button>
                    <button
                        onClick={() => setCameraMode('3d')}
                        disabled={planReviewActive}
                        className={`${btnBase} ${planReviewActive ? btnDisabled : (cameraMode === '3d' ? btnActive : btnInactive)}`}
                        title={planReviewActive ? 'Сначала подтвердите план в 2D' : '3D'}
                    >
                        <Icon3D />
                    </button>
                    <button
                        onClick={() => setCameraMode('walk')}
                        disabled={planReviewActive}
                        className={`${btnBase} ${planReviewActive ? btnDisabled : (cameraMode === 'walk' ? btnActive : btnInactive)}`}
                        title={planReviewActive ? 'Сначала подтвердите план в 2D' : 'Прогулка'}
                    >
                        <IconWalk />
                    </button>
                    {cameraMode === '3d' && (
                        <button
                            onClick={toggleWallCutaway}
                            className={`${btnBase} ${wallCutaway3D ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-sm' : btnInactive}`}
                            title={wallCutaway3D ? 'Срез стен (Airbnb кукольный домик): Вкл' : 'Полная высота стен: Вкл'}
                        >
                            <span className="text-xs font-semibold">{wallCutaway3D ? 'Срез стен' : 'Стены 100%'}</span>
                        </button>
                    )}
                </div>

                <div className={separator} />

                {/* Editor Modes — client: only select + furniture */}
                {!planReviewActive && (
                    <div className="flex bg-gray-200/30 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 gap-0.5 sm:gap-1">
                        <button onClick={() => setEditorMode('view')} className={`${btnBase} ${editorMode === 'view' ? btnActive : btnInactive}`}>
                            <IconSelect />
                            <span className="hidden md:inline">Выбор</span>
                        </button>
                        {!isClient && (
                            <>
                                <button
                                    onClick={() => setEditorMode('walls')}
                                    disabled={editorPhase === 'furniture'}
                                    className={`${btnBase} ${editorPhase === 'furniture' ? btnDisabled : (editorMode === 'walls' ? btnActive : btnInactive)}`}
                                    title={editorPhase === 'furniture' ? 'Сначала завершите расстановку мебели' : 'Стены'}
                                >
                                    <IconWalls />
                                    <span className="hidden md:inline">Стены</span>
                                </button>
                                <button
                                    onClick={() => setEditorMode('openings')}
                                    disabled={editorPhase === 'furniture'}
                                    className={`${btnBase} ${editorPhase === 'furniture' ? btnDisabled : (editorMode === 'openings' ? btnActive : btnInactive)}`}
                                    title={editorPhase === 'furniture' ? 'Сначала завершите расстановку мебели' : 'Проёмы'}
                                >
                                    <IconOpenings />
                                    <span className="hidden md:inline">Проемы</span>
                                </button>
                            </>
                        )}
                        <button onClick={() => setEditorMode('furniture')} className={`${btnBase} ${editorMode === 'furniture' ? btnActive : btnInactive}`}>
                            <IconFurniture />
                            <span className="hidden md:inline">{isClient ? 'Переставить' : 'Мебель'}</span>
                        </button>
                    </div>
                )}

                {!planReviewActive && editorPhase === 'furniture' && mode === 'manager' && (
                    <div className="hidden sm:flex items-center px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">
                        Шаг 2 · Мебель
                    </div>
                )}

                <div className={separator} />

                {/* History */}
                <div className="flex items-center px-0.5 gap-0.5">
                    <button onClick={undo} disabled={!canUndo} className={btnIcon} title="Undo"> <IconUndo /> </button>
                    <button onClick={redo} disabled={!canRedo} className={btnIcon} title="Redo"> <IconRedo /> </button>
                </div>

                <div className={separator} />

                {/* Actions */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {onOpenMaterials && (
                        <button
                            onClick={onOpenMaterials}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white/80 hover:bg-white text-slate-800 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold hover:scale-105 active:scale-95 transition-all shadow-sm border border-slate-200/80 flex items-center gap-1 sm:gap-1.5"
                            title="Выбрать отделку пола и цвет стен"
                        >
                            <span>🎨</span>
                            <span className="hidden sm:inline">Отделка</span>
                        </button>
                    )}
                    {onOpenPassport && (
                        <button
                            onClick={onOpenPassport}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold hover:scale-105 active:scale-95 transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1 sm:gap-1.5"
                            title="Сформировать и скачать PDF дизайн-паспорт с экспликацией и ипотекой"
                        >
                            <span>📄</span>
                            <span className="hidden sm:inline">PDF-Паспорт</span>
                        </button>
                    )}
                    {onOpenBake && (
                        <button
                            onClick={onOpenBake}
                            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1 sm:gap-1.5"
                            title="Запустить запекание сцены: 360° тур и чистый 3D Walk"
                        >
                            <span>⚡</span>
                            <span className="hidden sm:inline">Запечь 3D</span>
                        </button>
                    )}
                    {mode === 'manager' && <PlanUploader />}
                    {mode === 'client' && onAIRender && (
                        <button
                            onClick={onAIRender}
                            className="px-3.5 py-1.5 sm:px-5 sm:py-2.5 flat-btn-primary rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-lg flat-shadow-primary flex items-center gap-1 sm:gap-1.5"
                            title="Сгенерировать красивый фото-интерьер"
                        >
                            <span>🪄</span>
                            <span className="hidden sm:inline">ИИ Рендер</span>
                        </button>
                    )}
                    {mode === 'client' && onShareCustom && (
                        <button
                            onClick={onShareCustom}
                            className="px-3.5 py-1.5 sm:px-5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-600/10 flex items-center gap-1 sm:gap-1.5"
                            title="Поделиться этой планировкой с близкими"
                        >
                            <span>🔗</span>
                            <span className="hidden sm:inline">Поделиться</span>
                        </button>
                    )}
                    <button
                        onClick={onShare}
                        disabled={planReviewActive}
                        className={`px-3.5 py-1.5 sm:px-6 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-40 disabled:hover:scale-100 ${
                            mode === 'client'
                                ? 'flat-btn-primary flat-shadow-primary'
                                : 'bg-black text-white shadow-black/10'
                        }`}
                        title={planReviewActive ? 'Сначала подтвердите план' : undefined}
                    >
                        {mode === 'manager' ? 'Сохранить' : (whitelabel?.ctaText || 'Оставить заявку')}
                    </button>
                </div>
            </div>

            {!planReviewActive && !whitelabel?.hideBranding && (
                <div className="text-[10px] text-gray-400 font-medium">
                    Powered by FlatBuilder 3D
                </div>
            )}
        </div>
    );
};
