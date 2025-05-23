import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  registerImageGenerationTool,
  ImageGenerationError,
  ImageGenerationErrorType 
} from '../images.js';

// 简化的Mock类型定义
type MockFunction<T> = T & {
  mockResolvedValue: (value: any) => void;
  mockRejectedValue: (error: any) => void;
  mockReturnValue: (value: any) => void;
  mockImplementation: (fn: (...args: any[]) => any) => void;
  mockClear: () => void;
  calls: any[][];
};

// 创建Mock函数
function createMockFunction<T extends (...args: any[]) => any>(): MockFunction<T> {
  let implementation: T | undefined;
  let returnValue: any;
  let resolvedValue: any;
  let rejectedValue: any;
  const calls: any[][] = [];

  const mockFn = ((...args: any[]) => {
    calls.push(args);
    
    if (rejectedValue) {
      return Promise.reject(rejectedValue);
    }
    
    if (resolvedValue !== undefined) {
      return Promise.resolve(resolvedValue);
    }
    
    if (returnValue !== undefined) {
      return returnValue;
    }
    
    if (implementation) {
      return implementation(...args);
    }
    
    return undefined;
  }) as MockFunction<T>;

  mockFn.mockResolvedValue = (value: any) => {
    resolvedValue = value;
    rejectedValue = undefined;
  };

  mockFn.mockRejectedValue = (error: any) => {
    rejectedValue = error;
    resolvedValue = undefined;
  };

  mockFn.mockReturnValue = (value: any) => {
    returnValue = value;
  };

  mockFn.mockImplementation = (fn: (...args: any[]) => any) => {
    implementation = fn as T;
  };

  mockFn.mockClear = () => {
    calls.length = 0;
    implementation = undefined;
    returnValue = undefined;
    resolvedValue = undefined;
    rejectedValue = undefined;
  };

  mockFn.calls = calls;

  return mockFn;
}

// 断言函数
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
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${actual} to contain ${expected}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error(`Expected ${actual} to be defined`);
      }
    },
    toBeInstanceOf: (expected: any) => {
      if (!(actual instanceof expected)) {
        throw new Error(`Expected ${actual} to be instance of ${expected.name}`);
      }
    },
    toHaveLength: (expected: number) => {
      if (actual.length !== expected) {
        throw new Error(`Expected ${actual} to have length ${expected}, but got ${actual.length}`);
      }
    },
    toHaveBeenCalledWith: (...expected: any[]) => {
      const lastCall = actual.calls[actual.calls.length - 1];
      if (JSON.stringify(lastCall) !== JSON.stringify(expected)) {
        throw new Error(`Expected to be called with ${JSON.stringify(expected)}, but was called with ${JSON.stringify(lastCall)}`);
      }
    },
    not: {
      toHaveBeenCalled: () => {
        if (actual.calls.length > 0) {
          throw new Error(`Expected not to have been called, but was called ${actual.calls.length} times`);
        }
      }
    },
    rejects: {
      toThrow: async (ErrorClass?: any) => {
        try {
          await actual;
          throw new Error('Expected promise to reject, but it resolved');
        } catch (error) {
          if (ErrorClass && error instanceof Error && !(error instanceof ErrorClass)) {
            throw new Error(`Expected error to be instance of ${ErrorClass.name}, but got ${error.constructor.name}`);
          }
        }
      }
    }
  };
}

// Mock对象
const mockGeneratePrompt = createMockFunction<typeof import('../prompts.js').generatePrompt>();
const mockCheckSamplingSupport = createMockFunction<typeof import('../../sampling/checker.js').checkSamplingSupport>();
const mockHandleSamplingRequest = createMockFunction<typeof import('../../sampling/handler.js').handleSamplingRequest>();
const mockGetTemplateById = createMockFunction<typeof import('../templates.js').getTemplateById>();

// 替换原始函数 (这在实际应用中需要更复杂的mock机制)
// 这里我们只是创建一个测试框架

/**
 * 图片生成工具测试套件
 */
export class ImageGenerationToolTests {
  private mockServer: any;
  private toolHandler: (params: any, extra: any) => Promise<any> = async () => ({});

  constructor() {
    console.log('开始图片生成工具测试...');
  }

  /**
   * 设置测试环境
   */
  setup() {
    // 重置所有mock
    mockGeneratePrompt.mockClear();
    mockCheckSamplingSupport.mockClear();
    mockHandleSamplingRequest.mockClear();
    mockGetTemplateById.mockClear();

    // 创建mock服务器
    this.mockServer = {
      registerTool: createMockFunction(),
    };

    // 注册工具并捕获处理函数
    registerImageGenerationTool(this.mockServer as any);
    
    // 获取注册的工具处理器
    const registerCalls = this.mockServer.registerTool.calls;
    if (registerCalls.length === 0) {
      throw new Error('工具未正确注册');
    }
    
    this.toolHandler = registerCalls[0][2];
  }

  /**
   * 测试参数验证
   */
  async testParameterValidation() {
    console.log('测试参数验证...');
    
    try {
      // 测试缺少subject参数的情况
      await this.toolHandler({}, {});
      throw new Error('应该抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenerationError);
      expect((error as ImageGenerationError).type).toBe(ImageGenerationErrorType.INVALID_PARAMETERS);
      console.log('✓ 正确验证了缺少subject参数的情况');
    }

    // 测试有效的subject参数
    const params = {
      subject: '一只可爱的小猫',
      width: 512,
      height: 512,
      samplingSteps: 20
    };

    mockGeneratePrompt.mockResolvedValue({
      prompt: '一只可爱的小猫',
      negativePrompt: undefined
    });
    mockCheckSamplingSupport.mockReturnValue(false);

    const result = await this.toolHandler(params, {});
    expect(result).toBeDefined();
    expect(result.structuredContent.prompt).toBe('一只可爱的小猫');
    console.log('✓ 正确处理了有效的subject参数');

    // 测试默认技术参数
    const simpleParams = { subject: '一只可爱的小猫' };
    mockGeneratePrompt.mockResolvedValue({
      prompt: '一只可爱的小猫',
      negativePrompt: undefined
    });

    const defaultResult = await this.toolHandler(simpleParams, {});
    
    // 调试：打印实际结果
    console.log('实际返回的结果:', JSON.stringify(defaultResult, null, 2));
    console.log('参数部分:', JSON.stringify(defaultResult.structuredContent?.parameters, null, 2));
    
    expect(defaultResult.structuredContent.parameters).toEqual({
      width: 512,
      height: 512,
      samplingSteps: 20
    });
    console.log('✓ 正确应用了默认技术参数');
  }

  /**
   * 测试模板功能
   */
  async testTemplateFeatures() {
    console.log('测试模板功能...');

    const mockTemplate = {
      id: 'test-template-id',
      name: '测试模板',
      version: 1,
      parameters: {
        subject: '模板默认主体',
        style: '卡通风格',
        mood: '快乐'
      }
    };

    // 测试使用有效模板
    const params = {
      templateId: 'test-template-id',
      subject: '用户自定义主体'
    };

    mockGetTemplateById.mockReturnValue(mockTemplate as any);
    mockGeneratePrompt.mockResolvedValue({
      prompt: '用户自定义主体, style: 卡通风格, mood: 快乐',
      negativePrompt: undefined
    });
    mockCheckSamplingSupport.mockReturnValue(false);

    const result = await this.toolHandler(params, {});
    expect(result.structuredContent.usedTemplate).toEqual({
      id: 'test-template-id',
      name: '测试模板',
      version: 1
    });
    console.log('✓ 正确使用了有效模板');

    // 测试无效模板ID
    try {
      const invalidParams = { templateId: 'invalid-template-id' };
      const templateError = new Error('模板未找到');
      templateError.name = 'TemplateError';
      (templateError as any).type = 'TEMPLATE_NOT_FOUND';
      mockGetTemplateById.mockImplementation(() => {
        throw templateError;
      });

      await this.toolHandler(invalidParams, {});
      throw new Error('应该抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenerationError);
      expect((error as ImageGenerationError).type).toBe(ImageGenerationErrorType.INVALID_TEMPLATE);
      console.log('✓ 正确处理了无效模板ID');
    }
  }

  /**
   * 测试Sampling功能
   */
  async testSamplingFeatures() {
    console.log('测试Sampling功能...');

    // 测试支持Sampling时生成图片
    const params = {
      subject: '一只可爱的小猫',
      width: 256,
      height: 256,
      samplingSteps: 10
    };

    mockGeneratePrompt.mockResolvedValue({
      prompt: '一只可爱的小猫',
      negativePrompt: '模糊, 低质量'
    });
    mockCheckSamplingSupport.mockReturnValue(true);
    mockHandleSamplingRequest.mockResolvedValue({
      content: {
        type: 'image',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        mimeType: 'image/png'
      }
    } as any);

    const result = await this.toolHandler(params, { sampling: true });
    expect(result.content).toHaveLength(2);
    expect(result.content[0].type).toBe('image');
    expect(result.content[1].text).toBe('图片生成成功');
    expect(result.structuredContent.imageUrl).toBeDefined();
    console.log('✓ 在支持Sampling时正确生成了图片');

    // 测试不支持Sampling时返回提示词
    mockCheckSamplingSupport.mockReturnValue(false);
    const textResult = await this.toolHandler(params, {});
    expect(textResult.content).toHaveLength(1);
    expect(textResult.content[0].type).toBe('text');
    expect(textResult.content[0].text).toContain('提示词生成成功');
    expect(textResult.structuredContent.supportsSampling).toBe(false);
    console.log('✓ 在不支持Sampling时正确返回了提示词');
  }

  /**
   * 测试错误处理
   */
  async testErrorHandling() {
    console.log('测试错误处理...');

    // 测试提示词生成错误
    const params = { subject: '一只可爱的小猫' };
    mockGeneratePrompt.mockRejectedValue(new Error('提示词生成失败'));
    mockCheckSamplingSupport.mockReturnValue(false);

    try {
      await this.toolHandler(params, {});
      throw new Error('应该抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenerationError);
      expect((error as ImageGenerationError).type).toBe(ImageGenerationErrorType.INTERNAL_ERROR);
      console.log('✓ 正确处理了提示词生成错误');
    }

    // 测试Sampling请求失败
    mockGeneratePrompt.mockResolvedValue({
      prompt: '一只可爱的小猫',
      negativePrompt: undefined
    });
    mockCheckSamplingSupport.mockReturnValue(true);
    mockHandleSamplingRequest.mockRejectedValue(new Error('Sampling 服务器错误'));

    try {
      await this.toolHandler(params, { sampling: true });
      throw new Error('应该抛出错误');
    } catch (error) {
      expect(error).toBeInstanceOf(ImageGenerationError);
      expect((error as ImageGenerationError).type).toBe(ImageGenerationErrorType.SAMPLING_FAILED);
      console.log('✓ 正确处理了Sampling请求失败');
    }
  }

  /**
   * 运行所有测试
   */
  async runAllTests() {
    try {
      this.setup();
      await this.testParameterValidation();
      
      this.setup();
      await this.testTemplateFeatures();
      
      this.setup();
      await this.testSamplingFeatures();
      
      this.setup();
      await this.testErrorHandling();
      
      console.log('\n🎉 所有测试通过！');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('\n❌ 测试失败:', errorMessage);
      return false;
    }
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new ImageGenerationToolTests();
  tests.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
} 