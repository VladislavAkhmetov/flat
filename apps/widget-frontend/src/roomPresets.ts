import { v4 as uuidv4 } from 'uuid';
import type { FurnitureObject } from '@flat/shared';

export interface RoomPresetItem {
    catalogId: string;
    /** Offset from preset anchor (meters, plan XZ). */
    dx: number;
    dz: number;
    rot?: number;
    scale?: { x: number; y: number; z: number };
}

export interface RoomPreset {
    id: string;
    name: string;
    /** Short hint under the chip */
    hint: string;
    items: RoomPresetItem[];
}

/** One-click room kits — free, no external assets. */
export const ROOM_PRESETS: RoomPreset[] = [
    {
        id: 'bedroom',
        name: 'Спальня',
        hint: 'кровать · тумбы · шкаф',
        items: [
            { catalogId: 'bed_double', dx: 0, dz: 0 },
            { catalogId: 'bedside_table', dx: -1.15, dz: -0.6 },
            { catalogId: 'bedside_table', dx: 1.15, dz: -0.6 },
            { catalogId: 'wardrobe', dx: 0, dz: 1.6, rot: Math.PI },
        ],
    },
    {
        id: 'living',
        name: 'Гостиная',
        hint: 'диван · кресло · ТВ',
        items: [
            { catalogId: 'sofa_3', dx: 0, dz: 0.4 },
            { catalogId: 'armchair', dx: 1.6, dz: 0.2, rot: -0.4 },
            { catalogId: 'tv_stand', dx: 0, dz: -1.5, rot: Math.PI },
            { catalogId: 'tv', dx: 0, dz: -1.55, rot: Math.PI },
        ],
    },
    {
        id: 'kitchen',
        name: 'Кухня',
        hint: 'гарнитур · стол · стулья',
        items: [
            { catalogId: 'kitchen_set', dx: -0.6, dz: 0 },
            { catalogId: 'refrigerator', dx: 0.9, dz: 0 },
            { catalogId: 'table_dining', dx: 0, dz: 1.4 },
            { catalogId: 'chair_dining', dx: -0.55, dz: 1.4 },
            { catalogId: 'chair_dining', dx: 0.55, dz: 1.4, rot: Math.PI },
        ],
    },
    {
        id: 'bath',
        name: 'С/у',
        hint: 'ванна · унитаз · раковина',
        items: [
            { catalogId: 'bath', dx: -0.5, dz: 0 },
            { catalogId: 'toilet', dx: 0.7, dz: -0.3 },
            { catalogId: 'sink', dx: 0.7, dz: 0.55 },
        ],
    },
];

export function buildPresetObjects(
    preset: RoomPreset,
    anchor: { x: number; z: number },
): FurnitureObject[] {
    return preset.items.map((item) => ({
        id: uuidv4(),
        catalogId: item.catalogId,
        pos: { x: anchor.x + item.dx, y: 0, z: anchor.z + item.dz },
        rot: item.rot ?? 0,
        scale: item.scale ?? { x: 1, y: 1, z: 1 },
    }));
}
