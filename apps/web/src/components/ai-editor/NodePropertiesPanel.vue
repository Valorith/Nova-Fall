<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import type { GraphNode } from '@vue-flow/core';
import {
  CONDITION_DEFINITIONS,
  ACTION_DEFINITIONS,
  NODE_DESCRIPTIONS,
  NODE_COLORS,
} from '@nova-fall/shared';
import type { BehaviorNodeType, ParamDef, ConditionDef, ActionDef } from '@nova-fall/shared';

interface Props {
  node: GraphNode | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:node', nodeId: string, data: Record<string, unknown>): void;
  (e: 'delete:node', nodeId: string): void;
}>();

// Local form state for editing
const localLabel = ref('');
const localParams = ref<Record<string, unknown>>({});
const selectedDefinitionId = ref<string | null>(null);

// Watch for node changes and sync local state
watch(
  () => props.node,
  (newNode) => {
    if (newNode) {
      localLabel.value = newNode.data.label || '';
      localParams.value = { ...((newNode.data.params as Record<string, unknown>) || {}) };
      selectedDefinitionId.value =
        (newNode.data.conditionId as string) || (newNode.data.actionId as string) || null;
    }
  },
  { immediate: true, deep: true }
);

// Computed properties
const nodeType = computed(() => (props.node?.data.type as BehaviorNodeType) || null);

const nodeColor = computed(() => {
  if (!nodeType.value) return '#6b7280';
  return NODE_COLORS[nodeType.value] || '#6b7280';
});

const nodeDescription = computed(() => {
  if (!nodeType.value) return '';
  return NODE_DESCRIPTIONS[nodeType.value] || '';
});

const isLeafNode = computed(() => {
  return nodeType.value === 'condition' || nodeType.value === 'action';
});

const isDecoratorNode = computed(() => {
  const decorators: BehaviorNodeType[] = ['inverter', 'succeeder', 'repeater', 'until_fail'];
  return nodeType.value ? decorators.includes(nodeType.value) : false;
});

const isCompositeNode = computed(() => {
  const composites: BehaviorNodeType[] = ['selector', 'sequence', 'parallel'];
  return nodeType.value ? composites.includes(nodeType.value) : false;
});

// Get available definitions for leaf nodes
const availableDefinitions = computed((): (ConditionDef | ActionDef)[] => {
  if (nodeType.value === 'condition') {
    return CONDITION_DEFINITIONS;
  } else if (nodeType.value === 'action') {
    return ACTION_DEFINITIONS;
  }
  return [];
});

// Group definitions by category
const groupedDefinitions = computed(() => {
  const groups: Record<string, (ConditionDef | ActionDef)[]> = {};
  for (const def of availableDefinitions.value) {
    const category = def.category;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(def);
  }
  return groups;
});

// Get current definition (for leaf nodes)
const currentDefinition = computed((): ConditionDef | ActionDef | null => {
  if (!selectedDefinitionId.value) return null;
  return availableDefinitions.value.find((d) => d.id === selectedDefinitionId.value) || null;
});

// Get parameters for current node
const nodeParams = computed((): ParamDef[] => {
  // For leaf nodes, use the definition's params
  if (isLeafNode.value && currentDefinition.value) {
    return currentDefinition.value.params;
  }

  // For decorators, add specific params
  if (isDecoratorNode.value) {
    if (nodeType.value === 'repeater') {
      return [
        {
          name: 'count',
          type: 'number',
          label: 'Repeat Count',
          default: 3,
          min: 1,
          max: 100,
        },
      ];
    }
  }

  return [];
});

// Update handlers
function updateLabel() {
  if (!props.node) return;
  emit('update:node', props.node.id, {
    ...props.node.data,
    label: localLabel.value,
  });
}

function updateDefinition(defId: string) {
  if (!props.node) return;
  selectedDefinitionId.value = defId;

  const def = availableDefinitions.value.find((d) => d.id === defId);
  if (!def) return;

  // Reset params to defaults
  const newParams: Record<string, unknown> = {};
  for (const param of def.params) {
    newParams[param.name] = param.default;
  }
  localParams.value = newParams;

  const dataKey = nodeType.value === 'condition' ? 'conditionId' : 'actionId';
  emit('update:node', props.node.id, {
    ...props.node.data,
    [dataKey]: defId,
    label: def.name,
    params: newParams,
  });
}

function updateParam(paramName: string, value: unknown) {
  if (!props.node) return;
  localParams.value[paramName] = value;
  emit('update:node', props.node.id, {
    ...props.node.data,
    params: { ...localParams.value },
  });
}

function deleteNode() {
  if (!props.node) return;
  if (confirm('Delete this node?')) {
    emit('delete:node', props.node.id);
  }
}

// Format node type for display
function formatNodeType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
</script>

<template>
  <div class="node-properties-panel">
    <div v-if="!node" class="no-selection">
      <div class="no-selection-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
      <p>Select a node to edit its properties</p>
    </div>

    <div v-else class="properties-content">
      <!-- Node Type Header -->
      <div class="type-header" :style="{ borderLeftColor: nodeColor }">
        <div class="type-badge" :style="{ backgroundColor: nodeColor }">
          {{ formatNodeType(nodeType || '') }}
        </div>
        <p class="type-description">{{ nodeDescription }}</p>
      </div>

      <!-- Label Editor -->
      <div class="property-section">
        <label class="property-label">Label</label>
        <input
          v-model="localLabel"
          type="text"
          class="property-input"
          placeholder="Node label"
          @blur="updateLabel"
          @keyup.enter="updateLabel"
        />
      </div>

      <!-- Leaf Node: Definition Selector -->
      <div v-if="isLeafNode" class="property-section">
        <label class="property-label">
          {{ nodeType === 'condition' ? 'Condition Type' : 'Action Type' }}
        </label>
        <select
          :value="selectedDefinitionId"
          class="property-select"
          @change="updateDefinition(($event.target as HTMLSelectElement).value)"
        >
          <option value="">Select a {{ nodeType }}...</option>
          <optgroup v-for="(defs, category) in groupedDefinitions" :key="category" :label="category">
            <option v-for="def in defs" :key="def.id" :value="def.id">
              {{ def.name }}
            </option>
          </optgroup>
        </select>

        <!-- Definition Description -->
        <p v-if="currentDefinition" class="definition-description">
          {{ currentDefinition.description }}
        </p>
      </div>

      <!-- Parameters -->
      <div v-if="nodeParams.length > 0" class="property-section">
        <label class="property-label">Parameters</label>

        <div v-for="param in nodeParams" :key="param.name" class="param-row">
          <label class="param-label">
            {{ param.label }}
            <span v-if="param.description" class="param-hint" :title="param.description">?</span>
          </label>

          <!-- Number input -->
          <input
            v-if="param.type === 'number'"
            type="number"
            class="param-input"
            :value="localParams[param.name] ?? param.default"
            :min="param.min"
            :max="param.max"
            :step="param.max && param.max <= 2 ? 0.1 : 1"
            @input="updateParam(param.name, parseFloat(($event.target as HTMLInputElement).value))"
          />

          <!-- Select input -->
          <select
            v-else-if="param.type === 'select'"
            class="param-input"
            :value="localParams[param.name] ?? param.default"
            @change="updateParam(param.name, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="opt in param.options" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>

          <!-- Boolean input -->
          <label v-else-if="param.type === 'boolean'" class="param-checkbox">
            <input
              type="checkbox"
              :checked="(localParams[param.name] as boolean) ?? param.default"
              @change="updateParam(param.name, ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ param.label }}</span>
          </label>

          <!-- String input -->
          <input
            v-else
            type="text"
            class="param-input"
            :value="localParams[param.name] ?? param.default"
            @input="updateParam(param.name, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>

      <!-- Composite Node Info -->
      <div v-if="isCompositeNode" class="property-section">
        <label class="property-label">Behavior</label>
        <div class="info-box">
          <p v-if="nodeType === 'selector'">
            Tries each child in order. Returns <strong>success</strong> when any child succeeds.
            Returns <strong>failure</strong> only if all children fail.
          </p>
          <p v-else-if="nodeType === 'sequence'">
            Runs each child in order. Returns <strong>failure</strong> when any child fails.
            Returns <strong>success</strong> only if all children succeed.
          </p>
          <p v-else-if="nodeType === 'parallel'">
            Runs all children simultaneously. Returns based on policy (all succeed / any succeed).
          </p>
        </div>
      </div>

      <!-- Decorator Node Info -->
      <div v-if="isDecoratorNode && nodeType !== 'repeater'" class="property-section">
        <label class="property-label">Behavior</label>
        <div class="info-box">
          <p v-if="nodeType === 'inverter'">
            Inverts the result of its child. Success becomes failure and vice versa.
          </p>
          <p v-else-if="nodeType === 'succeeder'">
            Always returns success, regardless of what its child returns.
          </p>
          <p v-else-if="nodeType === 'until_fail'">
            Repeats its child until the child returns failure.
          </p>
        </div>
      </div>

      <!-- Delete Button -->
      <div class="actions-section">
        <button class="btn-delete" @click="deleteNode">Delete Node</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-properties-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #151a24;
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: #6b7280;
}

.no-selection-icon {
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-selection p {
  font-size: 14px;
  margin: 0;
}

.properties-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

/* Type Header */
.type-header {
  padding: 16px 20px;
  background: #1a1f2e;
  border-bottom: 1px solid #2a3040;
  border-left: 4px solid #6b7280;
}

.type-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #000;
  margin-bottom: 8px;
}

.type-description {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}

/* Property Sections */
.property-section {
  padding: 16px 20px;
  border-bottom: 1px solid #2a3040;
}

.property-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.property-input,
.property-select {
  width: 100%;
  padding: 10px 12px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 14px;
  transition: border-color 0.15s;
}

.property-input:focus,
.property-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.property-input::placeholder {
  color: #4b5563;
}

.definition-description {
  margin: 8px 0 0;
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

/* Parameters */
.param-row {
  margin-bottom: 12px;
}

.param-row:last-child {
  margin-bottom: 0;
}

.param-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 6px;
}

.param-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: #2a3040;
  border-radius: 50%;
  font-size: 10px;
  cursor: help;
}

.param-input {
  width: 100%;
  padding: 8px 10px;
  background: #0a0d12;
  border: 1px solid #2a3040;
  border-radius: 6px;
  color: #e5e5e5;
  font-size: 13px;
}

.param-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.param-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.param-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: #3b82f6;
}

/* Info Box */
.info-box {
  padding: 12px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
}

.info-box p {
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.5;
}

.info-box strong {
  color: #60a5fa;
}

/* Actions */
.actions-section {
  padding: 16px 20px;
  margin-top: auto;
  border-top: 1px solid #2a3040;
  background: #1a1f2e;
}

.btn-delete {
  width: 100%;
  padding: 10px 16px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-delete:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.4);
}
</style>
