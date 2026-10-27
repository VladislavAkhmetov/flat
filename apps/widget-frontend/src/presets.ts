import { SceneData, WallNode, WallEdge, Opening, FurnitureObject } from '@flat/shared';

export interface PresetMetadata {
    id: string;
    title: string;
    roomsLabel: string;
    area: string;
    floor: string;
    ceiling: string;
    price: string;
    desc: string;
    features: string[];
}

export const PRESET_METADATA_LIST: PresetMetadata[] = [
    {
        id: 'studio',
        title: 'Студия Smart',
        roomsLabel: 'Студия',
        area: '32.5 м²',
        floor: '8 / 24',
        ceiling: '3.0 м',
        price: '12 800 000 ₽',
        desc: 'Эргономичная студия с умным зонированием. Выделенная спальная зона, встроенная кухня и просторный санузел.',
        features: ['Встроенная гардеробная', 'Душевая Walk-in', 'Барная стойка', 'Панорамное окно']
    },
    {
        id: 'euro2',
        title: 'Евро-2 Комфорт',
        roomsLabel: '2-комн. евро',
        area: '54.2 м²',
        floor: '12 / 24',
        ceiling: '3.0 м',
        price: '16 400 000 ₽',
        desc: 'Евро-двушка с большой кухней-гостиной (22 м²), изолированной мастер-спальней и панорамной лоджией.',
        features: ['Кухня-гостиная 22 м²', 'Мастер-спальня', 'Панорамная лоджия', 'Ванная комната']
    },
    {
        id: 'family',
        title: 'Семейная Евро-3',
        roomsLabel: '3-комн. евро',
        area: '78.4 м²',
        floor: '16 / 24',
        ceiling: '3.0 м',
        price: '18 200 000 ₽',
        desc: 'Идеальное пространство для семьи: мастер-спальня, детская комната, просторная гостиная и 2 санузла.',
        features: ['Выделенная детская', '2 санузла', 'Большие системы хранения', 'Обеденная зона на 6 персон']
    },
    {
        id: 'penthouse',
        title: 'Пентхаус Premium',
        roomsLabel: '4-комн. пентхаус',
        area: '112.0 м²',
        floor: '24 / 24',
        ceiling: '3.3 м',
        price: '27 500 000 ₽',
        desc: 'Флагманская резиденция на верхнем этаже с круговой панорамой, островной кухней и мастер-сьютом.',
        features: ['Островная кухня', 'Мастер-сьют с ванной', 'Кабинет / Лаунж', 'Потолки 3.3 м']
    }
];

// ==========================================
// 1. Studio Smart Preset (32.5 m²: 6.5m x 5m)
// ==========================================
const studioNodes: WallNode[] = [
    { id: 's_n1', x: -3.25, y: -2.5 },
    { id: 's_n2', x: 3.25, y: -2.5 },
    { id: 's_n3', x: 3.25, y: 2.5 },
    { id: 's_n4', x: -3.25, y: 2.5 },
    // Bathroom inner partition
    { id: 's_n5', x: 1.0, y: -2.5 },
    { id: 's_n6', x: 1.0, y: -0.3 },
    { id: 's_n7', x: 3.25, y: -0.3 }
];

const studioEdges: WallEdge[] = [
    // Outer walls (bearing 25cm)
    { id: 's_e1_2', startNodeId: 's_n1', endNodeId: 's_n2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 's_e2_3', startNodeId: 's_n2', endNodeId: 's_n3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 's_e3_4', startNodeId: 's_n3', endNodeId: 's_n4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 's_e4_1', startNodeId: 's_n4', endNodeId: 's_n1', thickness: 0.25, height: 2.7, kind: 'bearing' },
    // Bathroom partitions (15cm)
    { id: 's_e5_6', startNodeId: 's_n5', endNodeId: 's_n6', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 's_e6_7', startNodeId: 's_n6', endNodeId: 's_n7', thickness: 0.15, height: 2.7, kind: 'partition' }
];

const studioOpenings: Opening[] = [
    { id: 's_op_door_in', wallId: 's_e1_2', kind: 'door', t: 0.25, width: 0.9, height: 2.1, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 's_op_door_bath', wallId: 's_e6_7', kind: 'door', t: 0.35, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 's_op_win_main', wallId: 's_e3_4', kind: 'window', t: 0.5, width: 2.8, height: 2.2, sillHeight: 0.2 }
];

const studioFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: -1.5, y: 0, z: -1.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Hallway
    { id: 's_hall_w', catalogId: 'wardrobe', pos: { x: -2.4, y: 0, z: -2.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Kitchen zone
    { id: 's_kit', catalogId: 'kitchen_set', pos: { x: -2.3, y: 0, z: 2.0 }, rot: 0, scale: { x: 0.9, y: 1, z: 1 } },
    { id: 's_fridge', catalogId: 'refrigerator', pos: { x: -3.0, y: 0, z: 2.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Dining / Bar table
    { id: 's_table', catalogId: 'table_dining', pos: { x: -0.9, y: 0, z: 1.6 }, rot: Math.PI / 2, scale: { x: 0.8, y: 1, z: 0.8 } },
    { id: 's_chair1', catalogId: 'chair_dining', pos: { x: -0.9, y: 0, z: 2.2 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 's_chair2', catalogId: 'chair_dining', pos: { x: -0.9, y: 0, z: 1.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Living / Sleeping zone
    { id: 's_sofa', catalogId: 'sofa_2', pos: { x: 0.5, y: 0, z: 1.6 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 's_bed', catalogId: 'bed_double', pos: { x: 2.2, y: 0, z: 1.4 }, rot: Math.PI, scale: { x: 0.9, y: 1, z: 0.9 } },
    { id: 's_tv_stand', catalogId: 'tv_stand', pos: { x: -0.2, y: 0, z: 0.1 }, rot: 0, scale: { x: 0.9, y: 1, z: 1 } },
    { id: 's_tv', catalogId: 'tv', pos: { x: -0.2, y: 0.6, z: 0.1 }, rot: 0, scale: { x: 0.9, y: 1, z: 1 } },
    // Bathroom
    { id: 's_shower', catalogId: 'shower', pos: { x: 2.6, y: 0, z: -2.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 's_toilet', catalogId: 'toilet', pos: { x: 1.6, y: 0, z: -2.0 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 's_sink', catalogId: 'sink', pos: { x: 2.6, y: 0, z: -1.0 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } }
];

export const studioPreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: studioNodes,
    edges: studioEdges,
    openings: studioOpenings,
    objects: studioFurniture,
    materials: {
        floorId: 'wood_chevron',
        wallColor: '#faf9f6',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 9, z: 9 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// ==========================================
// 2. Euro-2 Comfort Preset (54.2 m²: 8m x 7m)
// ==========================================
const euro2Nodes: WallNode[] = [
    { id: 'e2_n1', x: -4.0, y: -3.5 },
    { id: 'e2_n2', x: 4.0, y: -3.5 },
    { id: 'e2_n3', x: 4.0, y: 3.5 },
    { id: 'e2_n4', x: -4.0, y: 3.5 },
    // Partition dividing Kitchen-Living (left) and Bedroom/Bathroom (right)
    { id: 'e2_n5', x: 0.5, y: -3.5 },
    { id: 'e2_n6', x: 0.5, y: 3.5 },
    // Bathroom horizontal wall
    { id: 'e2_n7', x: 0.5, y: -0.5 },
    { id: 'e2_n8', x: 4.0, y: -0.5 }
];

const euro2Edges: WallEdge[] = [
    // Outer walls
    { id: 'e2_e1_2', startNodeId: 'e2_n1', endNodeId: 'e2_n2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'e2_e2_3', startNodeId: 'e2_n2', endNodeId: 'e2_n3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'e2_e3_4', startNodeId: 'e2_n3', endNodeId: 'e2_n4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'e2_e4_1', startNodeId: 'e2_n4', endNodeId: 'e2_n1', thickness: 0.25, height: 2.7, kind: 'bearing' },
    // Partitions
    { id: 'e2_e5_7', startNodeId: 'e2_n5', endNodeId: 'e2_n7', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'e2_e7_6', startNodeId: 'e2_n7', endNodeId: 'e2_n6', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'e2_e7_8', startNodeId: 'e2_n7', endNodeId: 'e2_n8', thickness: 0.15, height: 2.7, kind: 'partition' }
];

const euro2Openings: Opening[] = [
    { id: 'e2_op_door_in', wallId: 'e2_e1_2', kind: 'door', t: 0.3, width: 0.9, height: 2.1, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'e2_op_door_bed', wallId: 'e2_e7_6', kind: 'door', t: 0.3, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'e2_op_door_bath', wallId: 'e2_e7_8', kind: 'door', t: 0.35, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    // Panoramic living room window & bedroom window
    { id: 'e2_op_win_living', wallId: 'e2_e3_4', kind: 'window', t: 0.65, width: 2.6, height: 2.4, sillHeight: 0.1 },
    { id: 'e2_op_win_bed', wallId: 'e2_e3_4', kind: 'window', t: 0.2, width: 1.6, height: 1.5, sillHeight: 0.9 }
];

const euro2Furniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: -2.0, y: 0, z: -2.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Entrance Wardrobe
    { id: 'e2_hall_w', catalogId: 'wardrobe', pos: { x: -3.2, y: 0, z: -3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Kitchen Area (Left Top)
    { id: 'e2_kit', catalogId: 'kitchen_set', pos: { x: -3.0, y: 0, z: 2.9 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_fridge', catalogId: 'refrigerator', pos: { x: -3.7, y: 0, z: 2.9 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Dining Table (Center Left)
    { id: 'e2_dining', catalogId: 'table_dining', pos: { x: -1.6, y: 0, z: 1.6 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_ch1', catalogId: 'chair_dining', pos: { x: -1.6, y: 0, z: 2.1 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_ch2', catalogId: 'chair_dining', pos: { x: -1.6, y: 0, z: 1.1 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Living Lounge (Left Bottom)
    { id: 'e2_sofa', catalogId: 'sofa_corner', pos: { x: -2.6, y: 0, z: -0.6 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_tv_stand', catalogId: 'tv_stand', pos: { x: -0.1, y: 0, z: -0.6 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_tv', catalogId: 'tv', pos: { x: -0.1, y: 0.6, z: -0.6 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    // Bedroom (Right Top)
    { id: 'e2_bed', catalogId: 'bed_double', pos: { x: 2.4, y: 0, z: 2.1 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_bedside_l', catalogId: 'bedside_table', pos: { x: 1.4, y: 0, z: 2.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_bedside_r', catalogId: 'bedside_table', pos: { x: 3.4, y: 0, z: 2.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_bed_w', catalogId: 'wardrobe', pos: { x: 3.3, y: 0, z: 0.6 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    // Bathroom (Right Bottom)
    { id: 'e2_bath', catalogId: 'bath', pos: { x: 2.5, y: 0, z: -1.3 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_toilet', catalogId: 'toilet', pos: { x: 3.5, y: 0, z: -2.8 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'e2_sink', catalogId: 'sink', pos: { x: 1.2, y: 0, z: -2.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } }
];

export const euro2Preset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: euro2Nodes,
    edges: euro2Edges,
    openings: euro2Openings,
    objects: euro2Furniture,
    materials: {
        floorId: 'wood_oak',
        wallColor: '#faf9f6',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 11, z: 11 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// ==========================================
// 3. Family 3-Room Luxury Preset (78.4 m²: 10m x 8m)
// ==========================================
const familyNodes: WallNode[] = [
    { id: 'f_n1', x: -5.0, y: -4.0 },
    { id: 'f_n2', x: 5.0, y: -4.0 },
    { id: 'f_n3', x: 5.0, y: 4.0 },
    { id: 'f_n4', x: -5.0, y: 4.0 },
    // Central corridor partition
    { id: 'f_n5', x: 0.5, y: -4.0 },
    { id: 'f_n6', x: 0.5, y: 4.0 },
    { id: 'f_n7', x: 0.5, y: 0.5 },
    { id: 'f_n8', x: 5.0, y: 0.5 },
    { id: 'f_n9', x: 0.5, y: -2.0 },
    { id: 'f_n10', x: 5.0, y: -2.0 },
    // Kids Room Split Node
    { id: 'f_nk1', x: 2.8, y: 0.5 },
    { id: 'f_nk2', x: 2.8, y: 4.0 }
];

const familyEdges: WallEdge[] = [
    // Outer walls
    { id: 'f_e1_2', startNodeId: 'f_n1', endNodeId: 'f_n2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'f_e2_3', startNodeId: 'f_n2', endNodeId: 'f_n3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'f_e3_4', startNodeId: 'f_n3', endNodeId: 'f_n4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'f_e4_1', startNodeId: 'f_n4', endNodeId: 'f_n1', thickness: 0.25, height: 2.7, kind: 'bearing' },
    // Inner Partitions
    { id: 'f_e5_9', startNodeId: 'f_n5', endNodeId: 'f_n9', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_e9_7', startNodeId: 'f_n9', endNodeId: 'f_n7', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_e7_6', startNodeId: 'f_n7', endNodeId: 'f_n6', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_e7_k1', startNodeId: 'f_n7', endNodeId: 'f_nk1', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_ek1_8', startNodeId: 'f_nk1', endNodeId: 'f_n8', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_e9_10', startNodeId: 'f_n9', endNodeId: 'f_n10', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'f_ekids_split', startNodeId: 'f_nk1', endNodeId: 'f_nk2', thickness: 0.12, height: 2.7, kind: 'partition' }
];

const familyOpenings: Opening[] = [
    { id: 'f_op_door_in', wallId: 'f_e1_2', kind: 'door', t: 0.75, width: 0.9, height: 2.1, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'f_op_door_kids', wallId: 'f_e7_6', kind: 'door', t: 0.25, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'f_op_door_master', wallId: 'f_ekids_split', kind: 'door', t: 0.2, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'f_op_door_bath', wallId: 'f_e9_10', kind: 'door', t: 0.3, width: 0.8, height: 2.0, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'f_op_win_liv1', wallId: 'f_e4_1', kind: 'window', t: 0.3, width: 1.6, height: 1.5, sillHeight: 0.9 },
    { id: 'f_op_win_liv2', wallId: 'f_e4_1', kind: 'window', t: 0.75, width: 1.6, height: 1.5, sillHeight: 0.9 },
    { id: 'f_op_win_master', wallId: 'f_e2_3', kind: 'window', t: 0.8, width: 1.6, height: 1.5, sillHeight: 0.9 },
    { id: 'f_op_win_kids', wallId: 'f_e3_4', kind: 'window', t: 0.8, width: 1.4, height: 1.5, sillHeight: 0.9 }
];

const familyFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: 3.5, y: 0, z: -3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Living Room (Left)
    { id: 'fam_sofa', catalogId: 'sofa_3', pos: { x: -3.2, y: 0, z: -1.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_armchair', catalogId: 'armchair', pos: { x: -1.5, y: 0, z: -1.5 }, rot: -Math.PI / 4, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_tv_stand', catalogId: 'tv_stand', pos: { x: -0.2, y: 0, z: -1.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_tv', catalogId: 'tv', pos: { x: -0.2, y: 0.6, z: -1.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_table', catalogId: 'table_dining', pos: { x: -2.2, y: 0, z: 1.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_ch1', catalogId: 'chair_dining', pos: { x: -2.8, y: 0, z: 1.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_ch2', catalogId: 'chair_dining', pos: { x: -1.6, y: 0, z: 1.5 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kitchen', catalogId: 'kitchen_set', pos: { x: -3.8, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_fridge', catalogId: 'refrigerator', pos: { x: -4.7, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Master Bedroom (Top Right)
    { id: 'fam_master_bed', catalogId: 'bed_double', pos: { x: 4.0, y: 0, z: 2.2 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_master_w', catalogId: 'wardrobe', pos: { x: 4.4, y: 0, z: 0.9 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Kids Room (Center Top)
    { id: 'fam_kids_bed', catalogId: 'bed_single', pos: { x: 1.4, y: 0, z: 2.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kids_desk', catalogId: 'table_desk', pos: { x: 2.1, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kids_ch', catalogId: 'chair_dining', pos: { x: 2.1, y: 0, z: 2.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Bathroom (Right Bottom)
    { id: 'fam_bath', catalogId: 'bath', pos: { x: 3.2, y: 0, z: -0.8 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_toilet', catalogId: 'toilet', pos: { x: 4.5, y: 0, z: -1.6 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_sink', catalogId: 'sink', pos: { x: 1.2, y: 0, z: -1.2 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_hall_w', catalogId: 'wardrobe', pos: { x: 4.2, y: 0, z: -3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } }
];

export const familyPreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: familyNodes,
    edges: familyEdges,
    openings: familyOpenings,
    objects: familyFurniture,
    materials: {
        floorId: 'wood_chevron',
        wallColor: '#faf9f6',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 13, z: 13 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// ==========================================
// 4. Penthouse Anniversary Preset (112.0 m²: 12m x 9.5m)
// ==========================================
const penthouseNodes: WallNode[] = [
    { id: 'p_n1', x: -6.0, y: -4.75 },
    { id: 'p_n2', x: 6.0, y: -4.75 },
    { id: 'p_n3', x: 6.0, y: 4.75 },
    { id: 'p_n4', x: -6.0, y: 4.75 },
    // Master Suite divider
    { id: 'p_n5', x: 1.5, y: -4.75 },
    { id: 'p_n6', x: 1.5, y: 1.5 },
    { id: 'p_n7', x: 6.0, y: 1.5 },
    // Private Master Bath
    { id: 'p_n8', x: 1.5, y: -1.8 },
    { id: 'p_n9', x: 6.0, y: -1.8 }
];

const penthouseEdges: WallEdge[] = [
    { id: 'p_e1_2', startNodeId: 'p_n1', endNodeId: 'p_n2', thickness: 0.25, height: 3.3, kind: 'bearing' },
    { id: 'p_e2_3', startNodeId: 'p_n2', endNodeId: 'p_n3', thickness: 0.25, height: 3.3, kind: 'bearing' },
    { id: 'p_e3_4', startNodeId: 'p_n3', endNodeId: 'p_n4', thickness: 0.25, height: 3.3, kind: 'bearing' },
    { id: 'p_e4_1', startNodeId: 'p_n4', endNodeId: 'p_n1', thickness: 0.25, height: 3.3, kind: 'bearing' },
    // Master Suite & Bath Partitions
    { id: 'p_e5_8', startNodeId: 'p_n5', endNodeId: 'p_n8', thickness: 0.15, height: 3.3, kind: 'partition' },
    { id: 'p_e8_6', startNodeId: 'p_n8', endNodeId: 'p_n6', thickness: 0.15, height: 3.3, kind: 'partition' },
    { id: 'p_e6_7', startNodeId: 'p_n6', endNodeId: 'p_n7', thickness: 0.15, height: 3.3, kind: 'partition' },
    { id: 'p_e8_9', startNodeId: 'p_n8', endNodeId: 'p_n9', thickness: 0.15, height: 3.3, kind: 'partition' }
];

const penthouseOpenings: Opening[] = [
    { id: 'p_op_door_in', wallId: 'p_e1_2', kind: 'door', t: 0.2, width: 1.0, height: 2.3, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'p_op_door_suite', wallId: 'p_e6_7', kind: 'door', t: 0.25, width: 0.9, height: 2.2, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    { id: 'p_op_door_bath', wallId: 'p_e8_9', kind: 'door', t: 0.3, width: 0.8, height: 2.1, sillHeight: 0, hingeSide: 'left', swingSide: 'in' },
    // Huge Panoramic Glazing walls
    { id: 'p_op_win_pano1', wallId: 'p_e4_1', kind: 'window', t: 0.5, width: 5.5, height: 3.0, sillHeight: 0.05 },
    { id: 'p_op_win_pano2', wallId: 'p_e3_4', kind: 'window', t: 0.5, width: 4.5, height: 3.0, sillHeight: 0.05 },
    { id: 'p_op_win_bed', wallId: 'p_e2_3', kind: 'window', t: 0.75, width: 2.6, height: 2.6, sillHeight: 0.1 }
];

const penthouseFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: -3.5, y: 0, z: -3.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Grand Lounge Area
    { id: 'p_sofa_main', catalogId: 'sofa_corner', pos: { x: -3.5, y: 0, z: -0.5 }, rot: 0, scale: { x: 1.2, y: 1, z: 1.2 } },
    { id: 'p_armchair1', catalogId: 'armchair', pos: { x: -1.2, y: 0, z: -1.5 }, rot: -Math.PI / 4, scale: { x: 1.1, y: 1, z: 1.1 } },
    { id: 'p_armchair2', catalogId: 'armchair', pos: { x: -1.2, y: 0, z: 0.5 }, rot: -Math.PI * 0.75, scale: { x: 1.1, y: 1, z: 1.1 } },
    { id: 'p_tv_stand', catalogId: 'tv_stand', pos: { x: -5.6, y: 0, z: -0.5 }, rot: Math.PI / 2, scale: { x: 1.2, y: 1, z: 1 } },
    { id: 'p_tv', catalogId: 'tv', pos: { x: -5.6, y: 0.6, z: -0.5 }, rot: Math.PI / 2, scale: { x: 1.3, y: 1, z: 1 } },
    // Island Kitchen & Dining
    { id: 'p_kit', catalogId: 'kitchen_set', pos: { x: -3.5, y: 0, z: 4.1 }, rot: 0, scale: { x: 1.4, y: 1, z: 1 } },
    { id: 'p_fridge', catalogId: 'refrigerator', pos: { x: -5.2, y: 0, z: 4.1 }, rot: 0, scale: { x: 1.1, y: 1, z: 1 } },
    { id: 'p_dining', catalogId: 'table_dining', pos: { x: -0.5, y: 0, z: 3.2 }, rot: Math.PI / 2, scale: { x: 1.3, y: 1, z: 1.1 } },
    { id: 'p_ch1', catalogId: 'chair_dining', pos: { x: 0.1, y: 0, z: 3.2 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'p_ch2', catalogId: 'chair_dining', pos: { x: -1.1, y: 0, z: 3.2 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    // Master Suite
    { id: 'p_bed', catalogId: 'bed_double', pos: { x: 3.8, y: 0, z: 3.0 }, rot: Math.PI, scale: { x: 1.1, y: 1, z: 1.1 } },
    { id: 'p_bed_l', catalogId: 'bedside_table', pos: { x: 2.6, y: 0, z: 3.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'p_bed_r', catalogId: 'bedside_table', pos: { x: 5.0, y: 0, z: 3.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'p_wardrobe', catalogId: 'wardrobe', pos: { x: 5.4, y: 0, z: 2.0 }, rot: Math.PI / 2, scale: { x: 1.2, y: 1, z: 1 } },
    // Master Luxury Bath
    { id: 'p_bath', catalogId: 'bath', pos: { x: 4.5, y: 0, z: -3.2 }, rot: 0, scale: { x: 1.1, y: 1, z: 1.1 } },
    { id: 'p_shower', catalogId: 'shower', pos: { x: 2.3, y: 0, z: -2.3 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'p_toilet', catalogId: 'toilet', pos: { x: 2.3, y: 0, z: -4.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'p_sink', catalogId: 'sink', pos: { x: 5.4, y: 0, z: -4.0 }, rot: -Math.PI / 2, scale: { x: 1.2, y: 1, z: 1 } }
];

export const penthousePreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: penthouseNodes,
    edges: penthouseEdges,
    openings: penthouseOpenings,
    objects: penthouseFurniture,
    materials: {
        floorId: 'marble_calacatta',
        wallColor: '#faf9f6',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 15, z: 15 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// Map of presets with backward compatibility aliases
export const PRESETS_MAP: Record<string, SceneData> = {
    studio: studioPreset,
    euro2: euro2Preset,
    family: familyPreset,
    penthouse: penthousePreset,
    // Aliases
    scandi: euro2Preset,
    loft: studioPreset
};
