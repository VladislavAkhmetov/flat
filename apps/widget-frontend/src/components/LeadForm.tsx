import React, { useState } from 'react';
import { useStore } from '../store';

interface LeadFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string, phone: string, comment: string }) => void;
    isSubmitting: boolean;
}

export const LeadForm: React.FC<LeadFormProps> = ({ isOpen, onClose, onSubmit, isSubmitting }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [comment, setComment] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm overflow-hidden">
                <div className="p-4 border-b">
                    <h2 className="text-lg font-bold">Сохранить проект</h2>
                    <p className="text-sm text-gray-500">Оставьте контакты, чтобы получить ссылку</p>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, phone, comment }); }} className="p-4 flex flex-col gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Имя</label>
                        <input
                            type="text"
                            required
                            className="w-full border rounded p-2 text-sm"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Иван"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Телефон</label>
                        <input
                            type="tel"
                            required
                            className="w-full border rounded p-2 text-sm"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="+7 (999) 000-00-00"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Комментарий</label>
                        <textarea
                            className="w-full border rounded p-2 text-sm h-20 resize-none"
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Хочу консультацию..."
                        />
                    </div>

                    <div className="flex gap-2 mt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 text-gray-600 bg-gray-100 rounded text-sm hover:bg-gray-200"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-2 text-white bg-indigo-600 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Отправка...' : 'Отправить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
