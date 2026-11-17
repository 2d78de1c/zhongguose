import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colors, resolveColorHash } from '../src/colors.js';

test('all 526 colors have a unique shareable identity', () => {
  assert.equal(colors.length, 526);
  assert.equal(new Set(colors.map(color => color.slug)).size, 526);
  for (const color of colors) assert.equal(resolveColorHash('#' + color.slug), color);
});

test('both yellow names can be opened independently while legacy links remain valid', () => {
  const pomelo = colors.find(color => color.Name === '柚黄');
  const weasel = colors.find(color => color.Name === '鼬黄');
  assert.notEqual(pomelo.slug, weasel.slug);
  assert.equal(resolveColorHash('#' + pomelo.slug).Name, '柚黄');
  assert.equal(resolveColorHash('#' + weasel.slug).Name, '鼬黄');
  assert.equal(resolveColorHash('#youhuang').Name, '鼬黄');
});

test('unknown and case-insensitive links resolve safely', () => {
  assert.equal(resolveColorHash('#not-a-color').Name, '乳白');
  assert.equal(resolveColorHash('#FOSHOUHUANG').Name, '佛手黄');
  assert.equal(resolveColorHash('').Name, '乳白');
});

test('display RGB and hexadecimal describe the same color', () => {
  for (const color of colors) {
    const actual = '#' + color.RGB.map(value => value.toString(16).padStart(2, '0')).join('');
    assert.equal(actual, color.Hex);
  }
  assert.deepEqual(colors.find(color => color.Name === '杏仁黄').RGB, [247, 232, 170]);
});

test('text contrast is sufficient on every display color', () => {
  const luminance = rgb => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  for (const color of colors) {
    const bg=luminance(color.RGB);
    const text=luminance(color.ink==='#000000'?[0,0,0]:[255,255,255]);
    assert.ok((Math.max(bg,text)+.05)/(Math.min(bg,text)+.05)>=4.5, color.Name);
  }
});
