import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { generatePassportCanvas } from '../utils/pdfGenerator';
import { PRESET_METADATA_LIST } from '../presets';
import { WhitelabelConfig } from '@flat/shared';
import { emitHostEvent } from '../utils/whitelabel';

interface PDFPassportModalProps {
    isOpen: boolean;
    onClose: () => void;
    whitelabel?: WhitelabelConfig;
}

export const PDFPassportModal: React.FC<PDFPassportModalProps> = ({ isOpen, onClose, whitelabel }) => {
    const scene = useStore((state) => state.scene);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Identify current preset metadata
    const params = new URLSearchParams(window.location.search);
    const s = params.get('s') || 'euro2';
    const meta = PRESET_METADATA_LIST.find((p) => p.id === s) || PRESET_METADATA_LIST[1];

    useEffect(() => {
        if (!isOpen) return;

        const canvas = generatePassportCanvas({
            apartmentTitle: meta.title,
            apartmentType: meta.roomsLabel,
            area: meta.area,
            floor: meta.floor,
            ceiling: meta.ceiling,
            price: meta.price,
            clientName: name,
            clientPhone: phone,
            shareUrl: window.location.href,
            scene: scene,
            brandName: whitelabel?.brandName,
            brandSubtitle: whitelabel?.brandSubtitle,
            primaryColor: whitelabel?.primaryColor,
        });

        canvasRef.current = canvas;
        setPreviewUrl(canvas.toDataURL('image/png'));
    }, [isOpen, scene, meta, name, phone, whitelabel]);

    if (!isOpen) return null;

    const handleDownload = () => {
        if (!canvasRef.current) return;
        setIsGenerating(true);

        setTimeout(() => {
            const dataUrl = canvasRef.current!.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `Паспорт_квартиры_${meta.title.replace(/\s+/g, '_')}.png`;
            link.href = dataUrl;
            link.click();
            setIsGenerating(false);

            emitHostEvent('flat:passport_downloaded', {
                apartmentTitle: meta.title,
                area: meta.area,
                clientName: name,
                clientPhone: phone,
                brand: whitelabel?.brandName
            });

            // Also post lead to backend if phone is entered
            if (phone.trim().length >= 10) {
                fetch('/api/leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name || 'Покупатель с сайта (PDF)',
                        phone: phone,
                        comment: `Скачал PDF-паспорт планировки: ${meta.title}, ${meta.area}, отделка: ${scene.materials?.floorId || 'стандарт'}`,
                        shareToken: s,
                        sceneId: s,
                        brand: whitelabel?.brandName,
                        sourceUrl: window.location.href,
                        webhookUrl: whitelabel?.webhookUrl
                    })
                }).catch(() => {});
            }
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                {/* Left Side: Document Visual Preview */}
                <div className="flex-1 bg-slate-950/90 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto">
                    <div className="text-center mb-3">
                        <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Предпросмотр дизайн-паспорта</span>
                        <p className="text-xs text-slate-400">Формат А4 (Печать и электронный буклет)</p>
                    </div>

                    {previewUrl ? (
                        <div className="relative shadow-2xl border border-slate-700/60 rounded-lg overflow-hidden max-h-[500px] w-full max-w-[360px] group">
                            <img src={previewUrl} alt="Design Passport" className="w-full h-auto object-contain" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center pointer-events-none">
                                <span className="text-xs font-bold text-white bg-slate-900/80 px-3 py-1.5 rounded-full border border-white/20">
                                    🔍 Нажмите Скачать для полного разрешения
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-64 h-80 bg-slate-800 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-500">
                            Формирование паспорта...
                        </div>
                    )}
                </div>

                {/* Right Side: Lead Capture & Download Form */}
                <div className="w-full md:w-96 p-6 flex flex-col justify-between bg-slate-900">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-base font-bold text-white">Паспорт и расчет ипотеки</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Сохраните планировку с выбранной отделкой и мебелью</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Included Features List */}
                        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800 space-y-2 mb-4">
                            <div className="text-xs font-bold flat-text-primary">Что входит в документ:</div>
                            <ul className="text-[11px] text-slate-300 space-y-1.5">
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span> Точный чертеж с расстановкой мебели
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span> Экспликация комнат с площадями
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span> Спецификация чистовой отделки
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span> Расчет семейной и льготной ипотеки
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-emerald-400">✓</span> QR-код на интерактивную 3D прогулку
                                </li>
                            </ul>
                        </div>

                        {/* Contact Inputs */}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Ваше имя (для заголовка)</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Константин"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-xs focus:outline-none flat-border-primary transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Телефон (для бронирования ставки)</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="+7 (999) 000-00-00"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-xs focus:outline-none flat-border-primary transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 space-y-2">
                        <button
                            onClick={handleDownload}
                            disabled={isGenerating}
                            className="w-full py-3 flat-btn-primary font-bold text-xs rounded-xl transition-all flat-shadow-primary active:scale-98 flex items-center justify-center gap-2"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                    <span>Формирование...</span>
                                </>
                            ) : (
                                <>
                                    <span>📥</span>
                                    <span>Скачать Дизайн-Паспорт</span>
                                </>
                            )}
                        </button>
                        <p className="text-[10px] text-center text-slate-500">
                            Мгновенное скачивание документа в высоком разрешении
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
