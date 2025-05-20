# Image Prompt MCP

一个基于 Model Context Protocol (MCP) 的图像提示生成服务器。该服务器提供了模板管理和图像提示词生成功能，支持图像生成。

## 功能特性

- 基于模板生成优化的图像提示
- 支持自定义主体、风格、场景和气氛等多种参数
- 支持创建、管理和使用模板
- 支持从图片分析创建模板
- 支持直接生成图像（当客户端支持 MCP Sampling 时）

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

2. 使用 MCP 客户端调用工具（详见 MCP 客户端配置章节）

## MCP 客户端配置

您需要在 MCP 客户端中配置此服务器才能使用其功能。以下是配置方法：

### 配置文件

在 `~/.config/mcp/config.json` 或客户端支持的配置目录创建以下配置文件：

```json
{
  "mcpServers": {
    "image-prompt-mcp": {
      "command": "npx",
      "args": [
        "node",
        "dist/index.js"
      ],
      "cwd": "/path/to/your/image-prompt-mcp",
      "description": "图像提示词生成和管理服务器"
    }
  }
}
```

请确保将 `cwd` 替换为您实际的项目路径。

### 配置步骤

1. **确保项目已构建**：
   ```bash
   npm run build
   ```

2. **创建配置文件**：
   - 将上述 JSON 配置保存到客户端配置目录
   - 替换路径为您的实际项目路径

3. **配置客户端**：
   - 打开支持 MCP 的客户端（如 Claude Desktop）
   - 进入设置 → 开发者选项 → MCP 服务器
   - 加载配置文件或确认服务器已列出

### 使用说明

配置完成后，您可以在客户端中使用 `/mcp` 命令调用服务器提供的工具。确保在修改项目代码后重新运行 `npm run build` 以应用更改。

## 工具说明

### listTemplates

列出所有可用的提示词模板。

参数：
- page (可选)：页码，默认为 1
- pageSize (可选)：每页条数，默认为 10
- sortBy (可选)：排序字段，可选 'name', 'createdAt', 'updatedAt'，默认为 'createdAt'
- sortOrder (可选)：排序方式，可选 'asc', 'desc'，默认为 'desc'
- category (可选)：按分类过滤
- search (可选)：按名称搜索
- isActive (可选)：是否只显示激活的模板，默认为 true

返回：
- templates：模板列表
- pagination：分页信息

### getTemplate

获取特定模板的详细信息。

参数：
- id (必需)：模板 ID
- version (可选)：模板版本号，不指定则返回最新版本

返回：
- template：模板详细信息

### createTemplate

创建新的模板。

参数：
- name (必需)：模板名称
- description (必需)：模板描述
- category (必需)：模板分类（'children-book', 'tech-doc', 'marketing'）
- parameters (必需)：模板参数
  - subject (必需)：主体内容
  - action (可选)：动作/姿态
  - environment (可选)：场景与背景
  - cameraAngle (可选)：视角与构图
  - style (可选)：风格与媒介
  - details (可选)：细节与材质
  - lighting (可选)：灯光与色调
  - mood (可选)：情绪/主题氛围
  - technical (可选)：相机或画面参数
  - quality (可选)：质量与排行榜关键词
  - negativePrompt (可选)：负面提示

返回：
- id：新创建的模板 ID
- name：模板名称
- description：模板描述
- category：模板分类
- parameters：完整的模板参数
- version：模板版本
- createdAt：创建时间
- updatedAt：更新时间

### createTemplateFromImage

根据图片分析创建模板。

参数：
- imageUrl (必需)：图片的本地地址
- name (可选)：模板名称
- description (可选)：模板描述
- category (可选)：模板分类

返回：
- 支持 sampling 时：生成的模板详情和分析结果
- 不支持 sampling 时：模板参数指南和参数示例

### generateImage

根据模板或参数生成图片或提示词。

参数：
- templateId (可选)：模板 ID
- templateVersion (可选)：模板版本号
- subject (必需，如果未提供 templateId)：主体内容
- action (可选)：动作/姿态
- environment (可选)：场景与背景
- cameraAngle (可选)：视角与构图
- style (可选)：风格与媒介
- details (可选)：细节与材质
- lighting (可选)：灯光与色调
- mood (可选)：情绪/主题氛围
- technical (可选)：相机或画面参数
- quality (可选)：质量与排行榜关键词
- negativePrompt (可选)：负面提示
- width (可选)：图片宽度，默认为 512
- height (可选)：图片高度，默认为 512
- samplingSteps (可选)：采样步数，默认为 20

返回：
- 支持 sampling 时：生成的图片和元数据
- 不支持 sampling 时：生成的提示词和参数信息

## 示例调用

使用支持 MCP 协议的客户端（如 Claude Desktop）调用：

1. 列出所有模板：
```
/mcp listTemplates
```

2. 获取特定模板：
```
/mcp getTemplate --id "b1e1a1c0-0001-4000-8000-000000000001"
```

3. 根据模板生成图片：
```
/mcp generateImage --templateId "b1e1a1c0-0001-4000-8000-000000000001" --subject "一台可爱的小电脑" --width 768 --height 768
```

4. 不使用模板直接生成图片：
```
/mcp generateImage --subject "一只橙色的猫咪" --style "水彩画" --mood "快乐"
```

## 开发

1. 启动开发服务器：
```bash
npm run dev
```

2. 代码检查和格式化：
```bash
npm run lint
npm run format
```

## 许可证

MIT 