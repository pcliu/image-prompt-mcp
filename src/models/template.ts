import { z } from 'zod';

// 模板参数的验证模式
export const TemplateParametersSchema = z.object({
  subject: z.string().describe('主体内容 - 明确"画什么"'),
  action: z.string().optional().describe('动作/姿态 - 如果主体在做事或有特定姿势'),
  environment: z.string().optional().describe('场景与背景 - 交代地点、时代、天气、室内外等'),
  cameraAngle: z.string().optional().describe('视角与构图 - 决定"从哪看"与"怎么排版"'),
  style: z.string().optional().describe('风格与媒介 - 让模型模仿特定艺术语言'),
  details: z.string().optional().describe('细节与材质 - 增加纹理和真实感'),
  lighting: z.string().optional().describe('灯光与色调 - 左右画面氛围'),
  mood: z.string().optional().describe('情绪/主题氛围 - 传达整体情感'),
  technical: z.string().optional().describe('相机或画面参数 - 控制分辨率、镜头、比例'),
  quality: z.string().optional().describe('质量与排行榜关键词 - 暗示"高水准"'),
  negativePrompt: z.string().optional().describe('负面提示 - 明确"不要什么"'),
});

// 模板分类枚举
export const TemplateCategoryEnum = z.enum([
  'children-book',
  'tech-doc', 
  'marketing'
]);

// 模板的验证模式
export const TemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  category: TemplateCategoryEnum,
  parameters: TemplateParametersSchema,
  version: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: z.string().optional(),
  isActive: z.boolean().default(true),
});

// TypeScript 类型定义
export type TemplateParameters = z.infer<typeof TemplateParametersSchema>;
export type TemplateCategory = z.infer<typeof TemplateCategoryEnum>;
export type Template = z.infer<typeof TemplateSchema>;

// 创建模板的输入验证模式
export const CreateTemplateSchema = TemplateSchema.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
});

export type CreateTemplateInput = z.infer<typeof CreateTemplateSchema>;

// 更新模板的输入验证模式
export const UpdateTemplateSchema = CreateTemplateSchema.partial();

export type UpdateTemplateInput = z.infer<typeof UpdateTemplateSchema>;

// 模板验证函数
export function validateTemplate(template: unknown): Template {
  return TemplateSchema.parse(template);
}

export function validateCreateTemplateInput(input: unknown): CreateTemplateInput {
  return CreateTemplateSchema.parse(input);
}

export function validateUpdateTemplateInput(input: unknown): UpdateTemplateInput {
  return UpdateTemplateSchema.parse(input);
}
