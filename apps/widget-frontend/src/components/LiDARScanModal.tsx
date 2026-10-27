import React, { useRef, useState } from 'react';
import { useStore } from '../store';
import {
  convertRoomPlanToSceneData,
  DEMO_ROOMPLAN_SCAN,
  isRoomPlanData,
} from '@flat/shared';

interface LiDARScanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiDARScanModal: React.FC<LiDARScanModalProps> = ({ isOpen, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadScene = useStore((state) => state.loadScene);
  const setCameraMode = useStore((state) => state.setCameraMode);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyDemo = () => {
    setIsLoading(true);
    setStatusMessage('Процедурная реконструкция 3D-плана из демо-скана LiDAR...');
    setErrorMessage(null);

    setTimeout(() => {
      try {
        const scene = convertRoomPlanToSceneData(DEMO_ROOMPLAN_SCAN);
        loadScene(scene);
        setCameraMode('3d');
        setIsLoading(false);
        onClose();
      } catch (err: any) {
        setErrorMessage(`Ошибка при обработке демо-скана: ${err.message || err}`);
        setIsLoading(false);
      }
    }, 350);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage(`Чтение файла скана ${file.name}...`);
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!isRoomPlanData(parsed) && !parsed.walls) {
          throw new Error('Файл не содержит распознанных структур Apple RoomPlan (walls, objects, doors)');
        }

        setStatusMessage('Реконструкция стен, проёмов и подбор модульной мебели...');
        setTimeout(() => {
          const scene = convertRoomPlanToSceneData(parsed);
          loadScene(scene);
          setCameraMode('3d');
          setIsLoading(false);
          onClose();
        }, 400);
      } catch (err: any) {
        console.error('[LiDARScanModal] Parse error:', err);
        setErrorMessage(`Не удалось импортировать скан: ${err.message || 'Неверный формат JSON'}`);
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Не удалось прочитать файл');
      setIsLoading(false);
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-800/80 overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-200/60 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 text-2xl">
              📱
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">3D-план по LiDAR-скану</h3>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Airbnb-стиль
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Импорт 3D-сканов с iPhone (Apple RoomPlan API) в интерактивную модель
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Demo Option */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between hover:border-amber-500/60 dark:hover:border-amber-500/60 transition-all group">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>⚡</span>
                  Попробовать демо-скан
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Готовый пример реального скана квартиры (евро-двушка): замкнутые стены, двери, окна и расстановка мебели.
                </p>
              </div>
              <button
                onClick={handleApplyDemo}
                disabled={isLoading}
                className="mt-4 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>🚀</span>
                Загрузить демо в 3D
              </button>
            </div>

            {/* Custom JSON Upload Option */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between hover:border-blue-500/60 dark:hover:border-blue-500/60 transition-all group">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>📂</span>
                  Загрузить файл скана (.json)
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  Файл экспорта Apple RoomPlan из приложений сканирования на iPhone 12 Pro–16 Pro или iPad Pro.
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="mt-4 w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-bold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>📎</span>
                Выбрать JSON-файл
              </button>
            </div>
          </div>

          {/* Status / Error Notifications */}
          {isLoading && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-3 text-amber-800 dark:text-amber-200 text-xs">
              <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>{statusMessage || 'Обработка данных 3D-сканирования...'}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 font-bold ml-2">✕</button>
            </div>
          )}

          {/* Pipeline Explanation */}
          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              Пайплайн реконструкции (как у Airbnb)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-slate-600 dark:text-slate-400">
              <div className="p-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-800">
                <div className="text-base mb-1">📡</div>
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">1. Сырые данные</div>
                <div className="text-[10px] text-slate-400 mt-0.5">LiDAR-скан с iPhone</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-800">
                <div className="text-base mb-1">📐</div>
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">2. Реконструкция</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Смыкание углов и 90°</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-800">
                <div className="text-base mb-1">🛋️</div>
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">3. Каталог мебели</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Привязка объектов</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/60 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-800">
                <div className="text-base mb-1">✨</div>
                <div className="text-[11px] font-bold text-slate-900 dark:text-white">4. 3D Three.js</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Обход и просмотр</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Поддерживаются устройства Apple с LiDAR (iOS 16+)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
