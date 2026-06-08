import { Request, Response } from "express";

import { DebugService } from "./debug.service";

export class DebugController {
  constructor(private readonly debugService: DebugService) {}

  deleteShards = async (req: Request, res: Response) => {
    res.json(
      await this.debugService.deleteShards(
        req.params.objectId,
        req.query.count
      )
    );
  };

  recover = async (req: Request, res: Response) => {
    res.json(await this.debugService.recover(req.params.objectId));
  };
}
