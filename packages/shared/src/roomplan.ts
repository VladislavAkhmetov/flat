import {
  SceneData,
  WallNode,
  WallEdge,
  Opening,
  FurnitureObject,
  CameraState,
} from './types';

// ==========================================
// Apple RoomPlan API Data Types
// ==========================================

export type RoomPlanMatrix = number[] | number[][];

export interface RoomPlanSurface {
  identifier?: string;
  id?: string;
  /** 16-element float array (column-major standard from ARKit/Swift) or 4x4 array */
  transform?: RoomPlanMatrix;
  /** [width, height, depth] in meters */
  dimensions?: [number, number, number] | { x: number; y: number; z: number };
  /** Simplified/precomputed position & rotation fallback */
  position?: [number, number, number] | { x: number; y: number; z: number };
  rotation?: [number, number, number] | number;
  confidence?: string | number;
  parentIdentifier?: string;
}

export interface RoomPlanObject {
  identifier?: string;
  id?: string;
  /** Category string (e.g. 'bed', 'sofa') or enum object (e.g. { bed: {} }) */
  category?: string | Record<string, any>;
  /** 16-element float array or 4x4 array */
  transform?: RoomPlanMatrix;
  /** [width, height, depth] in meters */
  dimensions?: [number, number, number] | { x: number; y: number; z: number };
  position?: [number, number, number] | { x: number; y: number; z: number };
  rotation?: [number, number, number] | number;
  confidence?: string | number;
}

export interface RoomPlanRoom {
  identifier?: string;
  walls?: RoomPlanSurface[];
  doors?: RoomPlanSurface[];
  windows?: RoomPlanSurface[];
  openings?: RoomPlanSurface[];
  objects?: RoomPlanObject[];
}

export interface RoomPlanData {
  identifier?: string;
  walls?: RoomPlanSurface[];
  doors?: RoomPlanSurface[];
  windows?: RoomPlanSurface[];
  openings?: RoomPlanSurface[];
  objects?: RoomPlanObject[];
  /** iOS 17+ CapturedStructure with multiple rooms */
  rooms?: RoomPlanRoom[];
  stories?: Array<{ rooms?: RoomPlanRoom[] }>;
}

export interface RoomPlanConvertOptions {
  /** Snap nearby wall endpoints together (in meters). Default 0.25 m */
  snapTolerance?: number;
  /** Snap near-orthogonal walls to strict 0° / 90° (Manhattan world). Default true */
  orthogonalize?: boolean;
  /** Center the generated scene around (0, 0). Default true */
  centerScene?: boolean;
  /** Default wall height in meters if missing. Default 2.7 m */
  defaultWallHeight?: number;
}

// ==========================================
// Detection Helper
// ==========================================

/**
 * Checks if the given JSON data looks like an Apple RoomPlan export
 */
export function isRoomPlanData(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  if (Array.isArray(data)) return false;

  // Already a Flat SceneData?
  if (data.schemaVersion && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
    return false;
  }

  // Multi-room structure
  if (Array.isArray(data.rooms) && data.rooms.length > 0) return true;
  if (Array.isArray(data.stories) && data.stories.length > 0) return true;

  // Standard CapturedRoom
  const hasWalls = Array.isArray(data.walls) && data.walls.length > 0;
  const hasObjects = Array.isArray(data.objects);
  const hasDoors = Array.isArray(data.doors);
  const hasWindows = Array.isArray(data.windows);

  if (hasWalls) {
    const firstWall = data.walls[0];
    if (firstWall && (firstWall.transform || firstWall.dimensions || firstWall.identifier)) {
      return true;
    }
  }

  return (hasWalls && (hasObjects || hasDoors || hasWindows));
}

// ==========================================
// Matrix & Geometry Helpers
// ==========================================

interface Transform3D {
  x: number;
  y: number;
  z: number;
  /** Direction along surface length in XZ floor plane */
  dirX: number;
  dirZ: number;
  /** Yaw rotation in radians around Y */
  yaw: number;
}

function parseTransform(
  transform?: RoomPlanMatrix,
  positionFallback?: [number, number, number] | { x: number; y: number; z: number },
  rotationFallback?: [number, number, number] | number
): Transform3D {
  if (transform) {
    let m: number[] = [];
    if (Array.isArray(transform) && transform.length === 4 && Array.isArray(transform[0])) {
      // 4x4 array: flatten
      m = (transform as number[][]).flat();
    } else if (Array.isArray(transform) && transform.length >= 16) {
      m = transform as number[];
    }

    if (m.length >= 16) {
      // Detect column-major (ARKit standard) vs row-major
      const isColumnMajor = !(
        m[12] === 0 && m[13] === 0 && m[14] === 0 &&
        (m[3] !== 0 || m[7] !== 0 || m[11] !== 0)
      );

      const x = isColumnMajor ? m[12] : m[3];
      const y = isColumnMajor ? m[13] : m[7];
      const z = isColumnMajor ? m[14] : m[11];

      // Local X direction vector on XZ floor plane
      const ux = isColumnMajor ? m[0] : m[0];
      const uz = isColumnMajor ? m[2] : m[8];

      const len = Math.hypot(ux, uz);
      const dirX = len > 1e-4 ? ux / len : 1;
      const dirZ = len > 1e-4 ? uz / len : 0;

      // Rotation around Y (yaw)
      const yaw = Math.atan2(dirZ, dirX);

      return { x, y, z, dirX, dirZ, yaw };
    }
  }

  // Fallback to explicit position & rotation
  let x = 0;
  let y = 0;
  let z = 0;
  if (Array.isArray(positionFallback)) {
    x = positionFallback[0] || 0;
    y = positionFallback[1] || 0;
    z = positionFallback[2] || 0;
  } else if (positionFallback && typeof positionFallback === 'object') {
    x = positionFallback.x || 0;
    y = positionFallback.y || 0;
    z = positionFallback.z || 0;
  }

  let yaw = 0;
  if (typeof rotationFallback === 'number') {
    yaw = rotationFallback;
  } else if (Array.isArray(rotationFallback)) {
    yaw = rotationFallback[1] || 0; // pitch, yaw, roll
  }

  return {
    x,
    y,
    z,
    dirX: Math.cos(yaw),
    dirZ: Math.sin(yaw),
    yaw,
  };
}

function parseDimensions(
  dimensions?: [number, number, number] | { x: number; y: number; z: number; width?: number; height?: number; depth?: number },
  defaultW = 1.0,
  defaultH = 2.7,
  defaultD = 0.15
): { width: number; height: number; depth: number } {
  if (Array.isArray(dimensions) && dimensions.length >= 3) {
    return {
      width: Math.max(0.1, Number(dimensions[0]) || defaultW),
      height: Math.max(0.5, Number(dimensions[1]) || defaultH),
      depth: Math.max(0.05, Number(dimensions[2]) || defaultD),
    };
  }

  if (dimensions && typeof dimensions === 'object' && !Array.isArray(dimensions)) {
    const dimsObj = dimensions as { width?: number; height?: number; depth?: number; x?: number; y?: number; z?: number };
    const w = dimsObj.width ?? dimsObj.x ?? defaultW;
    const h = dimsObj.height ?? dimsObj.y ?? defaultH;
    const d = dimsObj.depth ?? dimsObj.z ?? defaultD;
    return {
      width: Math.max(0.1, Number(w) || defaultW),
      height: Math.max(0.5, Number(h) || defaultH),
      depth: Math.max(0.05, Number(d) || defaultD),
    };
  }

  return { width: defaultW, height: defaultH, depth: defaultD };
}

function parseCategory(cat?: string | Record<string, any>): string {
  if (!cat) return 'unknown';
  if (typeof cat === 'string') return cat.toLowerCase();
  if (typeof cat === 'object') {
    // Enum with associated values: { "bed": {} } or { "category": "bed" }
    const keys = Object.keys(cat);
    if (keys.length > 0) return keys[0].toLowerCase();
  }
  return 'unknown';
}

// ==========================================
// Catalog Mapping
// ==========================================

interface CatalogMatch {
  catalogId: string;
  scale: { x: number; y: number; z: number };
  rotOffset: number;
}

const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number; depth: number }> = {
  bed_double: { width: 1.6, height: 0.5, depth: 2.0 },
  bed_single: { width: 0.9, height: 0.5, depth: 2.0 },
  sofa_corner: { width: 2.2, height: 0.8, depth: 2.2 },
  sofa_3: { width: 2.2, height: 0.8, depth: 0.9 },
  sofa_2: { width: 1.6, height: 0.8, depth: 0.9 },
  armchair: { width: 0.9, height: 0.8, depth: 0.9 },
  chair_dining: { width: 0.45, height: 0.85, depth: 0.45 },
  chair_office: { width: 0.65, height: 0.9, depth: 0.65 },
  table_dining: { width: 1.2, height: 0.75, depth: 0.8 },
  table_desk: { width: 1.2, height: 0.75, depth: 0.6 },
  tv_stand: { width: 1.6, height: 0.5, depth: 0.45 },
  tv: { width: 1.2, height: 0.7, depth: 0.15 },
  wardrobe: { width: 1.0, height: 2.2, depth: 0.6 },
  refrigerator: { width: 0.6, height: 1.8, depth: 0.6 },
  stove: { width: 0.6, height: 0.9, depth: 0.6 },
  kitchen_module: { width: 0.6, height: 0.9, depth: 0.6 },
  kitchen_set: { width: 1.8, height: 0.9, depth: 0.6 },
  bath: { width: 1.7, height: 0.6, depth: 0.75 },
  toilet: { width: 0.4, height: 0.5, depth: 0.7 },
  shower: { width: 0.9, height: 2.0, depth: 0.9 },
  washing_machine: { width: 0.6, height: 0.85, depth: 0.6 },
  sink: { width: 0.6, height: 0.85, depth: 0.5 },
};

function matchCatalogItem(category: string, dims: { width: number; height: number; depth: number }): CatalogMatch | null {
  const c = category.toLowerCase().replace(/[^a-z0-9]/g, '');
  let catalogId = 'chair_dining';
  let rotOffset = 0;

  if (c.includes('bed')) {
    catalogId = dims.width >= 1.3 || dims.depth >= 1.3 ? 'bed_double' : 'bed_single';
  } else if (c.includes('sofa') || c.includes('couch')) {
    if (dims.width > 1.8 && dims.depth > 1.5) {
      catalogId = 'sofa_corner';
    } else if (Math.max(dims.width, dims.depth) >= 1.8) {
      catalogId = 'sofa_3';
    } else {
      catalogId = 'sofa_2';
    }
  } else if (c.includes('storage') || c.includes('wardrobe') || c.includes('closet') || c.includes('cabinet')) {
    catalogId = 'wardrobe';
  } else if (c.includes('refrigerator') || c.includes('fridge')) {
    catalogId = 'refrigerator';
  } else if (c.includes('stove') || c.includes('oven') || c.includes('range')) {
    catalogId = 'stove';
  } else if (c.includes('dishwasher')) {
    catalogId = 'kitchen_module';
  } else if (c.includes('washer') || c.includes('dryer') || c.includes('laundry')) {
    catalogId = 'washing_machine';
  } else if (c.includes('toilet')) {
    catalogId = 'toilet';
  } else if (c.includes('bath') || c.includes('tub')) {
    catalogId = 'bath';
  } else if (c.includes('shower')) {
    catalogId = 'shower';
  } else if (c.includes('sink')) {
    catalogId = 'sink';
  } else if (c.includes('television') || c.includes('screen') || c.includes('tv')) {
    catalogId = 'tv_stand';
  } else if (c.includes('table') || c.includes('desk')) {
    catalogId = dims.width >= 1.4 ? 'table_dining' : 'table_desk';
  } else if (c.includes('chair') || c.includes('stool')) {
    catalogId = dims.height > 1.0 ? 'chair_office' : 'chair_dining';
  } else if (c.includes('armchair')) {
    catalogId = 'armchair';
  } else {
    // Unmatched: don't inject garbage
    return null;
  }

  const def = DEFAULT_DIMENSIONS[catalogId] || { width: 1, height: 1, depth: 1 };
  const rawScaleX = dims.width / def.width;
  const rawScaleZ = dims.depth / def.depth;

  // Check if swapping width/depth aligns aspect ratio better (90° yaw)
  const swapDistortion = Math.abs(Math.log(dims.depth / def.width)) + Math.abs(Math.log(dims.width / def.depth));
  const normalDistortion = Math.abs(Math.log(rawScaleX)) + Math.abs(Math.log(rawScaleZ));

  let finalScaleX = rawScaleX;
  let finalScaleZ = rawScaleZ;

  if (swapDistortion < normalDistortion * 0.7) {
    finalScaleX = dims.depth / def.width;
    finalScaleZ = dims.width / def.depth;
    rotOffset = Math.PI / 2;
  }

  return {
    catalogId,
    scale: {
      x: Math.max(0.6, Math.min(2.0, finalScaleX)),
      y: 1,
      z: Math.max(0.6, Math.min(2.0, finalScaleZ)),
    },
    rotOffset,
  };
}

// ==========================================
// Main Converter Implementation
// ==========================================

export function convertRoomPlanToSceneData(
  input: RoomPlanData | string,
  options: RoomPlanConvertOptions = {}
): SceneData {
  const data: RoomPlanData = typeof input === 'string' ? JSON.parse(input) : input;
  const snapTolerance = options.snapTolerance ?? 0.25;
  const orthogonalize = options.orthogonalize ?? true;
  const centerScene = options.centerScene ?? true;
  const defaultWallHeight = options.defaultWallHeight ?? 2.7;

  // 1. Gather all surfaces & objects from root or multi-room structure
  const rawWalls: RoomPlanSurface[] = [...(data.walls || [])];
  const rawDoors: RoomPlanSurface[] = [...(data.doors || [])];
  const rawWindows: RoomPlanSurface[] = [...(data.windows || [])];
  const rawOpenings: RoomPlanSurface[] = [...(data.openings || [])];
  const rawObjects: RoomPlanObject[] = [...(data.objects || [])];

  if (Array.isArray(data.rooms)) {
    for (const room of data.rooms) {
      if (room.walls) rawWalls.push(...room.walls);
      if (room.doors) rawDoors.push(...room.doors);
      if (room.windows) rawWindows.push(...room.windows);
      if (room.openings) rawOpenings.push(...room.openings);
      if (room.objects) rawObjects.push(...room.objects);
    }
  }

  if (Array.isArray(data.stories)) {
    for (const story of data.stories) {
      if (Array.isArray(story.rooms)) {
        for (const room of story.rooms) {
          if (room.walls) rawWalls.push(...room.walls);
          if (room.doors) rawDoors.push(...room.doors);
          if (room.windows) rawWindows.push(...room.windows);
          if (room.openings) rawOpenings.push(...room.openings);
          if (room.objects) rawObjects.push(...room.objects);
        }
      }
    }
  }

  // 2. Process walls into segments (A, B) on the floor plane (X, Z)
  interface RawWallSegment {
    id: string;
    ax: number;
    az: number;
    bx: number;
    bz: number;
    thickness: number;
    height: number;
    kind: 'bearing' | 'partition';
  }

  const segments: RawWallSegment[] = [];

  rawWalls.forEach((w, idx) => {
    const t = parseTransform(w.transform, w.position, w.rotation);
    const d = parseDimensions(w.dimensions, 3.0, defaultWallHeight, 0.15);

    let ux = t.dirX;
    let uz = t.dirZ;

    // Manhattan orthogonalization (snap ~0°/90° to strict axis)
    if (orthogonalize) {
      if (Math.abs(ux) > 0.94) {
        ux = Math.sign(ux);
        uz = 0;
      } else if (Math.abs(uz) > 0.94) {
        ux = 0;
        uz = Math.sign(uz);
      }
    }

    const halfLen = d.width / 2;
    const ax = t.x - ux * halfLen;
    const az = t.z - uz * halfLen;
    const bx = t.x + ux * halfLen;
    const bz = t.z + uz * halfLen;

    const kind: 'bearing' | 'partition' = d.depth > 0.22 || d.width > 4.5 ? 'bearing' : 'partition';

    segments.push({
      id: w.identifier || w.id || `rp_wall_${idx + 1}`,
      ax,
      az,
      bx,
      bz,
      thickness: Math.max(0.1, Math.min(0.35, d.depth)),
      height: d.height,
      kind,
    });
  });

  // 3. Cluster endpoints into unified WallNodes
  const nodes: WallNode[] = [];
  const edges: WallEdge[] = [];

  function getOrCreateNode(x: number, z: number): string {
    // Find close existing node
    for (const node of nodes) {
      if (Math.hypot(node.x - x, node.y - z) <= snapTolerance) {
        return node.id;
      }
    }
    const id = `rp_node_${nodes.length + 1}`;
    nodes.push({ id, x: Math.round(x * 100) / 100, y: Math.round(z * 100) / 100 });
    return id;
  }

  for (const seg of segments) {
    const startNodeId = getOrCreateNode(seg.ax, seg.az);
    const endNodeId = getOrCreateNode(seg.bx, seg.bz);

    if (startNodeId !== endNodeId) {
      // Check if edge already exists between these nodes
      const exists = edges.some(
        (e) =>
          (e.startNodeId === startNodeId && e.endNodeId === endNodeId) ||
          (e.startNodeId === endNodeId && e.endNodeId === startNodeId)
      );

      if (!exists) {
        edges.push({
          id: `rp_edge_${edges.length + 1}`,
          startNodeId,
          endNodeId,
          thickness: seg.thickness,
          height: seg.height,
          kind: seg.kind,
        });
      }
    }
  }

  // 4. Attach Openings (doors, windows) to edges
  const openings: Opening[] = [];

  interface CandidateOpening {
    kind: 'door' | 'window' | 'balcony_door';
    x: number;
    z: number;
    width: number;
    height: number;
    sillHeight: number;
  }

  const candidates: CandidateOpening[] = [];

  const addOpeningCandidate = (
    s: RoomPlanSurface,
    kind: 'door' | 'window' | 'balcony_door',
    defaultW: number,
    defaultH: number,
    sill: number
  ) => {
    const t = parseTransform(s.transform, s.position, s.rotation);
    const d = parseDimensions(s.dimensions, defaultW, defaultH, 0.15);
    candidates.push({
      kind,
      x: t.x,
      z: t.z,
      width: d.width,
      height: d.height,
      sillHeight: sill,
    });
  };

  rawDoors.forEach((d) => addOpeningCandidate(d, 'door', 0.9, 2.1, 0));
  rawOpenings.forEach((o) => addOpeningCandidate(o, 'door', 0.9, 2.1, 0));
  rawWindows.forEach((w) => addOpeningCandidate(w, 'window', 1.4, 1.4, 0.9));

  for (const cand of candidates) {
    let bestEdge: WallEdge | null = null;
    let minDist = Infinity;
    let bestT = 0.5;
    let edgeLen = 1;

    for (const edge of edges) {
      const n1 = nodes.find((n) => n.id === edge.startNodeId);
      const n2 = nodes.find((n) => n.id === edge.endNodeId);
      if (!n1 || !n2) continue;

      const dx = n2.x - n1.x;
      const dz = n2.y - n1.y;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 1e-4) continue;

      let t = ((cand.x - n1.x) * dx + (cand.z - n1.y) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const projX = n1.x + t * dx;
      const projZ = n1.y + t * dz;
      const dist = Math.hypot(cand.x - projX, cand.z - projZ);

      if (dist < minDist) {
        minDist = dist;
        bestEdge = edge;
        bestT = t;
        edgeLen = Math.sqrt(lenSq);
      }
    }

    if (bestEdge && minDist <= 0.8) {
      const clampedWidth = Math.min(cand.width, Math.max(0.6, edgeLen * 0.85));
      const halfT = (clampedWidth / Math.max(edgeLen, 0.1)) / 2;
      const finalT = Math.max(halfT + 0.02, Math.min(1 - halfT - 0.02, bestT));

      openings.push({
        id: `rp_op_${openings.length + 1}`,
        wallId: bestEdge.id,
        kind: cand.kind,
        t: Math.round(finalT * 100) / 100,
        width: Math.round(clampedWidth * 100) / 100,
        height: Math.round(cand.height * 100) / 100,
        sillHeight: cand.sillHeight,
      });
    }
  }

  // 5. Parse Furniture Objects
  const objects: FurnitureObject[] = [];

  rawObjects.forEach((obj, idx) => {
    const category = parseCategory(obj.category);
    const t = parseTransform(obj.transform, obj.position, obj.rotation);
    const d = parseDimensions(obj.dimensions, 1.0, 0.8, 1.0);

    const match = matchCatalogItem(category, d);
    if (!match) return;

    const finalRot = t.yaw + match.rotOffset;

    objects.push({
      id: obj.identifier || obj.id || `rp_obj_${idx + 1}`,
      catalogId: match.catalogId,
      pos: {
        x: Math.round(t.x * 100) / 100,
        y: 0,
        z: Math.round(t.z * 100) / 100,
      },
      rot: Math.round(finalRot * 100) / 100,
      scale: match.scale,
      snapToWall: true,
    });
  });

  // 6. Center the scene
  if (centerScene && nodes.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minZ = Math.min(minZ, n.y);
      maxZ = Math.max(maxZ, n.y);
    });

    const shiftX = -((minX + maxX) / 2);
    const shiftZ = -((minZ + maxZ) / 2);

    nodes.forEach((n) => {
      n.x = Math.round((n.x + shiftX) * 100) / 100;
      n.y = Math.round((n.y + shiftZ) * 100) / 100;
    });

    objects.forEach((o) => {
      o.pos.x = Math.round((o.pos.x + shiftX) * 100) / 100;
      o.pos.z = Math.round((o.pos.z + shiftZ) * 100) / 100;
    });
  }

  // 7. Add Spawn Point for Walk mode
  const hasSpawnPoint = objects.some((o) => o.catalogId === 'spawn_point');
  if (!hasSpawnPoint) {
    // Place spawn point in center of space
    objects.unshift({
      id: 'rp_spawn_point',
      catalogId: 'spawn_point',
      pos: { x: 0, y: 0, z: 0 },
      rot: 0,
      scale: { x: 1, y: 1, z: 1 },
    });
  }

  // 8. Default Camera
  const camera: CameraState = {
    mode: '3d',
    position: { x: 0, y: 10, z: 10 },
    target: { x: 0, y: 0, z: 0 },
  };

  return {
    schemaVersion: '1.0',
    walls: [], // Legacy walls
    nodes,
    edges,
    openings,
    objects,
    materials: {
      floorId: 'wood_chevron',
      wallColor: '#faf9f6',
      wallIds: {},
    },
    camera,
  };
}

// ==========================================
// Demo Apple RoomPlan Scan Dataset
// ==========================================

export const DEMO_ROOMPLAN_SCAN: RoomPlanData = {
  identifier: 'DEMO-IPHONE-LIDAR-SCAN-EURO2',
  walls: [
    // Living room / Studio exterior
    {
      identifier: 'w_north',
      dimensions: [8.0, 2.7, 0.25],
      position: [0, 1.35, -3.5],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'w_east',
      dimensions: [7.0, 2.7, 0.25],
      position: [4.0, 1.35, 0],
      rotation: [0, Math.PI / 2, 0],
    },
    {
      identifier: 'w_south',
      dimensions: [8.0, 2.7, 0.25],
      position: [0, 1.35, 3.5],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'w_west',
      dimensions: [7.0, 2.7, 0.25],
      position: [-4.0, 1.35, 0],
      rotation: [0, Math.PI / 2, 0],
    },
    // Interior partition between living room and bedroom
    {
      identifier: 'w_part_vert',
      dimensions: [4.0, 2.7, 0.15],
      position: [0.5, 1.35, 1.5],
      rotation: [0, Math.PI / 2, 0],
    },
    // Bathroom partition
    {
      identifier: 'w_part_bath_h',
      dimensions: [3.5, 2.7, 0.15],
      position: [2.25, 1.35, -0.5],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'w_part_bath_v',
      dimensions: [3.0, 2.7, 0.15],
      position: [0.5, 1.35, -2.0],
      rotation: [0, Math.PI / 2, 0],
    },
  ],
  doors: [
    // Entrance door
    {
      identifier: 'd_entrance',
      dimensions: [0.9, 2.1, 0.15],
      position: [-2.0, 1.05, -3.5],
      rotation: [0, 0, 0],
    },
    // Bedroom door
    {
      identifier: 'd_bedroom',
      dimensions: [0.8, 2.0, 0.15],
      position: [0.5, 1.0, 0.2],
      rotation: [0, Math.PI / 2, 0],
    },
    // Bathroom door
    {
      identifier: 'd_bath',
      dimensions: [0.8, 2.0, 0.15],
      position: [1.8, 1.0, -0.5],
      rotation: [0, 0, 0],
    },
  ],
  windows: [
    // Living room window
    {
      identifier: 'win_living',
      dimensions: [2.4, 2.1, 0.15],
      position: [-1.8, 1.2, 3.5],
      rotation: [0, 0, 0],
    },
    // Bedroom window
    {
      identifier: 'win_bedroom',
      dimensions: [1.6, 1.5, 0.15],
      position: [2.4, 1.35, 3.5],
      rotation: [0, 0, 0],
    },
  ],
  objects: [
    // Living room / Studio
    {
      identifier: 'sofa_living',
      category: 'sofa',
      dimensions: [2.2, 0.8, 0.9],
      position: [-2.0, 0.4, 0.5],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'tv_living',
      category: 'television',
      dimensions: [1.6, 0.5, 0.45],
      position: [-2.0, 0.3, -1.8],
      rotation: [0, Math.PI, 0],
    },
    {
      identifier: 'dining_table',
      category: 'table',
      dimensions: [1.4, 0.75, 0.8],
      position: [-1.6, 0.4, 2.0],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'dining_chair_1',
      category: 'chair',
      dimensions: [0.45, 0.85, 0.45],
      position: [-1.6, 0.4, 2.6],
      rotation: [0, Math.PI, 0],
    },
    {
      identifier: 'dining_chair_2',
      category: 'chair',
      dimensions: [0.45, 0.85, 0.45],
      position: [-1.6, 0.4, 1.4],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'fridge_kitchen',
      category: 'refrigerator',
      dimensions: [0.6, 1.8, 0.6],
      position: [-3.6, 0.9, 2.9],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'wardrobe_hall',
      category: 'storage',
      dimensions: [1.2, 2.2, 0.6],
      position: [-3.3, 1.1, -2.8],
      rotation: [0, 0, 0],
    },
    // Bedroom
    {
      identifier: 'bed_master',
      category: 'bed',
      dimensions: [1.8, 0.6, 2.0],
      position: [2.3, 0.3, 1.8],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'wardrobe_bed',
      category: 'storage',
      dimensions: [1.2, 2.2, 0.6],
      position: [3.4, 1.1, 3.0],
      rotation: [0, 0, 0],
    },
    // Bathroom
    {
      identifier: 'bath_tub',
      category: 'bathtub',
      dimensions: [1.7, 0.6, 0.75],
      position: [2.8, 0.3, -2.8],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'toilet_bath',
      category: 'toilet',
      dimensions: [0.4, 0.5, 0.7],
      position: [1.2, 0.25, -3.0],
      rotation: [0, 0, 0],
    },
    {
      identifier: 'sink_bath',
      category: 'sink',
      dimensions: [0.6, 0.85, 0.5],
      position: [1.2, 0.4, -1.2],
      rotation: [0, Math.PI, 0],
    },
  ],
};
