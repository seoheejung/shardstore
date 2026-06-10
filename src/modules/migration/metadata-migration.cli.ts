import { printJson } from "../cli/cli-output";
import { MetadataMigrationService } from "./metadata-migration.service";

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const service = new MetadataMigrationService();
  printJson(await service.run({ dryRun }));
}

void main().catch((error) => {
  process.exitCode = 1;
  printJson({
    error: {
      code: "metadata_migration_failed",
      message: error instanceof Error ? error.message : "Metadata migration failed"
    }
  });
});

