<template>
  <div class="color-container">
    <ColorCard
        v-for="color in colors"
        :key="color.id"
        :color="color"
        ref="cards"
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
/* 手机端：水平滑动，胶片效果 */
@media (max-width: 768px) {
  .color-container {
    display: flex;
    flex-wrap: nowrap;          /* 一行展示 */
    overflow-x: auto;            /* 允许水平滑动 */
    overflow-y: hidden;          /* 禁止垂直滚动 */
    gap: 10px;
    padding: 0 10px;            /* 给两边留白 */
    scroll-snap-type: x mandatory;  /* 吸附滚动 */
    -webkit-overflow-scrolling: touch; /* 平滑滑动 */
    align-items: flex-end;
    justify-content: center;         /* 卡片始终在屏幕中显示 */
    height: calc(98vh - 2vh);                /* 容器高度，可根据卡片高度调整 */
  }

  /* 每个卡片启用 snap 对齐 */
  .color-container > * {
    flex: 0 0 auto;             /* 固定宽度 */
    scroll-snap-align: start;   /* 左对齐吸附 */
  }

  /* 可选：美化滚动条 */
  .color-container::-webkit-scrollbar {
    height: 6px;
  }
  .color-container::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.3);
    border-radius: 3px;
  }
  .color-container::-webkit-scrollbar-track {
    background: transparent;
  }
}
</style>