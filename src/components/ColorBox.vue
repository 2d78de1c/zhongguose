<template>
  <aside
      v-if="color"
      class="color-box"
      aria-label="所选颜色详情"
      :style="{ backgroundColor: color.Hex, '--detail-ink': color.ink }"
  >
    <div class="detail-body">
      <div class="color-data">
        <div class="separator" aria-hidden="true"></div>
        <button
            type="button"
            class="copy-region cmyk-column"
            :aria-label="`复制 ${color.Name} 的 CMYK 色值 ${cmykValue}`"
            title="点击复制 CMYK"
            @click="$emit('copy', { label: 'CMYK', value: cmykValue })"
        >
          <span v-for="(value, idx) in color.CMYK" :key="idx" class="ring">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle class="bg" cx="18" cy="18" r="16"></circle>
              <circle
                  class="progress"
                  cx="18"
                  cy="18"
                  r="16"
                  :stroke-dasharray="`${(value / 100 * 100.53).toFixed(2)},100.53`"
              ></circle>
              <text x="18" y="20" text-anchor="middle" class="ring-text">{{ value }}</text>
            </svg>
            <span class="label">{{ ['C', 'M', 'Y', 'K'][idx] }}</span>
            <span v-if="idx < 3" class="separator" aria-hidden="true"></span>
          </span>
        </button>

        <div class="middle-separator" aria-hidden="true"></div>
        <button
            type="button"
            class="copy-region rgb-column"
            :aria-label="`复制 ${color.Name} 的 RGB 色值 ${rgbValue}`"
            title="点击复制 RGB"
            @click="$emit('copy', { label: 'RGB', value: rgbValue })"
        >
          <template v-for="(value, idx) in color.RGB" :key="idx">
            <span class="rgb-item">
              <span class="rgb-label">{{ ['R', 'G', 'B'][idx] }}</span>
              <span class="rgb-value">{{ value }}</span>
            </span>
            <span v-if="idx < 2" class="separator" aria-hidden="true"></span>
          </template>
        </button>
        <div class="separator" aria-hidden="true"></div>
      </div>

      <div class="title-vertical">
        <h2 class="chinese">{{ color.Name }}</h2>
        <span class="pinyin">{{ color.Pinyin.toUpperCase() }}</span>
      </div>
    </div>

    <div class="panel-actions">
      <button
          type="button"
          class="detail-action hex-button"
          :aria-label="`复制 ${color.Name} 的 HEX 色值 ${hexValue}`"
          @click="$emit('copy', { label: 'HEX', value: hexValue })"
      >
        <span>{{ hexValue }}</span>
        <span class="action-hint">复制</span>
      </button>
      <button
          type="button"
          class="detail-action share-button"
          :aria-label="`分享 ${color.Name} 的链接`"
          @click="$emit('share')"
      >分享 <span aria-hidden="true">↗</span></button>
    </div>
  </aside>
</template>

<script>
export default {
  name: 'ColorBox',
  props: {
    color: { type: Object, default: null },
  },
  emits: ['copy', 'share'],
  computed: {
    hexValue() {
      return this.color?.Hex.toUpperCase() || '';
    },
    rgbValue() {
      return this.color ? `rgb(${this.color.RGB.join(', ')})` : '';
    },
    cmykValue() {
      return this.color ? this.color.CMYK.map(value => `${value}%`).join(', ') : '';
    },
  },
};
</script>

<style scoped>
.color-box {
  width: 255px;
  max-width: 100%;
  height: auto;
  min-height: 507px;
  padding: 15px;
  border: 1px solid #aaa;
  border-radius: 6px;
  color: var(--detail-ink, var(--color-ink, #fff));
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
  background-image: none;
}

.detail-body {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.color-data {
  min-width: 0;
}

.copy-region {
  border: 0;
  border-radius: 3px;
  padding: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
}

.cmyk-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin: 0 0 10px;
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
  display: block;
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

.ring-text {
  font-size: 10px;
  fill: var(--detail-ink, var(--color-ink, #fff));
  dominant-baseline: middle;
}

.label {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.4;
  color: var(--detail-ink, var(--color-ink, #fff));
}

.separator,
.middle-separator {
  display: block;
  height: 1px;
  width: 100%;
  background-color: var(--detail-ink, var(--color-ink, #fff));
  margin: 4px 0;
}

.rgb-column {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
}

.rgb-item {
  display: flex;
  gap: 8px;
  padding: 2px 6px;
  background-color: rgba(255, 255, 255, 0.05);
  font-size: 14px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.title-vertical {
  justify-self: end;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 100%;
  text-align: center;
}

@font-face {
  font-family: 'CustomFont';
  src: url('/api/fonts.woff2') format('woff2');
  font-display: swap;
}

.chinese {
  writing-mode: vertical-rl;
  margin: 0;
  font-size: 60px;
  font-weight: bold;
  font-family: 'CustomFont', sans-serif;
  line-height: 1.2;
  color: inherit;
  display: inline-block;
  white-space: nowrap;
}

.pinyin {
  font-family: 'adobe-garamond-pro-1', 'adobe-garamond-pro-2', sans-serif;
  writing-mode: horizontal-tb;
  font-size: 14px;
  line-height: 1.4;
  color: inherit;
  max-width: 100%;
  overflow-wrap: anywhere;
  margin-top: 4px;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin-top: auto;
  padding-top: 14px;
}

.detail-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.hex-button {
  flex: 1 1 auto;
  font-variant-numeric: tabular-nums;
}

.action-hint {
  font-size: 10px;
}

.share-button {
  flex: 0 0 auto;
}

.copy-region:focus-visible,
.detail-action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
}

@media (hover: hover) {
  .copy-region:hover,
  .detail-action:hover {
    background: color-mix(in srgb, var(--detail-ink, var(--color-ink, #fff)) 8%, transparent);
  }
}

@media (max-width: 768px) {
  .color-box {
    width: 255px;
    height: auto;
    min-height: 410px;
    max-height: none;
    padding: 10px;
    overflow: visible;
  }

  .ring svg {
    width: 40px;
    height: 40px;
  }

  .rgb-item {
    font-size: 12px;
    padding: 1px 4px;
  }

  .chinese {
    font-size: 40px;
  }

  .pinyin {
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  circle.progress {
    transition: none;
  }
}
</style>
