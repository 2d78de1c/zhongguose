<template>
  <div class="color-container">
    <ColorCard
        v-for="color in colors"
        :key="color.slug"
        :color="color"
        :selected="color.slug === selectedSlug"
        @click="$emit('select-color', color)"
    />
  </div>
</template>

<script>
import ColorCard from './ColorCard.vue';

export default {
  name: 'ColorContainer',
  components: { ColorCard },
  emits: ['select-color'],
  props: {
    colors: { type: Array, default: () => [] },
    selectedSlug: { type: String, default: '' },
  },
};
</script>

<style scoped>
.color-container {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

@media (max-width: 768px) {
  .color-container {
    flex-wrap: nowrap;
    justify-content: flex-start;
    max-width: 100%;
    padding: 6px 4px 12px;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .color-container > * {
    flex-shrink: 0;
    scroll-snap-align: start;
  }

  .color-container::-webkit-scrollbar { height: 6px; }
  .color-container::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: color-mix(in srgb, var(--color-ink, #fff) 32%, transparent);
  }
  .color-container::-webkit-scrollbar-track { background: transparent; }
}
</style>
