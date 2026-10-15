// Shapes shared by the UI and the main thread.
// Comment fields follow Figma's REST API (GET /v1/files/:key/comments).

export type ApiHost = 'https://api.figma.com' | 'https://api.figma-gov.com';

export interface Vector {
  x: number;
  y: number;
}

// Where a comment is pinned. Figma uses one of four shapes: a canvas point (x, y), a frame
// offset (node_id, node_offset), or either of those as a region (region_width, region_height).
export interface ClientMeta {
  x?: number;
  y?: number;
  node_id?: string;
  node_offset?: Vector;
  region_width?: number;
  region_height?: number;
  comment_pin_corner?: string;
}

export interface FigmaUser {
  id?: string;
  handle?: string;
  img_url?: string;
}

export interface Reaction {
  emoji: string;
  user?: FigmaUser | null;
  created_at?: string;
}

export interface FigmaComment {
  id: string;
  parent_id?: string | null;
  user?: FigmaUser | null;
  created_at: string;
  resolved_at?: string | null;
  message?: string;
  reactions?: Reaction[];
  client_meta?: ClientMeta | null;
  order_id?: string | null;
}

// Where a commented node lived in the original file, recorded at export so the
// import can find it again by page and layer path if node IDs changed.
export interface Locator {
  page: string | null;
  path: string[];
  type: string;
  abs: Vector | null;
}

// Keyed by original node ID; null means the node wasn't in the file at export.
export type Locators = Record<string, Locator | null>;

export interface ExportFile {
  format: string;
  exported_at?: string;
  source: { apiHost: ApiHost; fileKey: string; fileName: string };
  comments: FigmaComment[];
  locators?: Locators;
}
