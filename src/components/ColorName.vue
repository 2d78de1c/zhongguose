<template>
  <component :is="as" class="color-name">
    <span class="sr-only">{{ text }}</span>
    <span v-for="(character, index) in characters" :key="index" class="glyph-cell" aria-hidden="true">
      <span class="glyph-ink" :style="glyphStyle(character)">{{ character }}</span>
    </span>
  </component>
</template>

<script>
import metrics from '../color-name-metrics.json';

export default {
  name: 'ColorName',
  props: {
    text: { type: String, required: true },
    as: { type: String, default: 'span' },
  },
  computed: {
    characters() { return Array.from(this.text); },
  },
  methods: {
    glyphStyle(character) {
      const [scale, x, y] = metrics.glyphs[character] || [1, 0, 0];
      return { transform: `translate(${x}em, ${y}em) scale(${scale})` };
    },
  },
};
</script>

<style scoped>
@font-face {
  font-family: 'Color Calligraphy';
  src: url('/api/fonts.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

.color-name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .12em;
  width: 1em;
  margin: 0;
  padding: 0;
  font-family: 'Color Calligraphy', 'Kaiti SC', KaiTi, serif;
  font-weight: 500;
  font-style: normal;
  font-synthesis: none;
  line-height: 1;
  letter-spacing: 0;
  writing-mode: horizontal-tb;
  color: inherit;
}

.glyph-cell,
.glyph-ink {
  display: block;
  flex: none;
  width: 1em;
  height: 1em;
  line-height: 1;
  text-align: center;
}

.glyph-ink {
  white-space: nowrap;
  transform-origin: center;
}
</style>
