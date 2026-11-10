# Agent 技術細節紀錄 (Agent Technique Record)

本文件詳實紀錄每一次系統更新的底層技術細節、資料結構設計理念、模組劃分原則與日後修復/擴充參考指標。

---

## [2026-11-10] 階段 0.5：基礎地圖與 RTS 相機控制器技術實作 (v0.1.3)

### 1. RTS 相機控制演算法 (`src/rendering/CameraManager.ts`)

#### 1.1 球面座標（Spherical Coordinates）視角定位
相機以觀察目標錨點 $\vec{T} = (T_x, T_y, T_z)$ 為中心，依據距離 $D$、俯仰角 $\theta$（Pitch）、水平偏航角 $\phi$（Yaw）進行空間位置計算：
$$x = T_x + D \cdot \cos(\theta) \cdot \sin(\phi)$$
$$y = T_y + D \cdot \sin(\theta)$$
$$z = T_z + D \cdot \cos(\theta) \cdot \cos(\phi)$$
- **邊界保護限制**：
  - $\theta \in [10^\circ, 85^\circ]$（避免鏡頭翻轉或穿透至地底）。
  - $D \in [8\text{m}, 180\text{m}]$（提供微觀街景到宏觀全城的順暢切換）。

#### 1.2 「真．抓地拖曳」射線平移演算法 (Ray-Plane Ground Drag)
有別於傳統將螢幕像素乘上固定速度的粗糙平移，本專案採用真實物理平面交點演算法：
1. 當用戶於螢幕點 $(X_0, Y_0)$ 按下左鍵，發射射線並與地平面 $Y = 0$（法向量 $(0, 1, 0)$）相交，求得地表錨點 $\vec{P}_{\text{start}}$。
2. 當滑鼠移動至 $(X_1, Y_1)$，再次射線計算當前交點 $\vec{P}_{\text{current}}$。
3. 地表平移量為：
   $$\Delta \vec{P} = \vec{P}_{\text{start}} - \vec{P}_{\text{current}}$$
4. 將 $\Delta \vec{P}$ 累加至目標錨點 $\vec{T}$，並更新 $\vec{P}_{\text{start}} \leftarrow \text{新交點}$。
- **效果**：滑鼠點擊的地表座標將始終精準緊貼滑鼠游標，手感極度扎實流暢。
- **邊界防禦**：若攝影機仰視射向天空（射線未射中地平面），自動降級切換為相機局部坐標向與前向量投射平移。

#### 1.3 絲滑平滑阻尼 (Lerp Damping)
在每幀渲染中應用指數阻尼衰減，避免生硬跳躍：
$$v_{t} = v_{t-1} + (v_{\text{target}} - v_{t-1}) \times \text{dampFactor}$$
其中 $\text{dampFactor} = 0.12$，提供頂級 3A 遊戲般的平滑手感。

---

### 2. 基礎地圖地形技術細節 (`src/rendering/TerrainRenderer.ts`)

#### 2.1 雙層網格系統設計
- **可建設核心區**：$200\text{m} \times 200\text{m}$，採用低多邊形消光森林綠（`#223326`），避免視覺疲勞。
- **次要網格（Minor Grid）**：間隔 $2\text{m}$（單元網格，對應未來標準建築與車道基本單位）。
- **主要網格（Major Grid）**：間隔 $10\text{m}$，亮水藍色（`#38bdf8`），作為城市街區與幹道骨架參考。
- **邊界框線與原點**：以輕量 `LineSegments` 勾勒建設區邊緣，并在 $(0, 0, 0)$ 標記中心指示柱。

#### 2.2 陰影與光照調校
- 採用 `THREE.PCFSoftShadowMap`，陽光（`DirectionalLight`）解析度設定為 $2048 \times 2048$。
- 加入 `THREE.HemisphereLight`（天光天空藍 + 地光深灰藍），消除死黑陰影，確保建築被背光時依然層次分明。
- 加入 `THREE.FogExp2` 景深霧氣，使遠端地平線自然融入暗色夜空。

---

### 3. UI 純淨性與自動化實機驗證技術 (Verification & UI Minimalism)
- **UI 純淨性指標**：
  - `#ui-overlay` 保持完全透明無干擾，移除任何常駐教學文字與階段標籤。
  - 嚴格遵守規範：非必要絕不自行寫入未要求之機制與提示。
- **自動化實機啟動測試管線**：
  - 透過原生 Node.js HTTP 伺服器掛載 `dist/`，調用本機 Chromium/Edge（`--headless=new`）。
  - 成功驗證 DOM 樹正確掛載 `<canvas>`、Three.js 順暢初始化並輸出控制台日誌，確認 0 執行期崩潰。
