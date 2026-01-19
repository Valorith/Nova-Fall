import { useDebugStore } from '@/stores/debug';

export interface PerformanceSample {
  frameTimeMs: number;
  fps: number;
}

export class PerformanceMonitor {
  private sampleWindow: number[] = [];
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 0;
  private lastFpsSample = 0;
  private readonly store: ReturnType<typeof useDebugStore>;

  constructor() {
    this.store = useDebugStore();
  }

  start(): void {
    if (this.lastFrameTime !== 0) return;
    this.lastFrameTime = performance.now();
    this.lastFpsSample = this.lastFrameTime;
  }

  stop(): void {
    this.lastFrameTime = 0;
    this.sampleWindow = [];
  }

  recordFrame(now = performance.now()): PerformanceSample {
    if (this.lastFrameTime === 0) {
      this.start();
      return { frameTimeMs: 0, fps: this.fps };
    }
    const delta = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (delta > 0) {
      this.sampleWindow.push(delta);
      if (this.sampleWindow.length > 60) {
        this.sampleWindow.shift();
      }
    }
    this.frameCount += 1;
    const elapsed = now - this.lastFpsSample;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsSample = now;
      this.store.setMetric('performance', 'fps', this.fps, { label: 'FPS', trackHistory: true });
    }
    const avgFrame = this.sampleWindow.length
      ? this.sampleWindow.reduce((sum, value) => sum + value, 0) / this.sampleWindow.length
      : 0;
    const frameValue = Number(avgFrame.toFixed(2));
    this.store.setMetric('performance', 'frameTime', frameValue, {
      label: 'Avg frame',
      unit: 'ms',
      trackHistory: true,
    });
    return { frameTimeMs: avgFrame, fps: this.fps };
  }
}
