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
                :stroke-dasharray="(value / 100 * 100.53).toFixed(2) + ',100.53'"
            ></circle>
            <text x="18" y="20" text-anchor="middle" class="ring-text">{{ value }}</text>
          </svg>
          <span class="label">{{ ['C','M','Y','K'][idx] }}</span>
          <div v-if="idx < 3" class="separator"></div>
        </div>
      </div>

      <div class="middle-separator"></div>

      <!-- RGB 列显示 -->
      <div
          class="rgb-column"
          @mouseenter="showHex = true"
          @mousemove="checkTooltipPosition"
          @mouseleave="showHex = false"
      >
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
        <div v-if="showHex" class="hex-tooltip" :class="{ left: tooltipOnLeft }">
          {{ color.Hex }}
        </div>
      </div>
      <div class="separator"></div>
    </div>

    <!-- 新增右侧垂直标题 -->
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
      showHex: false,
      tooltipOnLeft: false
    };
  },
  methods: {
    checkTooltipPosition(event) {
      const tooltipWidth = 80; // 估算 HEX 宽度
      const viewportWidth = window.innerWidth;
      // 如果鼠标位置 + tooltip 宽度 + 安全边距 超过视口宽度 → 放左边
      this.tooltipOnLeft = event.clientX + tooltipWidth + 40 > viewportWidth;
    }
  }
};
</script>

<style scoped>
.color-box {
  position: relative;
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
  align-items: flex-start;
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
}

circle.progress {
  fill: none;
  stroke-width: 4;
  stroke-linecap: round;
  stroke: currentColor;
  transition: stroke-dasharray 1s ease;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

.ring:nth-child(1) { color: cyan; }
.ring:nth-child(2) { color: magenta; }
.ring:nth-child(3) { color: yellow; }
.ring:nth-child(4) { color: black; }

.ring text.ring-text {
  font-size: 10px;
  fill: currentColor;
  dominant-baseline: middle;
}

.label {
  margin-top: 2px;
  font-size: 10px;
  color: #fff;
}

/* 白线分隔 */
.separator,
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
  align-items: center;
  position: relative;
}

.rgb-item {
  display: flex;
  gap: 8px;
  padding: 2px 6px;
  background-color: rgba(255,255,255,0.05);
  font-size: 14px;
}

.rgb-label,
.rgb-value {
  color: #fff;
}

/* HEX 气泡 */
.hex-tooltip {
  position: absolute;
  left: 105%;
  top: 0;
  padding: 4px 8px;
  background-color: rgba(0,0,0,0.8);
  color: #fff;
  border-radius: 4px;
  font-size: 14px;
  white-space: nowrap;
  z-index: 100;
}

.hex-tooltip.left {
  left: auto;
  right: 105%;
}

/* 新增右上角垂直标题 */
.title-vertical {
  position: absolute;
  top: 15px;
  right: 15px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

@font-face {
  font-family: "CustomFont";
  src: url("/api/fonts.woff2") format("woff2");
}

.chinese {
  writing-mode: vertical-rl;
  font-size: 60px;
  font-weight: bold;
  font-family: "CustomFont", sans-serif;
  color: #fff;
  overflow: hidden;
  display: inline-block;
  white-space: nowrap;
  border-right: 2px solid transparent;
  animation: writeChinese 3s steps(10) forwards;
}

.pinyin {
  font-family: "adobe-garamond-pro-1", "adobe-garamond-pro-2", sans-serif;
  writing-mode: horizontal-tb;
  font-size: 14px;
  color: #fff;
  margin-top: 4px;
}

/* 手机端 ColorBox 固定在屏幕顶部 */
/* 手机端 ColorBox 自适应高度 */
/* 手机端 ColorBox 自适应高度，降低到屏幕 60% */
@media (max-width: 768px) {
  .color-box {
    position: fixed;       /* 固定在屏幕 */
    top: 2vh;              /* 距离顶部少量留白 */
    left: 50%;             /* 水平居中 */
    transform: translateX(-50%);
    width: 90%;            /* 自适应屏幕宽度 */
    max-width: 255px;      /* 最大宽度保持原设计 */
    height: 60vh;          /* 高度占屏幕60% */
    max-height: 507px;     /* 保持原始最大高度 */
    z-index: 1000;
    box-sizing: border-box;
    padding: 10px;         /* 内边距可微调 */
    overflow: hidden;      /* 防止内容溢出 */
  }

  /* 防止下方 ColorContainer 被遮挡 */
  .main-layout {
    padding-top: 62vh;     /* ColorBox 高度 + 顶部偏移 */
  }

  /* CMYK 圆环自适应高度 */
  .cmyk-column .ring svg {
    width: 40px;           /* 缩小圆环，适应较低高度 */
    height: 40px;
  }

  /* RGB 列字体缩小 */
  .rgb-item {
    font-size: 12px;
    padding: 1px 4px;
  }

  /* HEX 气泡缩小 */
  .hex-tooltip {
    font-size: 12px;
    padding: 2px 6px;
  }

  /* Title 文字缩小 */
  .title-vertical .chinese {
    font-size: 40px;
  }
  .title-vertical .pinyin {
    font-size: 12px;
  }
}
</style>