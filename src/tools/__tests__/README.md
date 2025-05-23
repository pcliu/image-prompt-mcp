# 图片生成工具测试

这个目录包含了图片生成工具的测试用例。

## 测试文件

- `images.test.ts` - 图片生成工具的主要测试文件
- `run-tests.ts` - 测试运行器
- `README.md` - 这个文档

## 运行测试

### 方式1：使用 npm 脚本
```bash
npm run test:images
```

### 方式2：直接使用 tsx
```bash
tsx src/tools/__tests__/run-tests.ts
```

### 方式3：运行单个测试文件
```bash
tsx src/tools/__tests__/images.test.ts
```

## 测试覆盖范围

### 参数验证测试
- ✅ 验证必需的 `subject` 参数
- ✅ 验证默认技术参数（width, height, samplingSteps）
- ✅ 验证参数范围限制

### 模板功能测试
- ✅ 使用有效模板ID
- ✅ 模板参数与用户参数的合并
- ✅ 处理无效模板ID
- ✅ 使用模板默认 subject

### Sampling 功能测试
- ✅ 客户端支持 Sampling 时生成图片
- ✅ 客户端不支持 Sampling 时返回提示词
- ✅ Sampling 请求失败处理
- ✅ 无效 Sampling 响应处理

### 错误处理测试
- ✅ 提示词生成错误
- ✅ 模板加载错误
- ✅ 参数验证错误
- ✅ 内部错误处理

## 测试架构

由于项目尚未配置完整的测试框架（如 Jest），这里使用了一个自定义的轻量级测试框架：

### Mock 系统
- `MockFunction<T>` - 模拟函数类型
- `createMockFunction()` - 创建 mock 函数
- 支持 `mockResolvedValue`, `mockRejectedValue`, `mockReturnValue` 等方法

### 断言系统
- `expect()` - 主要断言函数
- 支持常见的断言方法：`toBe`, `toEqual`, `toContain`, `toBeDefined` 等
- 支持异步断言：`rejects.toThrow`

### 测试组织
- `ImageGenerationToolTests` - 主测试类
- 每个测试方法对应一个功能模块
- `setup()` 方法用于重置测试环境

## 注意事项

1. 这是一个临时的测试解决方案，建议后续迁移到正式的测试框架（如 Jest）
2. Mock 机制相对简单，可能不适用于复杂的测试场景
3. 测试中的依赖注入是通过导入时替换实现的，在实际项目中应该使用更robust的依赖注入系统

## 扩展测试

要添加新的测试用例：

1. 在 `ImageGenerationToolTests` 类中添加新的测试方法
2. 在 `runAllTests()` 方法中调用新的测试方法
3. 确保在每个测试方法开始前调用 `this.setup()` 重置环境

示例：
```typescript
async testNewFeature() {
  console.log('测试新功能...');
  
  // 设置 mock
  mockSomeFunction.mockResolvedValue(expectedValue);
  
  // 执行测试
  const result = await this.toolHandler(params, {});
  
  // 验证结果
  expect(result.something).toBe(expectedSomething);
  console.log('✓ 新功能测试通过');
}
```

然后在 `runAllTests()` 中添加：
```typescript
this.setup();
await this.testNewFeature();
``` 