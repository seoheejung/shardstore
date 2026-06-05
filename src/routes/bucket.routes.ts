import { Router } from "express";

import { AppOptions } from "../app";
import { BucketController } from "../modules/bucket/bucket.controller";
import { BucketService } from "../modules/bucket/bucket.service";
import { LocalStorage } from "../modules/storage/local-storage";
import { asyncHandler } from "../shared/async-handler";

export function createBucketRouter(options: AppOptions = {}) {
  const router = Router();
  const storage = new LocalStorage(options.dataRoot);
  const controller = new BucketController(new BucketService(storage));

  router.put("/:bucketName", asyncHandler(controller.create));
  router.get("/:bucketName", asyncHandler(controller.get));
  router.get("/", asyncHandler(controller.list));

  return router;
}
