#!/usr/bin/env tsx

/**
 * 简单的测试运行器
 * 运行方式: tsx src/tools/__tests__/run-tests.ts
 */

import { ImageGenerationIntegrationTests } from './images.integration.test.js';

async function main() {
  console.log('🚀 开始运行图片生成工具测试套件...\n');
  
  const tests = new ImageGenerationIntegrationTests();
  const success = await tests.runAllTests();
  
  if (success) {
    console.log('\n✅ 所有测试都通过了！');
    process.exit(0);
  } else {
    console.log('\n❌ 有测试失败！');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 测试运行器出错:', error);
  process.exit(1);
}); 