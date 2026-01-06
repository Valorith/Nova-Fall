export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CameraOptions {
  bounds: CameraBounds;
  minScale: number;
  maxScale: number;
  smoothing?: number; // 0-1, higher = smoother (slower)
  initialX?: number;
  initialY?: number;
  initialScale?: number;
}

export class Camera {
  private bounds: CameraBounds;
  private minScale: number;
  private maxScale: number;
  private smoothing: number;

  // Current position (interpolated)
  private _x: number;
  private _y: number;
  private _scale: number;

  // Target position (for smooth movement)
  private targetX: number;
  private targetY: number;
  private targetScale: number;

  // Viewport size
  private viewportWidth = 0;
  private viewportHeight = 0;

  constructor(options: CameraOptions) {
    this.bounds = options.bounds;
    this.minScale = options.minScale;
    this.maxScale = options.maxScale;
    this.smoothing = options.smoothing ?? 0.15;

    const centerX = (options.bounds.minX + options.bounds.maxX) / 2;
    const centerY = (options.bounds.minY + options.bounds.maxY) / 2;

    this._x = options.initialX ?? centerX;
    this._y = options.initialY ?? centerY;
    this._scale = options.initialScale ?? this.minScale;

    this.targetX = this._x;
    this.targetY = this._y;
    this.targetScale = this._scale;
  }

  // Getters
  get x(): number {
    return this._x;
  }

  get y(): number {
    return this._y;
  }

  get scale(): number {
    return this._scale;
  }

  // Set viewport size (needed for bounds checking)
  setViewportSize(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.clampPosition();
  }

  // Set position immediately (no smoothing)
  setPosition(x: number, y: number) {
    this._x = x;
    this._y = y;
    this.targetX = x;
    this.targetY = y;
    this.clampPosition();
  }

  // Set scale immediately
  setScale(scale: number) {
    this._scale = this.clampScale(scale);
    this.targetScale = this._scale;
    this.clampPosition();
  }

  // Pan by delta (immediate, for dragging)
  pan(deltaX: number, deltaY: number) {
    this.targetX += deltaX;
    this.targetY += deltaY;
    this._x = this.targetX;
    this._y = this.targetY;
    this.clampPosition();
  }

  // Pan to position (animated)
  panTo(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
    this.clampTarget();
  }

  // Zoom at a specific screen point
  zoomAt(screenX: number, screenY: number, factor: number) {
    const newScale = this.clampScale(this._scale * factor);

    if (newScale === this._scale) return;

    // Calculate world position under mouse before zoom
    const worldX = (screenX - this.viewportWidth / 2) / this._scale + this._x;
    const worldY = (screenY - this.viewportHeight / 2) / this._scale + this._y;

    // Update scale
    this._scale = newScale;
    this.targetScale = newScale;

    // Calculate new camera position to keep world point under mouse
    this._x = worldX - (screenX - this.viewportWidth / 2) / this._scale;
    this._y = worldY - (screenY - this.viewportHeight / 2) / this._scale;
    this.targetX = this._x;
    this.targetY = this._y;

    this.clampPosition();
  }

  // Zoom to scale (animated, centered)
  zoomTo(scale: number) {
    this.targetScale = this.clampScale(scale);
  }

  // Update camera (call each frame for smooth interpolation)
  update() {
    // Interpolate position
    const dx = this.targetX - this._x;
    const dy = this.targetY - this._y;
    const ds = this.targetScale - this._scale;

    // Apply smoothing (lerp)
    if (Math.abs(dx) > 0.01) {
      this._x += dx * this.smoothing;
    } else {
      this._x = this.targetX;
    }

    if (Math.abs(dy) > 0.01) {
      this._y += dy * this.smoothing;
    } else {
      this._y = this.targetY;
    }

    if (Math.abs(ds) > 0.0001) {
      this._scale += ds * this.smoothing;
    } else {
      this._scale = this.targetScale;
    }
  }

  // Clamp scale to min/max
  private clampScale(scale: number): number {
    return Math.max(this.minScale, Math.min(this.maxScale, scale));
  }

  // Clamp position to bounds
  private clampPosition() {
    // Calculate visible world size
    const visibleWidth = this.viewportWidth / this._scale;
    const visibleHeight = this.viewportHeight / this._scale;

    // Calculate allowed camera range
    const halfVisibleWidth = visibleWidth / 2;
    const halfVisibleHeight = visibleHeight / 2;

    const minX = this.bounds.minX + halfVisibleWidth;
    const maxX = this.bounds.maxX - halfVisibleWidth;
    const minY = this.bounds.minY + halfVisibleHeight;
    const maxY = this.bounds.maxY - halfVisibleHeight;

    // If viewport is larger than bounds, center the camera
    if (minX > maxX) {
      this._x = (this.bounds.minX + this.bounds.maxX) / 2;
      this.targetX = this._x;
    } else {
      this._x = Math.max(minX, Math.min(maxX, this._x));
      this.targetX = Math.max(minX, Math.min(maxX, this.targetX));
    }

    if (minY > maxY) {
      this._y = (this.bounds.minY + this.bounds.maxY) / 2;
      this.targetY = this._y;
    } else {
      this._y = Math.max(minY, Math.min(maxY, this._y));
      this.targetY = Math.max(minY, Math.min(maxY, this.targetY));
    }
  }

  // Clamp target position
  private clampTarget() {
    const visibleWidth = this.viewportWidth / this.targetScale;
    const visibleHeight = this.viewportHeight / this.targetScale;

    const halfVisibleWidth = visibleWidth / 2;
    const halfVisibleHeight = visibleHeight / 2;

    const minX = this.bounds.minX + halfVisibleWidth;
    const maxX = this.bounds.maxX - halfVisibleWidth;
    const minY = this.bounds.minY + halfVisibleHeight;
    const maxY = this.bounds.maxY - halfVisibleHeight;

    if (minX <= maxX) {
      this.targetX = Math.max(minX, Math.min(maxX, this.targetX));
    }

    if (minY <= maxY) {
      this.targetY = Math.max(minY, Math.min(maxY, this.targetY));
    }
  }

  // Get visible world bounds
  getVisibleBounds(): CameraBounds {
    const halfWidth = this.viewportWidth / this._scale / 2;
    const halfHeight = this.viewportHeight / this._scale / 2;

    return {
      minX: this._x - halfWidth,
      maxX: this._x + halfWidth,
      minY: this._y - halfHeight,
      maxY: this._y + halfHeight,
    };
  }

  // Check if a world point is visible
  isPointVisible(x: number, y: number, margin = 0): boolean {
    const bounds = this.getVisibleBounds();
    return (
      x >= bounds.minX - margin &&
      x <= bounds.maxX + margin &&
      y >= bounds.minY - margin &&
      y <= bounds.maxY + margin
    );
  }

  // Check if a world rect is visible
  isRectVisible(x: number, y: number, width: number, height: number): boolean {
    const bounds = this.getVisibleBounds();
    return (
      x + width >= bounds.minX &&
      x <= bounds.maxX &&
      y + height >= bounds.minY &&
      y <= bounds.maxY
    );
  }
}
