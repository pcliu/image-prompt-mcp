import { vi, beforeEach } from 'vitest';

// 设置全局模拟
vi.mock('../../src/tools/prompts.js');
vi.mock('../../src/sampling/checker.js');
vi.mock('../../src/sampling/handler.js');
vi.mock('../../src/tools/templates.js');

// 在每个测试之前重置所有模拟
beforeEach(() => {
  vi.resetAllMocks();
}); 