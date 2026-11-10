import * as THREE from 'three';

/**
 * 預設車輛色彩調色盤 (現代城市質感色系)
 */
export const VEHICLE_COLORS = [
  0x0284c7, // 天空蔚藍 (Electric Blue)
  0xdc2626, // 亮紅 (Crimson Red)
  0x16a34a, // 翡翠綠 (Emerald Green)
  0xea580c, // 暖日橙 (Sunset Orange)
  0xf8fafc, // 珍珠白 (Pearl White)
  0x334155, // 鐵灰 (Slate Gray)
  0xeab308, // 鮮黃 (Cyber Yellow)
  0x7c3aed, // 紫羅蘭 (Violet)
];

/**
 * 程式化低多邊形車輛模型工廠 (VehicleModelFactory)
 * 依據專案「物件程式化低多邊形 (Procedural Low-Poly Primitives)」定案規範，
 * 動態組裝具備車身、車頂、前後擋風玻璃、車窗、發光車頭燈/車尾燈與四輪輪轂的 3D 車輛模型。
 */
export class VehicleModelFactory {
  // 共享輪胎幾何與材質
  private static wheelGeo: THREE.CylinderGeometry | null = null;
  private static hubcapGeo: THREE.CylinderGeometry | null = null;
  private static wheelMat: THREE.MeshStandardMaterial | null = null;
  private static hubcapMat: THREE.MeshStandardMaterial | null = null;

  // 共享車窗材質
  private static windowMat: THREE.MeshStandardMaterial | null = null;

  // 共享發光車燈材質
  private static headlightMat: THREE.MeshStandardMaterial | null = null;
  private static taillightMat: THREE.MeshStandardMaterial | null = null;

  /**
   * 建立一輛 3D 車輛實體模型
   * @param color 自訂車身顏色 (可選，預設隨機挑選)
   */
  public static createVehicle(color?: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'VehicleEntity';

    const carColor = color !== undefined 
      ? color 
      : VEHICLE_COLORS[Math.floor(Math.random() * VEHICLE_COLORS.length)];

    // 1. 車身烤漆材質 (具備微反光與金屬質感)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: carColor,
      roughness: 0.28,
      metalness: 0.55,
    });

    // 2. 下層主車身 (寬 0.44m, 高 0.15m, 長 0.82m)
    const lowerBodyGeo = new THREE.BoxGeometry(0.44, 0.15, 0.82);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lowerBody.position.set(0, 0.13, 0);
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    group.add(lowerBody);

    // 3. 上層座艙 (車頂) (寬 0.38m, 高 0.13m, 長 0.44m，位置略微偏後)
    const cabinGeo = new THREE.BoxGeometry(0.38, 0.13, 0.44);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 0.25, -0.04);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    group.add(cabin);

    // 4. 車窗玻璃 (深藍灰反光材質)
    const winMat = this.getWindowMaterial();

    // 前擋風玻璃 (微傾斜)
    const frontWindshieldGeo = new THREE.BoxGeometry(0.36, 0.11, 0.04);
    const frontWindshield = new THREE.Mesh(frontWindshieldGeo, winMat);
    frontWindshield.position.set(0, 0.24, 0.18);
    frontWindshield.rotation.x = 0.25; // 前傾
    group.add(frontWindshield);

    // 後擋風玻璃
    const rearWindshieldGeo = new THREE.BoxGeometry(0.36, 0.10, 0.04);
    const rearWindshield = new THREE.Mesh(rearWindshieldGeo, winMat);
    rearWindshield.position.set(0, 0.24, -0.26);
    rearWindshield.rotation.x = -0.25; // 後傾
    group.add(rearWindshield);

    // 兩側側窗
    const sideWindowsGeo = new THREE.BoxGeometry(0.39, 0.09, 0.36);
    const sideWindows = new THREE.Mesh(sideWindowsGeo, winMat);
    sideWindows.position.set(0, 0.25, -0.04);
    group.add(sideWindows);

    // 5. 車頭大燈 (前方 +Z 側，自體發光溫白光)
    const headMat = this.getHeadlightMaterial();
    const headlightGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);

    const leftHeadlight = new THREE.Mesh(headlightGeo, headMat);
    leftHeadlight.position.set(-0.15, 0.14, 0.415);
    group.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(headlightGeo, headMat);
    rightHeadlight.position.set(0.15, 0.14, 0.415);
    group.add(rightHeadlight);

    // 6. 車尾煞車燈 (後方 -Z 側，自體發光晶亮紅光)
    const tailMat = this.getTaillightMaterial();
    const taillightGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);

    const leftTaillight = new THREE.Mesh(taillightGeo, tailMat);
    leftTaillight.position.set(-0.15, 0.14, -0.415);
    group.add(leftTaillight);

    const rightTaillight = new THREE.Mesh(taillightGeo, tailMat);
    rightTaillight.position.set(0.15, 0.14, -0.415);
    group.add(rightTaillight);

    // 7. 4 個橡膠輪胎與金屬輪轂
    const wheelPositions = [
      { x: -0.22, z: 0.24 },  // 左前輪
      { x: 0.22, z: 0.24 },   // 右前輪
      { x: -0.22, z: -0.24 }, // 左後輪
      { x: 0.22, z: -0.24 },  // 右後輪
    ];

    const wheelGeo = this.getWheelGeometry();
    const hubcapGeo = this.getHubcapGeometry();
    const wheelMat = this.getWheelMaterial();
    const hubcapMat = this.getHubcapMaterial();

    for (const pos of wheelPositions) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(pos.x, 0.08, pos.z);

      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      const hubcap = new THREE.Mesh(hubcapGeo, hubcapMat);
      hubcap.rotation.z = Math.PI / 2;
      hubcap.position.x = pos.x > 0 ? 0.02 : -0.02;
      wheelGroup.add(hubcap);

      group.add(wheelGroup);
    }

    // 車身整體等比縮放 * 0.9 (符合二車道路面車道淨寬比例)
    group.scale.set(0.9, 0.9, 0.9);

    return group;
  }

  private static getWindowMaterial(): THREE.MeshStandardMaterial {
    if (!this.windowMat) {
      this.windowMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.1,
        metalness: 0.9,
      });
    }
    return this.windowMat;
  }

  private static getHeadlightMaterial(): THREE.MeshStandardMaterial {
    if (!this.headlightMat) {
      this.headlightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfffbeb,
        emissiveIntensity: 2.5,
        roughness: 0.2,
      });
    }
    return this.headlightMat;
  }

  private static getTaillightMaterial(): THREE.MeshStandardMaterial {
    if (!this.taillightMat) {
      this.taillightMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xff1111,
        emissiveIntensity: 2.5,
        roughness: 0.2,
      });
    }
    return this.taillightMat;
  }

  private static getWheelGeometry(): THREE.CylinderGeometry {
    if (!this.wheelGeo) {
      this.wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.045, 12);
    }
    return this.wheelGeo;
  }

  private static getHubcapGeometry(): THREE.CylinderGeometry {
    if (!this.hubcapGeo) {
      this.hubcapGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.046, 12);
    }
    return this.hubcapGeo;
  }

  private static getWheelMaterial(): THREE.MeshStandardMaterial {
    if (!this.wheelMat) {
      this.wheelMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.85,
        metalness: 0.1,
      });
    }
    return this.wheelMat;
  }

  private static getHubcapMaterial(): THREE.MeshStandardMaterial {
    if (!this.hubcapMat) {
      this.hubcapMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.3,
        metalness: 0.8,
      });
    }
    return this.hubcapMat;
  }
}
