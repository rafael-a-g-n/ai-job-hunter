export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    options?: { cause?: unknown },
  ) {
    super(userMessage, options);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(what = "Resource") {
    super("NOT_FOUND", `${what} not found.`);
    this.name = "NotFoundError";
  }
}

export class LimitExceededError extends AppError {
  constructor(
    public readonly action: string,
    public readonly limit: number,
  ) {
    super("LIMIT_EXCEEDED", `Daily limit reached for ${action} (${limit} per day).`);
    this.name = "LimitExceededError";
  }
}
