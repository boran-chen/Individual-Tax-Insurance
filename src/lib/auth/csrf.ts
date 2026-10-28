import { forbidden } from "../utils/http-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  const host = request.headers.get("host");
  if (!host) return;

  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw forbidden("跨站请求被拒绝");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "HttpError") throw error;
    throw forbidden("请求来源无效");
  }
}
