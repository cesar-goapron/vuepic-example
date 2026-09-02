<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  value: { default: null },
})

const formatValue = (value) => {
  if (value === null || value === undefined) return 'null'
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <section class="card">
    <header class="card-header">
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </header>

    <div class="card-body">
      <slot />
    </div>
    
    <pre class="card-value"><strong>model value:</strong> {{ formatValue(value) }}</pre>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  background: #fff;
  color: #222;
}

.card-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
  color: #111;
}

.card-header p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.card-value {
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: #f5f5f5;
  color: #222;
  border-radius: 6px;
  font-size: 0.8rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
