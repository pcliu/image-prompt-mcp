import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';

interface SamplingCapability {
  includes: (method: string) => boolean;
  maxTokens?: number;
  models?: string[];
}

/**
 * 检查客户端是否支持 MCP Sampling 功能
 * 
 * 根据 MCP 规范，检查客户端是否支持 sampling/createMessage 方法。
 * 该方法允许服务器通过客户端请求 LLM 补全。
 * 
 * @see https://modelcontextprotocol.io/docs/concepts/sampling
 * @param extra 请求处理器的额外信息，包含客户端能力信息
 * @returns {boolean} 如果客户端支持 sampling/createMessage 则返回 true
 */
export function checkSamplingSupport(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification> & { _meta?: { capabilities?: ClientCapabilities } }
): boolean {
  // 检查客户端是否存在且有 capabilities
  if (!extra?._meta?.capabilities) {
    return false;
  }

  const { capabilities } = extra._meta;
  
  // 处理数组形式的 sampling 能力
  if (Array.isArray(capabilities.sampling)) {
    return capabilities.sampling.includes('createMessage');
  }
  
  // 处理对象形式的 sampling 能力
  const sampling = capabilities.sampling as unknown as SamplingCapability | undefined;

  // 检查是否支持 sampling/createMessage
  return sampling?.includes('createMessage') ?? false;
}

/**
 * 检查客户端的具体 Sampling 能力
 * 
 * @param extra 请求处理器的额外信息
 * @returns {SamplingCapabilities} 客户端支持的 Sampling 相关能力
 */
export interface SamplingCapabilities {
  supportsCreateMessage: boolean;  // 是否支持基本的消息创建
  supportsImages: boolean;         // 是否支持图片内容
  maxTokens?: number;             // 支持的最大 token 数（如果客户端提供）
  supportedModels?: string[];     // 支持的模型列表（如果客户端提供）
}

export function checkDetailedSamplingCapabilities(
  extra: RequestHandlerExtra<ServerRequest, ServerNotification> & { _meta?: { capabilities?: ClientCapabilities } }
): SamplingCapabilities {
  if (!extra?._meta?.capabilities) {
    return {
      supportsCreateMessage: false,
      supportsImages: false
    };
  }

  const { capabilities } = extra._meta;
  
  // 处理数组形式的 sampling 能力
  if (Array.isArray(capabilities.sampling)) {
    return {
      supportsCreateMessage: capabilities.sampling.includes('createMessage'),
      supportsImages: capabilities.sampling.includes('image')
    };
  }
  
  // 处理对象形式的 sampling 能力
  const sampling = capabilities.sampling as unknown as SamplingCapability | undefined;

  return {
    supportsCreateMessage: sampling?.includes('createMessage') ?? false,
    supportsImages: sampling?.includes('image') ?? false,
    maxTokens: sampling?.maxTokens,
    supportedModels: sampling?.models
  };
}
