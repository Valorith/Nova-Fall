<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import {
  blueprintsApi,
  uploadsApi,
  itemsApi,
  type Blueprint,
  type BlueprintListQuery,
} from '@/services/api';
import IconPicker from './IconPicker.vue';
import {
  BlueprintCategory,
  BlueprintQuality,
  NodeType,
  DbItemCategory,
  BLUEPRINT_QUALITY_COLORS,
  BLUEPRINT_QUALITY_NAMES,
  BLUEPRINT_CATEGORY_NAMES,
  formatCraftTime,
  RESOURCES,
  NODE_CORES,
  type BlueprintMaterial,
  type DbItemDefinition,
} from '@nova-fall/shared';

// Build list of all available items for selection
interface SelectableItem {
  id: string;
  name: string;
  icon: string;
  category: string;
  color: string;
}

// Database items for selection (fetched from API)
const dbItems = ref<DbItemDefinition[]>([]);
const loadingItems = ref(false);

// API base URL for icon display
const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Fetch items from database
async function fetchItems(forceRefresh = false) {
  if (dbItems.value.length > 0 && !forceRefresh) return; // Already loaded
  loadingItems.value = true;
  try {
    const response = await itemsApi.getAll({ limit: 500 });
    dbItems.value = response.data.items;
  } catch (err) {
    console.error('Failed to fetch items:', err);
    // Fall back to hardcoded items if API fails
  } finally {
    loadingItems.value = false;
  }
}

// Build list of all available items for selection
// Prefers database items, falls back to hardcoded
const availableItems = computed<SelectableItem[]>(() => {
  // If database items are loaded, use them
  if (dbItems.value.length > 0) {
    return dbItems.value.map((item) => ({
      id: item.itemId,
      name: item.name,
      icon: item.icon || '📦',
      category: item.category.toLowerCase(),
      // Use quality-based color instead of stored color
      color: BLUEPRINT_QUALITY_COLORS[item.quality as BlueprintQuality] || '#FFFFFF',
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Fallback to hardcoded items
  const items: SelectableItem[] = [];

  // Add resources
  for (const [id, resource] of Object.entries(RESOURCES)) {
    items.push({
      id,
      name: resource.name,
      icon: resource.icon,
      category: 'resource',
      color: '#FFFFFF',
    });
  }

  // Add node cores
  for (const [id, core] of Object.entries(NODE_CORES)) {
    items.push({
      id,
      name: core.name,
      icon: core.icon,
      category: 'core',
      color: '#FFFFFF',
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name));
});

// Get item info by ID
function getItemInfo(itemId: string): SelectableItem | undefined {
  return availableItems.value.find((i) => i.id === itemId);
}

// Get icon URL for display (handles both API paths and public folder paths)
function getItemIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  // Public folder icons (like /icons/items/...) are served directly
  if (iconPath.startsWith('/icons/') || iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
    return iconPath;
  }
  // API uploaded icons need the API base URL
  return `${apiBaseUrl}${iconPath}`;
}

// State
const blueprints = ref<Blueprint[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const selectedBlueprint = ref<Blueprint | null>(null);
const isEditing = ref(false);
const isCreating = ref(false);
const saving = ref(false);

// Filters
const searchQuery = ref('');
const filterCategory = ref<BlueprintCategory | ''>('');
const filterQuality = ref<BlueprintQuality | ''>('');
const filterLearned = ref<'true' | 'false' | ''>('');

// Form state
const form = ref({
  name: '',
  description: '',
  category: BlueprintCategory.REFINEMENT,
  quality: BlueprintQuality.COMMON,
  learned: true, // Default: requires learning
  craftTime: 60,
  nodeTypes: [] as NodeType[],
  nodeTierRequired: 1,
  inputs: [] as BlueprintMaterial[],
  outputs: [] as BlueprintMaterial[],
  icon: '',
});

// Item selector state
const inputSearchQuery = ref('');
const outputSearchQuery = ref('');
const showInputDropdown = ref(false);
const showOutputDropdown = ref(false);
const inputDropdownIndex = ref(0);
const outputDropdownIndex = ref(0);

// Refs for quantity inputs (to focus after adding item)
const inputQtyRefs = ref<(HTMLInputElement | null)[]>([]);
const outputQtyRefs = ref<(HTMLInputElement | null)[]>([]);

// Context menu state
const showContextMenu = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuBlueprint = ref<Blueprint | null>(null);

// Icon upload state
const uploadingIcon = ref(false);
const iconUploadError = ref<string | null>(null);
const iconFileInput = ref<HTMLInputElement | null>(null);
const showIconPicker = ref(false);

// Filtered items for dropdowns
const filteredInputItems = computed(() => {
  const query = inputSearchQuery.value.toLowerCase();
  if (!query) return availableItems.value;
  return availableItems.value.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query)
  );
});

const filteredOutputItems = computed(() => {
  const query = outputSearchQuery.value.toLowerCase();
  if (!query) return availableItems.value;
  return availableItems.value.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query)
  );
});

// Available options
const categories = Object.values(BlueprintCategory);
const qualities = Object.values(BlueprintQuality);
const nodeTypes = Object.values(NodeType);

// Computed
const qualityColor = computed(() => {
  return BLUEPRINT_QUALITY_COLORS[form.value.quality] || '#FFFFFF';
});

// Fetch blueprints
async function fetchBlueprints() {
  loading.value = true;
  error.value = null;
  try {
    const query: BlueprintListQuery = {
      limit: 100,
      offset: 0,
    };
    if (searchQuery.value) query.search = searchQuery.value;
    if (filterCategory.value) query.category = filterCategory.value;
    if (filterQuality.value) query.quality = filterQuality.value;
    if (filterLearned.value) query.learned = filterLearned.value;

    const response = await blueprintsApi.getAll(query);
    blueprints.value = response.data.blueprints;
    total.value = response.data.total;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load blueprints';
    console.error('Failed to load blueprints:', err);
  } finally {
    loading.value = false;
  }
}

// Watch filters and search
watch([searchQuery, filterCategory, filterQuality, filterLearned], fetchBlueprints);

// Reset filters to default
function resetFilters() {
  searchQuery.value = '';
  filterCategory.value = '';
  filterQuality.value = '';
  filterLearned.value = '';
}

// Reset dropdown index when search query changes
watch(inputSearchQuery, () => {
  inputDropdownIndex.value = 0;
});
watch(outputSearchQuery, () => {
  outputDropdownIndex.value = 0;
});

// Select blueprint for editing
function selectBlueprint(blueprint: Blueprint) {
  selectedBlueprint.value = blueprint;
  isEditing.value = false;
  isCreating.value = false;
}

// Start editing
function startEdit() {
  if (!selectedBlueprint.value) return;
  form.value = {
    name: selectedBlueprint.value.name,
    description: selectedBlueprint.value.description || '',
    category: selectedBlueprint.value.category,
    quality: selectedBlueprint.value.quality,
    learned: selectedBlueprint.value.learned,
    craftTime: selectedBlueprint.value.craftTime,
    nodeTypes: [...selectedBlueprint.value.nodeTypes],
    nodeTierRequired: selectedBlueprint.value.nodeTierRequired,
    inputs: selectedBlueprint.value.inputs.map((i) => ({ ...i })),
    outputs: selectedBlueprint.value.outputs.map((o) => ({ ...o })),
    icon: selectedBlueprint.value.icon || '',
  };
  isEditing.value = true;
  isCreating.value = false;
}

// Start creating new
function startCreate() {
  selectedBlueprint.value = null;
  form.value = {
    name: '',
    description: '',
    category: BlueprintCategory.REFINEMENT,
    quality: BlueprintQuality.COMMON,
    learned: true, // Default: requires learning
    craftTime: 60,
    nodeTypes: [],
    nodeTierRequired: 1,
    inputs: [],
    outputs: [],
    icon: '',
  };
  isEditing.value = false;
  isCreating.value = true;
}

// Save blueprint
async function save() {
  saving.value = true;
  error.value = null;
  try {
    const data = {
      name: form.value.name,
      description: form.value.description || null,
      category: form.value.category,
      quality: form.value.quality,
      learned: form.value.learned,
      craftTime: form.value.craftTime,
      nodeTypes: form.value.nodeTypes,
      nodeTierRequired: form.value.nodeTierRequired,
      inputs: form.value.inputs,
      outputs: form.value.outputs,
      icon: form.value.icon || null,
    };

    if (isCreating.value) {
      const response = await blueprintsApi.create(data);
      selectedBlueprint.value = response.data;
    } else if (selectedBlueprint.value) {
      const response = await blueprintsApi.update(selectedBlueprint.value.id, data);
      selectedBlueprint.value = response.data;
    }

    isEditing.value = false;
    isCreating.value = false;
    await fetchBlueprints();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save blueprint';
    console.error('Failed to save blueprint:', err);
  } finally {
    saving.value = false;
  }
}

// Delete blueprint
async function deleteBlueprint() {
  if (!selectedBlueprint.value) return;
  if (!confirm(`Delete "${selectedBlueprint.value.name}"?`)) return;

  saving.value = true;
  try {
    await blueprintsApi.delete(selectedBlueprint.value.id);
    selectedBlueprint.value = null;
    isEditing.value = false;
    await fetchBlueprints();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete blueprint';
  } finally {
    saving.value = false;
  }
}

// Duplicate blueprint
async function duplicateBlueprint() {
  if (!selectedBlueprint.value) return;
  saving.value = true;
  try {
    const response = await blueprintsApi.duplicate(selectedBlueprint.value.id);
    selectedBlueprint.value = response.data;
    await fetchBlueprints();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to duplicate blueprint';
  } finally {
    saving.value = false;
  }
}

// Cancel editing
function cancel() {
  isEditing.value = false;
  isCreating.value = false;
  if (selectedBlueprint.value) {
    selectBlueprint(selectedBlueprint.value);
  }
}

// Create items state
const creatingItems = ref(false);
const createItemError = ref<string | null>(null);

// Quality to efficiency mapping for node cores
const qualityEfficiencyMap: Record<BlueprintQuality, number> = {
  [BlueprintQuality.COMMON]: 1,
  [BlueprintQuality.UNCOMMON]: 2,
  [BlueprintQuality.RARE]: 3,
  [BlueprintQuality.EPIC]: 4,
  [BlueprintQuality.LEGENDARY]: 5,
};

// Quality to required node tier mapping
const qualityTierMap: Record<BlueprintQuality, number> = {
  [BlueprintQuality.COMMON]: 1,
  [BlueprintQuality.UNCOMMON]: 1,
  [BlueprintQuality.RARE]: 1,
  [BlueprintQuality.EPIC]: 2,
  [BlueprintQuality.LEGENDARY]: 2,
};

// Helper to infer output item name from blueprint name
function inferOutputItemName(blueprintName: string): string {
  // Remove "Blueprint" (case insensitive) from the name
  return blueprintName.replace(/\s*blueprint\s*/gi, '').trim();
}

// Helper to generate itemId from name
function generateItemId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Create all quality variants of both blueprint items and output items
async function createItems() {
  // Need to save first if creating a new blueprint
  if (isCreating.value) {
    await save();
    if (!selectedBlueprint.value) return; // Save failed
  }

  if (!selectedBlueprint.value && !form.value.name) {
    createItemError.value = 'Please save the blueprint first';
    return;
  }

  const blueprintId = selectedBlueprint.value?.id;
  const blueprintName = selectedBlueprint.value?.name || form.value.name;
  const blueprintIcon = selectedBlueprint.value?.icon || form.value.icon;
  const blueprintCategory = selectedBlueprint.value?.category || form.value.category;
  const blueprintNodeTypes = selectedBlueprint.value?.nodeTypes || form.value.nodeTypes;
  // Use the first crafting station as the target node type for created items
  const targetNodeType = blueprintNodeTypes.length > 0 ? blueprintNodeTypes[0] : null;

  creatingItems.value = true;
  createItemError.value = null;

  const allQualities = Object.values(BlueprintQuality);
  const createdBlueprints: string[] = [];
  const createdOutputs: string[] = [];
  const createdOutputItemIds: { quality: BlueprintQuality; itemId: string }[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Determine if this is a node core blueprint (by category OR if name contains "Core")
  const isNodeCore = blueprintCategory === BlueprintCategory.NODE_CORE ||
    blueprintName.toLowerCase().includes('core');

  // Generate base itemIds
  const blueprintBaseName = generateItemId(blueprintName);
  const outputItemName = inferOutputItemName(blueprintName);
  const outputBaseName = generateItemId(outputItemName);

  // Helper to check if item with same name and quality already exists
  const itemExists = (name: string, quality: BlueprintQuality): { exists: boolean; itemId: string | null } => {
    const existing = dbItems.value.find(
      (item) => item.name === name && item.quality === quality
    );
    return { exists: !!existing, itemId: existing?.itemId || null };
  };

  // First, fetch all existing blueprint variants with the same name to build quality -> blueprintId mapping
  let blueprintsByQuality: Map<BlueprintQuality, string> = new Map();
  try {
    const existingBlueprintsResponse = await blueprintsApi.getAll({ search: blueprintName, limit: 100 });
    const matchingBlueprints = existingBlueprintsResponse.data.blueprints.filter(
      (bp: Blueprint) => bp.name === blueprintName
    );
    for (const bp of matchingBlueprints) {
      blueprintsByQuality.set(bp.quality, bp.id);
    }
  } catch (err) {
    errors.push(`Failed to fetch existing blueprints: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Create all quality variants
  for (const quality of allQualities) {
    const qualitySuffix = quality.toLowerCase();
    const qualityName = BLUEPRINT_QUALITY_NAMES[quality] || quality;
    const requiredTier = qualityTierMap[quality];

    // Get the blueprint ID for this specific quality
    const qualityBlueprintId = blueprintsByQuality.get(quality) || null;

    // 1. Create Blueprint Item (teaches the recipe)
    const blueprintItemId = `${blueprintBaseName}_${qualitySuffix}`;

    // Check if blueprint item with same name and quality already exists
    const existingBlueprint = itemExists(blueprintName, quality);
    if (existingBlueprint.exists) {
      skipped.push(`${qualityName} Blueprint`);
    } else {
      try {
        await itemsApi.create({
          itemId: blueprintItemId,
          name: blueprintName,
          description: `${qualityName} quality blueprint. Teaches: ${outputItemName}. Requires Tier ${requiredTier} crafting station.`,
          category: DbItemCategory.BLUEPRINT,
          quality,
          icon: blueprintIcon || null,
          color: BLUEPRINT_QUALITY_COLORS[quality] || '#888888',
          stackSize: 100,
          linkedBlueprintId: qualityBlueprintId,
          ...(targetNodeType && { targetNodeType }),
        });
        createdBlueprints.push(`${qualityName} Blueprint`);
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
          if (axiosErr.response?.status === 409 || axiosErr.response?.data?.error?.includes('already exists')) {
            skipped.push(`${qualityName} Blueprint`);
          } else {
            errors.push(`${qualityName} Blueprint: ${axiosErr.response?.data?.error || 'Unknown error'}`);
          }
        } else {
          errors.push(`${qualityName} Blueprint: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    // 2. Create Output Item (the craftable result)
    const outputItemId = `${outputBaseName}_${qualitySuffix}`;

    // For node cores, set efficiency based on quality
    const efficiency = isNodeCore ? qualityEfficiencyMap[quality] : undefined;
    // Map blueprint category to output item category
    let outputCategory: DbItemCategory;
    switch (blueprintCategory) {
      case BlueprintCategory.NODE_CORE:
        outputCategory = DbItemCategory.NODE_CORE;
        break;
      case BlueprintCategory.UNIT:
        outputCategory = DbItemCategory.UNIT;
        break;
      case BlueprintCategory.BUILDINGS:
        outputCategory = DbItemCategory.BUILDING;
        break;
      default:
        outputCategory = DbItemCategory.CRAFTED;
    }

    // Check if output item with same name and quality already exists
    const existingOutput = itemExists(outputItemName, quality);
    if (existingOutput.exists) {
      skipped.push(`${qualityName} ${outputItemName}`);
      // Still track it for linking since it exists
      createdOutputItemIds.push({ quality, itemId: existingOutput.itemId || outputItemId });
    } else {
      try {
        await itemsApi.create({
          itemId: outputItemId,
          name: outputItemName,
          description: `${qualityName} quality ${outputItemName}`,
          category: outputCategory,
          quality,
          icon: blueprintIcon || null,
          color: BLUEPRINT_QUALITY_COLORS[quality] || '#888888',
          stackSize: 100,
          // Link output item to the blueprint of the same quality
          linkedBlueprintId: qualityBlueprintId,
          ...(efficiency !== undefined && { efficiency }),
          ...(targetNodeType && { targetNodeType }),
        });
        createdOutputs.push(`${qualityName} ${outputItemName}`);
        createdOutputItemIds.push({ quality, itemId: outputItemId });
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
          if (axiosErr.response?.status === 409 || axiosErr.response?.data?.error?.includes('already exists')) {
            skipped.push(`${qualityName} ${outputItemName}`);
            // Still track it for linking since it exists
            createdOutputItemIds.push({ quality, itemId: outputItemId });
          } else {
            errors.push(`${qualityName} ${outputItemName}: ${axiosErr.response?.data?.error || 'Unknown error'}`);
          }
        } else {
          errors.push(`${qualityName} ${outputItemName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  }

  // 3. Update ALL blueprints with the same name to reference their matching quality output items
  if (createdOutputItemIds.length > 0) {
    try {
      // Re-fetch blueprints to get latest data
      const allBlueprintsResponse = await blueprintsApi.getAll({ search: blueprintName, limit: 100 });
      const matchingBlueprints = allBlueprintsResponse.data.blueprints.filter(
        (bp: Blueprint) => bp.name === blueprintName
      );

      // Update each blueprint with its matching quality output item
      for (const bp of matchingBlueprints) {
        const matchingOutput = createdOutputItemIds.find(o => o.quality === bp.quality);
        if (matchingOutput) {
          try {
            const response = await blueprintsApi.update(bp.id, {
              outputs: [{ itemId: matchingOutput.itemId, quantity: 1 }],
            });
            // Update the selected blueprint if it's the one we just updated
            if (bp.id === blueprintId) {
              selectedBlueprint.value = response.data;
              // Also update form if in edit mode
              if (isEditing.value) {
                form.value.outputs = [{ itemId: matchingOutput.itemId, quantity: 1 }];
              }
            }
          } catch (err) {
            errors.push(`Failed to update ${BLUEPRINT_QUALITY_NAMES[bp.quality]} blueprint outputs: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }
      }
    } catch (err) {
      errors.push(`Failed to fetch blueprints for linking: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  creatingItems.value = false;

  // Refresh items list so new items appear in dropdowns
  await fetchItems(true);

  // Refresh blueprints list to show updated outputs
  await fetchBlueprints();

  // Build result message
  const messages: string[] = [];
  if (createdBlueprints.length > 0) {
    messages.push(`Blueprints created: ${createdBlueprints.length}`);
  }
  if (createdOutputs.length > 0) {
    messages.push(`Output items created: ${createdOutputs.length}`);
  }
  if (skipped.length > 0) {
    messages.push(`Skipped (already exist): ${skipped.length}`);
  }
  if (errors.length > 0) {
    messages.push(`Errors: ${errors.join('; ')}`);
    createItemError.value = errors.join('; ');
  }

  alert(messages.join('\n'));
}

// Material management with item selector
function addInputItem(item: SelectableItem) {
  // Check if already exists
  const existingIndex = form.value.inputs.findIndex((i) => i.itemId === item.id);
  if (existingIndex >= 0) {
    const existing = form.value.inputs[existingIndex];
    if (existing) {
      existing.quantity += 1;
    }
    // Focus the existing item's quantity input
    nextTick(() => {
      inputQtyRefs.value[existingIndex]?.focus();
      inputQtyRefs.value[existingIndex]?.select();
    });
  } else {
    form.value.inputs.push({ itemId: item.id, quantity: 1 });
    // Focus the new item's quantity input (last in list)
    nextTick(() => {
      const newIndex = form.value.inputs.length - 1;
      inputQtyRefs.value[newIndex]?.focus();
      inputQtyRefs.value[newIndex]?.select();
    });
  }
  inputSearchQuery.value = '';
  showInputDropdown.value = false;
}

function removeInput(index: number) {
  form.value.inputs.splice(index, 1);
}

function addOutputItem(item: SelectableItem) {
  // Check if already exists
  const existingIndex = form.value.outputs.findIndex((o) => o.itemId === item.id);
  if (existingIndex >= 0) {
    const existing = form.value.outputs[existingIndex];
    if (existing) {
      existing.quantity += 1;
    }
    // Focus the existing item's quantity input
    nextTick(() => {
      outputQtyRefs.value[existingIndex]?.focus();
      outputQtyRefs.value[existingIndex]?.select();
    });
  } else {
    form.value.outputs.push({ itemId: item.id, quantity: 1 });
    // Focus the new item's quantity input (last in list)
    nextTick(() => {
      const newIndex = form.value.outputs.length - 1;
      outputQtyRefs.value[newIndex]?.focus();
      outputQtyRefs.value[newIndex]?.select();
    });
  }
  outputSearchQuery.value = '';
  showOutputDropdown.value = false;
}

function removeOutput(index: number) {
  form.value.outputs.splice(index, 1);
}

// Keyboard navigation for input item dropdown
function handleInputKeydown(event: KeyboardEvent) {
  const items = filteredInputItems.value.slice(0, 10);
  if (!showInputDropdown.value || items.length === 0) {
    // If dropdown not showing but has query, show it on arrow down
    if (event.key === 'ArrowDown' && inputSearchQuery.value) {
      showInputDropdown.value = true;
      inputDropdownIndex.value = 0;
      event.preventDefault();
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      inputDropdownIndex.value = (inputDropdownIndex.value + 1) % items.length;
      break;
    case 'ArrowUp':
      event.preventDefault();
      inputDropdownIndex.value = (inputDropdownIndex.value - 1 + items.length) % items.length;
      break;
    case 'Tab':
      event.preventDefault();
      if (event.shiftKey) {
        inputDropdownIndex.value = (inputDropdownIndex.value - 1 + items.length) % items.length;
      } else {
        inputDropdownIndex.value = (inputDropdownIndex.value + 1) % items.length;
      }
      break;
    case 'Enter':
      event.preventDefault();
      const selectedItem = items[inputDropdownIndex.value];
      if (selectedItem) {
        addInputItem(selectedItem);
      }
      break;
    case 'Escape':
      showInputDropdown.value = false;
      break;
  }
}

// Keyboard navigation for output item dropdown
function handleOutputKeydown(event: KeyboardEvent) {
  const items = filteredOutputItems.value.slice(0, 10);
  if (!showOutputDropdown.value || items.length === 0) {
    // If dropdown not showing but has query, show it on arrow down
    if (event.key === 'ArrowDown' && outputSearchQuery.value) {
      showOutputDropdown.value = true;
      outputDropdownIndex.value = 0;
      event.preventDefault();
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      outputDropdownIndex.value = (outputDropdownIndex.value + 1) % items.length;
      break;
    case 'ArrowUp':
      event.preventDefault();
      outputDropdownIndex.value = (outputDropdownIndex.value - 1 + items.length) % items.length;
      break;
    case 'Tab':
      event.preventDefault();
      if (event.shiftKey) {
        outputDropdownIndex.value = (outputDropdownIndex.value - 1 + items.length) % items.length;
      } else {
        outputDropdownIndex.value = (outputDropdownIndex.value + 1) % items.length;
      }
      break;
    case 'Enter':
      event.preventDefault();
      const selectedItem = items[outputDropdownIndex.value];
      if (selectedItem) {
        addOutputItem(selectedItem);
      }
      break;
    case 'Escape':
      showOutputDropdown.value = false;
      break;
  }
}

// Toggle node type
function toggleNodeType(nodeType: NodeType) {
  const index = form.value.nodeTypes.indexOf(nodeType);
  if (index >= 0) {
    form.value.nodeTypes.splice(index, 1);
  } else {
    form.value.nodeTypes.push(nodeType);
  }
}

// Helper to get quality color
function getQualityColor(quality: BlueprintQuality): string {
  return BLUEPRINT_QUALITY_COLORS[quality] || '#FFFFFF';
}

// Close dropdowns when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.item-selector')) {
    showInputDropdown.value = false;
    showOutputDropdown.value = false;
  }
  // Close context menu when clicking outside
  if (!target.closest('.context-menu')) {
    showContextMenu.value = false;
  }
}

// Context menu handlers
function handleBlueprintContextMenu(event: MouseEvent, blueprint: Blueprint) {
  event.preventDefault();
  contextMenuBlueprint.value = blueprint;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  showContextMenu.value = true;
}

function closeContextMenu() {
  showContextMenu.value = false;
  contextMenuBlueprint.value = null;
}

// Create missing quality variants of a blueprint
async function createVariants() {
  if (!contextMenuBlueprint.value) return;

  const baseBp = contextMenuBlueprint.value;
  closeContextMenu();

  creatingItems.value = true;
  createItemError.value = null;

  const allQualities = Object.values(BlueprintQuality);
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  try {
    // Fetch all existing blueprints with the same name to find existing qualities
    const existingResponse = await blueprintsApi.getAll({ search: baseBp.name, limit: 100 });
    const existingBlueprints = existingResponse.data.blueprints.filter(
      (bp: Blueprint) => bp.name === baseBp.name
    );
    const existingQualities = new Set(existingBlueprints.map((bp: Blueprint) => bp.quality));

    // Create missing quality variants
    for (const quality of allQualities) {
      if (existingQualities.has(quality)) {
        skipped.push(BLUEPRINT_QUALITY_NAMES[quality]);
        continue;
      }

      try {
        await blueprintsApi.create({
          name: baseBp.name,
          description: baseBp.description || null,
          category: baseBp.category,
          quality: quality,
          learned: true, // New variants require learning by default
          craftTime: baseBp.craftTime,
          nodeTypes: baseBp.nodeTypes,
          nodeTierRequired: qualityTierMap[quality], // Use quality-based tier
          inputs: baseBp.inputs.map((i) => ({ ...i })),
          outputs: [], // Empty outputs until items are created
          icon: baseBp.icon || null,
        });
        created.push(BLUEPRINT_QUALITY_NAMES[quality]);
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'response' in err) {
          const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
          if (axiosErr.response?.status === 409 || axiosErr.response?.data?.error?.includes('already exists')) {
            skipped.push(BLUEPRINT_QUALITY_NAMES[quality]);
          } else {
            errors.push(`${BLUEPRINT_QUALITY_NAMES[quality]}: ${axiosErr.response?.data?.error || 'Unknown error'}`);
          }
        } else {
          errors.push(`${BLUEPRINT_QUALITY_NAMES[quality]}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to fetch existing blueprints: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  creatingItems.value = false;

  // Refresh blueprints list
  await fetchBlueprints();

  // Build result message
  const messages: string[] = [];
  if (created.length > 0) {
    messages.push(`Created: ${created.join(', ')}`);
  }
  if (skipped.length > 0) {
    messages.push(`Already exist: ${skipped.join(', ')}`);
  }
  if (errors.length > 0) {
    messages.push(`Errors: ${errors.join('; ')}`);
    createItemError.value = errors.join('; ');
  }

  alert(messages.join('\n') || 'No variants to create');
}

// Icon upload functions
function triggerIconUpload() {
  iconFileInput.value?.click();
}

async function handleIconUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    iconUploadError.value = 'Invalid file type. Allowed: PNG, JPG, GIF, WebP, SVG';
    return;
  }

  // Validate file size (1MB max)
  if (file.size > 1024 * 1024) {
    iconUploadError.value = 'File too large. Maximum size: 1MB';
    return;
  }

  uploadingIcon.value = true;
  iconUploadError.value = null;

  try {
    // Convert file to base64
    const base64 = await fileToBase64(file);

    // Upload to server
    const response = await uploadsApi.uploadIcon({
      data: base64,
      filename: file.name,
    });

    // Set the icon URL in the form
    form.value.icon = response.data.url;
  } catch (err) {
    iconUploadError.value = err instanceof Error ? err.message : 'Failed to upload icon';
    console.error('Failed to upload icon:', err);
  } finally {
    uploadingIcon.value = false;
    // Reset file input
    input.value = '';
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Return the full data URL (includes mime type prefix)
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function clearIcon() {
  form.value.icon = '';
}

// Get full icon URL
function getIconUrl(iconPath: string | null | undefined): string | null {
  if (!iconPath) return null;
  // If it's already an absolute URL, return as-is
  if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
    return iconPath;
  }
  // Public folder icons (like /icons/items/...) are served directly
  if (iconPath.startsWith('/icons/')) {
    return iconPath;
  }
  // Prepend API base URL for uploaded icons
  return `${apiBaseUrl}${iconPath}`;
}

// Initialize
onMounted(() => {
  fetchBlueprints();
  fetchItems(); // Load items for selection dropdowns
  document.addEventListener('click', handleClickOutside);
});
</script>

<template>
  <div class="blueprint-editor">
    <!-- Header -->
    <div class="editor-header">
      <h2>Blueprint Editor</h2>
      <button class="btn btn-primary" @click="startCreate">
        + New Blueprint
      </button>
    </div>

    <!-- Error display -->
    <div v-if="error" class="error-banner">
      {{ error }}
      <button @click="error = null">&times;</button>
    </div>

    <div class="editor-content">
      <!-- Left panel: List with filters -->
      <div class="list-panel">
        <!-- Filters -->
        <div class="filters">
          <div class="filter-row">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search blueprints..."
              class="search-input"
            />
            <button
              type="button"
              class="btn-reset"
              title="Reset filters"
              @click="resetFilters"
            >
              Reset
            </button>
          </div>
          <select v-model="filterCategory" class="filter-select">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ BLUEPRINT_CATEGORY_NAMES[cat] }}
            </option>
          </select>
          <select v-model="filterQuality" class="filter-select">
            <option value="">All Qualities</option>
            <option v-for="q in qualities" :key="q" :value="q">
              {{ BLUEPRINT_QUALITY_NAMES[q] }}
            </option>
          </select>
          <select v-model="filterLearned" class="filter-select">
            <option value="">All Types</option>
            <option value="false">Default (Known)</option>
            <option value="true">Learned Only</option>
          </select>
        </div>

        <!-- Blueprint list -->
        <div class="blueprint-list">
          <div v-if="loading" class="loading">Loading...</div>
          <div v-else-if="blueprints.length === 0" class="empty">
            No blueprints found
          </div>
          <div
            v-for="bp in blueprints"
            :key="bp.id"
            class="blueprint-item"
            :class="{ selected: selectedBlueprint?.id === bp.id }"
            @click="selectBlueprint(bp)"
            @contextmenu="handleBlueprintContextMenu($event, bp)"
          >
            <div class="item-header">
              <span class="item-name" :style="{ color: getQualityColor(bp.quality) }">{{ bp.name }}</span>
              <span v-if="bp.inputs.length === 0 || bp.outputs.length === 0" class="disabled-badge">Disabled</span>
              <span v-if="bp.learned" class="learned-badge">Learned</span>
            </div>
            <div class="item-meta">
              <span class="category">{{ BLUEPRINT_CATEGORY_NAMES[bp.category] }}</span>
              <span class="craft-time">{{ formatCraftTime(bp.craftTime) }}</span>
            </div>
          </div>
        </div>

        <div class="list-footer">
          <span>{{ total }} blueprints</span>
        </div>
      </div>

      <!-- Right panel: Detail/Edit form -->
      <div class="detail-panel">
        <!-- No selection -->
        <div v-if="!selectedBlueprint && !isCreating" class="no-selection">
          <p>Select a blueprint to view details or create a new one</p>
        </div>

        <!-- View mode -->
        <div v-else-if="selectedBlueprint && !isEditing && !isCreating" class="detail-view">
          <div class="detail-header" :style="{ borderColor: getQualityColor(selectedBlueprint.quality) }">
            <div class="detail-header-left">
              <div v-if="selectedBlueprint.icon" class="detail-icon">
                <img :src="getIconUrl(selectedBlueprint.icon) || ''" alt="" class="detail-icon-img" />
              </div>
              <h3 :style="{ color: getQualityColor(selectedBlueprint.quality) }">
                {{ selectedBlueprint.name }}
              </h3>
            </div>
            <span class="quality-badge" :style="{ backgroundColor: getQualityColor(selectedBlueprint.quality) }">
              {{ BLUEPRINT_QUALITY_NAMES[selectedBlueprint.quality] }}
            </span>
          </div>

          <div class="detail-body">
            <div class="detail-row">
              <label>Category</label>
              <span>{{ BLUEPRINT_CATEGORY_NAMES[selectedBlueprint.category] }}</span>
            </div>
            <div class="detail-row">
              <label>Learning Required</label>
              <span>{{ selectedBlueprint.learned ? 'Yes (must be discovered)' : 'No (known by default)' }}</span>
            </div>
            <div class="detail-row">
              <label>Craft Time</label>
              <span>{{ formatCraftTime(selectedBlueprint.craftTime) }}</span>
            </div>
            <div class="detail-row">
              <label>Required Node Tier</label>
              <span>Tier {{ selectedBlueprint.nodeTierRequired }}</span>
            </div>
            <div class="detail-row">
              <label>Crafting Stations</label>
              <div class="node-types">
                <span v-for="nt in selectedBlueprint.nodeTypes" :key="nt" class="node-type-tag">
                  {{ nt.replace(/_/g, ' ') }}
                </span>
              </div>
            </div>
            <div v-if="selectedBlueprint.description" class="detail-row">
              <label>Description</label>
              <p class="description">{{ selectedBlueprint.description }}</p>
            </div>

            <div class="materials-section">
              <h4>Inputs</h4>
              <div v-if="selectedBlueprint.inputs.length === 0" class="empty-materials warning">
                No inputs defined - blueprint is disabled
              </div>
              <div v-for="(input, i) in selectedBlueprint.inputs" :key="i" class="material-row">
                <span class="material-icon">
                  <img v-if="getItemInfo(input.itemId)?.icon?.startsWith('/')" :src="getItemIconUrl(getItemInfo(input.itemId)?.icon) || ''" alt="" class="material-icon-img" />
                  <span v-else>{{ getItemInfo(input.itemId)?.icon || '?' }}</span>
                </span>
                <span class="material-qty">{{ input.quantity }}x</span>
                <span class="material-name" :style="{ color: getItemInfo(input.itemId)?.color || '#FFFFFF' }">{{ getItemInfo(input.itemId)?.name || input.itemId }}</span>
              </div>
            </div>

            <div class="materials-section">
              <h4>Outputs</h4>
              <div v-if="selectedBlueprint.outputs.length === 0" class="empty-materials warning">
                No outputs defined - blueprint is disabled
              </div>
              <div v-for="(output, i) in selectedBlueprint.outputs" :key="i" class="material-row">
                <span class="material-icon">
                  <img v-if="getItemInfo(output.itemId)?.icon?.startsWith('/')" :src="getItemIconUrl(getItemInfo(output.itemId)?.icon) || ''" alt="" class="material-icon-img" />
                  <span v-else>{{ getItemInfo(output.itemId)?.icon || '?' }}</span>
                </span>
                <span class="material-qty">{{ output.quantity }}x</span>
                <span class="material-name" :style="{ color: getItemInfo(output.itemId)?.color || '#FFFFFF' }">{{ getItemInfo(output.itemId)?.name || output.itemId }}</span>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <button class="btn btn-primary" @click="startEdit">Edit</button>
            <button class="btn btn-secondary" @click="duplicateBlueprint" :disabled="saving">
              Duplicate
            </button>
            <button class="btn btn-danger" @click="deleteBlueprint" :disabled="saving">
              Delete
            </button>
            <div class="form-actions-spacer"></div>
            <button
              class="btn btn-create-items"
              @click="createItems"
              :disabled="creatingItems"
              title="Create all 5 quality variants of blueprint items and output items"
            >
              {{ creatingItems ? 'Creating...' : 'Create Items' }}
            </button>
          </div>
          <div v-if="createItemError" class="create-item-error">
            {{ createItemError }}
          </div>
        </div>

        <!-- Edit/Create mode -->
        <div v-else class="edit-form">
          <div class="form-header" :style="{ borderColor: qualityColor }">
            <h3>{{ isCreating ? 'New Blueprint' : 'Edit Blueprint' }}</h3>
          </div>

          <div class="form-body">
            <!-- Basic info -->
            <div class="form-group">
              <label>Name *</label>
              <input v-model="form.name" type="text" placeholder="Blueprint name" class="form-input" />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea v-model="form.description" placeholder="Optional description" rows="2" class="form-input"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Category *</label>
                <select v-model="form.category" class="form-input">
                  <option v-for="cat in categories" :key="cat" :value="cat">
                    {{ BLUEPRINT_CATEGORY_NAMES[cat] }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label>Quality *</label>
                <select v-model="form.quality" class="form-input quality-select" :style="{ color: qualityColor }">
                  <option
                    v-for="q in qualities"
                    :key="q"
                    :value="q"
                  >
                    {{ BLUEPRINT_QUALITY_NAMES[q] }}
                  </option>
                </select>
              </div>
            </div>

            <div class="form-group checkbox-group">
              <label class="checkbox-label">
                <input v-model="form.learned" type="checkbox" />
                <span>Requires Learning (must be discovered/unlocked)</span>
              </label>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Craft Time (seconds) *</label>
                <input v-model.number="form.craftTime" type="number" min="0" class="form-input" />
                <span class="hint">{{ formatCraftTime(form.craftTime) }}</span>
              </div>

              <div class="form-group">
                <label>Required Node Tier *</label>
                <div class="tier-toggle-group">
                  <button
                    v-for="tier in [1, 2, 3, 4, 5]"
                    :key="tier"
                    type="button"
                    class="tier-toggle"
                    :class="{ selected: form.nodeTierRequired === tier }"
                    @click="form.nodeTierRequired = tier"
                  >
                    T{{ tier }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Crafting stations -->
            <div class="form-group">
              <label>Crafting Stations *</label>
              <div class="node-type-grid">
                <label
                  v-for="nt in nodeTypes"
                  :key="nt"
                  class="node-type-checkbox"
                  :class="{ selected: form.nodeTypes.includes(nt) }"
                >
                  <input
                    type="checkbox"
                    :checked="form.nodeTypes.includes(nt)"
                    @change="toggleNodeType(nt)"
                  />
                  {{ nt.replace(/_/g, ' ') }}
                </label>
              </div>
            </div>

            <!-- Inputs with item selector -->
            <div class="materials-editor">
              <div class="materials-header">
                <h4>Input Materials</h4>
              </div>

              <!-- Current inputs -->
              <div v-if="form.inputs.length === 0" class="empty-materials warning">
                No inputs - blueprint will be disabled until inputs and outputs are defined
              </div>
              <div v-for="(input, i) in form.inputs" :key="i" class="material-edit-row">
                <span class="material-icon">
                  <img v-if="getItemInfo(input.itemId)?.icon?.startsWith('/')" :src="getItemIconUrl(getItemInfo(input.itemId)?.icon) || ''" alt="" class="material-icon-img" />
                  <span v-else>{{ getItemInfo(input.itemId)?.icon || '?' }}</span>
                </span>
                <span class="material-name" :style="{ color: getItemInfo(input.itemId)?.color || '#FFFFFF' }">{{ getItemInfo(input.itemId)?.name || input.itemId }}</span>
                <div class="quantity-control">
                  <button type="button" class="qty-btn" @click="input.quantity = Math.max(1, input.quantity - 1)">-</button>
                  <input
                    :ref="(el) => inputQtyRefs[i] = el as HTMLInputElement"
                    v-model.number="input.quantity"
                    type="number"
                    min="1"
                    class="qty-input"
                    @keydown.enter="save"
                  />
                  <button type="button" class="qty-btn" @click="input.quantity++">+</button>
                </div>
                <button type="button" class="btn-remove" @click="removeInput(i)">
                  &times;
                </button>
              </div>

              <!-- Item selector -->
              <div class="item-selector">
                <input
                  v-model="inputSearchQuery"
                  type="text"
                  placeholder="Search items to add..."
                  class="item-search"
                  @focus="showInputDropdown = true"
                  @keydown="handleInputKeydown"
                />
                <div v-if="showInputDropdown && inputSearchQuery" class="item-dropdown">
                  <div
                    v-for="(item, index) in filteredInputItems.slice(0, 10)"
                    :key="item.id"
                    class="item-option"
                    :class="{ highlighted: index === inputDropdownIndex }"
                    @click="addInputItem(item)"
                    @mouseenter="inputDropdownIndex = index"
                  >
                    <span class="item-icon">
                      <img v-if="item.icon.startsWith('/')" :src="getItemIconUrl(item.icon) || ''" alt="" class="item-icon-img" />
                      <span v-else>{{ item.icon }}</span>
                    </span>
                    <span class="item-label" :style="{ color: item.color }">{{ item.name }}</span>
                    <span class="item-category-badge">{{ item.category }}</span>
                  </div>
                  <div v-if="filteredInputItems.length === 0" class="no-results">
                    No items found
                  </div>
                </div>
              </div>
            </div>

            <!-- Outputs with item selector -->
            <div class="materials-editor">
              <div class="materials-header">
                <h4>Output Items</h4>
              </div>

              <!-- Current outputs -->
              <div v-if="form.outputs.length === 0" class="empty-materials warning">
                No outputs - blueprint will be disabled until inputs and outputs are defined
              </div>
              <div v-for="(output, i) in form.outputs" :key="i" class="material-edit-row">
                <span class="material-icon">
                  <img v-if="getItemInfo(output.itemId)?.icon?.startsWith('/')" :src="getItemIconUrl(getItemInfo(output.itemId)?.icon) || ''" alt="" class="material-icon-img" />
                  <span v-else>{{ getItemInfo(output.itemId)?.icon || '?' }}</span>
                </span>
                <span class="material-name" :style="{ color: getItemInfo(output.itemId)?.color || '#FFFFFF' }">{{ getItemInfo(output.itemId)?.name || output.itemId }}</span>
                <div class="quantity-control">
                  <button type="button" class="qty-btn" @click="output.quantity = Math.max(1, output.quantity - 1)">-</button>
                  <input
                    :ref="(el) => outputQtyRefs[i] = el as HTMLInputElement"
                    v-model.number="output.quantity"
                    type="number"
                    min="1"
                    class="qty-input"
                    @keydown.enter="save"
                  />
                  <button type="button" class="qty-btn" @click="output.quantity++">+</button>
                </div>
                <button type="button" class="btn-remove" @click="removeOutput(i)">
                  &times;
                </button>
              </div>

              <!-- Item selector -->
              <div class="item-selector">
                <input
                  v-model="outputSearchQuery"
                  type="text"
                  placeholder="Search items to add..."
                  class="item-search"
                  @focus="showOutputDropdown = true"
                  @keydown="handleOutputKeydown"
                />
                <div v-if="showOutputDropdown && outputSearchQuery" class="item-dropdown">
                  <div
                    v-for="(item, index) in filteredOutputItems.slice(0, 10)"
                    :key="item.id"
                    class="item-option"
                    :class="{ highlighted: index === outputDropdownIndex }"
                    @click="addOutputItem(item)"
                    @mouseenter="outputDropdownIndex = index"
                  >
                    <span class="item-icon">
                      <img v-if="item.icon.startsWith('/')" :src="getItemIconUrl(item.icon) || ''" alt="" class="item-icon-img" />
                      <span v-else>{{ item.icon }}</span>
                    </span>
                    <span class="item-label" :style="{ color: item.color }">{{ item.name }}</span>
                    <span class="item-category-badge">{{ item.category }}</span>
                  </div>
                  <div v-if="filteredOutputItems.length === 0" class="no-results">
                    No items found
                  </div>
                </div>
              </div>
            </div>

            <!-- Icon Upload -->
            <div class="form-group">
              <label>Icon (optional)</label>
              <div class="icon-upload-section">
                <!-- Icon preview -->
                <div v-if="form.icon" class="icon-preview">
                  <img :src="getIconUrl(form.icon) || ''" alt="Blueprint icon" class="preview-image" />
                  <button type="button" class="btn-clear-icon" title="Remove icon" @click="clearIcon">
                    &times;
                  </button>
                </div>
                <div v-else class="icon-placeholder">
                  <span class="placeholder-text">No icon</span>
                </div>

                <!-- Upload controls -->
                <div class="icon-upload-controls">
                  <button
                    type="button"
                    class="btn btn-primary"
                    @click="showIconPicker = true"
                  >
                    Browse Icons
                  </button>
                  <input
                    ref="iconFileInput"
                    type="file"
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                    class="hidden-file-input"
                    @change="handleIconUpload"
                  />
                  <button
                    type="button"
                    class="btn btn-secondary"
                    :disabled="uploadingIcon"
                    @click="triggerIconUpload"
                  >
                    {{ uploadingIcon ? 'Uploading...' : 'Upload Custom' }}
                  </button>
                  <span class="upload-hint">or upload PNG, JPG, GIF, WebP, SVG (max 1MB)</span>
                </div>

                <!-- Upload error -->
                <div v-if="iconUploadError" class="icon-upload-error">
                  {{ iconUploadError }}
                </div>

                <!-- Manual URL input -->
                <div class="icon-url-input">
                  <input
                    v-model="form.icon"
                    type="text"
                    placeholder="Or enter icon URL manually..."
                    class="form-input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button class="btn btn-primary" @click="save" :disabled="saving">
              {{ saving ? 'Saving...' : (isCreating ? 'Create' : 'Save') }}
            </button>
            <button class="btn btn-secondary" @click="cancel" :disabled="saving">
              Cancel
            </button>
            <div class="form-actions-spacer"></div>
            <button
              class="btn btn-create-items"
              @click="createItems"
              :disabled="saving || creatingItems"
              title="Create all 5 quality variants of blueprint items and output items"
            >
              {{ creatingItems ? 'Creating...' : 'Create Items' }}
            </button>
          </div>
          <div v-if="createItemError" class="create-item-error">
            {{ createItemError }}
          </div>
        </div>
      </div>
    </div>

    <!-- Icon Picker Modal -->
    <IconPicker
      v-model="form.icon"
      v-model:show="showIconPicker"
    />

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="context-menu"
        :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      >
        <div class="context-menu-header">
          <span
            class="quality-indicator"
            :style="{ backgroundColor: getQualityColor(contextMenuBlueprint?.quality || BlueprintQuality.COMMON) }"
          ></span>
          <span class="context-menu-title">{{ contextMenuBlueprint?.name }}</span>
        </div>
        <div class="context-menu-item" @click="createVariants">
          <span class="context-menu-icon">📋</span>
          <span>Create Variants</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="closeContextMenu">
          <span class="context-menu-icon">✕</span>
          <span>Cancel</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.blueprint-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f1419;
  color: #e5e5e5;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.editor-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.error-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.error-banner button {
  background: none;
  border: none;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
}

.editor-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* List Panel */
.list-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #2a3040;
  background: #151a24;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
}

.filter-row {
  display: flex;
  gap: 8px;
}

.filter-row .search-input {
  flex: 1;
}

.btn-reset {
  padding: 8px 12px;
  background: #374151;
  border: 1px solid #4b5563;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-reset:hover {
  background: #4b5563;
  color: #e5e5e5;
}

.search-input,
.filter-select {
  width: 100%;
  padding: 8px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.search-input:focus,
.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.blueprint-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.loading,
.empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
}

.blueprint-item {
  padding: 12px;
  margin-bottom: 4px;
  background: #1a1f2e;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.blueprint-item:hover {
  background: #232938;
}

.blueprint-item.selected {
  background: #2a3550;
  border: 1px solid #3b82f6;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.quality-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.disabled-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border-radius: 4px;
  text-transform: uppercase;
}

.learned-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
  border-radius: 4px;
  text-transform: uppercase;
}

.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
}

.list-footer {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #6b7280;
  border-top: 1px solid #2a3040;
}

/* Detail Panel */
.detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.no-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}

.detail-view,
.edit-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header,
.form-header {
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 3px solid;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-header h3,
.form-header h3 {
  margin: 0;
  font-size: 18px;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.detail-icon {
  width: 48px;
  height: 48px;
  background: #0f1419;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.detail-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.quality-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  color: #000;
  font-weight: 600;
}

.detail-body,
.form-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.detail-row {
  margin-bottom: 16px;
}

.detail-row label {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.detail-row span,
.detail-row p {
  font-size: 14px;
}

.description {
  margin: 0;
  color: #9ca3af;
}

.node-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.node-type-tag {
  font-size: 11px;
  padding: 4px 8px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-radius: 4px;
}

.materials-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #2a3040;
}

.materials-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #9ca3af;
}

.empty-materials {
  color: #6b7280;
  font-size: 13px;
  font-style: italic;
  padding: 8px 0;
}

.empty-materials.warning {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 8px 12px;
  border-radius: 4px;
  border-left: 3px solid #f59e0b;
}

.material-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #1a1f2e;
  border-radius: 6px;
  margin-bottom: 6px;
}

.material-icon {
  font-size: 18px;
  width: 28px;
  height: 28px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.material-qty {
  font-weight: 600;
  color: #60a5fa;
  min-width: 40px;
}

.material-name {
  color: #e5e5e5;
  flex: 1;
}

.detail-actions,
.form-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #2a3040;
}

/* Form styles */
.form-group {
  margin-bottom: 16px;
}

.form-group > label {
  display: block;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-input::placeholder {
  color: #4b5563;
}

.quality-select {
  font-weight: 500;
}

.form-group .hint {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.checkbox-group {
  margin-bottom: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-transform: none;
  font-size: 14px;
  color: #e5e5e5;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #3b82f6;
}

.node-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.node-type-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  text-transform: none;
  transition: all 0.15s;
  color: #9ca3af;
}

.node-type-checkbox:hover {
  background: #232938;
}

.node-type-checkbox.selected {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #60a5fa;
}

.node-type-checkbox input {
  display: none;
}

/* Tier toggle buttons */
.tier-toggle-group {
  display: flex;
  gap: 6px;
}

.tier-toggle {
  padding: 8px 14px;
  background: #1a1f2e;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #9ca3af;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.tier-toggle:hover {
  background: #232938;
  color: #e5e5e5;
}

.tier-toggle.selected {
  background: rgba(59, 130, 246, 0.15);
  border-color: #3b82f6;
  color: #60a5fa;
}

/* Materials editor */
.materials-editor {
  margin-bottom: 20px;
  padding: 16px;
  background: #151a24;
  border: 1px solid #2a3040;
  border-radius: 8px;
}

.materials-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.materials-header h4 {
  margin: 0;
  font-size: 14px;
  color: #9ca3af;
}

.material-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #1a1f2e;
  border-radius: 6px;
  margin-bottom: 8px;
}

.material-edit-row .material-icon {
  font-size: 20px;
  width: 32px;
  text-align: center;
}

.material-edit-row .material-name {
  flex: 1;
  font-size: 14px;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #0a0d12;
  border-radius: 4px;
  padding: 2px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a3040;
  border: none;
  border-radius: 4px;
  color: #e5e5e5;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.qty-btn:hover {
  background: #3b82f6;
}

.qty-input {
  width: 50px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: #e5e5e5;
  font-size: 14px;
  text-align: center;
  -moz-appearance: textfield;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.qty-input:focus {
  outline: none;
}

.btn-remove {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border: none;
  border-radius: 4px;
  color: #f87171;
  font-size: 18px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-remove:hover {
  background: rgba(239, 68, 68, 0.3);
}

/* Item selector */
.item-selector {
  position: relative;
  margin-top: 12px;
}

.item-search {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.item-search:focus {
  outline: none;
  border-color: #3b82f6;
}

.item-search::placeholder {
  color: #4b5563;
}

.item-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #1a1f2e;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.item-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.item-option:hover,
.item-option.highlighted {
  background: #2a3550;
}

.item-icon {
  font-size: 18px;
  width: 28px;
  height: 28px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.material-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.item-label {
  flex: 1;
  font-size: 14px;
  color: #e5e5e5;
}

.item-category-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border-radius: 4px;
  text-transform: uppercase;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: #6b7280;
  font-size: 13px;
}

/* Buttons */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-secondary {
  background: #374151;
  color: #e5e5e5;
}

.btn-secondary:hover:not(:disabled) {
  background: #4b5563;
}

.btn-create-items {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.btn-create-items:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.3);
}

.form-actions-spacer {
  flex: 1;
}

.create-item-error {
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  font-size: 13px;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
}

/* Icon upload styles */
.icon-upload-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.icon-preview {
  position: relative;
  display: inline-flex;
  width: 80px;
  height: 80px;
  background: #1a1f2e;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.btn-clear-icon {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.9);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-clear-icon:hover {
  background: #ef4444;
}

.icon-placeholder {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1f2e;
  border: 2px dashed #2a3040;
  border-radius: 8px;
}

.placeholder-text {
  font-size: 12px;
  color: #6b7280;
}

.icon-upload-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hidden-file-input {
  display: none;
}

.upload-hint {
  font-size: 12px;
  color: #6b7280;
}

.icon-upload-error {
  font-size: 12px;
  color: #f87171;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
}

.icon-url-input {
  margin-top: 4px;
}

.icon-url-input .form-input {
  font-size: 13px;
}
</style>

<!-- Non-scoped styles for Teleported context menu -->
<style>
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 200px;
  background: #1a1f2e;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.context-menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #151a24;
  border-bottom: 1px solid #2a3040;
}

.context-menu-header .quality-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.context-menu-title {
  font-size: 13px;
  font-weight: 500;
  color: #e5e5e5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  color: #e5e5e5;
  font-size: 13px;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: #2a3550;
}

.context-menu-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.context-menu-divider {
  height: 1px;
  background: #2a3040;
  margin: 4px 0;
}
</style>
