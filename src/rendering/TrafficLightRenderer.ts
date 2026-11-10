import * as THREE from 'three';

export type SignalLightColor = 'red' | 'yellow' | 'green';

export interface TrafficSignalState {
  northSouth: SignalLightColor;
  eastWest: SignalLightColor;
}

/**
 * 3D 紅綠燈模型與視覺控制器 (TrafficLightRenderer)
 * 於十字路口與 T 字路口角落生成擬真低多邊形號誌燈柱，
 * 支援紅/黃/綠即時發光切換與夜間自體發光效果。
 */
export class TrafficLightRenderer {
  public group: THREE.Group;

  // 燈號網格快取
  private nsRedLamps: THREE.Mesh[] = [];
  private nsYellowLamps: THREE.Mesh[] = [];
  private nsGreenLamps: THREE.Mesh[] = [];

  private ewRedLamps: THREE.Mesh[] = [];
  private ewYellowLamps: THREE.Mesh[] = [];
  private ewGreenLamps: THREE.Mesh[] = [];

  // 共享發光材質
  private static matRedOn = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xff1111,
    emissiveIntensity: 2.5,
    roughness: 0.2,
  });
  private static matRedOff = new THREE.MeshStandardMaterial({
    color: 0x450a0a,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.8,
  });

  private static matYellowOn = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xffaa00,
    emissiveIntensity: 2.5,
    roughness: 0.2,
  });
  private static matYellowOff = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.8,
  });

  private static matGreenOn = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x00ff44,
    emissiveIntensity: 2.5,
    roughness: 0.2,
  });
  private static matGreenOff = new THREE.MeshStandardMaterial({
    color: 0x052e16,
    emissive: 0x000000,
    emissiveIntensity: 0,
    roughness: 0.8,
  });

  private static poleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.7,
    roughness: 0.4,
  });

  private static boxMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.8,
    metalness: 0.2,
  });

  constructor(gx: number, gz: number, hasNorthSouth: boolean, hasEastWest: boolean) {
    this.group = new THREE.Group();
    this.group.position.set(gx, 0, gz);

    // 在路口對角設置號誌燈柱（東北角與西南角，或四角）
    // 角落偏移量為 0.88m (2m 道路邊界為 1.0m)
    const corners = [
      { x: 0.88, z: 0.88, rotY: 0 },
      { x: -0.88, z: -0.88, rotY: Math.PI },
    ];

    for (const pos of corners) {
      const pole = this.createPoleAssembly(hasNorthSouth, hasEastWest);
      pole.position.set(pos.x, 0, pos.z);
      pole.rotation.y = pos.rotY;
      this.group.add(pole);
    }

    // 初始狀態：南北綠燈、東西紅燈
    this.updateLights({ northSouth: 'green', eastWest: 'red' });
  }

  /**
   * 建立單一號誌燈柱總成（垂直燈柱 + 橫臂 + 號誌燈箱）
   */
  private createPoleAssembly(hasNorthSouth: boolean, hasEastWest: boolean): THREE.Group {
    const poleGroup = new THREE.Group();

    // 1. 垂直主金屬桿
    const postGeo = new THREE.CylinderGeometry(0.025, 0.035, 1.5, 8);
    const post = new THREE.Mesh(postGeo, TrafficLightRenderer.poleMat);
    post.position.y = 0.75;
    post.castShadow = true;
    poleGroup.add(post);

    // 2. 懸臂橫桿
    const armGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
    const arm = new THREE.Mesh(armGeo, TrafficLightRenderer.poleMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-0.25, 1.45, 0);
    poleGroup.add(arm);

    // 3. 南北向號誌燈箱
    if (hasNorthSouth) {
      const nsBox = this.createSignalBox('NS');
      nsBox.position.set(-0.45, 1.35, 0);
      nsBox.rotation.y = 0; // 面向南北
      poleGroup.add(nsBox);
    }

    // 4. 東西向號誌燈箱
    if (hasEastWest) {
      const ewBox = this.createSignalBox('EW');
      ewBox.position.set(0, 1.35, -0.2);
      ewBox.rotation.y = Math.PI / 2; // 面向東西
      poleGroup.add(ewBox);
    }

    return poleGroup;
  }

  /**
   * 建立單一三色號誌燈箱
   */
  private createSignalBox(direction: 'NS' | 'EW'): THREE.Group {
    const boxGroup = new THREE.Group();

    // 外殼
    const housingGeo = new THREE.BoxGeometry(0.12, 0.32, 0.08);
    const housing = new THREE.Mesh(housingGeo, TrafficLightRenderer.boxMat);
    boxGroup.add(housing);

    // 遮光罩 (Visors) 幾何
    const lampGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12);
    lampGeo.rotateX(Math.PI / 2);

    // 紅燈 (頂部)
    const redLamp = new THREE.Mesh(lampGeo, TrafficLightRenderer.matRedOff);
    redLamp.position.set(0, 0.09, 0.04);
    boxGroup.add(redLamp);

    // 黃燈 (中央)
    const yellowLamp = new THREE.Mesh(lampGeo, TrafficLightRenderer.matYellowOff);
    yellowLamp.position.set(0, 0, 0.04);
    boxGroup.add(yellowLamp);

    // 綠燈 (底部)
    const greenLamp = new THREE.Mesh(lampGeo, TrafficLightRenderer.matGreenOff);
    greenLamp.position.set(0, -0.09, 0.04);
    boxGroup.add(greenLamp);

    if (direction === 'NS') {
      this.nsRedLamps.push(redLamp);
      this.nsYellowLamps.push(yellowLamp);
      this.nsGreenLamps.push(greenLamp);
    } else {
      this.ewRedLamps.push(redLamp);
      this.ewYellowLamps.push(yellowLamp);
      this.ewGreenLamps.push(greenLamp);
    }

    return boxGroup;
  }

  /**
   * 刷新當前燈號視覺發光狀態
   */
  public updateLights(state: TrafficSignalState): void {
    // 1. 南北向燈號
    for (const lamp of this.nsRedLamps) {
      lamp.material = state.northSouth === 'red' ? TrafficLightRenderer.matRedOn : TrafficLightRenderer.matRedOff;
    }
    for (const lamp of this.nsYellowLamps) {
      lamp.material = state.northSouth === 'yellow' ? TrafficLightRenderer.matYellowOn : TrafficLightRenderer.matYellowOff;
    }
    for (const lamp of this.nsGreenLamps) {
      lamp.material = state.northSouth === 'green' ? TrafficLightRenderer.matGreenOn : TrafficLightRenderer.matGreenOff;
    }

    // 2. 東西向燈號
    for (const lamp of this.ewRedLamps) {
      lamp.material = state.eastWest === 'red' ? TrafficLightRenderer.matRedOn : TrafficLightRenderer.matRedOff;
    }
    for (const lamp of this.ewYellowLamps) {
      lamp.material = state.eastWest === 'yellow' ? TrafficLightRenderer.matYellowOn : TrafficLightRenderer.matYellowOff;
    }
    for (const lamp of this.ewGreenLamps) {
      lamp.material = state.eastWest === 'green' ? TrafficLightRenderer.matGreenOn : TrafficLightRenderer.matGreenOff;
    }
  }

  /**
   * 銷毀清除場景物件
   */
  public destroy(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
