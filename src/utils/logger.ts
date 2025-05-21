import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import os from 'os';

// 获取日志目录
function getLogDir(): string {
  // 1. 优先使用环境变量
  if (process.env.LOG_DIR) {
    return process.env.LOG_DIR;
  }

  // 2. 根据操作系统使用标准日志目录
  const appName = 'image-prompt-mcp';
  if (process.platform === 'darwin') {
    // macOS: ~/Library/Logs/image-prompt-mcp
    return path.join(os.homedir(), 'Library', 'Logs', appName);
  } else if (process.platform === 'linux') {
    // Linux: ~/.local/share/image-prompt-mcp/logs
    return path.join(os.homedir(), '.local', 'share', appName, 'logs');
  } else {
    // 其他系统: ~/.image-prompt-mcp/logs
    return path.join(os.homedir(), `.${appName}`, 'logs');
  }
}

// 确保日志目录存在并返回最终的日志目录路径
function initLogDir(): string {
  const primaryDir = getLogDir();
  try {
    fs.mkdirSync(primaryDir, { recursive: true });
    return primaryDir;
  } catch (error) {
    // 如果创建目录失败，回退到临时目录
    console.warn(`无法创建日志目录 ${primaryDir}，将使用临时目录`);
    const tempLogDir = path.join(os.tmpdir(), 'image-prompt-mcp', 'logs');
    fs.mkdirSync(tempLogDir, { recursive: true });
    return tempLogDir;
  }
}

// 初始化日志目录但不立即执行
let LOG_DIR: string;

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 创建 Winston logger 实例，但不立即配置
let logger: winston.Logger;

// 定义日志类别
export enum LogCategory {
  TEMPLATE = 'template',
  IMAGE = 'image',
  PROMPT = 'prompt',
  SAMPLING = 'sampling',
  SYSTEM = 'system',
}

// 创建带有上下文的日志函数
export interface LogContext {
  category: LogCategory;
  operation: string;
  [key: string]: any;
}

// 初始化函数，在应用启动时显式调用
export function initLogger() {
  // 确保日志目录存在
  LOG_DIR = initLogDir();

  // 创建 winston logger 实例
  logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
      // 写入所有日志到 combined.log
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      // 写入所有错误日志到 error.log
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ],
  });

  // 在非生产环境下，同时输出到控制台
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }));
  }

  // 输出日志配置信息
  logger.info('日志系统初始化完成', {
    category: LogCategory.SYSTEM,
    operation: 'init',
    logDir: LOG_DIR,
    level: logger.level,
    nodeEnv: process.env.NODE_ENV
  });

  return logger;
}

// 创建一个初始安全的 logger，在 initLogger 调用前使用控制台输出
logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  ]
});

// 扩展 logger 接口
export const log = {
  info: (message: string, context: LogContext) => {
    logger.info(message, { ...context });
  },
  error: (message: string, context: LogContext, error?: Error) => {
    logger.error(message, {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  },
  warn: (message: string, context: LogContext) => {
    logger.warn(message, { ...context });
  },
  debug: (message: string, context: LogContext) => {
    logger.debug(message, { ...context });
  },
};

export default log; 