import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Template, TemplateSchema, TemplateParameters, validateTemplate, TemplateCategory } from '../models/template.js';
import { checkSamplingSupport, checkDetailedSamplingCapabilities } from '../sampling/checker.js';
import { handleSamplingRequest, SamplingCreateMessageResponse, Message, MessageContent, SamplingServer } from '../sampling/handler.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as os from 'os';
import log, { LogCategory } from '../utils/logger.js';

// ESM 兼容的 __dirname 替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  ...SortParams,
  ...FilterParams,
};

type ListTemplatesParamsType = {
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

// 定义获取模板目录的函数
function getTemplatesDir(): string {
  // 1. 优先使用环境变量
  if (process.env.TEMPLATES_DIR) {
    return process.env.TEMPLATES_DIR;
  }

  // 2. 使用基于项目根目录的路径
  // 从 src/tools 向上两级到项目根目录，再到 templates
  const projectRootDir = path.resolve(__dirname, '..', '..');
  const templatesDir = path.join(projectRootDir, 'templates');

  return templatesDir;
}

// 定义模板目录
let TEMPLATES_DIR = getTemplatesDir();

// 确保模板目录存在
async function ensureTemplatesDir() {
  try {
    // 详细记录路径信息，以便调试
    log.info('模板目录路径信息', {
      category: LogCategory.TEMPLATE,
      operation: 'init',
      moduleUrl: import.meta.url,
      moduleDirname: __dirname,
      templatesDir: TEMPLATES_DIR,
      projectRoot: path.resolve(__dirname, '..', '..'),
      workingDir: process.cwd()
    });
    
    // 创建主目录
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
    
    // 确保每个分类目录都存在
    const categories = ['children-book', 'tech-doc', 'marketing'];
    await Promise.all(categories.map(category => 
      fs.mkdir(path.join(TEMPLATES_DIR, category), { recursive: true })
    ));
    
    log.info('模板目录初始化完成', {
      category: LogCategory.TEMPLATE,
      operation: 'init',
      templatesDir: TEMPLATES_DIR,
      categories
    });
    
    return true;
  } catch (error) {
    log.error('模板目录初始化失败', {
      category: LogCategory.TEMPLATE,
      operation: 'init',
      templatesDir: TEMPLATES_DIR,
      errorCode: (error as any).code,
      errorPath: (error as any).path
    }, error as Error);
    
    // 尝试备用路径
    try {
      // 备用方案1: 使用临时目录
      const tempDir = path.join(os.tmpdir(), 'image-prompt-mcp', 'templates');
      log.warn('尝试使用临时目录作为模板目录', {
        category: LogCategory.TEMPLATE,
        operation: 'init',
        backupTempDir: tempDir
      });
      
      await fs.mkdir(tempDir, { recursive: true });
      
      // 确保分类目录存在
      const categories = ['children-book', 'tech-doc', 'marketing'];
      await Promise.all(categories.map(category => 
        fs.mkdir(path.join(tempDir, category), { recursive: true })
      ));
      
      // 更新模板目录
      TEMPLATES_DIR = tempDir;
      
      log.info('临时模板目录创建成功', {
        category: LogCategory.TEMPLATE,
        operation: 'init',
        templatesDir: TEMPLATES_DIR
      });
      
      return true;
    } catch (backupError) {
      log.error('所有备用路径都创建失败', {
        category: LogCategory.TEMPLATE,
        operation: 'init'
      }, backupError as Error);
      throw error; // 抛出原始错误
    }
  }
}

// 从文件系统加载模板
async function loadTemplatesFromFS(): Promise<Template[]> {
  const loadedTemplates: Template[] = [];
  
  try {
    // 确保模板目录存在
    const dirInitialized = await ensureTemplatesDir();
    if (!dirInitialized) {
      log.error('模板目录初始化失败，无法加载模板', {
        category: LogCategory.TEMPLATE,
        operation: 'load'
      });
      return loadedTemplates; // 返回空数组
    }
    
    log.info('开始加载模板', {
      category: LogCategory.TEMPLATE,
      operation: 'load',
      templatesDir: TEMPLATES_DIR
    });

    // 读取所有类别目录
    const categories = await fs.readdir(TEMPLATES_DIR);
    log.debug('发现模板分类目录', {
      category: LogCategory.TEMPLATE,
      operation: 'load',
      categoriesCount: categories.length,
      categories
    });
    
    for (const category of categories) {
      const categoryPath = path.join(TEMPLATES_DIR, category);
      const stat = await fs.stat(categoryPath);
      
      if (stat.isDirectory()) {
        log.debug(`处理分类目录: ${category}`, {
          category: LogCategory.TEMPLATE,
          operation: 'load',
          processingCategory: category,
          categoryPath
        });
        
        const files = await fs.readdir(categoryPath);
        log.debug(`分类目录文件列表`, {
          category: LogCategory.TEMPLATE,
          operation: 'load',
          processingCategory: category,
          filesCount: files.length,
          files
        });
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const filePath = path.join(categoryPath, file);
              log.debug(`加载模板文件`, {
                category: LogCategory.TEMPLATE,
                operation: 'load',
                filePath
              });
              
              const content = await fs.readFile(filePath, 'utf-8');
              const templateData = JSON.parse(content);
              
              // 添加基本信息
              templateData.id = templateData.id || crypto.randomUUID();
              templateData.category = category as TemplateCategory;
              templateData.version = templateData.version || 1;
              templateData.createdAt = new Date(templateData.createdAt || Date.now());
              templateData.updatedAt = new Date(templateData.updatedAt || Date.now());
              templateData.isActive = templateData.isActive ?? true;
              
              log.debug('验证模板', {
                category: LogCategory.TEMPLATE,
                operation: 'validate',
                templateId: templateData.id,
                templateName: templateData.name,
                templateCategory: templateData.category
              });
              
              // 验证模板
              validateTemplate(templateData);
              
              loadedTemplates.push(templateData as Template);
              log.info('模板加载成功', {
                category: LogCategory.TEMPLATE,
                operation: 'load',
                templateId: templateData.id,
                templateName: templateData.name,
                templateCategory: templateData.category
              });
            } catch (error) {
              log.error(`加载模板文件失败`, {
                category: LogCategory.TEMPLATE,
                operation: 'load',
                file,
                categoryPath
              }, error as Error);
            }
          }
        }
      }
    }
  } catch (error) {
    log.error('加载模板目录失败', {
      category: LogCategory.TEMPLATE,
      operation: 'load',
      templatesDir: TEMPLATES_DIR
    }, error as Error);
    throw error;
  }
  
  log.info('模板加载完成', {
    category: LogCategory.TEMPLATE,
    operation: 'load',
    totalTemplates: loadedTemplates.length,
    templates: loadedTemplates.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category
    }))
  });
  
  return loadedTemplates;
}

// 初始化模板存储
let templates: Template[] = [];

// 加载模板函数
export async function initializeTemplates() {
  log.info('开始初始化模板系统', {
    category: LogCategory.TEMPLATE,
    operation: 'initialize',
    workingDirectory: process.cwd(),
    templatesDir: TEMPLATES_DIR
  });
  
  try {
    templates = await loadTemplatesFromFS();
    log.info('模板系统初始化完成', {
      category: LogCategory.TEMPLATE,
      operation: 'initialize',
      totalTemplates: templates.length
    });
  } catch (error) {
    log.error('模板系统初始化失败', {
      category: LogCategory.TEMPLATE,
      operation: 'initialize'
    }, error as Error);
    throw error;
  }
}

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
 * 根据ID获取模板
 * @param id 模板ID
 * @param version 可选的版本号
 * @returns 找到的模板，如果没找到则抛出异常
 */
export function getTemplateById(id: string, version?: number): Template {
  const template = templates.find(t => t.id === id);
  
  if (!template) {
    throw new TemplateError(
      TemplateErrorType.TEMPLATE_NOT_FOUND,
      `模板 ${id} 不存在`
    );
  }

  // 如果指定了版本，检查版本是否匹配
  if (version && template.version !== version) {
    throw new TemplateError(
      TemplateErrorType.TEMPLATE_NOT_FOUND,
      `模板 ${id} 的版本 ${version} 不存在`
    );
  }

  return template;
}

/**
 * 注册模板管理工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export async function registerTemplateTools(server: McpServer) {
  log.info('开始注册模板工具', {
    category: LogCategory.TEMPLATE,
    operation: 'register_tools'
  });
  
  try {
    // 初始化模板
    await initializeTemplates();
    
    log.debug('注册 listTemplates 工具', {
      category: LogCategory.TEMPLATE,
      operation: 'register_tool',
      tool: 'listTemplates'
    });
    
    // 注册 listTemplates 工具
    server.tool(
      'listTemplates',
      {
        title: '列出模板',
        description: '列出所有可用的提示词模板',
        parameters: {
          sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('createdAt').describe('排序字段'),
          sortOrder: z.enum(['asc', 'desc']).optional().default('desc').describe('排序顺序'),
          category: z.string().optional().describe('模板分类'),
          search: z.string().optional().describe('搜索关键词'),
          isActive: z.boolean().optional().default(true).describe('是否激活'),
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false,
          idempotentHint: true,
        },
        outputSchema: {
          content: z.array(
            z.object({ type: z.literal('text'), text: z.string() })
          ),
        },
      },
      async (args: { [key: string]: any }, extra) => {
        try {
          const params: ListTemplatesParamsType = args as ListTemplatesParamsType;
          
          log.info('执行列出模板操作', {
            category: LogCategory.TEMPLATE,
            operation: 'list',
            params
          });

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

          // 构建文本输出（无分页）
          let output = `找到 ${filteredTemplates.length} 个模板\n\n`;

          if (filteredTemplates.length === 0) {
            output += '没有找到匹配的模板。';
          } else {
            filteredTemplates.forEach((template, index) => {
              output += `${index + 1}. ${template.name}\n`;
              output += `   ID: ${template.id}\n`;
              output += `   分类: ${template.category}\n`;
              output += `   描述: ${template.description}\n`;
              output += `   版本: ${template.version}\n`;
              output += `   创建时间: ${template.createdAt.toLocaleString()}\n`;
              output += `   更新时间: ${template.updatedAt.toLocaleString()}\n\n`;
            });
          }

          log.info('模板列表获取成功', {
            category: LogCategory.TEMPLATE,
            operation: 'list',
            totalResults: filteredTemplates.length,
            filters: {
              category: params.category,
              search: params.search,
              isActive: params.isActive
            }
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: output
              }
            ]
          };
        } catch (error) {
          log.error('获取模板列表失败', {
            category: LogCategory.TEMPLATE,
            operation: 'list',
            params: args
          }, error as Error);

          // 根据 MCP 规范处理错误
          if (error instanceof z.ZodError) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `参数验证失败: ${error.message}`
                }
              ]
            };
          }
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `获取模板列表失败: ${error instanceof Error ? error.message : '未知错误'}`
              }
            ]
          };
        }
      }
    );
    
    console.log('正在注册 getTemplate 工具...');
    // 注册 getTemplate 工具
    server.tool(
      'getTemplate',
      {
        templateId: z.string().describe('模板ID'),
        version: z.number().int().positive().optional().describe('模板版本号')
      },
      async (args: { templateId: string, version?: number }, extra) => {
        try {
          // 记录接收到的参数
          log.debug('getTemplate 接收到参数', {
            category: LogCategory.TEMPLATE,
            operation: 'get',
            args
          });

          // 查找模板
          const template = getTemplateById(args.templateId, args.version);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(template, null, 2)
              }
            ]
          };
        } catch (error) {
          if (error instanceof TemplateError) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: error.message
                }
              ],
              isError: true
            };
          }
          throw error;
        }
      }
    );
    
    console.log('正在注册 createTemplate 工具...');
    // 注册 createTemplate 工具
    server.tool(
      'createTemplate',
      {
        title: '创建模板',
        description: '创建一个新的提示词模板',
        parameters: CreateTemplateParams,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
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

          // 验证新模板
          validateTemplate(newTemplate);

          // 保存到文件系统
          await saveTemplateToFS(newTemplate);

          // 添加到内存存储
          templates.push(newTemplate);

          return {
            content: [
              {
                type: 'text' as const,
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
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `创建模板失败: ${error instanceof Error ? error.message : '未知错误'}`,
              },
            ],
          };
        }
      }
    );
    
    console.log('正在注册 createTemplateFromImage 工具...');
    // 注册 createTemplateFromImage 工具
    server.tool(
      'createTemplateFromImage',
      CreateTemplateFromImageParams,
      async (args: { [key: string]: any }, extra) => {
        try {
          // 检查客户端 sampling 支持
          const capabilities = checkDetailedSamplingCapabilities(extra);

          // 如果支持 sampling 功能
          if (capabilities.supportsCreateMessage && capabilities.supportsImages) {
            // 使用支持 sampling 的方式生成模板
            const { template, analysis } = await createTemplateFromImageWithSampling(
              server as unknown as SamplingServer,
              args as { imageUrl: string, name?: string, description?: string, category?: TemplateCategory }
            );

            // 返回结果
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `成功从图片创建模板: ${template.name}`,
                },
                {
                  type: 'text' as const,
                  text: '图片分析结果：\n' + analysis,
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
                  parameters: template.parameters,
                  analysis: analysis,
                },
              },
            };
          } else {
            // 使用不支持 sampling 的降级处理
            return createTemplateFromImageWithoutSampling();
          }
        } catch (error) {
          // 捕获和处理错误
          if (error instanceof TemplateError) {
            throw error;
          }
          
          throw new TemplateError(
            TemplateErrorType.INTERNAL_ERROR,
            '从图片创建模板失败',
            error
          );
        }
      }
    );
    
    console.log('正在注册 updateTemplate 工具...');
    // 注册 updateTemplate 工具
    server.tool(
      'updateTemplate',
      {
        title: '更新模板',
        description: '更新现有的提示词模板',
        parameters: {
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
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { [key: string]: any }) => {
        try {
          // 查找模板
          const templateIndex = templates.findIndex(t => t.id === args.id);
          
          if (templateIndex === -1) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `模板 ${args.id} 不存在`,
                },
              ],
            };
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
          validateTemplate(template);

          // 保存到文件系统
          await saveTemplateToFS(template);

          return {
            content: [
              {
                type: 'text' as const,
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
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `更新模板失败: ${error instanceof Error ? error.message : '未知错误'}`,
              },
            ],
          };
        }
      }
    );
    
    console.log('正在注册 deleteTemplate 工具...');
    // 注册 deleteTemplate 工具
    server.tool(
      'deleteTemplate',
      {
        title: '删除模板',
        description: '删除一个提示词模板',
        parameters: {
          id: {
            type: 'string',
            description: '要删除的模板ID',
          },
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { [key: string]: any }) => {
        try {
          // 查找模板
          const templateIndex = templates.findIndex(t => t.id === args.id);
          
          if (templateIndex === -1) {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `模板 ${args.id} 不存在`,
                },
              ],
            };
          }

          const template = templates[templateIndex];

          // 从文件系统删除
          await deleteTemplateFromFS(template);

          // 从数组中删除
          templates.splice(templateIndex, 1);

          return {
            content: [
              {
                type: 'text' as const,
                text: `删除成功: ${template.name}`,
              },
            ],
            structuredContent: {
              success: true,
              id: args.id,
            },
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `删除模板失败: ${error instanceof Error ? error.message : '未知错误'}`,
              },
            ],
          };
        }
      }
    );
    
    log.info('模板工具注册完成', {
      category: LogCategory.TEMPLATE,
      operation: 'register_tools',
      registeredTools: ['listTemplates', 'getTemplate', 'createTemplate', 'createTemplateFromImage', 'updateTemplate', 'deleteTemplate']
    });
  } catch (error) {
    log.error('模板工具注册失败', {
      category: LogCategory.TEMPLATE,
      operation: 'register_tools'
    }, error as Error);
    console.error('模板工具注册失败:', error);
    if (error instanceof Error) {
      console.error('错误详情:', error.message);
      if (error.stack) {
        console.error('错误堆栈:', error.stack);
      }
    }
    throw error;
  }
}

/**
 * 使用Sampling功能从图片生成模板
 * 适用于支持sampling/createMessage的客户端
 * 
 * @param server 支持Sampling的服务器实例
 * @param args 客户端参数
 * @returns 生成的模板和分析结果
 */
export async function createTemplateFromImageWithSampling(
  server: SamplingServer,
  args: { imageUrl: string, name?: string, description?: string, category?: TemplateCategory }
): Promise<{ template: Template, analysis: string }> {
  // 发起图片分析请求
  const analysisResult = await handleSamplingRequest(server, {
    messages: [
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
  validateTemplate(newTemplate);

  // 添加到存储
  templates.push(newTemplate);

  return {
    template: newTemplate,
    analysis: analysisResult.content.text
  };
}

/**
 * 不使用Sampling功能的模板创建指南
 * 适用于不支持sampling/createMessage的客户端
 * 
 * @returns 模板参数指南和结构化错误信息
 */
export function createTemplateFromImageWithoutSampling() {
  // 返回模板参数指南和示例
  return {
    content: [
      {
        type: 'text' as const,
        text: '客户端不支持图片分析功能，请参考以下指南手动创建模板：',
      },
      {
        type: 'text' as const,
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
      message: '客户端不支持图片分析功能，请参考指南手动创建模板',
      template: {
        example: {
          name: '示例模板',
          description: '手动创建的模板示例',
          category: 'tech-doc',
          parameters: {
            subject: '您的主体内容',
            style: '您期望的风格',
            environment: '场景描述',
          }
        }
      }
    }
  };
}

/**
 * 将模板保存到文件系统
 * @param template 要保存的模板
 */
async function saveTemplateToFS(template: Template): Promise<void> {
  const categoryPath = path.join(TEMPLATES_DIR, template.category);
  const filePath = path.join(categoryPath, `${template.id}.json`);
  
  try {
    // 确保目录存在
    await fs.mkdir(categoryPath, { recursive: true });
    
    // 保存文件
    await fs.writeFile(
      filePath,
      JSON.stringify(template, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error(`保存模板文件失败 ${template.id}:`, error);
    throw new TemplateError(
      TemplateErrorType.INTERNAL_ERROR,
      '保存模板文件失败',
      error
    );
  }
}

/**
 * 从文件系统删除模板
 * @param template 要删除的模板
 */
async function deleteTemplateFromFS(template: Template): Promise<void> {
  const filePath = path.join(TEMPLATES_DIR, template.category, `${template.id}.json`);
  
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`删除模板文件失败 ${template.id}:`, error);
    throw new TemplateError(
      TemplateErrorType.INTERNAL_ERROR,
      '删除模板文件失败',
      error
    );
  }
}