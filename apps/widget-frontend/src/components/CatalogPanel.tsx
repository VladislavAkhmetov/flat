import React from 'react';
import { useStore } from '../store';
import { FURNITURE_CATALOG } from '../catalog';

// Simple SVG Icons for Catalog
const FurnitureIcon: React.FC<{ type: string, className?: string }> = ({ type, className }) => {
    // Map catalog IDs or Categories to simple shapes
    // This is a simplified visual representation
    const props = { className: `${className} stroke-current`, strokeWidth: 1.5, fill: "none", viewBox: "0 0 24 24" };

    if (type.includes('bed')) return (
        <svg {...props}><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /><path d="M2 14h20" /></svg>
    );
    if (type.includes('sofa')) return (
        <svg {...props}><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" /><path d="M2 13h20v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /><path d="M2 13h4" /><path d="M18 13h4" /></svg>
    );
    if (type.includes('table')) return (
        <svg {...props}><path d="M2 15h20" /><path d="M12 4v11" /><path d="M4 15v4" /><path d="M20 15v4" /><circle cx="12" cy="7" r="3" /></svg>
    );
    if (type.includes('bath')) return (
        <svg {...props}><path d="M2 14h20" /><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /><path d="M16 14V6h2" /><path d="M16 8h-2" /></svg>
    );
    if (type.includes('toilet')) return (
        <svg {...props}><path d="M7 11h10v6a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-6" /><path d="M8 11V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v5" /></svg>
    );
    if (type.includes('shower')) return (
        <svg {...props}><path d="M4 4h16v16H4z" /><path d="M12 4v4" /><circle cx="12" cy="4" r="1" /></svg>
    );
    if (type.includes('door')) return (
        <svg {...props}><path d="M4 22h16" /><path d="M5 22V2h14v20" /><path d="M16 12h-2" /></svg>
    );
    if (type.includes('window')) return (
        <svg {...props}><path d="M4 4h16v16H4z" /><path d="M12 4v16" /><path d="M4 12h16" /></svg>
    );
    if (type.includes('chair') || type.includes('armchair')) return (
        <svg {...props}><path d="M19 9h2v11h-2" /><path d="M5 9H3v11h2" /><path d="M5 14h14" /><path d="M6 5h12a1 1 0 0 1 1 1v8H5V6a1 1 0 0 1 1-1z" /></svg>
    );
    if (type.includes('tv')) return (
        <svg {...props}><rect x="2" y="7" width="20" height="11" rx="2" ry="2" /><path d="M16 21V18" /><path d="M8 21V18" /><path d="M12 18V7" /></svg>
    );
    if (type.includes('wardrobe')) return (
        <svg {...props}><rect x="4" y="4" width="16" height="18" rx="2" /><path d="M8 4v18" /><path d="M16 4v18" /><path d="M12 10v2" /></svg>
    );
    if (type.includes('spawn')) return (
        <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 17V7" /><path d="m9 10 3-3 3 3" /></svg> // Clean walk direction up arrow in a circle
    );

    // Default Box
    return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
};

export const CatalogPanel: React.FC = () => {
    const activeCatalogId = useStore((state) => state.activeCatalogId);
    const setActiveCatalogId = useStore((state) => state.setActiveCatalogId);

    // Group by category
    const grouped = FURNITURE_CATALOG.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, typeof FURNITURE_CATALOG>);

    const categories = Object.keys(grouped);
    const [activeTab, setActiveTab] = React.useState(categories[0]);

    // Localization Map
    const translations: Record<string, string> = {
        // Categories
        'furniture': 'Мебель',
        'kitchen': 'Кухня',
        'plumbing': 'Ванная', // Plumbing -> Bathroom usually
        'bathroom': 'Ванная',
        'opening': 'Двери/Окна',
        'doors': 'Двери',
        // Items
        'Spawn Point': 'Точка спауна',
        'Double Bed': 'Кровать 2-сп',
        'Single Bed': 'Кровать 1-сп',
        'Sofa 3-Seat': 'Диван 3-мест',
        'Sofa 2-Seat': 'Диван 2-мест',
        'Armchair': 'Кресло',
        'Dining Table': 'Стол обед.',
        'Office Desk': 'Стол рабочий',
        'Chair': 'Стул',
        'Wardrobe': 'Шкаф',
        'Bookshelf': 'Стеллаж',
        'TV Stand': 'Тумба ТВ',
        'TV': 'Телевизор',
        'Kitchen Island': 'Остров',
        'Kitchen Cabinet': 'Шкаф кух.',
        'Fridge': 'Холод.',
        'Stove': 'Плита',
        'Sink': 'Раковина',
        'Toilet': 'Унитаз',
        'Shower': 'Душ',
        'Bathtub': 'Ванна',
        'Door': 'Дверь',
        'Window': 'Окно'
    };

    const t = (key: string) => translations[key] || key;

    // Apply "Apple 2026" Aesthetics
    // Floating Dock style: Horizontal scroll, glassmorphism, unified container
    return (
        <div className="flex flex-col gap-3 pointer-events-auto transform transition-all items-center">

            {/* Main Dock Container */}
            <div className="bg-white/90 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/60 p-4 w-auto max-w-[90vw] flex flex-col gap-4 animate-in slide-in-from-bottom-5 fade-in duration-300 z-50">

                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1 justify-center">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveTab(cat)}
                            className={`px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-all whitespace-nowrap ${activeTab === cat
                                ? 'bg-black text-white shadow-lg scale-105'
                                : 'bg-white/50 text-gray-500 hover:bg-white hover:text-black hover:scale-105'
                                }`}
                        >
                            {t(cat)}
                        </button>
                    ))}
                </div>

                {/* Horizontal Items Strip */}
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1 min-h-[90px] items-center">
                    {grouped[activeTab]?.map(item => {
                        const isActive = activeCatalogId === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveCatalogId(isActive ? null : item.id)}
                                className={`group flex flex-col items-center gap-2 min-w-[72px] transition-all duration-300 ${isActive ? 'scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'
                                    }`}
                            >
                                {/* Icon Container */}
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all border ${isActive
                                    ? 'bg-blue-500 text-white border-blue-400 shadow-blue-500/30'
                                    : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300 hover:shadow-md'
                                    }`}>
                                    {/* Use SVG Icon */}
                                    <FurnitureIcon type={item.id} className="w-7 h-7" />
                                </div>

                                {/* Label */}
                                <span className={`text-[10px] font-semibold text-center leading-tight max-w-[80px] truncate ${isActive ? 'text-blue-600' : 'text-gray-500'
                                    }`}>
                                    {t(item.name)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
