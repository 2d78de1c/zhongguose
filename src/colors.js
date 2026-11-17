import sourceColors from '../api/colors.json' with { type: 'json' };

// Preserve the source records; use one display color for HEX, RGB and backgrounds.
const counts = new Map();
for (const color of sourceColors) {
  const key = color.Pinyin.toLowerCase();
  counts.set(key, (counts.get(key) || 0) + 1);
}

export const colorFamilies = [
  { key: 'all', label: '全部', swatch: null },
  { key: 'red', label: '红', swatch: '#c9474f' },
  { key: 'orange', label: '橙', swatch: '#e68b48' },
  { key: 'yellow', label: '黄', swatch: '#d4b751' },
  { key: 'green', label: '绿', swatch: '#739568' },
  { key: 'cyan', label: '青', swatch: '#4e9999' },
  { key: 'blue', label: '蓝', swatch: '#567da8' },
  { key: 'purple', label: '紫', swatch: '#916c98' },
  { key: 'neutral', label: '素', swatch: '#a09c91' },
];

function classifyRGB(rgb) {
  const [r, g, b] = rgb.map(value => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.12 || lightness < 0.065) return 'neutral';
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 15 || hue >= 345) return 'red';
  if (hue < 45) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 200) return 'cyan';
  if (hue < 270) return 'blue';
  return 'purple';
}

export const colors = sourceColors.map((color, index) => {
  const key = color.Pinyin.toLowerCase();
  const hex = color.Hex.toLowerCase();
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  return {
    ...color,
    id: index + 1,
    Hex: hex,
    RGB: rgb,
    family: classifyRGB(rgb),
    slug: counts.get(key) > 1 ? `${key}-${hex.slice(1)}` : key,
    ink: luminance > 0.179 ? '#000000' : '#ffffff',
  };
});

export function resolveColorHash(hash) {
  const key = hash.replace(/^#/, '').toLowerCase();
  return colors.find(color => color.slug === key)
    || colors.find(color => color.Pinyin.toLowerCase() === key)
    || colors[0];
}

export function filterColors(list, query = '', family = 'all') {
  let normalized = String(query).trim().toLowerCase().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    normalized = '#' + [...normalized.slice(1)].map(char => char + char).join('');
  }
  const rgbQuery = normalized.replace(/^rgb\(/, '').replace(/\)$/, '');
  return list.filter(color => {
    if (family !== 'all' && color.family !== family) return false;
    if (!normalized) return true;
    return color.Name.includes(normalized)
      || color.Pinyin.toLowerCase().includes(normalized)
      || color.Hex.includes(normalized)
      || color.RGB.join(',') === rgbQuery;
  });
}
