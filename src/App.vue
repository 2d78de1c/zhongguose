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

  /* 麻布纹理叠加 */
  background-image:
    /* 柔和斜纹（模拟织物经纬） */
      linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px),
        /* 模拟织物绒毛 / 不规则阴影 */
      radial-gradient(circle at 10% 20%, rgba(0,0,0,0.02) 0%, transparent 40%),
      radial-gradient(circle at 80% 70%, rgba(0,0,0,0.015) 0%, transparent 40%),
      radial-gradient(circle at 50% 60%, rgba(0,0,0,0.01) 0%, transparent 50%);
  background-size:
      30px 30px,           /* 织物网格 */
      30px 30px,
      100px 100px,         /* 柔和阴影斑块 */
      100px 100px,
      150px 150px;
  background-position:
      0 0,
      0 0,
      0 0,
      100px 100px,
      50px 50px;
  background-blend-mode: overlay, overlay, multiply, multiply, multiply;
  border-radius: 8px; /* 圆角模拟布料褶皱 */
  box-shadow: 0 2px 8px rgba(0,0,0,0.05); /* 微弱投影，增加立体感 */
}

.main-layout {
  display: flex;
  gap: 20px;
  padding: 20px;
  box-sizing: border-box;
}
/* 手机端布局 */
@media (max-width: 768px) {
  .main-layout {
    flex-direction: column-reverse; /* 上下排列 */
    gap: 60px;                      /* 增加上下间距 */
    align-items: center;            /* 水平居中 */
    width: 100%;
    width: 100%;
    overflow-y: auto;               /* 内容超出可以滚动 */
  }
}
</style>