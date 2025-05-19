import { describe, it, expect } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { checkSamplingSupport, checkDetailedSamplingCapabilities } from '../../src/sampling/checker';
import { handleSamplingRequest, type SamplingCreateMessageRequest, type SamplingCreateMessageResponse, type SamplingCapability, type SamplingServer } from '../../src/sampling/handler';

// 创建基础的 Server mock
const createBaseMockServer = () => ({
  _serverInfo: { name: 'test', version: '1.0.0' },
  _capabilities: {},
  registerCapabilities: () => {},
  assertCapabilityForMethod: () => {},
  setRequestHandler: () => {},
  setNotificationHandler: () => {},
  request: async () => ({}),
  notification: async () => {},
  connect: async () => {},
  close: () => {},
  onclose: () => {}
});

describe('Sampling 功能集成测试', () => {
  describe('客户端不支持 sampling 的场景', () => {
    it('当客户端为空时应返回 false', () => {
      const mockExtra = {
        _meta: null
      } as any;

      expect(checkSamplingSupport(mockExtra)).toBe(false);
    });

    it('当客户端没有 capabilities 时应返回 false', () => {
      const mockExtra = {
        _meta: {}
      } as any;

      expect(checkSamplingSupport(mockExtra)).toBe(false);
    });

    it('当客户端的 capabilities.sampling 为空时应返回 false', () => {
      const mockExtra = {
        _meta: {
          capabilities: {
            sampling: []
          }
        }
      } as any;

      expect(checkSamplingSupport(mockExtra)).toBe(false);
    });

    it('当客户端的 capabilities.sampling 不包含 createMessage 时应返回 false', () => {
      const mockExtra = {
        _meta: {
          capabilities: {
            sampling: ['otherCapability']
          }
        }
      } as any;

      expect(checkSamplingSupport(mockExtra)).toBe(false);
    });

    it('checkDetailedSamplingCapabilities 应返回所有能力为 false', () => {
      const mockExtra = {
        _meta: null
      } as any;

      const capabilities = checkDetailedSamplingCapabilities(mockExtra);
      expect(capabilities).toEqual({
        supportsCreateMessage: false,
        supportsImages: false
      });
    });

    it('checkDetailedSamplingCapabilities 应正确反映部分支持的能力', () => {
      const mockExtra = {
        _meta: {
          capabilities: {
            sampling: {
              includes: (cap: string) => cap === 'image',
              maxTokens: 1000,
              models: ['gpt-4']
            }
          }
        }
      } as any;

      const capabilities = checkDetailedSamplingCapabilities(mockExtra);
      expect(capabilities).toEqual({
        supportsCreateMessage: false,
        supportsImages: true,
        maxTokens: 1000,
        supportedModels: ['gpt-4']
      });
    });
  });

  describe('客户端支持 sampling 的场景', () => {
    // 模拟一个支持 sampling 的服务器
    const mockServer: SamplingServer = {
      sampling: {
        createMessage: async (params: SamplingCreateMessageRequest): Promise<SamplingCreateMessageResponse> => {
          return {
            model: 'claude-3-sonnet',
            stopReason: 'endTurn',
            role: 'assistant',
            content: {
              type: 'text',
              text: '这是一个测试响应'
            }
          };
        }
      }
    };

    it('应成功处理文本生成请求', async () => {
      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '你好'
          }
        }]
      };

      const response = await handleSamplingRequest(mockServer, request);
      expect(response).toEqual({
        model: 'claude-3-sonnet',
        stopReason: 'endTurn',
        role: 'assistant',
        content: {
          type: 'text',
          text: '这是一个测试响应'
        }
      });
    });

    it('应成功处理带有完整参数的请求', async () => {
      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '你好'
          }
        }],
        modelPreferences: {
          hints: [{ name: 'claude-3' }],
          costPriority: 0.5,
          speedPriority: 0.8,
          intelligencePriority: 0.7
        },
        systemPrompt: '你是一个助手',
        includeContext: 'thisServer',
        temperature: 0.7,
        maxTokens: 100,
        stopSequences: ['\n'],
        metadata: {
          userId: '123'
        }
      };

      const response = await handleSamplingRequest(mockServer, request);
      expect(response.model).toBe('claude-3-sonnet');
      expect(response.content.type).toBe('text');
    });

    it('应处理图片类型的响应', async () => {
      const mockImageServer: SamplingServer = {
        sampling: {
          createMessage: async (): Promise<SamplingCreateMessageResponse> => ({
            model: 'claude-3-sonnet',
            stopReason: 'endTurn',
            role: 'assistant',
            content: {
              type: 'image',
              data: 'base64_image_data',
              mimeType: 'image/png'
            }
          })
        }
      };

      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '生成一张图片'
          }
        }]
      };

      const response = await handleSamplingRequest(mockImageServer, request);
      expect(response.content.type).toBe('image');
      expect(response.content.mimeType).toBe('image/png');
    });
  });

  describe('Sampling 错误处理场景', () => {
    it('当服务器不支持 sampling 时应抛出错误', async () => {
      const mockServer: SamplingServer = {};
      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '你好'
          }
        }]
      };

      await expect(handleSamplingRequest(mockServer, request))
        .rejects
        .toThrow('服务器不支持 sampling 功能');
    });

    it('当响应为空时应抛出错误', async () => {
      const mockServer: SamplingServer = {
        sampling: {
          createMessage: async () => {
            return null as unknown as SamplingCreateMessageResponse;
          }
        }
      };

      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '你好'
          }
        }]
      };

      await expect(handleSamplingRequest(mockServer, request))
        .rejects
        .toThrow('未收到有效的 Sampling 响应');
    });

    it('当服务器抛出错误时应正确处理', async () => {
      const mockServer: SamplingServer = {
        sampling: {
          createMessage: async () => {
            throw new Error('服务器内部错误');
          }
        }
      };

      const request: SamplingCreateMessageRequest = {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: '你好'
          }
        }]
      };

      await expect(handleSamplingRequest(mockServer, request))
        .rejects
        .toThrow('Sampling 请求处理失败: 服务器内部错误');
    });
  });
}); 