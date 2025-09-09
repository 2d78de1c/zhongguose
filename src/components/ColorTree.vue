<template>
  <div class="color-tree">
    <ColorTreeNode
        v-for="color in colors"
        :key="color.id"
        :color="color"
        @select-color="$emit('select-color', $event)"
    />
  </div>
</template>

<script>
import ColorTreeNode from './ColorTreeNode.vue';

export default {
  name: "ColorTree",
  components: { ColorTreeNode },
  props: {
    colors: { type: Array, default: () => [] }
  }
};
</script>

<style scoped>
.color-tree {
  width: 600px;
}
</style>