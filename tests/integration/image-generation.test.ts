import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageGenerationTool } from '../../src/tools/images.js';
import { registerTemplateTools } from '../../src/tools/templates.js';
import { SamplingServer } from '../../src/sampling/handler.js';
import { handleSamplingRequest } from '../../src/sampling/handler.js';
import { checkSamplingSupport } from '../../src/sampling/checker.js';

// 模拟模块
vi.mock('../../src/sampling/checker.js', () => ({
  checkSamplingSupport: vi.fn().mockReturnValue(true)
}));

vi.mock('../../src/sampling/handler.js', () => ({
  handleSamplingRequest: vi.fn().mockImplementation(async () => ({
    content: {
      type: 'image',
      data: 'base64-encoded-image-data',
      mimeType: 'image/png'
    },
    model: 'test-model',
    stopReason: 'complete',
    role: 'assistant'
  })),
  SamplingServer: vi.fn()
}));

// 模拟 UUID 生成
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid'
}));

// 模拟模板存储
const mockTemplateStore = new Map();

describe('图片生成集成测试', () => {
  let server: {
    tool: ReturnType<typeof vi.fn>;
    sampling?: {
      createMessage: ReturnType<typeof vi.fn>;
    };
    callbacks: Map<string, Function>;
  };

  beforeEach(() => {
    // 创建服务器模拟
    server = {
      tool: vi.fn().mockImplementation((name, schema, callback) => {
        server.callbacks.set(name, callback);
        return server;
      }),
      sampling: {
        createMessage: vi.fn().mockResolvedValue({
          content: {
            type: 'image',
            data: 'base64-encoded-image-data',
            mimeType: 'image/png'
          },
          model: 'test-model',
          stopReason: 'complete',
          role: 'assistant'
        })
      },
      callbacks: new Map()
    };

    // 重置所有模拟
    vi.resetAllMocks();
    mockTemplateStore.clear();

    // 设置模拟实现
    vi.mocked(handleSamplingRequest).mockImplementation(async (server, params) => {
      return {
        content: {
          type: 'image',
          data: 'base64-encoded-image-data',
          mimeType: 'image/png'
        },
        model: 'test-model',
        stopReason: 'complete',
        role: 'assistant'
      };
    });

    // 注册工具
    registerTemplateTools(server as any);
    registerImageGenerationTool(server as any);

    // 模拟模板工具实现
    server.callbacks.set('createTemplate', async (params) => {
      const template = {
        id: 'mock-uuid',
        name: params.name,
        description: params.description,
        category: params.category,
        parameters: params.parameters,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      mockTemplateStore.set('mock-uuid', template);
      return {
        content: [{ type: 'text', text: '模板创建成功' }],
        structuredContent: { template }
      };
    });

    server.callbacks.set('updateTemplate', async (params) => {
      const template = mockTemplateStore.get(params.id);
      if (!template) {
        throw new Error(`模板 ${params.id} 不存在`);
      }
      const updatedTemplate = {
        ...template,
        parameters: { ...template.parameters, ...params.parameters },
        version: template.version + 1,
        updatedAt: new Date()
      };
      mockTemplateStore.set(params.id, updatedTemplate);
      return {
        content: [{ type: 'text', text: '模板更新成功' }],
        structuredContent: { template: updatedTemplate }
      };
    });

    server.callbacks.set('getTemplateById', async (params) => {
      const template = mockTemplateStore.get(params.id);
      if (!template) {
        throw new Error(`模板 ${params.id} 不存在`);
      }
      return template;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 辅助函数，模拟工具调用
  const invokeImageTool = async (params: any, capabilities = true) => {
    const callback = server.callbacks.get('generateImage');
    if (!callback) {
      throw new Error('generateImage 工具未注册');
    }
    return callback(params, {
      _meta: {
        capabilities: {
          sampling: {
            includes: () => capabilities
          }
        }
      }
    });
  };

  const invokeCreateTemplateTool = async (params: any) => {
    const callback = server.callbacks.get('createTemplate');
    if (!callback) {
      throw new Error('createTemplate 工具未注册');
    }
    return callback(params);
  };

  const invokeUpdateTemplateTool = async (params: any) => {
    const callback = server.callbacks.get('updateTemplate');
    if (!callback) {
      throw new Error('updateTemplate 工具未注册');
    }
    return callback(params);
  };

  it('应该能创建模板并使用模板生成图片', async () => {
    // 1. 创建模板
    const createTemplateResult = await invokeCreateTemplateTool({
      name: '测试模板',
      description: '用于测试的模板',
      category: 'tech-doc',
      parameters: {
        subject: '测试主体',
        style: '测试风格',
        mood: '测试氛围'
      }
    });

    // 验证模板创建结果
    expect(createTemplateResult).toBeDefined();
    expect(createTemplateResult.structuredContent.template).toBeDefined();
    expect(createTemplateResult.structuredContent.template.id).toBe('mock-uuid');

    // 2. 使用创建的模板生成图片
    const generateImageResult = await invokeImageTool({
      templateId: 'mock-uuid',
      action: '测试动作' // 覆盖部分参数
    });

    // 验证图片生成结果
    expect(generateImageResult).toBeDefined();
    expect(generateImageResult.content).toHaveLength(2);
    expect(generateImageResult.content[0].type).toBe('image');
    expect(generateImageResult.structuredContent.usedTemplate).toBeDefined();
    expect(generateImageResult.structuredContent.usedTemplate.id).toBe('mock-uuid');

    // 验证 Sampling 请求被调用
    expect(handleSamplingRequest).toHaveBeenCalled();
  });

  it('应该能覆盖模板的某些参数', async () => {
    // 1. 创建模板
    await invokeCreateTemplateTool({
      name: '测试模板',
      description: '用于测试的模板',
      category: 'tech-doc',
      parameters: {
        subject: '默认主体',
        style: '默认风格',
        mood: '默认氛围'
      }
    });

    // 2. 使用模板但覆盖部分参数
    await invokeImageTool({
      templateId: 'mock-uuid',
      subject: '覆盖的主体', // 覆盖默认主体
      width: 1024,
      height: 768
    });

    // 验证 Sampling 请求中的参数
    expect(handleSamplingRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          width: 1024,
          height: 768
        })
      })
    );
  });

  it('应该能更新模板并使用更新后的模板', async () => {
    // 1. 创建模板
    await invokeCreateTemplateTool({
      name: '测试模板',
      description: '用于测试的模板',
      category: 'tech-doc',
      parameters: {
        subject: '初始主体',
        style: '初始风格'
      }
    });

    // 2. 更新模板
    const updateResult = await invokeUpdateTemplateTool({
      id: 'mock-uuid',
      parameters: {
        subject: '更新后的主体',
        style: '更新后的风格',
        mood: '新增的氛围'
      }
    });

    // 验证更新结果
    expect(updateResult).toBeDefined();
    expect(updateResult.structuredContent.template.parameters.subject).toBe('更新后的主体');
    expect(updateResult.structuredContent.template.version).toBe(2); // 版本应该增加

    // 3. 使用更新后的模板生成图片
    await invokeImageTool({
      templateId: 'mock-uuid'
    });

    // 验证使用了更新后的模板
    expect(handleSamplingRequest).toHaveBeenCalled();
  });

  it('应该能在没有模板的情况下生成图片', async () => {
    // 直接使用参数生成图片
    const result = await invokeImageTool({
      subject: '测试主体',
      style: '测试风格',
      width: 512,
      height: 512,
      samplingSteps: 30
    });

    // 验证结果
    expect(result).toBeDefined();
    expect(result.content[0].type).toBe('image');
    expect(result.structuredContent.usedTemplate).toBeUndefined(); // 没有使用模板

    // 验证 Sampling 请求中的参数
    expect(handleSamplingRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          width: 512,
          height: 512,
          samplingSteps: 30
        })
      })
    );
  });
  
  it('应该处理客户端不支持采样的情况', async () => {
    // 临时模拟客户端不支持采样
    vi.mocked(checkSamplingSupport).mockReturnValueOnce(false);
    
    // 直接使用参数生成图片，但不支持采样
    const result = await invokeImageTool({
      subject: '测试主体',
      style: '测试风格'
    }, false);
    
    // 验证返回提示词而不是图片
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('提示词生成成功');
    expect(result.structuredContent.supportsSampling).toBe(false);
    
    // 验证没有调用采样请求
    expect(handleSamplingRequest).not.toHaveBeenCalled();
  });
  
  it('应该正确处理负面提示词', async () => {
    // 使用负面提示词生成图片
    await invokeImageTool({
      subject: '测试主体',
      negativePrompt: '模糊的，低质量的'
    });
    
    // 验证 Sampling 请求中包含负面提示词
    expect(handleSamplingRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({
          negativePrompt: '模糊的，低质量的'
        })
      })
    );
  });
  
  it('应该在没有提供subject和templateId时抛出异常', async () => {
    // 不提供必需参数
    await expect(invokeImageTool({
      style: '测试风格'
    })).rejects.toThrow();
  });
}); 