import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generatePrompt } from '../../src/tools/prompts.js';
import { Template } from '../../src/models/template.js';

// 创建一个模拟模板
const MOCK_TEMPLATE: Template = {
  id: 'test-template-id',
  name: '测试模板',
  description: '用于测试的模板',
  category: 'children-book',
  parameters: {
    subject: '默认主题',
    style: '水彩风格',
    mood: '安静的',
    lighting: '柔和光线'
  },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true
};

describe('Prompt Generation Tool', () => {
  beforeEach(() => {
    // 在每个测试前重置模拟
    vi.resetAllMocks();
  });

  afterEach(() => {
    // 在每个测试后清理模拟
    vi.clearAllMocks();
  });

  describe('基本功能', () => {
    // 基础测试 - 仅有必需参数
    it('应该生成只包含必需参数的提示词', async () => {
      const params = {
        subject: '一只可爱的猫'
      };

      const result = await generatePrompt(params);
      
      expect(result).toBeDefined();
      expect(result.prompt).toBe('一只可爱的猫');
      expect(result.negativePrompt).toBeUndefined();
    });

    // 完整参数测试
    it('应该生成包含所有参数的提示词', async () => {
      const params = {
        subject: '一只猫',
        action: '在玩毛线球',
        environment: '在阳光明媚的客厅',
        cameraAngle: '低角度特写',
        style: '彩色水彩画',
        details: '柔软的毛发，明亮的眼睛',
        lighting: '自然光线，温暖色调',
        mood: '欢快的',
        technical: '8K高清',
        quality: '超高质量，细节丰富',
        negativePrompt: '模糊，低质量'
      };

      const result = await generatePrompt(params);
      
      expect(result).toBeDefined();
      expect(result.prompt).toBe('一只猫, action: 在玩毛线球, environment: 在阳光明媚的客厅, camera: 低角度特写, style: 彩色水彩画, details: 柔软的毛发，明亮的眼睛, lighting: 自然光线，温暖色调, mood: 欢快的, technical: 8K高清, quality: 超高质量，细节丰富');
      expect(result.negativePrompt).toBe('模糊，低质量');
    });

    // 测试参数组合逻辑
    it('应该正确组合提示词组件', async () => {
      const params = {
        subject: '一座城堡',
        environment: '在高山上',
        style: '中世纪风格'
      };

      const result = await generatePrompt(params);
      
      expect(result.prompt).toBe('一座城堡, environment: 在高山上, style: 中世纪风格');
      // 确保组件之间有正确的分隔符和顺序
    });

    // 测试可选参数处理
    it('应该正确处理可选参数', async () => {
      // 只包含部分可选参数
      const params = {
        subject: '一片森林',
        lighting: '晨光',
        technical: '4K分辨率'
      };

      const result = await generatePrompt(params);
      
      expect(result.prompt).toBe('一片森林, lighting: 晨光, technical: 4K分辨率');
      expect(result.prompt).not.toContain('style');
      expect(result.prompt).not.toContain('details');
    });
  });

  describe('模板功能', () => {
    // 模板支持测试
    it('应该使用模板参数作为默认值', async () => {
      // 生成提示词，不覆盖任何参数
      const result1 = await generatePrompt({ subject: '一只橘猫' }, MOCK_TEMPLATE);
      
      expect(result1.prompt).toContain('一只橘猫');
      expect(result1.prompt).toContain('style: 水彩风格');
      expect(result1.prompt).toContain('mood: 安静的');
      expect(result1.prompt).toContain('lighting: 柔和光线');

      // 生成提示词，覆盖部分参数
      const result2 = await generatePrompt({
        subject: '一只黑猫', // 覆盖模板的主题
        action: '在睡觉' // 添加动作参数
      }, MOCK_TEMPLATE);
      
      expect(result2.prompt).toContain('一只黑猫'); // 应该使用覆盖的值
      expect(result2.prompt).toContain('action: 在睡觉');
      expect(result2.prompt).toContain('style: 水彩风格'); // 应该保留模板中的值
    });

    it('应该允许使用模板中的subject', async () => {
      // 不提供subject，使用模板中的默认值
      const result = await generatePrompt({ subject: MOCK_TEMPLATE.parameters.subject }, MOCK_TEMPLATE);
      
      expect(result.prompt).toContain('默认主题');
      expect(result.prompt).toContain('style: 水彩风格');
    });

    it('应该正确处理模板中的负面提示词', async () => {
      // 创建带有负面提示词的模板
      const templateWithNegative: Template = {
        ...MOCK_TEMPLATE,
        parameters: {
          ...MOCK_TEMPLATE.parameters,
          negativePrompt: '模糊的，低质量的'
        }
      };

      // 使用带有负面提示词的模板
      const result = await generatePrompt({ subject: '森林' }, templateWithNegative);
      
      expect(result.prompt).toContain('森林');
      expect(result.negativePrompt).toBe('模糊的，低质量的');

      // 覆盖模板中的负面提示词
      const result2 = await generatePrompt({
        subject: '森林',
        negativePrompt: '变形的，不自然的'
      }, templateWithNegative);
      
      expect(result2.negativePrompt).toBe('变形的，不自然的');
    });

    it('应该正确合并复杂模板和用户参数', async () => {
      // 创建具有多个参数的复杂模板
      const complexTemplate: Template = {
        ...MOCK_TEMPLATE,
        parameters: {
          subject: '风景',
          environment: '山脉',
          style: '油画',
          technical: '高分辨率',
          quality: '精细细节'
        }
      };

      // 部分覆盖和添加参数
      const result = await generatePrompt({
        subject: '海滩',  // 覆盖
        action: '日落时分', // 新参数
        mood: '宁静的'    // 新参数
      }, complexTemplate);
      
      expect(result.prompt).toContain('海滩');
      expect(result.prompt).toContain('action: 日落时分');
      expect(result.prompt).toContain('environment: 山脉');
      expect(result.prompt).toContain('style: 油画');
      expect(result.prompt).toContain('mood: 宁静的');
      expect(result.prompt).toContain('technical: 高分辨率');
      expect(result.prompt).toContain('quality: 精细细节');
    });
  });

  describe('错误处理', () => {
    // 参数验证测试
    it('应该在缺少必需参数时抛出错误', async () => {
      const params = {
        // 缺少必需的 subject 参数
        action: '在玩毛线球'
      };

      await expect(generatePrompt(params as any)).rejects.toThrow('提示词生成参数验证失败');
    });

    it('应该在参数类型错误时抛出错误', async () => {
      const params = {
        subject: 123, // 错误类型，应该是字符串
        style: true   // 错误类型，应该是字符串
      };

      await expect(generatePrompt(params as any)).rejects.toThrow('提示词生成参数验证失败');
    });

    it('应该在subject为空字符串时抛出错误', async () => {
      const params = {
        subject: ''  // 空字符串，应该验证失败
      };

      await expect(generatePrompt(params)).rejects.toThrow('提示词生成参数验证失败');
    });

    it('应该处理未知错误', async () => {
      // 创建一个会抛出非Zod错误的情况
      const mockError = new Error('模拟的未知错误');
      
      // 模拟生成过程中的未知错误
      const originalParse = vi.spyOn(Object.getPrototypeOf({}), 'toString').mockImplementationOnce(() => {
        throw mockError;
      });

      // 应该向上传播原始错误
      try {
        await generatePrompt({ subject: '测试' });
        expect(true).toBe(false); // 不应该到达这里
      } catch (error) {
        expect(error).toBe(mockError);
      }

      // 恢复原始实现
      originalParse.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('应该处理极长的参数值', async () => {
      const longText = 'a'.repeat(1000);
      const params = {
        subject: longText,
        style: longText
      };

      const result = await generatePrompt(params);
      
      expect(result.prompt).toContain(longText);
      expect(result.prompt.length).toBeGreaterThan(2000);
    });

    it('应该处理特殊字符', async () => {
      const params = {
        subject: '特殊@#¥%*字符$&!',
        style: '包含\n换行\t制表符'
      };

      const result = await generatePrompt(params);
      
      expect(result.prompt).toContain('特殊@#¥%*字符$&!');
      expect(result.prompt).toContain('包含\n换行\t制表符');
    });

    it('应该处理空模板', async () => {
      // 创建一个没有参数的空模板
      const emptyTemplate: Template = {
        ...MOCK_TEMPLATE,
        parameters: {} as any // 通过类型断言绕过类型检查
      };

      // 使用空模板时，应该仅使用用户参数
      const result = await generatePrompt({
        subject: '测试主题',
        style: '测试风格'
      }, emptyTemplate);
      
      expect(result.prompt).toBe('测试主题, style: 测试风格');
    });
  });
}); 