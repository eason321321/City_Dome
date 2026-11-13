export interface SoundtrackTrack {
  id: string;
  title: string;
  artist: string;
  src: string;
  icon: string;
}

export type LoopMode = 'playlist' | 'single';

export interface SoundtrackState {
  currentTrack: SoundtrackTrack;
  currentIndex: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  loopMode: LoopMode;
  currentTime: number;
  duration: number;
}

export const DEFAULT_SOUNDTRACKS: SoundtrackTrack[] = [
  {
    id: 'guitar-loop',
    title: '吉他悠悠 (Guitar Melody)',
    artist: 'City Dome BGM',
    src: '/audio/background-music-guitar-loop.mp3',
    icon: '🎸',
  },
  {
    id: 'orchestra-loop',
    title: '城市交響 (City Symphony)',
    artist: 'City Dome BGM',
    src: '/audio/background-music-orchestra-loop.mp3',
    icon: '🎻',
  },
  {
    id: 'piano-loop',
    title: '寧靜晨曦 (Calm Piano)',
    artist: 'City Dome BGM',
    src: '/audio/wonderful-calm-beautiful-piano-loop.wav',
    icon: '🎹',
  },
];

const STORAGE_KEYS = {
  VOLUME: 'city_dome_bgm_volume',
  MUTED: 'city_dome_bgm_muted',
  LOOP_MODE: 'city_dome_bgm_loop_mode',
  TRACK_INDEX: 'city_dome_bgm_last_track',
};

/**
 * 背景音樂音效管理器 (SoundtrackManager)
 * 負責音訊串流管理、播放清單輪播、循環播放、曲目平滑切換與音量保存
 */
export class SoundtrackManager {
  private tracks: SoundtrackTrack[];
  private currentIndex: number = 0;
  private audio: HTMLAudioElement;
  private isPlaying: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 0.5;
  private loopMode: LoopMode = 'playlist';
  private isTransitioning: boolean = false;

  // 監聽器回呼集合
  private trackChangeListeners: Set<(track: SoundtrackTrack, index: number) => void> = new Set();
  private playStateListeners: Set<(isPlaying: boolean) => void> = new Set();
  private timeUpdateListeners: Set<(currentTime: number, duration: number) => void> = new Set();
  private volumeChangeListeners: Set<(volume: number, isMuted: boolean) => void> = new Set();
  private loopModeListeners: Set<(mode: LoopMode) => void> = new Set();

  constructor(tracks: SoundtrackTrack[] = DEFAULT_SOUNDTRACKS) {
    this.tracks = [...tracks];
    this.loadPreferences();

    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.volume = this.isMuted ? 0 : this.volume;

    this.bindAudioEvents();

    if (this.tracks.length > 0) {
      // 預設直接啟動播放 (若受限於瀏覽器自動播放政策，則於使用者首次點擊任意處時自動解鎖啟動)
      this.loadTrack(this.currentIndex, true);
    }
  }

  /**
   * 讀取本機偏好設定 (音量、靜音、循環模式等)
   */
  private loadPreferences(): void {
    try {
      const savedVol = localStorage.getItem(STORAGE_KEYS.VOLUME);
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
          this.volume = parsed;
        }
      }

      const savedMuted = localStorage.getItem(STORAGE_KEYS.MUTED);
      if (savedMuted !== null) {
        this.isMuted = savedMuted === 'true';
      }

      const savedLoop = localStorage.getItem(STORAGE_KEYS.LOOP_MODE) as LoopMode;
      if (savedLoop === 'playlist' || savedLoop === 'single') {
        this.loopMode = savedLoop;
      }

      const savedIndex = localStorage.getItem(STORAGE_KEYS.TRACK_INDEX);
      if (savedIndex !== null) {
        const parsedIdx = parseInt(savedIndex, 10);
        if (!isNaN(parsedIdx) && parsedIdx >= 0 && parsedIdx < this.tracks.length) {
          this.currentIndex = parsedIdx;
        }
      }
    } catch (err) {
      console.warn('無法讀取本機音樂設定:', err);
    }
  }

  /**
   * 綁定 HTMLAudioElement 原生事件
   */
  private bindAudioEvents(): void {
    // 時間推進事件
    this.audio.addEventListener('timeupdate', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || 0;
      this.timeUpdateListeners.forEach((fn) => fn(cur, dur));
    });

    // 播放中途載入長度完成
    this.audio.addEventListener('loadedmetadata', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || 0;
      this.timeUpdateListeners.forEach((fn) => fn(cur, dur));
    });

    // 曲目播畢自動處理循環
    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    // 原生播放狀態變更通知
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notifyPlayState();
    });

    this.audio.addEventListener('pause', () => {
      if (!this.isTransitioning) {
        this.isPlaying = false;
        this.notifyPlayState();
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('背景音樂載入或播放失敗:', this.audio.error, e);
    });
  }

  /**
   * 載入特定曲目
   */
  private loadTrack(index: number, autoPlay: boolean = false): void {
    if (index < 0 || index >= this.tracks.length) return;
    this.currentIndex = index;
    const track = this.tracks[this.currentIndex];

    this.audio.src = track.src;
    this.audio.currentTime = 0;

    try {
      localStorage.setItem(STORAGE_KEYS.TRACK_INDEX, String(this.currentIndex));
    } catch {}

    this.trackChangeListeners.forEach((fn) => fn(track, this.currentIndex));

    if (autoPlay) {
      this.play();
    }
  }

  /**
   * 當前曲目播畢處理
   */
  private handleTrackEnded(): void {
    if (this.loopMode === 'single') {
      // 單曲循環：重頭播放當前曲目
      this.audio.currentTime = 0;
      this.play();
    } else {
      // 清單循環：自動切換至下一首，到底則循環回第一首
      this.nextTrack(true);
    }
  }

  /**
   * 開始播放
   */
  public async play(): Promise<boolean> {
    try {
      this.audio.volume = this.isMuted ? 0 : this.volume;
      await this.audio.play();
      this.isPlaying = true;
      this.notifyPlayState();
      return true;
    } catch (err: any) {
      // 處理瀏覽器 Autoplay Policy (未有使用者互動前阻擋播放)
      if (err.name === 'NotAllowedError') {
        console.info('🎵 瀏覽器已暫緩背景音樂自動播放，待使用者點擊視窗任意處時立即自動啟動。');
        this.isPlaying = true;
        this.notifyPlayState();

        const unlockAndPlay = () => {
          window.removeEventListener('pointerdown', unlockAndPlay);
          window.removeEventListener('keydown', unlockAndPlay);
          if (this.isPlaying) {
            this.audio.play().catch(() => {});
          }
        };
        window.addEventListener('pointerdown', unlockAndPlay, { once: true });
        window.addEventListener('keydown', unlockAndPlay, { once: true });
        return false;
      } else {
        console.warn('播放背景音樂發生錯誤:', err);
      }
      this.isPlaying = false;
      this.notifyPlayState();
      return false;
    }
  }

  /**
   * 暫停播放
   */
  public pause(): void {
    this.audio.pause();
    this.isPlaying = false;
    this.notifyPlayState();
  }

  /**
   * 切換播放 / 暫停
   */
  public togglePlay(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * 下一首曲目 (支援清單循環)
   */
  public async nextTrack(autoPlay: boolean = true): Promise<void> {
    if (this.tracks.length === 0) return;
    const nextIdx = (this.currentIndex + 1) % this.tracks.length;
    await this.switchTrackWithFade(nextIdx, autoPlay || this.isPlaying);
  }

  /**
   * 上一首曲目 (支援清單循環)
   */
  public async prevTrack(autoPlay: boolean = true): Promise<void> {
    if (this.tracks.length === 0) return;
    // 如果播放超過 3 秒，點上一首通常為「重頭播放此首」，但使用者若希望純切換上一首則切換
    if (this.audio.currentTime > 3.0) {
      this.audio.currentTime = 0;
      if (autoPlay && !this.isPlaying) {
        this.play();
      }
      return;
    }

    const prevIdx = (this.currentIndex - 1 + this.tracks.length) % this.tracks.length;
    await this.switchTrackWithFade(prevIdx, autoPlay || this.isPlaying);
  }

  /**
   * 直接切換指定曲目
   */
  public async selectTrack(index: number, autoPlay: boolean = true): Promise<void> {
    if (index === this.currentIndex) {
      if (!this.isPlaying && autoPlay) {
        this.play();
      }
      return;
    }
    await this.switchTrackWithFade(index, autoPlay || this.isPlaying);
  }

  /**
   * 帶有短暫淡出的平滑切換曲目機制 (避免卡音爆破音)
   */
  private async switchTrackWithFade(targetIndex: number, startPlaying: boolean): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // 若正在播放，先快速漸弱 (120ms)
    if (this.isPlaying && !this.isMuted) {
      const originalVol = this.volume;
      const step = originalVol / 6;
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 20));
        this.audio.volume = Math.max(0, this.audio.volume - step);
      }
    }

    this.loadTrack(targetIndex, false);

    if (startPlaying) {
      this.audio.volume = 0;
      await this.play();
      // 快速漸強 (120ms)
      if (!this.isMuted) {
        const targetVol = this.volume;
        const step = targetVol / 6;
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 20));
          this.audio.volume = Math.min(targetVol, this.audio.volume + step);
        }
        this.audio.volume = targetVol;
      }
    } else {
      this.audio.volume = this.isMuted ? 0 : this.volume;
    }

    this.isTransitioning = false;
  }

  /**
   * 快轉 / 倒轉進度跳轉 (秒)
   */
  public seek(seconds: number): void {
    if (isNaN(seconds)) return;
    const clamped = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    this.audio.currentTime = clamped;
  }

  /**
   * 設定音量 (0.0 ~ 1.0)
   */
  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    if (this.isMuted && clamped > 0) {
      this.isMuted = false;
    }
    this.audio.volume = this.isMuted ? 0 : this.volume;

    try {
      localStorage.setItem(STORAGE_KEYS.VOLUME, String(this.volume));
      localStorage.setItem(STORAGE_KEYS.MUTED, String(this.isMuted));
    } catch {}

    this.notifyVolume();
  }

  /**
   * 切換靜音狀態
   */
  public toggleMute(): void {
    this.isMuted = !this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;

    try {
      localStorage.setItem(STORAGE_KEYS.MUTED, String(this.isMuted));
    } catch {}

    this.notifyVolume();
  }

  /**
   * 切換循環播放模式 (清單循環 playlist / 單曲循環 single)
   */
  public toggleLoopMode(): LoopMode {
    this.loopMode = this.loopMode === 'playlist' ? 'single' : 'playlist';
    try {
      localStorage.setItem(STORAGE_KEYS.LOOP_MODE, this.loopMode);
    } catch {}
    this.loopModeListeners.forEach((fn) => fn(this.loopMode));
    return this.loopMode;
  }

  // --- Getters ---
  public getTracks(): SoundtrackTrack[] {
    return [...this.tracks];
  }

  public getCurrentTrack(): SoundtrackTrack {
    return this.tracks[this.currentIndex];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getLoopMode(): LoopMode {
    return this.loopMode;
  }

  public getCurrentTime(): number {
    return this.audio.currentTime || 0;
  }

  public getDuration(): number {
    return this.audio.duration || 0;
  }

  // --- 訂閱監聽器 ---
  public onTrackChange(fn: (track: SoundtrackTrack, index: number) => void): () => void {
    this.trackChangeListeners.add(fn);
    return () => this.trackChangeListeners.delete(fn);
  }

  public onPlayStateChange(fn: (isPlaying: boolean) => void): () => void {
    this.playStateListeners.add(fn);
    return () => this.playStateListeners.delete(fn);
  }

  public onTimeUpdate(fn: (currentTime: number, duration: number) => void): () => void {
    this.timeUpdateListeners.add(fn);
    return () => this.timeUpdateListeners.delete(fn);
  }

  public onVolumeChange(fn: (volume: number, isMuted: boolean) => void): () => void {
    this.volumeChangeListeners.add(fn);
    return () => this.volumeChangeListeners.delete(fn);
  }

  public onLoopModeChange(fn: (mode: LoopMode) => void): () => void {
    this.loopModeListeners.add(fn);
    return () => this.loopModeListeners.delete(fn);
  }

  private notifyPlayState(): void {
    this.playStateListeners.forEach((fn) => fn(this.isPlaying));
  }

  private notifyVolume(): void {
    this.volumeChangeListeners.forEach((fn) => fn(this.volume, this.isMuted));
  }
}
