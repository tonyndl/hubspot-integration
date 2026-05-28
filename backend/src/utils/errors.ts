export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class OAuthError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 401, "OAUTH_ERROR", details);
    this.name = "OAuthError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class SyncError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, "SYNC_ERROR", details);
    this.name = "SyncError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
