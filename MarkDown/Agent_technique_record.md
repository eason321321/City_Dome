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

---

### 4. 底部狀態欄 UI 與時間推進系統 (`src/ui/BottomStatusBar.ts` & `src/simulation/TimeManager.ts`)

#### 4.1 虛擬世界時間推進與日曆進位演算法
- **起始時間規格**：精確鎖定於 `2027/01/01 06:00 AM`。
- **時間倍率換算**：設定 $1\text{ 實際秒} = 6\text{ 虛擬分鐘}$（即每 $10\text{ 實際秒} = 1\text{ 虛擬小時}$）。
- **幀率解耦累積器**：採用 `deltaTime` 累計虛擬秒數：
  $$\text{virtualSeconds} \mathrel{+}= \Delta t \times 360$$
  每當積累滿 $60\text{s}$ 即推動 1 虛擬分鐘，依序向小時（24h制）、日期、月份與西元年進位。
- **精確日曆計算**：實作大月、小月及閏年動態天數判定：
  $$\text{isLeapYear} = (\text{year} \pmod 4 = 0 \land \text{year} \pmod{100} \neq 0) \lor (\text{year} \pmod{400} = 0)$$
- **響應式觀察者機制**：透過 `onTimeChange` 與 `onPauseChange` 回調解除 UI 渲染與物理模擬的強耦合。

#### 4.2 底部狀態欄毛玻璃樣式與視覺層次 (HUD Design)
- **毛玻璃外觀**：
  - 底盤：`background: rgba(18, 15, 25, 0.86)` 搭配 `backdrop-filter: blur(12px)`，呈現深色金屬感。
  - 邊框與投影：`1px solid rgba(255, 255, 255, 0.12)` 加上 `box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55)`，在各色地形上方具備最高辨識度。
- **數字排版防抖**：全局指定 `font-variant-numeric: tabular-nums`，保證時間與金錢數值跳動時文字寬度恆定，杜絕介面晃動感。
- **向量圖標與互動細節**：
  - **開始/暫停鈕**：遊戲推進中顯示紅色暫停雙槓 `⏸`（`#ef4444`）；暫停時切換為綠色播放箭頭 `▶`（`#22c55e`），支援點擊與 Space 鍵全局切換。
  - **金錢**：精準手繪綠色立體鈔票堆疊 SVG（`#4ade80` / `#22c55e`），數值採美式千分位逗號格式化。
  - **人口**：水藍色市民人形剪影 SVG（`#38bdf8`），清晰傳遞居住人口意象。
- **事件穿透隔離防禦**：
  - 底欄根容器註冊 `mousedown` 與 `pointerdown` 之 `e.stopPropagation()`，防止玩家在狀態欄上點擊時觸發 RTS 地圖拖曳與旋轉。

---

### 5. 道路網格吸附、天際線標線紋理與建造選單 (`RoadTextureFactory.ts`, `RoadManager.ts`, `BuildMenu.ts`)

#### 5.1 擬真天際線路面標線程式化紋理技術
- **動態 Canvas 紋理**：使用 $512 \times 512$ HTML Canvas 程式化即時繪製，無須依賴任何外部圖片資產：
  - **瀝青顆粒基底**：`#22252a` 搭配動態常態分佈顆粒雜訊（$\pm 16$ 灰度微擾）。
  - **兩側路緣石（Curbs）**：混凝土邊界（寬 $18\text{px}$，`#3e4451`）。
  - **兩側霧線邊界（Fog Lines）**：純白實線（寬 $8\text{px}$，`#f1f5f9`）。
  - **中央雙向分道線**：鮮亮黃色虛線（`#f59e0b`，寬 $10\text{px}$），採用 $40\text{px}$ 實線與 $24\text{px}$ 留白循環：
    $$\frac{512}{40 + 24} = 8\text{ 個完整循環}$$
    確保跨相鄰路段網格接縫時，中央虛線達到完美連續性。
- **立體路面幾何與材質**：採用 `BoxGeometry(2, 0.05, 2)`，頂部為路面紋理，側邊為多材質路緣石，避免地面 Z-fighting。

#### 5.2 2m 次要網格吸附與直向路徑計算
- **格網中心吸附公式**：
  $$g_x = \left\lfloor \frac{x}{\text{cellSize}} \right\rfloor \times \text{cellSize} + \frac{\text{cellSize}}{2}$$
  $$g_z = \left\lfloor \frac{z}{\text{cellSize}} \right\rfloor \times \text{cellSize} + \frac{\text{cellSize}}{2}$$
  其中 $\text{cellSize} = 2\text{m}$，完美吻合 `TerrainRenderer` 預設之次要網格。
- **直放正交鎖定**：比對 $\Delta x$ 與 $\Delta z$：
  - 若 $|\Delta x| \ge |\Delta z|$，鎖定沿 X 軸直線鋪設，車道網格旋轉角設為 $90^\circ$（$\frac{\pi}{2}$）。
  - 若 $|\Delta z| > |\Delta x|$，鎖定沿 Z 軸直線鋪設，車道網格旋轉角設為 $0^\circ$。

#### 5.3 人性化雙模操作與 RTS 鏡頭防誤觸
- **雙模式鋪設支援**：
  1. **按壓拖曳（Drag-and-Release）**：按下左鍵拖曳至目標格放開即刻完工。
  2. **點擊連續（Click-to-Click）**：點選起點 $\to$ 移動滑鼠預覽 $\to$ 再次點擊確認建造。
- **相機控制隔離**：當建造工具啟動時，自動呼叫 `cameraManager.setLeftDragEnabled(false)`，釋放滑鼠左鍵作為建造專用，中鍵仍可自由平移，右鍵或 ESC 鍵可隨時撤銷預覽或退出工具。
- **即時預覽與經濟鉤子**：每格建造成本 $\$10$，國庫存款充足時顯示半透明水藍光（Valid），不足時轉為紅光警示（Invalid），並在完工時同步更新國庫存款。

---

### 6. WASD 視角運動學、道路交叉斑馬線拓撲、3D 紅綠燈狀態機與連續車道有向圖 (`CameraManager.ts`, `RoadTextureFactory.ts`, `TrafficLightRenderer.ts`, `RoadNetwork.ts`)

#### 6.1 WASD 與鍵盤平移運動學 (Yaw-Oriented Kinematics)
- **航向相對位移向量**：鍵盤輸入位移向量 $\vec{v}_{\text{move}}$ 依相機目前水平偏航角（$\text{Yaw}$）在 XZ 平面上即時旋轉投影：
  $$\vec{f} = \begin{pmatrix} -\sin(\text{Yaw}) \\ 0 \\ -\cos(\text{Yaw}) \end{pmatrix}, \quad \vec{r} = \begin{pmatrix} \cos(\text{Yaw}) \\ 0 \\ -\sin(\text{Yaw}) \end{pmatrix}$$
- **動態縮放適配速度**：平移速度正比於相機與地面距離，確保在拉遠全覽時高速前進、拉近細看時精細微調：
  $$v_{\text{pan}} = \max(25, d_{\text{target}} \times 0.95)$$

#### 6.2 道路交叉拓撲判斷與斑馬線紋理合成
- **鄰近度分析**：每次放置或變動車道時，以自身為中心檢查東、西、南、北 4 個相鄰 2m 網格之度數（$\text{Degree} \in [0, 4]$）：
  - $\text{Degree} = 4 \implies$ 十字路口（`FourWay`）：載入四向斑馬線與四角轉角路緣石紋理。
  - $\text{Degree} = 3 \implies$ T 字路口（`ThreeWay`）：載入三向斑馬線紋理，貫通側保持無開口平直路緣石，並依缺失方向動態旋轉 $0^\circ, 90^\circ, 180^\circ, 270^\circ$。
  - $\text{Degree} = 2 \implies$ 直道（共線）或 90 度彎道（`Corner`，圓弧分道標線）。
- **天際線標準斑馬線紋理規格**：於每個進入路口的車道入口處繪製寬度 $44\text{px}$、間隔 $20\text{px}$ 的並列白色條紋（Zebra Crossings），並於內緣繪製寬 $8\text{px}$ 白色實線停止線（Stop Line）。

#### 6.3 3D 紅綠燈號誌狀態機與節點資料結構
- **3D 號誌模型**：低多邊形金屬燈柱（高 $1.5\text{m}$）+ 懸臂 + 南北向/東西向三色燈箱，具備自體發光標準材質（`emissiveIntensity: 2.5`）。
- **相位狀態機循環 (Traffic Phase Cycle)**：
  $$\text{NS\_Green (8s)} \to \text{NS\_Yellow (2s)} \to \text{All\_Red (1s)} \to \text{EW\_Green (8s)} \to \text{EW\_Yellow (2s)} \to \text{All\_Red (1s)}$$
- **數據記錄解耦**：路口狀態記錄於 `IntersectionData`，包含 `northSouth: 'green' | 'yellow' | 'red'` 與 `eastWest`，隨虛擬世界時間驅動（遊戲暫停時號誌計時同步定格）。

#### 6.4 車道層級有向圖（Directed Lane Graph）自動縫合技術
- **右行制（RHT）雙車道空間分佈**：
  - 南向車道（$+Z$）：中心點位於 $(gx - 0.5, 0.04, gz)$。
  - 北向車道（$-Z$）：中心點位於 $(gx + 0.5, 0.04, gz)$。
  - 東向車道（$+X$）：中心點位於 $(gx, 0.04, gz + 0.5)$。
  - 西向車道（$-X$）：中心點位於 $(gx, 0.04, gz - 0.5)$。
- **分批拉出之車道自動融合**：
  - 每個車道具有 `entryPoint`、`centerPoint`、`exitPoint` 與 `connectedNextLaneIds`。
  - 只要兩批車道在空間中相鄰接觸，拓撲引擎立即在 `allLanes` 雙向登記下游相銜接的 `id`。
  - 在路口處，直行車道自動分支出左轉與右轉的下游節點索引，為後續車輛 A* 尋路與號誌停車提供完整底層支援。

---

### 7. 自訂懸浮規格卡、立體高架人行道與綠底人行斑馬線 (`BuildMenu.ts`, `RoadTextureFactory.ts`, `RoadNetwork.ts`)

#### 7.1 徹底清除原生 title 與自訂 HUD 懸浮規格卡
- **去除原生 Tooltip**：全局移除 DOM 節點上的 `title` 屬性，避免觸發瀏覽器與作業系統內建的白底黃框提示框。
- **一致性毛玻璃規格面板 (`road-spec-card`)**：
  - 定位於子選單上方（`bottom: calc(100% + 10px)`），採用 `rgba(15, 23, 42, 0.95)` 與 `backdrop-filter: blur(16px)`。
  - 清楚羅列 5 大法定道路參數：通行方向（雙向）、速限（50 km/h）、人行步道（包含立體高架人行道）、路邊停車（禁止停車）、迴轉規定（路段禁止迴轉）。

#### 7.2 雙向車道 3D 立體高架人行道幾何與階差
- **空間分配幾何規格**：
  - 單元小格總寬：$2.0\text{m}$。
  - 中央雙向行車道：淨寬 $1.3\text{m}$，路面頂部高度 $y = 0.035\text{m}$。
  - 兩側立體人行道：左側 $x \in [-1.0\text{m}, -0.65\text{m}]$（寬 $0.35\text{m}$）、右側 $x \in [+0.65\text{m}, +1.0\text{m}]$（寬 $0.35\text{m}$）。
  - 人行道高度：頂部標高 $y = 0.07\text{m}$（較車道高出 $0.035\text{m}$ / 3.5cm 階梯高度），具備真實 3D 陰影與立體路緣石斷面。
  - 獨立材質：生成 $256 \times 256$ 灰色混凝土方磚紋理（`#94a3b8` 搭配 `#64748b` 磚縫）。

#### 7.3 斑馬線人行道等寬銜接規格
- **等寬對齊原則**：
  - 斑馬線寬度（跨越深度）精準設計為 $0.35\text{m}$（對應 $512\text{px}$ 紋理之 $90\text{px}$），與兩側高架人行道寬度 $1:1$ 吻合。
  - 在十字路口與 T 字路口角處生成 $0.35\text{m} \times 0.35\text{m}$ 的人行廣場平台，斑馬線直接自兩端角平台無縫平滑延伸橫跨路面。

#### 7.4 枕木紋瀝青底色回歸、T 字路口直通淨空與車道末端橫向阻礙修復 (`RoadTextureFactory.ts`, `RoadNetwork.ts`)
- **斑馬線枕木紋與原生瀝青底色**：
  - 依開發者指示移除鼠尾草綠安全襯底，斑馬線背景回歸為與車道瀝青完全一致之深灰色（`#22252a`）。
  - 十字路口四向與 T 字路口支線入口處改為簡潔厚實的純白枕木紋條紋（Sleeper Stripes，每個路口繪製 7 條寬 $24\text{px}$ 純白條紋，間距均勻）。
- **T 字路口主線貫通與支線穿越邏輯**：
  - T 字路口直線貫通側（南北向直行幹道）車道全程暢通，中央分道黃色虛線直通，路面不繪製橫截直行的斑馬線。
  - 僅在需要行人橫越支線的支道入口（東側）繪製枕木紋斑馬線與白色停止線。
  - 西側維持完整連貫的高架立體人行道（`addBox(0.35, 2.0, -0.825, 0)`），東側兩角各設置 $0.35\text{m} \times 0.35\text{m}$ 轉角人行平台。
- **直道末端橫跨人行道消除 (Bug Fix)**：
  - 原問題：單格或直線終端被歸類為 `DeadEnd` 時，原程式碼呼叫 `addBox(1.3, 0.35, 0, -0.825)` 放置橫向路緣石，在旋轉鋪設時於車道接合處或末端形成莫名橫跨車道的高架人行道方塊。
  - 修復方案：將 `DeadEnd` 與 `Straight` 之立體人行道生成邏輯完全合流，僅保留車道左右兩側縱向 $0.35\text{m} \times 2.0\text{m}$ 人行道，中央 $1.3\text{m}$ 車道永久開放暢通，徹底解決橫向阻礙問題。

---

### 8. T 字路口旋轉幾何修正與十字路口中央白色實線圈移除 (`RoadNetwork.ts`, `RoadTextureFactory.ts`)

#### 8.1 Three.js 右手坐標系旋轉變換與 T 字路口拓撲修正
- **旋轉手性問題剖析**：
  - 在 Three.js 坐標系中，$\vec{Y}$ 向上，俯視 XZ 平面時順時針為負角度，逆時針為正角度。繞 Y 軸正向旋轉角度 $\theta$ 時：
    $$x_{\text{world}} = x_{\text{local}} \cos\theta + z_{\text{local}} \sin\theta$$
    $$z_{\text{world}} = -x_{\text{local}} \sin\theta + z_{\text{local}} \cos\theta$$
  - 本地定義（$\theta = 0$）：幹道為南北向（$Z$ 軸），連續高架人行道在西側（$x_{\text{local}} = -0.825$），支線進入開口與過街斑馬線在東側（$x_{\text{local}} = +0.825$）。
  - 原代碼在北側無路（`!hasN`，支線在南 $+Z$）時誤設 $\theta = \frac{\pi}{2}$，導致東側開口被轉至北側（$z_{\text{world}} = -\sin(\pi/2) = -1$），斑馬線畫在空地，高架人行道反而擋住支路。
- **嚴謹旋轉四方位對應表**：
  - `!hasW`（西側無路，支線在東 $+X$）：$\theta = 0$。
  - `!hasN`（北側無路，支線在南 $+Z$）：$\theta = \frac{3\pi}{2}$（即 $-\frac{\pi}{2}$，$\sin(3\pi/2) = -1 \implies z_{\text{world}} = +1$），確保支線開口與過街斑馬線正對南側支路。
  - `!hasE`（東側無路，支線在西 $-X$）：$\theta = \pi$。
  - `!hasS`（南側無路，支線在北 $-Z$）：$\theta = \frac{\pi}{2}$（$\sin(\pi/2) = 1 \implies z_{\text{world}} = -1$），支線開口與過街斑馬線正對北側支路。
- 同步校正 `Corner` 彎道旋轉映射：
  - `hasS && hasE`: $0$
  - `hasN && hasE`: $\frac{\pi}{2}$
  - `hasN && hasW`: $\pi$
  - `hasS && hasW`: $\frac{3\pi}{2}$

#### 8.2 移除十字路口中心封閉實線方框
- **問題分析**：原先十字路口四個入口在枕木紋內側各繪製了一條橫跨全寬的白色實線（`roadInnerW`），這 4 條線在四個角點相交，合成了一個封閉的白色正方形實線框（「一圈白色實線」），違背真實道路外觀。
- **重構方案**：
  - 全面移除 `getFourWayTexture()` 中四道白色線段繪製邏輯。
  - 路口中央回歸純淨深灰瀝青路面（`#22252a`），僅保留四側入口處各 7 條並列的標準純白枕木條紋，視覺更通透、專業，完全契合現代擬真城市建造遊戲水準。

---

### 9. 彎道同心圓弧標線幾何、外角人行道補齊與車道外圍瀝青空缺根治 (`RoadTextureFactory.ts`, `RoadNetwork.ts`)

#### 9.1 彎道標線同心圓幾何重構
- **錯誤根因剖析**：
  - 原先在 `getCornerTexture()` 中，外側白線誤用 `ctx.arc(0, 0, 512 - 96, 0, 0.5 * Math.PI)`，圓心位於左上角 `(0, 0)`，導致白線朝車道內部凹陷凸出，與中央黃線（圓心在 `(512, 512)`）產生反向曲率對撞，將外側車道腰斬並切出大片空缺。
- **嚴謹同心圓弧架構（以內角 $(512, 512)$ 為唯一同心圓心）**：
  - 道路單元寬度 $2.0\text{m} \iff 512\text{px}$，車道各寬 $0.65\text{m} \iff 160\text{px}$，人行道各寬 $0.35\text{m} \iff 90\text{px}$。
  - 外側白霧線（$R = 416\text{px}$ / $1.625\text{m}$）：從 $(96, 512)$ 平滑弧線至 $(512, 96)$，與相鄰直道外側白線完美對齊。
  - 中央黃色分道虛線（$R = 256\text{px}$ / $1.0\text{m}$）：從 $(256, 512)$ 平滑弧線至 $(512, 256)$，與相鄰直道中央黃線完美對齊。
  - 內側白霧線（$R = 96\text{px}$ / $0.375\text{m}$）：從 $(416, 512)$ 平滑弧線至 $(512, 416)$，與相鄰直道內側白線完美對齊。
  - 內外兩線道淨寬皆恆為 $160\text{px}$（$0.65\text{m}$），保證車輛未來行駛於樣條曲線軌跡時始終具備勻稱的車道空間。

#### 9.2 畫布材質分區與 3D 立體高架人行道完全覆蓋
- **路面材質分區（消除車道外圍瀝青空缺）**：
  - 底盤改以淺灰人行道混凝土（`#94a3b8`）為背景填充，僅在 $R \in [90, 422]\text{px}$ 的扇形環狀區域內繪製深灰瀝青路面（`#22252a`）。
  - 外側角（$R > 422\text{px}$）與內側角（$R < 90\text{px}$）底層均為混凝土方磚色澤，與上方 3D 人行道無色差縫隙。
- **3D 立體人行道網格補齊**：
  - 原先外側橫向條僅覆蓋至 $X = 0.65\text{m}$，導致東側外角產生 $0.35\text{m}$ 缺口。
  - 重構為：
    1. 西側外條：`addBox(0.35, 2.0, -0.825, 0)`（覆蓋 $X \in [-1.0, -0.65]$）。
    2. 北側外條：`addBox(1.65, 0.35, 0.175, -0.825)`（覆蓋 $X \in [-0.65, 1.0]$，完全延伸至東側邊界）。
    3. 外轉角補齊方塊：`addBox(0.5, 0.5, -0.4, -0.4)`（填滿外角至外弧半徑處，完全消除內陷落差）。
    4. 內轉角方塊：`addBox(0.35, 0.35, 0.825, 0.825)`（平整銜接兩側車道內側人行道）。

---

### 10. 3D 車輛模型工廠、A* 最短路徑尋路引擎、號誌停等交通模擬與開發者測試系統 (`VehicleModelFactory.ts`, `Pathfinding.ts`, `VehicleManager.ts`, `DevMenu.ts`, `RoadNetwork.ts`)

#### 10.1 程式化低多邊形車輛模型 (`VehicleModelFactory.ts`)
- **幾何原型組合架構**：
  - 嚴格依照 Procedural Low-Poly 規範，車身淨寬 $0.44\text{m}$、高 $0.35\text{m}$、長 $0.82\text{m}$，完美契合單車道淨寬 $0.65\text{m}$，兩側留有適度餘裕。
  - 下層底盤/車身主體：$0.44 \times 0.15 \times 0.82\text{m}$ 烤漆金屬材質（`metalness: 0.55, roughness: 0.28`），支援現代調色盤隨機色彩。
  - 上層座艙車頂：$0.38 \times 0.13 \times 0.44\text{m}$，位置微後置營造流線型比例。
  - 車窗與擋風玻璃：前後擋風玻璃以 $0.25\text{rad}$ 前後傾斜，深藍灰反光材質（`metalness: 0.9, roughness: 0.1`）。
  - 車燈總成：車頭雙大燈（$+Z$ 側，溫白發光材質 `emissiveIntensity: 2.5`）；車尾雙煞車燈（$-Z$ 側，晶亮紅光 `emissiveIntensity: 2.5`）。
  - 四輪橡膠輪胎與輪轂：$R=0.08\text{m}$ 黑色橡膠柱體搭配外側銀色輪轂圓盤。
  - 樞紐點（Pivot）定於地面 $y = 0.04\text{m}$，與車道路面無接縫微浮貼合。

#### 10.2 A* 車道有向圖尋路引擎 (`Pathfinding.ts`)
- **圖節點與邊**：
  - 節點為單一有向車道 `DirectedLane`，邊為 `connectedNextLaneIds`。
  - 代價函數 $g(\text{lane})$ 為車道內部路徑點（`waypoints`）折線長度累計。
  - 啟發函數 $h(\text{lane}) = \text{lane.exitPoint.distanceTo(goalLane.exitPoint)}$，保證滿足可採性（Admissible）且一致（Consistent），搜尋速度 $< 1\text{ms}$。
- **路徑點鏈接**：
  - 路徑重建時，依序串接所有經過車道之高解析航點序列，並自動過濾相鄰端點重複點（$\Delta d < 0.02\text{m}$），生成一條連續光滑的三維導航線段。

#### 10.3 車輛動力學與交通號誌停等狀態機 (`VehicleManager.ts`)
- **號誌檢查與自動停等**：
  - 車輛即將駛入路口（`isIntersection: true`）前，根據進入方位查詢路口狀態機（`northSouth` 或 `eastWest`）。
  - 若號誌為 `red` 或 `yellow` 且車輛尚未突破停止線，切換為 `WaitingLight` 狀態並以減速度 $8.0\text{m/s}^2$ 於入口處平滑煞停。
  - 當號誌轉為 `green`，切換為 `Cruising` 狀態，以加速度 $5.0\text{m/s}^2$ 重新啟步加速至目標巡航速限（直道 $8.5\text{m/s}$，轉彎 $5.5\text{m/s}$）。
- **最短圓弧轉向插值**：
  - 航向角 $\theta_{\text{target}} = \text{atan2}(dx, dz)$。
  - 計算角位移差值並正規化至 $[-\pi, \pi]$：
    $$\Delta\theta = (\theta_{\text{target}} - \theta_{\text{current}}) \pmod{2\pi}$$
  - 以角速度係數 $14.0\Delta t$ 進行無突變連續平滑轉向。

#### 10.4 開發者測試工具箱 (`DevMenu.ts`)
- **左上角懸浮選單**：
  - 定位於畫面左上角（`top: 16px; left: 16px;`），暗色毛玻璃半透明質感，支援抽屜式面板伸縮。
- **車輛道路測試互動流程**：
  - 點擊開啟道路選點模式，相機平移暫時釋放防誤觸。
  - 射線檢測車道格位，懸浮即時顯示車道綠/藍高亮標記。
  - 第 1 擊：選定起點，生成綠色發光旗標與地表立體光柱（`🏁 起點`）。
  - 第 2 擊：選定終點，生成紅色發光旗標與地表立體光柱（`🎯 終點`）。
  - 即時繪製 3D 天藍色發光路徑光線，自動生成首輛測試車行駛，亦可手動點擊「🚀 發車實測」多批發車驗證。

---

### 11. 車輛模型尺寸微調與車道行駛中心線幾何精確校正 (`VehicleModelFactory.ts`, `RoadNetwork.ts`)

#### 11.1 3D 車輛模型尺寸比例優化 (`VehicleModelFactory.ts`)
- **需求與參數設定**：
  - 開發者要求車輛尺寸再縮小至原先的 $0.9$ 倍（`*0.9`）。
  - 實施等比縮放：`group.scale.set(0.9, 0.9, 0.9)`。
  - **縮放後實體尺寸**：
    - 主車身寬度：由 $0.44\text{m} \to 0.396\text{m}$。
    - 主車身長度：由 $0.82\text{m} \to 0.738\text{m}$。
    - 全車高度：由 $0.35\text{m} \to 0.315\text{m}$。
  - **車道寬度配合度**：在單向車道淨寬 $0.65\text{m}$ 內，左右兩側安全裕度由各約 $0.105\text{m}$ 擴增為各約 $0.127\text{m}$（約 13 公分），在俯視與斜視角下視覺比例更顯勻稱雅緻。

#### 11.2 車道行駛中心線幾何精確推導 (`RoadNetwork.ts`)
- **偏位幾何分析**：
  - 單一格位寬度為 $2.0\text{m}$，對應座標範圍 $[-1.0, 1.0]$。
  - 兩側 3D 立體高架人行道各佔寬度 $0.35\text{m}$，故瀝青路面實際淨寬為 $2.0 - 2 \times 0.35 = 1.3\text{m}$，對應座標範圍 $[-0.65, 0.65]$。
  - 中央黃色分道線位於 $X = 0$（東西向為 $Z = 0$）。
  - 各方向之車道範圍：
    - 北向/東向行車道：$[0, 0.65]$。
    - 南向/西向行車道：$[-0.65, 0]$。
  - 車道之嚴格中心線（黃色分道線與路面邊緣白線正中央）：
    $$\text{LANE\_OFFSET} = \frac{0 + 0.65}{2} = 0.325\text{m}$$
- **重構更新範圍**：
  - 原先車道圖採用 `LANE_OFFSET = 0.5`，導致車輛與導航光路明顯靠向右側路邊與人行道路緣。
  - 全面將 `RoadNetwork.ts` 中 `LANE_OFFSET` 修改為 `0.325`：
    1. **直道 (Straight / DeadEnd)**：
       - 南向車道：$X = -0.325$。
       - 北向車道：$X = +0.325$。
       - 東向車道：$Z = +0.325$。
       - 西向車道：$Z = -0.325$。
    2. **彎道 (Corner)**：
       - 4 種旋轉方位下所有左右轉 Bézier 曲線之取樣起點、控制點與終點均以 $\pm 0.325$ 計算，曲率平滑連續。
    3. **路口 (ThreeWay / FourWay)**：
       - 入口端點（Inbound）與出口端點（Outbound）均校正為 $\pm 0.325$。
    4. **縫合門檻**：跨格位車道出口至入口距離門檻維繫在 $< 0.08\text{m}$，所有同向與轉彎車道自動緊密相連。

---

### 12. 本地開發進程管理與代碼編譯驗證工作流規範

#### 12.1 常駐開發伺服器 vs. 單次編譯檢核之本質差異
- **問題現象**：
  - 在執行測試時呼叫 `npm.cmd run dev`，出現 `Port 3000 is in use, trying another one...` 且指令永不退出。
- **根本原因 (Root Cause)**：
  1. **常駐行程特性**：`npm run dev` 啟動的是 Vite 開發 Web 伺服器，底層為無限事件迴圈（Event Loop），負責監聽客戶端 HTTP 請求與監聽檔案變更以進行熱模組替換（HMR）。它屬於持續性進程，**設計上絕不會自行結束**。
  2. **重複啟動與端口佔用**：開發者外部終端已常駐執行 Vite 伺服器（PID 12384）監聽 `[::1]:3000`，代理端若再次啟動 `dev`，Vite 會偵測到 3000 端口佔用而被迫遞增轉向 3001 端口，且持續等待連線，導致工具持續掛起。

#### 12.2 檢驗指令嚴格規範
- **代碼驗證唯一標準**：
  - 驗證代碼語法、型別安全性與打包完整性，**一律使用單次自動退出指令**：
    ```bash
    npm.cmd run build
    # 底層執行: tsc && vite build
    ```
  - **優點**：
    - 完整經過 TypeScript 編譯器型別檢查與 Rollup/Vite 生產模式打包。
    - 執行約 1 秒後立即輸出構建結果並正常退出（Exit Code 0）。
    - 絕不佔用任何網路端口、絕不產生背景常駐行程。
- **本地伺服器處理準則**：
  - 尊重並保留開發者已在 3000 端口啟動的 Vite 伺服器。
  - 代理端禁止私自重啟或呼叫常駐 `npm run dev`，依靠開發者已運行的 Vite 實例配合 Vite HMR 即時反映代碼變更。

---

### 13. 車輛紅綠燈停等判斷機制與前瞻停止線物理安全制動演算法 (`Pathfinding.ts`, `VehicleManager.ts`)

#### 13.1 原號誌停等失靈之根本原因分析
1. **煞車動態與感應距離矛盾**：
   - 巡航速度 $v = 8.5\text{m/s}$（約 $30\text{km/h}$），減速度 $a = 7.0\sim 8.0\text{m/s}^2$。
   - 根據運動學公式 $d_{\text{stop}} = \frac{v^2}{2a}$，車輛由全速至靜止所需最小制動距離為：
     $$d = \frac{8.5^2}{2 \times 7.5} \approx 4.8\text{m}$$
   - 原代碼感應距離僅設為 $0.95\text{m}$，車輛進入感應區時根本無法在剩餘距離內剎停。
2. **反向邏輯阻斷煞車**：
   - 原代碼在距離入口 $< 0.25\text{m}$ 時強制設定 `hasEnteredIntersection = true`，隨後將其視為「已進入路口核心」而直接跳過紅燈檢查，導致車輛在減速未完時反被判定放行，加速闖過紅燈。
3. **車道索引判定脫鉤**：
   - 依賴航點座標推估 `currentLaneIndex`，在曲線取樣與縫合時容易出現步長跳躍或未能及時捕捉路口車道。

#### 13.2 結構化航點與停止線標記 (`Pathfinding.ts`)
- 定義 `RouteWaypoint` 結構：
  ```typescript
  export interface RouteWaypoint {
    position: THREE.Vector3;
    laneId: string;
    isIntersection: boolean;
    intersectionKey?: string;
    controllingSignal?: 'northSouth' | 'eastWest';
    isStopLine: boolean;
  }
  ```
- 在 `reconstructPath()` 構建路徑時：
  - 若車道為路口車道（`isIntersection: true`），其第一個航點（`j === 0`）標記為 `isStopLine = true`。
  - 若與前一條車道相鄰接縫重複（$\Delta d \le 0.02\text{m}$），則將 `isStopLine` 繼承賦予接縫端點。

#### 13.3 前瞻停止線安全制動演算法 (`VehicleManager.ts`)
- **動態前瞻掃描**：
  - 每幀自當前前進航點 `currentWaypointIndex` 往後掃描，尋找前方第一道 `isStopLine` 航點。
  - 計算沿著路徑折線到達該停止線之精準累積距離 `distToStopLine`。
- **物理減速與防越線封鎖**：
  - 定義停等安全緩衝間距 $\text{STOP\_BUFFER} = 0.25\text{m}$（停在停止線與斑馬線前）。
  - 若遭遇紅燈或黃燈：
    1. **完全煞停區**（$d \le \text{STOP\_BUFFER} + 0.05$）：`v.speed = 0`，`v.state = 'WaitingLight'`。
    2. **安全減速區**（$d \le 6.0\text{m}$）：依理想制動速度 $v_{\text{desired}} = \sqrt{2 \times a_{\text{decel}} \times (d - \text{STOP\_BUFFER})}$ 線性降速。
    3. **位移硬限制**：
       $$\text{remainingMove} = \min(\text{remainingMove}, \max(0, distToStopLine - \text{STOP\_BUFFER}))$$
       從數學上絕對封死闖紅燈越線之可能。
- **綠燈放行與清空路口**：
  - 號誌切換為 `green` 後，`isRedOrYellow` 變為 `false`，位移限制自動解除。
  - 車輛以加速度 $4.5\text{m/s}^2$ 平滑起步，穿越停止線；通過停止線後該停止線落入歷史航點，車輛暢行通過路口核心區，杜絕路口中央受困現象。

---

### 14. 路側土地分區小格子動態生成與住宅區塗抹劃分系統 (`ZoningManager.ts`, `BuildMenu.ts`)

#### 14.1 路側專屬小格子生成幾何模型 (Roadside Procedural Zoning Grid)
- **概念與尺寸規範**：
  - 嚴格遵守「非地圖原生 2m 網格，而是依附於道路兩側額外動態生成」之原則。
  - 單一小格子尺寸定為 $1.0\text{m} \times 1.0\text{m}$，剛好為 2m 道路單元寬度之一半，縱深設定為 4 層（$\text{ZONING\_DEPTH} = 4$，即向外延伸 $4.0\text{m}$，完美契合 Cities: Skylines 比例）。
- **四向垂直投影與去重演算法**：
  - 遍歷全路網各 `RoadTile` $(gx, gz)$：
    - 檢測該道路單元北（$-Z$）、南（$+Z$）、東（$+X$）、西（$-X$）四大開口鄰接狀態。
    - 若該側無相鄰道路，以步長 $1.0\text{m}$ 向該法向量方向外推 4 層。
    - 每一層沿著路側邊長切分為 2 個 $1.0\text{m}$ 小格（例如東西向道路外推時，沿 $X$ 軸拆分為 $\lfloor gx - 0.5 \rfloor$ 與 $\lfloor gx + 0.5 \rfloor$）。
- **道路避讓與空間互斥**：
  - 每個候選小格子 $(zx, zz)$ 中心為 $(zx + 0.5, zz + 0.5)$。
  - 碰撞篩選條件：若 $|cx - t.gx| < 0.98$ 且 $|cz - t.gz| < 0.98$（代表位於任何既有道路邊界內），立即剔除，保證小格子絕不跨越或覆蓋道路。
  - 跨路塊共用格位以 `Map<"zx,zz", ZoningCell>` 自動空間雜湊去重。

#### 14.2 3D 輕量化視覺呈現架構
- **分區網格線 (Grid Lines)**：
  - 提取所有有效小格子之 4 條邊線，標準化為小座標在前之端點鍵值 `${x1},${z1}_${x2},${z2}` 並透過 `Set` 消除相鄰格位的共用邊線。
  - 建立單一 `THREE.LineSegments` 物件，材質為水藍色微半透明亮線（`#38bdf8`, `opacity: 0.42`），高度設在 $Y = 0.024\text{m}$。
  - 僅在開啟土地劃分工具時顯現，平時隱藏以維持純淨城市景觀。
- **住宅區綠色色塊 (Residential Fill)**：
  - 格位被指派為 `Residential` 時，生成 $0.92\text{m} \times 0.92\text{m}$ 翠綠色微半透明標準平面網格（`#22c55e`, `opacity: 0.72`），預留 $0.08\text{m}$ 空隙營造清晰獨立地塊質感。
  - 設置 `polygonOffset`（factor: -1, units: -1），杜絕與地面發生 Z-Fighting。
  - 道路拓撲改變或增建時，透過歷史狀態表保留玩家已劃分之分區類別。

#### 14.3 UI 布局與互動狀態機
- **底部雙按鈕布局**：
  - 最左側：土地劃分功能按鈕（四格網格圖標，點擊切換綠色發光狀態）。
  - 右側：道路建造分類按鈕（道路圖標）。
- **子選單與互動回饋**：
  - 劃分子選單提供「低密度住宅區（預設）」與「清除分區」雙卡片。
  - 支援滑鼠左鍵單擊、連續拖曳塗抹劃分，以及右鍵快速塗抹清除。
  - 啟動劃分工具時，自動透過 `cameraManager.setLeftDragEnabled(false)` 鎖定 RTS 相機左鍵平移，避免視角位移干擾塗抹。

#### 14.4 分區地塊色彩動態顯示控制規範
- **可見性生命週期**：
  - `ZoningManager` 中 `fillGroup` 與 `gridLinesMesh` 兩大視覺節點與工具啟用旗標 `isToolActive` 緊密連動。
  - `setToolActive(false)` 時：
    - `this.gridLinesMesh.visible = false`
    - `this.fillGroup.visible = false`
    - `this.hoverBrushMesh.visible = false`
    - 地表綠色分區填充與網格線全數隱藏，世界視野保持純粹自然景觀。
  - `setToolActive(true)` 時：
    - 同步恢復 `this.gridLinesMesh.visible = true` 與 `this.fillGroup.visible = true`。
    - 玩家已規劃好的住宅區色塊與相應網格立即亮起，支援無縫繼續劃分。

---

### 16. 住宅生成演算法、地圖邊界聯外道路拓撲與市民遷入行車調度

#### 16.1 臨路貼合落位驗證幾何 (Road-Adjacency Spatial Verification)
- **正面嚴格貼路約束**：
  - 給定住宅模型之面寬 $W$ 與縱深 $D$，在 4 種可能方位（'N', 'S', 'E', 'W'）中：
    - 正面邊線（長度 $W$ 公尺，即 $W$ 個 $1\text{m}$ 小格子）上的**每一個格位**，其外緣法線方向必須與現存的 2m 車道路塊相交（`isRoadAdjacent` 為 true）。
    - 內部佔地 $W \times D$ 格子集合必須全部屬於已指派的 `Residential` 分區，且未被任何既有建築佔用（`occupiedCells` 互斥鎖定）。
  - 若縱深內側（如 Layer 3、Layer 4）存在可用空間但其正面無法直接貼合馬路，則空間檢驗直接剔除，杜絕無臨路建築。

#### 16.2 合法模型動態檢索與隨機起建策略
- 遍歷所有空閒臨路端點，依可用空間收集所有相容的模型列表（`matchingModels = catalog.filter(...)`）。
- 依需求規範，自合格候選清單中以等機率隨機挑選 1 款房屋模型實例化（`chosenModel = matchingModels[Math.floor(Math.random() * length)]`）。
- 啟動建造後立即將所佔 $W \times D$ 格位加入 `occupiedCells` 雜湊表，並扣除相應住房需求。

#### 16.3 施工鷹架與建造動畫
- 建築處於 `constructing` 狀態時（預設耗時 6 秒）：
  - 佔地四周動態生成金屬鷹架立柱、上下雙層水平橫桿與頂端閃爍警示信號球。
  - 房屋實體依建造進度 $\text{prog} \in [0, 1]$ 自地底垂直升起，高度與 $Y$ 軸縮放平滑線性插值。
  - 完工後自動移除鷹架群組，復原全尺寸並切換狀態至 `completed`。

#### 16.4 地圖邊界聯外道路接點與遷入車輛路徑規劃
- **邊界聯外公路 (External Highway Connection)**：
  - 於地圖南側邊界（$X=0, Z=100$ 至 $Z=94$）建立永久聯外雙向公路，並於 $Z=100$ 跨立 3D 高速公路綠色門架告示牌。
  - 註冊邊界北向車道 `lane_0_100_N` 為全地圖的市民進城起點（`externalSpawnLane`）。
- **市民遷入行車邏輯**：
  - 建築完工時觸發遷入事件，以 A* 搜尋由邊界起點至房屋正門前方車道的行車路徑。
  - 若已連通，調度 `spawnMovingInVehicle` 生成私家車，沿途遵守紅綠燈與速度物理學，抵達正門前即刻消失並轉化為現房內人數。
  - 若玩家尚未將道路連通至邊界，建築標記為 `waitingForRoad`，待道路連通後自動啟動發車。

#### 16.5 房內人數與合居模式
- 市民隨機決定居住偏好：
  - 獨立自住：登記人數固定 1 人。
  - 與人合居：登記人數隨機決定於 2 至該房屋最大容量（$2 \sim \text{capacity}$）之間。
- 滑鼠懸停於建築時，浮動 Tooltip 即時顯示建造進度條、登記居住人數、當前房內人數、合居模式與朝向資訊。


#### 15.1 幾何維度與道路面寬 (Frontage) / 縱深 (Depth) 定義
- **座標軸標準約定**：
  - **$X$ 軸**：面寬（Frontage Width），平行於道路走向。
  - **$Z$ 軸**：縱深（Lot Depth），垂直於道路走向。
  - **$+Z$ 方向**：統一為建築「正面（Front Face）」，即正門、前庭步道、玄關廊柱所朝向的方向（亦即未來落位時面朝馬路之方向）。
  - **$-Z$ 方向**：建築「後方（Backyard）」。
- **2x3 與 3x2 空間本質區隔**：
  - `Residential_2x3`：面寬 2m（沿路）、縱深 3m（入深）。建築主體呈細長縱深英式長排屋，屋頂為前後通長人字脊，後方留出 1m 縱深的私家庭院與景觀樹。
  - `Residential_3x2`：面寬 3m（沿路）、縱深 2m（入深）。建築主體呈橫向開展美式平房（Bungalow），屋頂為左右橫貫人字脊，正面配置大跨度雙廊柱挑高遮陽門廊與左右雙開對稱採光橫窗。
  - 兩者在面寬與縱深比例、外觀形制、門廊構造與屋頂脊線走向截然不同，具備不可互換之空間結構特質。

#### 15.2 5 款低密度住宅架構與美學設計細節
1. **`Residential_2x2`（容量：2 人）**：
   - 地基：$2.0\text{m} \times 2.0\text{m}$，前庭石板走道，雙側灌木花圃。
   - 主體：米白純淨水泥外牆（$1.4\text{m} \times 1.1\text{m} \times 1.3\text{m}$），深石板瓦經典雙斜屋頂。
   - 細節：深胡桃木門、金屬黃銅圓把手、木質遮雨門棚、側採光窗、偏置紅磚煙囪。
2. **`Residential_2x3`（容量：2 人）**：
   - 地基：$2.0\text{m} \times 3.0\text{m}$，前庭石板走道與側矮灌木。
   - 主體：現代灰泥牆身（$1.35\text{m} \times 1.25\text{m} \times 2.0\text{m}$），經典紅磚瓦長條斜屋頂。
   - 細節：正面偏左大門、大面積前採光窗、閣樓圓形老虎窗、長向雙側窗、後院獨立綠意景觀樹。
3. **`Residential_3x2`（容量：2 人）**：
   - 地基：$3.0\text{m} \times 2.0\text{m}$，寬前庭雙向綠化花圃。
   - 主體：暖木質感橫紋外飾板（$2.3\text{m} \times 1.15\text{m} \times 1.3\text{m}$），橫向深海軍藍金屬雙斜屋頂。
   - 細節：中央挑高前門廊、白色雙圓柱支撐、左右雙大採光橫窗、右側紅磚煙囪。
4. **`Residential_3x3`（容量：3 人）**：
   - 地基：$3.0\text{m} \times 3.0\text{m}$，前庭車道磚石鋪面與右前方景觀樹。
   - 主體：雙層層次架構，一樓米白主體（$2.3\text{m} \times 1.1\text{m} \times 2.1\text{m}$），二樓退縮暖木樓層（$1.7\text{m} \times 0.95\text{m} \times 1.8\text{m}$）。
   - 細節：一樓深灰金屬單車位獨立車庫捲門、主玄關門、客廳窗；二樓主臥大景觀窗；深石板人字屋頂與雙層煙囪。
5. **`Residential_4x4`（容量：4 人）**：
   - 地基：$4.0\text{m} \times 4.0\text{m}$，前庭雙車位大車道、右側大景觀樹、後院景觀樹與綠籬。
   - 主體：豪華兩層氣派莊園大宅邸，一樓氣派基座（$3.2\text{m} \times 1.25\text{m} \times 2.8\text{m}$），二樓中央主樓（$2.4\text{m} \times 1.1\text{m} \times 2.2\text{m}$）。
   - 細節：一樓左側雙車位大車庫、中央挑高宏偉柱廊（雙圓柱 + 三角山形飾簷）、雙開厚重正門、右翼八角凸窗（Bay Window）；二樓雙對稱窗；複合式十字雙斜屋頂（紅磚瓦主脊 + 車庫副斜頂）、雙煙囪。

#### 15.3 開發者選單（DevMenu）重構與 3D 模型檢視展台機制
- **純圖標按鈕設計**：
  - 開發者選單觸發按鈕徹底移除所有中文，改為純工具圖標 `🛠️`，長寬定為 $38\text{px} \times 38\text{px}$ 懸浮圓角玻璃態按鈕，置於畫面左上角（`top: 14px; left: 14px;`）。
- **雙子分頁導航架構**：
  - `activeTab` 狀態機維護 `traffic`（🚗 車輛道路測試）與 `modelViewer`（🏛️ 檢視模型）。
  - 分頁切換時，自動釋放另一側之 3D 視覺物件、射線事件與相機拖曳鎖定狀態，保證操作互不干擾。
- **3D 模型展台（Turntable Showroom）**：
  - 展台基座：半徑 $3.0\text{m}$、高 $0.06\text{m}$ 之深石板灰圓形地台，周邊鑲嵌自發光青色霓虹 LED 燈環（`#00f5ff`，`emissiveIntensity: 0.6`）。
  - 正面指引：地台正面 $+Z$ 軸處配置翠綠色發光箭頭與平面標籤「正面 (朝向馬路)」，直觀標示模型的道路朝向。
  - 自動旋轉驅動：`DevMenu.update(deltaTime)` 於主循環中持續以 $0.5\text{ rad/s}$ 驅動模型平滑 360° 自轉；提供開關按鈕與「正面視角歸位」按鈕。
  - 規格卡片：依選取的模型（車輛或 5 款住宅），即時輸出佔地維度（面寬 × 縱深）、居住人口（Capacity）、正面朝向說明與獨特建築特徵清單。

#### 15.4 三角人字雙斜屋頂 (Gable Roof) 原生幾何構造演算法
- **倒三角畸形問題根因**：
  - 原先採用 `THREE.CylinderGeometry(0, R, d, 3, 1)` 嘗試以圓柱模擬三稜柱，因 `radiusTop = 0` 實為四面錐體，配合多重歐拉角旋轉與縮放後，頂點在局部座標中尖端朝向負 $Y$ 軸下垂，且橫向收縮為錐尖，產生視覺上「倒三角形倒插」之嚴重幾何畸形。
- **純淨三角稜柱演算法（Unindexed BufferGeometry）**：
  - 給定面寬 $w$、脊高 $h$、進深 $d$，以屋頂中心為原點 $(0, 0, 0)$，定義 6 個基本頂點：
    - 屋脊頂線 (Apex)：$RF = (0, \frac{h}{2}, \frac{d}{2})$、$RB = (0, \frac{h}{2}, -\frac{d}{2})$
    - 屋簷四底角 (Eaves)：$BLF = (-\frac{w}{2}, -\frac{h}{2}, \frac{d}{2})$、$BRF = (\frac{w}{2}, -\frac{h}{2}, \frac{d}{2})$、$BLB = (-\frac{w}{2}, -\frac{h}{2}, -\frac{d}{2})$、$BRB = (\frac{w}{2}, -\frac{h}{2}, -\frac{d}{2})$
  - 拆分為 8 個三角形（共 24 頂點），無縫覆蓋前山牆三角、後山牆三角、左右斜屋頂各 2 三角與底面封板 2 三角。
  - 獨立頂點無縫隔離各面法向量，藉由 `computeVertexNormals()` 獲得稜線分明、反光平整真實之建築坡屋頂效果。

---

### 17. 邊界橫貫公路拓撲、雙向過境車流模擬與連通道路配對驗證

#### 17.1 邊界橫貫外部公路拓撲 (Border Highway Corridor)
- **公路走廊配置**：
  - 橫跨地圖南側邊界 $Z = 96\text{m}$，自西界 $X = -100\text{m}$ 貫通至東界 $X = +100\text{m}$，共計 101 個 $2\text{m} \times 2\text{m}$ 東西向標準道路單元。
  - 包含兩條平行車道：東向車道（`lane_-100_96_E` 至 `lane_100_96_E`）與西向車道（`lane_100_96_W` 至 `lane_-100_96_W`），車道中心偏移距 $\text{LANE\_OFFSET} = 0.325\text{m}$。
  - 於西端 $(-100, 96)$ 與東端 $(100, 96)$ 各跨立一座 3D 高速公路鋼結構門架（包含雙柱、橫樑與綠色發光告示牌）。
- **市區道路接入機制**：
  - 當玩家自市區向南拉出道路接上 $Z = 96\text{m}$ 時，`RoadNetwork` 自動於交匯處生成 T 字路口（ThreeWay）並配置紅綠燈號誌燈柱，無縫提供左右轉與直通車道。

#### 17.2 雙向過境車流模擬 (Ambient Through-Traffic)
- `VehicleManager` 每隔 $3.5$ 秒隨機抽取方位：
  - 50% 機率由西向東行駛：起點 `lane_-100_96_E`，終點 `lane_100_96_E`。
  - 50% 機率由東向西行駛：起點 `lane_100_96_W`，終點 `lane_-100_96_W`。
- 車輛依據 $10 \sim 13\text{ m/s}$ 公路速限巡航，駛達對側邊界後自動銷毀（`disappearImmediately: true`），營造活絡的邊境公路交通景觀。

#### 17.3 住房需求多規格配對與連通道路硬性約束
- **人數排除機制 (Capacity Requirement)**：
  - 針對 1 人、2 人、3 人需求，房型庫嚴格過濾：$\text{meta.capacity} \ge \text{peopleCount}$。
  - 請求 3 人需求時，強制排除 2x2, 2x3, 3x2 等容量不足模型，僅允許 3x3 與 4x4 進入隨機挑選池。
- **連通道路硬性約束 (Highway Accessibility Check)**：
  - 候選地塊不僅必須正面緊貼道路，更透過 A* 演算法檢驗：自外部公路西側進口或東側進口是否存在可通達該住宅正門車道之連通路線（`hasPathFromHighway`）。
  - 若城市道路尚未與外部公路相連，或無符合人數容量之地塊，配對宣告失敗並立即流失該筆需求，即時顯示流失原因。
- **施工先行與遷入行車 (Construction First, Drive-In Later)**：
  - 配對成功後進入建造階段（耗時 6 秒），動態展現鷹架與升高動畫。
  - 完工後自動比對東西兩端進口之最短路徑，市民驅車由邊界公路駛入市區，抵達家門前消失並轉化為現房內人數。

---

### 18. 道路網格奇偶相位對齊與拓撲自動編織機制

#### 18.1 網格奇偶相位衝突（Grid Parity Conflict）根因分析
- **世界座標與單元格中心關係**：
  - 地圖建設區為 $200\text{m} \times 200\text{m}$，網格邊線間距為 $2\text{m}$（線條位於 $\dots, -4, -2, 0, 2, 4, \dots$ 等偶數整數座標）。
  - 格位內部空間範圍為 $[2k, 2k+2]$，其幾何幾何中心點為：
    $$\text{center} = \lfloor \frac{\text{coord}}{2} \rfloor \times 2 + 1$$
  - 因此，所有合法的單元格中心座標（$gx, gz$）**必定為奇數**（$\dots, -3, -1, 1, 3, 5, \dots$）。
- **原先之衝突與斷網成因**：
  - 初始實作中，外部邊界公路被設定在 $Z = 96$（偶數），且 $X$ 步進自 $-100$ 至 $+100$（偶數）。
  - 玩家由市區向南拉出的道路單元中心為奇數（例如 $gx = 1, gz = 95$），其相鄰四向探測為 $(gx, gz \pm 2)$ 與 $(gx \pm 2, gz)$，永遠只能探測到奇數座標。
  - 兩套道路網格在空間上存在 $1\text{m}$ 的錯位，導致：
    1. 拓撲鄰居清單中互無彼此，`degree` 無法提升，無法觸發路口分類（無法轉變為 `ThreeWay` T 字路口）。
    2. 車道出入口（`exitPoint` 與 `entryPoint`）在空間上的歐氏距離大於 $1\text{m}$，遠超閾值 $0.08\text{m}$，車道自動縫合（Stitching）機制完全無法生效。
    3. 市民車輛尋路（A*）無法從外部公路跨入市區自建道路。

#### 18.2 全域相位對齊修復方案
1. **外部公路走廊相位歸一化**：
   - 公路中心線定位於 $gz = 97$（對應 $Z \in [96, 98]$，緊鄰邊界內側）。
   - 水平步進設定為：$gx \in \{-99, -97, -95, \dots, 97, 99\}$（步長 $2$），共 100 格，無縫填滿 $X \in [-100, 100]$。
   - 進出口車道 ID 更新為 `lane_-99_97_E`、`lane_99_97_W`、`lane_-99_97_W`、`lane_99_97_E`。
2. **拓撲相交與車道編織無縫接軌**：
   - 當玩家將道路拖曳至 $gz = 95$（或覆蓋至 $gz = 97$）時，`RoadNetwork.rebuildTopologyAround` 即刻將公路對應單元（例如 $(1, 97)$）與市區單元 $(1, 95)$ 納入受影響集合。
   - 公路單元 $(1, 97)$ 之連接鄰居即刻包含北側市區道路 $(1, 95)$、西側公路 $(-1, 97)$ 與東側公路 $(3, 97)$，連接度達 3，自動切換為 `ThreeWay`（T 字路口）：
     - 幾何與材質更換為 T 字路口與斑馬線。
     - 自動生成轉向車道（西轉北 `lane_1_97_W_to_N`、東轉北 `lane_1_97_E_to_N`、北轉西 `lane_1_97_N_to_W`、北轉東 `lane_1_97_N_to_E`）及過境直行車道。
     - 自動配置紅綠燈號誌控制器。
   - 跨格位車道出入口距離縮小至 $0.00\text{m}$，完美觸發縫合，自外部公路至市區住宅全線暢通！
3. **建築落位臨路計算一致性**：
   - `BuildingManager.ts` 中 `isRoadAdjacent` 與 `calculateFrontRoadPoint` 全面改用 $\lfloor \frac{\text{val}}{2} \rfloor \times 2 + 1$，解決原先 `Math.round(val / 2) * 2` 產生的偶數誤判問題。

---

### 19. 建築落位幾何中心嚴格映射與多車道可達性派遣機制

#### 19.1 建築落位幾何中心（WorldCenter）數學推導
- **背景問題**：
  - 土地劃分單元為 $1\text{m} \times 1\text{m}$ 整數網格（索引 $x, z \in \mathbb{Z}$），其世界座標覆蓋範圍為 $[x, x + 1] \times [z, z + 1]$。
  - 當建築模型佔用 $W \times D$ 格位時，因朝向不同，基底原點（$originZx, originZz$）與佔地邊界之關係各異。
- **四向幾何中心推導**：
  1. **`facing = 'S'`（正面朝南 $+Z$，道路在南側）**：
     - $X \in [originZx, originZx + W] \implies cx = originZx + \frac{W}{2}$
     - $Z \in [originZz - D + 1, originZz + 1] \implies cz = \frac{(originZz - D + 1) + (originZz + 1)}{2} = originZz - \frac{D}{2} + 1.0$
  2. **`facing = 'N'`（正面朝北 $-Z$，道路在北側）**：
     - $X \in [originZx, originZx + W] \implies cx = originZx + \frac{W}{2}$
     - $Z \in [originZz, originZz + D] \implies cz = \frac{originZz + (originZz + D)}{2} = originZz + \frac{D}{2}$
  3. **`facing = 'E'`（正面朝東 $+X$，道路在東側）**：
     - $Z \in [originZz, originZz + W] \implies cz = originZz + \frac{W}{2}$
     - $X \in [originZx - D + 1, originZx + 1] \implies cx = \frac{(originZx - D + 1) + (originZx + 1)}{2} = originZx - \frac{D}{2} + 1.0$
  4. **`facing = 'W'`（正面朝西 $-X$，道路在西側）**：
     - $Z \in [originZz, originZz + W] \implies cz = originZz + \frac{W}{2}$
     - $X \in [originZx, originZx + D] \implies cx = \frac{originZx + (originZx + D)}{2} = originZx + \frac{D}{2}$
- **修正效果**：徹底消除了四向 $0.5\text{m}$ 的系統位移偏差，建築草皮邊緣與道路人行道路緣石 $100\%$ 無縫貼齊。

#### 19.2 市民車輛多車道可達性派遣（Multi-Lane Reachability Dispatch）
- **單向死鎖根因**：
  - 道路為雙向雙線道。南北向道路西側房屋離南向車道（`lane_S`，北往南）更近；東側房屋離北向車道（`lane_N`，南往北）更近。
  - 原先僅以距離挑選單一車道，導致西側房屋永遠選定 `lane_S`，而自南界公路進城之車流只能北行，無法直達 `lane_S`，引發虛假的「等待聯外道路」。
- **多車道候選機制**：
  - `dispatchCitizenVehicle` 遍歷門前道路單元的所有車道（`roadTile.lanes`），針對每條車道獨立執行 A* 最短路徑搜尋。
  - 於所有具備可達路徑的車道中，挑選與大門最近之有效路線派遣車輛；車輛開至該路塊前方車道即行抵達並完成遷入。

#### 19.3 路網盡頭（DeadEnd）掉頭車道拓撲
- 在 `RoadNetwork.ts` 中，針對任何無後續鄰居之路網盡頭單元：
  - 南北向末端自動生成半徑 $0.325\text{m}$ 之 180° 弧線 U-Turn 車道（`exitN` 轉入 `entryS` 或 `exitS` 轉入 `entryN`）。
  - 東西向末端自動生成對應之 180° U-Turn 車道。
  - 確保車輛於全城任意斷頭路皆具備掉頭回折能力。














