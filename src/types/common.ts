/**
 * 通用基礎數據結構
 */

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector2D {
  x: number;
  z: number;
}

export interface GridCoord {
  gx: number;
  gz: number;
}

export type EntityId = string;
