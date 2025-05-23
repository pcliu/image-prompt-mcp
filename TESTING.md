# 图片生成工具测试文档

本文档描述了图片生成工具的测试策略、测试用例和如何运行测试。

## 测试概述

我们为图片生成工具创建了一个综合的测试套件，包括单元测试和集成测试：

### 测试类型

1. **单元测试** (`images.test.ts`) - 使用模拟框架测试个别组件
2. **集成测试** (`images.integration.test.ts`) - 测试完整的功能流程

## 快速开始

### 运行所有测试
```bash
npm run test:images
```

### 运行特定测试类型
```bash
# 单元测试（模拟环境）
npm run test:images:unit

# 集成测试（实际功能）
npm run test:images:integration
```

## 测试覆盖范围

### ✅ 参数验证
- 必需参数检查（`subject`）
- 可选参数默认值
- 参数类型验证
- 参数范围限制

### ✅ 提示词生成
- 基础提示词生成
- 复合参数组合
- 负面提示词处理
- 模板参数合并

### ✅ 模板功能
- 有效模板使用
- 无效模板处理
- 模板参数覆盖
- 模板默认值应用

### ✅ Sampling 功能
- 支持 Sampling 的客户端处理
- 不支持 Sampling 的回退
- Sampling 错误处理
- 响应格式验证

### ✅ 错误处理
- 参数验证错误
- 模板加载错误
- 内部处理错误
- 网络请求错误

### ✅ 工具注册
- MCP 工具注册验证
- Schema 定义检查
- 配置正确性验证

## 测试实例

### 基本功能测试
```bash
npm run test:images:integration
```

输出示例：
```
🚀 开始运行图片生成工具测试套件...

开始图片生成工具集成测试...
测试工具注册...
✓ 工具注册正确
测试基本参数验证...
✓ 正确验证了缺少subject参数
✓ 成功处理有效参数
测试提示词生成...
生成的提示词: 一只橘猫, action: 在阳光下睡觉, environment: 温暖的窗台, style: 水彩画风格, mood: 安静祥和
✓ 成功生成复合提示词
测试负面提示词...
✓ 正确处理负面提示词
测试不支持Sampling的情况...
✓ 正确处理不支持Sampling的情况
测试错误处理...
✓ 正确处理无效模板ID错误

🎉 所有集成测试通过！

✅ 所有测试都通过了！
```

## 测试架构

### 集成测试架构
- **MockMcpServer**: 模拟 MCP 服务器，捕获工具注册
- **实际函数调用**: 直接测试图片生成逻辑
- **真实依赖**: 使用实际的提示词生成和模板系统

### 单元测试架构
- **Mock 系统**: 完全模拟的依赖项
- **轻量断言**: 自定义的 `expect` 函数
- **隔离测试**: 每个组件独立测试

## 测试用例详解

### 1. 参数验证测试
```typescript
// 测试缺少必需参数
await this.toolHandler({}, {});
// 应该抛出: ImageGenerationError: '必须提供主体内容 (subject) 参数'

// 测试有效参数
const result = await this.toolHandler({ subject: '一只猫' }, {});
// 应该返回包含 prompt 的结构化内容
```

### 2. 提示词生成测试
```typescript
const params = {
  subject: '一只橘猫',
  action: '在阳光下睡觉',
  environment: '温暖的窗台',
  style: '水彩画风格',
  mood: '安静祥和'
};

const result = await this.toolHandler(params, {});
// 验证生成的提示词包含所有元素
```

### 3. 模板功能测试
```typescript
// 测试无效模板
await this.toolHandler({
  templateId: 'non-existent-template-id'
}, {});
// 应该抛出模板相关错误
```

### 4. Sampling 功能测试
```typescript
// 测试不支持 Sampling 的情况
const result = await this.toolHandler(params, {});
expect(result.structuredContent.supportsSampling).toBe(false);
expect(result.content[0].text).toContain('客户端不支持直接生成图片');
```

## 测试最佳实践

### 1. 测试隔离
每个测试方法都会重新设置测试环境：
```typescript
this.setup();
await this.testSomeFeature();
```

### 2. 清晰的断言
使用描述性的错误消息：
```typescript
expect(result.structuredContent.prompt).toContain('一只橘猫');
// 而不是简单的 toBe() 检查
```

### 3. 错误测试
总是测试错误情况：
```typescript
try {
  await this.toolHandler({}, {});
  throw new Error('应该抛出错误');
} catch (error) {
  expect(error.message).toContain('必须提供主体内容');
}
```

### 4. 实际数据
使用真实的测试数据而不是简单的占位符：
```typescript
const params = {
  subject: '一只橘猫',  // 真实的描述
  style: '水彩画风格',  // 真实的风格
  mood: '安静祥和'      // 真实的情绪
};
```

## 扩展测试

### 添加新测试
1. 在测试类中添加新方法：
```typescript
async testNewFeature() {
  console.log('测试新功能...');
  // 测试逻辑
  console.log('✓ 新功能测试通过');
}
```

2. 在 `runAllTests()` 中调用：
```typescript
this.setup();
await this.testNewFeature();
```

### 测试模板
```typescript
async testMyFeature() {
  console.log('测试我的功能...');
  
  // 1. 准备测试数据
  const params = { /* 测试参数 */ };
  
  // 2. 执行功能
  const result = await this.toolHandler(params, {});
  
  // 3. 验证结果
  expect(result.someProperty).toBe(expectedValue);
  
  console.log('✓ 我的功能测试通过');
}
```

## 故障排除

### 常见问题

1. **"工具未正确注册"错误**
   - 检查 `registerImageGenerationTool` 是否正确导入
   - 验证 MockMcpServer 实现

2. **提示词生成错误**
   - 检查 `subject` 参数是否提供
   - 验证模板依赖是否可用

3. **参数验证失败**
   - 检查 Zod schema 定义
   - 验证默认值设置

### 调试技巧

1. **添加调试输出**：
```typescript
console.log('实际结果:', JSON.stringify(result, null, 2));
```

2. **检查错误详情**：
```typescript
} catch (error) {
  console.error('详细错误:', error);
  throw error;
}
```

3. **验证中间状态**：
```typescript
console.log('参数处理后:', finalParams);
console.log('模板加载结果:', template);
```

## 持续集成

### 在 CI/CD 中运行测试
```yaml
# .github/workflows/test.yml
steps:
  - name: 运行图片生成工具测试
    run: npm run test:images
```

### 测试报告
测试会输出详细的执行日志，包括：
- 每个测试步骤的状态
- 生成的提示词示例
- 错误详情和堆栈跟踪

## 总结

这个测试套件提供了：
- ✅ 全面的功能覆盖
- ✅ 清晰的测试输出
- ✅ 易于扩展的架构
- ✅ 实际的使用场景测试
- ✅ 详细的错误处理验证

通过运行 `npm run test:images`，你可以快速验证图片生成工具的所有核心功能是否正常工作。 