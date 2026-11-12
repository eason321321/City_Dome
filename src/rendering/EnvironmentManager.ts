import * as THREE from 'three';
import { WorldTime } from '../types';

/**
 * 環境、大氣、天空與遠景山水管理器
 * 負責：
 * 1. 大氣漸層天幕 (Atmospheric Sky Dome Shader) 與夜間星辰、可視日月星體
 * 2. 漂浮的低多邊形白雲系統 (Procedural Low-Poly Floating Clouds)
 * 3. 遠景低多邊形自然山脈環 (Low-Poly Mountain Range)
 * 4. 動態海灣海面與海岸浪花 (Low-Poly Animated Coastal Ocean & Square Shoreline Foam)
 * 5. 自然海岸植被與礁石 (Coastal Boulders & Low-Poly Trees，嚴格避開核心 200x200m 建設區)
 * 6. 連動 24 小時世界時間的晝夜光影與色彩插值系統 (Day/Night Lighting & Fog Cycle)
 */
export class EnvironmentManager {
  public group: THREE.Group;
  private scene: THREE.Scene;

  // 光照系統
  private sunLight: THREE.DirectionalLight;
  private moonLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private fog: THREE.FogExp2;

  // 天空穹頂與天體
  private skyDomeMesh!: THREE.Mesh;
  private skyMaterial!: THREE.ShaderMaterial;
  private sunDisc!: THREE.Mesh;
  private moonDisc!: THREE.Mesh;
  private starsPoints!: THREE.Points;
  private starsMaterial!: THREE.PointsMaterial;

  // 低多邊形雲群
  private cloudsGroup: THREE.Group = new THREE.Group();
  private cloudMeshes: {
    mesh: THREE.Group;
    speedX: number;
    speedZ: number;
    baseY: number;
  }[] = [];

  // 低多邊形動態海洋與浪花
  private oceanMesh!: THREE.Mesh;
  private oceanMaterial!: THREE.MeshStandardMaterial;
  private oceanGeometry!: THREE.PlaneGeometry;
  private oceanBasePositions!: Float32Array;
  private foamMesh!: THREE.Mesh;
  private foamMaterial!: THREE.MeshBasicMaterial;
  private oceanTime: number = 0;

  // 遠景山脈與海岸植被
  private mountainsGroup: THREE.Group = new THREE.Group();
  private coastalDecorGroup: THREE.Group = new THREE.Group();

  // 陽光/月光軌道半徑
  private readonly orbitRadius: number = 340;
  private readonly celestialVisualDist: number = 580;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 1. 初始化光照系統
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.7);
    this.scene.add(this.hemiLight);

    // 主陽光 (投射陰影)
    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 480;
    this.sunLight.shadow.camera.left = -140;
    this.sunLight.shadow.camera.right = 140;
    this.sunLight.shadow.camera.top = 140;
    this.sunLight.shadow.camera.bottom = -140;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 月光 (夜間柔和照明)
    this.moonLight = new THREE.DirectionalLight(0x93c5fd, 0.42);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight);

    // 霧氣初始化 (柔和融入遠景天際線)
    this.fog = new THREE.FogExp2(0xbae6fd, 0.0018);
    this.scene.fog = this.fog;

    // 2. 初始化各大視覺模組
    this.initSkyDomeAndCelestials();
    this.initClouds();
    this.initOcean();
    this.initMountainRange();
    this.initCoastalDecorations();

    // 預先以預設早晨 (06:00) 執行一次光影色彩初始化
    this.updateLighting(6, 0);
  }

  public getSunLight(): THREE.DirectionalLight {
    return this.sunLight;
  }

  // =========================================================================
  // 1. 大氣漸層天幕、太陽、月亮與夜間繁星 (Sky Dome & Celestial Bodies)
  // =========================================================================

  private initSkyDomeAndCelestials(): void {
    const skyGeo = new THREE.SphereGeometry(760, 32, 16);

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uOffset;
      uniform float uExponent;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, uOffset, 0.0)).y;
        float factor = max(pow(max(h, 0.0), uExponent), 0.0);
        vec3 skyColor = mix(uBottomColor, uTopColor, factor);
        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x0284c7) },
        uBottomColor: { value: new THREE.Color(0xbae6fd) },
        uOffset: { value: 25.0 },
        uExponent: { value: 0.65 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.skyDomeMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.group.add(this.skyDomeMesh);

    // 太陽實體 (低多邊形發光圓球)
    const sunGeo = new THREE.IcosahedronGeometry(18, 1);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      fog: false,
    });
    this.sunDisc = new THREE.Mesh(sunGeo, sunMat);
    this.group.add(this.sunDisc);

    // 月亮實體 (銀白低多邊形冰月)
    const moonGeo = new THREE.IcosahedronGeometry(13, 1);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      fog: false,
    });
    this.moonDisc = new THREE.Mesh(moonGeo, moonMat);
    this.group.add(this.moonDisc);

    // 夜間繁星點陣 (位於半球上半部)
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.92 + 0.08); // 僅分布於地平線以上
      const r = 680;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

    this.starsMaterial = new THREE.PointsMaterial({
      color: 0xf8fafc,
      size: 2.2,
      transparent: true,
      opacity: 0.0,
      fog: false,
      depthWrite: false,
    });
    this.starsPoints = new THREE.Points(starsGeo, this.starsMaterial);
    this.group.add(this.starsPoints);
  }

  // =========================================================================
  // 2. 漂浮低多邊形白雲系統 (Procedural Low-Poly Floating Clouds)
  // =========================================================================

  private initClouds(): void {
    this.group.add(this.cloudsGroup);

    const cloudCount = 18;
    for (let i = 0; i < cloudCount; i++) {
      const cloud = this.createLowPolyCloud();

      const angle = (i / cloudCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 50 + Math.random() * 290;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const y = 95 + Math.random() * 38;

      cloud.position.set(x, y, z);
      const s = 0.8 + Math.random() * 0.95;
      cloud.scale.set(s, s * 0.62, s);

      this.cloudsGroup.add(cloud);

      this.cloudMeshes.push({
        mesh: cloud,
        speedX: (0.7 + Math.random() * 1.1) * 1.15,
        speedZ: (Math.random() - 0.5) * 0.35,
        baseY: y,
      });
    }
  }

  private createLowPolyCloud(): THREE.Group {
    const cloudGroup = new THREE.Group();
    const puffCount = 5 + Math.floor(Math.random() * 4);

    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });

    for (let i = 0; i < puffCount; i++) {
      const radius = 6 + Math.random() * 7;
      const puffGeo = new THREE.IcosahedronGeometry(radius, 1);
      const puffMesh = new THREE.Mesh(puffGeo, cloudMat);

      const px = i === 0 ? 0 : (Math.random() - 0.5) * 24;
      const py = i === 0 ? 0 : (Math.random() - 0.5) * 6;
      const pz = i === 0 ? 0 : (Math.random() - 0.5) * 14;
      puffMesh.position.set(px, py, pz);

      puffMesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      cloudGroup.add(puffMesh);
    }

    return cloudGroup;
  }

  // =========================================================================
  // 3. 低多邊形動態海面與正方形沙灘浪花 (Low-Poly Animated Ocean & Foam)
  // =========================================================================

  private initOcean(): void {
    // 1400x1400m 廣闊海平面 (60x60 低多邊形分段，兼具經典三角形水光折射與極佳效能)
    this.oceanGeometry = new THREE.PlaneGeometry(1400, 1400, 60, 60);
    this.oceanGeometry.rotateX(-Math.PI / 2);

    const pos = this.oceanGeometry.attributes.position;

    // 輕微擾動平鋪頂點創造手工感三角網格
    for (let i = 0; i < pos.count; i++) {
      const idx = i * 3;
      pos.array[idx] += (Math.random() - 0.5) * 6.0;
      pos.array[idx + 2] += (Math.random() - 0.5) * 6.0;
    }

    // 記錄擾動後的基礎座標，供後續正弦波浪動畫計算
    this.oceanBasePositions = new Float32Array(pos.array.length);
    this.oceanBasePositions.set(pos.array);

    pos.needsUpdate = true;
    this.oceanGeometry.computeVertexNormals();

    this.oceanMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,       // 清澈藍綠海灣色
      roughness: 0.18,
      metalness: 0.16,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    });

    this.oceanMesh = new THREE.Mesh(this.oceanGeometry, this.oceanMaterial);
    this.oceanMesh.position.y = -0.78; // 基準面 -0.78m，確保波峰最大僅約 -0.52m 絕不穿透過沙灘與地面
    this.oceanMesh.receiveShadow = true;
    this.group.add(this.oceanMesh);

    // 緊貼 240x240m 崖岸外緣的四邊浪花白沫環
    this.initShorelineFoam();
  }

  private initShorelineFoam(): void {
    // 繪製外邊半徑 126m、內孔半徑 119.5m 的正方形浪花框，緊密貼合 240x240m 海島崖邊
    const outer = 126.0;
    const inner = 119.5;

    const foamShape = new THREE.Shape();
    foamShape.moveTo(-outer, -outer);
    foamShape.lineTo(outer, -outer);
    foamShape.lineTo(outer, outer);
    foamShape.lineTo(-outer, outer);
    foamShape.closePath();

    const holePath = new THREE.Path();
    holePath.moveTo(-inner, -inner);
    holePath.lineTo(-inner, inner);
    holePath.lineTo(inner, inner);
    holePath.lineTo(inner, -inner);
    holePath.closePath();
    foamShape.holes.push(holePath);

    const foamGeo = new THREE.ShapeGeometry(foamShape);
    foamGeo.rotateX(-Math.PI / 2);

    this.foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.foamMesh = new THREE.Mesh(foamGeo, this.foamMaterial);
    this.foamMesh.position.y = -0.60; // 浮於海面與崖岸交界處
    this.group.add(this.foamMesh);
  }

  // =========================================================================
  // 4. 遠景自然山脈環 (Procedural Low-Poly Mountain Range)
  // =========================================================================

  private initMountainRange(): void {
    this.group.add(this.mountainsGroup);

    // 在海灣對岸 (半徑 250m ~ 460m) 生成環繞群山與海灣峽口
    const mountainCount = 38;
    for (let i = 0; i < mountainCount; i++) {
      const baseAngle = (i / mountainCount) * Math.PI * 2;
      // 保留兩處開闊海灣視野出口，讓視角能遙望海天一色
      const isBayOpening =
        (baseAngle > 0.35 && baseAngle < 1.15) ||
        (baseAngle > 3.35 && baseAngle < 3.85);

      const dist = 250 + (Math.sin(i * 3.7) * 0.5 + 0.5) * 170;
      const x = Math.cos(baseAngle) * dist;
      const z = Math.sin(baseAngle) * dist;

      const height = isBayOpening
        ? 6 + Math.random() * 10
        : 34 + (Math.sin(i * 2.1) * 0.5 + 0.5) * 48;

      const baseRadius = isBayOpening
        ? 30 + Math.random() * 20
        : 58 + Math.random() * 44;

      const mountain = this.createSingleMountain(baseRadius, height);
      mountain.position.set(x, -2.5, z);
      mountain.rotation.y = Math.random() * Math.PI * 2;

      this.mountainsGroup.add(mountain);
    }
  }

  private createSingleMountain(radius: number, height: number): THREE.Mesh {
    const radialSegments = 7 + Math.floor(Math.random() * 4);
    const heightSegments = 5;

    const coneGeo = new THREE.ConeGeometry(radius, height, radialSegments, heightSegments, false);
    coneGeo.translate(0, height / 2, 0);

    const pos = coneGeo.attributes.position;
    // 使用空間座標 Hash 雜湊映射表確保接縫處共點頂點取得完全一致的偏移，杜絕山體撕裂縫隙
    const jitterCache = new Map<string, { dx: number; dz: number }>();
    for (let i = 0; i < pos.count; i++) {
      const ox = pos.getX(i);
      const oy = pos.getY(i);
      const oz = pos.getZ(i);
      if (oy > 0.1 && oy < height * 0.95) {
        const key = `${Math.round(ox * 10)}_${Math.round(oy * 10)}_${Math.round(oz * 10)}`;
        let offset = jitterCache.get(key);
        if (!offset) {
          offset = {
            dx: (Math.random() - 0.5) * (radius * 0.28),
            dz: (Math.random() - 0.5) * (radius * 0.28),
          };
          jitterCache.set(key, offset);
        }
        pos.setX(i, ox + offset.dx);
        pos.setZ(i, oz + offset.dz);
      }
    }

    const nonIndexedGeo = coneGeo.toNonIndexed();
    nonIndexedGeo.computeVertexNormals();

    const count = nonIndexedGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const posAttr = nonIndexedGeo.attributes.position;

    const colorGreen = new THREE.Color(0x2d5a3f);
    const colorRock = new THREE.Color(0x526070);
    const colorSnow = new THREE.Color(0xf1f5f9);

    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      const ratio = Math.max(0, Math.min(1, y / height));

      const vertexColor = new THREE.Color();
      if (ratio < 0.35) {
        vertexColor.copy(colorGreen).lerp(colorRock, ratio / 0.35);
      } else if (ratio < 0.72) {
        vertexColor.copy(colorRock).lerp(colorSnow, (ratio - 0.35) / 0.37);
      } else {
        vertexColor.copy(colorSnow);
      }

      colors[i * 3] = vertexColor.r;
      colors[i * 3 + 1] = vertexColor.g;
      colors[i * 3 + 2] = vertexColor.b;
    }

    nonIndexedGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mountainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(nonIndexedGeo, mountainMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // =========================================================================
  // 5. 自然海岸植被與礁石 (嚴格配置於 [-100,100] 建設區外的沙灘環帶)
  // =========================================================================

  private initCoastalDecorations(): void {
    this.group.add(this.coastalDecorGroup);

    // 沿著四邊沙灘緩衝帶 (max(|x|, |z|) 在 102.5 ~ 114.5 之間) 隨機撒放松樹與海岸礁石
    const decorCount = 72;
    for (let i = 0; i < decorCount; i++) {
      // 均勻選取四個邊緣方位 (北、南、東、西)
      const side = i % 4;
      const along = (Math.random() - 0.5) * 224; // -112 ~ +112
      const offset = 102.5 + Math.random() * 11.5; // 嚴格介於 102.5 ~ 114.0 之間

      let x = 0;
      let z = 0;
      if (side === 0) {
        x = along;
        z = offset;
      } else if (side === 1) {
        x = along;
        z = -offset;
      } else if (side === 2) {
        x = offset;
        z = along;
      } else {
        x = -offset;
        z = along;
      }

      // 靠近建設區內緣 (offset < 108) 多生長針葉松樹，靠外水線多分布礁石
      if (offset < 108.5 && Math.random() < 0.72) {
        const tree = this.createLowPolyTree();
        tree.position.set(x, -0.15, z);
        const s = 0.75 + Math.random() * 0.55;
        tree.scale.set(s, s, s);
        this.coastalDecorGroup.add(tree);
      } else {
        const rock = this.createLowPolyRock();
        rock.position.set(x, -0.25, z);
        const s = 0.7 + Math.random() * 0.9;
        rock.scale.set(s, s * 0.65, s);
        this.coastalDecorGroup.add(rock);
      }
    }
  }

  private createLowPolyTree(): THREE.Group {
    const tree = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 1.6, 5);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      flatShading: true,
      roughness: 0.9,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({
      color: Math.random() > 0.5 ? 0x2e6f40 : 0x3b7a57,
      flatShading: true,
      roughness: 0.8,
    });

    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.1, 6), foliageMat);
    cone1.position.y = 2.3;
    cone1.castShadow = true;
    tree.add(cone1);

    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.7, 6), foliageMat);
    cone2.position.y = 3.25;
    cone2.castShadow = true;
    tree.add(cone2);

    return tree;
  }

  private createLowPolyRock(): THREE.Mesh {
    const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.1,
    });

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  // =========================================================================
  // 6. 動態更新循環：海浪波紋、浮雲飄移、潮汐白沫與 24 小時晝夜大氣
  // =========================================================================

  public update(delta: number, time: WorldTime): void {
    this.updateOceanWaves(delta);
    this.updateClouds(delta);
    this.updateLighting(time.hour, time.minute);
  }

  private updateOceanWaves(delta: number): void {
    this.oceanTime += delta * 1.35;
    const pos = this.oceanGeometry.attributes.position;
    const base = this.oceanBasePositions;
    const count = pos.count;
    const t = this.oceanTime;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const x = base[idx];
      const z = base[idx + 2];

      const wave =
        Math.sin(x * 0.04 + t * 1.1) * 0.10 +
        Math.cos(z * 0.04 + t * 0.85) * 0.10 +
        Math.sin((x + z) * 0.025 + t * 1.4) * 0.05;

      pos.array[idx + 1] = wave;
    }

    pos.needsUpdate = true;
    this.oceanGeometry.computeVertexNormals();

    // 潮汐浪花白沫脈動呼吸效果
    if (this.foamMaterial) {
      this.foamMaterial.opacity = 0.32 + Math.sin(t * 1.6) * 0.14;
      const foamScale = 1.0 + Math.sin(t * 1.6) * 0.006;
      this.foamMesh.scale.set(foamScale, 1, foamScale);
    }
  }

  private updateClouds(delta: number): void {
    const bound = 420;
    for (const c of this.cloudMeshes) {
      c.mesh.position.x += c.speedX * delta * 5.0;
      c.mesh.position.z += c.speedZ * delta * 5.0;
      c.mesh.position.y = c.baseY + Math.sin(this.oceanTime * 0.55 + c.mesh.position.x * 0.02) * 1.1;

      if (c.mesh.position.x > bound) c.mesh.position.x = -bound;
      else if (c.mesh.position.x < -bound) c.mesh.position.x = bound;

      if (c.mesh.position.z > bound) c.mesh.position.z = -bound;
      else if (c.mesh.position.z < -bound) c.mesh.position.z = bound;
    }
  }

  private updateLighting(hour: number, minute: number): void {
    const timeDec = hour + minute / 60.0; // 0.0 ~ 24.0

    // 太陽軌道角：06:00 日出 (0), 12:00 正午 (PI/2), 18:00 日落 (PI)
    const sunAngle = ((timeDec - 6.0) / 12.0) * Math.PI;
    const moonAngle = sunAngle + Math.PI;

    const sunElevation = Math.sin(sunAngle);
    const sunAzimuth = Math.cos(sunAngle);
    const sunDir = new THREE.Vector3(
      sunAzimuth,
      sunElevation * 0.78,
      0.35 * Math.sin(sunAngle * 0.5)
    ).normalize();

    this.sunLight.position.copy(sunDir).multiplyScalar(this.orbitRadius);
    this.sunDisc.position.copy(sunDir).multiplyScalar(this.celestialVisualDist);
    this.sunDisc.visible = sunElevation > -0.1;

    const moonElevation = Math.sin(moonAngle);
    const moonAzimuth = Math.cos(moonAngle);
    const moonDir = new THREE.Vector3(
      moonAzimuth,
      moonElevation * 0.78,
      -0.35 * Math.sin(sunAngle * 0.5)
    ).normalize();

    this.moonLight.position.copy(moonDir).multiplyScalar(this.orbitRadius);
    this.moonDisc.position.copy(moonDir).multiplyScalar(this.celestialVisualDist);
    this.moonDisc.visible = moonElevation > -0.1;

    // 色彩插值變數
    const skyTop = new THREE.Color();
    const skyBottom = new THREE.Color();
    const fogColor = new THREE.Color();
    const hemiSky = new THREE.Color();
    const hemiGround = new THREE.Color();
    const sunColor = new THREE.Color();
    const oceanColor = new THREE.Color();

    let sunIntensity = 0.0;
    let moonIntensity = 0.0;
    let hemiIntensity = 0.7;
    let starOpacity = 0.0;

    if (timeDec >= 8.5 && timeDec <= 16.0) {
      // --- 盛晝陽光 (Daytime) ---
      skyTop.setHex(0x0284c7);
      skyBottom.setHex(0xbae6fd);
      fogColor.setHex(0xbae6fd);
      hemiSky.setHex(0xe0f2fe);
      hemiGround.setHex(0x334155);
      sunColor.setHex(0xfffbeb);
      oceanColor.setHex(0x0284c7);
      sunIntensity = 1.45;
      moonIntensity = 0.0;
      hemiIntensity = 0.75;
      starOpacity = 0.0;
    } else if (timeDec >= 5.0 && timeDec < 8.5) {
      // --- 晨曦拂曉 (Sunrise / Dawn) ---
      const t = (timeDec - 5.0) / 3.5;
      skyTop.setHex(0x1e1b4b).lerp(new THREE.Color(0x0284c7), t);
      skyBottom.setHex(0xfdba74).lerp(new THREE.Color(0xbae6fd), t);
      fogColor.copy(skyBottom);
      hemiSky.setHex(0xfef08a).lerp(new THREE.Color(0xe0f2fe), t);
      hemiGround.setHex(0x1e293b).lerp(new THREE.Color(0x334155), t);
      sunColor.setHex(0xfb923c).lerp(new THREE.Color(0xfffbeb), t);
      oceanColor.setHex(0x0369a1).lerp(new THREE.Color(0x0284c7), t);
      sunIntensity = 0.35 + t * 1.1;
      moonIntensity = (1.0 - t) * 0.2;
      hemiIntensity = 0.45 + t * 0.3;
      starOpacity = Math.max(0, (1.0 - t * 2.5) * 0.8);
    } else if (timeDec > 16.0 && timeDec <= 19.5) {
      // --- 絢爛黃昏 (Sunset / Dusk) ---
      const t = (timeDec - 16.0) / 3.5;
      skyTop.setHex(0x0284c7).lerp(new THREE.Color(0x312e81), t);
      skyBottom.setHex(0xbae6fd).lerp(new THREE.Color(0xf97316), t);
      fogColor.copy(skyBottom);
      hemiSky.setHex(0xfb923c).lerp(new THREE.Color(0x4338ca), t);
      hemiGround.setHex(0x334155).lerp(new THREE.Color(0x1e1b4b), t);
      sunColor.setHex(0xff7722).lerp(new THREE.Color(0xef4444), t);
      oceanColor.setHex(0x0284c7).lerp(new THREE.Color(0x1e3a8a), t);
      sunIntensity = (1.0 - t) * 1.45;
      moonIntensity = t * 0.35;
      hemiIntensity = 0.75 - t * 0.3;
      starOpacity = Math.max(0, (t - 0.5) * 1.6);
    } else {
      // --- 深邃星夜 (Night) ---
      let nightFactor = 1.0;
      if (timeDec > 19.5 && timeDec < 21.0) {
        nightFactor = (timeDec - 19.5) / 1.5;
      } else if (timeDec >= 4.0 && timeDec < 5.0) {
        nightFactor = 1.0 - (timeDec - 4.0);
      }

      skyTop.setHex(0x312e81).lerp(new THREE.Color(0x020617), nightFactor);
      skyBottom.setHex(0x1e1b4b).lerp(new THREE.Color(0x0f172a), nightFactor);
      fogColor.copy(skyBottom);
      hemiSky.setHex(0x1e293b);
      hemiGround.setHex(0x020617);
      oceanColor.setHex(0x0f172a);
      sunIntensity = 0.0;
      moonIntensity = 0.44;
      hemiIntensity = 0.38;
      starOpacity = 0.85;
    }

    if (this.skyMaterial) {
      this.skyMaterial.uniforms.uTopColor.value.copy(skyTop);
      this.skyMaterial.uniforms.uBottomColor.value.copy(skyBottom);
    }

    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(sunColor);
    this.oceanMaterial.color.copy(oceanColor);
    this.starsMaterial.opacity = starOpacity;
    this.starsPoints.rotation.y += 0.00003;

    this.scene.background = skyBottom;
    this.fog.color.copy(fogColor);

    // 當太陽沒入地平線下時平滑關閉日光照射與陰影，避免光源從地底反照
    const aboveHorizon = THREE.MathUtils.clamp((sunElevation + 0.05) / 0.15, 0, 1);
    const effectiveSunIntensity = Math.max(0, sunIntensity * aboveHorizon);

    this.sunLight.color.copy(sunColor);
    this.sunLight.intensity = effectiveSunIntensity;
    this.sunLight.castShadow = sunElevation > 0.03 && effectiveSunIntensity > 0.15;

    this.moonLight.intensity = moonIntensity;

    this.hemiLight.color.copy(hemiSky);
    this.hemiLight.groundColor.copy(hemiGround);
    this.hemiLight.intensity = hemiIntensity;
  }
}
