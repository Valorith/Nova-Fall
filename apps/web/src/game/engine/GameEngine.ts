import { Application, Container } from 'pixi.js';
import { Camera, CameraOptions } from './Camera';
import { MAP_BOUNDS, MapNode, RoadType } from '@nova-fall/shared';
import { WorldRenderer } from '../rendering/WorldRenderer';

export interface GameEngineOptions {
  container: HTMLElement;
  width?: number;
  height?: number;
  backgroundColor?: number;
  camera?: Partial<CameraOptions>;
}

export type ZoomLevel = 'strategic' | 'regional' | 'node' | 'combat';

export interface ZoomLevelConfig {
  level: ZoomLevel;
  minScale: number;
  maxScale: number;
  label: string;
}

export const ZOOM_LEVELS: ZoomLevelConfig[] = [
  { level: 'strategic', minScale: 0.1, maxScale: 0.3, label: 'Strategic View' },
  { level: 'regional', minScale: 0.3, maxScale: 0.6, label: 'Regional View' },
  { level: 'node', minScale: 0.6, maxScale: 1.2, label: 'Node Detail' },
  { level: 'combat', minScale: 1.2, maxScale: 3.0, label: 'Combat View' },
];

export interface ConnectionData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  roadType: RoadType;
  dangerLevel: number;
}

export class GameEngine {
  private app: Application;
  private camera: Camera;
  private worldContainer: Container;
  private worldRenderer: WorldRenderer;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;
  private _isDestroyed = false;
  private _currentZoomLevel: ZoomLevel = 'strategic';

  // Event callbacks
  public onZoomLevelChange?: (level: ZoomLevel) => void;
  public onNodeClick?: (node: MapNode) => void;

  constructor(options: GameEngineOptions) {
    const { container, width, height, backgroundColor = 0x0a0a0f } = options;

    // Create PixiJS Application
    this.app = new Application();

    // Create world container (this gets panned/zoomed)
    this.worldContainer = new Container();
    this.worldContainer.label = 'world';

    // Create world renderer
    this.worldRenderer = new WorldRenderer();
    this.worldRenderer.addToContainer(this.worldContainer);

    // Create camera
    const cameraOptions = options.camera ?? {};
    const firstZoom = ZOOM_LEVELS[0];
    const lastZoom = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    this.camera = new Camera({
      bounds: {
        minX: MAP_BOUNDS.minX,
        maxX: MAP_BOUNDS.maxX,
        minY: MAP_BOUNDS.minY,
        maxY: MAP_BOUNDS.maxY,
      },
      minScale: firstZoom?.minScale ?? 0.1,
      maxScale: lastZoom?.maxScale ?? 3.0,
      ...cameraOptions,
    });

    // Initialize async
    this.init(container, width ?? container.clientWidth, height ?? container.clientHeight, backgroundColor);
  }

  private async init(container: HTMLElement, width: number, height: number, backgroundColor: number) {
    // Initialize the application
    await this.app.init({
      width,
      height,
      backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Add canvas to container
    container.appendChild(this.app.canvas);

    // Add world container to stage
    this.app.stage.addChild(this.worldContainer);

    // Set up resize observer
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this._isDestroyed) return;
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        this.resize(width, height);
      }
    });
    this.resizeObserver.observe(container);

    // Set up input handlers
    this.setupInputHandlers();

    // Start render loop
    this.startRenderLoop();

    // Initial camera position (center of map)
    this.camera.setPosition(MAP_BOUNDS.width / 2, MAP_BOUNDS.height / 2);
    this.camera.setViewportSize(width, height);

    // Pass camera to renderer for culling
    this.worldRenderer.setCamera(this.camera);
  }

  private setupInputHandlers() {
    const canvas = this.app.canvas;

    // Make canvas interactive
    canvas.style.touchAction = 'none';

    // Track drag state
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    const DRAG_THRESHOLD = 5;

    // Mouse/touch down
    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    // Mouse/touch move
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      // Check if we've moved enough to consider it a drag
      const totalDeltaX = e.clientX - startX;
      const totalDeltaY = e.clientY - startY;
      if (Math.abs(totalDeltaX) > DRAG_THRESHOLD || Math.abs(totalDeltaY) > DRAG_THRESHOLD) {
        hasMoved = true;
      }

      // Pan the camera (inverse movement for natural dragging)
      this.camera.pan(-deltaX / this.camera.scale, -deltaY / this.camera.scale);

      lastX = e.clientX;
      lastY = e.clientY;
    };

    // Mouse/touch up
    const onPointerUp = (e: PointerEvent) => {
      const wasClick = !hasMoved && isDragging;
      isDragging = false;
      canvas.releasePointerCapture(e.pointerId);

      // Handle click (not drag)
      if (wasClick) {
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = this.screenToWorld(screenX, screenY);
        const node = this.worldRenderer.getNodeAtPosition(worldPos.x, worldPos.y);
        if (node && this.onNodeClick) {
          this.onNodeClick(node);
        }
      }
    };

    // Mouse wheel zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Get mouse position relative to canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      // Zoom towards mouse position
      this.camera.zoomAt(mouseX, mouseY, zoomFactor);

      // Update zoom level
      this.updateZoomLevel();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Store handlers for cleanup
    this._inputHandlers = {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onWheel,
    };
  }

  private _inputHandlers: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onWheel: (e: WheelEvent) => void;
  } | null = null;

  private startRenderLoop() {
    const update = () => {
      if (this._isDestroyed) return;

      // Update camera (applies smoothing)
      this.camera.update();

      // Apply camera transform to world container
      this.worldContainer.x = -this.camera.x * this.camera.scale + this.app.screen.width / 2;
      this.worldContainer.y = -this.camera.y * this.camera.scale + this.app.screen.height / 2;
      this.worldContainer.scale.set(this.camera.scale);

      // Update visibility (culling)
      this.worldRenderer.updateVisibility();

      this.animationFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private updateZoomLevel() {
    const scale = this.camera.scale;
    let newLevel: ZoomLevel = 'strategic';

    for (const config of ZOOM_LEVELS) {
      if (scale >= config.minScale && scale < config.maxScale) {
        newLevel = config.level;
        break;
      }
    }

    // Handle max scale edge case
    const maxZoom = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    if (maxZoom && scale >= maxZoom.maxScale) {
      newLevel = 'combat';
    }

    if (newLevel !== this._currentZoomLevel) {
      this._currentZoomLevel = newLevel;
      this.worldRenderer.setZoomLevel(newLevel);
      this.onZoomLevelChange?.(newLevel);
    }
  }

  public resize(width: number, height: number) {
    if (this._isDestroyed) return;
    this.app.renderer.resize(width, height);
    this.camera.setViewportSize(width, height);
  }

  public destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;

    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Remove event listeners
    if (this._inputHandlers) {
      const canvas = this.app.canvas;
      canvas.removeEventListener('pointerdown', this._inputHandlers.onPointerDown);
      canvas.removeEventListener('pointermove', this._inputHandlers.onPointerMove);
      canvas.removeEventListener('pointerup', this._inputHandlers.onPointerUp);
      canvas.removeEventListener('pointerleave', this._inputHandlers.onPointerUp);
      canvas.removeEventListener('wheel', this._inputHandlers.onWheel);
    }

    // Disconnect resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Destroy PixiJS application
    this.app.destroy(true, { children: true, texture: true });
  }

  // Public API
  get stage() {
    return this.app.stage;
  }

  get world() {
    return this.worldContainer;
  }

  get currentZoomLevel(): ZoomLevel {
    return this._currentZoomLevel;
  }

  get cameraPosition() {
    return { x: this.camera.x, y: this.camera.y };
  }

  get cameraScale() {
    return this.camera.scale;
  }

  public setZoomLevel(level: ZoomLevel) {
    const config = ZOOM_LEVELS.find((z) => z.level === level);
    if (config) {
      const targetScale = (config.minScale + config.maxScale) / 2;
      this.camera.setScale(targetScale);
      this.updateZoomLevel();
    }
  }

  public panTo(x: number, y: number, animate = true) {
    if (animate) {
      this.camera.panTo(x, y);
    } else {
      this.camera.setPosition(x, y);
    }
  }

  public zoomIn() {
    this.camera.zoomAt(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
      1.2
    );
    this.updateZoomLevel();
  }

  public zoomOut() {
    this.camera.zoomAt(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
      0.8
    );
    this.updateZoomLevel();
  }

  // Convert screen coordinates to world coordinates
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const worldX = (screenX - this.app.screen.width / 2) / this.camera.scale + this.camera.x;
    const worldY = (screenY - this.app.screen.height / 2) / this.camera.scale + this.camera.y;
    return { x: worldX, y: worldY };
  }

  // Convert world coordinates to screen coordinates
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const screenX = (worldX - this.camera.x) * this.camera.scale + this.app.screen.width / 2;
    const screenY = (worldY - this.camera.y) * this.camera.scale + this.app.screen.height / 2;
    return { x: screenX, y: screenY };
  }

  // Load map data
  public loadMapData(nodes: MapNode[], connections: ConnectionData[]) {
    this.worldRenderer.setMapData(nodes, connections);
  }

  // Update a single node (for real-time updates)
  public updateNode(nodeId: string, data: Partial<MapNode>) {
    this.worldRenderer.updateNode(nodeId, data);
  }

  // Highlight a node
  public highlightNode(nodeId: string, highlight: boolean) {
    this.worldRenderer.highlightNode(nodeId, highlight);
  }
}
