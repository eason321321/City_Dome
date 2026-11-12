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

/**
 * 建築分區密度分級（供共用狀態機依不同密度分級判斷規則）
 */
export type BuildingDensityLevel = 'Low' | 'Medium' | 'High';
