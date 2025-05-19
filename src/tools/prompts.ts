import { z } from 'zod';
import { Template } from '../models/template.js';

// 定义提示词生成的参数验证模式
const PromptGenerationParams = z.object({
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
});

type PromptGenerationParamsType = z.infer<typeof PromptGenerationParams>;

interface PromptResult {
  prompt: string;
  negativePrompt?: string;
}

/**
 * 内部函数：生成图片提示词
 * @param params 提示词生成参数
 * @param template 可选的模板对象，如果提供则会使用模板参数作为默认值
 * @returns 生成的提示词结果，包含主提示词和可选的负面提示词
 */
export async function generatePrompt(params: PromptGenerationParamsType, template?: Template): Promise<PromptResult> {
  try {
    // 如果提供了模板，则合并模板参数和用户参数
    let mergedParams = { ...params };
    if (template) {
      // 模板参数作为默认值，用户参数优先
      mergedParams = {
        ...template.parameters,
        ...params,
      };
    }

    // 验证合并后的输入参数
    const validatedParams = PromptGenerationParams.parse(mergedParams);

    // 构建提示词组件
    const components = [
      // 基础参数
      validatedParams.subject,
      validatedParams.action && `action: ${validatedParams.action}`,
      validatedParams.environment && `environment: ${validatedParams.environment}`,
      
      // 视觉参数
      validatedParams.cameraAngle && `camera: ${validatedParams.cameraAngle}`,
      validatedParams.style && `style: ${validatedParams.style}`,
      validatedParams.details && `details: ${validatedParams.details}`,
      validatedParams.lighting && `lighting: ${validatedParams.lighting}`,
      validatedParams.mood && `mood: ${validatedParams.mood}`,
      
      // 技术参数
      validatedParams.technical && `technical: ${validatedParams.technical}`,
      validatedParams.quality && `quality: ${validatedParams.quality}`,
    ].filter(Boolean);

    // 组合主要提示词
    const mainPrompt = components.join(', ');

    // 返回结果
    return {
      prompt: mainPrompt,
      ...(validatedParams.negativePrompt && { negativePrompt: validatedParams.negativePrompt }),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`提示词生成参数验证失败: ${error.message}`);
    }
    throw error;
  }
}
