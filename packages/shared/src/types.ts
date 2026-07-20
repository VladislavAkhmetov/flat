export interface SceneData {
  schemaVersion: "1.0";
  walls: Wall[]; // Legacy - kept for backward compatibility
  nodes: WallNode[]; // Graph nodes (corners)
  edges: WallEdge[]; // Graph edges (walls connecting nodes)
  openings: Opening[];
  objects: FurnitureObject[];
  materials: MaterialMap;
  camera: CameraState;
  constraints?: Constraints;
  planImage?: string | { url: string; width: number; height: number } | null;
}

export type WallKind = 'bearing' | 'partition' | 'user';

export interface Wall {
  id: string;
  a: { x: number; y: number };
  b: { x: number; y: number };
  thickness: number;
  height: number;
  kind: WallKind;
  locked?: boolean;
  visible?: boolean;
}

// Graph-based Wall Architecture (Node-Edge)
export interface WallNode {
  id: string;
  x: number;
  y: number;
}

export interface WallEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  thickness: number;
  height: number;
  kind: WallKind;
}

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  t: number; // normalized position (0..1) along the wall
  width: number;
  height: number;
  sillHeight: number;
}

export interface FurnitureObject {
  id: string;
  catalogId: string;
  pos: { x: number; y: number; z: number };
  rot: number; // rotation around Y (up)
  scale: { x: number; y: number; z: number };
  snapToWall?: boolean;
}

export interface MaterialMap {
  floorId?: string;
  wallIds: Record<string, string>; // wallId -> materialId
}

export type CameraMode = '2d' | '3d' | 'walk';
export type EditorMode = 'view' | 'walls' | 'furniture' | 'openings';

export interface CameraState {
  mode: CameraMode;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov?: number;
  zoom?: number;
}

export interface Constraints {
  risers?: { x: number; y: number; radius: number }[];
  noBuildZones?: { x: number; y: number }[][];
}

export interface LeadPayload {
  name: string;
  phone: string;
  comment?: string;
  sceneId: string;
  shareToken: string;
}
