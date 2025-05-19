import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * MCP Sampling 能力接口
 */
export interface SamplingCapability {
  createMessage(params: SamplingCreateMessageRequest): Promise<SamplingCreateMessageResponse>;
}

/**
 * MCP Sampling 消息内容类型
 */
export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;    // base64 encoded for images
  mimeType?: string;
}

/**
 * MCP Sampling 消息结构
 */
export interface Message {
  role: 'user' | 'assistant';
  content: MessageContent;
}

/**
 * MCP Sampling 模型偏好设置
 */
export interface ModelPreferences {
  hints?: Array<{
    name?: string;  // 建议的模型名称/系列
  }>;
  costPriority?: number;         // 0-1, 成本优先级
  speedPriority?: number;        // 0-1, 速度优先级
  intelligencePriority?: number; // 0-1, 能力优先级
}

/**
 * MCP Sampling 请求参数
 */
export interface SamplingCreateMessageRequest {
  messages: Message[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer';
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * MCP Sampling 响应
 */
export interface SamplingCreateMessageResponse {
  model: string;
  stopReason: string;
  role: 'assistant';
  content: MessageContent;
}

/**
 * 支持 Sampling 的服务器接口
 */
export interface SamplingServer {
  sampling?: SamplingCapability;
}

/**
 * 处理 MCP Sampling 请求
 * 
 * @see https://modelcontextprotocol.io/docs/concepts/sampling
 * @param server 支持 Sampling 的服务器实例
 * @param request Sampling 请求参数
 * @returns Sampling 响应
 */
export async function handleSamplingRequest(
  server: SamplingServer,
  request: SamplingCreateMessageRequest
): Promise<SamplingCreateMessageResponse> {
  if (!server.sampling?.createMessage) {
    throw new Error('服务器不支持 sampling 功能');
  }

  try {
    const response = await server.sampling.createMessage(request);
    if (!response) {
      throw new Error('未收到有效的 Sampling 响应');
    }
    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Sampling 请求处理失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 验证 Sampling 响应是否有效
 * 
 * @param response Sampling 响应
 * @returns 如果响应有效则返回 true
 */
export function validateSamplingResponse(
  response: SamplingCreateMessageResponse
): boolean {
  // 检查必需字段
  if (!response.model || !response.role || !response.content) {
    return false;
  }

  // 检查 content 结构
  const { content } = response;
  if (!content.type) {
    return false;
  }

  // 根据 content.type 检查必需字段
  if (content.type === 'text' && typeof content.text !== 'string') {
    return false;
  }

  if (content.type === 'image' && (!content.data || !content.mimeType)) {
    return false;
  }

  return true;
}
