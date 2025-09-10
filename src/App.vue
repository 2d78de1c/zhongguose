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
    
    // 检查URL hash并尝试定位到指定颜色
    this.checkUrlHash();
    
    // 监听hash变化
    window.addEventListener('hashchange', () => {
      this.checkUrlHash();
    });
  },
  methods: {
    handleSelectColor(color) {
      this.selectedColor = color;
      this.updateBackground(color);
      // 更新URL hash
      window.location.hash = color.Pinyin;
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
    },
    checkUrlHash() {
      const hash = window.location.hash.substring(1); // 移除#
      if (hash) {
        // 根据拼音查找颜色
        const color = this.colors.find(c => c.Pinyin === hash);
        if (color) {
          this.handleSelectColor(color);
        }
      } else if (this.colors.length) {
        // 默认选中第一个颜色
        this.selectedColor = this.colors[0];
        this.updateBackground(this.selectedColor);
      }
    }
  }
};
</script>

<style>
html, body {
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent; /* 或者同背景色 */
}
#app {
  transition: background-color 0.5s linear; /* 可选，CSS 过渡辅助 */
  min-height: 100vh;
}

.main-layout {
  display: flex;
  gap: 20px;
  padding: 20px;
  box-sizing: border-box; /* 防止 padding 导致溢出 */
}
</style>