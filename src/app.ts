import express, { ErrorRequestHandler } from "express";
import multer from "multer";

import { createBucketRouter } from "./routes/bucket.routes";
import { createObjectRouter } from "./routes/object.routes";
import { AppError } from "./shared/errors";

export interface AppOptions {
  dataRoot?: string;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.use(express.json());
  app.use("/buckets", createObjectRouter(options));
  app.use("/buckets", createBucketRouter(options));

  app.use((_req, _res, next) => {
    next(new AppError(404, "not_found", "Route not found"));
  });

  app.use(errorHandler);

  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: {
        code: "upload_error",
        message: error.message
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  });
};
