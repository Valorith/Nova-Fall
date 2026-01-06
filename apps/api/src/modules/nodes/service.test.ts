import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Player } from '@prisma/client';

// Mock Prisma - must be hoisted
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    node: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    player: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    nodeConnection: {
      findMany: vi.fn(),
    },
  },
}));

// Import the mock after setting up
import { prisma } from '../../lib/prisma.js';
const mockPrisma = vi.mocked(prisma);

// Import service after mock is set up
import { claimNode, abandonNode } from './service.js';

// Test data helpers
function createMockNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    name: 'Test Node',
    type: 'SETTLEMENT',
    tier: 1,
    positionX: 100,
    positionY: 100,
    regionId: 'region-1',
    ownerId: null,
    status: 'NEUTRAL',
    storage: {},
    claimedAt: null,
    upkeepPaid: null,
    upkeepDue: null,
    attackCooldownUntil: null,
    attackImmunityUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    userId: 'user-1',
    displayName: 'Test Player',
    faction: null,
    tier: 'FREE',
    hqNodeId: null,
    totalNodes: 0,
    resources: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Node Claiming Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('claimNode', () => {
    it('first node claim becomes HQ', async () => {
      // Arrange: Neutral node with no connections needed for first claim
      const neutralNode = createMockNode({
        id: 'node-1',
        status: 'NEUTRAL',
        ownerId: null,
      });

      const player = createMockPlayer({
        id: 'player-1',
        hqNodeId: null,
        totalNodes: 0,
      });

      // Mock: Node lookup returns neutral node
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...neutralNode,
        connectionsFrom: [],
        connectionsTo: [],
      } as never);

      // Mock: Player has no nodes (first claim)
      mockPrisma.node.findMany.mockResolvedValueOnce([]);

      // Mock: Node update succeeds
      mockPrisma.node.update.mockResolvedValueOnce({
        ...neutralNode,
        ownerId: 'player-1',
        status: 'CLAIMED',
        claimedAt: new Date(),
      } as never);

      // Mock: Player update returns updated player with HQ set
      mockPrisma.player.update.mockResolvedValueOnce({
        ...player,
        hqNodeId: 'node-1',
        totalNodes: 1,
      } as never);

      // Mock: getNodeById lookup for response
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...neutralNode,
        ownerId: 'player-1',
        status: 'CLAIMED',
        owner: { displayName: 'Test Player', hqNodeId: 'node-1' },
        buildings: [],
        garrison: [],
        connectionsFrom: [],
        connectionsTo: [],
      } as never);

      // Act
      const result = await claimNode('node-1', 'player-1');

      // Assert
      expect(result.success).toBe(true);
      expect(result.node).toBeDefined();
      expect(result.node?.isHQ).toBe(true);

      // Verify player was updated with hqNodeId
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: {
          totalNodes: { increment: 1 },
          hqNodeId: 'node-1',
        },
      });
    });

    it('second node claim requires adjacency', async () => {
      // Arrange: Player already owns node-1, trying to claim adjacent node-2
      const node2 = createMockNode({
        id: 'node-2',
        status: 'NEUTRAL',
        ownerId: null,
      });

      // Mock: Node lookup returns neutral node with connection to node-1
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...node2,
        connectionsFrom: [{ toNodeId: 'node-1' }],
        connectionsTo: [],
      } as never);

      // Mock: Player already owns node-1
      mockPrisma.node.findMany.mockResolvedValueOnce([
        { id: 'node-1' },
      ] as never);

      // Mock: Node update succeeds
      mockPrisma.node.update.mockResolvedValueOnce({
        ...node2,
        ownerId: 'player-1',
        status: 'CLAIMED',
      } as never);

      // Mock: Player update (no HQ change since not first node)
      mockPrisma.player.update.mockResolvedValueOnce({
        id: 'player-1',
        displayName: 'Test Player',
        hqNodeId: 'node-1',
        totalNodes: 2,
      } as never);

      // Mock: getNodeById lookup for response
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...node2,
        ownerId: 'player-1',
        status: 'CLAIMED',
        owner: { displayName: 'Test Player', hqNodeId: 'node-1' },
        buildings: [],
        garrison: [],
        connectionsFrom: [],
        connectionsTo: [],
      } as never);

      // Act
      const result = await claimNode('node-2', 'player-1');

      // Assert
      expect(result.success).toBe(true);

      // Verify player was NOT given new HQ (already has one)
      expect(mockPrisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-1' },
        data: {
          totalNodes: { increment: 1 },
        },
      });
    });

    it('non-adjacent claim fails with error', async () => {
      // Arrange: Player owns node-1, node-3 is NOT adjacent
      const node3 = createMockNode({
        id: 'node-3',
        status: 'NEUTRAL',
        ownerId: null,
      });

      // Mock: Node lookup returns neutral node with NO connection to player's nodes
      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...node3,
        connectionsFrom: [{ toNodeId: 'node-99' }], // Connected to different node
        connectionsTo: [{ fromNodeId: 'node-98' }], // Connected to different node
      } as never);

      // Mock: Player owns node-1 (not adjacent to node-3)
      mockPrisma.node.findMany.mockResolvedValueOnce([
        { id: 'node-1' },
      ] as never);

      // Act
      const result = await claimNode('node-3', 'player-1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Node must be adjacent to one of your nodes');

      // Verify node was NOT updated
      expect(mockPrisma.node.update).not.toHaveBeenCalled();
    });

    it('cannot claim already owned node', async () => {
      // Arrange: Node already owned by another player
      const ownedNode = createMockNode({
        id: 'node-1',
        status: 'CLAIMED',
        ownerId: 'other-player',
      });

      mockPrisma.node.findUnique.mockResolvedValueOnce({
        ...ownedNode,
        connectionsFrom: [],
        connectionsTo: [],
      } as never);

      // Act
      const result = await claimNode('node-1', 'player-1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Node is not neutral');
    });
  });

  describe('abandonNode', () => {
    it('cannot abandon HQ', async () => {
      // Arrange: Player's HQ node
      const hqNode = createMockNode({
        id: 'node-1',
        status: 'CLAIMED',
        ownerId: 'player-1',
      });

      const player = createMockPlayer({
        id: 'player-1',
        hqNodeId: 'node-1', // This node IS the HQ
        totalNodes: 3,
      });

      // Mock: Node lookup confirms ownership
      mockPrisma.node.findUnique.mockResolvedValueOnce(hqNode);

      // Mock: Player lookup shows this is their HQ
      mockPrisma.player.findUnique.mockResolvedValueOnce(player);

      // Act
      const result = await abandonNode('node-1', 'player-1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot abandon your headquarters');

      // Verify node was NOT updated
      expect(mockPrisma.node.update).not.toHaveBeenCalled();
    });

    it('can abandon non-HQ owned node', async () => {
      // Arrange: Player owns node-2, which is NOT their HQ
      const ownedNode = createMockNode({
        id: 'node-2',
        status: 'CLAIMED',
        ownerId: 'player-1',
      });

      const player = createMockPlayer({
        id: 'player-1',
        hqNodeId: 'node-1', // Different node is HQ
        totalNodes: 3,
      });

      // Mock: Node lookup confirms ownership
      mockPrisma.node.findUnique.mockResolvedValueOnce(ownedNode);

      // Mock: Player lookup shows different HQ
      mockPrisma.player.findUnique.mockResolvedValueOnce(player);

      // Mock: Node update succeeds
      mockPrisma.node.update.mockResolvedValueOnce({
        ...ownedNode,
        ownerId: null,
        status: 'NEUTRAL',
      } as never);

      // Mock: Player update succeeds
      mockPrisma.player.update.mockResolvedValueOnce({
        ...player,
        totalNodes: 2,
      } as never);

      // Act
      const result = await abandonNode('node-2', 'player-1');

      // Assert
      expect(result.success).toBe(true);

      // Verify node was reset to neutral
      expect(mockPrisma.node.update).toHaveBeenCalledWith({
        where: { id: 'node-2' },
        data: expect.objectContaining({
          ownerId: null,
          status: 'NEUTRAL',
        }),
      });
    });

    it('cannot abandon node you do not own', async () => {
      // Arrange: Node owned by different player
      const otherNode = createMockNode({
        id: 'node-1',
        status: 'CLAIMED',
        ownerId: 'other-player',
      });

      mockPrisma.node.findUnique.mockResolvedValueOnce(otherNode);

      // Act
      const result = await abandonNode('node-1', 'player-1');

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('You do not own this node');
    });
  });
});
