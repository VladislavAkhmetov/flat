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

export type OpeningKind = 'door' | 'window' | 'balcony_door';

export type DoorHingeSide = 'left' | 'right';
/** Which side of the wall the door leaf swings into (local ±Z of the wall). */
export type DoorSwingSide = 'in' | 'out';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  t: number; // normalized position (0..1) along the wall
  width: number;
  height: number;
  sillHeight: number;
  /** Door / balcony: hinge along the opening (left = toward wall start). */
  hingeSide?: DoorHingeSide;
  /** Door / balcony: swing into room ('in') or the opposite side ('out'). */
  swingSide?: DoorSwingSide;
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
  wallColor?: string;
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
  brand?: string;
  sourceUrl?: string;
  webhookUrl?: string;
}

export interface WhitelabelFeatures {
  atmosphere?: boolean;
  passport?: boolean;
  materials?: boolean;
  aiRender?: boolean;
  furniture?: boolean;
  apartmentPicker?: boolean;
  bake?: boolean;
  share?: boolean;
}

export interface WhitelabelConfig {
  brandName?: string;
  brandSubtitle?: string;
  brandLogo?: string;
  primaryColor?: string; // hex, e.g. #f59e0b, #10b981, #2563eb
  theme?: 'dark' | 'light';
  hideBranding?: boolean;
  contactPhone?: string;
  ctaText?: string;
  webhookUrl?: string;
  features?: WhitelabelFeatures;
}

export type FlatPostMessageEventType =
  | 'flat:ready'
  | 'flat:lead_submitted'
  | 'flat:apartment_changed'
  | 'flat:mode_changed'
  | 'flat:passport_downloaded';

export interface FlatPostMessageEvent {
  type: FlatPostMessageEventType;
  payload?: any;
}

export type FlatPostMessageCommandType =
  | 'flat:set_apartment'
  | 'flat:set_theme'
  | 'flat:set_color'
  | 'flat:set_atmosphere'
  | 'flat:open_lead_modal';

export interface FlatPostMessageCommand {
  type: FlatPostMessageCommandType;
  payload?: any;
}

export interface PanoramaHotspot {
  targetRoomId: string;
  targetRoomName: string;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface PanoramaData {
  id: string;
  name: string;
  file: string;
  url?: string;
  position: [number, number, number];
  hotspots: PanoramaHotspot[];
}

export interface BakeStatusResponse {
  status: 'none' | 'processing' | 'ready' | 'error';
  progress: number;
  bakedGlbUrl?: string | null;
  panoramas?: PanoramaData[] | null;
  error?: string | null;
}

