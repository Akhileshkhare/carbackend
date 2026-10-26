import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  const requestId = request.id;
  if (error instanceof AppError) {
    logger.warn(
      {
        requestId,
        method: request.method,
        path: request.path,
        status: error.status,
        code: error.code,
      },
      `Request rejected: ${error.message}`,
    );
    response.status(error.status).json({
      error: { code: error.code, message: error.message, requestId },
    });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the submitted fields.",
        requestId,
      },
    });
    return;
  }
  if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "The request body is not valid JSON.",
          requestId,
        },
      });
      return;
    }
    if (error.type === "entity.too.large") {
      response.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "The request body exceeds the allowed size.",
          requestId,
        },
      });
      return;
    }
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "ER_DUP_ENTRY") {
      response.status(409).json({
        error: {
          code: "CONFLICT",
          message: "A record with the same unique value already exists.",
          requestId,
        },
      });
      return;
    }
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      response.status(400).json({
        error: {
          code: "RELATED_RECORD_NOT_FOUND",
          message: "A referenced record does not exist.",
          requestId,
        },
      });
      return;
    }
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      response.status(409).json({
        error: {
          code: "RECORD_IN_USE",
          message: "This record is still referenced and cannot be deleted.",
          requestId,
        },
      });
      return;
    }
  }

  logger.error({ err: error, requestId }, "Unhandled request error");
  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId,
    },
  });
};
