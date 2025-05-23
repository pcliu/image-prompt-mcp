import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatePrompt } from './prompts.js';
import { checkSamplingSupport } from '../sampling/checker.js';
import { handleSamplingRequest, SamplingServer } from '../sampling/handler.js';
import { getTemplateById, TemplateError, TemplateErrorType } from './templates.js';

// 定义错误类型
export enum ImageGenerationErrorType {
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  SAMPLING_NOT_SUPPORTED = 'SAMPLING_NOT_SUPPORTED',
  SAMPLING_FAILED = 'SAMPLING_FAILED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class ImageGenerationError extends Error {
  constructor(
    public type: ImageGenerationErrorType,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

// 定义图片生成参数验证模式
const ImageGenerationParams = {
  // 模板相关参数
  templateId: z.string().optional().describe('模板 ID（从 listTemplates 获取），如果提供则使用模板默认参数'),
  templateVersion: z.number().int().positive().optional().describe('模板版本'),
  
  // 基础参数
  subject: z.string().optional().describe('主体内容 - 明确"画什么"'),
  action: z.string().optional().describe('动作/姿态 - 如果主体在做事或有特定姿势'),
  environment: z.string().optional().describe('场景与背景 - 交代地点、时代、天气、室内外等'),
  
  // 视觉参数
  cameraAngle: z.string().optional().describe('视角与构图 - 决定"从哪看"与"怎么排版"'),
  style: z.string().optional().describe('风格与媒介 - 让模型模仿特定艺术语言'),
  details: z.string().optional().describe('细节与材质 - 增加纹理和真实感'),
  lighting: z.string().optional().describe('灯光与色调 - 左右画面氛围'),
  mood: z.string().optional().describe('情绪/主题氛围 - 传达整体情感'),
  
  // 技术参数
  technical: z.string().optional().describe('相机或画面参数 - 控制分辨率、镜头、比例'),
  quality: z.string().optional().describe('质量与排行榜关键词 - 暗示"高水准"'),
  negativePrompt: z.string().optional().describe('负面提示 - 明确"不要什么"'),

  // 图片生成特定参数
  width: z.number().min(64).max(1024).optional().default(512).describe('图片宽度'),
  height: z.number().min(64).max(1024).optional().default(512).describe('图片高度'),
  samplingSteps: z.number().min(1).max(100).optional().default(20).describe('采样步数'),
};

const ImageGenerationOutputParams = {
  // 通用字段
  prompt: z.string().describe('生成的提示词'),
  negativePrompt: z.string().optional().describe('负面提示词'),
  parameters: z.object({
    width: z.number().describe('图片宽度'),
    height: z.number().describe('图片高度'),
    samplingSteps: z.number().describe('采样步数')
  }).describe('生成参数'),
  usedTemplate: z.object({
    id: z.string().describe('模板ID'),
    name: z.string().describe('模板名称'),
    version: z.number().describe('模板版本')
  }).optional().describe('使用的模板信息'),
  
  // Sampling 相关字段
  imageUrl: z.string().optional().describe('生成的图片URL（仅在支持Sampling时）'),
  supportsSampling: z.boolean().optional().describe('是否支持Sampling功能')
};

/**
 * 注册图片生成工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export function registerImageGenerationTool(server: McpServer & SamplingServer) {
  server.registerTool(
    'generateImage',
    {
      description: '基于模板或参数生成图片提示词，并在客户端支持时直接生成图片。建议使用流程：1) 先调用 listTemplates 查看可用模板 → 2) 调用 getTemplate 获取模板详情 → 3) 使用本工具生成图片。',
      inputSchema: ImageGenerationParams,
      outputSchema: ImageGenerationOutputParams,
    },
    async (params, extra) => {
      try {
        // 1. 处理模板参数
        let finalParams = { ...params };
        let template = undefined;

        if (params.templateId) {
          try {
            // 从模板存储加载模板
            template = getTemplateById(params.templateId, params.templateVersion);
            
            // 确保至少有一个subject (从模板或用户参数)
            if (!params.subject && !template.parameters.subject) {
              throw new ImageGenerationError(
                ImageGenerationErrorType.INVALID_PARAMETERS,
                '必须提供主体内容 (subject) 参数'
              );
            }
          } catch (error) {
            if (error instanceof TemplateError) {
              if (error.type === TemplateErrorType.TEMPLATE_NOT_FOUND) {
                throw new ImageGenerationError(
                  ImageGenerationErrorType.INVALID_TEMPLATE,
                  error.message
                );
              }
            }
            throw new ImageGenerationError(
              ImageGenerationErrorType.INTERNAL_ERROR,
              '加载模板参数失败',
              error
            );
          }
        } else if (!params.subject) {
          // 如果没有提供模板ID，则必须提供subject
          throw new ImageGenerationError(
            ImageGenerationErrorType.INVALID_PARAMETERS,
            '必须提供主体内容 (subject) 参数或者有效的模板ID'
          );
        }

        // 2. 生成提示词
        // 确保提供有效的 subject 给 generatePrompt 函数
        if (!finalParams.subject && template?.parameters.subject) {
          finalParams = {
            ...finalParams,
            subject: template.parameters.subject
          };
        }
        const promptResult = await generatePrompt(finalParams as { subject: string, [key: string]: any }, template);

        // 3. 检查客户端 sampling 支持
        const supportsSampling = checkSamplingSupport(extra);

        if (supportsSampling) {
          try {
            // 调用 sampling/createImage
            const result = await handleSamplingRequest(server, {
              messages: [{
                role: 'user',
                content: {
                  type: 'text',
                  text: promptResult.prompt
                }
              }],
              metadata: {
                negativePrompt: promptResult.negativePrompt,
                width: finalParams.width as number,
                height: finalParams.height as number,
                samplingSteps: finalParams.samplingSteps as number,
              }
            });

            if (result.content.type !== 'image' || !result.content.data) {
              throw new Error('服务器返回了非图片类型的响应');
            }

            return {
              content: [
                {
                  type: 'image',
                  data: result.content.data,
                  mimeType: result.content.mimeType || 'image/png',
                },
                {
                  type: 'text',
                  text: '图片生成成功',
                },
              ],
              structuredContent: {
                imageUrl: result.content.data,
                prompt: promptResult.prompt,
                negativePrompt: promptResult.negativePrompt,
                parameters: {
                  width: finalParams.width,
                  height: finalParams.height,
                  samplingSteps: finalParams.samplingSteps,
                },
                usedTemplate: template ? {
                  id: template.id,
                  name: template.name,
                  version: template.version,
                } : undefined
              },
            };
          } catch (error) {
            throw new ImageGenerationError(
              ImageGenerationErrorType.SAMPLING_FAILED,
              '图片生成失败',
              error
            );
          }
        }
          // 返回生成的提示词
          const promptText = `提示词生成成功（客户端不支持直接生成图片）:\n\nPrompt: ${
            promptResult.prompt
          }${
            promptResult.negativePrompt
              ? `\nNegative prompt: ${promptResult.negativePrompt}`
              : ''
          }\n\n技术参数:\n${JSON.stringify(
            {
              width: finalParams.width,
              height: finalParams.height,
              samplingSteps: finalParams.samplingSteps,
              usedTemplate: template ? `${template.name} (ID: ${template.id}, 版本: ${template.version})` : '无'
            },
            null,
            2
          )}`;

          return {
            content: [
              {
                type: 'text',
                text: promptText,
              },
            ],
            structuredContent: {
              prompt: promptResult.prompt,
              negativePrompt: promptResult.negativePrompt,
              parameters: {
                width: finalParams.width,
                height: finalParams.height,
                samplingSteps: finalParams.samplingSteps,
              },
              supportsSampling: false,
              usedTemplate: template ? {
                id: template.id,
                name: template.name,
                version: template.version,
              } : undefined
            },
          };
      } catch (error) {
        if (error instanceof ImageGenerationError) {
          throw error;
        }
        throw new ImageGenerationError(
          ImageGenerationErrorType.INTERNAL_ERROR,
          `图片生成失败: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
