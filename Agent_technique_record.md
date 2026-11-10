# Agent 技術細節紀錄 (Agent Technique Record)

本文件詳實紀錄每一次系統更新的底層技術細節、資料結構設計理念、模組劃分原則與日後修復/擴充參考指標。

---

## [2026-11-10] 最終技術鏈與開發工具配置定案 (v0.1.2)

### 1. 完整技術鏈選型總結 (Tech Stack Blueprint)

| 模組維度 | 選定技術 / 工具 | 選型依據與技術考量 |
| :--- | :--- | :--- |
| **構建工具** | `Vite 5.x` | 次秒級熱更新（HMR），最適合與 AI 快速反覆運算與調整參數 |
| **程式語言** | `TypeScript 5.x` | 嚴格型別檢驗（strict: true），降低 AI 幻覺與執行期型別錯誤 |
| **3D 渲染核心** | `Three.js` (原生) | 避免 React/R3F 的虛擬 DOM 陷阱，直通 WebGL 批次繪製 |
| **3D 物件呈現** | **Procedural Low-Poly** | 以代碼動態生成幾何體，零檔案體積，配合 `InstancedMesh` 極致優化 |
| **音效驅動核心** | **Web Audio API** | 瀏覽器原生硬體加速音訊，低延遲，原生支援 3D 空間定位 |
| **音效合成演算法** | **ZzFX** | <1KB 純代碼參數化合成，免除外部 MP3/WAV 檔案依賴 |
| **空間與空間定位** | `THREE.AudioListener` + `THREE.PositionalAudio` | 與相機視角連動，實現真實空間距離衰減與平移音場 |
| **邏輯與模擬層** | 純 TypeScript（Decoupled） | 固定 Tick 步長，完全與渲染隔離，預留未來 Web Worker 支援 |

---

### 2. 3D 物件「程式化低多邊形」技術實作細節

#### 2.1 幾何生成規範（Procedural Geometry Pipeline）
- **建築物生成策略**：
  - 基礎構造：以 `THREE.BoxGeometry` 為基座主體。
  - 屋頂與細節：透過 `THREE.ConeGeometry`、`THREE.CylinderGeometry` 或複合幾何，依照建築等級（Level 1~5）動態拼接。
  - 網格合併優化：多個幾何單元組裝後，調用 `BufferGeometryUtils.mergeGeometries` 合併為單一幾何體，消除子 Mesh 產生的 Draw Call。
- **車輛與市民生成策略**：
  - 車輛：採用簡約雙體立方體（車身 + 駕駛艙）與圓柱車輪，統一套用至 `THREE.InstancedMesh`。
  - 市民：採用微型膠囊體（Capsule）或簡約小體素，搭配頂點著色或材質調色板。
- **抽象工廠設計（Geometry Factory）**：
  - 封裝 `ProceduralBuildingFactory.create(type, level)`，回傳標準化 `THREE.BufferGeometry`，日後若替換為外部 GLTF 載入器，介面保持完全相容。

---

### 3. 音效系統架構細節（SoundManager Specification）

#### 3.1 系統架構圖
```text
           [ 瀏覽器 Web Audio Context ]
                      │
     ┌────────────────┴────────────────┐
     ▼                                 ▼
[ ZzFX 音效微核心 ]             [ Three.js 空間音效系統 ]
(UI 建造/拆除/按鈕點擊)         (環境環境音 / 路口車流 / 工廠)
     │                                 │
     │ 即時參數合成                    ▼
     │                         THREE.AudioListener (綁定 Camera)
     │                                 ▲
     │                                 │ 距離衰減計算
     │                                 │
     └─────────────────────────► THREE.PositionalAudio (掛載至特定座標)
```

#### 3.2 模組介面規劃
- **模組路徑**：`src/audio/SoundManager.ts`
- **核心功能清單**：
  - `init()`：由用戶首次互動（點擊/按鍵）時喚醒解鎖 `AudioContext`（符合瀏覽器安全政策）。
  - `playUI(soundType: 'build' | 'demolish' | 'click' | 'error' | 'tax')`：調用 ZzFX 數值產生器發出清脆反饋。
  - `updateCameraListener(camera: THREE.Camera)`：將空間監聽器同步至相機。
  - `playSpatial(soundType, worldPos: Vector3D)`：在指定空間點發聲。

---

### 4. 開發路線圖架構規範 (DEV Roadmap Architecture, 2026-11-10 新增)
- **路線圖結構文件**：`DEV_roadMap.md`
- **階段劃分原則**：由低階資料結構推進至高階視覺與閉環玩法：
  - **階段 1~2（核心交通基石）**：路網圖論 `RoadGraph` $\to$ A* 尋路與防撞跟車 `TrafficSystem`。
  - **階段 3~4（城市動態運算）**：土地分區 RCI 生長 `BuildingSystem` $\to$ 24 小時作息時鐘 `CitizenSystem`。
  - **階段 5~7（感官表現層）**：Procedural 幾何工廠 $\to$ GIS 多維 Shader 圖層 $\to$ Web Audio 3D 音效。
  - **階段 8~9（經營遊戲閉環）**：經濟與稅收 HUD 面板 $\to$ 存檔與突發挑戰事件。
- **擴充預留設計**：每個階段均維持「純邏輯模組 (`simulation/`)」與「渲染表現模組 (`rendering/`)」嚴格一對一分離，確保未來任何單一階段實作時，隨時可單獨撰寫單元測試。
