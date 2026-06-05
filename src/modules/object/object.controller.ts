import { Request, Response } from "express";

import { ObjectService } from "./object.service";

export class ObjectController {
  constructor(private readonly objectService: ObjectService) {}

  upload = async (req: Request, res: Response) => {
    res.json(
      await this.objectService.upload(
        req.params.bucketName,
        req.query.key,
        req.file
      )
    );
  };

  getMetadata = async (req: Request, res: Response) => {
    res.json(
      await this.objectService.getMetadata(req.params.bucketName, req.query.key)
    );
  };

  downloadOrList = async (req: Request, res: Response) => {
    if (typeof req.query.key === "string") {
      const { metadata, data } = await this.objectService.download(
        req.params.bucketName,
        req.query.key
      );
      res.setHeader("Content-Type", metadata.content_type);
      res.setHeader("Content-Length", String(data.length));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeHeaderValue(metadata.original_file_name)}"`
      );
      res.send(data);
      return;
    }

    res.json(await this.objectService.list(req.params.bucketName));
  };

  delete = async (req: Request, res: Response) => {
    res.json(await this.objectService.delete(req.params.bucketName, req.query.key));
  };
}

function encodeHeaderValue(value: string) {
  return value.replace(/["\\\r\n]/g, "_");
}
