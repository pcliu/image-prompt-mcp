# 产品需求文档 (PRD)

## 1. 概述
- **项目名称**: 图片生成提示词 MCP Server
- **文档版本**: 1.0
- **作者**: 86talent
- **日期**: 2025年 5 月 16 日

## 2. 目标
- **项目目标**: 设计一个通用的MCP Server，通过模板管理来生成提示词。模板中定义了工具中的默认参数，以便为不同需求（如6岁儿童的计算机原理书籍）提供插图的提示词。

## 3. 背景
- **项目背景**: 
  - 在AI生成图片的应用场景中，提示词的质量直接影响了生成图片的质量和一致性。
  - 不同的应用场景（如儿童读物插图、技术文档配图等）对图片风格有不同的要求。
  - 手动编写高质量的提示词需要专业知识和经验，且难以保证一致性。

- **应用场景**:
  - 以"6岁儿童的计算机原理书籍配图"为首个应用场景。
  - 通过模板化的方式，确保所有插图在风格、质量上的一致性。
  - 未来可扩展到其他场景，如技术文档、教育材料、营销内容等。

- **解决方案**:
  - 构建基于 MCP（Model Context Protocol）的提示词生成服务。
  - 通过模板管理和参数定义，实现提示词生成的标准化和可复用性。
  - 提供友好的接口，使非专业用户也能生成高质量的提示词。

## 4. 功能需求
- **核心功能**:
  1. **MCP 工具定义**:
     - **listTemplates**: 列出所有可用的提示词模板
       - 输入：无
       - 输出：模板列表，每个模板包含 id、名称、描述和默认参数
     - **getTemplate**: 获取指定模板的详细定义
       - 输入：模板 id
       - 输出：模板的完整定义，包括所有参数及其默认值
     - **createTemplateFromImage**: 根据图片生成模板
       - 输入：图片文件的本地地址
       - 输出：
         - 支持 sampling 时：新生成的模板定义
         - 不支持 sampling 时：
           - 模板参数指南（包含所有需要填写的参数说明）
           - 参数示例
           - 错误码：SAMPLING_NOT_SUPPORTED
       - 工作流程：
         1. Server 检查 Client 的 capabilities
         2. 如果支持 sampling：
            - Client 调用 createTemplateFromImage 工具并传入图片
            - Server 发起 sampling/createMessage 请求
            - Client（Host）收到 sampling 请求，进行人工审查
            - Client 调用 LLM 进行图片分析
            - Client 对分析结果进行人工审查
            - Client 将审查后的分析结果返回给 Server
            - Server 将分析结果转换为标准模板格式
            - Server 返回新生成的模板给 Client
         3. 如果不支持 sampling：
            - Server 返回模板参数指南和示例
            - Client 可以选择以下方式之一：
              a. 引导用户手动填写模板参数
              b. 使用客户端自身的 AI 能力分析图片：
                 - 客户端上传并分析图片
                 - 根据分析结果填充模板参数
                 - 自动填充的参数可以由用户进行调整
            - Client 调用 createTemplate 工具提交最终参数
       - 说明：
         - Server 通过检查 capabilities 适配不同客户端
         - 对于不支持 sampling 的客户端，提供多种模板创建方式
         - 充分利用客户端可能具有的 AI 能力
         - 保持功能完整性，只是实现方式不同
     - **createTemplate**: 创建新模板
       - 输入：
         - name: 模板名称
         - description: 模板描述
         - category: 模板分类（如：children-book, tech-doc, marketing）
         - parameters: 模板参数对象
           - subject: 主体内容
           - action: 动作/姿态（可选）
           - environment: 场景与背景（可选）
           - cameraAngle: 视角与构图（可选）
           - style: 风格与媒介（可选）
           - details: 细节与材质（可选）
           - lighting: 灯光与色调（可选）
           - mood: 情绪/主题氛围（可选）
           - technical: 相机或画面参数（可选）
           - quality: 质量与排行榜关键词（可选）
           - negativePrompt: 负面提示（可选）
       - 输出：
         - id: 新创建的模板 ID
         - name: 模板名称
         - description: 模板描述
         - category: 模板分类
         - parameters: 完整的模板参数
         - createdAt: 创建时间
       - 说明：
         - 用于手动创建新模板
         - 支持部分参数填写，未填写参数将使用默认值
         - 可以作为 createTemplateFromImage 的备选方案
         - 适用于所有客户端，不依赖 sampling 能力
     - **generatePrompt**: 生成提示词
       - 输入：
         - 模板 id
         - 参数覆盖（可选）：用于覆盖模板中的默认参数
       - 输出：生成的提示词

  2. **MCP Sampling 功能**:
     - **图片分析采样**:
       - 用途：分析输入图片，提取关键特征和属性
       - 配置参数：
         - temperature: 采样温度，控制输出的随机性
         - max_tokens: 最大生成的 token 数量
         - stop_sequences: 停止生成的序列
         - model: 使用的模型名称（默认使用 Host 端配置的模型）
       - 输出：结构化的图片分析结果，包含模版中定义的参数
       - 工作流程：
         - Host 端（如 Claude Desktop）负责图片分析和理解
         - 返回结构化的分析结果
         - Server 端将分析结果用于模板生成或更新

  3. **模板参数定义**:
     - **主体 (Subject)**: 明确"画什么"
     - **动作/姿态 (Action/pose)**: 如果主体在做事或有特定姿势
     - **场景与背景 (Environment/setting)**: 交代地点、时代、天气、室内外等
     - **视角与构图 (Camera angle/composition)**: 决定"从哪看"与"怎么排版"
     - **风格与媒介 (Style/medium)**: 让模型模仿特定艺术语言
     - **细节与材质 (Details/materials)**: 增加纹理和真实感
     - **灯光与色调 (Lighting/color palette)**: 左右画面氛围
     - **情绪/主题氛围 (Mood/atmosphere)**: 传达整体情感
     - **相机或画面参数 (Technical tags)**: 控制分辨率、镜头、比例
     - **质量与排行榜关键词 (Quality boosters)**: 暗示"高水准"
     - **负面提示 (Negative prompt)**: 明确"不要什么"

- **附加功能**:
  - 用户管理：支持不同用户的个性化需求
  - 日志记录：记录生成过程以便于后续分析和改进

## 5. 非功能需求
- **性能需求**: 系统的性能指标，如响应时间、并发用户数等。
- **安全需求**: 系统的安全性要求。
- **可用性需求**: 系统的可用性要求。

## 6. 用户界面
- **界面设计**: 描述用户界面的设计要求和风格。

## 7. 技术需求
- **编程语言**: 使用TypeScript作为主要编程语言，以便与MCP Server的TypeScript SDK兼容。
- **使用的包和库**:
  - `@modelcontextprotocol/sdk`: 用于与MCP Server进行交互。
  - 其他可能需要的库可以根据具体需求添加，比如用于处理HTTP请求的库（如`axios`）等。
- **开发环境**:
  - Node.js: 确保在服务器端运行TypeScript代码。
  - 开发工具：Visual Studio Code或其他支持TypeScript的IDE。
- **架构设计**:
  - 使用MCP Server的工具参数定义来管理提示词生成的逻辑。
  - 设计一个模块化的系统架构，以便于支持模板管理和功能扩展。
- **版本控制**:
  - 使用Git进行版本控制，托管在GitHub上。
- **部署和运行**:
  - 详细描述如何在本地和生产环境中部署和运行MCP Server。

## 8. 里程碑
- **项目时间表**: 列出项目的主要里程碑和时间节点。

## 9. 风险管理
- **潜在风险**: 模型生成的提示词不符合预期。

## 10. 附录
- **参考资料**: 列出相关的参考资料和文档。

