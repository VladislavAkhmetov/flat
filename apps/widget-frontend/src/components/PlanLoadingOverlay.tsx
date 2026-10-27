import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type PlanLoadPhase = 'upload' | 'recognize' | 'apply';

const STEPS = [
    { id: 'upload', title: 'Загружаем файл', hint: 'Картинка ушла на сервер' },
    { id: 'read', title: 'Читаем чертёж', hint: 'Смотрим линии, подписи и масштаб' },
    { id: 'walls', title: 'Ищем стены', hint: 'Несущие стены и перегородки' },
    { id: 'openings', title: 'Ищем двери и окна', hint: 'Проёмы на стенах' },
    { id: 'rooms', title: 'Ищем комнаты и мебель', hint: 'Кухня, с/у, подписи площадей' },
    { id: 'build', title: 'Собираем план', hint: 'Сейчас появится чертёж — его можно поправить' },
] as const;

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function visualStep(phase: PlanLoadPhase, elapsedMs: number): number {
    if (phase === 'upload') return 0;
    if (phase === 'apply') return 5;
    if (elapsedMs < 2500) return 1;
    if (elapsedMs < 8000) return 2;
    if (elapsedMs < 16000) return 3;
    return 4;
}

function progressPercent(phase: PlanLoadPhase, elapsedMs: number): number {
    if (phase === 'upload') return Math.min(12, 6 + elapsedMs / 400);
    if (phase === 'apply') return 94;
    // Recognize: creep toward 88%, never finish until the request returns
    const t = elapsedMs / 1000;
    const target = 18 + 70 * (1 - Math.exp(-t / 14));
    return Math.min(88, target);
}

export const PlanLoadingOverlay: React.FC<{
    open: boolean;
    phase: PlanLoadPhase;
    fileName?: string;
    fileSize?: number;
    previewUrl?: string | null;
    isReprocess?: boolean;
}> = ({ open, phase, fileName, fileSize, previewUrl, isReprocess }) => {
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        if (!open) {
            setElapsedMs(0);
            return;
        }
        const t0 = Date.now();
        const id = window.setInterval(() => setElapsedMs(Date.now() - t0), 200);
        return () => window.clearInterval(id);
    }, [open, phase]);

    if (!open) return null;

    const stepIdx = visualStep(phase, elapsedMs);
    const pct = Math.round(progressPercent(phase, elapsedMs));
    const seconds = Math.floor(elapsedMs / 1000);
    const slow = seconds >= 25;

    const node = (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-busy="true"
            aria-labelledby="plan-load-title"
        >
            <div className="w-full max-w-[28rem] bg-white rounded-[1.75rem] shadow-2xl border border-white/70 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                <div className="flex gap-3 items-center px-5 pt-5 pb-3">
                    <div className="w-[4.5rem] h-[4.5rem] rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {previewUrl ? (
                            <img src={previewUrl} alt="" className="w-full h-full object-contain bg-white" />
                        ) : (
                            <span className="text-2xl" aria-hidden>📐</span>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                            {isReprocess ? 'Обновление' : 'Шаг 1 · Распознавание'}
                        </div>
                        <h2 id="plan-load-title" className="text-base font-bold text-slate-900 leading-tight">
                            {isReprocess ? 'Пересчитываем стены' : 'Распознаём вашу планировку'}
                        </h2>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {fileName || 'изображение'}
                            {fileSize ? ` · ${formatSize(fileSize)}` : ''}
                        </p>
                    </div>
                </div>

                <p className="px-5 text-[13px] text-slate-600 leading-snug">
                    ИИ ищет стены, двери и окна на картинке.
                    {slow
                        ? ' Большой чертёж — ещё немного, не закрывайте вкладку.'
                        : ' Обычно 15–40 секунд, подождите.'}
                </p>

                <ol className="px-5 py-4 flex flex-col gap-2">
                    {STEPS.map((step, i) => {
                        const done = i < stepIdx;
                        const active = i === stepIdx;
                        return (
                            <li key={step.id} className="flex items-start gap-2.5">
                                <span
                                    className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                        done
                                            ? 'bg-emerald-500 text-white'
                                            : active
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-slate-100 text-slate-400'
                                    }`}
                                >
                                    {done ? '✓' : active ? (
                                        <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : i + 1}
                                </span>
                                <span className="min-w-0">
                                    <span className={`block text-sm font-semibold ${active ? 'text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {step.title}
                                    </span>
                                    {active && (
                                        <span className="block text-[11px] text-slate-500">{step.hint}</span>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ol>

                <div className="px-5 pb-5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-[width] duration-300"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] font-semibold text-slate-400">
                        <span>{seconds > 0 ? `${seconds} сек` : 'Начинаем…'}</span>
                        <span>{pct}%</span>
                    </div>
                    <p className="mt-3 text-[11px] text-slate-500 leading-snug bg-slate-50 rounded-xl px-3 py-2">
                        Дальше откроется 2D-план: проверьте стены и окна, затем нажмите «Подтвердить план».
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(node, document.body);
};
