import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatePrompt } from './prompts.js';
import { checkSamplingSupport } from '../sampling/checker.js';
import { handleSamplingRequest, SamplingServer } from '../sampling/handler.js';

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
  templateId: z.string().optional().describe('模板 ID，如果提供则使用模板默认参数'),
  
  // 基础参数
  subject: z.string().min(1).describe('主体内容 - 明确"画什么"'),
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

/**
 * 从模板加载参数
 * @param templateId 模板 ID
 * @returns 模板参数
 */
async function loadTemplateParams(templateId: string): Promise<Record<string, unknown>> {
  // TODO: 实现从模板存储加载参数
  throw new ImageGenerationError(
    ImageGenerationErrorType.INVALID_TEMPLATE,
    `模板 ${templateId} 不存在`
  );
}

/**
 * 注册图片生成工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export function registerImageGenerationTool(server: McpServer & SamplingServer) {
  server.tool(
    'generateImage',
    ImageGenerationParams,
    async (params, extra) => {
      try {
        // 1. 处理模板参数
        let finalParams = { ...params };
        if (params.templateId) {
          try {
            const templateParams = await loadTemplateParams(params.templateId);
            // 用用户提供的参数覆盖模板默认参数
            finalParams = {
              ...templateParams,
              ...params,
            };
          } catch (error) {
            if (error instanceof ImageGenerationError) {
              throw error;
            }
            throw new ImageGenerationError(
              ImageGenerationErrorType.INTERNAL_ERROR,
              '加载模板参数失败',
              error
            );
          }
        }

        // 2. 生成提示词
        const promptResult = await generatePrompt(finalParams);

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
              },
            };
          } catch (error) {
            throw new ImageGenerationError(
              ImageGenerationErrorType.SAMPLING_FAILED,
              '图片生成失败',
              error
            );
          }
        } else {
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
            },
          };
        }
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
