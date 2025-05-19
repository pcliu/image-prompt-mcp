# Image Prompt MCP

一个基于 Model Context Protocol (MCP) 的图像提示生成服务器。该服务器提供了一套工具，用于生成和优化用于图像生成的提示词。

## 功能特性

- 基于描述生成优化的图像提示
- 支持自定义风格、情绪和格式
- 自动添加质量增强提示词
- 生成负面提示词以提高图像质量

## 安装

1. 克隆仓库：
```bash
git clone https://github.com/yourusername/image-prompt-mcp.git
cd image-prompt-mcp
```

2. 安装依赖：
```bash
npm install
```

3. 构建项目：
```bash
npm run build
```

## 使用方法

1. 启动服务器：
```bash
npm start
```

2. 使用 MCP 客户端调用工具：
```bash
mcp call generate_image_prompt --params '{"description": "一只可爱的猫咪", "style": "动漫", "mood": "愉快"}' http://localhost:3000
```

## 开发

1. 启动开发服务器：
```bash
npm run dev
```

2. 运行测试：
```bash
npm test
```

3. 代码格式化：
```bash
npm run format
```

## 工具说明

### generate_image_prompt

生成优化的图像提示词。

参数：
- description (必需)：图像的主要描述
- style (可选)：艺术风格（如："realistic"、"anime"、"oil painting"）
- mood (可选)：情绪氛围（如："happy"、"mysterious"、"dramatic"）
- format (可选)：图像格式或宽高比（如："portrait"、"landscape"、"square"）

返回：
- prompt：优化后的提示词
- negativePrompt：用于提高质量的负面提示词

## 环境变量

创建 `.env` 文件并设置以下变量：

```
PORT=3000
```

## 许可证

MIT 