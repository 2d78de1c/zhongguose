import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@vue/compiler-sfc';

// Exercise actual component methods with browser capabilities substituted.
// This is an action-level test, not a layout or browser rendering test.
const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
let script = parse(source).descriptor.script.content;
script = script.replace("import ColorContainer from './components/ColorContainer.vue';", 'const ColorContainer = {};')
  .replace("import ColorBox from './components/ColorBox.vue';", 'const ColorBox = {};')
  .replace("'./colors.js'", JSON.stringify(new URL('../src/colors.js', import.meta.url).href));
const { default: App } = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));

async function withGlobal(name, value, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  try { await run(); }
  finally {
    if (previous) Object.defineProperty(globalThis, name, previous);
    else delete globalThis[name];
  }
}

test('successful copy writes the full selected value and announces success', async () => {
  const written = [], notices = [];
  const state = { copyRequest: 0, notify: message => notices.push(message) };
  await withGlobal('navigator', { clipboard: { writeText: async value => written.push(value) } }, async () => {
    await App.methods.copyValue.call(state, { label: 'RGB', value: 'rgb(249, 244, 220)' });
  });
  assert.deepEqual(written, ['rgb(249, 244, 220)']);
  assert.deepEqual(notices, ['RGB 已复制']);
});

test('clipboard rejection offers the exact text for manual copy without claiming success', async () => {
  const notices = [], actions = [];
  const state = {
    copyRequest: 0, notify: message => notices.push(message), $nextTick: async () => {},
    $refs: {
      copyDialog: { open: false, showModal: () => actions.push('open') },
      manualCopyInput: { focus: () => actions.push('focus'), select: () => actions.push('select') },
    },
  };
  await withGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } }, async () => {
    await App.methods.copyValue.call(state, { label: 'HEX', value: '#F9F4DC' });
  });
  assert.deepEqual(state.manualCopy, { label: 'HEX', value: '#F9F4DC' });
  assert.deepEqual(actions, ['open', 'focus', 'select']);
  assert.deepEqual(notices, []);
});

test('sharing retains the Site path and unique color but omits all query parameters', async () => {
  let copied;
  await withGlobal('window', { location: { origin: 'https://colors.example', pathname: '/palette/', search: '?token=sensitive', hash: '#old' } }, async () => {
    await App.methods.copyLink.call({ selectedColor: { slug: 'youhuang-f1ca17' }, copyValue: value => { copied = value; } });
  });
  assert.deepEqual(copied, { label: '颜色链接', value: 'https://colors.example/palette/#youhuang-f1ca17' });
});

test('random discovery respects the current filtered result and skips an empty result', () => {
  const color = { slug: 'rubai', Name: '乳白' };
  const picked = [];
  App.methods.chooseRandom.call({ filteredColors: [color], selectedColor: color, handleSelectColor: value => picked.push(value) });
  App.methods.chooseRandom.call({ filteredColors: [], selectedColor: color, handleSelectColor: value => picked.push(value) });
  assert.deepEqual(picked, [color]);
});
