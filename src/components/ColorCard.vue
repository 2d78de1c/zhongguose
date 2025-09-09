<template>
  <div class="color-card" :style="{ backgroundColor: color.Hex }" @click="$emit('click')">
    <div class="header">
      <span class="id">{{ color.id }}</span>
      <span class="name">{{ color.Name }}</span>
    </div>

    <div class="cmyk">
      <div class="circle c" :style="{ '--percent': color.CMYK[0] + '%' }">C</div>
      <div class="circle m" :style="{ '--percent': color.CMYK[1] + '%' }">M</div>
      <div class="circle y" :style="{ '--percent': color.CMYK[2] + '%' }">Y</div>
      <div class="circle k" :style="{ '--percent': color.CMYK[3] + '%' }">K</div>
    </div>

    <div class="hex-value">
      <input type="text" :value="color.Hex" readonly />
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
  margin: 5px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-sizing: border-box;
  cursor: pointer;
}

.header {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.id { font-weight: bold; }
.name { flex: 1; }

.cmyk {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
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