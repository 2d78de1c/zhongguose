<template>
  <div class="color-container">
    <ColorCard
        v-for="color in colors"
        :key="color.id"
        :color="color"
        @click="selectColor(color)"
    />
  </div>
</template>

<script>
import ColorCard from './ColorCard.vue';

export default {
  name: 'ColorContainer',
  props: {
    colors: { type: Array, default: () => [] }
  },
  components: { ColorCard },
  methods: {
    selectColor(color) {
      this.$emit('select-color', color);
    }
  }
};
</script>

<style scoped>
.color-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>