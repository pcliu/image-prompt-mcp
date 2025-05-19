import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Template, TemplateSchema, TemplateParameters, validateTemplate } from '../models/template.js';
import { checkSamplingSupport } from '../sampling/checker.js';
import { handleSamplingRequest, SamplingCreateMessageResponse, Message, MessageContent, SamplingServer } from '../sampling/handler.js';

// 定义错误类型
export enum TemplateErrorType {
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class TemplateError extends Error {
  constructor(
    public type: TemplateErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

// 定义分页参数
const PaginationParams = {
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(10),
};

// 定义排序参数
const SortParams = {
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
};

// 定义过滤参数
const FilterParams = {
  category: z.string().optional(),
  search: z.string().optional(),
  isActive: z.boolean().optional().default(true),
};

// 组合所有参数
const ListTemplatesParams = {
  ...PaginationParams,
  ...SortParams,
  ...FilterParams,
};

type ListTemplatesParamsType = {
  page: number;
  pageSize: number;
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
  category?: string;
  search?: string;
  isActive: boolean;
};

// 定义 getTemplate 参数
const GetTemplateParams = {
  id: z.string().uuid(),
  version: z.number().int().positive().optional(),
};

type GetTemplateParamsType = {
  id: string;
  version?: number;
};

// 定义 createTemplate 参数
const CreateTemplateParams = {
  name: {
    type: 'string',
    description: '模板名称',
    minLength: 1,
    maxLength: 100,
  },
  description: {
    type: 'string',
    description: '模板描述',
    maxLength: 500,
  },
  category: {
    type: 'string',
    description: '模板分类',
    enum: ['children-book', 'tech-doc', 'marketing'],
  },
  parameters: {
    type: 'object',
    description: '模板参数',
    properties: {
      subject: {
        type: 'string',
        description: '主体内容 - 明确"画什么"',
        minLength: 1,
      },
      action: {
        type: 'string',
        description: '动作/姿态 - 如果主体在做事或有特定姿势',
        optional: true,
      },
      environment: {
        type: 'string',
        description: '场景与背景 - 交代地点、时代、天气、室内外等',
        optional: true,
      },
      cameraAngle: {
        type: 'string',
        description: '视角与构图 - 决定"从哪看"与"怎么排版"',
        optional: true,
      },
      style: {
        type: 'string',
        description: '风格与媒介 - 让模型模仿特定艺术语言',
        optional: true,
      },
      details: {
        type: 'string',
        description: '细节与材质 - 增加纹理和真实感',
        optional: true,
      },
      lighting: {
        type: 'string',
        description: '灯光与色调 - 左右画面氛围',
        optional: true,
      },
      mood: {
        type: 'string',
        description: '情绪/主题氛围 - 传达整体情感',
        optional: true,
      },
      technical: {
        type: 'string',
        description: '相机或画面参数 - 控制分辨率、镜头、比例',
        optional: true,
      },
      quality: {
        type: 'string',
        description: '质量与排行榜关键词 - 暗示"高水准"',
        optional: true,
      },
      negativePrompt: {
        type: 'string',
        description: '负面提示 - 明确"不要什么"',
        optional: true,
      },
    },
  },
};

type CreateTemplateParamsType = {
  name: string;
  description: string;
  category: 'children-book' | 'tech-doc' | 'marketing';
  parameters: {
    subject: string;
    action?: string;
    environment?: string;
    cameraAngle?: string;
    style?: string;
    details?: string;
    lighting?: string;
    mood?: string;
    technical?: string;
    quality?: string;
    negativePrompt?: string;
  };
};

// 定义 createTemplateFromImage 参数
const CreateTemplateFromImageParams = {
  imageUrl: {
    type: 'string',
    description: '图片的本地地址',
  },
  name: {
    type: 'string',
    description: '模板名称',
    minLength: 1,
    maxLength: 100,
    optional: true,
  },
  description: {
    type: 'string',
    description: '模板描述',
    maxLength: 500,
    optional: true,
  },
  category: {
    type: 'string',
    description: '模板分类',
    enum: ['children-book', 'tech-doc', 'marketing'],
    optional: true,
  },
};

// 模拟数据存储
let templates: Template[] = [];

/**
 * 解析图片分析结果为模板参数
 * @param analysis LLM 返回的分析文本
 * @returns 解析后的模板参数
 */
function parseAnalysisToTemplateParams(analysis: string): Partial<TemplateParameters> {
  // 将分析文本按行分割
  const lines = analysis.split('\n');
  const params: Record<string, string> = {};

  // 定义参数映射关系
  const paramMappings = {
    '主体内容': 'subject',
    '动作/姿态': 'action',
    '场景与背景': 'environment',
    '视角与构图': 'cameraAngle',
    '风格与媒介': 'style',
    '细节与材质': 'details',
    '灯光与色调': 'lighting',
    '情绪/主题氛围': 'mood',
    '相机或画面参数': 'technical',
    '质量提升关键词': 'quality',
    '需要避免的元素': 'negativePrompt'
  };

  // 遍历每一行，提取参数
  for (const line of lines) {
    for (const [key, paramName] of Object.entries(paramMappings)) {
      if (line.startsWith(key + '：')) {
        const value = line.substring(key.length + 1).trim();
        if (value && value !== '无' && value !== 'N/A') {
          params[paramName] = value;
        }
      }
    }
  }

  // 确保必需的 subject 参数存在
  if (!params.subject) {
    throw new TemplateError(
      TemplateErrorType.INVALID_PARAMETERS,
      '图片分析结果缺少必需的主体内容描述'
    );
  }

  return params;
}

/**
 * 注册模板管理工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export function registerTemplateTools(server: McpServer) {
  // 注册 listTemplates 工具
  server.tool(
    'listTemplates',
    ListTemplatesParams,
    async (params: ListTemplatesParamsType) => {
      try {
        // 应用过滤
        let filteredTemplates = templates.filter(template => {
          if (params.isActive !== undefined && template.isActive !== params.isActive) {
            return false;
          }
          if (params.category && template.category !== params.category) {
            return false;
          }
          if (params.search) {
            const searchLower = params.search.toLowerCase();
            return (
              template.name.toLowerCase().includes(searchLower) ||
              template.description.toLowerCase().includes(searchLower)
            );
          }
          return true;
        });

        // 应用排序
        filteredTemplates.sort((a, b) => {
          const sortBy = params.sortBy;
          const sortOrder = params.sortOrder === 'asc' ? 1 : -1;

          if (sortBy === 'name') {
            return sortOrder * a.name.localeCompare(b.name);
          }
          if (sortBy === 'createdAt') {
            return sortOrder * (a.createdAt.getTime() - b.createdAt.getTime());
          }
          if (sortBy === 'updatedAt') {
            return sortOrder * (a.updatedAt.getTime() - b.updatedAt.getTime());
          }
          return 0;
        });

        // 应用分页
        const startIndex = (params.page - 1) * params.pageSize;
        const endIndex = startIndex + params.pageSize;
        const paginatedTemplates = filteredTemplates.slice(startIndex, endIndex);

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `找到 ${filteredTemplates.length} 个模板`,
            },
          ],
          structuredContent: {
            templates: paginatedTemplates.map(template => ({
              id: template.id,
              name: template.name,
              description: template.description,
              category: template.category,
              version: template.version,
              createdAt: template.createdAt,
              updatedAt: template.updatedAt,
            })),
            pagination: {
              total: filteredTemplates.length,
              page: params.page,
              pageSize: params.pageSize,
              totalPages: Math.ceil(filteredTemplates.length / params.pageSize),
            },
          },
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TemplateError(
            TemplateErrorType.INVALID_PARAMETERS,
            '参数验证失败',
            error
          );
        }
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '获取模板列表失败',
          error
        );
      }
    }
  );

  // 注册 getTemplate 工具
  server.tool(
    'getTemplate',
    GetTemplateParams,
    async (params: GetTemplateParamsType) => {
      try {
        // 查找模板
        const template = templates.find(t => t.id === params.id);
        
        if (!template) {
          throw new TemplateError(
            TemplateErrorType.TEMPLATE_NOT_FOUND,
            `模板 ${params.id} 不存在`
          );
        }

        // 如果指定了版本，检查版本是否匹配
        if (params.version && template.version !== params.version) {
          throw new TemplateError(
            TemplateErrorType.TEMPLATE_NOT_FOUND,
            `模板 ${params.id} 的版本 ${params.version} 不存在`
          );
        }

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `找到模板: ${template.name}`,
            },
          ],
          structuredContent: {
            template: {
              ...template,
              parameters: {
                ...template.parameters,
                // 添加每个参数的描述信息
                _descriptions: {
                  subject: '主体内容 - 明确"画什么"',
                  action: '动作/姿态 - 如果主体在做事或有特定姿势',
                  environment: '场景与背景 - 交代地点、时代、天气、室内外等',
                  cameraAngle: '视角与构图 - 决定"从哪看"与"怎么排版"',
                  style: '风格与媒介 - 让模型模仿特定艺术语言',
                  details: '细节与材质 - 增加纹理和真实感',
                  lighting: '灯光与色调 - 左右画面氛围',
                  mood: '情绪/主题氛围 - 传达整体情感',
                  technical: '相机或画面参数 - 控制分辨率、镜头、比例',
                  quality: '质量与排行榜关键词 - 暗示"高水准"',
                  negativePrompt: '负面提示 - 明确"不要什么"',
                },
              },
            },
          },
        };
      } catch (error) {
        if (error instanceof TemplateError) {
          throw error;
        }
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '获取模板详情失败',
          error
        );
      }
    }
  );

  // 注册 createTemplate 工具
  server.tool(
    'createTemplate',
    {
      title: '创建模板',
      description: '创建一个新的提示词模板',
      parameters: CreateTemplateParams,
    },
    async (args: { [key: string]: any }, extra) => {
      try {
        // 创建新模板
        const newTemplate: Template = {
          id: crypto.randomUUID(),
          name: args.name,
          description: args.description,
          category: args.category as Template['category'],
          parameters: args.parameters,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
        };

        // 添加到存储
        templates.push(newTemplate);

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `成功创建模板: ${newTemplate.name}`,
            },
          ],
          structuredContent: {
            template: {
              id: newTemplate.id,
              name: newTemplate.name,
              description: newTemplate.description,
              category: newTemplate.category,
              version: newTemplate.version,
              createdAt: newTemplate.createdAt,
              parameters: newTemplate.parameters,
            },
          },
        };
      } catch (error) {
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '创建模板失败',
          error
        );
      }
    }
  );

  // 注册 createTemplateFromImage 工具
  server.tool(
    'createTemplateFromImage',
    {
      title: '从图片创建模板',
      description: '通过分析图片来创建提示词模板',
      parameters: CreateTemplateFromImageParams,
    },
    async (args: { [key: string]: any }, extra) => {
      try {
        // 检查客户端 sampling 支持
        const supportsSampling = checkSamplingSupport(extra);

        if (!supportsSampling) {
          // 返回模板参数指南
          return {
            content: [
              {
                type: 'text',
                text: '客户端不支持图片分析功能，请参考以下指南手动创建模板：',
              },
              {
                type: 'text',
                text: `
参数填写指南：

1. 基本信息
- name: 模板名称（1-100字符）
- description: 模板描述（最多500字符）
- category: 模板分类（children-book/tech-doc/marketing）

2. 图片参数
- subject: 主体内容 - 明确"画什么"（必填）
- action: 动作/姿态 - 如果主体在做事或有特定姿势
- environment: 场景与背景 - 交代地点、时代、天气、室内外等
- cameraAngle: 视角与构图 - 决定"从哪看"与"怎么排版"
- style: 风格与媒介 - 让模型模仿特定艺术语言
- details: 细节与材质 - 增加纹理和真实感
- lighting: 灯光与色调 - 左右画面氛围
- mood: 情绪/主题氛围 - 传达整体情感
- technical: 相机或画面参数 - 控制分辨率、镜头、比例
- quality: 质量与排行榜关键词 - 暗示"高水准"
- negativePrompt: 负面提示 - 明确"不要什么"

建议：
1. 仔细观察图片的各个方面
2. 从主体内容开始，逐步添加细节
3. 注意记录图片的风格和氛围
4. 可以使用客户端的 AI 能力辅助分析图片

完成参数填写后，请使用 createTemplate 工具创建模板。`,
              },
            ],
            structuredContent: {
              error: 'SAMPLING_NOT_SUPPORTED',
              parameterGuide: {
                required: ['subject'],
                optional: [
                  'action',
                  'environment',
                  'cameraAngle',
                  'style',
                  'details',
                  'lighting',
                  'mood',
                  'technical',
                  'quality',
                  'negativePrompt',
                ],
                descriptions: {
                  subject: '主体内容 - 明确"画什么"',
                  action: '动作/姿态 - 如果主体在做事或有特定姿势',
                  environment: '场景与背景 - 交代地点、时代、天气、室内外等',
                  cameraAngle: '视角与构图 - 决定"从哪看"与"怎么排版"',
                  style: '风格与媒介 - 让模型模仿特定艺术语言',
                  details: '细节与材质 - 增加纹理和真实感',
                  lighting: '灯光与色调 - 左右画面氛围',
                  mood: '情绪/主题氛围 - 传达整体情感',
                  technical: '相机或画面参数 - 控制分辨率、镜头、比例',
                  quality: '质量与排行榜关键词 - 暗示"高水准"',
                  negativePrompt: '负面提示 - 明确"不要什么"',
                },
              },
            },
          };
        }

        // 发起图片分析请求
        const analysisResult = await handleSamplingRequest(server as unknown as SamplingServer, {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `你是一个专业的图片分析助手。请分析给定的图片，提取以下信息：

1. 主体内容：图片中的主要对象或主题是什么
2. 动作/姿态：主体在做什么，有什么特定的姿势
3. 场景与背景：在什么环境中，包括地点、时代、天气等
4. 视角与构图：从什么角度拍摄，如何排版
5. 风格与媒介：使用了什么艺术风格或表现手法
6. 细节与材质：有什么特殊的纹理或材质表现
7. 灯光与色调：光线效果和整体色彩风格
8. 情绪/主题氛围：传达了什么样的情感或氛围
9. 相机或画面参数：分辨率、比例等技术细节
10. 质量提升关键词：能提升生成质量的关键特征
11. 需要避免的元素：不希望出现的内容或效果

请以结构化的方式返回分析结果，确保每个类别都有明确的描述。如果某个类别没有明显特征，请填写"无"。`
              }
            },
            {
              role: 'user',
              content: {
                type: 'text',
                text: `请分析这张图片，提取用于生成类似图片的关键特征。`
              }
            },
            {
              role: 'user',
              content: {
                type: 'image',
                data: args.imageUrl,
                mimeType: 'image/png'
              }
            },
          ],
          temperature: 0.7,
          maxTokens: 1000,
        }) as SamplingCreateMessageResponse;

        if (!analysisResult?.content?.text) {
          throw new Error('图片分析失败：未收到有效的分析结果');
        }

        // 解析分析结果
        const templateParams = parseAnalysisToTemplateParams(analysisResult.content.text);

        // 创建新模板
        const newTemplate: Template = {
          id: crypto.randomUUID(),
          name: args.name || '从图片创建的模板',
          description: args.description || `基于图片分析创建的模板 - ${new Date().toISOString()}`,
          category: args.category as Template['category'] || 'tech-doc',
          parameters: templateParams as TemplateParameters,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
        };

        // 验证新模板
        try {
          validateTemplate(newTemplate);
        } catch (validationError) {
          throw new TemplateError(
            TemplateErrorType.INVALID_PARAMETERS,
            '生成的模板参数无效',
            validationError
          );
        }

        // 添加到存储
        templates.push(newTemplate);

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `成功从图片创建模板: ${newTemplate.name}`,
            },
            {
              type: 'text',
              text: '图片分析结果：\n' + analysisResult.content.text,
            },
          ],
          structuredContent: {
            template: {
              id: newTemplate.id,
              name: newTemplate.name,
              description: newTemplate.description,
              category: newTemplate.category,
              version: newTemplate.version,
              createdAt: newTemplate.createdAt,
              parameters: newTemplate.parameters,
              analysis: analysisResult.content.text,
            },
          },
        };
      } catch (error) {
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '从图片创建模板失败',
          error
        );
      }
    }
  );

  // 定义更新模板参数
  const UpdateTemplateParams = {
    id: {
      type: 'string',
      description: '模板ID',
    },
    name: {
      type: 'string',
      description: '模板名称',
      minLength: 1,
      maxLength: 100,
      optional: true,
    },
    description: {
      type: 'string',
      description: '模板描述',
      maxLength: 500,
      optional: true,
    },
    category: {
      type: 'string',
      description: '模板分类',
      enum: ['children-book', 'tech-doc', 'marketing'],
      optional: true,
    },
    parameters: {
      type: 'object',
      description: '模板参数',
      optional: true,
    },
    isActive: {
      type: 'boolean',
      description: '是否激活',
      optional: true,
    },
  };

  // 注册 updateTemplate 工具
  server.tool(
    'updateTemplate',
    {
      title: '更新模板',
      description: '更新现有的提示词模板',
      parameters: UpdateTemplateParams,
    },
    async (args: { [key: string]: any }) => {
      try {
        // 查找模板
        const templateIndex = templates.findIndex(t => t.id === args.id);
        
        if (templateIndex === -1) {
          throw new TemplateError(
            TemplateErrorType.TEMPLATE_NOT_FOUND,
            `模板 ${args.id} 不存在`
          );
        }

        const template = templates[templateIndex];
        
        // 更新模板字段
        if (args.name !== undefined) template.name = args.name;
        if (args.description !== undefined) template.description = args.description;
        if (args.category !== undefined) template.category = args.category as Template['category'];
        if (args.parameters !== undefined) {
          // 确保保留必要的 subject 字段
          if (!args.parameters.subject && template.parameters.subject) {
            args.parameters.subject = template.parameters.subject;
          }
          template.parameters = args.parameters as TemplateParameters;
        }
        if (args.isActive !== undefined) template.isActive = args.isActive;
        
        // 更新版本和时间
        template.version += 1;
        template.updatedAt = new Date();

        // 验证更新后的模板
        try {
          validateTemplate(template);
        } catch (validationError) {
          throw new TemplateError(
            TemplateErrorType.INVALID_PARAMETERS,
            '更新的模板参数无效',
            validationError
          );
        }

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `更新成功: ${template.name}`,
            },
          ],
          structuredContent: {
            template: {
              id: template.id,
              name: template.name,
              description: template.description,
              category: template.category,
              version: template.version,
              createdAt: template.createdAt,
              updatedAt: template.updatedAt,
              parameters: template.parameters,
              isActive: template.isActive,
            },
          },
        };
      } catch (error) {
        if (error instanceof TemplateError) {
          throw error;
        }
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '更新模板失败',
          error
        );
      }
    }
  );

  // 定义删除模板参数
  const DeleteTemplateParams = {
    id: {
      type: 'string',
      description: '要删除的模板ID',
    },
  };

  // 注册 deleteTemplate 工具
  server.tool(
    'deleteTemplate',
    {
      title: '删除模板',
      description: '删除一个提示词模板',
      parameters: DeleteTemplateParams,
    },
    async (args: { [key: string]: any }) => {
      try {
        // 查找模板
        const templateIndex = templates.findIndex(t => t.id === args.id);
        
        if (templateIndex === -1) {
          throw new TemplateError(
            TemplateErrorType.TEMPLATE_NOT_FOUND,
            `模板 ${args.id} 不存在`
          );
        }

        // 从数组中删除
        templates.splice(templateIndex, 1);

        // 返回结果
        return {
          content: [
            {
              type: 'text',
              text: `删除成功`,
            },
          ],
          structuredContent: {
            success: true,
            id: args.id,
          },
        };
      } catch (error) {
        if (error instanceof TemplateError) {
          throw error;
        }
        throw new TemplateError(
          TemplateErrorType.INTERNAL_ERROR,
          '删除模板失败',
          error
        );
      }
    }
  );
}
