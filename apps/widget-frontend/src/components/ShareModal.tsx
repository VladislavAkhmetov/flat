import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
    const [shareUrl, setShareUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const scene = useStore((state) => state.scene);

    useEffect(() => {
        if (isOpen) {
            saveAndGenerateLink();
        } else {
            setShareUrl('');
            setCopied(false);
        }
    }, [isOpen]);

    const saveAndGenerateLink = async () => {
        setIsSaving(true);
        try {
            // Save Scene to get the shareToken
            const res = await fetch(`${API_URL}/scenes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: scene })
            });

            if (!res.ok) throw new Error('Failed to save scene');
            const { shareToken } = await res.json();

            // The landing page runs on port 5174. In production, we'd use the current origin.
            // For local development, we point to the landing page origin (usually 5174 or current parent's origin if embedded).
            // Let's resolve the host: if we are embedded, the parent is the landing page.
            // A safe fallback is to check if we are in an iframe and use document.referrer, or just use localhost:5174
            let landingOrigin = 'http://localhost:5174';
            try {
                if (window.self !== window.top && document.referrer) {
                    landingOrigin = new URL(document.referrer).origin;
                }
            } catch (e) {
                console.error('Cannot access referrer origin, defaulting to localhost:5174');
            }

            const url = `${landingOrigin}/?s=${shareToken}`;
            setShareUrl(url);
        } catch (e) {
            console.error('Error sharing scene:', e);
            setShareUrl('Ошибка генерации ссылки.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopy = () => {
        if (!shareUrl || shareUrl.startsWith('Ошибка')) return;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    const qrCodeUrl = shareUrl && !shareUrl.startsWith('Ошибка')
        ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`
        : '';

    const telegramShare = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Посмотри планировку моей будущей квартиры в ЖК Anniversary!')}`;
    const whatsappShare = `https://api.whatsapp.com/send?text=${encodeURIComponent('Посмотри планировку моей будущей квартиры в ЖК Anniversary! ' + shareUrl)}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl p-8 text-white flex flex-col items-center text-center">
                
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/80 text-gray-400 hover:text-white hover:bg-slate-700/80 transition-all"
                >
                    ✕
                </button>

                <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-xl text-indigo-400 mb-4">
                    🔗
                </div>

                <h3 className="text-xl font-bold mb-2">Поделиться планировкой</h3>
                <p className="text-xs text-slate-400 mb-6 font-light">
                    Отправьте эту ссылку близким. Они смогут открыть планировку, обойти её в 3D и даже внести свои предложения.
                </p>

                {isSaving ? (
                    <div className="py-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-slate-400">Сохраняем ваш проект на сервере...</span>
                    </div>
                ) : (
                    <div className="w-full flex flex-col items-center gap-6">
                        {/* URL input and Copy button */}
                        <div className="w-full flex bg-slate-950 border border-slate-800 rounded-2xl p-1.5 items-center pl-4">
                            <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                className="bg-transparent border-none outline-none text-xs text-slate-300 w-full select-all font-mono"
                            />
                            <button
                                onClick={handleCopy}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 whitespace-nowrap ${
                                    copied ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/10'
                                }`}
                            >
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                        </div>

                        {/* QR Code */}
                        {qrCodeUrl && (
                            <div className="p-3 bg-white rounded-2xl border border-slate-200">
                                <img
                                    src={qrCodeUrl}
                                    alt="Share QR Code"
                                    className="w-36 h-36"
                                    onError={(e) => console.error('QR Load fail:', e)}
                                />
                            </div>
                        )}

                        {/* Social Share Buttons */}
                        <div className="flex gap-4 w-full">
                            <a
                                href={telegramShare}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-3 bg-[#229ED9] hover:bg-[#1e8cc2] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                                ✈️ Telegram
                            </a>
                            <a
                                href={whatsappShare}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                                💬 WhatsApp
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
