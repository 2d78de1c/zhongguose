<template>
  <aside v-if="color" class="color-box">
    <div>
      <div class="separator"></div>
    <!-- CMYK 圆环竖排 -->
    <div class="cmyk-column">

      <div class="ring" v-for="(value, idx) in color.CMYK" :key="idx">
        <svg viewBox="0 0 36 36">
          <circle class="bg" cx="18" cy="18" r="16"></circle>
          <circle
              class="progress"
              cx="18"
              cy="18"
              r="16"
              :stroke-dasharray="(value * 100 / 100) + ', 100'"
          ></circle>
          <text x="18" y="20" text-anchor="middle" class="ring-text">{{ value }}</text>
        </svg>
        <span class="label">{{ ['C','M','Y','K'][idx] }}</span>
        <div v-if="idx < 3" class="separator"></div> <!-- CMYK 圆环间白线 -->
      </div>
    </div>

    <div class="middle-separator"></div> <!-- CMYK 和 RGB 间白线 -->

    <!-- RGB 列显示 -->
    <div class="rgb-column" @mouseenter="showHex = true" @mouseleave="showHex = false">
      <div class="rgb-item">
        <span class="rgb-label">R</span>
        <span class="rgb-value">{{ color.RGB[0] }}</span>
      </div>
      <div class="separator"></div>
      <div class="rgb-item">
        <span class="rgb-label">G</span>
        <span class="rgb-value">{{ color.RGB[1] }}</span>
      </div>
      <div class="separator"></div>
      <div class="rgb-item">
        <span class="rgb-label">B</span>
        <span class="rgb-value">{{ color.RGB[2] }}</span>
      </div>

      <!-- HEX 气泡窗口 -->
      <div v-if="showHex" class="hex-tooltip">
        {{ color.Hex }}
      </div>
    </div>
      <div class="separator"></div>
    </div>
    <!-- 新增右侧垂直标题，不影响原布局 -->
    <div class="title-vertical">
      <span class="chinese">{{ color.Name }}</span>
      <span class="pinyin">{{ color.Pinyin.toUpperCase() }}</span>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'ColorBox',
  props: {
    color: { type: Object, default: null }
  },
  data() {
    return {
      showHex: false
    };
  }
};
</script>

<style scoped>
.color-box {
  position: relative; /* 改成 relative */
  width: 255px;
  height: 507px;
  padding: 15px;
  border-radius: 6px;
  border: 1px solid #aaa;
  color: #333;
  flex-shrink: 0;
  position: sticky;
  top: 20px;

  display: flex;
  flex-direction: column;
  align-items: flex-start; /* 内容靠左 */
  justify-content: flex-start;
  box-sizing: border-box;
}

/* CMYK 圆环竖排 */
.cmyk-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
  align-items: center;
}

.ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 50px;
}

.ring svg {
  width: 50px;
  height: 50px;
}

circle.bg {
  fill: none;
  stroke: #eee;
  stroke-width: 4;
  width: 50px;
  height: 50px;
}

circle.progress {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
  stroke: currentColor;
  transition: stroke-dasharray 1s ease;
  transition-delay: 0.1s;       /* 添加延迟 */
  transform: rotate(180deg);  /* 旋转 180 度 */
  transform-origin: 50% 50%;  /* 设置旋转中心在圆心 */
}

.ring:nth-child(1) { color: cyan; }
.ring:nth-child(2) { color: magenta; }
.ring:nth-child(3) { color: yellow; }
.ring:nth-child(4) { color: black; }

.ring text.ring-text {
  font-size: 10px;
  fill: currentColor; /* 使用父元素 color */
  dominant-baseline: middle;
}

.label {
  margin-top: 2px;
  font-size: 10px;
  color: #fff;
}

/* 单独白线分隔 */
.separator {
  height: 1px;
  width: 100%;
  background-color: #fff;
  margin: 4px 0;
}

.middle-separator {
  height: 1px;
  width: 100%;
  background-color: #fff;
  margin: 4px 0;
}

/* RGB 列显示 */
.rgb-column {
  display: flex;
  flex-direction: column;
  align-items: center; /* 水平居中整个列表 */
  position: relative; /* HEX 气泡定位基准 */
}

.rgb-item {
  display: flex;
  gap: 8px;        /* 左右间隔 */
  padding: 2px 6px; /* 上下 2px，左右 6px */
  background-color: rgba(255,255,255,0.05);
  font-size: 14px;
}
.rgb-label {
  color: #fff;
}

.rgb-value {
  color: #fff;
}
/* HEX 气泡 */
.hex-tooltip {
  position: absolute;
  left: 105%; /* RGB 右侧 */
  top: 0;
  padding: 4px 8px;
  background-color: rgba(0,0,0,0.8);
  color: #fff;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
  z-index: 100;
}

/* HEX 默认隐藏 */
.hex-value input {
  width: 100%;
  text-align: center;
  margin-top: 10px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

/* 鼠标悬停显示 HEX */
.color-box:hover .hex-value input {
  opacity: 1;
}
/* 新增右上角垂直标题 */
.title-vertical {
  position: absolute; /* 绝对定位 */
  top: 15px;          /* 距离上边距 */
  right: 15px;        /* 距离右边距 */
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* 仅在 ColorBox 内部使用自定义字体 */
@font-face {
  font-family: "CustomFont";
  src: url("/api/fonts.woff2") format("woff2");
  font-weight: normal;
  font-style: normal;
}

.chinese {
  writing-mode: vertical-rl;
  font-size: 60px;
  font-weight: bold;
  font-family: "CustomFont", sans-serif;
  color: #fff;
  overflow: hidden; /* 隐藏超出的文字 */
  display: inline-block;
  white-space: nowrap; /* 避免换行 */
  border-right: 2px solid transparent; /* 模拟书写笔触 */
  animation: writeChinese 3s steps(10) forwards; /* 3秒写完，steps(文字数量) */
}

.pinyin {
  font-family: "adobe-garamond-pro-1", "adobe-garamond-pro-2", sans-serif;
  writing-mode: horizontal-tb; /* 拼音横向排列 */
  font-size: 14px;
  color: #fff;
  margin-top: 4px;
}
/* 手机端调整 */
@media (max-width: 768px) {
  .color-box {
    position: fixed; /* 固定在视口上，即滚动页面时也保持位置不变 */
    top: 50%;        /* 垂直居中显示（相对于视口） */
    right: 20px;     /* 距离右边 20px */
    transform: translateY(-50%); /* 精确垂直居中，通过自身高度偏移 50% */

    width: 255px;    /* 固定宽度 */
    height: 507px;   /* 固定高度 */
    padding: 15px;   /* 内边距，内容不贴边 */
    border-radius: 6px; /* 圆角边框 */
    border: 1px solid #aaa; /* 边框颜色和粗细 */

    color: #333;     /* 默认文本颜色 */

    display: flex;           /* 使用 Flex 布局，便于内部纵向排列 */
    flex-direction: column;  /* 垂直排列子元素 */
    align-items: flex-start; /* 左对齐内容 */
    justify-content: flex-start; /* 从顶部开始排列 */

    box-sizing: border-box;  /* 包含 padding 和 border 在宽高内 */
    z-index: 3001;           /* 层级最高，确保覆盖页面其他元素 */
    transition: opacity 0.3s ease-in-out; /* 可选：渐变效果，用于显示/隐藏时 */

    /* 背景麻布纹理叠加效果 */
    background-image:
        linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%),   /* 45 度浅黑线条，占据 25% */
        linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%),  /* -45 度浅黑线条 */
        linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.05) 75%),   /* 45 度透明 + 浅黑线条，占据 75% */
        linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.05) 75%);  /* -45 度透明 + 浅黑线条，占据 75% */

    background-size: 20px 20px; /* 每个纹理块大小，形成重复格子 */
    background-blend-mode: overlay; /* 将四个图层叠加在一起形成麻布质感 */
  }
}
</style>