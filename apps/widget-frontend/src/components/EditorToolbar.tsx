import React from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';
import { PlanUploader } from './PlanUploader';
import { CatalogPanel } from './CatalogPanel';

// --- Icons (Lucide Style) ---
const Icon2D = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><path d="M9 3v18" /><path d="M3 9h18" /></svg>;
const Icon3D = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
const IconWalk = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10V4" /></svg>;

const IconSelect = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="m13 13 6 6" /></svg>;
const IconWalls = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
const IconOpenings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M13 11v10" /><path d="M5 11h14" /></svg>;
const IconFurniture = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" /><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z" /><path d="M5 18v2" /><path d="M19 18v2" /></svg>;

const IconUndo = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>;
const IconRedo = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>;


export const EditorToolbar: React.FC<{
    onShare: () => void;
    onAIRender?: () => void;
    onShareCustom?: () => void;
    mode?: 'manager' | 'client';
}> = ({ onShare, onAIRender, onShareCustom, mode = 'manager' }) => {
    const cameraMode = useStore((state) => state.scene.camera.mode);
    const editorMode = useStore((state) => state.editorMode);
    const threshold = useStore((state) => state.detectionThreshold);
    const setEditorMode = useStore((state) => state.setEditorMode);
    const setThreshold = useStore((state) => state.setThreshold);
    const wallCount = useStore((state) => state.scene.edges.length);
    const clearWalls = useStore((state) => state.clearWalls);
    const imageProcessing = useStore((state) => state.imageProcessing); // Hook moved to top level
    const openingToolMode = useStore((state) => state.openingToolMode);

    const undo = useStore((state) => state.undo);
    const redo = useStore((state) => state.redo);
    const past = useStore((state) => state.past);
    const future = useStore((state) => state.future);

    const setCameraMode = (mode: '2d' | '3d' | 'walk') => {
        useStore.setState(state => ({
            scene: { ...state.scene, camera: { ...state.scene.camera, mode } }
        }));
    };

    const btnBase = "px-2.5 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl text-xs md:text-sm font-medium transition-all duration-300 flex items-center gap-1 md:gap-2";
    const btnActive = "bg-white text-black shadow-lg shadow-black/5 scale-105";
    const btnInactive = "text-gray-500 hover:text-gray-900 hover:bg-white/40";
    const btnIcon = "w-8.5 h-8.5 md:w-10 md:h-10 flex items-center justify-center rounded-xl md:rounded-2xl hover:bg-white/60 text-gray-600 transition-all active:scale-95 disabled:opacity-30";
    const separator = "hidden sm:block w-px h-6 bg-gray-400/20";

    return (
        <div className="flex flex-col items-center gap-4 pointer-events-auto select-none">
            {/* Furniture Catalog (Floating Panel) */}
            {editorMode === 'furniture' && (
                <div className="absolute bottom-[7.5rem] sm:bottom-36 left-1/2 -translate-x-1/2 mb-4 z-50">
                    <CatalogPanel />
                </div>
            )}

            {/* Openings Helper Toast */}
            {editorMode === 'openings' && (
                <div className="flex items-center gap-4 bg-black/80 backdrop-blur-2xl rounded-full shadow-xl px-4 py-2 sm:px-6 sm:py-3 border border-white/10 text-white mb-2 text-center max-w-[90vw]">
                    <span className="text-xs sm:text-sm font-medium">
                        {openingToolMode === 'door' && "👉 Наведите на стену и кликните, чтобы врезать Дверь"}
                        {openingToolMode === 'window' && "👉 Наведите на стену и кликните, чтобы врезать Окно"}
                        {openingToolMode === 'glass_wall' && "👉 Проведите линию между углами стен, чтобы возвести Окно-Стену (Панораму)"}
                    </span>
                </div>
            )}

            {/* Wall Settings (Floating Pill) */}
            {editorMode === 'walls' && (
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 bg-white/60 backdrop-blur-2xl rounded-2xl sm:rounded-full shadow-xl p-3 sm:px-6 sm:py-3 border border-white/40 max-w-[90vw]">
                    {mode === 'manager' && (
                        <>
                            <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                                <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wide">Чувствительность</span>
                                <input
                                    type="range" min="10" max="250" value={threshold}
                                    onChange={(e) => setThreshold(Number(e.target.value))}
                                    className="w-24 sm:w-28 h-1.5 bg-gray-300 rounded-full appearance-none cursor-pointer accent-black"
                                />
                            </div>

                            <div className="hidden sm:block w-px h-6 bg-gray-400/20" />

                            {/* Image Pre-processing Controls */}
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
                        </>
                    )}
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
                    <button onClick={() => setCameraMode('3d')} className={`${btnBase} ${cameraMode === '3d' ? btnActive : btnInactive}`}>
                        <Icon3D />
                    </button>
                    <button onClick={() => setCameraMode('walk')} className={`${btnBase} ${cameraMode === 'walk' ? btnActive : btnInactive}`}>
                        <IconWalk />
                    </button>
                </div>

                <div className={separator} />

                {/* Editor Modes */}
                <div className="flex bg-gray-200/30 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 gap-0.5 sm:gap-1">
                    <button onClick={() => setEditorMode('view')} className={`${btnBase} ${editorMode === 'view' ? btnActive : btnInactive}`}>
                        <IconSelect />
                        <span className="hidden md:inline">Выбор</span>
                    </button>
                    <button onClick={() => setEditorMode('walls')} className={`${btnBase} ${editorMode === 'walls' ? btnActive : btnInactive}`}>
                        <IconWalls />
                        <span className="hidden md:inline">Стены</span>
                    </button>
                    <button onClick={() => setEditorMode('openings')} className={`${btnBase} ${editorMode === 'openings' ? btnActive : btnInactive}`}>
                        <IconOpenings />
                        <span className="hidden md:inline">Проемы</span>
                    </button>
                    <button onClick={() => setEditorMode('furniture')} className={`${btnBase} ${editorMode === 'furniture' ? btnActive : btnInactive}`}>
                        <IconFurniture />
                        <span className="hidden md:inline">Мебель</span>
                    </button>
                </div>

                <div className={separator} />

                {/* History */}
                <div className="flex items-center px-0.5 gap-0.5">
                    <button onClick={undo} disabled={past.length === 0} className={btnIcon} title="Undo"> <IconUndo /> </button>
                    <button onClick={redo} disabled={future.length === 0} className={btnIcon} title="Redo"> <IconRedo /> </button>
                </div>

                <div className={separator} />

                {/* Actions */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {mode === 'manager' && <PlanUploader />}
                    {mode === 'client' && onAIRender && (
                        <button
                            onClick={onAIRender}
                            className="px-3.5 py-1.5 sm:px-5 sm:py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-amber-500/10 flex items-center gap-1 sm:gap-1.5"
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
                        className="px-3.5 py-1.5 sm:px-6 sm:py-2.5 bg-black text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/10"
                    >
                        {mode === 'manager' ? 'Сохранить' : 'Оставить заявку'}
                    </button>
                </div>
            </div>

            <div className="text-[10px] text-gray-400 font-medium">
                FlatBuilder UI 2.0
            </div>
        </div>
    );
};
