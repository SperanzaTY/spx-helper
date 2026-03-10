#!/usr/bin/env node
/**
 * 将 icon.svg 正确渲染为 16/48/128 PNG
 * 使用 @resvg/resvg-js 避免 qlmanage 缩略图产生的留白问题
 */
const { promises: fs } = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'images');

async function main() {
  const svgPath = path.join(ICONS_DIR, 'icon.svg');
  const svg = await fs.readFile(svgPath);
  const resvg = new Resvg(svg);
  const pngData = resvg.render().asPng();

  const out128 = path.join(ICONS_DIR, 'icon128.png');
  await fs.writeFile(out128, pngData);
  console.log('✓ icon128.png');

  const { execSync } = require('child_process');
  const sips = (h, w, src, dest) =>
    execSync(`sips -z ${h} ${w} "${src}" --out "${dest}"`, { stdio: 'pipe' });
  sips(48, 48, out128, path.join(ICONS_DIR, 'icon48.png'));
  console.log('✓ icon48.png');
  sips(16, 16, out128, path.join(ICONS_DIR, 'icon16.png'));
  console.log('✓ icon16.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
