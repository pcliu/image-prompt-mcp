import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerImageGenerationTool, ImageGenerationErrorType } from '../../src/tools/images.js';
import { Template } from '../../src/models/template.js';
import { SamplingServer, SamplingCreateMessageResponse } from '../../src/sampling/handler.js';
import { checkSamplingSupport } from '../../src/sampling/checker.js';
import { handleSamplingRequest } from '../../src/sampling/handler.js';
import { generatePrompt } from '../../src/tools/prompts.js';
import { getTemplateById, TemplateError, TemplateErrorType } from '../../src/tools/templates.js';

// 模拟模块
vi.mock('../../src/tools/prompts.js');
vi.mock('../../src/sampling/handler.js');
vi.mock('../../src/sampling/checker.js');
vi.mock('../../src/tools/templates.js');
vi.mock('@modelcontextprotocol/sdk/server/mcp.js');

// 模拟返回的提示词结果
const MOCK_PROMPT_RESULT = {
  prompt: '测试提示词',
  negativePrompt: '测试负面提示词'
};

// 模拟 Sampling 响应
const MOCK_SAMPLING_RESPONSE: SamplingCreateMessageResponse = {
  content: {
    type: 'image',
    data: 'base64-encoded-image-data',
    mimeType: 'image/png'
  },
  model: 'test-model',
  stopReason: 'complete',
  role: 'assistant'
};

// 模拟模板
const MOCK_TEMPLATE: Template = {
  id: 'test-template-id',
  name: '测试模板',
  description: '用于测试的模板',
  category: 'tech-doc',
  parameters: {
    subject: '测试主体',
    style: '测试风格',
    mood: '测试氛围'
  },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true
};

describe('图像生成工具测试', () => {
  let server: { 
    tool: ReturnType<typeof vi.fn>; 
    sampling?: { 
      createMessage: ReturnType<typeof vi.fn> 
    }
  };

  beforeEach(() => {
    // 创建服务器模拟
    server = {
      tool: vi.fn().mockImplementation((name, schema, callback) => {
        return server;
      }),
      sampling: {
        createMessage: vi.fn().mockResolvedValue(MOCK_SAMPLING_RESPONSE)
      }
    };

    // 重置所有模拟
    vi.resetAllMocks();

    // 设置模拟函数的返回值
    vi.mocked(generatePrompt).mockResolvedValue(MOCK_PROMPT_RESULT);
    vi.mocked(handleSamplingRequest).mockResolvedValue(MOCK_SAMPLING_RESPONSE);
    vi.mocked(checkSamplingSupport).mockReturnValue(true);
    vi.mocked(getTemplateById).mockImplementation((id) => {
      if (id === 'test-template-id') {
        return MOCK_TEMPLATE;
      }
      throw new TemplateError(TemplateErrorType.TEMPLATE_NOT_FOUND, `模板 ${id} 不存在`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 辅助函数：提取回调函数
  const getToolCallback = () => {
    const mockCall = vi.mocked(server.tool).mock.calls.find(call => call[0] === 'generateImage');
    return mockCall ? mockCall[2] : null;
  };

  describe('工具注册', () => {
    it('应该注册图像生成工具到MCP服务器', () => {
      // 注册工具
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 验证tool方法被调用
      expect(server.tool).toHaveBeenCalledWith(
        'generateImage',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('基本功能', () => {
    it('应该使用提供的subject生成图像', async () => {
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 确保回调被捕获
      expect(server.tool).toHaveBeenCalledWith(
        'generateImage',
        expect.any(Object),
        expect.any(Function)
      );
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调
      const result = await callback({
        subject: '测试主体',
        style: '测试风格'
      }, { 
        _meta: { 
          capabilities: { 
            sampling: { 
              includes: () => true 
            } 
          } 
        } 
      });
      
      // 验证结果
      expect(result).toBeDefined();
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('image');
      expect(result.content[0].data).toBe('base64-encoded-image-data');
      
      // 验证生成提示词被调用
      expect(generatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({ 
          subject: '测试主体',
          style: '测试风格'
        }),
        undefined
      );
      
      // 验证采样请求被发送
      expect(handleSamplingRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({
                text: MOCK_PROMPT_RESULT.prompt
              })
            })
          ])
        })
      );
    });
    
    it('应该在客户端不支持采样时返回提示词', async () => {
      // 模拟客户端不支持采样
      vi.mocked(checkSamplingSupport).mockReturnValue(false);
      
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调
      const result = await callback({
        subject: '测试主体'
      }, { _meta: { capabilities: {} } });
      
      // 验证结果
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('提示词生成成功');
      expect(result.structuredContent.supportsSampling).toBe(false);
      
      // 验证没有调用采样请求
      expect(handleSamplingRequest).not.toHaveBeenCalled();
    });
  });

  describe('模板支持', () => {
    it('应该使用模板生成图像', async () => {
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调，使用模板ID
      const result = await callback({
        templateId: 'test-template-id',
        action: '测试动作'  // 额外参数
      }, { 
        _meta: { 
          capabilities: { 
            sampling: { 
              includes: () => true 
            } 
          } 
        } 
      });
      
      // 验证结果
      expect(result.structuredContent.usedTemplate).toBeDefined();
      expect(result.structuredContent.usedTemplate.id).toBe('test-template-id');
      
      // 验证模板获取被调用
      expect(getTemplateById).toHaveBeenCalledWith('test-template-id', undefined);
      
      // 验证使用了模板和用户参数的组合
      expect(generatePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: MOCK_TEMPLATE.parameters.subject,
          action: '测试动作'
        }),
        MOCK_TEMPLATE
      );
    });
    
    it('应该在模板不存在时抛出异常', async () => {
      // 模拟模板不存在
      vi.mocked(getTemplateById).mockImplementation(() => {
        throw new TemplateError(TemplateErrorType.TEMPLATE_NOT_FOUND, '模板不存在');
      });
      
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 更新期望的错误类型
      await expect(callback({
        templateId: 'non-existent-template'
      }, { _meta: { capabilities: { sampling: { includes: () => true } } } }))
        .rejects.toMatchObject({
          type: ImageGenerationErrorType.INTERNAL_ERROR,
          details: expect.any(TemplateError)
        });
    });
  });
  
  describe('参数验证', () => {
    it('应该在没有提供subject和模板ID时抛出异常', async () => {
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调，不提供subject和templateId
      try {
        await callback({
          style: '测试风格'
        }, { _meta: { capabilities: { sampling: { includes: () => true } } } });
        
        // 如果没有抛出异常，测试失败
        expect('应该抛出异常').toBe(false);
      } catch (error: any) {
        // 验证错误类型
        expect(error.type).toBe(ImageGenerationErrorType.INVALID_PARAMETERS);
      }
    });
    
    it('应该正确处理图像尺寸参数', async () => {
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调，提供自定义尺寸
      await callback({
        subject: '测试主体',
        width: 1024,
        height: 768,
        samplingSteps: 30
      }, { _meta: { capabilities: { sampling: { includes: () => true } } } });
      
      // 验证尺寸参数被正确传递
      expect(handleSamplingRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: expect.objectContaining({
            width: 1024,
            height: 768,
            samplingSteps: 30
          })
        })
      );
    });
  });
  
  describe('错误处理', () => {
    it('应该处理采样请求失败的情况', async () => {
      // 模拟采样请求失败
      vi.mocked(handleSamplingRequest).mockRejectedValueOnce(new Error('采样失败'));
      
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调
      try {
        await callback({
          subject: '测试主体'
        }, { _meta: { capabilities: { sampling: { includes: () => true } } } });
        
        // 如果没有抛出异常，测试失败
        expect('应该抛出异常').toBe(false);
      } catch (error: any) {
        // 验证错误类型
        expect(error.type).toBe(ImageGenerationErrorType.SAMPLING_FAILED);
      }
    });
    
    it('应该处理提示词生成失败的情况', async () => {
      // 模拟提示词生成失败
      vi.mocked(generatePrompt).mockRejectedValueOnce(new Error('提示词生成失败'));
      
      // 注册工具，捕获回调
      registerImageGenerationTool(server as unknown as McpServer & SamplingServer);
      
      // 提取回调函数
      const callback = getToolCallback();
      expect(callback).not.toBeNull();
      
      if (!callback) return;
      
      // 调用工具回调
      try {
        await callback({
          subject: '测试主体'
        }, { _meta: { capabilities: { sampling: { includes: () => true } } } });
        
        // 如果没有抛出异常，测试失败
        expect('应该抛出异常').toBe(false);
      } catch (error: any) {
        // 验证错误类型
        expect(error.type).toBe(ImageGenerationErrorType.INTERNAL_ERROR);
      }
    });
  });
}); 