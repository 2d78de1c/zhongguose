<template>
  <div
      ref="container"
      class="color-container"
      @touchmove.passive="cancelCenter"
      @wheel.passive="cancelCenter"
      @pointermove="handlePointerMove"
      @keydown="handleScrollKey"
      @scrollend="finishCenter"
  >
    <ColorCard
        v-for="color in colors"
        :key="color.slug"
        :color="color"
        :selected="color.slug === selectedSlug"
        :data-color-slug="color.slug"
        @click="selectColor(color)"
    />
  </div>
</template>

<script>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ColorCard from './ColorCard.vue';

export default {
  name: 'ColorContainer',
  components: { ColorCard },
  emits: ['select-color'],
  props: {
    colors: { type: Array, default: () => [] },
    selectedSlug: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const container = ref(null);
    let active = false;
    let mobileViewport;
    let reducedMotion;
    let observer;
    let queued = false;
    let queuedBehavior = 'smooth';
    let pendingLeft = null;

    function centerSelected(behavior) {
      const element = container.value;
      if (!active || !element || !mobileViewport.matches) return;
      const card = Array.from(element.children).find(child => child.dataset.colorSlug === props.selectedSlug);
      if (!card) return;
      const bounds = element.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const offset = cardBounds.left + cardBounds.width / 2 - (bounds.left + element.clientLeft + element.clientWidth / 2);
      if (Math.abs(offset) < 0.5) { pendingLeft = null; return; }
      const left = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + offset));
      const motion = reducedMotion.matches ? 'auto' : behavior;
      if (motion === 'smooth' && pendingLeft !== null && Math.abs(left - pendingLeft) < 0.5) return;
      pendingLeft = motion === 'smooth' ? left : null;
      element.scrollTo({ left, behavior: motion });
    }

    // Keep repeated taps from restarting the same animation; a deliberate swipe
    // or keyboard scroll releases the target so a later tap can center it again.
    function cancelCenter() { pendingLeft = null; }
    function handlePointerMove(event) { if (event.buttons) cancelCenter(); }
    function handleScrollKey(event) {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) cancelCenter();
    }
    function finishCenter() {
      if (pendingLeft !== null && Math.abs(container.value.scrollLeft - pendingLeft) < 1) cancelCenter();
    }

    // Click and prop updates share one post-render scroll, including repeat clicks.
    function scheduleCenter(behavior = 'smooth') {
      if (behavior === 'auto') queuedBehavior = 'auto';
      if (queued) return;
      queued = true;
      nextTick(() => {
        queued = false;
        const behavior = queuedBehavior;
        queuedBehavior = 'smooth';
        centerSelected(behavior);
      });
    }
    function selectColor(color) {
      emit('select-color', color);
      scheduleCenter();
    }
    const realign = () => scheduleCenter('auto');
    watch(() => [props.selectedSlug, props.colors], () => scheduleCenter(), { flush: 'post' });

    onMounted(() => {
      active = true;
      mobileViewport = window.matchMedia('(max-width: 768px)');
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      mobileViewport.addEventListener('change', realign);
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(realign);
        observer.observe(container.value, { box: 'border-box' });
      } else {
        window.addEventListener('resize', realign);
      }
      // Allow the parent's initial hash selection to reach this component first.
      nextTick(realign);
    });
    onBeforeUnmount(() => {
      active = false;
      observer?.disconnect();
      mobileViewport?.removeEventListener('change', realign);
      window.removeEventListener('resize', realign);
    });
    return { container, selectColor, cancelCenter, handlePointerMove, handleScrollKey, finishCenter };
  },
};
</script>

<style scoped>
.color-container {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

@media (max-width: 768px) {
  .color-container {
    flex-wrap: nowrap;
    justify-content: flex-start;
    max-width: 100%;
    /* Mobile cards are 70px wide; both end cards need half a viewport of space. */
    padding: 6px max(4px, calc(50% - 35px)) 12px;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0;
    -webkit-overflow-scrolling: touch;
  }

  .color-container > * {
    flex-shrink: 0;
    scroll-snap-align: center;
  }

  .color-container::-webkit-scrollbar { height: 6px; }
  .color-container::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: color-mix(in srgb, var(--color-ink, #fff) 32%, transparent);
  }
  .color-container::-webkit-scrollbar-track { background: transparent; }
}
</style>
