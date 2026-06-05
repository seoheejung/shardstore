import { Router } from "express";
import multer from "multer";

import { AppOptions } from "../app";
import { BucketService } from "../modules/bucket/bucket.service";
import { MetadataRepository } from "../modules/metadata/metadata.repository";
import { ObjectController } from "../modules/object/object.controller";
import { ObjectService } from "../modules/object/object.service";
import { LocalStorage } from "../modules/storage/local-storage";
import { asyncHandler } from "../shared/async-handler";

export function createObjectRouter(options: AppOptions = {}) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });
  const storage = new LocalStorage(options.dataRoot);
  const bucketService = new BucketService(storage);
  const metadataRepository = new MetadataRepository(storage);
  const objectService = new ObjectService(
    bucketService,
    storage,
    metadataRepository
  );
  const controller = new ObjectController(objectService);

  router.get(
    "/:bucketName/objects/metadata",
    asyncHandler(controller.getMetadata)
  );
  router.put(
    "/:bucketName/objects",
    upload.single("file"),
    asyncHandler(controller.upload)
  );
  router.get("/:bucketName/objects", asyncHandler(controller.downloadOrList));
  router.delete("/:bucketName/objects", asyncHandler(controller.delete));

  return router;
}
