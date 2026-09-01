import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "not_found", "The requested resource was not found"));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let normalized: AppError;
  if (error instanceof AppError) {
    normalized = error;
  } else if (error instanceof ZodError) {
    normalized = new AppError(400, "validation_failed", "Request validation failed", {
      issues: error.issues.map(({ path, message, code }) => ({ path, message, code })),
    });
  } else if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    normalized = new AppError(409, "resource_conflict", "The resource already exists");
  } else if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    normalized = new AppError(error.status, "http_error", error.message);
  } else {
    normalized = new AppError(500, "internal_error", "An unexpected error occurred");
  }

  if (normalized.status >= 500) {
    // Never serialize the original error: it may contain secrets or database details.
    console.error("api_request_failed", {
      requestId: request.requestId,
      method: request.method,
      path: request.path,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  response.status(normalized.status).json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
      requestId: request.requestId,
    },
  });
};
