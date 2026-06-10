# Phase 5 Storage Tier Verification

Phase 5 does not add automatic tier movement. It verifies that the existing
Phase 4 Reed-Solomon `k=2, m=1` implementation uses separate storage locations
for data and parity shards, and that a missing data shard can be rebuilt from
cold parity.

## Scope

- `hot/` stores data shards used by normal downloads.
- `cold/` stores parity shards used only for recovery.
- hot/cold is not access-frequency based movement.
- hot/cold is not time-based lifecycle movement.
- No automatic hot-to-cold movement is implemented.
- No automatic cold-to-hot promotion is implemented.
- No S3 Storage Class, lifecycle policy, metadata migration, FTP socket code,
  or `k=4, m=2` expansion is implemented.

## Expected Layout

After object upload, shard files are stored under the bucket by `object_id`:

```text
data/buckets/{bucket_name}/
  metadata/objects/{object_id}.json
  shards/{object_id}/
    hot/
      shard_0.data
      shard_1.data
    cold/
      parity_0.data
```

The object metadata keeps `schema_version: 3`, Reed-Solomon coding fields, and
`shards[]` entries with `index`, `role`, `tier`, `path`, `size`, and `checksum`.

- Data shard metadata has `role: "data"` and `tier: "hot"`.
- Parity shard metadata has `role: "parity"` and `tier: "cold"`.
- The parity shard uses global shard `index: 2`.

## Download and Recovery Rules

- Normal download reads only hot data shards and merges them by shard index.
- Normal download does not require the cold parity shard.
- If one data shard is missing, recovery reads the remaining data shard and the
  cold parity shard.
- A recovered data shard is written back to its original hot path.
- Restored object bytes are trimmed to metadata `size`.
- Restored object checksum must match metadata `checksum`.
- Losing two or more shards returns `too_many_missing_shards`.
- Object delete removes the whole `shards/{object_id}/` directory, including
  hot and cold subdirectories.

## Automated Verification

`src/app.test.ts` verifies:

- upload creates two hot data shards and one cold parity shard
- metadata stores role, tier, path, size, checksum, and coding fields
- old flat shard paths like `shards/{object_id}/shard_0.data` are not created
- normal download restores the original object from hot data shards
- normal download still succeeds when cold parity is missing
- recovery rebuilds one missing data shard back into `hot/`
- recovered download checksum matches the original checksum
- recovery fails when two shards are missing
- object delete removes the hot/cold shard directory

Run:

```bash
pnpm typecheck
pnpm test
```
