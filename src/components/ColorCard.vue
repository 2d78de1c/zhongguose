<template>
  <div class="color-card" @click="$emit('click')">
    <div class="hex-value" :style="{ backgroundColor: color.Hex }"></div>

    <!-- 顶部信息 -->
    <div class="header">
      <span class="id" :style="{ color: color.Hex }">{{ color.id }}</span>
      <div class="name-block">
        <span class="name">{{ color.Name }}</span>
        <span class="pinyin">{{ color.Pinyin.toUpperCase() }}</span>
      </div>
    </div>

    <!-- 中间 CMYK 圆圈 -->
    <div class="cmyk">
      <div class="circle c" :style="{ '--percent': color.CMYK[0] + '%' }">C</div>
      <div class="circle m" :style="{ '--percent': color.CMYK[1] + '%' }">M</div>
      <div class="circle y" :style="{ '--percent': color.CMYK[2] + '%' }">Y</div>
      <div class="circle k" :style="{ '--percent': color.CMYK[3] + '%' }">K</div>
    </div>

    <!-- 中间 CMYK 竖条 -->
    <div class="cmyk-bars">
      <div class="bar c" :style="{ '--percent': color.CMYK[0] + '%' }"></div>
      <div class="bar m" :style="{ '--percent': color.CMYK[1] + '%' }"></div>
      <div class="bar y" :style="{ '--percent': color.CMYK[2] + '%' }"></div>
      <div class="bar k" :style="{ '--percent': color.CMYK[3] + '%' }"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: "ColorCard",
  props: {
    color: { type: Object, required: true }
  }
};
</script>

<style scoped>
.color-card {
  width: calc((100% - 6 * 10px) / 7); /* 每排 7 个，10px 间隙 */
  min-width: 50px;                     /* 最小宽度 50px */
  height: 278px;
  margin: 5px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-sizing: border-box;
  cursor: pointer;
}

/* 顶部信息布局 */
.header {
  display: flex;
  justify-content: space-between; /* 三列均分 */
  align-items: flex-start;
  margin-bottom: 8px;
  position: relative;
  gap: 8px;
}
/* 左列 ID */
.header  {
  flex: 0 0 30px; /* 固定宽度 */
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

/* name + pinyin 右上角竖直排列 */
.name-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.id { font-weight: bold;}
.name {
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: #fff;
  font-weight: bold;
  margin-bottom: 3px; /* 给 pinyin 留出空行 */
}
.pinyin {
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: #fff;
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.2;
}
.cmyk {
  display: flex;
  flex-direction: column; /* 垂直排列 */
  gap: 4px;
  margin-bottom: 8px;
  align-items: flex-start; /* 避免拉伸 */
}

/* 圆圈样式 */
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

/* 单独白线分隔 */
.hex-value {
  height: 4px;       /* 线条高度加粗 */
  width: 100%;
  margin: 4px 0;
}

/* CMYK 竖条 */
.cmyk-bars {
  display: flex;
  gap: 2px;
  height: 100px; /* 可调整整体高度 */
  align-items: flex-end; /* 保证条从底部开始 */
}

.bar {
  width: 1px;
  height: 100%;       /* 填充父容器高度 */
  background-color: #eee; /* 浅灰色背景 */
  border-radius: 2px 2px 0 0;
  position: relative;
  overflow: hidden;
}

.bar::after {
  content: '';
  position: absolute;
  bottom: 100;
  left: 0;
  width: 100%;
  height: var(--percent); /* 高度百分比 */
  background-color: #fff; /* 白色填充 */
}

/* 圆圈填充比例，简单渐变 */
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

.hex-value input {
  width: 100%;
  text-align: center;
}
</style>