import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";

// Load environment variables
config();

// Create MCP server instance
const server = new McpServer({
  name: "image-prompt-mcp",
  version: "1.0.0",
  description: "An MCP server for image prompt generation and management"
});

// Define image prompt generation tool
server.tool(
  "generate_image_prompt",
  { 
    description: z.string().describe("图像的主要描述"),
    style: z.string().optional().describe("艺术风格（如：'realistic'、'anime'、'oil painting'）"),
    mood: z.string().optional().describe("情绪氛围（如：'happy'、'mysterious'、'dramatic'）"),
    format: z.string().optional().describe("图像格式或宽高比（如：'portrait'、'landscape'、'square'）")
  },
  async ({ description, style, mood, format }) => {
    let prompt = description;
    
    if (style) {
      prompt += `, ${style} style`;
    }
    
    if (mood) {
      prompt += `, ${mood} mood`;
    }
    
    if (format) {
      prompt += `, ${format} format`;
    }

    // Add some common quality enhancement words
    prompt += ", high quality, detailed, 8k";

    // Common negative prompt
    const negativePrompt = "blurry, low quality, distorted, deformed";

    return {
      content: [{
        type: "text",
        text: prompt
      }],
      structuredContent: {
        prompt,
        negativePrompt
      }
    };
  }
);

// Use stdio transport
const transport = new StdioServerTransport();

// Connect to the server
server.connect(transport).catch((error: Error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
}); 