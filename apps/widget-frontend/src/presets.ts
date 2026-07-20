import { SceneData, WallNode, WallEdge, Opening, FurnitureObject } from '@flat/shared';

// Base structural nodes common to the apartment shell (10m x 8m)
const baseNodes: WallNode[] = [
    { id: 'node_1', x: -5, y: -4 },
    { id: 'node_2', x: 5, y: -4 },
    { id: 'node_3', x: 5, y: 4 },
    { id: 'node_4', x: -5, y: 4 },
    { id: 'node_5', x: 1, y: -4 },
    { id: 'node_6', x: 1, y: 4 },
    { id: 'node_7', x: 1, y: 0.5 },
    { id: 'node_8', x: 5, y: 0.5 },
    { id: 'node_9', x: 1, y: -2 },
    { id: 'node_10', x: 5, y: -2 }
];

// Outer walls (bearing) and standard inner walls (partitions)
const baseEdges: WallEdge[] = [
    // Outer walls - Bearing (25cm thick)
    { id: 'edge_1_2', startNodeId: 'node_1', endNodeId: 'node_2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_2_3', startNodeId: 'node_2', endNodeId: 'node_3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_3_4', startNodeId: 'node_3', endNodeId: 'node_4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_4_1', startNodeId: 'node_4', endNodeId: 'node_1', thickness: 0.25, height: 2.7, kind: 'bearing' },

    // Inner partitions - Non-bearing (15cm thick)
    { id: 'edge_5_9', startNodeId: 'node_5', endNodeId: 'node_9', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_9_7', startNodeId: 'node_9', endNodeId: 'node_7', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_7_6', startNodeId: 'node_7', endNodeId: 'node_6', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_7_8', startNodeId: 'node_7', endNodeId: 'node_8', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_9_10', startNodeId: 'node_9', endNodeId: 'node_10', thickness: 0.15, height: 2.7, kind: 'partition' }
];

// Standard windows and doors
const baseOpenings = (edges: WallEdge[]): Opening[] => [
    // Entrance Door on wall 1-2 (t = 0.75)
    { id: 'opening_entrance', wallId: 'edge_1_2', kind: 'door', t: 0.75, width: 0.9, height: 2.1, sillHeight: 0 },
    // Bedroom Door on wall 7-6 (t = 0.2)
    { id: 'opening_bedroom_door', wallId: 'edge_7_6', kind: 'door', t: 0.2, width: 0.8, height: 2.0, sillHeight: 0 },
    // Bathroom Door on wall 9-10 (t = 0.3)
    { id: 'opening_bathroom_door', wallId: 'edge_9_10', kind: 'door', t: 0.3, width: 0.8, height: 2.0, sillHeight: 0 },
    // Panoramic Window in Living Room on wall 4-1 (t = 0.5)
    { id: 'opening_pano_window', wallId: 'edge_4_1', kind: 'window', t: 0.5, width: 3.0, height: 2.4, sillHeight: 0.15 },
    // Standard Window in Bedroom on wall 2-3 (t = 0.7)
    { id: 'opening_bedroom_window', wallId: 'edge_2_3', kind: 'window', t: 0.7, width: 1.5, height: 1.5, sillHeight: 0.9 }
];

// --- 1. Scandinavian Comfort Preset ---
const scandiFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: 3.5, y: 0, z: -3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Living Room (Left side)
    { id: 'scandi_sofa', catalogId: 'sofa_corner', pos: { x: -3.2, y: 0, z: -1.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_tv_stand', catalogId: 'tv_stand', pos: { x: -0.2, y: 0, z: -1.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_tv', catalogId: 'tv', pos: { x: -0.2, y: 0.6, z: -1.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_dining_table', catalogId: 'table_dining', pos: { x: -2.0, y: 0, z: 2.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_chair_1', catalogId: 'chair_dining', pos: { x: -2.0, y: 0, z: 2.5 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_chair_2', catalogId: 'chair_dining', pos: { x: -2.0, y: 0, z: 1.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_kitchen', catalogId: 'kitchen_set', pos: { x: -3.8, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_fridge', catalogId: 'refrigerator', pos: { x: -4.7, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    
    // Bedroom (Top Right)
    { id: 'scandi_bed', catalogId: 'bed_double', pos: { x: 3.5, y: 0, z: 2.5 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_bedside_l', catalogId: 'bedside_table', pos: { x: 2.4, y: 0, z: 3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_bedside_r', catalogId: 'bedside_table', pos: { x: 4.6, y: 0, z: 3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_wardrobe', catalogId: 'wardrobe', pos: { x: 1.8, y: 0, z: 1.2 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },

    // Bathroom (Middle Right)
    { id: 'scandi_bath', catalogId: 'bath', pos: { x: 3.2, y: 0, z: -0.8 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_toilet', catalogId: 'toilet', pos: { x: 4.5, y: 0, z: -1.6 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'scandi_sink', catalogId: 'sink', pos: { x: 1.5, y: 0, z: -1.2 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },

    // Hallway (Bottom Right)
    { id: 'scandi_hall_wardrobe', catalogId: 'wardrobe', pos: { x: 4.2, y: 0, z: -3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } }
];

export const scandiPreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: baseNodes,
    edges: baseEdges,
    openings: baseOpenings(baseEdges),
    objects: scandiFurniture,
    materials: {
        floorId: 'wood_oak',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 12, z: 12 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// --- 2. Industrial Loft Studio Preset ---
// Redesigned with fewer partitions for open-plan studio layout!
const loftNodes: WallNode[] = [
    { id: 'node_1', x: -5, y: -4 },
    { id: 'node_2', x: 5, y: -4 },
    { id: 'node_3', x: 5, y: 4 },
    { id: 'node_4', x: -5, y: 4 },
    { id: 'node_9', x: 1, y: -2 },
    { id: 'node_10', x: 5, y: -2 }
];

const loftEdges: WallEdge[] = [
    // Outer walls - Bearing
    { id: 'edge_1_2', startNodeId: 'node_1', endNodeId: 'node_2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_2_3', startNodeId: 'node_2', endNodeId: 'node_3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_3_4', startNodeId: 'node_3', endNodeId: 'node_4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_4_1', startNodeId: 'node_4', endNodeId: 'node_1', thickness: 0.25, height: 2.7, kind: 'bearing' },

    // Bathroom partition is kept, but bedroom wall is REMOVED for open studio!
    { id: 'edge_9_10', startNodeId: 'node_9', endNodeId: 'node_10', thickness: 0.15, height: 2.7, kind: 'partition' },
    // Short screen wall at entrance
    { id: 'edge_screen', startNodeId: 'node_9', endNodeId: 'node_1', thickness: 0.15, height: 2.7, kind: 'partition' }
];

const loftOpenings: Opening[] = [
    { id: 'opening_entrance', wallId: 'edge_1_2', kind: 'door', t: 0.75, width: 0.9, height: 2.1, sillHeight: 0 },
    { id: 'opening_bathroom_door', wallId: 'edge_9_10', kind: 'door', t: 0.3, width: 0.8, height: 2.0, sillHeight: 0 },
    { id: 'opening_pano_window', wallId: 'edge_4_1', kind: 'window', t: 0.5, width: 3.5, height: 2.5, sillHeight: 0.05 }, // Huge panoramic
    { id: 'opening_bedroom_window', wallId: 'edge_2_3', kind: 'window', t: 0.7, width: 1.8, height: 1.8, sillHeight: 0.6 }
];

const loftFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: 3.5, y: 0, z: -3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Open Space Living Area
    { id: 'loft_sofa', catalogId: 'sofa_3', pos: { x: -2.5, y: 0, z: -1.0 }, rot: Math.PI / 4, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_armchair', catalogId: 'armchair', pos: { x: -1.2, y: 0, z: -2.0 }, rot: -Math.PI / 4, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_tv_stand', catalogId: 'tv_stand', pos: { x: -4.0, y: 0, z: -2.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_tv', catalogId: 'tv', pos: { x: -4.0, y: 0.6, z: -2.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },

    // Office Workspace in Living Room
    { id: 'loft_desk', catalogId: 'table_desk', pos: { x: -4.0, y: 0, z: 2.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_office_chair', catalogId: 'chair_office', pos: { x: -3.2, y: 0, z: 2.0 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },

    // Kitchen / Bar
    { id: 'loft_kitchen', catalogId: 'kitchen_set', pos: { x: -1.5, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_fridge', catalogId: 'refrigerator', pos: { x: -2.8, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },

    // Open Bedroom Zone (Top Right)
    { id: 'loft_bed', catalogId: 'bed_double', pos: { x: 3.5, y: 0, z: 2.5 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_wardrobe', catalogId: 'wardrobe', pos: { x: 1.5, y: 0, z: 2.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },

    // Bathroom (Middle Right)
    { id: 'loft_bath', catalogId: 'shower', pos: { x: 2.0, y: 0, z: -1.0 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } }, // Shower instead of bath
    { id: 'loft_toilet', catalogId: 'toilet', pos: { x: 4.5, y: 0, z: -1.6 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'loft_sink', catalogId: 'sink', pos: { x: 3.2, y: 0, z: -1.2 }, rot: 0, scale: { x: 1, y: 1, z: 1 } }
];

export const loftPreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: loftNodes,
    edges: loftEdges,
    openings: loftOpenings,
    objects: loftFurniture,
    materials: {
        floorId: 'concrete_dark',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: -6, y: 8, z: 10 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// --- 3. Cozy Family Layout Preset ---
// Redesigned with an EXTRA bedroom partition wall to make a Kids room!
const familyNodes: WallNode[] = [
    { id: 'node_1', x: -5, y: -4 },
    { id: 'node_2', x: 5, y: -4 },
    { id: 'node_3', x: 5, y: 4 },
    { id: 'node_4', x: -5, y: 4 },
    { id: 'node_5', x: 1, y: -4 },
    { id: 'node_6', x: 1, y: 4 },
    { id: 'node_7', x: 1, y: 0.5 },
    { id: 'node_8', x: 5, y: 0.5 },
    { id: 'node_9', x: 1, y: -2 },
    { id: 'node_10', x: 5, y: -2 },
    // Kids wall nodes
    { id: 'node_k1', x: 3.0, y: 0.5 },
    { id: 'node_k2', x: 3.0, y: 4.0 }
];

const familyEdges: WallEdge[] = [
    // Outer walls
    { id: 'edge_1_2', startNodeId: 'node_1', endNodeId: 'node_2', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_2_3', startNodeId: 'node_2', endNodeId: 'node_3', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_3_4', startNodeId: 'node_3', endNodeId: 'node_4', thickness: 0.25, height: 2.7, kind: 'bearing' },
    { id: 'edge_4_1', startNodeId: 'node_4', endNodeId: 'node_1', thickness: 0.25, height: 2.7, kind: 'bearing' },

    // Inner partitions
    { id: 'edge_5_9', startNodeId: 'node_5', endNodeId: 'node_9', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_9_7', startNodeId: 'node_9', endNodeId: 'node_7', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_7_6', startNodeId: 'node_7', endNodeId: 'node_6', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_7_k1', startNodeId: 'node_7', endNodeId: 'node_k1', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_k1_8', startNodeId: 'node_k1', endNodeId: 'node_8', thickness: 0.15, height: 2.7, kind: 'partition' },
    { id: 'edge_9_10', startNodeId: 'node_9', endNodeId: 'node_10', thickness: 0.15, height: 2.7, kind: 'partition' },

    // EXTRA partition splitting the bedroom area into Master Bedroom and Kids room!
    { id: 'edge_kids_split', startNodeId: 'node_k1', endNodeId: 'node_k2', thickness: 0.12, height: 2.7, kind: 'partition' }
];

const familyOpenings: Opening[] = [
    { id: 'opening_entrance', wallId: 'edge_1_2', kind: 'door', t: 0.75, width: 0.9, height: 2.1, sillHeight: 0 },
    // Door to Kids Room on edge 7-6 (t = 0.25)
    { id: 'opening_kids_door', wallId: 'edge_7_6', kind: 'door', t: 0.25, width: 0.8, height: 2.0, sillHeight: 0 },
    // Door to Master Bedroom on edge kids_split (t = 0.2)
    { id: 'opening_master_door', wallId: 'edge_kids_split', kind: 'door', t: 0.2, width: 0.8, height: 2.0, sillHeight: 0 },
    { id: 'opening_bathroom_door', wallId: 'edge_9_10', kind: 'door', t: 0.3, width: 0.8, height: 2.0, sillHeight: 0 },
    { id: 'opening_living_window_1', wallId: 'edge_4_1', kind: 'window', t: 0.3, width: 1.5, height: 1.5, sillHeight: 0.9 },
    { id: 'opening_living_window_2', wallId: 'edge_4_1', kind: 'window', t: 0.7, width: 1.5, height: 1.5, sillHeight: 0.9 },
    // Window for master bedroom
    { id: 'opening_master_window', wallId: 'edge_2_3', kind: 'window', t: 0.8, width: 1.4, height: 1.5, sillHeight: 0.9 },
    // Window for kids room on top edge 3-4 (t = 0.8 is in the kids room area)
    { id: 'opening_kids_window', wallId: 'edge_3_4', kind: 'window', t: 0.8, width: 1.2, height: 1.5, sillHeight: 0.9 }
];

const familyFurniture: FurnitureObject[] = [
    { id: 'spawn_point', catalogId: 'spawn_point', pos: { x: 3.5, y: 0, z: -3.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    // Living Room (Left side) - Sofa, dining, kitchen
    { id: 'fam_sofa', catalogId: 'sofa_2', pos: { x: -3.2, y: 0, z: -1.0 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_armchair', catalogId: 'armchair', pos: { x: -1.5, y: 0, z: -1.5 }, rot: -Math.PI / 4, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_tv_stand', catalogId: 'tv_stand', pos: { x: -0.2, y: 0, z: -1.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_tv', catalogId: 'tv', pos: { x: -0.2, y: 0.6, z: -1.0 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_table', catalogId: 'table_dining', pos: { x: -2.2, y: 0, z: 1.5 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_chair_1', catalogId: 'chair_dining', pos: { x: -2.8, y: 0, z: 1.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_chair_2', catalogId: 'chair_dining', pos: { x: -1.6, y: 0, z: 1.5 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kitchen', catalogId: 'kitchen_set', pos: { x: -3.8, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_fridge', catalogId: 'refrigerator', pos: { x: -4.7, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },

    // Master Bedroom (Top Right)
    { id: 'fam_master_bed', catalogId: 'bed_double', pos: { x: 4.0, y: 0, z: 2.2 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_master_wardrobe', catalogId: 'wardrobe', pos: { x: 4.4, y: 0, z: 0.9 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },

    // Kids Room (Middle Right, between main bedroom and living)
    { id: 'fam_kids_bed', catalogId: 'bed_single', pos: { x: 1.5, y: 0, z: 2.5 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kids_desk', catalogId: 'table_desk', pos: { x: 2.5, y: 0, z: 3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_kids_chair', catalogId: 'chair_dining', pos: { x: 2.5, y: 0, z: 2.8 }, rot: 0, scale: { x: 1, y: 1, z: 1 } },

    // Bathroom (Middle Right)
    { id: 'fam_bath', catalogId: 'bath', pos: { x: 3.2, y: 0, z: -0.8 }, rot: Math.PI, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_toilet', catalogId: 'toilet', pos: { x: 4.5, y: 0, z: -1.6 }, rot: -Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },
    { id: 'fam_sink', catalogId: 'sink', pos: { x: 1.5, y: 0, z: -1.2 }, rot: Math.PI / 2, scale: { x: 1, y: 1, z: 1 } },

    // Hallway / Entrance Wardrobe
    { id: 'fam_hall_wardrobe', catalogId: 'wardrobe', pos: { x: 4.2, y: 0, z: -3.4 }, rot: 0, scale: { x: 1, y: 1, z: 1 } }
];

export const familyPreset: SceneData = {
    schemaVersion: '1.0',
    walls: [],
    nodes: familyNodes,
    edges: familyEdges,
    openings: familyOpenings,
    objects: familyFurniture,
    materials: {
        floorId: 'wood_oak',
        wallIds: {}
    },
    camera: {
        mode: '3d',
        position: { x: 0, y: 13, z: 13 },
        target: { x: 0, y: 0, z: 0 }
    }
};

// Map of local presets
export const PRESETS_MAP: Record<string, SceneData> = {
    scandi: scandiPreset,
    loft: loftPreset,
    family: familyPreset
};
