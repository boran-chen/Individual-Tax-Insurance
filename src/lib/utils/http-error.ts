export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function unauthorized(message = "请先登录"): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "无权访问该数据"): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "数据不存在"): HttpError {
  return new HttpError(404, message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
