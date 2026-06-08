import { Router } from "express";

import { AppOptions } from "../app";
import { DebugController } from "../modules/debug/debug.controller";
import { DebugService } from "../modules/debug/debug.service";
import { MetadataRepository } from "../modules/metadata/metadata.repository";
import { LocalStorage } from "../modules/storage/local-storage";
import { asyncHandler } from "../shared/async-handler";

export function createDebugRouter(options: AppOptions = {}) {
  const router = Router();
  const storage = new LocalStorage(options.dataRoot);
  const metadataRepository = new MetadataRepository(storage);
  const debugService = new DebugService(storage, metadataRepository);
  const controller = new DebugController(debugService);

  router.post(
    "/objects/:objectId/delete-shards",
    asyncHandler(controller.deleteShards)
  );
  router.post("/objects/:objectId/recover", asyncHandler(controller.recover));

  return router;
}
