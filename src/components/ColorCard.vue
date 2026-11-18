<template>
  <button
      type="button"
      class="color-card"
      :class="{ 'is-selected': selected }"
      :aria-pressed="selected"
      :aria-label="`选择${color.Name}，${color.Pinyin}，${color.Hex}`"
      @click="$emit('click')"
  >
    <span class="hex-value" :style="{ backgroundColor: color.Hex }" aria-hidden="true"></span>
    <span class="hex-text">{{ color.Hex }}</span>
    <span class="card-body">
      <span class="color-meta" aria-hidden="true">
        <span class="id">{{ color.id }}</span>
        <span class="cmyk">
          <span
              v-for="(label, index) in ['C', 'M', 'Y', 'K']"
              :key="label"
              :class="['circle', label.toLowerCase()]"
              :style="{ '--percent': `${color.CMYK[index]}%` }"
          ><span class="channel-label">{{ label }}</span></span>
        </span>
        <span class="cmyk-bars">
          <span
              v-for="(label, index) in ['C', 'M', 'Y', 'K']"
              :key="label"
              class="bar"
              :style="{ '--percent': `${color.CMYK[index]}%` }"
          ></span>
        </span>
      </span>
      <span class="name-block">
        <ColorName class="name" :text="color.Name" />
        <span class="pinyin">{{ color.Pinyin.toUpperCase() }}</span>
      </span>
    </span>
    <span v-if="selected" class="selected-mark" aria-hidden="true">✓</span>
  </button>
</template>

<script>
import ColorName from './ColorName.vue';

export default {
  name: 'ColorCard',
  components: { ColorName },
  emits: ['click'],
  props: {
    color: { type: Object, required: true },
    selected: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.color-card {
  appearance: none;
  position: relative;
  display: flex;
  flex: 0 0 90px;
  flex-direction: column;
  width: 90px;
  height: 278px;
  min-width: 0;
  padding: 10px;
  box-sizing: border-box;
  border: 1px solid rgb(255 255 255 / 40%);
  border-color: color-mix(in srgb, var(--color-ink, #fff) 32%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--color-ink, #fff);
  font: inherit;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.color-card.is-selected {
  border-color: var(--color-ink, #fff);
  box-shadow: inset 0 0 0 1px var(--color-ink, #fff);
}

.color-card:focus-visible {
  outline: 2px solid var(--color-ink, #fff);
  outline-offset: 3px;
}

@media (hover: hover) {
  .color-card:hover {
    border-color: var(--color-ink, #fff);
    background-color: color-mix(in srgb, var(--color-ink, #fff) 5%, transparent);
  }
}

.hex-value {
  display: block;
  flex: 0 0 8px;
  width: 100%;
  margin-bottom: 4px;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
}

.hex-text {
  display: block;
  margin-bottom: 10px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.card-body {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.color-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.id {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

.name-block {
  display: grid;
  grid-template-columns: 18px 12px;
  justify-content: flex-end;
  align-items: start;
  gap: 5px;
  min-width: 0;
}

.pinyin {
  display: block;
  writing-mode: vertical-rl;
  white-space: nowrap;
  color: var(--color-ink, #fff);
}

.name {
  font-size: 18px;
}

.pinyin {
  font-family: Arial, 'Helvetica Neue', sans-serif;
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.5px;
}

.cmyk {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.circle {
  position: relative;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: rgb(255 255 255 / 24%);
}

.circle::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(currentColor var(--percent), transparent 0);
  opacity: 0.6;
}

.channel-label {
  position: relative;
  color: var(--color-ink, #fff);
  font-size: 8px;
  line-height: 1;
}

.c { color: cyan; }
.m { color: magenta; }
.y { color: yellow; }
.k { color: black; }

.cmyk-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 90px;
}

.bar {
  position: relative;
  display: block;
  width: 2px;
  height: 100%;
  overflow: hidden;
  border-radius: 2px 2px 0 0;
  background: rgb(128 128 128 / 45%);
}

.bar::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: var(--percent);
  background: var(--color-ink, #fff);
  opacity: 0.7;
}

.selected-mark {
  position: absolute;
  right: 7px;
  bottom: 6px;
  font-size: 12px;
  line-height: 1;
}

@media (max-width: 768px) {
  .color-card {
    flex-basis: 70px;
    width: 70px;
    height: 240px;
    padding: 7px;
  }

  .hex-value {
    flex-basis: 6px;
    margin-bottom: 3px;
  }

  .hex-text {
    margin-bottom: 8px;
    font-size: 10px;
  }

  .card-body {
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 6px;
  }

  .color-meta { gap: 9px; }
  .id { font-size: 9px; line-height: 14px; }
  .name-block { grid-template-columns: 16px 11px; gap: 4px; }
  .name { font-size: 16px; }
  .pinyin { font-size: 9px; letter-spacing: 0.4px; }
  .cmyk { gap: 3px; }
  .circle { width: 12px; height: 12px; }
  .channel-label { font-size: 7px; }
  .cmyk-bars { gap: 2px; height: 70px; }
  .bar { width: 1.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .color-card { transition: none; }
}
</style>
