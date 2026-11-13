import { SoundtrackManager, SoundtrackTrack, LoopMode } from '../systems/SoundtrackManager';

/**
 * 背景音樂播放器 UI (SoundtrackPlayer)
 * 位於畫面右下角 (人口與金錢面板上方)
 * 預設縮起為精緻的半透明旋轉黑膠唱片，點擊後向左平滑展開完整播放控制面板
 */
export class SoundtrackPlayer {
  private container: HTMLDivElement;
  private manager: SoundtrackManager;

  // DOM 元素快取
  private vinylEl!: HTMLDivElement;
  private titleEl!: HTMLSpanElement;
  private timeEl!: HTMLSpanElement;
  private progressBarFill!: HTMLDivElement;
  private progressBarTrack!: HTMLDivElement;
  private prevBtn!: HTMLButtonElement;
  private playPauseBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;
  private loopBtn!: HTMLButtonElement;
  private volumeBtn!: HTMLButtonElement;
  private volumeSlider!: HTMLInputElement;
  private playlistDropdown!: HTMLDivElement;
  private collapseBtn!: HTMLButtonElement;

  private isCollapsed: boolean = true; // 預設為縮起狀態
  private unsubs: Array<() => void> = [];

  constructor(manager: SoundtrackManager) {
    this.manager = manager;

    this.container = document.createElement('div');
    this.container.className = 'soundtrack-player-container interactive collapsed';

    this.injectStyles();
    this.render();
    this.bindEvents();

    // 掛載至 ui-overlay (若無則掛至 body)
    const uiOverlay = document.getElementById('ui-overlay');
    if (uiOverlay) {
      uiOverlay.appendChild(this.container);
    } else {
      document.body.appendChild(this.container);
    }

    // 初始化狀態呈現
    this.updateTrackInfo(this.manager.getCurrentTrack(), this.manager.getCurrentIndex());
    this.updatePlayState(this.manager.getIsPlaying());
    this.updateVolumeUI(this.manager.getVolume(), this.manager.getIsMuted());
    this.updateLoopModeUI(this.manager.getLoopMode());
    this.setCollapsed(true);
  }

  /**
   * 格式化秒數為 mm:ss
   */
  private formatSeconds(sec: number): string {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  /**
   * 注入元件專屬 CSS 樣式
   */
  private injectStyles(): void {
    const styleId = 'city-dome-soundtrack-player-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 背景音樂播放器容器 (錨定右下角，人口金錢面板上方) */
      .soundtrack-player-container {
        position: fixed;
        bottom: 66px;
        right: 16px;
        z-index: 102;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 6px 5px 10px;
        background: rgba(18, 15, 25, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 28px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.1);
        user-select: none;
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #f1f5f9;
        /* 向左展開之平滑動畫過渡 */
        max-width: 450px;
        transition: max-width 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                    padding 0.25s ease,
                    border-radius 0.25s ease,
                    background 0.2s ease,
                    box-shadow 0.25s ease,
                    transform 0.2s ease;
      }

      .soundtrack-player-container:hover {
        background: rgba(22, 18, 32, 0.94);
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: 0 10px 36px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      }

      /* 預設縮起狀態：圓形微型黑膠唱片懸浮按鈕 */
      .soundtrack-player-container.collapsed {
        max-width: 44px;
        width: 44px;
        height: 44px;
        padding: 0;
        border-radius: 50%;
        gap: 0;
        overflow: visible;
        cursor: pointer;
        background: rgba(18, 15, 25, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .soundtrack-player-container.collapsed:hover {
        transform: scale(1.08);
        border-color: rgba(56, 189, 248, 0.6);
        box-shadow: 0 0 18px rgba(56, 189, 248, 0.35), 0 8px 24px rgba(0, 0, 0, 0.6);
      }

      .soundtrack-player-container.collapsed .player-expandable-content {
        display: none !important;
      }

      /* 半透明黑膠唱片元件 (錨定最右側) */
      .vinyl-record-wrapper {
        position: relative;
        width: 42px;
        height: 42px;
        flex-shrink: 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .vinyl-disc {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        position: relative;
        overflow: hidden;
        /* 半透明黑膠與微型音軌同心圓刻痕 */
        background: 
          radial-gradient(circle, transparent 26%, rgba(15, 23, 42, 0.65) 28%, rgba(20, 26, 40, 0.8) 60%, rgba(255, 255, 255, 0.12) 61%, rgba(15, 23, 42, 0.75) 62%, rgba(30, 41, 59, 0.88) 100%),
          repeating-radial-gradient(circle, rgba(255, 255, 255, 0.05) 0, rgba(255, 255, 255, 0.05) 1px, transparent 2px, transparent 4px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 0 4px rgba(255, 255, 255, 0.25), 0 0 1px 1px rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .vinyl-record-wrapper:hover .vinyl-disc {
        transform: scale(1.04);
        box-shadow: 0 6px 16px rgba(56, 189, 248, 0.25), inset 0 0 6px rgba(255, 255, 255, 0.35);
      }

      /* 黑膠唱片反光流光效果 */
      .vinyl-disc::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: conic-gradient(
          from 40deg,
          rgba(255, 255, 255, 0.22) 0deg,
          transparent 60deg,
          rgba(255, 255, 255, 0.22) 180deg,
          transparent 240deg,
          rgba(255, 255, 255, 0.22) 360deg
        );
        pointer-events: none;
        mix-blend-mode: overlay;
      }

      /* 黑膠唱片中央彩色標籤圓心 */
      .vinyl-center-label {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(135deg, #06b6d4, #3b82f6, #a855f7);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.6), 0 0 2px rgba(255, 255, 255, 0.3);
        position: relative;
        z-index: 2;
      }

      /* 黑膠中央軸孔 */
      .vinyl-spindle-hole {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #0f172a;
        border: 0.5px solid rgba(255, 255, 255, 0.4);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.8);
      }

      /* 旋轉關鍵影格動畫 */
      @keyframes vinyl-rotate-smooth {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      .vinyl-disc.spinning {
        animation: vinyl-rotate-smooth 7s linear infinite;
      }

      .vinyl-disc.paused {
        animation: vinyl-rotate-smooth 7s linear infinite;
        animation-play-state: paused;
        filter: grayscale(0.2);
      }

      /* 唱臂提示小指針 */
      .vinyl-stylus-indicator {
        position: absolute;
        top: 2px;
        right: 0px;
        width: 7px;
        height: 7px;
        background: radial-gradient(circle, #38bdf8 30%, #0284c7 90%);
        border-radius: 50%;
        box-shadow: 0 0 8px #38bdf8;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .vinyl-disc.spinning + .vinyl-stylus-indicator {
        opacity: 0.9;
      }

      /* 向左展開的內容區 (包含收合鈕、控制列、曲目資訊) */
      .player-expandable-content {
        display: flex;
        align-items: center;
        gap: 10px;
        animation: fadeInExpand 0.3s ease forwards;
      }

      @keyframes fadeInExpand {
        from {
          opacity: 0;
          transform: translateX(12px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* 收合關閉小按鈕 (最左側) */
      .collapse-left-btn {
        color: #94a3b8;
        width: 22px;
        height: 22px;
        border-radius: 4px;
      }

      .collapse-left-btn:hover {
        color: #f1f5f9;
        background: rgba(255, 255, 255, 0.12);
      }

      /* 控制按鈕群 */
      .player-controls-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .player-btn {
        background: transparent;
        border: none;
        outline: none;
        color: #cbd5e1;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
        padding: 0;
      }

      .player-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        transform: scale(1.08);
      }

      .player-btn:active {
        transform: scale(0.94);
      }

      .player-btn.play-pause-main {
        width: 32px;
        height: 32px;
        background: rgba(56, 189, 248, 0.16);
        border: 1px solid rgba(56, 189, 248, 0.35);
        color: #38bdf8;
        border-radius: 50%;
        box-shadow: 0 0 10px rgba(56, 189, 248, 0.15);
      }

      .player-btn.play-pause-main:hover {
        background: rgba(56, 189, 248, 0.28);
        color: #ffffff;
        box-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
      }

      .player-btn.active {
        color: #38bdf8;
      }

      /* 音量控制微型拉桿浮層 (向上彈出) */
      .volume-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .volume-slider-popup {
        display: none;
        position: absolute;
        bottom: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(18, 15, 25, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 8px 10px;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
        z-index: 105;
        width: 90px;
      }

      .volume-wrapper:hover .volume-slider-popup,
      .volume-slider-popup:hover {
        display: block;
      }

      .volume-slider-popup input[type="range"] {
        width: 100%;
        height: 4px;
        accent-color: #38bdf8;
        cursor: pointer;
      }

      /* 曲目資訊與進度條區 */
      .track-info-section {
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 160px;
        min-width: 130px;
        gap: 3px;
        cursor: pointer;
      }

      .track-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }

      .track-title {
        font-size: 11px;
        font-weight: 600;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.2px;
      }

      .track-title:hover {
        color: #38bdf8;
      }

      .track-time {
        font-size: 10px;
        color: #94a3b8;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        flex-shrink: 0;
      }

      /* 進度條 */
      .progress-bar-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        position: relative;
        cursor: pointer;
        overflow: hidden;
        transition: height 0.15s ease;
      }

      .progress-bar-track:hover {
        height: 6px;
      }

      .progress-bar-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #38bdf8, #818cf8);
        border-radius: 2px;
        transition: width 0.1s linear;
      }

      /* 曲目清單下拉面板 (向上彈出以適配右下角) */
      .playlist-dropdown-menu {
        display: none;
        position: absolute;
        bottom: calc(100% + 10px);
        right: 0;
        width: 250px;
        background: rgba(18, 15, 25, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(16px);
        padding: 6px;
        z-index: 104;
        flex-direction: column;
        gap: 4px;
        max-height: 220px;
        overflow-y: auto;
      }

      .playlist-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s ease;
        font-size: 12px;
        color: #cbd5e1;
      }

      .playlist-item:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      .playlist-item.selected {
        background: rgba(56, 189, 248, 0.18);
        color: #38bdf8;
        font-weight: 600;
      }

      .playlist-item .track-item-title {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 渲染 DOM 結構 (黑膠唱片在最右邊，內容區向左展開)
   */
  private render(): void {
    this.container.innerHTML = `
      <!-- 向左展開之內容區 (收合按鈕、控制鍵、曲目資訊與進度條) -->
      <div class="player-expandable-content">
        <!-- 最左側：向右收合關閉按鈕 -->
        <button class="player-btn collapse-left-btn" id="bgm-btn-collapse" title="收起播放器 (向右收合)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </button>

        <!-- 播放控制按鈕群 -->
        <div class="player-controls-group">
          <!-- 上一首 -->
          <button class="player-btn" id="bgm-btn-prev" title="上一首 (⏮)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          <!-- 播放/暫停核心按鈕 -->
          <button class="player-btn play-pause-main" id="bgm-btn-play-pause" title="播放 / 暫停">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" id="bgm-icon-play">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>

          <!-- 下一首 -->
          <button class="player-btn" id="bgm-btn-next" title="下一首 (⏭)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>

          <!-- 循環播放切換按鈕 -->
          <button class="player-btn" id="bgm-btn-loop" title="循環模式：清單循環 (點擊切換單曲循環)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" id="bgm-icon-loop">
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
            </svg>
          </button>

          <!-- 音量控制懸停鈕 -->
          <div class="volume-wrapper">
            <button class="player-btn" id="bgm-btn-volume" title="靜音 / 取消靜音">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" id="bgm-icon-volume">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
            <div class="volume-slider-popup">
              <input type="range" id="bgm-volume-range" min="0" max="1" step="0.02" value="0.5" />
            </div>
          </div>
        </div>

        <!-- 曲目名稱與進度列 -->
        <div class="track-info-section" id="bgm-track-info-box" title="點擊檢視曲目清單">
          <div class="track-title-row">
            <span class="track-title" id="bgm-track-title">載入音樂中...</span>
            <span class="track-time" id="bgm-track-time">0:00 / 0:00</span>
          </div>
          <div class="progress-bar-track" id="bgm-progress-track">
            <div class="progress-bar-fill" id="bgm-progress-fill"></div>
          </div>
        </div>
      </div>

      <!-- 最右側：半透明黑膠唱片元件 (縮起時為圓形圖示，點擊向左展開) -->
      <div class="vinyl-record-wrapper" id="bgm-vinyl-wrapper" title="BGM 唱片播放器 (點擊向左展開 / 收起)">
        <div class="vinyl-disc paused" id="bgm-vinyl-disc">
          <div class="vinyl-center-label">
            <div class="vinyl-spindle-hole"></div>
          </div>
        </div>
        <div class="vinyl-stylus-indicator"></div>
      </div>

      <!-- 下拉曲目清單 (向上展開) -->
      <div class="playlist-dropdown-menu" id="bgm-playlist-dropdown" style="display: none;"></div>
    `;

    // 擷取元素
    this.vinylEl = this.container.querySelector('#bgm-vinyl-disc') as HTMLDivElement;
    this.titleEl = this.container.querySelector('#bgm-track-title') as HTMLSpanElement;
    this.timeEl = this.container.querySelector('#bgm-track-time') as HTMLSpanElement;
    this.progressBarFill = this.container.querySelector('#bgm-progress-fill') as HTMLDivElement;
    this.progressBarTrack = this.container.querySelector('#bgm-progress-track') as HTMLDivElement;
    this.prevBtn = this.container.querySelector('#bgm-btn-prev') as HTMLButtonElement;
    this.playPauseBtn = this.container.querySelector('#bgm-btn-play-pause') as HTMLButtonElement;
    this.nextBtn = this.container.querySelector('#bgm-btn-next') as HTMLButtonElement;
    this.loopBtn = this.container.querySelector('#bgm-btn-loop') as HTMLButtonElement;
    this.volumeBtn = this.container.querySelector('#bgm-btn-volume') as HTMLButtonElement;
    this.volumeSlider = this.container.querySelector('#bgm-volume-range') as HTMLInputElement;
    this.playlistDropdown = this.container.querySelector('#bgm-playlist-dropdown') as HTMLDivElement;
    this.collapseBtn = this.container.querySelector('#bgm-btn-collapse') as HTMLButtonElement;

    this.rebuildPlaylistDropdown();
  }

  /**
   * 建立下拉曲目清單
   */
  private rebuildPlaylistDropdown(): void {
    const tracks = this.manager.getTracks();
    const curIdx = this.manager.getCurrentIndex();

    this.playlistDropdown.innerHTML = '';
    tracks.forEach((track, idx) => {
      const item = document.createElement('div');
      item.className = `playlist-item ${idx === curIdx ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="track-item-title">
          <span>${track.icon}</span>
          <span>${track.title}</span>
        </div>
        <span style="font-size: 10px; opacity: 0.6;">#${idx + 1}</span>
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.manager.selectTrack(idx, true);
        this.playlistDropdown.style.display = 'none';
      });
      this.playlistDropdown.appendChild(item);
    });
  }

  /**
   * 綁定事件監聽
   */
  private bindEvents(): void {
    // 1. 黑膠唱片點選：點擊若收合則向左展開；若已展開則向右收合
    const vinylWrapper = this.container.querySelector('#bgm-vinyl-wrapper');
    if (vinylWrapper) {
      vinylWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setCollapsed(!this.isCollapsed);
      });
    }

    // 2. 播放 / 暫停按鈕
    this.playPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.manager.togglePlay();
    });

    // 3. 上一首 / 下一首
    this.prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.manager.prevTrack(true);
    });

    this.nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.manager.nextTrack(true);
    });

    // 4. 循環模式切換
    this.loopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newMode = this.manager.toggleLoopMode();
      this.updateLoopModeUI(newMode);
    });

    // 5. 音量與靜音切換
    this.volumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.manager.toggleMute();
    });

    this.volumeSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(this.volumeSlider.value);
      this.manager.setVolume(val);
    });

    // 6. 進度條點擊跳轉 (Seek)
    this.progressBarTrack.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = this.progressBarTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const duration = this.manager.getDuration();
      if (duration > 0) {
        this.manager.seek(duration * ratio);
      }
    });

    // 7. 曲目資訊點擊開啟清單選單
    const infoBox = this.container.querySelector('#bgm-track-info-box');
    if (infoBox) {
      infoBox.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = this.playlistDropdown.style.display === 'none';
        this.playlistDropdown.style.display = isHidden ? 'flex' : 'none';
      });
    }

    // 點擊頁面其他地方關閉下拉清單
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.playlistDropdown.style.display = 'none';
      }
    });

    // 8. 最左側收合按鈕
    this.collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setCollapsed(true);
    });

    // 訂閱 Manager 狀態變更
    this.unsubs.push(
      this.manager.onTrackChange((track, index) => {
        this.updateTrackInfo(track, index);
        this.rebuildPlaylistDropdown();
      }),
      this.manager.onPlayStateChange((isPlaying) => {
        this.updatePlayState(isPlaying);
      }),
      this.manager.onTimeUpdate((cur, dur) => {
        this.updateTimeProgress(cur, dur);
      }),
      this.manager.onVolumeChange((vol, muted) => {
        this.updateVolumeUI(vol, muted);
      }),
      this.manager.onLoopModeChange((mode) => {
        this.updateLoopModeUI(mode);
      })
    );
  }

  /**
   * 切換迷你收合模式 (向右收合 / 向左展開)
   */
  public setCollapsed(collapsed: boolean): void {
    this.isCollapsed = collapsed;
    const vinylWrapper = this.container.querySelector('#bgm-vinyl-wrapper') as HTMLElement;
    if (collapsed) {
      this.container.classList.add('collapsed');
      this.playlistDropdown.style.display = 'none';
      if (vinylWrapper) {
        vinylWrapper.title = '🎵 背景音樂 (點擊向左展開)';
      }
    } else {
      this.container.classList.remove('collapsed');
      if (vinylWrapper) {
        vinylWrapper.title = '點擊收起播放器';
      }
    }
  }

  /**
   * 更新曲目資訊
   */
  private updateTrackInfo(track: SoundtrackTrack, index: number): void {
    if (!track) return;
    this.titleEl.textContent = `${track.icon} ${track.title}`;
    this.titleEl.title = `${track.title} (${index + 1}/${this.manager.getTracks().length}) - 點擊展開選單`;
  }

  /**
   * 更新播放/暫停狀態 (驅動黑膠唱片旋轉)
   */
  private updatePlayState(isPlaying: boolean): void {
    if (isPlaying) {
      this.vinylEl.classList.remove('paused');
      this.vinylEl.classList.add('spinning');
      this.playPauseBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      `;
      this.playPauseBtn.title = '暫停音樂';
    } else {
      this.vinylEl.classList.remove('spinning');
      this.vinylEl.classList.add('paused');
      this.playPauseBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      `;
      this.playPauseBtn.title = '播放音樂';
    }
  }

  /**
   * 更新歌曲進度與時間數值
   */
  private updateTimeProgress(cur: number, dur: number): void {
    this.timeEl.textContent = `${this.formatSeconds(cur)} / ${this.formatSeconds(dur)}`;
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      this.progressBarFill.style.width = `${pct}%`;
    } else {
      this.progressBarFill.style.width = '0%';
    }
  }

  /**
   * 更新音量與靜音狀態
   */
  private updateVolumeUI(volume: number, isMuted: boolean): void {
    this.volumeSlider.value = String(volume);
    if (isMuted || volume === 0) {
      this.volumeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
      `;
      this.volumeBtn.title = '已靜音 (點擊恢復音量)';
    } else {
      this.volumeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      `;
      this.volumeBtn.title = `音量: ${Math.round(volume * 100)}% (點擊靜音)`;
    }
  }

  /**
   * 更新循環播放模式按鈕圖標與文字
   */
  private updateLoopModeUI(mode: LoopMode): void {
    if (mode === 'single') {
      this.loopBtn.classList.add('active');
      this.loopBtn.title = '循環模式：單曲循環 (點擊切換為清單循環)';
      this.loopBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/>
        </svg>
      `;
    } else {
      this.loopBtn.classList.remove('active');
      this.loopBtn.title = '循環模式：清單循環 (點擊切換為單曲循環)';
      this.loopBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
        </svg>
      `;
    }
  }

  /**
   * 銷毀釋放資源
   */
  public destroy(): void {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
