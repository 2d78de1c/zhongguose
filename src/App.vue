<template>
  <div id="app" :style="{ backgroundColor: backgroundRGB }">
    <div class="main-layout">
      <ColorContainer :colors="colors" @select-color="handleSelectColor" />
      <ColorBox :color="selectedColor" />
    </div>
  </div>
</template>

<script>
import ColorContainer from './components/ColorContainer.vue';
import ColorBox from './components/ColorBox.vue';

export default {
  name: "App",
  components: { ColorContainer, ColorBox },
  data() {
    return {
      colors: [],
      selectedColor: null,
      backgroundRGB: "rgb(255,255,255)" // 初始背景白色
    };
  },
  async mounted() {
    const res = await fetch("/api/colors.json");
    const data = await res.json();
    this.colors = data.map((c, i) => ({ ...c, id: i + 1 }));
    if (this.colors.length) this.selectedColor = this.colors[0];
    if (this.selectedColor) this.updateBackground(this.selectedColor);
  },
  methods: {
    handleSelectColor(color) {
      this.selectedColor = color;
      this.updateBackground(color);
    },
    updateBackground(color) {
      // 获取接口RGB值
      const [targetR, targetG, targetB] = color.RGB;

      const startRGB = this.backgroundRGB.match(/\d+/g).map(Number);
      const duration = 500; // 动画时长ms
      const startTime = performance.now();

      const animate = (time) => {
        const t = Math.min((time - startTime) / duration, 1);
        const r = Math.round(startRGB[0] + (targetR - startRGB[0]) * t);
        const g = Math.round(startRGB[1] + (targetG - startRGB[1]) * t);
        const b = Math.round(startRGB[2] + (targetB - startRGB[2]) * t);
        this.backgroundRGB = `rgb(${r},${g},${b})`;
        if (t < 1) requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }
  }
};
</script>

<style>
#app {
  transition: background-color 0.5s linear; /* 可选，CSS 过渡辅助 */
  min-height: 100vh;
}

.main-layout {
  display: flex;
  gap: 20px;
  padding: 20px;
}
</style>