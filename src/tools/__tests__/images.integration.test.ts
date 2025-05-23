/**
 * 图片生成工具集成测试
 * 这个测试文件直接测试图片生成工具的实际功能
 */

import { registerImageGenerationTool } from '../images.js';

// 简化的断言函数
function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toContain: (expected: any) => {
      if (typeof actual === 'string' && !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeInstanceOf: (expectedClass: any) => {
      if (!(actual instanceof expectedClass)) {
        throw new Error(`Expected ${actual} to be instance of ${expectedClass.name}`);
      }
    },
    toHaveProperty: (property: string) => {
      if (!(property in actual)) {
        throw new Error(`Expected object to have property "${property}"`);
      }
    },
  };
}

// Mock server that captures tool registration
class MockMcpServer {
  public registeredTools: any[] = [];

  registerTool(name: string, config: any, handler: any) {
    this.registeredTools.push({
      name,
      config,
      handler
    });
  }

  // Mock sampling capabilities
  sampling = {
    createMessage: async () => ({
      content: {
        type: 'image',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        mimeType: 'image/png'
      }
    })
  };
}

/**
 * 图片生成工具集成测试套件
 */
export class ImageGenerationIntegrationTests {
  private server: MockMcpServer = new MockMcpServer();
  private toolHandler: any;

  constructor() {
    console.log('开始图片生成工具集成测试...');
  }

  setup() {
    this.server = new MockMcpServer();
    
    // 注册实际的工具
    registerImageGenerationTool(this.server as any);
    
    // 获取处理函数
    if (this.server.registeredTools.length === 0) {
      throw new Error('没有工具被注册');
    }
    
    this.toolHandler = this.server.registeredTools[0].handler;
  }

  /**
   * 测试基本参数验证
   */
  async testBasicValidation() {
    console.log('测试基本参数验证...');

    // 测试缺少subject参数
    try {
      await this.toolHandler({}, {});
      throw new Error('应该抛出错误');
    } catch (error: any) {
      expect(error.message).toContain('必须提供主体内容');
      console.log('✓ 正确验证了缺少subject参数');
    }

    // 测试有效参数
    const result = await this.toolHandler(
      { subject: '一只可爱的小猫' },
      {}
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('structuredContent');
    expect(result.structuredContent).toHaveProperty('prompt');
    expect(result.structuredContent.prompt).toContain('一只可爱的小猫');
    console.log('✓ 成功处理有效参数');
  }

  /**
   * 测试提示词生成
   */
  async testPromptGeneration() {
    console.log('测试提示词生成...');

    const params = {
      subject: '一只橘猫',
      action: '在阳光下睡觉',
      environment: '温暖的窗台',
      style: '水彩画风格',
      mood: '安静祥和'
    };

    const result = await this.toolHandler(params, {});
    
    expect(result.structuredContent.prompt).toBeDefined();
    expect(result.structuredContent.prompt).toContain('一只橘猫');
    expect(result.structuredContent.prompt).toContain('在阳光下睡觉');
    expect(result.structuredContent.prompt).toContain('温暖的窗台');
    
    console.log('生成的提示词:', result.structuredContent.prompt);
    console.log('✓ 成功生成复合提示词');
  }

  /**
   * 测试负面提示词
   */
  async testNegativePrompt() {
    console.log('测试负面提示词...');

    const params = {
      subject: '一朵玫瑰花',
      negativePrompt: '枯萎, 凋谢, 模糊'
    };

    const result = await this.toolHandler(params, {});
    
    expect(result.structuredContent.negativePrompt).toBe('枯萎, 凋谢, 模糊');
    console.log('✓ 正确处理负面提示词');
  }

  /**
   * 测试不支持Sampling的情况
   */
  async testWithoutSampling() {
    console.log('测试不支持Sampling的情况...');

    const params = {
      subject: '一座山',
      width: 768,
      height: 768,
      samplingSteps: 30
    };

    // 模拟不支持sampling的客户端
    const result = await this.toolHandler(params, {});
    
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('提示词生成成功');
    expect(result.content[0].text).toContain('客户端不支持直接生成图片');
    
    expect(result.structuredContent.supportsSampling).toBe(false);
    expect(result.structuredContent.parameters.width).toBe(768);
    expect(result.structuredContent.parameters.height).toBe(768);
    expect(result.structuredContent.parameters.samplingSteps).toBe(30);
    
    console.log('✓ 正确处理不支持Sampling的情况');
  }

  /**
   * 测试工具注册
   */
  testToolRegistration() {
    console.log('测试工具注册...');

    const tool = this.server.registeredTools[0];
    
    expect(tool.name).toBe('generateImage');
    expect(tool.config.description).toContain('基于模板或参数生成图片提示词');
    expect(tool.config.inputSchema).toBeDefined();
    expect(tool.config.outputSchema).toBeDefined();
    
    // 检查输入参数schema
    const inputSchema = tool.config.inputSchema;
    expect(inputSchema).toHaveProperty('subject');
    expect(inputSchema).toHaveProperty('width');
    expect(inputSchema).toHaveProperty('height');
    expect(inputSchema).toHaveProperty('samplingSteps');
    
    console.log('✓ 工具注册正确');
  }

  /**
   * 测试错误处理
   */
  async testErrorHandling() {
    console.log('测试错误处理...');

    // 测试无效模板ID
    try {
      await this.toolHandler({
        templateId: 'non-existent-template-id'
      }, {});
      throw new Error('应该抛出错误');
    } catch (error: any) {
      // 检查错误消息包含模板相关的错误信息
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes('模板') && (errorMessage.includes('不存在') || errorMessage.includes('未找到') || errorMessage.includes('加载模板参数失败'))) {
        console.log('✓ 正确处理无效模板ID错误');
      } else {
        throw new Error(`意外的错误消息: ${error.message}`);
      }
    }
  }

  /**
   * 运行所有集成测试
   */
  async runAllTests() {
    try {
      this.setup();
      this.testToolRegistration();
      
      await this.testBasicValidation();
      
      this.setup();
      await this.testPromptGeneration();
      
      this.setup();
      await this.testNegativePrompt();
      
      this.setup();
      await this.testWithoutSampling();
      
      this.setup();
      await this.testErrorHandling();
      
      console.log('\n🎉 所有集成测试通过！');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n❌ 集成测试失败:', errorMessage);
      console.error('详细错误:', error);
      return false;
    }
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new ImageGenerationIntegrationTests();
  tests.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
} 