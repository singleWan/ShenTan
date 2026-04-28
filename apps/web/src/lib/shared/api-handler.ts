import { isShentanError, type ErrorCode } from '@shentan/core/errors';

/** 错误码到 HTTP 状态码的映射 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  CONFIG_ERROR: 500,
  DATABASE_ERROR: 500,
  SEARCH_ERROR: 502,
  SCRAPE_ERROR: 502,
  BROWSER_ERROR: 502,
  AGENT_ERROR: 500,
  TOOL_ERROR: 500,
  PROVIDER_ERROR: 502,
  VALIDATION_ERROR: 400,
  TIMEOUT_ERROR: 504,
  ABORTED_ERROR: 499,
};

/** 标准化错误响应格式 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function getHttpStatus(error: unknown): number {
  if (isShentanError(error)) {
    return ERROR_STATUS_MAP[error.code] ?? 500;
  }
  return 500;
}

function formatError(error: unknown): ErrorResponse {
  if (isShentanError(error)) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.context,
      },
    };
  }
  if (error instanceof Error) {
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    };
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: String(error),
    },
  };
}

/**
 * API 路由错误处理包装器。
 * 自动捕获异常，返回标准化 JSON 错误响应。
 *
 * @example
 * export const POST = apiHandler(async (req) => {
 *   const body = await req.json();
 *   return Response.json({ taskId });
 * });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: Request, context?: any) => Promise<Response>;

export function apiHandler(handler: RouteHandler): RouteHandler {
  return async (req: Request, context?: unknown) => {
    try {
      return await handler(req, context);
    } catch (error) {
      const status = getHttpStatus(error);
      const body = formatError(error);

      console.error(`[API Error] ${status}:`, body.error.code, body.error.message);

      return Response.json(body, { status });
    }
  };
}
