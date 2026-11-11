import * as THREE from 'three';
import { RoadNetwork, RoadTile } from '../systems/RoadNetwork';
import { VehicleModelFactory, VEHICLE_COLORS } from '../rendering/VehicleModelFactory';

export interface ParkedCar {
  id: string;
  tileKey: string;
  side: 'west' | 'east' | 'north' | 'south';
  position: THREE.Vector3;
  rotationY: number;
  color: number;
  mesh: THREE.Group;
}

export interface CurbsideSpot {
  position: THREE.Vector3;
  rotationY: number;
  side: 'west' | 'east' | 'north' | 'south';
  tileKey: string;
}

/**
 * 路邊停車管理器 (ParkingManager)
 * 負責：
 * 1. 嚴格判定路邊停車合法性（清楚編寫路口、轉角與高速公路禁止停車規則）
 * 2. 計算路側路緣石旁精準停放座標與朝向（與行車動線保持 14cm 以上安全淨距，絕不碰撞）
 * 3. 支援點選生成、隨機生成、位置佔用防重疊與一鍵清除
 * 4. 提供開發者工具箱（DevMenu）即時懸停半透明 Ghost 車輛預覽
 */
export class ParkingManager {
  private scene: THREE.Scene;
  private roadNetwork: RoadNetwork;
  private parkedCars: Map<string, ParkedCar> = new Map();
  private nextCarId: number = 1;

  // 停車與路中線之橫向偏移距離 (車道寬 0.75m，路緣在 0.75m，車寬 0.20m，車身中心置於 0.62m 處，緊貼路緣 3cm，距行車道邊界 14cm)
  private readonly CURB_PARKING_OFFSET = 0.62;

  // 車輛防重疊最小前後車距 (車長約 0.37m，最小間距 0.46m)
  private readonly MIN_PARKING_DISTANCE = 0.46;

  constructor(scene: THREE.Scene, roadNetwork: RoadNetwork) {
    this.scene = scene;
    this.roadNetwork = roadNetwork;
  }

  /**
   * 規則審查：嚴格檢查指定道路網格是否允許路邊停車
   * 規則清楚明確，避免遮蔽路口號誌視野與轉彎盲區
   */
  public canParkAtTile(tile: RoadTile | undefined): { allowed: boolean; reason?: string } {
    if (!tile) {
      return { allowed: false, reason: '此處非道路鋪設區域' };
    }

    // 規則 1：邊界橫貫聯外高速公路 (南界 Z=97) 嚴格禁止路邊停車 (保持城際幹線暢通與安全)
    if (tile.gz === 97) {
      return { allowed: false, reason: '外部聯外高速公路禁止路邊停車' };
    }

    // 規則 2：十字路口 (FourWay) 與 T 字路口 (ThreeWay) 範圍內嚴格禁止路邊停車 (避免遮蔽路口轉向與號誌視野)
    if (tile.type === 'FourWay' || tile.type === 'ThreeWay') {
      return { allowed: false, reason: '路口範圍內嚴格禁止路邊停車 (保持路口轉彎與號誌通暢)' };
    }

    // 規則 3：轉彎道 (Corner) 嚴格禁止路邊停車 (避免車輛轉彎內輪差死角碰撞)
    if (tile.type === 'Corner') {
      return { allowed: false, reason: '道路轉彎弧線區域禁止路邊停車' };
    }

    // 規則 4：僅允許在一般直線道路 (Straight) 與路段盡頭 (DeadEnd) 之兩側路緣石旁停放
    if (tile.type !== 'Straight' && tile.type !== 'DeadEnd') {
      return { allowed: false, reason: '該路段型態不允許路邊停車' };
    }

    return { allowed: true };
  }

  /**
   * 根據點選之世界坐標，計算最近之路側路緣合法停車位座標與車頭朝向
   */
  public getCurbsideSpot(worldPoint: THREE.Vector3): { valid: boolean; spot?: CurbsideSpot; reason?: string } {
    const gx = Math.floor(worldPoint.x / 2) * 2 + 1;
    const gz = Math.floor(worldPoint.z / 2) * 2 + 1;
    const tileKey = `${gx},${gz}`;
    const tile = this.roadNetwork.getTile(tileKey);

    // 審查路段合法性
    const check = this.canParkAtTile(tile);
    if (!check.allowed || !tile) {
      return { valid: false, reason: check.reason };
    }

    const isNorthSouth = tile.rotationY === 0;
    let spotPos: THREE.Vector3;
    let rotY: number;
    let side: 'west' | 'east' | 'north' | 'south';

    if (isNorthSouth) {
      // 南北向道路 (沿 Z 軸行駛)
      // 西側路緣 (X < gx)：車頭朝南順行 (rotY = PI)
      // 東側路緣 (X >= gx)：車頭朝北順行 (rotY = 0)
      const isWestSide = worldPoint.x < gx;
      side = isWestSide ? 'west' : 'east';
      const parkX = isWestSide ? gx - this.CURB_PARKING_OFFSET : gx + this.CURB_PARKING_OFFSET;
      rotY = isWestSide ? Math.PI : 0;

      // 限制車身長度留在格位範圍內 (防止超出至相鄰格位邊界)
      const clampedZ = THREE.MathUtils.clamp(worldPoint.z, gz - 0.55, gz + 0.55);
      spotPos = new THREE.Vector3(parkX, 0.04, clampedZ);
    } else {
      // 東西向道路 (沿 X 軸行駛)
      // 北側路緣 (Z < gz)：車頭朝西順行 (rotY = -PI/2)
      // 南側路緣 (Z >= gz)：車頭朝東順行 (rotY = PI/2)
      const isNorthSide = worldPoint.z < gz;
      side = isNorthSide ? 'north' : 'south';
      const parkZ = isNorthSide ? gz - this.CURB_PARKING_OFFSET : gz + this.CURB_PARKING_OFFSET;
      rotY = isNorthSide ? -Math.PI / 2 : Math.PI / 2;

      const clampedX = THREE.MathUtils.clamp(worldPoint.x, gx - 0.55, gx + 0.55);
      spotPos = new THREE.Vector3(clampedX, 0.04, parkZ);
    }

    // 檢查該側是否有其他停車重疊或距離過近
    for (const car of this.parkedCars.values()) {
      if (car.position.distanceTo(spotPos) < this.MIN_PARKING_DISTANCE) {
        return { valid: false, reason: '此位置已有其他停放車輛 (車位已被佔用)' };
      }
    }

    return {
      valid: true,
      spot: {
        position: spotPos,
        rotationY: rotY,
        side,
        tileKey,
      },
    };
  }

  /**
   * 於指定世界座標處放置一輛路邊停放車輛
   */
  public spawnParkedCarAt(worldPoint: THREE.Vector3, colorHex?: number): { success: boolean; reason?: string; car?: ParkedCar } {
    const res = this.getCurbsideSpot(worldPoint);
    if (!res.valid || !res.spot) {
      return { success: false, reason: res.reason };
    }

    const { spot } = res;
    const color = colorHex ?? VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];
    const mesh = VehicleModelFactory.createVehicle(color);

    mesh.position.copy(spot.position);
    mesh.rotation.y = spot.rotationY;
    this.scene.add(mesh);

    const parkedCar: ParkedCar = {
      id: `parked_car_${this.nextCarId++}`,
      tileKey: spot.tileKey,
      side: spot.side,
      position: spot.position.clone(),
      rotationY: spot.rotationY,
      color,
      mesh,
    };

    mesh.userData = { parkedCarId: parkedCar.id };
    this.parkedCars.set(parkedCar.id, parkedCar);

    return { success: true, car: parkedCar };
  }

  /**
   * 移除特定車輛
   */
  public removeParkedCar(id: string): boolean {
    const car = this.parkedCars.get(id);
    if (!car) return false;

    this.scene.remove(car.mesh);
    this.parkedCars.delete(id);
    return true;
  }

  /**
   * 清除全城所有路邊停放車輛
   */
  public clearAllParkedCars(): void {
    for (const car of this.parkedCars.values()) {
      this.scene.remove(car.mesh);
    }
    this.parkedCars.clear();
  }

  /**
   * 取得所有路邊停車清單
   */
  public getAllParkedCars(): ParkedCar[] {
    return Array.from(this.parkedCars.values());
  }

  public getParkedCarCount(): number {
    return this.parkedCars.size;
  }

  /**
   * 隨機在全城合法道路路緣旁停放車輛 (預設 5 輛)
   */
  public spawnRandomParkedCars(targetCount: number = 5): number {
    const eligibleTiles: RoadTile[] = [];
    for (const tile of this.roadNetwork.getAllTiles()) {
      if (this.canParkAtTile(tile).allowed) {
        eligibleTiles.push(tile);
      }
    }

    if (eligibleTiles.length === 0) return 0;

    // 洗牌候選路段
    const shuffled = [...eligibleTiles].sort(() => Math.random() - 0.5);
    let spawnedCount = 0;

    for (const tile of shuffled) {
      if (spawnedCount >= targetCount) break;

      const isNorthSouth = tile.rotationY === 0;
      // 隨機嘗試兩側各兩個車位
      const offsets = [-0.45, 0.45];
      const sides = isNorthSouth ? [-0.62, 0.62] : [-0.62, 0.62];

      for (const sideOffset of sides.sort(() => Math.random() - 0.5)) {
        for (const alongOffset of offsets.sort(() => Math.random() - 0.5)) {
          if (spawnedCount >= targetCount) break;

          const testPoint = isNorthSouth
            ? new THREE.Vector3(tile.gx + sideOffset, 0.04, tile.gz + alongOffset)
            : new THREE.Vector3(tile.gx + alongOffset, 0.04, tile.gz + sideOffset);

          const res = this.spawnParkedCarAt(testPoint);
          if (res.success) {
            spawnedCount++;
          }
        }
      }
    }

    return spawnedCount;
  }

  /**
   * 建立開發者選單點選預覽用之半透明 Ghost 車輛 Mesh
   */
  public createGhostCarMesh(): THREE.Group {
    const ghost = VehicleModelFactory.createVehicle(0x38bdf8);
    ghost.name = 'ParkingGhostCar';

    const ghostMatValid = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      wireframe: false,
    });

    ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = ghostMatValid;
      }
    });

    return ghost;
  }
}
