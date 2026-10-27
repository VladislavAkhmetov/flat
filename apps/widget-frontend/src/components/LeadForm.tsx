import React, { useState } from 'react';
import { WhitelabelConfig } from '@flat/shared';

interface LeadFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string, phone: string, comment: string }) => void;
    isSubmitting: boolean;
    whitelabel?: WhitelabelConfig;
}

export const LeadForm: React.FC<LeadFormProps> = ({ isOpen, onClose, onSubmit, isSubmitting, whitelabel }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [comment, setComment] = useState('');

    if (!isOpen) return null;

    const brandName = whitelabel?.brandName || 'FlatBuilder';
    const ctaText = whitelabel?.ctaText || 'Оставить заявку';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transition-all">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full flat-btn-primary animate-pulse" />
                        <span className="text-[11px] font-bold uppercase tracking-wider flat-text-primary">
                            {brandName}
                        </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {ctaText}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Менеджер проекта свяжется с вами в течение 10 минут, согласует планировку и подготовит индивидуальный расчет
                    </p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, phone, comment }); }} className="p-6 flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Ваше имя *
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 flat-border-primary"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Константин"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Телефон для связи *
                        </label>
                        <input
                            type="tel"
                            required
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 flat-border-primary"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="+7 (999) 000-00-00"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Пожелания по отделке или ипотеке
                        </label>
                        <textarea
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm h-20 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Интересует семейная ипотека и чистовая отделка..."
                        />
                    </div>

                    <div className="flex gap-2.5 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-all"
                        >
                            Закрыть
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-4 flat-btn-primary rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            {isSubmitting ? 'Отправка...' : (ctaText || 'Отправить')}
                        </button>
                    </div>

                    {!whitelabel?.hideBranding && (
                        <div className="text-center pt-2">
                            <span className="text-[10px] text-slate-400">
                                Powered by <span className="font-semibold text-slate-500 dark:text-slate-300">FlatBuilder 3D</span>
                            </span>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

