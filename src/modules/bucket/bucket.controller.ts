import { Request, Response } from "express";

import { BucketService } from "./bucket.service";

export class BucketController {
  constructor(private readonly bucketService: BucketService) {}

  create = async (req: Request, res: Response) => {
    res.json(await this.bucketService.create(req.params.bucketName));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.bucketService.get(req.params.bucketName));
  };

  list = async (_req: Request, res: Response) => {
    res.json(await this.bucketService.list());
  };
}
