# 图标说明

由于Chrome扩展需要PNG格式的图标，请将 `icon.svg` 转换为以下三个尺寸的PNG文件：

1. `icon16.png` - 16x16像素
2. `icon48.png` - 48x48像素  
3. `icon128.png` - 128x128像素

## 转换方法

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

