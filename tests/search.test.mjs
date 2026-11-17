import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colors, colorFamilies, filterColors } from '../src/colors.js';

const names = result => result.map(color => color.Name);
const familyKeys = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'neutral'];

test('each color belongs to exactly one selectable color family', () => {
  assert.deepEqual(new Set(colorFamilies.map(family => family.key)), new Set(['all', ...familyKeys]));
  assert.equal(colorFamilies.length, familyKeys.length + 1, 'family options must not repeat');
  assert.equal(colorFamilies.find(family => family.key === 'all').label, '全部');

  const appearances = new Map(colors.map(color => [color.slug, 0]));
  for (const color of colors) {
    assert.ok(familyKeys.includes(color.family), `${color.Name} must have one known family`);
  }
  for (const family of familyKeys) {
    const result = filterColors(colors, '', family);
    for (const color of result) {
      assert.ok(appearances.has(color.slug), 'family filtering must only return input colors');
      assert.equal(color.family, family);
      appearances.set(color.slug, appearances.get(color.slug) + 1);
    }
  }
  for (const [slug, count] of appearances) {
    assert.equal(count, 1, `${slug} must appear in exactly one family result`);
  }
});

test('empty and whitespace-only queries return every supplied color', () => {
  assert.deepEqual(filterColors(colors), colors);
  assert.deepEqual(filterColors(colors, ''), colors);
  assert.deepEqual(filterColors(colors, ' \t\n '), colors);

  const subset = colors.slice(3, 8);
  assert.deepEqual(filterColors(subset, ' '), subset, 'the input list, not the global catalog, is searched');
  assert.deepEqual(filterColors([], ''), []);
});

test('Chinese names can be found by a substring', () => {
  assert.deepEqual(names(filterColors(colors, '乳白')), ['乳白']);
  assert.deepEqual(names(filterColors(colors, '佛手')), ['佛手黄']);
});

test('pinyin searches ignore case and whitespace', () => {
  assert.deepEqual(names(filterColors(colors, 'RU BAI')), ['乳白']);
  assert.deepEqual(names(filterColors(colors, '  Fo\tShou\nHuang  ')), ['佛手黄']);
});

test('colors sharing the same pinyin remain independent search results', () => {
  const result = filterColors(colors, 'YOU HUANG');
  assert.deepEqual(new Set(names(result)), new Set(['柚黄', '鼬黄']));
  assert.equal(result.length, 2);
  assert.deepEqual(new Set(result.map(color => color.Hex)), new Set(['#f1ca17', '#fcb70a']));
});

test('hex searches accept either prefixed or unprefixed values', () => {
  for (const query of ['#f9f4dc', 'f9f4dc', '#F9F4DC', 'F9F4DC']) {
    assert.deepEqual(names(filterColors(colors, query)), ['乳白'], query);
  }
  assert.deepEqual(names(filterColors(colors, '#fed71a')), ['佛手黄']);
});

test('an explicit three-digit hex code expands to its six-digit color', () => {
  // The catalog contains no pure white, so use a white and a similar prefix
  // to distinguish shorthand expansion from a loose substring match.
  const fixture = [
    { Name: '纯白样本', Pinyin: 'chunbai', Hex: '#ffffff', RGB: [255, 255, 255], family: 'neutral' },
    { Name: '近白样本', Pinyin: 'jinbai', Hex: '#fffefa', RGB: [255, 254, 250], family: 'neutral' },
    { Name: '纯黑样本', Pinyin: 'chunhei', Hex: '#000000', RGB: [0, 0, 0], family: 'neutral' },
  ];
  assert.deepEqual(names(filterColors(fixture, '#fff')), ['纯白样本']);
  assert.deepEqual(names(filterColors(fixture, '#FFF')), ['纯白样本']);
  assert.deepEqual(names(filterColors(fixture, '#000')), ['纯黑样本']);
});

test('RGB searches accept CSS notation and comma-separated channel values', () => {
  for (const query of ['rgb(249,244,220)', '249, 244, 220']) {
    assert.deepEqual(names(filterColors(colors, query)), ['乳白'], query);
  }
  assert.deepEqual(names(filterColors(colors, 'rgb(254,215,26)')), ['佛手黄']);
});

test('family filters and text queries are combined with AND', () => {
  assert.deepEqual(names(filterColors(colors, '佛手', 'yellow')), ['佛手黄']);
  assert.deepEqual(filterColors(colors, '佛手', 'blue'), []);
  assert.deepEqual(names(filterColors(colors, '佛手', 'all')), ['佛手黄']);
  assert.deepEqual(filterColors(colors, ' \t ', 'yellow'), filterColors(colors, '', 'yellow'));
  assert.ok(filterColors(colors, '', 'yellow').every(color => color.family === 'yellow'));
});

test('queries without a match return an empty list', () => {
  assert.deepEqual(filterColors(colors, '不存在的颜色名称'), []);
  assert.deepEqual(filterColors([], '乳白'), []);
});

test('searching and filtering do not mutate the input list or its records', () => {
  const fixture = structuredClone(colors);
  const before = structuredClone(fixture);
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  };
  deepFreeze(fixture);
  for (const [query, family] of [
    ['YOU HUANG', 'all'],
    ['#f9f4dc', 'all'],
    ['rgb(249,244,220)', 'all'],
    ['', 'yellow'],
    ['佛手', 'blue'],
  ]) {
    filterColors(fixture, query, family);
  }
  assert.deepEqual(fixture, before);
});
