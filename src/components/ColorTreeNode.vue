<template>
  <div class="tree-node" :style="{ paddingLeft: depth * 20 + 'px' }" @click="select">
    <span class="node-id">{{ color.id }}</span>
    <span class="node-name">{{ color.Name }}</span>

    <!-- CMYK 圆圈比例 -->
    <div class="cmyk">
      <div class="circle c" :style="{ '--percent': color.CMYK[0] + '%' }">C</div>
      <div class="circle m" :style="{ '--percent': color.CMYK[1] + '%' }">M</div>
      <div class="circle y" :style="{ '--percent': color.CMYK[2] + '%' }">Y</div>
      <div class="circle k" :style="{ '--percent': color.CMYK[3] + '%' }">K</div>
    </div>

    <!-- 子节点递归 -->
    <div v-if="color.children && color.children.length" class="children">
      <ColorTreeNode
          v-for="child in color.children"
          :key="child.id"
          :color="child"
          :depth="depth + 1"
          @select-color="$emit('select-color', $event)"
      />
    </div>
  </div>
</template>

<script>
export default {
  name: "ColorTreeNode",
  props: {
    color: { type: Object, required: true },
    depth: { type: Number, default: 0 }
  },
  methods: {
    select() {
      this.$emit('select-color', this.color);
    }
  }
};
</script>

<style scoped>
.tree-node {
  margin: 5px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-id {
  width: 24px;
  font-weight: bold;
}

.node-name {
  width: 80px;
}

.cmyk {
  display: flex;
  gap: 4px;
}

.circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ddd;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #000;
}

/* 用伪元素表示填充比例 */
.circle::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background-color: currentColor;
  clip-path: polygon(50% 50%, 50% 0, 100% 0, 100% var(--percent), 50% var(--percent));
  opacity: 0.5;
}
.c { color: cyan; }
.m { color: magenta; }
.y { color: yellow; }
.k { color: black; }
</style>