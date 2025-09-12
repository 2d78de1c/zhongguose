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
    window.addEventListener('hashchange', this.checkUrlHash);
  },
  methods: {
    handleSelectColor(color) {
      this.selectedColor = color;
      this.updateBackground(color);
      // 更新URL hash（统一小写）
      window.location.hash = color.Pinyin.toLowerCase();
    },
    updateBackground(color) {
      const [r, g, b] = color.RGB;
      this.backgroundRGB = `rgb(${r},${g},${b})`;
    },
    checkUrlHash() {
      const hash = window.location.hash.substring(1).toLowerCase(); // 移除#并统一小写
      if (hash) {
        // 根据拼音查找颜色
        const color = this.colors.find(c => c.Pinyin.toLowerCase() === hash);
        if (color) {
          this.selectedColor = color;
          this.updateBackground(color);
        }
      } else if (this.colors.length) {
        // 没有 hash 时，随机选中一个颜色（不更新 URL）
        const randomIndex = Math.floor(Math.random() * this.colors.length);
        this.selectedColor = this.colors[randomIndex];
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
  background: transparent;
}
#app {
  transition: background-color 0.5s linear;
  min-height: 100vh;
}

.main-layout {
  display: flex;
  gap: 20px;
  padding: 20px;
  box-sizing: border-box;
}
</style>