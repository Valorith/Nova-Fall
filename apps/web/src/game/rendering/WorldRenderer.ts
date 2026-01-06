import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  MapNode,
  NodeType,
  NodeStatus,
  RoadType,
  NODE_TYPE_CONFIGS,
  REGIONS,
} from '@nova-fall/shared';
import type { Camera } from '../engine/Camera';
import type { ZoomLevel } from '../engine/GameEngine';

interface ConnectionData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  roadType: RoadType;
  dangerLevel: number;
}

const ROAD_COLORS: Record<RoadType, number> = {
  [RoadType.DIRT]: 0x8b7355,
  [RoadType.PAVED]: 0xa0a0a0,
  [RoadType.HIGHWAY]: 0xffd700,
  [RoadType.HAZARDOUS]: 0xff4500,
};

const STATUS_COLORS: Record<NodeStatus, number> = {
  [NodeStatus.NEUTRAL]: 0x808080,
  [NodeStatus.CLAIMED]: 0x4a90d9,
  [NodeStatus.CONTESTED]: 0xffa500,
  [NodeStatus.UNDER_ATTACK]: 0xff0000,
};

export class WorldRenderer {
  // Layer containers
  private backgroundLayer: Container;
  private connectionLayer: Container;
  private nodeLayer: Container;
  private labelLayer: Container;

  // Graphics objects for batch rendering
  private backgroundGraphics: Graphics;
  private connectionGraphics: Graphics;

  // Node sprites/graphics stored by ID
  private nodeGraphics: Map<string, Container> = new Map();

  // Data
  private nodes: MapNode[] = [];
  private connections: ConnectionData[] = [];

  // Current zoom level for LOD
  private currentZoomLevel: ZoomLevel = 'strategic';

  // Camera reference for culling
  private camera: Camera | null = null;

  // Label text style
  private labelStyle: TextStyle;
  private smallLabelStyle: TextStyle;

  constructor() {
    // Create layer containers
    this.backgroundLayer = new Container();
    this.backgroundLayer.label = 'background';

    this.connectionLayer = new Container();
    this.connectionLayer.label = 'connections';

    this.nodeLayer = new Container();
    this.nodeLayer.label = 'nodes';

    this.labelLayer = new Container();
    this.labelLayer.label = 'labels';

    // Create graphics objects
    this.backgroundGraphics = new Graphics();
    this.backgroundLayer.addChild(this.backgroundGraphics);

    this.connectionGraphics = new Graphics();
    this.connectionLayer.addChild(this.connectionGraphics);

    // Text styles
    this.labelStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 12,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3 },
    });

    this.smallLabelStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 9,
      fill: 0xcccccc,
      stroke: { color: 0x000000, width: 2 },
    });
  }

  // Add all layers to a parent container
  addToContainer(parent: Container) {
    parent.addChild(this.backgroundLayer);
    parent.addChild(this.connectionLayer);
    parent.addChild(this.nodeLayer);
    parent.addChild(this.labelLayer);
  }

  // Set camera reference for culling
  setCamera(camera: Camera) {
    this.camera = camera;
  }

  // Set zoom level for LOD
  setZoomLevel(level: ZoomLevel) {
    this.currentZoomLevel = level;
    this.updateLOD();
  }

  // Load map data
  setMapData(nodes: MapNode[], connections: ConnectionData[]) {
    this.nodes = nodes;
    this.connections = connections;

    // Clear existing graphics
    this.clearAll();

    // Render static elements
    this.renderBackground();
    this.renderConnections();
    this.renderNodes();
  }

  // Clear all rendered elements
  clearAll() {
    this.backgroundGraphics.clear();
    this.connectionGraphics.clear();
    this.nodeGraphics.forEach((g) => g.destroy());
    this.nodeGraphics.clear();
    this.labelLayer.removeChildren();
  }

  // Render background (region colors)
  private renderBackground() {
    const g = this.backgroundGraphics;
    g.clear();

    // Draw region backgrounds
    for (const region of REGIONS) {
      // Parse hex color
      const color = parseInt(region.color.replace('#', ''), 16);

      g.rect(
        region.bounds.minX,
        region.bounds.minY,
        region.bounds.maxX - region.bounds.minX,
        region.bounds.maxY - region.bounds.minY
      );
      g.fill({ color, alpha: 0.15 });
    }

    // Draw grid for reference (subtle)
    g.setStrokeStyle({ width: 1, color: 0x333333, alpha: 0.3 });
    for (let x = 0; x <= 2000; x += 200) {
      g.moveTo(x, 0);
      g.lineTo(x, 2000);
    }
    for (let y = 0; y <= 2000; y += 200) {
      g.moveTo(0, y);
      g.lineTo(2000, y);
    }
    g.stroke();
  }

  // Render node connections
  private renderConnections() {
    const g = this.connectionGraphics;
    g.clear();

    for (const conn of this.connections) {
      const color = ROAD_COLORS[conn.roadType];
      const width = conn.roadType === RoadType.HIGHWAY ? 3 : conn.roadType === RoadType.PAVED ? 2 : 1.5;

      // Base line
      g.setStrokeStyle({ width, color, alpha: 0.6 });
      g.moveTo(conn.fromX, conn.fromY);
      g.lineTo(conn.toX, conn.toY);
      g.stroke();

      // Danger overlay (if dangerous)
      if (conn.dangerLevel > 30) {
        const dangerAlpha = (conn.dangerLevel - 30) / 140; // 0-0.5 range
        g.setStrokeStyle({ width: width + 2, color: 0xff0000, alpha: dangerAlpha });
        g.moveTo(conn.fromX, conn.fromY);
        g.lineTo(conn.toX, conn.toY);
        g.stroke();
      }
    }
  }

  // Render nodes
  private renderNodes() {
    for (const node of this.nodes) {
      const container = this.createNodeGraphic(node);
      this.nodeLayer.addChild(container);
      this.nodeGraphics.set(node.id, container);
    }
  }

  // Create a single node graphic
  private createNodeGraphic(node: MapNode): Container {
    const container = new Container();
    container.x = node.positionX;
    container.y = node.positionY;
    container.label = node.id;

    // Get node config
    const config = NODE_TYPE_CONFIGS[node.type];
    const typeColor = parseInt(config.color.replace('#', ''), 16);
    const statusColor = STATUS_COLORS[node.status];

    // Draw node circle
    const graphics = new Graphics();

    // Outer ring (status)
    graphics.circle(0, 0, 18);
    graphics.fill({ color: statusColor, alpha: 0.8 });

    // Inner circle (type)
    graphics.circle(0, 0, 14);
    graphics.fill({ color: typeColor, alpha: 1 });

    // Tier indicator (small dots)
    if (node.tier > 1) {
      for (let i = 0; i < node.tier; i++) {
        const angle = (i / node.tier) * Math.PI * 2 - Math.PI / 2;
        const dotX = Math.cos(angle) * 22;
        const dotY = Math.sin(angle) * 22;
        graphics.circle(dotX, dotY, 3);
        graphics.fill({ color: 0xffd700 });
      }
    }

    container.addChild(graphics);

    // Type icon (simple text representation for now)
    const iconText = this.getTypeIcon(node.type);
    const icon = new Text({
      text: iconText,
      style: { fontFamily: 'Arial', fontSize: 14, fill: 0xffffff },
    });
    icon.anchor.set(0.5);
    container.addChild(icon);

    // Label (name)
    const label = new Text({
      text: node.name,
      style: this.labelStyle,
    });
    label.anchor.set(0.5, 0);
    label.y = 24;
    container.addChild(label);

    // Owner label (if owned)
    if (node.ownerName) {
      const ownerLabel = new Text({
        text: node.ownerName,
        style: this.smallLabelStyle,
      });
      ownerLabel.anchor.set(0.5, 0);
      ownerLabel.y = 38;
      container.addChild(ownerLabel);
    }

    // Make interactive
    container.eventMode = 'static';
    container.cursor = 'pointer';

    return container;
  }

  // Get icon character for node type
  private getTypeIcon(type: NodeType): string {
    switch (type) {
      case NodeType.MINING:
        return '⛏';
      case NodeType.REFINERY:
        return '🏭';
      case NodeType.RESEARCH:
        return '🔬';
      case NodeType.TRADE_HUB:
        return '🏪';
      case NodeType.FORTRESS:
        return '🏰';
      case NodeType.AGRICULTURAL:
        return '🌾';
      case NodeType.POWER_PLANT:
        return '⚡';
      case NodeType.CAPITAL:
        return '👑';
      default:
        return '●';
    }
  }

  // Update node data (for real-time updates)
  updateNode(nodeId: string, data: Partial<MapNode>) {
    const index = this.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return;

    const existingNode = this.nodes[index];
    if (!existingNode) return;

    // Update data
    const updatedNode: MapNode = { ...existingNode, ...data };
    this.nodes[index] = updatedNode;

    // Re-render node
    const oldGraphic = this.nodeGraphics.get(nodeId);
    if (oldGraphic) {
      oldGraphic.destroy();
    }

    const newGraphic = this.createNodeGraphic(updatedNode);
    this.nodeLayer.addChild(newGraphic);
    this.nodeGraphics.set(nodeId, newGraphic);
  }

  // Update LOD based on zoom level
  private updateLOD() {
    const showLabels = this.currentZoomLevel !== 'strategic';
    const showOwnerLabels = this.currentZoomLevel === 'node' || this.currentZoomLevel === 'combat';

    this.nodeGraphics.forEach((container) => {
      const children = container.children;
      // Assuming: [graphics, icon, label, ownerLabel?]
      const labelChild = children[2];
      const ownerLabelChild = children[3];
      if (labelChild) {
        labelChild.visible = showLabels; // Node name
      }
      if (ownerLabelChild) {
        ownerLabelChild.visible = showOwnerLabels; // Owner name
      }
    });
  }

  // Update visibility based on camera (culling)
  updateVisibility() {
    if (!this.camera) return;

    const margin = 100; // Extra margin for smooth transitions

    this.nodeGraphics.forEach((container, nodeId) => {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const isVisible = this.camera!.isPointVisible(node.positionX, node.positionY, margin);
      container.visible = isVisible;
    });
  }

  // Get node at position (for click handling)
  getNodeAtPosition(worldX: number, worldY: number): MapNode | null {
    const hitRadius = 20;

    for (const node of this.nodes) {
      const dx = worldX - node.positionX;
      const dy = worldY - node.positionY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= hitRadius) {
        return node;
      }
    }

    return null;
  }

  // Highlight a node
  highlightNode(nodeId: string, highlight: boolean) {
    const container = this.nodeGraphics.get(nodeId);
    if (!container) return;

    const graphics = container.children[0] as Graphics;
    if (!graphics) return;

    // Scale effect for highlight
    container.scale.set(highlight ? 1.2 : 1);

    // Could add glow effect here in the future
  }
}
