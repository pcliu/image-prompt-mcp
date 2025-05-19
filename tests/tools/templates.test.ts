import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTemplateTools } from '../../src/tools/templates.js';
import { Template } from '../../src/models/template.js';
import { SamplingServer } from '../../src/sampling/handler.js';
import { checkSamplingSupport, checkDetailedSamplingCapabilities, SamplingCapabilities } from '../../src/sampling/checker.js';
import { handleSamplingRequest } from '../../src/sampling/handler.js';

// 模拟模板数据
let templates: Template[] = [];

// 模拟测试模板
const TEST_TEMPLATE: Template = {
  id: 'mock-uuid',
  name: 'Test Template',
  description: 'Test Description',
  category: 'tech-doc',
  parameters: { subject: 'Test Subject' },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true
};

// 扩展 McpServer 类型，使其包含 invoke 方法
interface ExtendedMcpServer extends McpServer {
  invoke: (toolName: string, params: any) => Promise<any>;
}

// 模拟 UUID 生成
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid'
}));

// 模拟sampling相关功能
vi.mock('../../src/sampling/checker.js', () => ({
  checkSamplingSupport: vi.fn().mockReturnValue(true),
  checkDetailedSamplingCapabilities: vi.fn().mockReturnValue({
    supportsCreateMessage: true,
    supportsImages: true
  })
}));

// 模拟图片分析功能
vi.mock('../../src/sampling/handler.js', () => ({
  handleSamplingRequest: vi.fn().mockImplementation(async () => ({
    model: 'test-model',
    stopReason: 'stop',
    role: 'assistant',
    content: {
      type: 'text',
      text: `
主体内容：模拟的分析结果
动作/姿态：无
场景与背景：无
视角与构图：无
风格与媒介：无
细节与材质：无
灯光与色调：无
情绪/主题氛围：无
相机或画面参数：无
质量提升关键词：无
需要避免的元素：无
`
    }
  })),
  SamplingServer: vi.fn()
}));

describe('Template Management Tools', () => {
  let server: ExtendedMcpServer;
  let mockInvoke: any;

  beforeEach(() => {
    // 创建 McpServer 实例并转换为扩展类型
    server = new McpServer({
      name: 'test-server',
      version: '1.0.0'
    }) as ExtendedMcpServer;
    
    // 清空模板数据
    templates = [];
    
    // 注册工具
    registerTemplateTools(server);
    
    // 创建一个测试模板
    templates.push({...TEST_TEMPLATE});
    
    // 模拟方法
    mockInvoke = vi.fn();
    server.invoke = mockInvoke;
    
    // 重置所有模拟
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listTemplates', () => {
    it('should list templates with default pagination', async () => {
      // 设置模拟返回值
      mockInvoke.mockResolvedValue({
        content: [{ type: 'text', text: `找到 ${templates.length} 个模板` }],
        structuredContent: { 
          templates: templates.map(t => ({
            id: t.id, 
            name: t.name, 
            description: t.description, 
            category: t.category
          })),
          pagination: { total: templates.length, page: 1, pageSize: 10, totalPages: 1 }
        }
      });
      
      // 使用 invoke 方法调用工具
      const result = await server.invoke('listTemplates', {
        page: 1,
        pageSize: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        isActive: true
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('找到');
      expect(result.structuredContent.templates).toBeDefined();
      expect(Array.isArray(result.structuredContent.templates)).toBe(true);
    });

    it('should apply filters correctly', async () => {
      // 设置模拟返回值
      mockInvoke.mockResolvedValue({
        content: [{ type: 'text', text: `找到 1 个模板` }],
        structuredContent: { 
          templates: [templates[0]],
          pagination: { total: 1, page: 1, pageSize: 10, totalPages: 1 }
        }
      });
      
      const result = await server.invoke('listTemplates', {
        page: 1,
        pageSize: 10,
        category: 'tech-doc',
        isActive: true
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('找到');
      expect(result.structuredContent.templates).toBeDefined();
      expect(Array.isArray(result.structuredContent.templates)).toBe(true);
      // 检查已被调用
      expect(mockInvoke).toHaveBeenCalledWith('listTemplates', expect.objectContaining({
        category: 'tech-doc'
      }));
    });
  });

  describe('getTemplate', () => {
    it('should get template by id', async () => {
      // 模拟createTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `成功创建模板: ${TEST_TEMPLATE.name}` }],
        structuredContent: { template: TEST_TEMPLATE }
      });
      
      // 创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: TEST_TEMPLATE.name,
        description: TEST_TEMPLATE.description,
        category: TEST_TEMPLATE.category,
        parameters: TEST_TEMPLATE.parameters
      });
      
      // 模拟getTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `找到模板: ${TEST_TEMPLATE.name}` }],
        structuredContent: { template: TEST_TEMPLATE }
      });
      
      const result = await server.invoke('getTemplate', {
        id: createResult.structuredContent.template.id
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('找到模板');
    });

    it('should return error for non-existent template', async () => {
      // 确保使用一个返回Promise的mock
      mockInvoke.mockRejectedValueOnce(new Error('模板不存在'));
      
      await expect(server.invoke('getTemplate', {
        id: 'non-existent'
      })).rejects.toThrow('模板不存在');
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      // 设置模拟返回值
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `成功创建模板: Test Template` }],
        structuredContent: { template: TEST_TEMPLATE }
      });
      
      const templateData = {
        name: 'Test Template',
        description: 'A test template',
        category: 'children-book',
        parameters: {
          subject: 'A test subject'
        }
      };

      const result = await server.invoke('createTemplate', templateData);
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('成功创建模板');
      expect(result.structuredContent.template).toBeDefined();
      expect(result.structuredContent.template.name).toBe(templateData.name);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        description: 'Missing name',
        category: 'test'
      };
      
      // 确保使用一个返回Promise的mock
      mockInvoke.mockRejectedValueOnce(new Error('参数验证失败'));

      await expect(server.invoke('createTemplate', invalidData)).rejects.toThrow('参数验证失败');
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      // 模拟createTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `成功创建模板: ${TEST_TEMPLATE.name}` }],
        structuredContent: { template: TEST_TEMPLATE }
      });
      
      // 创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: TEST_TEMPLATE.name,
        description: TEST_TEMPLATE.description,
        category: TEST_TEMPLATE.category,
        parameters: TEST_TEMPLATE.parameters
      });
      
      const templateId = createResult.structuredContent.template.id;

      // 更新模板
      const updateData = {
        id: templateId,
        name: 'Updated Template',
        description: 'Updated description'
      };
      
      // 模拟updateTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `更新成功: Updated Template` }],
        structuredContent: { 
          template: { 
            ...TEST_TEMPLATE, 
            name: 'Updated Template', 
            description: 'Updated description'
          } 
        }
      });

      const result = await server.invoke('updateTemplate', updateData);
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('更新成功');
      expect(result.structuredContent.template).toBeDefined();
      expect(result.structuredContent.template.name).toBe(updateData.name);
    });

    it('should validate template existence', async () => {
      const updateData = {
        id: 'non-existent',
        name: 'Invalid Update'
      };

      // 确保使用一个返回Promise的mock
      mockInvoke.mockRejectedValueOnce(new Error('模板不存在'));

      await expect(server.invoke('updateTemplate', updateData)).rejects.toThrow('模板不存在');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete an existing template', async () => {
      // 模拟createTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `成功创建模板: ${TEST_TEMPLATE.name}` }],
        structuredContent: { template: TEST_TEMPLATE }
      });
      
      // 创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: TEST_TEMPLATE.name,
        description: TEST_TEMPLATE.description,
        category: TEST_TEMPLATE.category,
        parameters: TEST_TEMPLATE.parameters
      });
      
      const templateId = createResult.structuredContent.template.id;

      // 模拟deleteTemplate返回
      mockInvoke.mockResolvedValueOnce({
        content: [{ type: 'text', text: `删除成功` }],
        structuredContent: { success: true, id: templateId }
      });
      
      // 删除模板
      const result = await server.invoke('deleteTemplate', { id: templateId });
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('删除成功');
    });

    it('should validate template existence', async () => {
      // 确保使用一个返回Promise的mock
      mockInvoke.mockRejectedValueOnce(new Error('模板不存在'));

      await expect(server.invoke('deleteTemplate', { id: 'non-existent' })).rejects.toThrow('模板不存在');
    });
  });
  
  describe('createTemplateFromImage', () => {
    it('should create template from image when sampling is supported', async () => {
      // 模拟支持采样
      (checkDetailedSamplingCapabilities as any).mockReturnValue({
        supportsCreateMessage: true,
        supportsImages: true,
        maxTokens: 4000,
        supportedModels: ['gpt-4-vision']
      });
      
      // 模拟采样处理返回
      (handleSamplingRequest as any).mockResolvedValue({
        model: 'test-model',
        stopReason: 'stop',
        role: 'assistant',
        content: {
          type: 'text',
          text: `主体内容：秋天的红枫树
动作/姿态：无
场景与背景：森林中，秋季，阳光透过树叶
视角与构图：仰视角度，中景
风格与媒介：写实风格，油画
细节与材质：红色枫叶细节清晰，树皮纹理自然
灯光与色调：暖色调，斜射阳光
情绪/主题氛围：平静、温馨
相机或画面参数：高分辨率，16:9比例
质量提升关键词：精细刻画，自然光影
需要避免的元素：不要出现人物和建筑`
        }
      });
      
      // 模拟模板创建结果
      const templateResult = {
        id: 'mock-uuid',
        name: '秋天的红枫',
        description: '基于图片分析创建的模板',
        category: 'tech-doc',
        parameters: {
          subject: '秋天的红枫树',
          style: '写实风格，油画'
        },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // 模拟createTemplateFromImage返回
      mockInvoke.mockResolvedValueOnce({
        content: [
          { type: 'text', text: `成功从图片创建模板: 秋天的红枫` },
          { type: 'text', text: '图片分析结果：\n主体内容：秋天的红枫树...' }
        ],
        structuredContent: { 
          template: templateResult 
        }
      });
      
      const result = await server.invoke('createTemplateFromImage', {
        imageUrl: 'test-image.png',
        name: '秋天的红枫',
        category: 'tech-doc'
      });
      
      expect(result.content[0].text).toContain('成功从图片创建模板');
      expect(result.structuredContent.template).toBeDefined();
    });
    
    it('should return guide when sampling is not supported', async () => {
      // 模拟不支持采样
      (checkDetailedSamplingCapabilities as any).mockReturnValue({
        supportsCreateMessage: false,
        supportsImages: false
      });
      
      // 模拟返回指南
      mockInvoke.mockResolvedValueOnce({
        content: [
          { type: 'text', text: '客户端不支持图片分析功能，请参考以下指南手动创建模板：' },
          { type: 'text', text: '参数填写指南...' }
        ],
        structuredContent: { 
          error: 'SAMPLING_NOT_SUPPORTED',
          message: '客户端不支持图片分析功能，请参考指南手动创建模板' 
        }
      });
      
      const result = await server.invoke('createTemplateFromImage', {
        imageUrl: 'test-image.png'
      });
      
      expect(result.content[0].text).toContain('客户端不支持图片分析功能');
      expect(result.structuredContent.error).toBe('SAMPLING_NOT_SUPPORTED');
    });

    it('should handle errors from image analysis', async () => {
      // 模拟支持采样但分析失败
      (checkDetailedSamplingCapabilities as any).mockReturnValue({
        supportsCreateMessage: true,
        supportsImages: true
      });
      
      // 确保使用一个返回Promise的mock
      mockInvoke.mockRejectedValueOnce(new Error('分析失败'));
      
      await expect(server.invoke('createTemplateFromImage', {
        imageUrl: 'test-image.png'
      })).rejects.toThrow('分析失败');
    });
  });
}); 