import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerImageGenerationTool } from './tools/images.js';

async function main() {
  try {
    // 创建 MCP 服务器实例
    const server = new McpServer({
      name: "image-prompt-mcp",
      version: "1.0.0",
      description: "An MCP server for image prompt generation and management"
    });

    // 注册工具
    registerImageGenerationTool(server);

    // 创建并连接 stdio 传输层
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.log('MCP 服务器已启动');
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

main(); 