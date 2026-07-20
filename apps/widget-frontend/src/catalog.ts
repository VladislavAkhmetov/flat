export interface CatalogItem {
    id: string;
    name: string;
    category: 'furniture' | 'plumbing' | 'kitchen' | 'opening';
    dimensions: { width: number; height: number; depth: number }; // x, y, z
    color: string;
}

export const FURNITURE_CATALOG: CatalogItem[] = [
    // Furniture
    { id: 'bed_double', name: 'Double Bed', category: 'furniture', dimensions: { width: 1.6, height: 0.5, depth: 2.0 }, color: '#3b82f6' },
    { id: 'bed_single', name: 'Single Bed', category: 'furniture', dimensions: { width: 0.9, height: 0.5, depth: 2.0 }, color: '#60a5fa' },
    { id: 'sofa_corner', name: 'Corner Sofa', category: 'furniture', dimensions: { width: 2.2, height: 0.8, depth: 2.2 }, color: '#047857' },
    { id: 'sofa_3', name: 'Sofa 3-Seat', category: 'furniture', dimensions: { width: 2.2, height: 0.8, depth: 0.9 }, color: '#10b981' },
    { id: 'sofa_2', name: 'Sofa 2-Seat', category: 'furniture', dimensions: { width: 1.6, height: 0.8, depth: 0.9 }, color: '#059669' },
    { id: 'armchair', name: 'Armchair', category: 'furniture', dimensions: { width: 0.9, height: 0.8, depth: 0.9 }, color: '#059669' },
    { id: 'bedside_table', name: 'Bedside Table', category: 'furniture', dimensions: { width: 0.5, height: 0.5, depth: 0.45 }, color: '#d97706' },
    { id: 'chair_dining', name: 'Dining Chair', category: 'furniture', dimensions: { width: 0.45, height: 0.85, depth: 0.45 }, color: '#b45309' },
    { id: 'chair_office', name: 'Office Chair', category: 'furniture', dimensions: { width: 0.65, height: 0.9, depth: 0.65 }, color: '#34d399' },
    { id: 'table_dining', name: 'Dining Table', category: 'furniture', dimensions: { width: 1.2, height: 0.75, depth: 0.8 }, color: '#d97706' },
    { id: 'table_desk', name: 'Desk', category: 'furniture', dimensions: { width: 1.2, height: 0.75, depth: 0.6 }, color: '#b45309' },
    { id: 'tv_stand', name: 'TV Stand', category: 'furniture', dimensions: { width: 1.6, height: 0.5, depth: 0.45 }, color: '#7c3aed' },
    { id: 'tv', name: 'TV', category: 'furniture', dimensions: { width: 1.2, height: 0.7, depth: 0.15 }, color: '#1e293b' },
    { id: 'wardrobe', name: 'Wardrobe', category: 'furniture', dimensions: { width: 1.0, height: 2.2, depth: 0.6 }, color: '#8b5cf6' },

    // Kitchen
    { id: 'kitchen_module', name: 'Kitchen 60cm', category: 'kitchen', dimensions: { width: 0.6, height: 0.9, depth: 0.6 }, color: '#ef4444' },
    { id: 'stove', name: 'Stove', category: 'kitchen', dimensions: { width: 0.6, height: 0.9, depth: 0.6 }, color: '#475569' },
    { id: 'refrigerator', name: 'Refrigerator', category: 'kitchen', dimensions: { width: 0.6, height: 1.8, depth: 0.6 }, color: '#cbd5e1' },
    { id: 'sink_kitchen', name: 'Kitchen Sink', category: 'kitchen', dimensions: { width: 0.8, height: 0.9, depth: 0.6 }, color: '#cbd5e1' },
    { id: 'kitchen_set', name: 'Integrated Kitchen Set', category: 'kitchen', dimensions: { width: 1.8, height: 0.9, depth: 0.6 }, color: '#334155' },

    // Plumbing
    { id: 'bath', name: 'Bath', category: 'plumbing', dimensions: { width: 1.7, height: 0.6, depth: 0.75 }, color: '#0ea5e9' },
    { id: 'toilet', name: 'Toilet', category: 'plumbing', dimensions: { width: 0.4, height: 0.5, depth: 0.7 }, color: '#38bdf8' },
    { id: 'shower', name: 'Shower', category: 'plumbing', dimensions: { width: 0.9, height: 2.0, depth: 0.9 }, color: '#0284c7' },
    { id: 'washing_machine', name: 'Washing Machine', category: 'plumbing', dimensions: { width: 0.6, height: 0.85, depth: 0.6 }, color: '#cbd5e1' },
    { id: 'sink', name: 'Sink', category: 'plumbing', dimensions: { width: 0.6, height: 0.85, depth: 0.5 }, color: '#e2e8f0' },

    // Openings (Doors/Windows)
    { id: 'door_standard', name: 'Door', category: 'opening', dimensions: { width: 0.8, height: 2.0, depth: 0.15 }, color: '#a8a29e' },
    { id: 'window_standard', name: 'Window', category: 'opening', dimensions: { width: 1.2, height: 1.4, depth: 0.2 }, color: '#bfdbfe' },
];

