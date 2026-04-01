# 图标说明

SPX Helper 图标采用蓝色渐变 (#667eea → #764ba2) 背景 + 白色大号 "S"，与扩展 UI 主色一致，S 代表 SPX。

Chrome 扩展需要 PNG 格式，请将 `icon.svg` 转换为：
- `icon16.png` - 16x16
- `icon48.png` - 48x48
- `icon128.png` - 128x128

## 转换方法

### macOS 快速转换（无需安装）
```bash
qlmanage -t -s 128 -o . icon.svg
cp icon.svg.png icon128.png
sips -z 48 48 icon128.png --out icon48.png
sips -z 16 16 icon128.png --out icon16.png
rm icon.svg.png
```

### 方式一：使用在线工具
访问 https://www.svgtopng.com/ 或其他SVG转PNG工具

### 方式二：使用命令行 (需要安装 ImageMagick)
```bash
# 安装 ImageMagick (Mac)
brew install imagemagick

# 转换图标
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

### 方式三：使用设计工具
使用 Figma、Photoshop 或 Sketch 打开SVG并导出为PNG

## 临时方案

如果暂时没有图标，扩展仍然可以正常运行，只是会显示默认图标。你可以稍后再添加自定义图标。

