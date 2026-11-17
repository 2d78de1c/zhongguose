<template>
  <div class="atlas" :style="{ backgroundColor: selectedColor.Hex, color: selectedColor.ink, '--color-ink': selectedColor.ink, '--selected-color': selectedColor.Hex }">
    <h1 class="sr-only">中国色</h1>
    <main class="main-layout">
      <section class="catalog" aria-label="中国传统颜色目录">
        <div class="catalog-tools">
          <button type="button" class="quiet-button" :aria-expanded="searchOpen" aria-controls="color-search-panel" @click="searchOpen = !searchOpen">{{ searchOpen ? '收起查找' : '查找颜色' }} <span aria-hidden="true">{{ searchOpen ? '−' : '+' }}</span></button>
          <button type="button" class="quiet-button" :disabled="!filteredColors.length" @click="chooseRandom">随便看看</button>
          <span class="result-count" aria-live="polite">{{ filteredColors.length }} 色<span v-if="query || family !== 'all'"> · 已筛选</span></span>
        </div>
        <div v-show="searchOpen" id="color-search-panel" class="search-panel">
          <label class="sr-only" for="color-search">搜索颜色名称、拼音、HEX 或 RGB</label>
          <div class="search-field">
            <input id="color-search" ref="searchInput" v-model="query" type="search" placeholder="色名、拼音、HEX 或 RGB" autocomplete="off" spellcheck="false" @keydown.esc="query = ''" />
            <button v-if="query" type="button" class="clear-search" @click="clearSearch">清空</button>
            <kbd v-else aria-hidden="true">/</kbd>
          </div>
          <div class="family-filters" role="group" aria-label="按色系筛选">
            <button v-for="item in colorFamilies" :key="item.key" type="button" :class="['family-filter', { active: family === item.key }]" :aria-pressed="family === item.key" @click="family = item.key">
              <span v-if="item.swatch" class="family-dot" :style="{ backgroundColor: item.swatch }" aria-hidden="true"></span>{{ item.label }}
            </button>
          </div>
        </div>
        <ColorContainer v-if="filteredColors.length" :colors="filteredColors" :selected-slug="selectedColor.slug" @select-color="handleSelectColor" />
        <div v-else class="empty-state" role="status">
          <p>没有找到这个颜色</p><p>试试「朱红」、zhuhong 或 #ed5126。</p>
          <button type="button" class="quiet-button" @click="resetFilters">查看全部颜色</button>
        </div>
      </section>
      <aside class="detail-column" aria-label="当前颜色详情">
        <ColorBox :color="selectedColor" @copy="copyValue" @share="copyLink" />
        <p v-if="!selectionInResults" class="outside-filter">当前颜色不在筛选结果中。<button type="button" @click="showSelected">查看所选</button></p>
      </aside>
    </main>
    <div class="toast-region" role="status" aria-live="polite" aria-atomic="true"><p v-if="toast" class="toast">{{ toast }}</p></div>
    <dialog ref="copyDialog" class="copy-dialog" aria-labelledby="copy-dialog-title">
      <h2 id="copy-dialog-title">手动复制{{ manualCopy.label }}</h2>
      <p>浏览器暂不允许自动复制，请选择下方内容复制。</p>
      <label class="sr-only" for="manual-copy-value">需要复制的内容</label>
      <textarea id="manual-copy-value" ref="manualCopyInput" :value="manualCopy.value" readonly rows="3" @focus="$event.target.select()"></textarea>
      <button class="quiet-button" type="button" @click="$refs.copyDialog.close()">完成</button>
    </dialog>
  </div>
</template>

<script>
import ColorContainer from './components/ColorContainer.vue';
import ColorBox from './components/ColorBox.vue';
import { colors, colorFamilies, filterColors, resolveColorHash } from './colors.js';

export default {
  name: 'App',
  components: { ColorContainer, ColorBox },
  data() {
    return { colors, colorFamilies, query: '', family: 'all', selectedColor: colors[0], toast: '', toastTimer: null, copyRequest: 0, searchOpen: false, manualCopy: { label: '', value: '' } };
  },
  computed: {
    filteredColors() { return filterColors(this.colors, this.query, this.family); },
    selectionInResults() { return this.filteredColors.some(color => color.slug === this.selectedColor.slug); },
  },
  mounted() {
    this.checkUrlHash();
    window.addEventListener('hashchange', this.checkUrlHash);
    window.addEventListener('keydown', this.focusSearchShortcut);
  },
  beforeUnmount() {
    window.removeEventListener('hashchange', this.checkUrlHash);
    window.removeEventListener('keydown', this.focusSearchShortcut);
    clearTimeout(this.toastTimer);
  },
  methods: {
    handleSelectColor(color) { this.selectedColor = color; window.location.hash = color.slug; },
    checkUrlHash() { this.selectedColor = resolveColorHash(window.location.hash); },
    resetFilters() { this.query = ''; this.family = 'all'; },
    clearSearch() { this.query = ''; this.$refs.searchInput.focus(); },
    async focusSearchShortcut(event) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || this.$refs.copyDialog?.open) return;
      const target = event.target;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault(); this.searchOpen = true; await this.$nextTick(); this.$refs.searchInput.focus();
    },
    chooseRandom() {
      const options = this.filteredColors.filter(color => color.slug !== this.selectedColor.slug);
      const pool = options.length ? options : this.filteredColors;
      if (pool.length) this.handleSelectColor(pool[Math.floor(Math.random() * pool.length)]);
    },
    scrollBehavior() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; },
    async showSelected() {
      this.resetFilters(); await this.$nextTick();
      const card = this.$el.querySelector('.color-card[aria-pressed="true"]');
      if (card) { card.scrollIntoView({ block: 'center', behavior: this.scrollBehavior() }); card.focus({ preventScroll: true }); }
    },
    notify(message) { clearTimeout(this.toastTimer); this.toast = message; this.toastTimer = setTimeout(() => { this.toast = ''; }, 2600); },
    async copyValue({ label, value }) {
      const request = ++this.copyRequest;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
        if (request === this.copyRequest) this.notify(`${label} 已复制`);
      } catch {
        if (request !== this.copyRequest) return;
        this.manualCopy = { label, value }; await this.$nextTick();
        if (!this.$refs.copyDialog.open) this.$refs.copyDialog.showModal();
        this.$refs.manualCopyInput.focus(); this.$refs.manualCopyInput.select();
      }
    },
    copyLink() {
      const url = new URL(window.location.pathname, window.location.origin);
      url.hash = this.selectedColor.slug;
      return this.copyValue({ label: '颜色链接', value: url.href });
    },
  },
};
</script>

<style>
:root { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; font-synthesis: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; }
* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; padding: 0; background: transparent; }
body { min-width: 280px; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .45; }
button, a, input, textarea { -webkit-tap-highlight-color: transparent; }
button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--color-ink); outline-offset: 3px; }
.atlas {
  min-height: 100vh; min-height: 100dvh;
  transition: background-color .5s linear;
  background-image: linear-gradient(rgba(0,0,0,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.03) 1px, transparent 1px), radial-gradient(circle at 10% 20%, rgba(0,0,0,.02) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(0,0,0,.015) 0%, transparent 40%), radial-gradient(circle at 50% 60%, rgba(0,0,0,.01) 0%, transparent 50%);
  background-size: 30px 30px, 30px 30px, 100px 100px, 100px 100px, 150px 150px;
  background-position: 0 0, 0 0, 0 0, 100px 100px, 50px 50px;
  background-blend-mode: overlay, overlay, multiply, multiply, multiply;
}
.main-layout { display: flex; align-items: flex-start; gap: 20px; padding: 20px; }
.catalog { flex: 1; min-width: 0; }
.catalog-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 12px; font-size: 12px; }
.quiet-button { padding: 7px 0; background: transparent; color: inherit; border: 0; border-bottom: 1px solid color-mix(in srgb, currentColor 40%, transparent); border-radius: 0; font-size: 12px; }
.quiet-button:hover { border-bottom-color: currentColor; }
.result-count { font-size: 11px; margin-left: auto; }
.search-panel { margin-bottom: 16px; max-width: 640px; }
.search-field { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 10px; border: 1px solid color-mix(in srgb, currentColor 40%, transparent); border-radius: 4px; background: transparent; }
.search-field:focus-within { border-color: currentColor; }
.search-field input { flex: 1; width: 100%; min-width: 0; border: 0; background: transparent; outline: none; color: inherit; font-size: 14px; }
.search-field input::placeholder { color: inherit; opacity: 1; }
.search-field input::-webkit-search-cancel-button { display: none; }
.search-field kbd { font-size: 12px; padding: 0 4px; }
.clear-search { flex-shrink: 0; border: 0; background: none; color: inherit; padding: 8px 0; font-size: 12px; }
.family-filters { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.family-filter { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 5px 9px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit; font-size: 12px; }
.family-filter.active { border-color: currentColor; background: color-mix(in srgb, currentColor 8%, transparent); }
.family-filter:hover { border-color: color-mix(in srgb, currentColor 45%, transparent); }
.family-dot { width: 8px; height: 8px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--color-ink) 20%, transparent); }
.detail-column { position: sticky; top: 20px; width: 255px; flex: 0 0 255px; min-width: 0; max-height: calc(100vh - 40px); max-height: calc(100dvh - 40px); overflow-y: auto; scrollbar-width: thin; }
.outside-filter { margin: 12px 0 0; font-size: 11px; line-height: 1.8; }
.outside-filter button { border: 0; background: none; color: inherit; font-size: inherit; padding: 3px; text-decoration: underline; }
.empty-state { padding: 40px 12px; text-align: center; border: 1px dashed currentColor; border-radius: 4px; font-size: 13px; }
.empty-state p { line-height: 1.8; }
.toast-region { position: fixed; bottom: calc(24px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); z-index: 20; pointer-events: none; }
.toast { margin: 0; padding: 12px 20px; color: var(--color-ink); background: var(--selected-color); border: 1px solid currentColor; border-radius: 4px; box-shadow: 0 3px 18px #0002; font-size: 13px; white-space: nowrap; }
.copy-dialog { width: min(440px, calc(100% - 32px)); padding: 24px; color: var(--color-ink); background: var(--selected-color); border: 1px solid currentColor; border-radius: 6px; }
.copy-dialog::backdrop { background: #0006; }
.copy-dialog h2 { font-size: 18px; margin-top: 0; }
.copy-dialog p { font-size: 13px; line-height: 1.7; }
.copy-dialog textarea { width: 100%; resize: vertical; padding: 10px; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 3px; font: 13px/1.6 monospace; margin-bottom: 16px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 768px) {
  .main-layout { flex-direction: column-reverse; gap: 24px; align-items: center; padding: 16px 12px calc(20px + env(safe-area-inset-bottom)); }
  .catalog { flex: none; width: 100%; }
  .catalog-tools { gap: 14px; padding: 0 4px; }
  .detail-column { position: static; flex: none; width: 255px; max-width: 100%; max-height: none; overflow: visible; }
  .search-field input { font-size: 16px; }
  .search-field kbd { display: none; }
  .search-panel { max-width: none; margin-inline: 4px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
</style>
