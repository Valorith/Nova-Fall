<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

interface IconManifest {
  categories: Record<string, string[]>;
}

type IconType = 'items' | 'skills';

const props = defineProps<{
  modelValue: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:show', value: boolean): void;
}>();

const manifests = ref<Record<IconType, IconManifest | null>>({
  items: null,
  skills: null,
});
const loading = ref(true);
const error = ref<string | null>(null);
const selectedType = ref<IconType>('items');
const selectedCategory = ref<string>('');
const searchQuery = ref('');

// Get current manifest based on selected type
const manifest = computed(() => manifests.value[selectedType.value]);

// Fetch both manifests on mount
onMounted(async () => {
  try {
    const [itemsResponse, skillsResponse] = await Promise.all([
      fetch('/icons/items/manifest.json'),
      fetch('/icons/skills/manifest.json'),
    ]);

    if (!itemsResponse.ok) throw new Error('Failed to load items manifest');
    if (!skillsResponse.ok) throw new Error('Failed to load skills manifest');

    manifests.value = {
      items: await itemsResponse.json(),
      skills: await skillsResponse.json(),
    };
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load icons';
  } finally {
    loading.value = false;
  }
});

// Reset selection when modal opens
watch(() => props.show, (isShown) => {
  if (isShown) {
    selectedCategory.value = '';
    searchQuery.value = '';
  }
});

// Reset category when type changes
watch(() => selectedType.value, () => {
  selectedCategory.value = '';
});

// Get all categories
const categories = computed(() => {
  if (!manifest.value) return [];
  return Object.keys(manifest.value.categories).sort();
});

// Get icons for current view (filtered by category and search)
const displayedIcons = computed(() => {
  if (!manifest.value) return [];

  let icons: { path: string; name: string; category: string }[] = [];

  const categoriesToShow = selectedCategory.value
    ? [selectedCategory.value]
    : Object.keys(manifest.value.categories);

  for (const category of categoriesToShow) {
    const categoryIcons = manifest.value.categories[category] || [];
    for (const path of categoryIcons) {
      const name = path.split('/').pop()?.replace('.png', '') || '';
      icons.push({ path, name, category });
    }
  }

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    icons = icons.filter(icon =>
      icon.name.toLowerCase().includes(query) ||
      icon.category.toLowerCase().includes(query)
    );
  }

  return icons;
});

function selectIcon(iconPath: string) {
  emit('update:modelValue', iconPath);
  emit('update:show', false);
}

function close() {
  emit('update:show', false);
}

function formatCategoryName(category: string): string {
  return category.charAt(0) + category.slice(1).toLowerCase();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="icon-picker-overlay" @click.self="close">
      <div class="icon-picker-modal">
        <div class="picker-header">
          <h3>Select Icon</h3>
          <button class="close-btn" @click="close">&times;</button>
        </div>

        <div class="picker-type-tabs">
          <button
            class="type-tab"
            :class="{ active: selectedType === 'items' }"
            @click="selectedType = 'items'"
          >
            Items ({{ Object.values(manifests.items?.categories || {}).flat().length || 0 }})
          </button>
          <button
            class="type-tab"
            :class="{ active: selectedType === 'skills' }"
            @click="selectedType = 'skills'"
          >
            Skills ({{ Object.values(manifests.skills?.categories || {}).flat().length || 0 }})
          </button>
        </div>

        <div class="picker-filters">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search icons..."
            class="search-input"
          />
          <select v-model="selectedCategory" class="category-select">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat" :value="cat">
              {{ formatCategoryName(cat) }} ({{ manifest?.categories[cat]?.length || 0 }})
            </option>
          </select>
        </div>

        <div class="picker-content">
          <div v-if="loading" class="picker-loading">
            Loading icons...
          </div>
          <div v-else-if="error" class="picker-error">
            {{ error }}
          </div>
          <div v-else-if="displayedIcons.length === 0" class="picker-empty">
            No icons found
          </div>
          <div v-else class="icon-grid">
            <button
              v-for="icon in displayedIcons"
              :key="icon.path"
              class="icon-item"
              :class="{ selected: modelValue === icon.path }"
              :title="`${icon.name} (${formatCategoryName(icon.category)})`"
              @click="selectIcon(icon.path)"
            >
              <img :src="icon.path" :alt="icon.name" class="icon-image" />
            </button>
          </div>
        </div>

        <div class="picker-footer">
          <span class="icon-count">{{ displayedIcons.length }} icons</span>
          <button class="btn btn-secondary" @click="close">Cancel</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.icon-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.icon-picker-modal {
  background: #1a1f2e;
  border-radius: 12px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #2a3040;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #2a3040;
}

.picker-header h3 {
  margin: 0;
  font-size: 18px;
  color: #e5e5e5;
}

.picker-type-tabs {
  display: flex;
  background: #151a24;
  padding: 12px 20px 0;
  gap: 4px;
}

.type-tab {
  padding: 10px 20px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  color: #9ca3af;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.type-tab:hover {
  background: #1a1f2e;
  color: #e5e5e5;
}

.type-tab.active {
  background: #1a1f2e;
  color: #3b82f6;
  border-color: #3b82f6;
  border-bottom: 1px solid #1a1f2e;
  margin-bottom: -1px;
}

.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e5e5e5;
}

.picker-filters {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #1a1f2e;
  border-top: 1px solid #3b82f6;
  border-bottom: 1px solid #2a3040;
}

.search-input,
.category-select {
  padding: 10px 14px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
}

.search-input {
  flex: 1;
}

.category-select {
  min-width: 180px;
}

.search-input:focus,
.category-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.picker-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 300px;
}

.picker-loading,
.picker-error,
.picker-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #6b7280;
}

.picker-error {
  color: #f87171;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}

.icon-item {
  aspect-ratio: 1;
  padding: 8px;
  background: #0f1419;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-item:hover {
  background: #232938;
  border-color: #3b82f6;
  transform: scale(1.05);
}

.icon-item.selected {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.icon-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.picker-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid #2a3040;
  background: #151a24;
}

.icon-count {
  font-size: 13px;
  color: #6b7280;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary {
  background: #374151;
  color: #e5e5e5;
}

.btn-secondary:hover {
  background: #4b5563;
}
</style>
