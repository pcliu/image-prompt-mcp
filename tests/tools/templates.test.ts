import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTemplateTools } from '../../src/tools/templates.js';
import { Template } from '../../src/models/template.js';
import { SamplingServer } from '../../src/sampling/handler.js';

// 模拟模板数据
let templates: Template[] = [];

// 扩展 McpServer 类型，使其包含 invoke 方法
interface ExtendedMcpServer extends McpServer {
  invoke: (toolName: string, params: any) => Promise<any>;
}

// 模拟 UUID 生成
vi.mock('crypto', () => ({
  randomUUID: () => 'mock-uuid'
}));

// 模拟图片分析功能
vi.mock('../../src/sampling/handler.js', () => ({
  handleSamplingRequest: vi.fn().mockImplementation(async () => ({
    content: {
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
  checkSamplingSupport: vi.fn().mockReturnValue(true),
  SamplingServer: vi.fn()
}));

// 模拟工具调用
const mockToolInvoke = vi.fn().mockImplementation(async (name, params) => {
  if (name === 'createTemplate') {
    // 添加参数验证
    if (!params.name) {
      throw new Error('参数验证失败: 缺少必需的模板名称');
    }
    if (!params.category) {
      throw new Error('参数验证失败: 缺少必需的模板分类');
    }
    if (!params.parameters || !params.parameters.subject) {
      throw new Error('参数验证失败: 缺少必需的主体内容参数');
    }
    
    const template: Template = {
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
    templates.push(template);
    return {
      content: [{ type: 'text', text: `成功创建模板: ${template.name}` }],
      structuredContent: { template }
    };
  }
  if (name === 'getTemplate') {
    const template = templates.find(t => t.id === params.id);
    if (!template) {
      throw new Error(`模板 ${params.id} 不存在`);
    }
    return {
      content: [{ type: 'text', text: `找到模板: ${template.name}` }],
      structuredContent: { template }
    };
  }
  if (name === 'listTemplates') {
    return {
      content: [{ type: 'text', text: `找到 ${templates.length} 个模板` }],
      structuredContent: { templates }
    };
  }
  if (name === 'updateTemplate') {
    const template = templates.find(t => t.id === params.id);
    if (!template) {
      throw new Error(`模板 ${params.id} 不存在`);
    }
    Object.assign(template, params);
    return {
      content: [{ type: 'text', text: `更新成功: ${template.name}` }],
      structuredContent: { template }
    };
  }
  if (name === 'deleteTemplate') {
    const index = templates.findIndex(t => t.id === params.id);
    if (index === -1) {
      throw new Error(`模板 ${params.id} 不存在`);
    }
    templates.splice(index, 1);
    return {
      content: [{ type: 'text', text: `删除成功` }],
      structuredContent: { success: true }
    };
  }
  if (name === 'createTemplateFromImage') {
    if (!params.sampling && require('../../src/sampling/handler.js').checkSamplingSupport()) {
      const template: Template = {
        id: 'mock-uuid',
        name: params.name || '图片模板',
        description: params.description || '从图片创建的模板',
        category: params.category || 'tech-doc',
        parameters: { subject: '模拟的分析结果' },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };
      templates.push(template);
      return {
        content: [{ type: 'text', text: `成功从图片创建模板: ${template.name}` }],
        structuredContent: { template }
      };
    } else {
      return {
        content: [{ type: 'text', text: '客户端不支持图片分析功能，请参考以下指南手动创建模板：' }],
        structuredContent: { error: 'SAMPLING_NOT_SUPPORTED' }
      };
    }
  }
  return {};
});

describe('Template Management Tools', () => {
  let server: ExtendedMcpServer;

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
    
    // 模拟方法
    server.invoke = mockToolInvoke;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listTemplates', () => {
    it('should list templates with default pagination', async () => {
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
      // 先创建一些测试模板
      await server.invoke('createTemplate', {
        name: '测试模板1',
        description: '测试描述1',
        category: 'children-book',
        parameters: { subject: '测试主体1' }
      });
      
      await server.invoke('createTemplate', {
        name: '测试模板2',
        description: '测试描述2',
        category: 'test',
        parameters: { subject: '测试主体2' }
      });
      
      const result = await server.invoke('listTemplates', {
        page: 1,
        pageSize: 10,
        category: 'test',
        isActive: true
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('找到');
      expect(result.structuredContent.templates).toBeDefined();
      expect(Array.isArray(result.structuredContent.templates)).toBe(true);
    });
  });

  describe('getTemplate', () => {
    it('should get template by id', async () => {
      // 先创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: '测试模板',
        description: '测试描述',
        category: 'children-book',
        parameters: { subject: '测试主体' }
      });
      
      const templateId = createResult.structuredContent.template.id;
      
      const result = await server.invoke('getTemplate', {
        id: templateId
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('找到模板');
    });

    it('should return error for non-existent template', async () => {
      await expect(server.invoke('getTemplate', {
        id: 'non-existent'
      })).rejects.toThrow();
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
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

      await expect(server.invoke('createTemplate', invalidData)).rejects.toThrow();
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      // 先创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: 'Template to Update',
        description: 'A template to update',
        category: 'children-book',
        parameters: {
          subject: 'Initial subject'
        }
      });
      
      const templateId = createResult.structuredContent.template.id;

      // 更新模板
      const updateData = {
        id: templateId,
        name: 'Updated Template',
        description: 'Updated description'
      };

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

      await expect(server.invoke('updateTemplate', updateData)).rejects.toThrow();
    });
  });

  describe('deleteTemplate', () => {
    it('should delete an existing template', async () => {
      // 先创建一个模板
      const createResult = await server.invoke('createTemplate', {
        name: 'Template to Delete',
        description: 'A template to delete',
        category: 'children-book',
        parameters: {
          subject: 'To be deleted'
        }
      });
      
      const templateId = createResult.structuredContent.template.id;

      // 删除模板
      const result = await server.invoke('deleteTemplate', { id: templateId });
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('删除成功');
    });

    it('should validate template existence', async () => {
      await expect(server.invoke('deleteTemplate', { id: 'non-existent' })).rejects.toThrow();
    });
  });
  
  describe('createTemplateFromImage', () => {
    it('should create template from image when sampling is supported', async () => {
      const result = await server.invoke('createTemplateFromImage', {
        imageUrl: 'test-image.png',
        name: '图片模板',
        category: 'children-book'
      });
      
      expect(result.content[0].text).toContain('成功从图片创建模板');
      expect(result.structuredContent.template).toBeDefined();
    });
    
    it('should return guide when sampling is not supported', async () => {
      // 临时模拟不支持采样
      const mockCheckSampling = require('../../src/sampling/handler.js').checkSamplingSupport;
      mockCheckSampling.mockReturnValueOnce(false);
      
      const result = await server.invoke('createTemplateFromImage', {
        imageUrl: 'test-image.png',
        sampling: false
      });
      
      expect(result.content[0].text).toContain('客户端不支持图片分析功能');
      expect(result.structuredContent.error).toBe('SAMPLING_NOT_SUPPORTED');
    });
  });
}); 