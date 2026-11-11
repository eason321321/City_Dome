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
  - **中央行車分向限制線**：標準鮮亮雙黃實線（`#f59e0b`，線寬 $8\text{px}$，中心軸分別位於 $X = 247\text{px}$ 與 $X = 265\text{px}$，瀝青間隔 $10\text{px}$）：
    - 嚴格落實交通工程規範「路段禁止迴轉與超車（路口除外）」。
    - 雙黃線總寬度約 $26\text{px}$（對應世界座標約 $0.10\text{m}$），在 $2.0\text{m}$ 雙向道路上比例協調，遠距離視角清晰銳利不糊成一團。
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

---

### 二十、完善住房需求與入住配對管線（Housing Demand & Matching Pipeline）

#### 20.1 需求結構與產生管線（HousingDemand）
- **需求實體設計**：
  ```typescript
  export interface HousingDemand {
    id: string;                         // 唯一需求序號 dem_N
    peopleCount: number;                 // 入住人數 1 - 5 人
    moveInType: 'joinExisting' | 'buildNew'; // 併入別人 (合居) vs 建立新房屋
    density: 'Low';                     // 目前為低密度 (Low)
    preferredModels: string[];          // 2 個隨機挑選之偏好房型 ID
    status: 'pending' | 'matched' | 'lost'; // 配對狀態
    createdAt: number;
    matchedBuildingId?: string;
    matchedBuildingName?: string;
    matchedType?: 'joinExisting' | 'buildNew';
    failReason?: string;
  }
  ```
- **佇列管理**：`demandQueue` 採置頂插入（`unshift`），使開發者介面能隨時以「最新在最上方」查看歷史與當前每一筆需求的流轉歷程。

#### 20.2 「併入別人 (合居)」配對機制
1. **候選房屋條件過濾**：
   - 房屋狀態必須為已完工（`status === 'completed'`，建造中房屋不可作為候選）。
   - 住宅密度相符（`category === 'Residential_Low'`）。
   - 房型必須包含在該需求的 2 個偏好房型中（`preferredModels.includes(modelId)`）。
   - 剩餘容量足夠：$capacity - registeredResidents \ge peopleCount$。
2. **隨機洗牌與 50% 意願投擲**：
   - 候選陣列執行 Fisher-Yates 隨機洗牌。
   - 依序對候選房屋進行 `Math.random() < 0.5` 檢驗。
   - 首個通過 50% 投擲之房屋即配對成功；若全數候選皆未通過則判定媒合失敗，需求直接流失（`status = 'lost'`）。
3. **遷入流程**：
   - `b.registeredResidents += peopleCount`，標記 `isCoLiving = true`。
   - 立即調度市民車輛自公路邊界出發，抵達大門前消失時 `b.currentOccupants += peopleCount`，全城總人口正式更新。

#### 20.3 「建立新房屋」配對與選地機制
1. **模型容量前置過濾**：
   - 檢驗 2 個偏好房型之最大容量是否 $\ge peopleCount$。若偏好房型之容量皆無法容納（例如 5 人需求但低密度房型上限為 4 人），直接配對失敗流失。
2. **偏好房型順序檢查**：
   - 將合格之偏好房型隨機洗牌，先檢查第 1 個偏好房型是否存在合法建地；
   - 若第 1 個偏好房型無地塊可建，則轉向檢查第 2 個偏好房型；
   - 若兩者皆無合適建地，則配對失敗流失。
3. **候選建地嚴格檢驗（`findSiteForModel`）**：
   - 分區符合：`zoneType === 'Residential'`。
   - 空間放得下且正面緊貼馬路（`canFitModelAt`）。
   - 未被佔用或預留：所有佔用格子皆非 `occupiedCells`。
   - 已連通外部公路（`hasPathFromHighway(roadKey)`）。
   - **消除重複檢查**：因建地搜尋時已嚴格確保道路連通外部公路，後續步驟無須再行多餘的連通二次驗證。
4. **遷入流程**：
   - 起建房屋並鎖定佔用地塊（`occupiedCells`），進入 6 秒施工動畫（鷹架、黃色旋轉警示燈、本體地底升起）。
   - 建造完工時（100%），拆除鷹架並觸發 `dispatchCitizenVehicle`。
   - 市民車輛自公路開抵家門前消失時，`building.currentOccupants += registeredResidents`，人口正式增加。

---

### 二十一、施工吊臂作業與遊戲時間解耦架構（Tower Crane & Game Simulation Time）

#### 21.1 遊戲時間解耦與加速支援（Simulation Delta）
- **背景原則**：建築施工時間、吊臂作業動畫、交通號誌、車輛行駛與燈光閃爍等遊戲內實體行為，嚴禁直接綁定現實時間戳（`Date.now()`）。
- **架構改進**：
  - `TimeManager.ts`：引進 `timeScale`（速度倍率，預設 1.0x），並提供 `getSimulationDelta(realDelta)`：
    $$\text{simDelta} = \begin{cases} 0 & \text{若處於暫停狀態或 } realDelta \le 0 \\ realDelta \times \text{timeScale} & \text{正常推進或加速} \end{cases}$$
  - `main.ts`：以 `simDelta` 統一分發至各子系統管理器，實現遊戲暫停時建造與動畫即刻定格，以及未來點擊 2x、3x 加速時施工進度與吊臂作業同步等比加速。
- **建造時間調整**：
  - `constructionDuration` 自原先的 $6.0\text{s}$ 調升為 3 倍，即 $18.0\text{s}$（遊戲秒數）。

#### 21.2 施工塔式起重吊臂（Tower Crane）幾何結構推導
- **坐標系佈局**：
  - 基底位置選取地塊後方內緣：$x = \frac{W}{2} - 0.28, z = -\frac{D}{2} + 0.28$，完全收納於建築地基邊界內，不干擾前門步道與道路邊界。
  - 塔身高度：$H_{\text{mast}} = \max(2.7, 1.9 + \max(W, D) \times 0.32)$，確保作業臂高聳於建築屋頂與施工鷹架之上。
- **結構組成**：
  1. **立柱塔身（Mast）**：四角黃色角鋼圓柱（$r=0.012\text{m}$），間隔 $0.16\text{m} \times 0.16\text{m}$，每隔 $0.35\text{m}$ 設有橫向拉桿與對角斜撐腹桿，底座為 $0.32\text{m} \times 0.04\text{m} \times 0.32\text{m}$ 黑色錨定鋼板。
  2. **迴轉上部構造（Slewing Unit）**：
     - 圓柱迴轉軸承盤（Turntable）。
     - 駕駛室（Cabin）：黃色鋼板外殼搭接全景採光天窗與側窗（透明青藍玻璃材質）。
     - 塔頂尖架（A-Frame Apex）：高 $0.55\text{m}$ 的四角尖錐架，頂點配置紅色航空防撞警示燈。
  3. **平衡臂與配重（Counter-Jib & Counterweights）**：
     - 長度 $0.85\text{m}$ 之反向懸臂樑，後端壓載 3 塊堆疊水泥配重塊（$0.24\text{m} \times 0.22\text{m} \times 0.16\text{m}$），由塔頂引出鋼纜斜拉懸吊。
  4. **主起重臂（Main Working Jib）**：
     - 長度 $L_{\text{jib}} = \max(2.2, \text{hypot}(W, D) \times 0.86)$，為上單下雙的三弦桿三角桁架結構，覆蓋全屋上方。由塔頂尖架引出兩組斜拉鋼纜錨定於臂長 $45\%$ 與 $78\%$ 位置。
  5. **變幅載重小車（Trolley）**：在下弦軌道間滑動之四輪小車。
  6. **起升鋼纜與吊掛鋼樑（Cable, Hook & Cargo）**：
     - 垂直起升鋼纜懸掛黃色滑輪組與金屬圓弧吊鉤。
     - 吊索下懸掛兩根防鏽紅漆塗裝之大型建築工字鋼樑（$L = 0.85\text{m}$），帶有黑色捆紮鋼帶。

#### 21.3 作業動力學動畫（Working Dynamics）
- 在 `BuildingManager.update(deltaTime, isPaused)` 中，以累積的遊戲模擬時間 $t$ 驅動：
  1. **迴轉掃動（Slewing）**：以指向房屋中心之角度 $\theta_{\text{base}}$ 為基準，疊加多頻率正弦擺動：
     $$\theta = \theta_{\text{base}} + 0.72 \sin(0.45 t) + 0.18 \sin(0.9 t)$$
  2. **變幅滑移（Trolley Traversing）**：在主臂 $35\% \sim 82\%$ 範圍內平滑前後位移：
     $$x_{\text{trolley}} = L_{\text{min}} + (L_{\text{max}} - L_{\text{min}}) \times \frac{\sin(0.6 t + 1.2) + 1}{2}$$
  3. **起升升降（Hoisting）**：鋼纜垂直伸縮與吊料升降：
     $$h_{\text{drop}} = D_{\text{min}} + (D_{\text{max}} - D_{\text{min}}) \times \frac{\sin(0.75 t + 2.5) + 1}{2}$$
  4. **鋼樑慣性擺動（Inertia Sway）**：微幅隨動傾角 $\text{rot}_z = 0.07 \sin(1.5 t)$、$\text{rot}_x = 0.05 \cos(1.2 t)$。
  5. **警示燈頻閃（Beacon Blinking）**：塔頂紅燈與鷹架黃燈皆根據 $t$ 周期運算，不受現實幀率波動影響。

---

### 二十二、車輛模型縮放、路邊停車幾何與行車動線避撞隔離（Vehicle Scaling, Curbside Parking & Buffer Clearance）

#### 22.1 車輛尺寸減半推導（50% Scale）
- **原模型基準**：
  - 縮放比例：原先 `scale.set(0.9, 0.9, 0.9)`。
  - 原車體物理包絡：長度約 $0.738\text{m}$，寬度約 $0.396\text{m}$，高度約 $0.288\text{m}$。
- **本輪減半調整**：
  - 縮放比例改為 `scale.set(0.45, 0.45, 0.45)`。
  - 減半後車體尺寸：
    - 車身長度 $L_{\text{car}} \approx 0.369\text{m}$
    - 車身寬度 $W_{\text{car}} \approx 0.198\text{m}$（半寬 $w_h \approx 0.099\text{m}$，取 $0.10\text{m}$ 計算）
    - 車身高度 $H_{\text{car}} \approx 0.144\text{m}$
- **全域生效範圍**：
  - 動態車流車輛（`VehicleManager`）、市民遷入車輛（`dispatchCitizenVehicle`）、展示模型與路邊停放車輛（`ParkingManager`）均共用 `VehicleModelFactory`，保證全城車輛比例完全一致。

#### 22.2 路邊停車幾何與行車車道動線淨空隔離
在 $2.0\text{m} \times 2.0\text{m}$ 標準道路單元中：
1. **道路橫截面邊界**：
   - 道路中心線：偏距 $0.0\text{m}$。
   - 瀝青車道邊緣：$\pm 0.75\text{m}$。
   - 高架人行道區間：$[0.75\text{m}, 1.0\text{m}]$ 與 $[-1.0\text{m}, -0.75\text{m}]$（寬各 $0.25\text{m}$）。
2. **路邊停車中心線設定**：
   - 設定停車偏距為 $O_{\text{park}} = \pm 0.62\text{m}$。
   - 車身寬度佔用區間：
     $$[0.62 - 0.10, 0.62 + 0.10] = [0.52\text{m}, 0.72\text{m}]$$
   - 車體外側離路緣石（$0.75\text{m}$）保留 $0.03\text{m}$（$3\text{cm}$）之貼邊視覺距離，整齊靠邊且不穿透高架人行道。
3. **行車車道中心線（LANE_OFFSET）微調**：
   - 原 `LANE_OFFSET = 0.325m`，現微調為 $O_{\text{lane}} = \pm 0.28\text{m}$。
   - 車輛行駛時佔用區間：
     $$[0.28 - 0.10, 0.28 + 0.10] = [0.18\text{m}, 0.38\text{m}]$$
4. **絕對安全隔離緩衝帶推導（Zero Collision Proof）**：
   - 行車道最外側包絡：$0.38\text{m}$。
   - 停車位最內側包絡：$0.52\text{m}$。
   - 隔離間隙（Clearance Buffer）：
     $$\text{Buffer} = 0.52\text{m} - 0.38\text{m} = 0.14\text{m} \; (14\text{cm})$$
   - 對向行駛車輛中心間隔為 $2 \times 0.28\text{m} = 0.56\text{m}$，對向車輛間隔淨距為 $0.56 - 0.20 = 0.36\text{m}$。
   - **結論**：行駛車輛既不會與對向車輛碰頭，也不會碰撞到停靠路邊的車輛，形成完美的三段平行空間隔離。

#### 22.3 路口與轉角禁停規則之代碼級強制約束 (`ParkingManager.canParkAtTile`)
為避免行車轉彎路徑切割停車空間，路邊停車規則以程式碼進行嚴格白名單檢驗：
- **禁止停車區域（嚴禁停車）**：
  1. `FourWay`（十字路口）：存在四向直行與左轉、右轉大半徑切角動線，全面禁停。
  2. `ThreeWay`（T 字路口）：存在主線直通與支線轉彎動線，全面禁停。
  3. `Corner`（轉角彎道）：雙向連續轉彎弧線佔用轉角空間，全面禁停。
  4. `gz === 97`（邊界高速公路）：過境幹線速限高且車流頻繁，全面禁停。
- **允許停車區域**：
  1. `Straight`（直線道路）：東南西北向平行直道兩側。
  2. `DeadEnd`（死巷終端）：末端直線路側（避開末端 U-Turn 轉向弧）。
- **停放間距約束**：
  - 兩輛停放車輛之空間歐氏距離必須 $\ge 0.46\text{m}$（車長 $0.369\text{m} + 0.09\text{m}$ 前後安全車距），杜絕車輛重疊。

---

### 二十三、0.5m 土地分區格位系統與 1/4 面積建築縮放幾何（Quarter-Size Zoning Grid & Building Scaling）

#### 23.1 格位規格與離散整數索引映射
- **單元尺寸**：`CELL_SIZE = 0.5m`。
  - 原先單格：$1.0\text{m} \times 1.0\text{m} = 1.0\text{m}^2$。
  - 現在單格：$0.5\text{m} \times 0.5\text{m} = 0.25\text{m}^2$（面積為原先的四分之一）。
- **網格坐標連續與離散轉換**：
  - 給定世界座標 $(x, z)$，其整數索引為：
    $$zx = \lfloor x / \text{CELL\_SIZE} \rfloor, \quad zz = \lfloor z / \text{CELL\_SIZE} \rfloor$$
  - 給定整數索引 $(zx, zz)$，其覆蓋區間與中心座標為：
    $$x \in [zx \times \text{CELL\_SIZE}, (zx + 1) \times \text{CELL\_SIZE}], \quad x_{\text{center}} = (zx + 0.5) \times \text{CELL\_SIZE}$$
    $$z \in [zz \times \text{CELL\_SIZE}, (zz + 1) \times \text{CELL\_SIZE}], \quad z_{\text{center}} = (zz + 0.5) \times \text{CELL\_SIZE}$$
- **道路兩側投影拓撲**：
  - 道路單元為 $2.0\text{m} \times 2.0\text{m}$，中心吸附於奇數座標 $(gx, gz)$。
  - 沿道路方向：單一路段長度 $2.0\text{m}$ 劃分為 $4$ 個格位（$2.0 / 0.5 = 4$）。
  - 垂直向外發散：縱深由原先 4 格調升為 **8 格**（`ZONING_DEPTH = 8`），總縱深保持 $8 \times 0.5\text{m} = 4.0\text{m}$。

#### 23.2 建築佔地與 3D 幾何四分之一等比縮放
- **格位佔地比例對應**：
  - 房型目錄中 `frontageWidth`（面寬格數 $W$）與 `lotDepth`（縱深格數 $D$）維持幾何格數不變：
    - `Residential_2x2`：$2 \times 2$ 格 $\to$ 實體佔地 $1.0\text{m} \times 1.0\text{m} = 1.0\text{m}^2$（原 $4\text{m}^2$ 的 $1/4$）。
    - `Residential_2x3`：$2 \times 3$ 格 $\to$ 實體佔地 $1.0\text{m} \times 1.5\text{m} = 1.5\text{m}^2$（原 $6\text{m}^2$ 的 $1/4$）。
    - `Residential_3x2`：$3 \times 2$ 格 $\to$ 實體佔地 $1.5\text{m} \times 1.0\text{m} = 1.5\text{m}^2$（原 $6\text{m}^2$ 的 $1/4$）。
    - `Residential_3x3`：$3 \times 3$ 格 $\to$ 實體佔地 $1.5\text{m} \times 1.5\text{m} = 2.25\text{m}^2$（原 $9\text{m}^2$ 的 $1/4$）。
    - `Residential_4x4`：$4 \times 4$ 格 $\to$ 實體佔地 $2.0\text{m} \times 2.0\text{m} = 4.0\text{m}^2$（原 $16\text{m}^2$ 的 $1/4$）。
- **3D 模型封裝層次 (RootWrapper)**：
  - 在 `BuildingModelFactory.createBuildingById` 中建立 `rootWrapper`，內部子模型套用 `scale.set(0.5, 0.5, 0.5)`。
  - `BuildingManager` 驅動 `rootWrapper.scale.set(1.0, prog, 1.0)` 時，X/Z 軸恆定保持 $0.5$（四分之一底面積），Y 軸施工動畫由 $0.05 \times 0.5 \to 1.0 \times 0.5$ 升起。
  - 地底沉降初值由 $-0.8\text{m}$ 等比改為 $-0.4\text{m}$。

#### 23.3 四向（N/S/E/W）建地中心與緊貼馬路檢驗數學公式
令 $cs = \text{CELL\_SIZE} = 0.5$：
1. **朝南（Facing 'S'，路在 $+Z$）**：
    - 馬路檢驗線：$z_{\text{test}} = (originZz + 1) \times cs + 0.25$
    - 建地中心：$cx = (originZx + W / 2) \times cs, \quad cz = (originZz - D / 2 + 1.0) \times cs$
2. **朝北（Facing 'N'，路在 $-Z$）**：
    - 馬路檢驗線：$z_{\text{test}} = originZz \times cs - 0.25$
    - 建地中心：$cx = (originZx + W / 2) \times cs, \quad cz = (originZz + D / 2) \times cs$
3. **朝東（Facing 'E'，路在 $+X$）**：
    - 馬路檢驗線：$x_{\text{test}} = (originZx + 1) \times cs + 0.25$
    - 建地中心：$cx = (originZx - D / 2 + 1.0) \times cs, \quad cz = (originZz + W / 2) \times cs$
4. **朝西（Facing 'W'，路在 $-X$）**：
    - 馬路檢驗線：$x_{\text{test}} = originZx \times cs - 0.25$
    - 建地中心：$cx = (originZx + D / 2) \times cs, \quad cz = (originZz + W / 2) \times cs$
- 所有朝向下，建築地基邊界與道路人行道石邊緣誤差嚴格等於 $0.0\text{m}$。

---

### 24. 人行道縮窄至 0.22m、路緣停車防侵入淨距與斑馬線幾何對齊

#### 24.1 斷面空間階梯與零碰撞/零侵入解析
在單向半幅路寬 $1.0\text{m}$ 內（世界坐標自中線 $0.0\text{m}$ 至外側邊界 $1.0\text{m}$），各項空間元素劃分如下：
1. **行車道 (Driving Lane)**：
   - 車道中心線：$X = 0.28\text{m}$。
   - 車輛半寬：$0.10\text{m}$（全寬 $0.20\text{m}$）。
   - 動態行車佔用寬度：$[0.18\text{m}, 0.38\text{m}]$。
2. **動態行車避撞淨空 (Collision Buffer)**：
   - 區間：$[0.38\text{m}, 0.52\text{m}]$，淨距為 $\mathbf{0.14\text{m} = 14\text{cm}}$。
   - 保證行駛中車輛與路邊停放靜止車輛之間具備安全避讓距離，絕無穿模擦撞。
3. **路邊停車位 (Curbside Parking)**：
   - 車輛中心線：$X = 0.62\text{m}$（維持使用者指定之停車位置不變）。
   - 靜止車輛佔用寬度：$[0.52\text{m}, 0.72\text{m}]$。
4. **路緣石安全退縮淨空 (Curb Clearance)**：
   - 區間：$[0.72\text{m}, 0.78\text{m}]$，淨距為 $\mathbf{0.06\text{m} = 6\text{cm}}$。
   - 解決痛點：原先人行道自 $0.65\text{m}$ 展開，導致停放車輛外側 $0.72\text{m}$ 侵入立體人行道 $7\text{cm}$。縮窄人行道後，車身外緣距路緣石保留 $6\text{cm}$ 舒適間隙，完全消除侵占與破面重疊。
5. **立體高架人行道 (Elevated Sidewalk)**：
   - 寬度：$W_{\text{sw}} = \mathbf{0.22\text{m}}$（原 $0.35\text{m}$）。
   - 區間：$[0.78\text{m}, 1.00\text{m}]$。
   - 網格中心：$X = \pm(1.00 - 0.11) = \mathbf{\pm 0.89\text{m}}$。
   - 高度：車道面高 $0.035\text{m}$，人行道高 $0.070\text{m}$，形成 $0.035\text{m}$ 之路緣立面石階。

#### 24.2 斑馬線紋理與角隅平台幾何適配
在 $512 \times 512$ 畫布中（$1.0\text{m} \iff 256\text{px}$）：
- 人行道像素寬度：$swPx = 0.22 \times 256 = \mathbf{56\text{px}}$（原 $90\text{px}$）。
- 車道淨寬：$roadInnerW = 512 - 56 \times 2 = \mathbf{400\text{px}}$（原 $332\text{px}$）。
- **十字路口 (FourWay)**：
  - 四角平台尺寸為 $0.22\text{m} \times 0.22\text{m}$（$56\text{px} \times 56\text{px}$）。
  - 四向純白枕木紋斑馬線寬度為 $56\text{px}$，兩端完全銜接四角平台。
  - 條紋條長 $44\text{px}$（上下各保留 $6\text{px}$ 瀝青邊緣），條寬 $22\text{px}$，配置 9 條枕木條，間距均勻平整。
- **直線道路與 T 字路口 (ThreeWay)**：
  - 白霧線位置自 $92\text{px}$ 移至 $58\text{px}$（$512 - 58 - 8 = 446\text{px}$），與 $56\text{px}$ 人行道路緣石完全吻合。
  - T 字路口東側支線橫穿斑馬線同步調整為 $56\text{px}$，保持全城行人動線標準一貫性。
- **彎道轉角 (Corner)**：
  - 瀝青弧半徑由 $90 \sim 422\text{px}$ 改為 $56 \sim 456\text{px}$。
  - 外側白霧線半徑為 $450\text{px}$，內側白霧線半徑為 $62\text{px}$，與直道白霧線在接縫處曲率相切閉合。

---

### 25. 市民外觀造型系統、微觀公仔美學與車輛尺度對照

#### 25.1 微觀比例數學推導 (Citizen vs Vehicle Scale Derivation)
依據專案中各實體的絕對公尺數規格進行嚴密尺度對位：
1. **基準載具（自用轎車）**：
   - 總高度 $H_{\text{car}} = 0.142\text{m}$（座艙頂部）。
   - 車體寬度 $W_{\text{car}} = 0.198\text{m} \approx 0.20\text{m}$。
   - 車體長度 $L_{\text{car}} = 0.369\text{m} \approx 0.37\text{m}$。
2. **真實世界成人與中型轎車之比例關係**：
   - 現實中標準自用轎車車高約 $1.42\text{m} \sim 1.48\text{m}$。
   - 成年男性平均身高約 $1.75\text{m} \sim 1.78\text{m}$；成年女性平均身高約 $1.65\text{m} \sim 1.68\text{m}$。
   - 身高比率：$H_{\text{human}} / H_{\text{sedan}} \approx 1.20 \sim 1.25$ 倍。
   - 視覺特徵：成人站立於轎車旁時，頭部與肩膀略微高出轎車車頂，呈現真實且協調的微縮場景觀感。
3. **市民模型幾何尺寸定案**：
   - **男性市民 (Male Citizen)**：
     - 身高：$H_{\text{male}} = \mathbf{0.178\text{m} \sim 0.180\text{m}}$（為車高的 $1.25$ 倍）。
     - 肩寬：$W_{\text{male}} = \mathbf{0.068\text{m}}$（約 $6.8\text{cm}$）。
     - 頭身比：約 $6.5$ 頭身，圓潤微橢圓頭部（高 $0.032\text{m}$）。
   - **女性市民 (Female Citizen)**：
     - 身高：$H_{\text{female}} = \mathbf{0.168\text{m}}$（若含高丸子頭則約 $0.174\text{m}$，為車高的 $1.19$ 倍）。
     - 肩寬：$W_{\text{female}} = \mathbf{0.058\text{m}}$（約 $5.8\text{cm}$）。
     - 柔美沙漏身形與纖細手臂。
4. **與城市其他設施之相容性檢驗**：
   - **人行道 ($0.22\text{m}$)**：單名市民佔用寬度約 $0.068\text{m}$（僅佔人行道總寬的 $30\%$），雙向市民並肩或交會時佔 $0.136\text{m}$，仍剩餘 $8.4\text{cm}$ 裕度，絕不溢出至路面或侵入建築。
   - **房屋門戶 ($0.30\text{m} \times 0.14\text{m}$)**：市民進出住宅大門時，頭頂具備 $12\text{cm}$ 以上開闊淨空，比例精緻自然。

#### 25.2 樣照風格程式化 Low-Poly 幾何與材質規格
1. **材質與色彩 (Procedural Materials)**：
   - 材質採高粗糙度（$0.65$）、低金屬感（$0.05$）之平滑啞光材質，呈現樣照中微縮公仔之精巧黏土感。
   - 配備 5 款自然暖色調皮膚材質（白皙、小麥、古銅等）。
   - 上衣與褲裙採高彩度現代都市休閒色盤（天藍衛衣、沁涼海青 Polo、純白洋裝、薰衣草紫套裝）。
2. **解剖造型層次 (Procedural Hierarchy)**：
   - **雙腳與鞋子**：純白厚底球鞋（帶微倒角與灰色膠邊飾條，高度 $0.012\text{m}$）。
   - **雙腿與下裝**：
     - 男性：運動短褲（上部布料，下部顯露膚色小腿）或都會休閒長褲。
     - 女性：A-Line 傘狀洋裝裙襬（下部顯露纖細膚色雙腿）、運動短裙或粉彩九分修身褲。
   - **軀幹與上裝**：
     - 男性：倒梯形微縮胸背，領口滾邊。
     - 女性：纖細沙漏身形，搭配紅色/金色腰帶細節。
   - **手臂與雙手**：
     - 自然下垂或微曲姿態，短袖袖口搭配膚色前臂與圓形小手掌。
     - 女性選配右手提拿立體皮質手提包（帶彎曲提把）。
   - **頭部與髮型**：
     - 男性：俐落偏分短髮蓋與側邊短鬢角。
     - 女性：頂部高丸子頭（Top Bun）或氣質微彎齊肩鮑伯頭（Bob Cut）。
     - 選配配件：時尚黑色反光雙鏡片墨鏡（帶鼻樑連桿與鏡腳）。





















### 二十六、低密度住宅全面換代重構與人體工學比例技術架構

#### 26.1 微縮人體工學尺度對齊 (Ergonomic Scale Alignment)
- **基礎比例錨點**：
  - 男性市民身高：$0.178\text{m}$（代表現實成人 $1.78\text{m}$，比例為 $1\text{ 單位} = 10\text{m}$）。
  - 自用轎車規格：長 $0.369\text{m}$、寬 $0.198\text{m}$、高 $0.142\text{m}$。
- **建築尺度對齊矩陣**：
  - **玄關大門**：寬 $0.09\text{m} \sim 0.11\text{m}$、高 $0.21\text{m}$。市民通過時保留約 $3.2\text{cm}$ 舒適頭部淨空，把手位置離地 $0.10\text{m}$（齊市民腰部）。
  - **一層牆身高度**：$0.28\text{m} \sim 0.32\text{m}$（約為市民身高的 $1.6 \sim 1.8$ 倍，完美對應室內層高 $2.8\text{m} \sim 3.2\text{m}$）。
  - **雙層住宅高度**：牆身總高 $0.54\text{m} \sim 0.60\text{m}$，屋脊最高點達 $0.75\text{m} \sim 0.86\text{m}$。
  - **窗台高度**：$0.08\text{m}$（齊市民腰際線），提供真實的開窗採光感。
  - **陽台與木柵欄護欄高度**：$0.08\text{m} \sim 0.09\text{m}$（剛好位於市民腰腹至胸部，符合人體防墜安全比例）。
  - **私家車道寬度**：$0.46\text{m} \sim 0.60\text{m}$，與寬 $0.198\text{m}$ 車輛留有兩側各 $13\text{cm} \sim 20\text{cm}$ 之舒適開門下車通道。

#### 26.2 建築多幾何輪廓與原語演算法 (Procedural Architectural Primitives)
1. **屋頂演算法**：
   - `createGableRoof`：可設定前後左右四向屋簷外挑量（Overhangs）、山牆立面三角面與獨立頂脊壓條。
   - `createHipRoof`：支援縱橫雙向四坡歇山頂，依寬深比例自適應生成中央水平頂脊與四角斜脊稜線。
   - `createShedRoof`：當代單坡斜屋頂，支援指定傾斜軸向與方向，頂部平整覆蓋防水折板。
   - `createFlatParapetRoof`：現代平屋頂帶女兒牆壓頂金屬條與下凹防水露台。
   - `createDormer`：自帶迷你山牆斜頂之坡面老虎窗，與主屋頂斜面無縫嵌合。
2. **景觀與生態構造**：
   - `createPicketFence`：美式白木柵欄，垂直板條斜切尖角與上下橫向龍骨。
   - `createHedge`：方塊修剪灌木綠籬，帶微凸立體倒角。
   - `createDeciduousTree`：多面體（Dodecahedron）群聚蓬鬆樹冠，搭配漸層自然綠光影。
   - `createConiferTree`：三層同心錐體松柏針葉樹。

### 二十七、市民走路動畫 (Walk Cycle) 生物力學技術規格與關節架構

#### 27.1 骨架節點階層 (Skeletal Joint Hierarchy)
- **髖關節支點 (Hip Pivots)**：
  - 男性：$y = 0.088\text{m}, x = \pm 0.016\text{m}$。
  - 女性：$y = 0.082\text{m}, x = \pm 0.013\text{m}$。
  - 子節點：大腿、小腿、鞋身與鞋底邊框，以旋轉軸 $X$ 進行擺腿。
- **肩關節支點 (Shoulder Pivots)**：
  - 男性：$y = 0.138\text{m}, x = \pm 0.029\text{m}$。
  - 女性：$y = 0.130\text{m}, x = \pm 0.023\text{m}$。
  - 子節點：袖管、前臂、手掌及手提包。
- **軀幹與骨盆群組 (Torso & Pelvis Group)**：
  - 承載骨盆、上身、領口、頸部、頭部、髮型與配件。
  - 獨立上下顛簸位移，與雙腿支點解耦，保持腳底觸地穩定性。

#### 27.2 雙足步態運動學方程式 (Kinematic Equations of Bipedal Gait)
設步態相位 $\phi = \omega \cdot t$（$\omega = 7.5\text{ rad/s}$，頻率 $f \approx 1.2\text{ Hz}$）：
1. **腿部前後跨步擺動**：
   $$\theta_{\text{leg, left}}(t) = A_{\text{leg}} \cdot \sin(\phi)$$
   $$\theta_{\text{leg, right}}(t) = -A_{\text{leg}} \cdot \sin(\phi)$$
   其中 $A_{\text{leg}} = 0.42\text{ rad} \approx 24.1^\circ$。
2. **手臂反相擺臂平衡**：
   $$\theta_{\text{arm, left}}(t) = -A_{\text{arm}} \cdot \sin(\phi)$$
   $$\theta_{\text{arm, right}}(t) = A_{\text{arm}} \cdot \sin(\phi)$$
   其中 $A_{\text{arm}} = 0.36\text{ rad} \approx 20.6^\circ$。
   側向避讓角度：$\theta_{\text{arm, roll}} = \pm 0.035\text{ rad} \approx \pm 2.0^\circ$。
3. **骨盆雙倍頻顛簸 (Pelvic Bobbing)**：
   $$y_{\text{torso}}(t) = y_{\text{base}} + |\sin(\phi)| \cdot A_{\text{bob}}$$
   其中 $A_{\text{bob}} = 0.0035\text{m}$（每跨一步升起 $3.5\text{mm}$）。
4. **重心轉移軀幹側旋 (Torso Yaw & Roll)**：
   $$\psi_{\text{yaw}}(t) = A_{\text{yaw}} \cdot \sin(\phi), \quad A_{\text{yaw}} = 0.035\text{ rad}$$
   $$\psi_{\text{roll}}(t) = -A_{\text{roll}} \cdot \sin(\phi), \quad A_{\text{roll}} = 0.015\text{ rad}$$

---

### 二十八、路邊停車入住、市民個資生成、依序下車與進屋走路動線技術架構

#### 28.1 就近合法路邊停車位智慧探測與預約演算法 (Curbside Spot Matching & Reservation)
- **候選路塊快篩與剪枝**：
  - 僅納入符合路邊停車法規之 Straight / DeadEnd 直通路段（嚴格排除十字路口、T字路口、彎道及外部高速公路）。
  - 依候選路塊幾何中心與房屋正門之歐式平面距離進行升序排序，首選房屋門前路塊。
  - 當搜尋抵達之路塊距離已大於當前最優車位距離加 $2.0\text{m}$ 時，觸發剪枝提早中斷搜尋。
- **車位坐標與朝向算子**：
  - 南北向道路（$N \leftrightarrow S$）：西側路緣（$X = gx - 0.62\text{m}, \text{rotY} = \pi$）、東側路緣（$X = gx + 0.62\text{m}, \text{rotY} = 0$）。
  - 東西向道路（$W \leftrightarrow E$）：北側路緣（$Z = gz - 0.62\text{m}, \text{rotY} = -\pi/2$）、南側路緣（$Z = gz + 0.62\text{m}, \text{rotY} = \pi/2$）。
  - 優先探測靠近房屋方位之側緣，取房屋投影座標及前後偏移 $\pm 0.45\text{m}$ 進行碰撞檢驗。
- **雙重防重疊佔用與在途預約機制 (Anti-Collision & Pre-Reservation)**：
  - 檢驗候選點是否與任何現存停放車輛（`parkedCars`）距離小於 $0.46\text{m}$。
  - 引入 `reservedSpots` 陣列：當車輛於外部公路出發時即刻登記預約座標，防止多棟住宅同時遷入時車輛爭搶同一車位。
  - 車輛成功駛入停妥時觸發 `unreserveSpot`，並由 `parkExistingCarMesh` 接管車輛 3D Mesh 登記為持久靜態停車。

#### 28.2 車道行駛至路緣停車平滑銜接 (Seamless Curbside Pull-In)
- 車道自動選路：依據目標車位之側向（`west`/`east`/`north`/`south`），智慧匹配對應之順行車道（S/N/W/E）。
- 在 A* 車道路徑序列尾端動態注入平滑進站點：
  - 過渡點（Approach Point）：車道末端點與停車位之中間插值點，引導車身自車道中線自然斜向偏航靠邊。
  - 終點定位點（Spot Point）：路緣石旁 $0.62\text{m}$ 精準停靠點，高度固定於 $y = 0.04\text{m}$。

#### 28.3 人口即時結算與市民基本資料生成 (Instant Population & Demographic Generation)
- **人口即時計增**：車輛抵達停車位停妥瞬間，立即執行 `building.currentOccupants += arrivingCount`，並連動 `getTotalPopulation()` 與底部狀態欄 HUD 即時更新。
- **家庭/合居戶屬性生成引擎 (`generateCitizenProfiles`)**：
  - 單人自住：年齡 $22 \sim 53$ 歲，性別各 50%。
  - 雙人入住（伴侶/夫妻/室友）：首位戶長 $27 \sim 46$ 歲；次位 75% 機率為異性伴侶，年齡相仿（$\pm 3$ 歲）。
  - 3人以上多口之家：第 3 位起高機率（70%）為未成年子女（$5 \sim 18$ 歲）或同住長輩（$45 \sim 65$ 歲）。
  - 結合台灣常見姓氏（林、陳、黃、張、李、王等）與男女常用名字池，為每名市民指派唯一 ID、姓名、性別、年齡與所屬房屋 ID。

#### 28.4 依序下車序列與步態動線管理 (Sequential Alighting & Walking Pipeline)
- **交錯下車計時器**：每名市民設定交錯延遲時間 $\Delta t_i = 0.35 + i \times 1.1\text{ 秒}$。
- **性別外觀精準映射**：延遲倒數歸零時，根據該名市民個資之 `profile.gender` 呼叫 `CitizenModelFactory.createCitizen` 生成對應男女模型。
- **三段式步行航向與骨架步態**：
  - 航點 1（人行道下車側）：自車身旁向人行道外側偏置 $0.18\text{m}$。
  - 航點 2（房屋正門地界 Gate）：沿人行道步行至住宅前院小徑入口。
  - 航點 3（房屋大門 Front Door Porch）：沿迎賓石板路進入門廊。
  - 每幀以 $v = 1.0\text{ m/s}$ 朝向當前目標推進，即時計算移動向量角 $\text{atan2}(dx, dz)$ 更新市民轉向，同時即時調用 `animateCitizenWalk` 驅動腿部擺動、手臂反向擺盪與骨盆顛簸。
  - 到達大門時市民模型優雅退場（進入房內）；整批市民全部進屋後標記房屋為 `moveInStatus = 'arrived'`。

---

### 二十九、路口行車導向標線與轉彎引導線程序化渲染技術架構

#### 29.1 7 種標準路面導向箭頭程序化向量繪製 (Procedural Pavement Arrows)
- **高解析度 Canvas 2D 向量路徑**：
  - 統一採用 $256 \times 256$ 像素高解析畫布，純透無底色，以純白 `#ffffff` 填滿繪製。
  - 箭桿規格：寬 $26\text{px}$、底端 $y = 238\text{px}$，箭頭頂尖 $y = 22\text{px}$，箭羽外展寬度 $76\text{px}$，內收夾角採用精確直線倒角。
  - 轉彎分叉弧線：利用三階貝茲曲線（Cubic Bézier）自箭桿側翼 $y = 155\text{px}$ 處向外平滑擺盪 $90^\circ$，形成極致俐落的高速公路/市區標準導向箭頭。
- **箭頭型態判定算子**：
  $$\text{type} = f(\text{canStraight}, \text{canLeft}, \text{canRight})$$
  - `straight`：直行專用（$\uparrow$）
  - `left`：左轉專用（$\curvearrowleft$）
  - `right`：右轉專用（$\curvearrowright$）
  - `straight_left`：直行兼左轉（$\uparrow \curvearrowleft$，完全符合參考圖中間樣式）
  - `straight_right`：直行兼右轉（$\uparrow \curvearrowright$）
  - `left_right`：左右轉雙向分流（$\curvearrowleft \curvearrowright$，T 字路口支線專用）
  - `all`：直行兼左右轉全通（$\curvearrowleft \uparrow \curvearrowright$，十字路口單車道全通）

#### 29.2 車道進口導向標線拓撲幾何吸附
- **空間定位錨點**：
  - 車道中心偏移距 $\text{LANE\_OFFSET} = 0.28\text{m}$。
  - 縱向定位距 $\text{ARROW\_DIST} = 0.52\text{m}$（置於 $2.0\text{m} \times 2.0\text{m}$ 路口格位內部，斑馬線與路口交匯核心之間的車道空間）。
- **進口車流方向與旋轉映射**：
  - 北側進口（車流向南 $+Z$）：$\text{rotZ} = \pi$，允許判定 $\text{Straight}=\text{hasS}, \text{Left}=\text{hasE}, \text{Right}=\text{hasW}$。
  - 南側進口（車流向北 $-Z$）：$\text{rotZ} = 0$，允許判定 $\text{Straight}=\text{hasN}, \text{Left}=\text{hasW}, \text{Right}=\text{hasE}$。
  - 東側進口（車流向西 $-X$）：$\text{rotZ} = \pi/2$，允許判定 $\text{Straight}=\text{hasW}, \text{Left}=\text{hasS}, \text{Right}=\text{hasN}$。
  - 西側進口（車流向東 $+X$）：$\text{rotZ} = -\pi/2$，允許判定 $\text{Straight}=\text{hasE}, \text{Left}=\text{hasN}, \text{Right}=\text{hasS}$。

#### 29.3 路口內部圓弧轉彎引導虛線 (Turning Guide Dashes)
- 提取路口內轉彎車道（起訖軸向不同之貝茲曲線車道，例如北往東、南往西、西往北等）。
- 沿著平滑航點序列取樣中間核心段，生成尺寸 $0.024\text{m} \times 0.08\text{m}$ 之純白微型虛線段。
- 每個虛線段以切線角度即時校正航向角，高度設置於 $y = 0.038\text{m}$，提供清晰的車輛轉彎軌跡視覺引導。

---

### 三十、中央分向限制線（雙黃實線）程序化紋理與幾何連續性架構

#### 30.1 交通法規與工程語意對齊
- **設計法理原則**：道路規格載明「路段禁止迴轉（路口除外）」，原先單黃虛線在道路標線法理上屬於准許超車與迴轉之「行車分向線」，與遊戲規則產生法理矛盾。全面升級為「分向限制線（雙黃實線）」，具備絕對禁止跨越超車與禁止路段迴轉之工程語意。

#### 30.2 幾何規格與各類道路網格無縫接合
1. **直線道路 (`getStraightTexture`)**：
   - 畫布尺寸：$512 \times 512$ 像素，道路中心線為 $X = 256$。
   - 左側黃實線中心：$X = 247$，覆蓋範圍 $[243, 251]$。
   - 右側黃實線中心：$X = 265$，覆蓋範圍 $[261, 269]$。
   - 線寬：$8\text{px}$（世界座標約 $3.1\text{cm}$）；中夾瀝青間隙 $10\text{px}$（世界座標約 $3.9\text{cm}$）；雙黃線總寬度 $26\text{px}$（世界座標約 $0.10\text{m}$）。
   - 繪製樣式：`ctx.setLineDash([])` 實線，色彩 `#f59e0b`。
2. **直角彎道 (`getCornerTexture`)**：
   - 同心圓弧圓心：$(512, 512)$。
   - 外側黃實線圓弧半徑：$R_{\text{outer}} = 265\text{px}$。
   - 內側黃實線圓弧半徑：$R_{\text{inner}} = 247\text{px}$。
   - 線寬均為 $8\text{px}$，實線無虛化。
   - 完美閉合數學驗證：在 $\theta = \pi$ 處，$X = 512 - 265 = 247$ 與 $X = 512 - 247 = 265$；在 $\theta = 1.5\pi$ 處，$Y = 512 - 265 = 247$ 與 $Y = 512 - 247 = 265$。與相鄰直線道路之雙黃線端點以 $0\text{px}$ 誤差完美無縫咬合。
3. **T 字路口 (`getThreeWayTexture`)**：
   - 南北貫通幹道引道段（$Y \in [0, 140]$ 與 $Y \in [372, 512]$）：繪製標準雙黃實線，貫徹路段禁止超車與迴轉。
   - 支線交會開口段（$Y \in [140, 372]$）：平滑轉化為雙黃虛線（`setLineDash([20, 16])`），明確展現「路口除外」之轉向通行合法性，引導車輛進出支線。
4. **十字路口 (`getFourWayTexture`)**：
   - 路口衝突區內部維持純淨瀝青，不繪製中央分向線，完全符合現代十字路口工程規範。
5. **建造選單 UI 圖標 (`BuildMenu.ts`)**：
   - 雙向車道卡片預覽圖標之中央標線同步更新為雙黃實線 SVG，保持遊戲視覺與規格說明之高度一致性。


---

### 三十一、路口車輛停止線 (Stop Line) 3D 程序化標線與停等動力學架構

#### 31.1 道路交通工程法理與停止線配置
- **交通標線規範定位**：停止線用以指示車輛停止之界限，保持與行人穿越道（斑馬線）之安全淨距。
- **單向進口車道專屬性**：停止線僅繪製於「進入路口側之進口車道」，嚴格禁止跨越對向出口車道，從而完整保留離境車道之通行淨空。
- **空間緩衝階層佈局**：
  $$\text{進口直道} \longrightarrow \text{導向箭頭 (長 0.468m)} \xrightarrow{13.4\text{cm 留白}} \text{停止線 (厚 0.065m)} \xrightarrow{11.8\text{cm 緩衝}} \text{路口斑馬線 (寬 0.22m)}$$

#### 31.2 停止線幾何尺寸與座標對齊數學
1. **尺寸參數**：
   - 車道橫向寬度：$W_{\text{stop}} = 0.70\text{m}$（精準覆蓋內側雙黃線外緣 $0.06\text{m}$ 至外側白霧線/路緣 $0.76\text{m}$）。
   - 行車方向厚度：$T_{\text{stop}} = 0.065\text{m}$（高對比純白 `#ffffff`，高空俯瞰醒目清晰）。
   - 離地高度：$y = 0.0565\text{m}$（浮於路面 $0.055\text{m}$ 上方 $1.5\text{mm}$，`depthWrite: false`、`polygonOffsetFactor: -4`，抗鋸齒無破面）。
2. **拓撲座標映射**：
   - 停止線中心距離網格中心：$\text{STOP\_LINE\_OFFSET} = 0.85\text{m}$（即距路口交界處 $1.0 - 0.85 = 0.15\text{m}$）。
   - 停止線中心橫向偏移：$\text{STOP\_LINE\_LANE\_CENTER} = 0.41\text{m}$。
   - 南北進口向：`createStopLineMesh(false)`，幾何尺寸 $0.70\text{m} \times 0.065\text{m}$。
   - 東西進口向：`createStopLineMesh(true)`，幾何尺寸 $0.065\text{m} \times 0.70\text{m}$。

#### 31.3 車輛紅燈煞停動力學校準 (`VehicleManager.ts`)
- **實體尺寸**：車身長度 $0.82\text{m}$，車頭保險桿位於車體中心前方 $0.41\text{m}$。
- **停等距離校正**：
  - 將停等緩衝點由原先的 $0.25\text{m}$ 調校為 $\text{STOP\_BUFFER} = 0.62\text{m}$。
  - 當車輛在紅燈前煞停時，車體中心位於交界前 $0.62\text{m}$，前保險桿位於交界前 $0.62 - 0.41 = 0.21\text{m}$。
  - 停止線後緣位於交界前 $0.15 + 0.0325 = 0.1825\text{m}$。
  - **停等視覺效果**：車頭前保險桿恰好停於停止線後方約 $2.8\text{cm}$ 處，完全不壓線、不闖入斑馬線，視覺極致擬真。


---

### 三十二、車道空間隊列 (Lane Queue) 與虛擬障礙物跟車防追撞技術架構
#### 32.1 交通跟車問題與架構選型對比
- **暴力物理射線 (Raycast) 之致命缺陷**：
  - 彎道與轉向穿幫：直線射線在弧線車道容易射向路側、人行道或對向來車，產生幽靈煞車（Phantom Braking）。
  - 運算複雜度為 $O(N^2)$ 或頻繁 GPU/CPU 求交，隨車輛增加效能急遽劣化。
- **車道空間隊列 (Lane Queue) 選型優勢**：
  - 車道本質是一維連續曲線流（1D Manifold），在車道內建立有序隊列，查找前車（Leader）達到極致的 $\mathbf{O(1)}$ 常數時間。
  - 自然貼合任意幾何形狀之車道（直線、同心弧、S型轉彎），無幾何誤判。

#### 32.2 車道隊列數據結構與排序算法 (`VehicleManager.ts`)
1. **隊列映射結構**：
   - `laneQueues: Map<string, LaneVehicleEntry[]>`，記錄每條車道上的活動車輛。
   - 記錄距離車道出口之剩餘累積距離：
     $$\text{distToExit} = \|\mathbf{p}_{\text{curr}} - \mathbf{w}_{\text{target}}\| + \sum_{k=\text{target}}^{\text{end of lane}} \|\mathbf{w}_k - \mathbf{w}_{k+1}\|$$
2. **升冪隊列排序**：
   - 依據 `distToExit` 進行升冪排序，索引 $0$（`distToExit` 最小者）即為最靠近車道出口之隊頭車輛（Lane Leader）。
   - 同車道後車尋找前車：直接取在隊列中 `distToExit` 比自車小且最接近之車輛，距離即為 $\Delta d = \text{distToExit}_{\text{self}} - \text{distToExit}_{\text{lead}}$。

#### 32.3 跨車道銜接（隊頭感知）演算法 (Cross-Lane Lookahead)
- **問題場景**：當自車為當前車道隊頭時，前車可能已跨入下一段車道（如路口轉彎連接道或下游路段），若無跨車道感知，後車將無法預判下游擁堵而撞入路口。
- **解析邏輯**：
  1. 沿自身即將經過的航點提取後續車道清單（最多預覽 3 段下游車道）。
  2. 若下游車道存在車輛，以 $O(1)$ 鎖定該車道隊列之**最後一輛車（隊尾 Tail Car，即離進口最近者）**。
  3. 計算連續路徑總間隔：
     $$\text{distToLead} = \text{distToExit}_{\text{self}} + \sum \text{LaneLength}_{\text{intermediate}} + \max(0, \text{LaneLength}_{\text{next}} - \text{distToExit}_{\text{tail}})$$
  4. 若 $\text{distToLead} \le 8.0\text{m}$，將其納入跟車制動約束，徹底避免路口阻塞（Gridlock）與追撞。

#### 32.4 車身長度補償與安全距離幾何模型
- **車體真實尺寸**：
  - 幾何模型長度 $0.82\text{m}$，經等比縮放 $0.45\times$ 後實際車長 $L_{\text{veh}} = 0.369\text{m}$（半長 $L_{\text{half}} = 0.185\text{m}$）。
- **舒適視覺間距**：
  - 停等時兩車保險桿純淨空隙 $\text{Gap}_{\text{stop}} = 0.38\text{m}$。
  - 中心點完全靜止時最小安全車距：
    $$\text{MIN\_FOLLOWING\_DIST} = L_{\text{veh}} + \text{Gap}_{\text{stop}} = 0.37 + 0.38 = \mathbf{0.75\text{m}}$$
- **純淨有效間隔 (Net Gap)**：
  $$\text{netGap} = \max(0, \text{centerDist} - 0.75\text{m})$$

#### 32.5 虛擬障礙物運動學與號誌融合控制公式
1. **動態跟車安全煞車公式**：
   $$v_{\text{safe}} = \sqrt{\max\left(0, v_{\text{lead}}^2 + 2 \cdot a_{\text{decel}} \cdot \text{netGap}\right)}$$
   - 當前車完全煞停 ($v_{\text{lead}} = 0$) 時，公式自然收斂為平滑停等曲線 $\sqrt{2 \cdot a_{\text{decel}} \cdot \text{netGap}}$。
   - 當前車巡航行駛時，自車隨間隙縮小自動平滑過渡並等速跟隨。
2. **號誌與跟車雙重約束決策**：
   $$v_{\text{desired}} = \min(v_{\text{target}}, v_{\text{signal}}, v_{\text{lead}})$$
   $$\Delta x_{\text{max}} = \min(\text{maxSignalMove}, \text{netGap})$$
   $$\Delta x = \min(v \cdot \Delta t, \Delta x_{\text{max}})$$
   - 從數學位移上限保證單幀位移永遠不超過淨空隙，即時在極端掉幀下也絕無可能穿模撞車。
3. **綠燈波（Shockwave Effect）自然湧現**：
   - 綠燈亮起時，前車先啟動，車距隨之拉開，後車平滑加速跟上，展現真實的骨牌式依序起步視覺。

---

### 33. 土地劃分框選模式與大面積批次用途指派 (`ZoningManager.ts` & `BuildMenu.ts`)

#### 33.1 架構設計與操作模式解耦
- **分區工具雙模態 (Dual-Modal Tooling)**：
  - `brush`（塗抹模式）：維持 Cities: Skylines 經典連續塗抹手感，點擊或按住拖曳快速填色。
  - `box`（框選模式）：支援大面積矩形區域拉伸，框選鬆開後一次性批次賦予分區用途（住宅區或清除）。
  - 工具操作模式（`ZoningToolMode: 'brush' | 'box'`）與目標用途（`currentMode: 'Residential' | 'Dezone'`）採正交設計，互相解耦獨立切換。
- **UI 與快捷操作**：
  - 子選單頂部新增 `.zoning-tool-mode-bar` 雙 Tab 切換列，具備明亮綠色發光外框反饋。
  - 鍵盤快速鍵：選單開啟狀態下按下 `Tab` 鍵即可在塗抹與框選間雙向切換；`Escape` 或滑鼠右鍵可取消當前框選。

#### 33.2 零記憶體配置負擔的 3D 矩形框選視覺系統 (Zero-Allocation 3D Marquee)
- **視覺組成架構**：
  - `boxFillMesh`：單一共享 `PlaneGeometry(1, 1)`，透過水平旋轉 $\theta_x = -\frac{\pi}{2}$ 緊貼地面。
  - `boxOutlineLine`：以子物件形式掛載於 `boxFillMesh` 之 `LineLoop` 四邊邊線幾何，局部垂直位移 $z_{\text{local}} = 0.002\text{m}$，徹底消除與填滿面的 Z-fighting。
- **動態空間 Transform 演算法**：
  - 紀錄起點網格整數索引 $(zx_{\text{start}}, zz_{\text{start}})$ 與當前照射點 $(zx_{\text{curr}}, zz_{\text{curr}})$：
    $$zx_{\text{min}} = \min(zx_{\text{start}}, zx_{\text{curr}}), \quad zx_{\text{max}} = \max(zx_{\text{start}}, zx_{\text{curr}})$$
    $$zz_{\text{min}} = \min(zz_{\text{start}}, zz_{\text{curr}}), \quad zz_{\text{max}} = \max(zz_{\text{start}}, zz_{\text{curr}})$$
  - 網格對齊世界空間邊界推導（Cell Size $c_s = 0.5\text{m}$）：
    $$x_{\text{min}} = zx_{\text{min}} \cdot c_s, \quad x_{\text{max}} = (zx_{\text{max}} + 1) \cdot c_s$$
    $$z_{\text{min}} = zz_{\text{min}} \cdot c_s, \quad z_{\text{max}} = (zz_{\text{max}} + 1) \cdot c_s$$
    $$\text{width} = x_{\text{max}} - x_{\text{min}}, \quad \text{depth} = z_{\text{max}} - z_{\text{min}}$$
    $$x_{\text{center}} = \frac{x_{\text{min}} + x_{\text{max}}}{2}, \quad z_{\text{center}} = \frac{z_{\text{min}} + z_{\text{max}}}{2}$$
  - 每幀直接更新 `position.set(centerX, 0.034, centerZ)` 與 `scale.set(width, depth, 1)`，無需重新生成 Geometry，維持 60 FPS 極致流暢度。

#### 33.3 拓撲保護與批次用途送出 (Batch Zoning & Topology Guard)
- **路側格位過濾與送出演算法**：
  - 框選範圍於滑鼠放開時調用 `commitBoxSelection()`：
    遍歷 $zx \in [zx_{\text{min}}, zx_{\text{max}}]$ 與 $zz \in [zz_{\text{min}}, zz_{\text{max}}]$，透過 `this.cells.get(key)` 檢核。
  - 由於 `this.cells` 在建構時已透過 `!isOverlappingRoad(...)` 嚴格過濾道路鋪面，因此即使框選範圍跨越路面或路口，車道主體絕對不受任何分區覆蓋或污染。
- **即時 HUD 狀態氣泡動態推播 (Interactive Tooltip)**：
  - 框選拖曳時動態計算矩形網格維度（$W \times D$）與內部實際涵蓋之路側分區格數 $N_{\text{cells}}$。
  - 即時反饋：「正在框選：$W \times D$ 格（包含 $N$ 格路側分區）· 放開滑鼠以指派用途 · 右鍵取消」。


---

### 34. 住宅名下車輛登記與市民出行方式決策系統 (`BuildingManager.ts` & `ParkingManager.ts`)

#### 34.1 核心架構與名下車輛登記機制 (Residence Vehicle Registration Architecture)
- **多車輛登記模型 (`ResidenceVehicle`)**：
  - 每個住宅實體（`PlacedBuilding`）維護獨立車輛清單 `vehicles: ResidenceVehicle[]`。
  - **建屋完工遷入車輛**：房屋完工（`completeConstruction`）時，調度市民自邊界公路開車遷入，車輛登記來源標記為 `source = 'construction'`（建屋遷入）。
  - **合居併入遷入車輛**：當後續有市民併入合居（`matchJoinExisting`）時，調度併入市民自邊界公路開車遷入，車輛登記來源標記為 `source = 'merge'`（併入遷入）。
  - **多車輛支援**：若一間房屋有人併入合居，名下即登記兩輛車（一輛為建屋時遷入，一輛為併入時遷入）。
  - **車輛狀態機轉換**：
    - `en_route_move_in`：自邊界公路行駛進城中。
    - `available`：抵達並成功停放於路邊車位（`CurbsideSpot`），與 `ParkingManager` 雙向綁定 `buildingId` 與 `residenceVehicleId`，處於住宅旁閒置可用狀態。
    - `in_use`：住宅內市民出行時借出使用中，記錄當前駕駛市民 ID 與姓名。

#### 34.2 市民出行方式決策演算法 (Travel Mode Decision Model)
- **方式 (Mode) 本質**：
  開車為可供市民選擇之出行方式之一，並非每次出行必定開車出發。出行方式包含：
  - `drive`：開車出行（使用住宅名下閒置車輛）。
  - `walk`：步行出行（短程、偏好步行、未成年或車輛皆被合居成員借出時）。
  - `transit`：大眾運輸出行（偏好公車捷運、保留住宅車輛）。
- **決策流程 (`decideCitizenTravel`)**：
  1. **駕駛資格審查 (`canDrive`)**：
     - 市民年齡必須滿 18 歲（`age >= 18`）。未滿 18 歲之市民（小孩/青年）不可單獨駕車，強制選擇步行或大眾運輸。
     - 住宅名下必須存在 `status === 'available'` 之可用車輛。若住宅無登記車輛，或所有車輛皆已由其他合居成員借出（`availableVehicles.length === 0`），市民自適應降級為步行或大眾運輸。
  2. **偏好與情境決策 (Preference & Context)**：
     - 若 `canDrive` 為真：
       - `DriveOnly`（自駕偏好）：自住宅名下可用車輛中挑選首輛車輛（`availableVehicles[0]`），進入開車出行模式。
       - `WalkIfClose`（短途步行偏好）：若目的地距離小於等於 $20\text{m}$（或短途評估），市民選擇步行，名下車輛保留於住宅路側；若距離較遠則選擇開車。
       - `PreferTransit`（大眾運輸偏好）：高機率搭乘大眾運輸，保留住宅車輛；特定情境下改為開車。
  3. **狀態更新與佔用鎖定**：
     - 選擇開車：所選車輛標記 `status = 'in_use'`，關聯 `currentDriverCitizenId`；市民標記 `currentVehicleId`、`currentTravelMode = 'drive'`、`currentActivity = 'Traveling'`。
     - 選擇步行/大眾運輸：車輛維持 `available`，市民標記 `currentVehicleId = undefined`、`currentTravelMode = selectedMode`、`currentActivity = 'Traveling'`。
     - 房內現有人數即時更新：`building.currentOccupants = Math.max(0, building.currentOccupants - 1)`。

#### 34.3 市民返家與車輛歸還解鎖機制 (Return Home & Vehicle Restitution)
- **解鎖歸還流程 (`returnCitizenToResidence`)**：
  - 檢索市民及其所屬住宅。
  - 若市民此前為開車出行（`citizen.currentVehicleId` 存在）：
    - 依車輛 ID 檢索住宅名下該車輛，重設 `vehicle.status = 'available'`，清除 `currentDriverCitizenId` 與 `currentDriverName`。
    - 車輛重回住宅閒置可用庫，供其他合居成員下次出行借用。
  - 市民重設 `currentActivity = 'AtHome'`，清除 `currentVehicleId` 與 `currentTravelMode`。
  - 房內現有人數即時遞增：`building.currentOccupants += 1`。

#### 34.4 雙向資料鏈結與除錯視覺化
- **ParkingManager 雙向映射**：
  - `ParkedCar` 結構擴充 `buildingId` 與 `residenceVehicleId`，支援 `getParkedCarByVehicleId` 反向檢索。
- **3D 懸停 Tooltip 即時顯示**：
  - 懸停住宅時即時呈現名下所有車輛編號、來源標籤、烤漆顏色與目前狀態（閒置可用 / 某某市民出行中）。
- **DevMenu 互動測試**：
  - 房屋分頁新增「🚶🚗 市民出行方式決策測試」，支援一鍵隨機選取市民進行出行決策、查看詳細決策原因，並支援一鍵召回返家。


---

### 35. 背景分頁持續運行機制與 Web Worker 心跳計時器架構 (`BackgroundTimer.ts` & `main.ts`)

#### 35.1 瀏覽器背景凍結機制與問題成因
- **`requestAnimationFrame` (rAF) 背景節流**：
  現代瀏覽器（Chromium、WebKit、Gecko）為了節省 CPU/GPU 資源與筆記型電腦電量，當分頁切換為後台（`document.visibilityState === 'hidden'`）或視窗被最小化時，會主動暫停或極大幅度降低 rAF 的回呼頻率（降為 0 ~ 1 FPS）。
- **`clampedDelta` 時間截斷影響**：
  若在迴圈中採用 `clampedDelta = Math.min(delta, 0.1)` 防穿模保護，當使用者離開分頁再切回時，累積數秒或數分鐘的時間增量會被強制截斷為 0.1 秒，導致切離期間的遊戲世界時間被直接丟棄。
- **主執行緒計時器限制**：
  若僅在主執行緒使用 `window.setInterval` 或 `window.setTimeout`，瀏覽器在後台分頁中依然會實施計時器限頻（Throttling to $\ge 1000\text{ms}$）。

#### 35.2 Web Worker 心跳計時器設計 (`BackgroundTimer.ts`)
- **Web Worker 的獨立性優勢**：
  Web Worker 執行緒獨立於主渲染執行緒，不受分頁前景/後台 rAF 凍結政策約束，其內部的 `setInterval` 即使在分頁隱藏狀態下依然能精確以指定毫秒間隔觸發。
- **內聯 Blob URL Worker 架構**：
  - **優點**：不依賴打包工具的額外 Worker 插件配置，在 Vite 開發環境、預覽環境、生產構建以及靜態伺服器中 100% 相同行為且零額外網路請求。
- **精確真實 Delta 時間計算**：
  心跳觸發時，主執行緒利用高精度時鐘計算真實時間增量：
  $$\Delta t_{\text{raw}} = \frac{\text{performance.now}() - t_{\text{last}}}{1000}$$
  $$\Delta t_{\text{clamped}} = \min(\max(\Delta t_{\text{raw}}, 0), 0.1)$$
- **優雅降級 (Fallback)**：
  若環境受限於特定安全策略（如嚴格 CSP），系統自動捕獲異常並切換為 `window.setInterval` 備援，確保程式穩健不拋出未捕獲例外。

#### 35.3 模擬迴圈與渲染迴圈解耦架構 (`main.ts`)
- **職責分離原則**：
  - **`stepSimulation(delta)`（邏輯層）**：
    - `TimeManager.update(clampedDelta)`：推進遊戲年月日與分秒。
    - `RoadManager.update(simDelta, isPaused)`：紅綠燈倒數計時與相位切換。
    - `VehicleManager.update(simDelta, isPaused)`：車輛沿樣條軌跡位移、跟車排隊隊列、紅綠燈停等。
    - `BuildingManager.update(simDelta, isPaused)`：房屋建造進度、市民活動、車輛歸屬管理。
    - `BottomStatusBar.updateStats({ population })`：底部人口即時同步。
  - **`renderFrame(delta)`（視圖層）**：
    - `CameraManager.update(delta)`：相機視角控制與平移阻尼。
    - `DevMenu.update(delta)`：3D 展台模型自轉與動畫預覽。
    - `renderer.render(scene, camera)`：Three.js WebGL 畫格著色。
- **喚醒邊界平滑過渡**：
  當由 Background 轉換至 Foreground 時：
  1. 立即呼叫 `backgroundTimer.stop()` 停止心跳。
  2. 呼叫 `clock.getDelta()` 消耗並重置 `THREE.Clock` 的內部舊時間戳記，防止第一畫格讀取到背景休眠累積的巨大 Delta。
  3. 重新調度 `animationFrameId = requestAnimationFrame(animate)`，達到無感、無穿透、無突躍的平滑視覺切換。

---

### 36. 大規模住宅生成效能瓶頸分析與優化架構設計

#### 36.1 WebGL 渲染瓶頸 (Draw Call 與 Shadow Map 雙重膨脹)
- **單棟住宅複合 Mesh 量**：
  在目前 `BuildingModelFactory` 設計中，為呈現高質感 Low-Poly 細節，一棟房屋包含：
  - 基座與庭院（基礎石台、草皮、車道石板）：3 ~ 5 個 Mesh
  - 建築量體（主樓、側翼、懸挑陽台）：3 ~ 6 個 Mesh
  - 屋頂系統（雙坡頂、四坡頂、屋脊封邊瓦條）：2 ~ 4 個 Mesh
  - 門窗構件（深進門廊雨棚、窗框、玻璃窗格、窗台）：8 ~ 15 個 Mesh
  - 植栽與庭院裝飾（樹幹、多層多面體樹冠、方剪矮籬、花叢）：4 ~ 8 個 Mesh
  - 柵欄構件（每片柵欄包含 10 ~ 30 根獨立木片條）：10 ~ 30 個 Mesh
  - 完工配屬私家車：約 17 個 Mesh
  **合計**：單一建築實體平均擁有 50 ~ 80 個獨立 Mesh。
- **Draw Call 指數級膨脹**：
  在 WebGL 渲染管線中，每個獨立 Mesh 代表一次獨立的狀態綁定與 `gl.drawElements` 調用：
  $$N_{\text{DrawCalls}} = N_{\text{Buildings}} \times (N_{\text{Meshes/Building}} + N_{\text{ShadowCasters}})$$
  - 當城市達到 50 棟房屋時，主場景 Mesh 量達 $50 \times 60 \approx 3,000$ 個。
  - 太陽光實時陰影（DirectionalLight Shadow Map）覆蓋全城（240m×240m），所有細小構件均標記 `castShadow = true`，使 Shadow Map Pass 必須將所有幾何體再繪製一次。
  - 單幀總 Draw Call 高達 $3,000 \times 2 = 6,000$ 次，遠超單線程 WebGL 流暢幀率負荷（安全區間通常為 $\le 1,500$ 次）。

#### 36.2 滑鼠懸停射線求交瓶頸 (`checkBuildingHover`)
- **未節流高頻觸發**：
  `mousemove` 事件在現代高頻率滑鼠（125Hz ~ 1000Hz）或高刷新螢幕（144Hz）下一秒觸發上百次。
- **全幾何體遞迴求交**：
  ```typescript
  // 現有瓶頸代碼
  this.raycaster.intersectObjects(candidates, true);
  ```
  `recursive = true` 迫使 Three.js 對所有候選 Group 內之所有子 Mesh 進行遍歷，計算逆世界矩陣、包圍球測試以及三角面射線求交。
  在 3,000+ Mesh 下，滑鼠微移即消耗 10 ~ 30ms CPU 時間，直接擊穿 16.6ms 影格預算（引發 15 ~ 30 FPS 驟降）。

#### 36.3 建地搜尋之圖演算法開銷 (`findSiteForModel`)
- **雙重循環與圖尋路調用**：
  在隨機產生新建需求時，演算法遍歷未佔用住宅格（數百格）並對 4 個朝向測試：
  $$\text{Complexity} = O(N_{\text{Cells}} \times 4 \times T_{\text{Pathfinding}})$$
  每次測試若調用 `hasPathFromHighway`，皆觸發兩次起點至目標車道的 A* 搜尋。在路網擴大時，此操作將造成短暫的單幀卡頓（Frame Hitch）。

#### 36.4 三階段優化架構藍圖
- **階段 1：射線 Hitbox 化與陰影剪枝（輕量、零破壞性改動）**：
  1. **隱形包圍盒 (Proxy Hitbox)**：每棟房屋維護單一不可見的 `BoxGeometry`，`raycaster.intersectObjects([hitbox], false)` 僅需測試單一包圍盒（12 面），求交速度提升 50 倍以上。
  2. **滑鼠懸停節流 (rAF Throttle)**：同一畫格內至多執行一次射線檢測，避免滑鼠移動爆發佔用主線程。
  3. **陰影剪枝 (Shadow Caster Pruning)**：柵欄木片、小矮籬、窗框等細節關閉 `castShadow`，僅主樓體與屋頂投射陰影，Shadow Pass 繪製調用減少 60% ~ 75%。
- **階段 2：完工房屋靜態幾何合併 (`BufferGeometryUtils.mergeGeometries`)**：
  - 房屋施工完畢後外觀完全靜態（吊臂拆除），可將相同材質之幾何體（象牙白牆、石板屋頂、木質構件）在世界座標系或房屋局部座標下合併。
  - 單棟房屋從 60 個 Mesh 劇降為 2 ~ 3 個合併 Mesh，100 棟房屋 Draw Call 從 6,000 降至 200 ~ 300，效能提升 10 ~ 20 倍。
- **階段 3：實例化與路網連通分量查表 (`InstancedMesh` & Connected Components)**：
  - 路邊車輛、路樹與標誌改採 `THREE.InstancedMesh` 渲染，數千物件單一 Draw Call。
  - 路網連通性改採連通分量（Disjoint Set / BFS 標記），以 $O(1)$ 查表直接判斷道路是否連通外聯高速公路，消除建地配對時的重複 A* 運算。

---

### 37. 模型端原型預烘焙（Pre-baked Archetype）幾何合併技術

#### 37.1 為什麼在「模型端/召喚時」合併優於「完工後合併」？
- **動態組件邊界清晰**：
  在現行城市模擬中，施工狀態下唯一具有獨立動畫變形的是：
  1. `scaffoldingGroup`（鋼管鷹架、閃爍警示球、迴轉變幅起升之塔式吊臂）。
  2. 房屋本體整體根節點 `buildingMesh.position.y`（由 $-0.4\text{m}$ 上升至 $0\text{m}$）與 `buildingMesh.scale.y`（由 $0.05$ 放大至 $1.0$）。
- 房屋內部的數十個子構件（草皮地坪、階梯水線、主體量體、門窗雨棚、屋脊瓦片、白木柵欄、花樹）相對於 `buildingMesh` 的局部座標與旋轉**自始至終固定不變**。
- 若改在模型工廠端直接產出合併網格：
  1. 施工期間就已經是極簡狀態，多棟同時施工也不會產生 Draw Call 突波。
  2. 避開了完工切換瞬間需在執行期解構 Group、動態合併 Geometry 的 CPU 抖動與物件替換邏輯。

#### 37.2 原型預烘焙快取機制 (Pre-baked Archetype Cache)
- 目前遊戲中低密度住宅共有 5 種模型（`Residential_2x2`, `Residential_2x3`, `Residential_3x2`, `Residential_3x3`, `Residential_4x4`）。
- 同型號房屋在幾何形狀與材質上是完全一致的，因此無需在每次「召喚」時都跑一次合併運算，而是在工廠初始化時對每款房型執行**一次性烘焙（Bake Once）**：
  ```
  [原始幾何裝配邏輯 (代碼組裝)]
            │
            ▼ 僅執行一次
  [按材質分類收集子幾何體 (Multi-Material Grouping)]
            │ 矩陣烘焙: geo.applyMatrix4(child.matrix)
            ▼
  [BufferGeometryUtils.mergeGeometries(geos)]
            │
            ▼
  Map<ModelId, MergedMeshes[]> (快取儲存)
  ```
- **生成新房屋時**：
  直接實例化快取的 `BufferGeometry`：
  ```typescript
  const house = new THREE.Group();
  for (const part of cachedArchetype.parts) {
    house.add(new THREE.Mesh(part.geometry, part.material));
  }
  ```
  - 幾何體內存共用（全城 100 棟 `Residential_2x2` 共用同一份 VRAM 頂點緩衝區）。
  - 生成時間降至趨近於零（$\approx 0.001\text{ms}$）。

#### 37.3 材質分組規範 (Multi-Material Grouping)
因單一 WebGL Mesh 僅能綁定一個 Material（或 Material Group），依材質分為 4~6 個合併網格：
1. **結構外牆 (Stucco & Stone)**：象牙白/暖沙灰泥外牆、地基石台水線。
2. **屋頂系統 (Roofs)**：石板深灰瓦、西班牙陶瓦、屋脊瓦飾條。
3. **木質構件 (Wood & Fences)**：雪松木板、暗色深木樑柱、美式白木柵欄。
4. **地坪景觀 (Hardscape & Greens)**：草皮、車道石板、樹幹、低多邊形樹冠、修剪矮籬。
5. **半透明採光窗 (Glass & Translucents)**：天窗玻璃（需設 `transparent: true`, `depthWrite: false`）。
透過以上分組，單棟房屋 Draw Call 固定於 5 次以內，全城 100 棟房屋 Draw Call 控制在 500 次以下。

---

### 39. 市民上班通勤系統、就業職缺配對與人車交互動線技術實作

#### 39.1 工廠職缺與人數雙指標資料結構
- 在 `PlacedBuilding` 資料結構中，工業建築類別（`metadata.category === 'Industrial_Low'`）維護兩項獨立指標：
  1. **入職人數 (`employedWorkerIds: string[]`)**：
     已簽約或被分配至該工廠之市民 ID 清單，其上限受限於該建築物型號之容量 `metadata.capacity`。
  2. **現在內部人數 (`currentOccupants: number`)**：
     目前實體人在工廠建築物內部的工人數。當市民尚在步行或開車路上時，內部人數不遞增；當市民步行動態走抵工廠大門後，內部人數立即 $+1$。市民下班返家後，內部人數 $-1$。
- **懸停 Tooltip 與 DevMenu 顯示規範**：
  - 3D 懸停 Tooltip 即時顯示：`💼 入職人數: X / Y 人` 與 `👥 現在內部人數: Z 人`。
  - 清單卡片顯示：`🏭 工廠名 (規格) | 入職: X/Y人 | 內部: Z人`。

#### 39.2 50% 交通方式決策與無車降級演算法
- 演算法流程：
  ```
  [隨機選取一位在家的市民]
             │
             ▼
  [隨機 50% 擲骰: rollDrive]
        ├── 50% true (開車) ──► 檢查住宅名下是否有 available 車輛
        │                            ├── 有: mode = 'drive', 借出車輛
        │                            └── 無: 自動降級為 mode = 'walk'
        └── 50% false (步行) ─► mode = 'walk'
  ```
- **狀態轉換**：
  - 市民離開住宅：`homeBuilding.currentOccupants = Math.max(0, homeBuilding.currentOccupants - 1)`
  - 市民活動狀態：`citizen.currentActivity = 'CommutingToWork'`

#### 39.3 多段人車動線生命週期 (Multi-stage Commute Pipeline)
1. **步行模式 (`mode === 'walk'`)**：
   - 透過 `findBestRoadPath(homeTile, factoryTile)` 擷取路網轉向點與人行道座標序列。
   - 實例化市民 3D 模型（`CitizenModelFactory.createCitizen`），沿路網走至工廠大門。
   - 抵達工廠大門觸發 `onArrivedDestination`，移除行人模型，`factory.currentOccupants += 1`，市民狀態切換為 `AtWork`。
2. **開車模式 (`mode === 'drive'`)**：
   - **階段 A (走去上車)**：市民自住宅門前生成，步行走至車輛停放處（`carSpotPos`）。抵達後觸發回調，解除路側停車位佔用（`parkingManager.removeParkedCar`）。
   - **階段 B (行駛前往)**：以 `vehicleManager.spawnMovingInVehicle` 生成行車，設定 `keepMeshOnArrive = true`，沿連續車道巡航至工廠所在路段。
   - **階段 C (就近找停車位)**：以工廠前門座標 `factory.frontWorldPos` 呼叫 `parkingManager.findClosestAvailableSpot` 尋找最近之合法路邊停車格。
   - **階段 D (停車入庫)**：呼叫 `parkingManager.parkExistingCarMesh` 將車輛網格就近停入該格位，更新車輛停泊紀錄。
   - **階段 E (下車入廠)**：市民自停車格位路緣下車生成 3D 行人，步行進入工廠大門。抵達大門後行人模型隱藏，`factory.currentOccupants += 1`，市民狀態切換為 `AtWork`。

#### 39.4 一鍵召回返家機制 (`recallAllCitizensToResidence`)
- 清理所有在途歩行的行人 3D Mesh，防止殘留幽靈行人。
- 遍歷所有市民：
  - 若市民處於上班中（`AtWork`），扣除對應工廠內部人數。
  - 若市民借出名下車輛（`currentVehicleId` 存在），移除工廠路側停車格之車輛，重新將車輛以路邊停車方式停泊於其住宅門前，恢復 `available`。
  - 市民重設為 `AtHome`，住宅 `currentOccupants += 1`。


#### 38.1 低密度工業分區規格與可視化渲染
- **分區枚舉擴充**：
  `ZoneType` 擴展支援 `'Industrial'`（與 `'Residential'`、`'None'` 並列）。
- **調色盤定義**：
  採用工業標準琥珀黃（Amber）：
  - 網格預設材質：`industrialMat`（`color: 0xf59e0b`, `roughness: 0.85`）。
  - 筆刷懸停材質：`hoverMatIndustrial`（`color: 0xfbbf24`, `opacity: 0.6`）。
  - 框選填充與邊框材質：`boxFillMatIndustrial`（`0xf59e0b`, `opacity: 0.35`）與 `boxBorderMatIndustrial`（`0xd97706`, `opacity: 0.9`）。
- **路側自動網格生成**：
  每個路側可規劃地塊大小固定為 $0.5\text{m} \times 0.5\text{m}$（`CELL_SIZE = 0.5`）。`ZoningManager.commitBoxSelection` 或單擊筆刷即將指定座標之地塊標記為 `'Industrial'`。

#### 38.2 四款程序化工業建築 3D 建模與參考圖考究

| 模型 ID | 名稱 | 網格規格 (面寬 x 進深) | 實體尺寸 (寬 x 深) | 工作人數上限 | 核心特徵與細節 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Industrial_4x4` | 小型工廠 4x4 | $4 \times 4$ 格 | $2.0\text{m} \times 2.0\text{m}$ | **3 人** | 橘紅外牆浪板工坊、斜頂單坡石板屋脊、黃黑條紋磚石煙囪、高位採光窗、室外水泥硬化地坪、雙柱車輛維修升降台（置有檢修輪胎）、維修工具推車與車床桌面、多層零配件貨架、彩色機油桶、地面千斤頂與工業鐵絲網防護欄。 |
| `Industrial_5x5` | 維修廠 5x5 | $5 \times 5$ 格 | $2.5\text{m} \times 2.5\text{m}$ | **4 人** | 暖黃灰泥主體配暗紅踢腳抗污基座、高強度金屬捲門、高架傳輸/裝卸斜坡道（附雙側夜間防爆壁燈）、傾斜大面積溫室鋼架天窗（透光藍色玻璃）、屋頂金屬防護圍欄與 HVAC 空調機組、橫跨頂部的深藍色排氣通風管道連至外側機房、右側雙層控制塔樓、落地貨箱棧板堆疊與交通警示錐。 |
| `Industrial_5x6` | 物流倉庫 5x6 | $5 \times 6$ 格<br>(**5m 貼馬路**) | $2.5\text{m} \times 3.0\text{m}$ | **4 人** | 磚紅耐磨倉儲主樓體、亮黃色折線門頭挑簷與立體黃色「WAREHOUSE」招牌、3 座標準裝卸月台（1 號靠泊全尺寸白色半掛貨櫃車、2 號液壓升降月台板、3 號安全步梯）、工作區堆高機、快遞配送小廂車、進出口警衛崗亭與起落道閘、外圍金屬圍網與修剪整齊的綠化樹籬。 |
| `Industrial_6x6` | 中型工廠 6x6 | $6 \times 6$ 格 | $3.0\text{m} \times 3.0\text{m}$ | **7 人** | 雙聯深紅階梯式重型製造廠房、屋頂 8 具矩陣式冷凝冷卻器、雙聯高達 $1.70\text{m}$ 圓柱形混凝土排氣煙囪（配白色與金黃航空警示環帶）、正面進風過濾除塵方塊、深藍色製程塔樓（附檢修直梯與立體黃色輸送管路）、三相油浸式變電單元、寬敞內部車道與斜角劃線停車位（停泊紅色卡車）、實心水泥安全防護高牆與道路照明燈柱。 |

- **正面臨路朝向規範**：
  所有 4 款模型的門戶、車道與貨物裝卸月台在本地座標系中統一朝向 $+Z$ 軸。當建地選定時，`BuildingManager` 依據相鄰道路的方向計算旋轉角：
  - 南側鄰路（`S`）：$\text{rotation.y} = 0$
  - 北側鄰路（`N`）：$\text{rotation.y} = \pi$
  - 東側鄰路（`E`）：$\text{rotation.y} = -\frac{\pi}{2}$
  - 西側鄰路（`W`）：$\text{rotation.y} = \frac{\pi}{2}$
  確保所有工業建築正面 100% 緊貼相鄰的行車道。

#### 38.3 工業建地搜尋與自動起建演算法 (`BuildingManager.buildIndustrialBuilding`)
- **地塊類型隔離**：
  在 `canFitModelAt(site, meta)` 中，依 `meta.category` 嚴格判定：
  - 若 `category === 'Industrial_Low'`，目標格子之 `zoneType` 必須為 `'Industrial'`。
  - 若 `category === 'Residential_Low'`，目標格子之 `zoneType` 必須為 `'Residential'`。
  杜絕住宅蓋在工業區或工廠侵入住宅區。
- **正面臨路與公路連通檢驗**：
  建地搜尋演算法要求：
  1. 待建矩形區域內所有 $W \times D$ 格子皆為未被佔用之對應分區格子。
  2. 矩形朝向馬路那一側的格子，必須緊鄰一條雙向車道（`facingLane` 存在）。
  3. 該車道必須具備直達城市邊界外聯公路的雙向路徑（`hasPathFromHighway`）。
- **即時起建與施工狀態切換**：
  為供開發者快速檢驗與配置，`buildIndustrialBuilding` 生成建築後直接將其標記為 `status = 'completed'`、`constructionProgress = 1.0`，並將建築主體恢復正常高度（$y=0$）、隱藏施工鷹架與吊臂。

#### 38.4 開發者工具 (DevMenu) 工業建造模組
- **模型展台擴充**：
  `#dev-model-select` 新增 `<optgroup label="低密度工業區模型 (正面朝向 +Z 馬路)">`，可在 3D 展台中切換檢視並顯示工作人數上限。
- **即時起建控制卡片**：
  - `⚡ 立即檢查並起建工業建築 (自動配對)`：自動於已劃分之工業區內尋找可容納之最大或隨機適配尺寸。
  - 4 個獨立按鈕分別支援指定起建 4x4、5x5、5x6、6x6。
  - 實時狀態回饋：無地塊、無臨路、或起建成功之座標與職缺數。
- **清單與數據解耦**：
  `DevMenu.updateHousingUI` 分別維護：
  - 住宅統計：已建住宅棟數、總居住人口（`getTotalPopulation`）。
  - 工業統計：已建工廠棟數（`getIndustrialBuildings().length`）、提供職缺上限（`getTotalIndustrialCapacity().totalCapacity`）。

---

### 第 40 章：T 字與十字路口 180° 淚滴型迴轉車道拓撲、A* 阻抗權重與對向主動禮讓系統

#### 40.1 180° 淚滴型迴轉曲線 (Teardrop Curve) 幾何與拓撲生成
- **路口尺寸與車道偏移行寬**：
  路塊大小為 $2.0\text{m} \times 2.0\text{m}$，中心點為 $(g_x, g_z)$。在雙向二線道配置下，車道偏移行距設為 `LANE_OFFSET = 0.28m`。
- **淚滴形 7 點控制曲線幾何**：
  為避免車輛在路口狹窄空間進行 180° 掉頭時發生突兀的硬轉向折角，採用 7 點淚滴平滑軌跡（Teardrop Curve）。各方向（以北進為例，入口於北 $Z = g_z - 1.0$、出口於北 $Z = g_z - 1.0$）：
  1. $P_0: (g_x - 0.28, 0.04, g_z - 1.0)$ —— 入境停止線吻合點
  2. $P_1: (g_x - 0.28, 0.04, g_z - 0.25)$ —— 直行進入路口緩衝段
  3. $P_2: (g_x - 0.16, 0.04, g_z + 0.18)$ —— 切入中央外擺弧線
  4. $P_3: (g_x, 0.04, g_z + 0.28)$ —— 淚滴頂部對稱極值點
  5. $P_4: (g_x + 0.16, 0.04, g_z + 0.18)$ —— 收斂過渡點
  6. $P_5: (g_x + 0.28, 0.04, g_z - 0.25)$ —— 切入出境直線
  7. $P_6: (g_x + 0.28, 0.04, g_z - 1.0)$ —— 出境路緣吻合點
- **分段轉角平滑度**：
  每段前進位移時，朝向角變換均勻控制在 $25^\circ \sim 35^\circ$ 以內，車輛旋轉矩陣在每一模擬訊框平滑過渡，完全杜絕 3D 模型旋轉跳變或數值 NaN。
- **無縫跨路塊拓撲縫合**：
  $P_0$ 與上游直行車道之 `exitPoint` 距離小於 $0.001\text{m}$，$P_6$ 與下游離境車道之 `entryPoint` 距離小於 $0.001\text{m}$。在階段 2 的自動鄰接縫合中（距離差容差 $< 0.08\text{m}$），保證 100% 自動串入全城車道有向圖（`connectedNextLaneIds`）。

#### 40.2 A* 尋路演算法阻抗懲罰 (Penalty Cost) 機制
- **常態震盪問題**：
  若僅計算車道實體歐幾里得幾何長度，淚滴迴轉長度僅約 $1.6\text{m}$。在路網搜尋時，若稍微遇有目標後退或啟發函數偏差，容易造成自走車輛頻繁於路口掉頭折返。
- **交通工程等效阻抗設計**：
  在 A* 邊權重累加過程中加入阻抗偏好矩陣：
  $$w_{\text{edge}} = d_{\text{waypoints}} + P_{\text{uturn}}$$
  其中 $P_{\text{uturn}} = 4.0\text{m}$（相當於 2 格完整道路模組的等效通行阻抗，符合實務上車輛迴轉需減速慢行與停等之通行成本）。
- **數值效果驗證**：
  - **需要掉頭時**：直接在最近路口迴轉代價為 $1.6\text{m} + 4.0\text{m} = 5.6\text{m}$；若穿過路口繞行至下一個死巷再掉頭，路徑代價為 $2.0 + 2.0 + 1.5 + 2.0 + 2.0 = 9.5\text{m}$。$5.6 < 9.5$，A* 毫不猶豫優先選用最近路口迴轉。
  - **常態直行時**：直行穿越路口代價為 $2.0\text{m}$，遠小於迴轉的 $5.6\text{m}$，徹底杜絕無故掉頭震盪。

#### 40.3 路口對向衝突主動禮讓 (Yield to Oncoming Traffic)
- **路權位階判定**：
  依據道路交通安全規則，路口迴轉車路權最低，必須禮讓對向直行與轉彎車輛。
- **衝突對象流向映射**：
  - 北向進迴轉（`N_to_N`）：衝突對象為南向進直行/轉彎車（`_S_to_`）
  - 南向進迴轉（`S_to_S`）：衝突對象為北向進直行/轉彎車（`_N_to_`）
  - 東向進迴轉（`E_to_E`）：衝突對象為西向進直行/轉彎車（`_W_to_`）
  - 西向進迴轉（`W_to_W`）：衝突對象為東向進直行/轉彎車（`_E_to_`）
- **雙重前瞻探測**：
  1. 自車探測：若自車已在迴轉車道上，或行駛路徑前瞻 6 個點內即將進入迴轉車道。
  2. 他車探測：遍歷同路口範圍內對向流的車輛，或其前瞻路徑（未來 8 個點內）即將切入同路口的對向車輛。
- **動態停等決策**：
  - 當對向車輛距離小於 $3.2\text{m}$ 時，將自車之迴轉目標速限設為 $0$，最大允許位移鎖定為 $\max(0, \text{dist} - 1.2)$，車輛於路口停止線或迴轉前置段平滑煞停，狀態標記為 `WaitingLight`。
  - 當對向車離開路口衝突區後，禮讓目標速限自動釋放，車輛依平滑加速度曲線加速通過。
  - **雙迴轉互不干擾免讓**：若對向車輛亦為迴轉車（`isUTurn === true`），兩者分別運行於各自半幅的淚滴弧線，偵測判斷自動略過，允許雙車同時迴轉。

#### 40.4 車道隊列 (Lane Queue) 與路口號誌整合
- **號誌同調性**：
  迴轉車道所受之號誌控制器與其入口臂相同：
  - `N_to_N`、`S_to_S` 受 `northSouth` 號誌管控。
  - `E_to_E`、`W_to_W` 受 `eastWest` 號誌管控。
  綠燈時方可啟動迴轉程序，紅燈時於標準路口停止線（`isStopLine = true`）前停等。
- **隊列感知與跟車融合**：
  迴轉車在進入路口前作為所屬入口車道的隊列一員，透過 `findLeadVehicle` 自適應調整跟車間距；一旦進入路口內部，則獨立遵循路口限速（$6.5\text{m/s}$）與對向禮讓機制。

#### 40.5 T 字路口 (ThreeWay) 與十字路口 (FourWay) 拓撲自動適配性
- **動態生成適配**：
  在 `RoadNetwork.rebuildLaneGraph()` 中，由連接臂布林值（`hasN`, `hasS`, `hasE`, `hasW`）嚴格守護。
  - 只有存在的路口臂才會呼叫 `addIntersectionUTurnLane` 生成對應迴轉車道。
  - 在 T 字路口中，若某一側為無路端（如無東側臂），則 `lane_0_0_E_to_E` 絕對不會生成。
  - 在 T 字路口的丁字主幹突出端（Stem，如西進），因對向完全無東向路塊，因此對向直行流前綴 `_E_to_` 永遠為空，西向進車輛於綠燈時無需遭受不存在的對向虛擬車流阻擋，轉向順暢無阻。

---

### 41. 行人專屬路網拓撲、立體高架人行道與斑馬線 A* 尋路規劃系統 (PedestrianNetwork)

#### 41.1 設計動機與人車分流核心哲學
- **問題背景**：
  在前期版本中，市民步行上班誤用車道層級的行車路網（`RoadNetwork.lanes` 與 `Pathfinding.findShortestPath`），導致市民步行於車道正中央（偏移行車線 $0.28\text{m}$、高度 $0.018\text{m}$），不僅視覺上與車流產生穿模碰撞，且在單行道/迴轉道邏輯下產生非自然的步行繞行。
- **解耦人車網絡架構**：
  在交通工程與城市模擬中，車道為**單向有向圖**（Directed Lane Graph，受車道劃分、轉彎箭頭、單行規則與迴轉限制管控）；而行人路網本質為**雙向無向圖**（Undirected Sidewalk & Crosswalk Graph，市民可在兩側人行道自由雙向行走，並於路口斑馬線橫越馬路）。
- **實體與幾何參數對齊**：
  - 道路寬度：$2.0\text{m} \times 2.0\text{m}$ 網格。
  - 立體高架人行道頂部面高：$y = 0.07\text{m}$（較車道 $0.035\text{m}$ 抬高 $0.035\text{m}$ 形成立體路緣石階）。
  - 人行道中心偏離道路中線：$\text{swCenter} = 0.89\text{m}$（覆蓋 $0.78\text{m} \sim 1.00\text{m}$，寬度 $0.22\text{m}$）。
  - 斑馬線穿越道面高：$y = 0.045\text{m}$（微抬高於車道 $0.035\text{m}$，確保市民腳底與枕木紋精確咬合防穿模）。

#### 41.2 多路型行人拓撲生成機制
1. **直線道路 (`Straight`) 與盡頭路段 (`DeadEnd`)**：
   - 兩側平行鋪設雙向人行道（Side A 位於局部 $x = -0.89$，Side B 位於局部 $x = +0.89$）。
   - 每側配置 3 點拓撲（入口邊界 $z = -1.0$、中間節點 $z = 0.0$、出口邊界 $z = +1.0$）。
   - 在盡頭路段（`DeadEnd`）之無路端點，自動生成行人橫跨路底之穿越道，確保死巷底部兩側人行道雙向連通。
2. **十字路口 (`FourWay`)**：
   - 四個轉角處配置人行廣場小平台（NW、NE、SW、SE，局部座標 $(\pm 0.89, \pm 0.89)$）。
   - 轉角小平台向外無縫接合相鄰四面路塊邊界的人行道端點。
   - 橫跨四個路口切面生成 4 處斑馬線行人穿越道（標記 `isCrosswalk: true`），中間點採樣對齊純白枕木紋。
3. **T 字路口 (`ThreeWay`)**：
   - 無路開口側（如基準西側）生成全長 $2.0\text{m}$ 連續直通高架人行道（5 點連續序列），車輛無法轉入但行人暢行無阻。
   - 支線開口側配置 2 座角落平台，並生成 3 處路口斑馬線穿越道（直道兩端與支線進入處）。
4. **90度彎道 (`Corner`)**：
   - 外側轉角（西側至北側）生成 5 節點平滑弧形轉彎人行道。
   - 內側轉角（東南角）生成內側轉折平台，完美縫合相鄰道路內外兩側動線。

#### 41.3 跨路塊毫米級節點融合 (Millimeter-Quantized Node Stitching)
- **接縫問題與傳統斷裂**：
  若每塊道路獨立持有節點，路塊接縫處端點座標極微小浮點數誤差（如 $1.0000001$ vs $0.9999999$）會導致圖遍歷斷裂。
- **量化哈希鍵值公式**：
  $$\text{nodeKey}(x, z) = \text{"p\_"} + \text{round}(x \times 100) / 100 + \text{"\_"} + \text{round}(z \times 100) / 100$$
- **自動縫合保證**：
  路塊 A 的南邊界西側端點 $(gx - 0.89, 0.07, gz + 1.0)$ 與相鄰路塊 B 的北邊界西側端點 $(gx - 0.89, 0.07, (gz + 2) - 1.0)$ 在量化哈希下具有**完全相同的鍵值**。全城數百格道路於圖構建完成瞬間，相鄰人行道自動縫合為單一連通圖，無需昂貴的鄰接重疊搜索。

#### 41.4 行人 A* 搜尋與斑馬線阻抗模型
- **A* 權重函數**：
  $$g(v) = g(u) + d(u, v) + P_{\text{crosswalk}}$$
  其中 $P_{\text{crosswalk}} = 0.8\text{m}$（若該邊為穿越車道之斑馬線，施加 $+0.8\text{m}$ 等效通行阻抗）。
- **工程效果**：
  - **同側通行**：若起點與終點位於街道同一側，A* 優先沿本側人行道直通，絕對不會在沒有必要時隨機橫跨馬路到對面再橫跨回來。
  - **跨街需求**：若目標位於對側，A* 自動選用距離最近之路口斑馬線過街，路徑自然、美觀且符合人類步行習慣。

#### 41.5 門對門人行動線 (Door-to-Door Pedestrian Routing)
- **航點五階段流水線**：
  1. `homeDoor`：住宅房門口（$y = 0.04\text{m}$）。
  2. `homeGate`：住宅庭院圍欄大門（$y = 0.07\text{m}$，對接人行道路緣）。
  3. `sidewalkEntry -> ... -> sidewalkExit`：A* 最短人行路網動線（含轉角小平台與斑馬線，$y = 0.07\text{m}$ 與 $0.045\text{m}$）。
  4. `factoryGate`：工廠廠區外大門（$y = 0.07\text{m}$）。
  5. `factoryDoor`：工廠作業廠房大門（$y = 0.04\text{m}$）。
- **動態微步防抖**：
  通過 `deduplicateWaypoints` 自動過濾點間距小於 $0.03\text{m}$ 之微小接縫點，防止市民行進時發生角度微顫。

---

### 42. 行人號誌感知狀態機與轉彎車輛禮讓行人防死鎖機制 (Pedestrian Signal & Turn-Yield Deadlock Prevention)

#### 42.1 行人號誌幾何映射與對稱控制原理
- **路口號誌相位**：
  路口紅綠燈擁有兩個主相位：`northSouth`（南北向車流通行）與 `eastWest`（東西向車流通行）。
- **斑馬線橫跨幾何與受控號誌相推導**：
  - **橫跨北/南口切面（Arm 'N' / 'S'，即 $Z \approx gz \pm 0.89$）**：
    橫切南北向車道。當南北向車流為紅燈時（即 `eastWest` 綠燈），該斑馬線安全放行；故北/南斑馬線行人號誌綠燈相綁定為 `eastWest`。
  - **橫跨東/西口切面（Arm 'E' / 'W'，即 $X \approx gx \pm 0.89$）**：
    橫切東西向車道。當東西向車流為紅燈時（即 `northSouth` 綠燈），該斑馬線安全放行；故東/西斑馬線行人號誌綠燈相綁定為 `northSouth`。
- **幾何判定公式**：
  $$\Delta x = P_{\text{crosswalk}}.x - gx, \quad \Delta z = P_{\text{crosswalk}}.z - gz$$
  $$\text{if } |\Delta z| > |\Delta x| \implies \text{arm} = (\Delta z < 0 ? \text{'N'} : \text{'S'}), \quad \text{signal} = \text{'eastWest'}$$
  $$\text{else} \implies \text{arm} = (\Delta x < 0 ? \text{'W'} : \text{'E'}), \quad \text{signal} = \text{'northSouth'}$$

#### 42.2 行人紅綠燈停等狀態機
- **路緣石判定點**：
  當行人抵達人行道路緣石（`currentWaypointIndex` 指向斑馬線航點且當前未進入過馬路狀態 `!ped.isCrossingCrosswalk`）：
  1. 檢驗該斑馬線所屬路口之受控號誌狀態：`signalState[pedestrianSignal]`。
  2. 若 `signal !== 'green'`（紅燈或黃燈）：
     - 設定 `ped.isWaitingLight = true; ped.isCrossingCrosswalk = false;`。
     - 呼叫 `CitizenModelFactory.resetCitizenPose(ped.mesh)` 重置為雙腿立正之自然停等姿態。
     - 旋轉朝向斑馬線目標點，本幀不前進位移，不累積 `walkTimer`。
  3. 若 `signal === 'green'`（綠燈）：
     - 設定 `ped.isWaitingLight = false; ped.isCrossingCrosswalk = true;`。
     - 紀錄目前穿越之 `crossingIntersectionKey` 與 `crossingArm`。
     - 市民踏上斑馬線邁步過街。
  4. 穿越過程中號誌變色保護：
     - 行人一旦踏入斑馬線，即進入穿越馬路中狀態，不因號誌中途變黃/變紅而滯留在車道中央。
     - 登上對側人行道後，下一航點 `isCrosswalk === false`，自動重置 `ped.isCrossingCrosswalk = false`。

#### 42.3 轉彎車輛禮讓行人與路口外部防死鎖機制 (Turn-Yield & Deadlock Prevention)
- **衝突場景**：
  南北向車輛綠燈放行時，若車輛右轉進入東口（`lane_N_to_E`），東口斑馬線橫跨東西向，此時東西向車流紅燈，行人號誌為綠燈，市民正合法橫越東口斑馬線。車輛轉入時會直接衝撞斑馬線上的行人。
- **傳統進入後煞停的死鎖缺陷 (Box Block Deadlock)**：
  若轉彎車在駛入路口內部後才發現斑馬線有人而停在路口中央，車尾將橫阻直行車道，引發整個路口十字/T字網格車流連環鎖死（Gridlock）。
- **外部停止線制動解決方案**：
  - **前瞻轉向探測**：
    車輛在接近路口停止線時，從前方路徑中解析路口轉向車道之 `fromDir` 與 `toDir`。
    若 `fromDir !== toDir` 且非直行（即右轉、左轉或迴轉），判定為轉向車輛。
  - **目標路口臂行人跨越查詢**：
    調用 `buildingManager.isPedestrianCrossingCrosswalk(stopWp.intersectionKey, toDir)`。
    若目標臂之斑馬線上有行人正在穿越：
    $$v.\text{isYieldingToPedestrian} = \text{true}$$
    $$\text{mustHoldAtStopLine} = \text{true}$$
  - **停止線外絕對禁止駛入**：
    轉彎車強制在**路口停止線前煞停停等**，完全禁止進入路口內部，路口黃網線內部空間保持 100% 淨空。直行車輛可順暢通行，對向車流亦不受任何干擾。
  - **行人放行起步**：
    行人全數通過斑馬線登上對側人行道後，`isPedestrianCrossingCrosswalk` 回傳 `false`，轉彎車解除管制，平滑加速駛入路口並完成轉彎。
- **近距離防撞備援 (Proximity Safety Fallback)**：
  在車輛行駛中（包括車輛已在路口內或直行遇突發狀況），配合 `findPedestrianAhead(vehiclePos, headingY, 2.2)` 錐體前向檢測，若車頭前方 $2.2\text{m}$ 內有行人橫越，主動緊急減速避讓，確保行車絕對安全。

---

### 43. 外環道路進城車輛雙向隨機進入機制 (Bilateral Random Inbound Traffic Mechanism)

#### 43.1 原單向進入之成因診斷
- **外環公路佈局**：
  地圖南界 $Z = 97$ 橫貫東西聯外公路，西端起點入口為 `lane_-99_97_E`（$X = -99$ 向東行駛），東端起點入口為 `lane_99_97_W`（$X = 99$ 向西行駛）。
- **原先演算法的距離短路偏斜 (Shortest-Distance Deterministic Bias)**：
  在原 `dispatchCitizenVehicle` 實作中：
  ```typescript
  if (westEntry) {
    const pW = Pathfinding.findShortestPath(westEntry.id, lane.id, allLanes);
    if (pW && pW.routeWaypoints && pW.routeWaypoints.length >= 2) lanePath = pW;
  }
  if (eastEntry) {
    const pE = Pathfinding.findShortestPath(eastEntry.id, lane.id, allLanes);
    if (pE && pE.routeWaypoints && pE.routeWaypoints.length >= 2) {
      if (!lanePath || pE.totalDistance < lanePath.totalDistance) lanePath = pE;
    }
  }
  ```
  當城市與外環公路交會於特定的路口（例如中央偏西或偏東之道路）時，由西側進口行駛至該路口的距離 $D_{\text{West}}$ 與由東側進口行駛至該路口的距離 $D_{\text{East}}$ 乃靜態決定。若 $D_{\text{West}} < D_{\text{East}}$，則 `pE.totalDistance < lanePath.totalDistance` 永遠為 `false`，導致所有車輛 100% 確定性自西側湧入；反之亦然。

#### 43.2 雙向路徑解耦評估與隨機決策架構
- **兩端入口獨立尋路評估器 (`findBestPathForEntry`)**：
  將西側進口與東側進口之導航計算徹底解耦，分別獨立評估從該入口駛往目的地路塊的可用路徑，區分「首選停車側車道（`isPreferred: true`）」與「備援退回車道（`isPreferred: false`）」：
  ```typescript
  const westResult = findBestPathForEntry(westEntry);
  const eastResult = findBestPathForEntry(eastEntry);
  ```
- **雙向隨機權重決策 (Stochastic Entrance Selection)**：
  1. **兩側均具備相同優先級（正常雙向連通環境）**：
     若 `westResult.isPreferred === eastResult.isPreferred`，表示西側與東側皆能順利開入順向停車車道（或皆退回次選車道），此時以 50% 等機率均勻隨機選擇：
     $$\text{bestPath} = (\text{Math.random()} < 0.5) \; ? \; \text{westResult.path} : \text{eastResult.path}$$
  2. **單側優先級較優（路緣方向約束）**：
     若僅其中一側路網拓撲能順向停靠首選車道，以具備順向停車優勢者優先，確保車輛順行靠邊入位體驗不劣化。
  3. **非對稱/單向連通備援**：
     若玩家拆除某一路段或建造單向道路致使僅一側可通，`westResult` 或 `eastResult` 其中之一為 `null`，則系統平滑降級採用唯一可行者，絕不發生派車失敗或遷入停滯。
- **全域外聯進城車道統一隨機化 (`RoadNetwork.getExternalSpawnLane`)**：
  同步修正 `RoadNetwork` 的公開介面 `getExternalSpawnLane()`，當西側與東側入口均存在時，隨機選取西向或東向車道回傳，消除全局任何潛在的單側固定偏斜。



---

### 44. 行人上車行人尋路系統與路緣登車動線架構 (Pedestrian Boarding Pathfinding Architecture)

#### 44.1 原始直線斜切缺陷診斷 (Straight-Line Diagonal Walk Defect)
- **問題現象**：
  在早期通勤實作中，當市民選擇開車通勤時，系統以：
  ```typescript
  const walkToCarWaypoints = [
    homeBuilding.frontWorldPos.clone(),
    carSpotPos.clone(),
  ];
  ```
  直接產生兩點直線位移，且缺乏 `routeWaypoints` 號誌屬性。
- **物理不合理性**：
  路邊停車位往往因門前滿位而向外擴展搜尋至鄰近街區或對向車道。當車輛停放在數公尺甚至數十公尺外時，市民直接以直線斜切穿透鄰家建築地塊、草皮與機動車道走至車輛，既無視人行道幾何，亦無視十字路口紅綠燈管制與轉彎車輛禮讓，視覺嚴重穿模且違反交通邏輯。

#### 44.2 登車尋路演算法與幾何吸附 (`findPathToCar`)
1. **起點門對門序列 (Door-to-Gate)**：
   - 起點房門 (`homeDoor`)：自建築幾何中心向正門內插 $0.45$，高度 $y = 0.04\text{m}$。
   - 外庭大門 (`homeGate`)：建築外側臨路點，高度提升至立體高架人行道高度 $y = 0.07\text{m}$。
2. **路緣車側上車點投影計算 (Curb-to-Sidewalk Projection)**：
   車輛中心停靠於路緣石旁（車身中心距道路中線 $0.62\text{m}$），人行道中心距道路中線為 $0.89\text{m}$，橫向位移差值恰為：
   $$\Delta_{\text{offset}} = 0.89\text{m} - 0.62\text{m} = 0.27\text{m}$$
   依車位方位 `side` 精準投影至人行道幾何中心：
   $$\text{sidewalkBoarding} = \begin{cases}
     (x - 0.27, 0.07, z) & \text{side = 'west'} \\
     (x + 0.27, 0.07, z) & \text{side = 'east'} \\
     (x, 0.07, z - 0.27) & \text{side = 'north'} \\
     (x, 0.07, z + 0.27) & \text{side = 'south'}
   \end{cases}$$
3. **立體人行道 A* 尋路與邊緣吸附**：
   - 透過 `preferSidewalkEnds: true`，在 `findClosestNode` 中過濾掉位於車道中央之斑馬線節點，確保起點與終點精準吸附於人行道邊緣。
   - 調用 `findShortestPath(homeGate, sidewalkBoarding)`，自動跨越多個路塊、繞行直角轉彎道，並在跨越路口時依循斑馬線拓撲。
4. **登車步降 (Step-down to Vehicle)**：
   在序列終端追加車輛底盤門邊登車點 `carBoarding` ($y = 0.02\text{m}$)，使行人於人行道側抵達車旁後，邁步下階登入車身，隨後觸發 `onArrivedDestination`，達成無縫開車出發。
5. **去重與號誌繼承 (Deduplication & Signal Preservation)**：
   相鄰小於 $0.03\text{m}$ 之過近航點自動融合，同時完整保留 `isCrosswalk`、`isCrosswalkStart`、`intersectionKey`、`crosswalkArm` 與 `pedestrianSignal` 號誌相屬性。

#### 44.3 號誌聯動與安全禮讓整合 (Signal & Yielding Integration)
- **紅綠燈停等**：
  若市民走向車輛途中需穿越馬路，抵達路緣石時若號誌為紅燈，市民自動觸發 `ped.isWaitingLight = true` 於路緣停等，綠燈放行後方踏入斑馬線橫越。
- **轉彎車輛防撞禮讓**：
  行人於過馬路期間處於 `ped.isCrossingCrosswalk = true`，轉彎車輛在路口停止線檢測到有行人正走向車輛穿越該路口臂斑馬線時，強制在停止線前停等，徹底避免路口死鎖與碰撞穿模。
- **下車進廠對稱尋路 (`findPathFromCarToBuilding`)**：
  同步實作車輛抵達工廠停車後，市民自停靠車側登臨人行道、沿人行道尋路安全進入工廠之對稱尋路機制。


---

### 45. 靠右行駛路邊車位起步與目的地停車判定架構 (Right-Hand Traffic Curbside Departure & Arrival Architecture)

#### 45.1 瞬移缺陷診斷 (Cross-Lane Teleportation Defects)
1. **起步出發跨車道瞬移 (Departure Teleportation)**：
   - 舊版 `findBestRoadPath` 遍歷出發地路塊的所有車道，挑選到達目的地 A* 距離最短的車道。
   - 若車輛停放於西側路緣（朝南），目的地工廠位於北方，系統判定北向車道（東側）距離最短，因此讓車輛直接自東側北向車道起步，造成市民一上車，車身瞬間橫越對向車道與雙黃線瞬移。
   - 舊版導航路徑以車道起點為首個節點，當車位位於車道中段或前段時，車身會往後瞬移回車道端點。
2. **抵達停車逆向跨車道瞬移 (Arrival Teleportation)**：
   - 舊版車輛抵達工廠路塊時，`findClosestAvailableSpot(frontWorldPos)` 僅以幾何歐氏距離評估車位。
   - 若工廠位於道路對側（左側），西側車位離工廠大門最近，系統直接回傳西側車位，使順向（東側）行駛的車輛瞬間橫越對向車道雙黃線停入西側，且車頭 180 度逆向調頭，嚴重違反交通法規。

#### 45.2 靠右行駛方向與路緣幾何雙向對應模型
- **行駛方向 $\to$ 順向合法路緣 (`getRightSideForDirection`)**：
  靠右行駛規則下，車道右側路緣公式定義如下：
  $$\text{RightSide}(\vec{D}) = \begin{cases}
    \text{'east'} & \vec{D} = \text{'N'} \; (Z < 0) \\
    \text{'west'} & \vec{D} = \text{'S'} \; (Z > 0) \\
    \text{'south'} & \vec{D} = \text{'E'} \; (X > 0) \\
    \text{'north'} & \vec{D} = \text{'W'} \; (X < 0)
  \end{cases}$$
- **路緣方位 $\to$ 順向起步車道 (`getDirectionForSide`)**：
  $$\text{StartDirection}(S) = \begin{cases}
    \text{'S'} & S = \text{'west'} \\
    \text{'N'} & S = \text{'east'} \\
    \text{'W'} & S = \text{'north'} \\
    \text{'E'} & S = \text{'south'}
  \end{cases}$$
- **目標建築方位 $\to$ 偏好順行車道 (`getPreferredArrivalDirection`)**：
  依據目標建築正面座標 $(P_x, P_z)$ 與道路中心 $(G_x, G_z)$ 相對幾何位置，推算可讓車位直接位於建築同側之偏好抵達車道：
  $$\text{PreferredGoalDir} = \begin{cases}
    (P_x < G_x) \; ? \; \text{'S'} : \text{'N'} & \text{南北向道路} \\
    (P_z < G_z) \; ? \; \text{'W'} : \text{'E'} & \text{東西向道路}
  \end{cases}$$

#### 45.3 起步車位平滑匯入演算法 (`attachCurbsideDeparture`)
- **零瞬移起點錨定**：
  將路徑第 0 個節點設定為車輛目前實際停放座標 $\mathbf{P}_{\text{spot}}$（$y=0.04\text{m}$）。
- **後方節點剪枝與順向匯入**：
  計算出發車道每個路徑節點 $\mathbf{W}_i$ 相對於車位的位置向量在行進方向單位向量 $\hat{\mathbf{v}}_{\text{dir}}$ 上的投影距離：
  $$d_{\text{forward}} = (\mathbf{W}_i - \mathbf{P}_{\text{spot}}) \cdot \hat{\mathbf{v}}_{\text{dir}}$$
  - 若 $d_{\text{forward}} \le 0.25\text{m}$，表示該節點位於車身後方或緊鄰車身，直接剃除，防止車輛倒退跳躍。
  - 保留前方首個節點 $\mathbf{W}_{\text{ahead}}$，車輛自車位順滑斜向匯入前進車道。

#### 45.4 目的地靠右行駛嚴格停車約束
- **抵達向量檢測**：
  在車輛到達回調 `onArrived(arrivedVeh)` 中，由最終兩個航點 $\mathbf{W}_{n-1} \to \mathbf{W}_n$ 計算位移向量 $\Delta \mathbf{P}$，判定車輛最終行駛方向 $\vec{D}_{\text{final}}$。
- **單側車位嚴格過濾**：
  $$\text{allowedParkingSide} = \text{RightSide}(\vec{D}_{\text{final}})$$
  呼叫 `findClosestAvailableSpot(homePos, preferredTileKey, allowedParkingSide)`，內部僅搜尋 `side === allowedParkingSide` 之車位。
- **對側停車安全步行穿越**：
  若車輛因單向道或無迴轉機會而在工廠對側車道抵達，車輛僅能停於其行駛方向之右側車位。市民下車後，透過 `PedestrianNetwork.findPathFromCarToBuilding` 經斑馬線與號誌安全橫越馬路進入工廠，既符合真實交通行為，亦展現立體人行步道網絡的連通價值。


---

### 46. 靠右行駛路邊車位平滑進場泊車動線演算法 (Curbside Arrival Smooth Parking Transition Algorithm)

#### 46.1 停車瞬移問題診斷 (Arrival Instantaneous Teleportation Defect)
- **現象**：車輛沿車道到達目的地終點（車道 exitPoint）後，系統以 `parkExistingCarMesh` 強制 `mesh.position.copy(spot.position)`。車輛自車道中央瞬間橫移 30cm 跳入路緣車位，缺乏真車轉向靠邊與減速進場之過渡感。
- **目標**：實現如出發上路般流暢的「由行車道斜向切出 $\to$ 平滑進入路邊車位 $\to$ 回正停妥」之過渡畫面。

#### 46.2 四階幾何泊車路徑生成演算法 (`attachCurbsideArrival`)
以靠右行駛為基準，設行駛方向單位向量為 $\hat{\mathbf{v}}_{\text{dir}} = (d_x, 0, d_z)$，則指向車道右側路緣之法向量為：
$$\hat{\mathbf{v}}_{\text{lat}} = (-d_z, 0, d_x)$$
車道中心線與路邊車位中心之橫向淨距為：
$$W_{\text{lat}} = \Delta_{\text{curb}} - \Delta_{\text{lane}} = 0.62\text{m} - 0.325\text{m} = 0.295\text{m}$$
車位正對之車道中心線基準點為：
$$\mathbf{P}_{\text{laneAtSpot}} = \mathbf{P}_{\text{spot}} - \hat{\mathbf{v}}_{\text{lat}} \cdot W_{\text{lat}}$$

路徑由四個幾何控制點構成：
1. **車道切入點 (Turn-in Point, $\mathbf{P}_{\text{turnIn}}$)**：
   在車位前方 $L_{\text{lead}} = 0.65\text{m}$ 處，位於車道中心線上：
   $$\mathbf{P}_{\text{turnIn}} = \mathbf{P}_{\text{laneAtSpot}} - \hat{\mathbf{v}}_{\text{dir}} \cdot 0.65$$
2. **斜向進場過渡點 (Diagonal Entry Point, $\mathbf{P}_{\text{mid}}$)**：
   前進至距離車位約 $0.30\text{m}$ 處，橫向朝路緣偏移 55% ($0.16\text{m}$)，形成 $\approx 25^\circ$ 斜切角：
   $$\mathbf{P}_{\text{mid}} = \mathbf{P}_{\text{laneAtSpot}} - \hat{\mathbf{v}}_{\text{dir}} \cdot (0.65 \times 0.45) + \hat{\mathbf{v}}_{\text{lat}} \cdot (W_{\text{lat}} \times 0.55)$$
3. **路緣平行對齊點 (Curb Alignment Point, $\mathbf{P}_{\text{align}}$)**：
   車身已達路緣泊車軌道（橫向偏移 100%），距最終停車點 $0.12\text{m}$：
   $$\mathbf{P}_{\text{align}} = \mathbf{P}_{\text{spot}} - \hat{\mathbf{v}}_{\text{dir}} \cdot 0.12$$
   從 $\mathbf{P}_{\text{align}} \to \mathbf{P}_{\text{spot}}$ 之行進向量為 $\hat{\mathbf{v}}_{\text{dir}} \cdot 0.12$，橫向偏移為 0，確保車輛在進入車位最後 12cm 時車頭完全回正與道路平行。
4. **最終停車位 (Final Parking Spot, $\mathbf{P}_{\text{spot}}$)**：
   $$\mathbf{P}_{\text{spot}} = \text{parkSpot.position}$$

#### 46.3 超前節點剪除防倒退機制 (Overshoot Pruning)
在原有行車導航路徑中，遍歷航點 $\mathbf{W}_i$，計算其相對於 $\mathbf{P}_{\text{turnIn}}$ 在前進方向之投影距離：
$$d_i = (\mathbf{W}_i - \mathbf{P}_{\text{turnIn}}) \cdot \hat{\mathbf{v}}_{\text{dir}}$$
若 $d_i \ge -0.1\text{m}$，表示該航點已位於切入點前方或同處，直接予以剪除，防止車輛行駛至車道盡頭後再倒車進入車位。剪除後串接四階泊車控制點，形成單調向前推進的連續軌跡。

#### 46.4 泊車平滑減速動力學 (Arrival Creep Deceleration)
在 `VehicleManager` 運動更新迴圈中，探測車輛距路徑終點之剩餘累積曲線距離 $D_{\text{remaining}}$：
$$v_{\text{arrival}} = \begin{cases}
  v_{\text{target}} & D_{\text{remaining}} \ge 3.2\text{m} \\
  \max\left(1.8\text{ m/s}, \; \sqrt{2 \cdot (0.7 \cdot a_{\text{decel}}) \cdot D_{\text{remaining}}}\right) & D_{\text{remaining}} < 3.2\text{m}
\end{cases}$$
使車輛在最後 3.2m 內平滑制動，降至 $1.8\text{ m/s}$（約 $6.5\text{ km/h}$）之怠速爬行狀態，優雅順滑地靠邊入庫停妥。


---

### 47. 導航路徑過度剪除修復與全路網節點防禦架構 (Navigation Route Pruning Fix & Full Roadway Preservation Architecture)

#### 47.1 直線飛越缺陷機制剖析 (Straight-Line Flyover Defect Analysis)
- **錯誤代碼模式**：
  在過渡性泊車銜接演算法中，原設計意圖為在目的地車道剔除超過切入點的節點。然而遍歷係自 $i=0$（路線起點，如高速公路或遠程住宅）開始：
  ```typescript
  for (let i = 0; i < drivePath.routeWaypoints.length; i++) {
    const toTurnIn = wp.position - turnInPoint;
    if (toTurnIn.dot(dirVec) >= -0.1) break; // BUG: 全局座標點乘目標車道方向！
    newRwps.push(wp);
  }
  ```
- **幾何崩潰原因**：
  $\hat{\mathbf{v}}_{\text{dir}}$ 是「目標車道」的方向向量。當起點座標與終點座標在該向量上的投影大於 0 時（如目標車道向南 $\hat{\mathbf{v}}_{\text{dir}}=(0,0,1)$，而起點高速公路在南側 $Z=97$，終點在 $Z=5$）：
  $$(\mathbf{W}_0 - \mathbf{P}_{\text{turnIn}}) \cdot \hat{\mathbf{v}}_{\text{dir}} = (97 - 4.35) \times 1 = 92.65 \ge -0.1$$
  迴圈在第 0 步即刻 `break`！
  原本由 A* 演算法生成的幾十個道路導航節點全部丟失，路徑被強制截斷為：
  $$\text{newRwps} = [\mathbf{W}_0, \mathbf{P}_{\text{turnIn}}, \mathbf{P}_{\text{mid}}, \mathbf{P}_{\text{align}}, \mathbf{P}_{\text{spot}}]$$
  車輛從起點 $\mathbf{W}_0$ 沿直線無視道路直接飛向 $\mathbf{P}_{\text{turnIn}}$，穿透地圖所有建築！

#### 47.2 基於車道識別的隔離防禦架構 (Lane-Isolated Boundary Defense)
- **終點車道隔離原則 (Destination Lane Isolation)**：
  路邊泊車進場動線僅允許作用於「目的地車道」內部。在抵達目的地車道前之所有航點（無論沿途轉向幾次、繞行幾個街區、行經高速公路與否），100% 視為不可觸碰之歷史主幹路徑：
  ```typescript
  const destLaneId = rwps[rwps.length - 1].laneId;
  const firstDestLaneIdx = rwps.findIndex((w) => w.laneId === destLaneId);
  const prefixEnd = firstDestLaneIdx !== -1 ? firstDestLaneIdx : rwps.length - 1;

  // 1. 歷史主幹路徑 100% 完整保留
  for (let i = 0; i < prefixEnd; i++) {
    newRwps.push(rwps[i]);
  }

  // 2. 僅在終點車道內部篩選超過切入點之節點
  if (firstDestLaneIdx !== -1) {
    for (let i = firstDestLaneIdx; i < rwps.length; i++) {
      if ((rwps[i].position - turnInPoint).dot(dirVec) >= -0.15) break;
      newRwps.push(rwps[i]);
    }
  }
  ```
- **起步車道隔離原則 (Origin Lane Isolation)**：
  同理，車位起步切出動線僅允許在「起步車道」內部剔除車身後方節點。一旦車輛駛離起步車道標記（`hasExitedStartLane = true`），後續沿途所有車道節點一概完整保留，絕不允許因投影方向不符而將整條路線截斷為端點直線。
