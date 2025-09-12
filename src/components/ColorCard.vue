<template>
  <div class="color-card" @click="$emit('click')">
    <!-- HEX 分隔线 -->
    <div class="hex-value" :style="{ backgroundColor: color.Hex }"></div>
    <!-- HEX 文本 -->
    <div class="hex-text">
      {{ color.Hex }}
    </div>
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
/* 父容器 grid 布局 */
:global(.color-card-grid) {
  display: grid;
  grid-template-columns: repeat(auto-fill, 90px); /* 固定宽度 */
  gap: 10px;
  justify-content: center;
}

.color-card {
  width: 90px;       /* 固定宽度 */
  height: 278px;      /* 固定高度 */
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between; /* 顶部内容在上，CMYK竖条在底部 */
}

/* HEX 分隔线 */
.hex-value {
  height: 8px;
  width: 100%;
  margin-bottom: 4px;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* HEX 文本 */
.hex-text {
  font-size: 12px;
  margin-bottom: 6px;
  text-align: left;
  width: 100%;
  color: #fff;

}

/* 顶部信息布局 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  height: 40px;       /* 固定高度 */
  margin-bottom: 6px;
  gap: 8px;
}

.id {
  flex: 0 0 30px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start; /* 左对齐 */
  font-weight: bold;
}

.name-block {
  display: flex;
  flex-direction: column;
  align-items: center;   /* 右对齐内容 */
  width: 500px;             /* 固定宽度保证全局统一 */
}

.name {
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: #fff;
  font-weight: bold;
  margin-bottom: 10px;     /* Name 和 Pinyin 间距 */
}

.pinyin {
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: #fff;
  font-size: 12px;
  letter-spacing: 1px;
  line-height: 1.2;
}

/* CMYK 圆圈组 */
.cmyk {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;  /* 固定间距 */
  height: 70px;        /* 固定高度 */
  width: 50px;         /* 与圆环宽度一致 */
  align-items: flex-start;
  justify-content: flex-start; /* 左对齐 */
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
  overflow: hidden;
}

.circle::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(currentColor var(--percent), transparent 0);
  opacity: 0.5;
}

/* CMYK 竖条 */
.cmyk-bars {
  display: flex;
  gap: 2px;
  height: 100px;   /* 固定高度 */
  align-items: flex-start;
  justify-content: flex-start; /* 左对齐 */
}

.bar {
  width: 2px;
  height: 100%;
  background-color: #aaaaaa;
  border-radius: 2px 2px 0 0;
  position: relative;
  overflow: hidden;
}

.bar::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: var(--percent);
  background-color: #fff;
  opacity: 0.7;
}

/* 颜色映射 */
.c { color: cyan; }
.m { color: magenta; }
.y { color: yellow; }
.k { color: black; }

.hex-value input {
  width: 100%;
  text-align: center;
}
/* 手机端缩放 ColorCard */
@media (max-width: 768px) {
  .color-card {
    width: 70px;        /* 缩小宽度 */
    height: 220px;      /* 缩小高度 */
    padding: 8px;       /* 内边距缩小 */
  }

  /* HEX 分隔线和文本 */
  .hex-value {
    height: 6px;
    margin-bottom: 3px;
  }
  .hex-text {
    font-size: 10px;
    margin-bottom: 4px;
  }

  /* 顶部信息布局 */
  .header {
    height: 32px;
    margin-bottom: 4px;
    gap: 6px;
  }
  .id {
    flex: 0 0 24px;
  }
  .name-block {
    width: 350px;      /* 根据比例缩小 */
  }
  .name {
    margin-bottom: 6px;
    font-size: 14px;   /* 缩小字体 */
  }
  .pinyin {
    font-size: 10px;
  }

  /* CMYK 圆圈组 */
  .cmyk {
    height: 55px;      /* 缩小高度 */
    width: 40px;       /* 缩小宽度 */
  }
  .circle {
    width: 12px;
    height: 12px;
    font-size: 8px;
  }

  /* CMYK 竖条 */
  .cmyk-bars {
    height: 80px;      /* 缩小高度 */
  }
  .bar {
    width: 1.5px;      /* 缩小宽度 */
  }
}
</style>