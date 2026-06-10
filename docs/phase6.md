# 작업 지시: ShardStore Phase 6 Metadata Migration

현재 프로젝트 README, Phase 1 구현 결과, Phase 2 CLI 구현 결과, Phase 3 shard 분할 저장 결과, Phase 4 Reed-Solomon `k=2, m=1` 복구 구현 결과, Phase 5 Storage Tier 흉내 검증 결과 기준으로 ShardStore Phase 6만 진행한다.

## 목표

Node.js + TypeScript 기반 ShardStore에서 기존 Phase 1 metadata를 현재 활성 metadata schema 구조로 변환하는 Metadata Migration을 구현한다.

Phase 6에서는 새로운 저장 정책을 만들지 않는다.

Phase 6에서는 새로운 erasure coding 알고리즘을 구현하지 않는다.

Phase 6에서는 Phase 4/5에서 구현된 Reed-Solomon `k=2, m=1` 저장 구조를 기준으로 migration 결과 metadata와 shard 파일을 생성한다.

Phase 6의 목표는 다음 구조와 흐름이 실제로 만족되는지 확인하고, 부족한 부분만 최소 범위로 구현하는 것이다.

```text
schema_version: 1
objects/{object_id}.data

→ migration

schema_version: 3
storage_type: erasure_coded
shards/{object_id}/hot/shard_0.data
shards/{object_id}/hot/shard_1.data
shards/{object_id}/cold/parity_0.data
```

완료 기준은 명확하다.

```text
기존 metadata JSON을 삭제하지 않고 backup한 뒤,
schema_version: 3 erasure_coded metadata로 변환된 metadata를 생성할 수 있다.
```

Phase 6에서는 `schema_version: 2` sharded 구조로 migration하지 않는다.

Phase 6에서는 flat shard path를 생성하지 않는다.

```text
shards/{object_id}/shard_0.data
shards/{object_id}/shard_1.data
shards/{object_id}/shard_2.data
```

위 구조는 Phase 3 단순 shard 구조이므로 Phase 6 migration 결과로 생성되면 안 된다.

기존 HTTP API 경로와 Phase 2 CLI 명령은 유지해야 한다.

CLI는 내부 metadata migration 구조를 몰라도 기존 명령으로 object metadata 조회, 다운로드, 목록 조회, 삭제를 수행할 수 있어야 한다.

---

## 구현 범위

구현 또는 검증할 기능:

* metadata `schema_version` 기준 migration 대상 판별
* 기존 Phase 1 `schema_version: 1` metadata migration
* `schema_version: 2` metadata skip
* `schema_version: 3` metadata skip
* `schema_version`이 없거나 지원하지 않는 metadata 실패 또는 unsupported 처리
* 기존 Phase 1 metadata의 `storage_path` 검증
* 기존 Phase 1 object 파일 `objects/{object_id}.data` 존재 여부 확인
* migration 전 원본 object 파일 SHA-256 checksum 계산
* metadata의 `checksum`과 실제 object 파일 checksum 비교
* checksum 불일치 시 migration 실패 처리
* migration dry-run 지원
* dry-run 실행 시 실제 파일 변경 금지
* dry-run 실행 시 backup 생성 금지
* dry-run 실행 시 metadata 변경 금지
* dry-run 실행 시 data shard 생성 금지
* dry-run 실행 시 parity shard 생성 금지
* 실제 migration 전 기존 metadata JSON backup 생성
* 기존 metadata JSON을 삭제하지 않음
* 기존 source object 파일 `objects/{object_id}.data`를 삭제하지 않음
* 기존 Reed-Solomon `k=2, m=1` encode 로직 재사용
* migration 성공 시 data shard 2개 생성
* migration 성공 시 parity shard 1개 생성
* data shard는 `shards/{object_id}/hot/` 아래에 저장
* parity shard는 `shards/{object_id}/cold/` 아래에 저장
* data shard 파일명은 `shard_{index}.data` 형식 사용
* parity shard 파일명은 `parity_0.data` 형식 사용
* metadata의 parity shard `index`는 전체 shard index 기준으로 `2` 사용
* migration 결과 metadata에 `schema_version: 3` 저장
* migration 결과 metadata에 `storage_type: "erasure_coded"` 저장
* migration 결과 metadata에 Reed-Solomon coding 정보 저장
* migration 결과 metadata에 shard 목록 저장
* 각 shard metadata에 `index`, `role`, `tier`, `path`, `size`, `checksum` 저장
* data shard metadata의 `role`은 `data`
* data shard metadata의 `tier`는 `hot`
* parity shard metadata의 `role`은 `parity`
* parity shard metadata의 `tier`는 `cold`
* migration 결과 report를 JSON으로 출력
* migration 실패 시 기존 metadata 유지
* migration 실패 시 source object 파일 유지
* migration 성공 후 기존 object 다운로드 API로 다운로드 가능
* migration 성공 후 다운로드 파일 checksum과 원본 checksum 일치
* migration 성공 후 data shard 1개 손실 시 cold parity shard를 사용해 복구 가능
* 복구된 data shard는 원래 metadata path 기준으로 `hot/` 아래에 재생성
* 복원 시 원본 size 기준으로 padding 제거
* 복원 결과의 SHA-256 checksum을 metadata checksum과 비교
* shard 2개 이상 손실 시 복구 실패
* 기존 Bucket API 유지
* 기존 Object API 경로 유지
* 기존 Phase 2 CLI 명령 동작 유지
* 자동 테스트가 있다면 Metadata Migration 검증 기준으로 수정 또는 추가

구현하지 않을 기능:

* Reed-Solomon 알고리즘 신규 구현
* 기존 erasure coding 알고리즘 변경
* 기존 recovery 정책 변경
* `k=4, m=2` 확장 구현
* shard 2개 손실 복구 성공 처리
* `schema_version: 2` → `schema_version: 3` migration
* Phase 3 flat sharded metadata migration
* TCP Socket FTP 스타일 서버/클라이언트
* 시간 기반 tier 이동
* 접근 빈도 기반 tier 이동
* hot-to-cold 자동 이동
* cold-to-hot 자동 승격
* lifecycle policy
* 실제 S3 Storage Class 정책
* 새로운 Object API 추가
* 기존 Object API 경로 변경
* 기존 Phase 2 CLI 명령 변경
* DB 사용
* Docker 사용
* README 전체 재작성

---

## 기술 조건

* Language: Node.js + TypeScript
* Package manager: pnpm
* HTTP Server: Express
* File upload: multer
* Object ID: Node.js 내장 `crypto.randomUUID()`
* Checksum: SHA-256
* Metadata: JSON file
* Storage: Local filesystem
* Erasure coding: 기존 Phase 4 Reed-Solomon `k=2, m=1` 구현 재사용
* Data shards: `2`
* Parity shards: `1`
* Total shards: `3`
* Recoverable shard loss: `1`
* data shard 위치: `hot/`
* parity shard 위치: `cold/`
* migration source schema: `schema_version: 1`
* migration target schema: `schema_version: 3`
* DB 사용 금지
* Docker 사용 금지
* uuid 패키지 사용 금지
* Phase 2 CLI 명령 변경 최소화

Phase 6는 새 의존성 추가가 필요하지 않아야 한다.

`package.json`, `pnpm-lock.yaml`이 변경된다면 먼저 변경 이유를 확인한다.

단, migration 실행 script 추가 목적의 `package.json` 변경은 허용한다.

예상 script:

```json
{
  "scripts": {
    "migration:metadata": "tsx src/modules/migration/metadata-migration.cli.ts"
  }
}
```

---

## 저장 구조

Phase 1에서는 object를 shard로 분할하지 않고 원본 파일 단위로 저장했다.

Phase 6에서는 이 legacy object를 현재 활성 저장 구조인 Phase 4/5 erasure coded hot/cold 구조로 변환한다.

### Migration 전 구조

```text
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   └── objects/
        │       └── {object_id}.json
        └── objects/
            └── {object_id}.data
```

파일명 기준:

| 종류                  | 저장 위치               | 파일명                |
| ------------------- | ------------------- | ------------------ |
| Phase 1 metadata    | `metadata/objects/` | `{object_id}.json` |
| Phase 1 object file | `objects/`          | `{object_id}.data` |

사용자 object key는 저장 경로로 사용하지 않는다.

내부 저장 경로에는 반드시 `object_id`를 사용한다.

### Migration 후 구조

```text
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   ├── objects/
        │   │   └── {object_id}.json
        │   └── backups/
        │       └── migration/
        │           └── {timestamp}/
        │               └── {object_id}.json
        ├── objects/
        │   └── {object_id}.data
        └── shards/
            └── {object_id}/
                ├── hot/
                │   ├── shard_0.data
                │   └── shard_1.data
                └── cold/
                    └── parity_0.data
```

파일명 기준:

| shard 종류       | 저장 위치                      | 파일명             |
| -------------- | -------------------------- | --------------- |
| data shard 0   | `shards/{object_id}/hot/`  | `shard_0.data`  |
| data shard 1   | `shards/{object_id}/hot/`  | `shard_1.data`  |
| parity shard 0 | `shards/{object_id}/cold/` | `parity_0.data` |

Phase 6에서는 아래 Phase 3 단순 shard 구조가 생성되면 안 된다.

```text
data/buckets/{bucket_name}/shards/{object_id}/shard_0.data
data/buckets/{bucket_name}/shards/{object_id}/shard_1.data
data/buckets/{bucket_name}/shards/{object_id}/shard_2.data
```

Phase 6에서는 migration 후에도 기존 원본 파일을 삭제하지 않는다.

```text
data/buckets/{bucket_name}/objects/{object_id}.data
```

---

## Metadata Migration 기준

Phase 6의 migration 의미는 다음과 같다.

```text
Phase 1 legacy metadata + source object file
→ checksum 검증
→ metadata backup
→ 기존 erasure encode 로직 재사용
→ hot/cold shard 생성
→ schema_version: 3 metadata 생성
```

Phase 6에서 migration 대상은 `schema_version: 1`만이다.

Phase 6에서 `schema_version: 2`는 skip한다.

Phase 6에서 `schema_version: 3`은 skip한다.

Migration 결과는 반드시 현재 활성 schema인 `schema_version: 3` erasure coded 구조다.

Phase 6에서 `schema_version: 2` sharded 구조를 migration 결과로 만들면 안 된다.

---

## Schema Version 기준

Phase 1 metadata는 원본 파일 저장 구조다.

```json
{
  "schema_version": 1,
  "storage_path": "objects/{object_id}.data"
}
```

Phase 3 metadata는 단순 shard 저장 구조다.

```json
{
  "schema_version": 2,
  "storage_type": "sharded",
  "shard_count": 3,
  "shards": []
}
```

Phase 4 이후 metadata는 erasure coding 저장 구조다.

```json
{
  "schema_version": 3,
  "storage_type": "erasure_coded",
  "coding": {},
  "shards": []
}
```

Phase 6 기준 처리 방식:

| schema_version | 처리                    |
| -------------- | --------------------- |
| `1`            | migration 대상          |
| `2`            | skip                  |
| `3`            | skip                  |
| 없음             | failed 또는 unsupported |
| 기타 값           | failed 또는 unsupported |

기존 `schema_version: 2` object의 migration은 Phase 6 MVP 범위가 아니다.

Phase 6 검증은 기존 Phase 1 `schema_version: 1` metadata를 준비한 뒤 수행한다.

---

## Source Metadata 구조

Migration 대상 metadata는 아래 구조를 가져야 한다.

```json
{
  "schema_version": 1,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "original_file_name": "sample.png",
  "content_type": "image/png",
  "size": 253811,
  "checksum": "sha256...",
  "storage_path": "objects/{object_id}.data",
  "created_at": "2026-06-06T12:00:00Z"
}
```

확인 기준:

```text
schema_version: 1
object_id 존재
bucket 존재
key 존재
size 존재
checksum 존재
storage_path 존재
storage_path가 objects/{object_id}.data 형식
objects/{object_id}.data 파일 존재
metadata checksum과 source object 파일 checksum 일치
storage_type 없음
coding 없음
shards 없음
```

---

## Target Metadata 구조

Migration 성공 시 metadata JSON은 아래 구조를 가져야 한다.

```json
{
  "schema_version": 3,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "original_file_name": "sample.png",
  "content_type": "image/png",
  "size": 253811,
  "checksum": "sha256...",
  "storage_type": "erasure_coded",
  "coding": {
    "algorithm": "reed-solomon",
    "data_shards": 2,
    "parity_shards": 1,
    "total_shards": 3,
    "recoverable_shard_loss": 1
  },
  "shards": [
    {
      "index": 0,
      "role": "data",
      "tier": "hot",
      "path": "shards/{object_id}/hot/shard_0.data",
      "size": 126906,
      "checksum": "sha256..."
    },
    {
      "index": 1,
      "role": "data",
      "tier": "hot",
      "path": "shards/{object_id}/hot/shard_1.data",
      "size": 126905,
      "checksum": "sha256..."
    },
    {
      "index": 2,
      "role": "parity",
      "tier": "cold",
      "path": "shards/{object_id}/cold/parity_0.data",
      "size": 126906,
      "checksum": "sha256..."
    }
  ],
  "migrated_from_schema_version": 1,
  "migrated_at": "2026-06-10T12:00:00Z",
  "created_at": "2026-06-06T12:00:00Z"
}
```

확인 기준:

```text
schema_version: 3
storage_type: erasure_coded
coding.algorithm: reed-solomon
coding.data_shards: 2
coding.parity_shards: 1
coding.total_shards: 3
coding.recoverable_shard_loss: 1
shards 배열 존재
각 shard index 존재
각 shard role 존재
각 shard tier 존재
각 shard path 존재
각 shard size 존재
각 shard checksum 존재
data shard 2개 존재
parity shard 1개 존재
data shard role: data
data shard tier: hot
parity shard role: parity
parity shard tier: cold
data shard path: shards/{object_id}/hot/shard_*.data
parity shard path: shards/{object_id}/cold/parity_0.data
migrated_from_schema_version: 1
migrated_at 존재
```

---

## Backup 기준

Phase 6에서는 실제 migration 전에 기존 metadata JSON을 backup한다.

Backup 경로는 bucket 내부 metadata 디렉토리 아래에 둔다.

```text
data/buckets/{bucket_name}/metadata/backups/migration/{timestamp}/{object_id}.json
```

backup 파일은 migration 전 기존 metadata JSON과 동일해야 한다.

확인 기준:

```text
backup 파일 존재
backup metadata의 schema_version이 1
backup metadata의 storage_path가 objects/{object_id}.data
backup metadata의 checksum이 migration 전 값과 동일
backup metadata가 migration 전 원본 metadata와 동일
```

Backup 생성 실패 시 해당 object의 migration은 중단한다.

Backup이 성공하기 전에는 metadata를 덮어쓰면 안 된다.

---

## Dry-run 기준

Phase 6는 dry-run을 지원한다.

Dry-run은 migration 가능 여부와 migration preview를 확인하는 기능이다.

Dry-run에서는 실제 파일 변경이 없어야 한다.

Dry-run에서 수행할 작업:

```text
metadata 파일 목록 조회
schema_version 확인
schema_version: 1 migration 대상 판별
storage_path 검증
source object 파일 존재 여부 확인
source object checksum 계산
metadata checksum과 source object checksum 비교
생성 예정 target schema preview
생성 예정 hot/cold shard path preview
JSON report 출력
```

Dry-run에서 하지 않을 작업:

```text
backup 생성
metadata overwrite
data shard 생성
parity shard 생성
source object 파일 삭제
legacy metadata 삭제
```

Dry-run 실행 예시:

```bash
pnpm migration:metadata --dry-run
```

Dry-run report 예시:

```json
{
  "dry_run": true,
  "scanned": 3,
  "migratable": 1,
  "skipped": 2,
  "failed": 0,
  "items": [
    {
      "object_id": "uuid",
      "bucket": "photo-bucket",
      "key": "2026/06/sample.png",
      "from_schema_version": 1,
      "to_schema_version": 3,
      "to_storage_type": "erasure_coded",
      "status": "migratable",
      "planned_shards": [
        {
          "index": 0,
          "role": "data",
          "tier": "hot",
          "path": "shards/{object_id}/hot/shard_0.data"
        },
        {
          "index": 1,
          "role": "data",
          "tier": "hot",
          "path": "shards/{object_id}/hot/shard_1.data"
        },
        {
          "index": 2,
          "role": "parity",
          "tier": "cold",
          "path": "shards/{object_id}/cold/parity_0.data"
        }
      ]
    }
  ]
}
```

확인 기준:

```text
dry_run: true
from_schema_version: 1
to_schema_version: 3
to_storage_type: erasure_coded
planned shard path가 hot/cold 구조
backup 디렉토리 미생성
metadata 파일 미변경
data shard 미생성
parity shard 미생성
source object 파일 유지
```

---

## Migration Report 기준

Phase 6 migration 실행 결과는 JSON report로 출력한다.

실제 migration 실행 예시:

```bash
pnpm migration:metadata
```

Migration report 예시:

```json
{
  "dry_run": false,
  "scanned": 5,
  "migrated": 2,
  "skipped": 2,
  "failed": 1,
  "backup_dir": "data/buckets/photo-bucket/metadata/backups/migration/2026-06-10T12-00-00-000Z",
  "items": [
    {
      "object_id": "uuid-1",
      "bucket": "photo-bucket",
      "key": "2026/06/sample.png",
      "from_schema_version": 1,
      "to_schema_version": 3,
      "to_storage_type": "erasure_coded",
      "status": "migrated",
      "created_shards": [
        {
          "index": 0,
          "role": "data",
          "tier": "hot",
          "path": "shards/{object_id}/hot/shard_0.data"
        },
        {
          "index": 1,
          "role": "data",
          "tier": "hot",
          "path": "shards/{object_id}/hot/shard_1.data"
        },
        {
          "index": 2,
          "role": "parity",
          "tier": "cold",
          "path": "shards/{object_id}/cold/parity_0.data"
        }
      ]
    },
    {
      "object_id": "uuid-2",
      "bucket": "photo-bucket",
      "key": "2026/06/legacy-sharded.png",
      "schema_version": 2,
      "status": "skipped",
      "reason": "unsupported migration source schema"
    },
    {
      "object_id": "uuid-3",
      "bucket": "photo-bucket",
      "key": "2026/06/already-current.png",
      "schema_version": 3,
      "status": "skipped",
      "reason": "already current schema"
    },
    {
      "object_id": "uuid-4",
      "bucket": "photo-bucket",
      "key": "2026/06/broken.png",
      "schema_version": 1,
      "status": "failed",
      "reason": "checksum mismatch"
    }
  ]
}
```

확인 기준:

```text
dry_run 여부 출력
scanned 개수 출력
migrated 개수 출력
skipped 개수 출력
failed 개수 출력
각 item의 status 출력
migration 성공 item에 from_schema_version: 1 출력
migration 성공 item에 to_schema_version: 3 출력
migration 성공 item에 to_storage_type: erasure_coded 출력
skip item에 reason 출력
failed item에 reason 출력
```

---

## 실패 처리 기준

다음 상황에서는 migration을 실패 처리하고 기존 metadata를 유지한다.

| 실패 상황                 | 처리                             |
| --------------------- | ------------------------------ |
| metadata JSON 파싱 실패   | 실패 report 출력, 원본 유지            |
| schema_version 없음     | failed 또는 unsupported 처리       |
| schema_version이 1이 아님 | skip                           |
| storage_path 없음       | 실패 report 출력, 원본 유지            |
| source object 파일 없음   | 실패 report 출력, 원본 유지            |
| checksum 불일치          | 실패 report 출력, 원본 유지            |
| backup 생성 실패          | migration 중단, 원본 유지            |
| erasure encode 실패     | 실패 report 출력, 원본 유지            |
| data shard 생성 실패      | 실패 report 출력, 원본 유지            |
| parity shard 생성 실패    | 실패 report 출력, 원본 유지            |
| 새 metadata 생성 실패      | 실패 report 출력, backup 유지, 원본 유지 |

checksum 불일치 예시:

```json
{
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "status": "failed",
  "reason": "checksum mismatch",
  "expected_checksum": "metadata-sha256",
  "actual_checksum": "actual-file-sha256"
}
```

source object 파일 누락 예시:

```json
{
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/missing.png",
  "status": "failed",
  "reason": "source object file not found",
  "storage_path": "objects/{object_id}.data"
}
```

실패 시 확인 기준:

```text
기존 metadata JSON 유지
기존 metadata 내용 변경 없음
source object 파일 유지
schema_version: 3 metadata 생성 안 됨
data shard 생성 안 됨
parity shard 생성 안 됨
실패 item을 migrated로 보고하지 않음
```

---

## API

외부 HTTP API 경로는 변경하지 않는다.

### Bucket 생성

```http
PUT /buckets/:bucketName
```

기존 동작을 유지한다.

### Bucket 단건 조회

```http
GET /buckets/:bucketName
```

기존 동작을 유지한다.

### Bucket 목록 조회

```http
GET /buckets
```

기존 동작을 유지한다.

### Object 업로드

```http
PUT /buckets/:bucketName/objects?key=2026/06/sample.png
Content-Type: multipart/form-data
```

기존 동작을 유지한다.

Phase 6는 object 업로드 API를 새로 바꾸는 단계가 아니다.

새로 업로드되는 object는 기존 Phase 4/5 기준대로 `schema_version: 3` erasure coded metadata와 hot/cold shard 구조를 사용해야 한다.

### Object metadata 조회

```http
GET /buckets/:bucketName/objects/metadata?key=2026/06/sample.png
```

migration 후 metadata 조회 시 erasure coding 정보와 shard tier 정보가 포함되어야 한다.

확인 기준:

```text
schema_version: 3
storage_type: erasure_coded
coding.algorithm: reed-solomon
coding.data_shards: 2
coding.parity_shards: 1
coding.total_shards: 3
coding.recoverable_shard_loss: 1
shards
shards[].index
shards[].role
shards[].tier
shards[].path
shards[].size
shards[].checksum
data shard tier: hot
parity shard tier: cold
migrated_from_schema_version: 1
migrated_at
```

### Object 다운로드

```http
GET /buckets/:bucketName/objects?key=2026/06/sample.png
```

migration 후 다운로드 내부 동작은 기존 Phase 5 기준을 따른다.

```text
metadata 조회
→ hot/ data shard 상태 확인
→ data shard 2개가 모두 있으면 data shard를 index 순서로 병합
→ 정상 다운로드에서는 cold parity shard를 필수로 읽지 않음
→ 원본 size 기준으로 padding 제거
→ 병합 결과 SHA-256 계산
→ metadata checksum과 비교
→ 일치하면 response로 반환
```

checksum이 불일치하면 파일을 내려주지 않고 500 JSON 에러를 반환한다.

### Object 목록 조회

```http
GET /buckets/:bucketName/objects
```

기존 응답 형식은 유지한다.

### Object 삭제

```http
DELETE /buckets/:bucketName/objects?key=2026/06/sample.png
```

기존 동작을 유지한다.

삭제 대상:

```text
metadata/objects/{object_id}.json
shards/{object_id}/
```

Phase 6에서 source object 파일 `objects/{object_id}.data`를 migration 후에도 유지했다면, object 삭제 시 해당 legacy source object 파일 삭제 여부는 기존 구현 정책을 따른다.

단, migration 후 활성 metadata가 `schema_version: 3`이면 object 삭제 시 metadata JSON과 `shards/{object_id}/`는 반드시 삭제되어야 한다.

### Recovery API

Phase 6 검증에서는 기존 Phase 4/5 recovery API를 사용한다.

```http
POST /debug/objects/:objectId/recover
```

Phase 6 기준 핵심 동작:

```text
migration된 schema_version: 3 metadata 조회
→ hot/ data shard 존재 여부 검사
→ cold/ parity shard 존재 여부 검사
→ data shard 1개가 손실되었으면 cold parity shard로 복구
→ 복구된 data shard는 hot/에 저장
→ 원본 object checksum 검증
```

data shard 복구 응답 예시:

```json
{
  "object_id": "uuid",
  "recovered": true,
  "recovered_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/{object_id}/hot/shard_1.data"
    }
  ],
  "checksum_matched": true
}
```

---

## CLI

기존 Phase 2 CLI 명령은 유지한다.

새로운 object CLI 명령을 추가하지 않는다.

기존 CLI 명령:

```text
bucket:create
bucket:get
bucket:list
object:put
object:meta
object:get
object:list
object:delete
```

Phase 6 migration 실행은 별도 script로 처리한다.

예상 실행 방식:

```bash
pnpm migration:metadata --dry-run
pnpm migration:metadata
```

`pnpm cli` 기존 명령이 깨지면 안 된다.

CLI는 migration 내부 구조를 몰라도 된다.

---

## 예상 프로젝트 구조

Phase 6 완료 후 예상 구조는 기존 Phase 5 구조에 migration 모듈이 추가된 형태다.

```text
shardstore/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── cli.ts
│   ├── routes/
│   │   ├── bucket.routes.ts
│   │   ├── object.routes.ts
│   │   └── debug.routes.ts
│   ├── modules/
│   │   ├── bucket/
│   │   │   ├── bucket.controller.ts
│   │   │   ├── bucket.service.ts
│   │   │   └── bucket.types.ts
│   │   ├── object/
│   │   │   ├── object.controller.ts
│   │   │   ├── object.service.ts
│   │   │   └── object.types.ts
│   │   ├── metadata/
│   │   │   ├── metadata.repository.ts
│   │   │   └── metadata.types.ts
│   │   ├── storage/
│   │   │   ├── local-storage.ts
│   │   │   └── storage.types.ts
│   │   ├── checksum/
│   │   │   └── sha256.ts
│   │   ├── cli/
│   │   │   ├── cli-http.ts
│   │   │   └── cli-output.ts
│   │   ├── shard/
│   │   │   ├── shard.service.ts
│   │   │   └── shard.types.ts
│   │   ├── erasure/
│   │   │   ├── erasure.service.ts
│   │   │   └── erasure.types.ts
│   │   ├── debug/
│   │   │   ├── debug.controller.ts
│   │   │   └── debug.service.ts
│   │   └── migration/
│   │       ├── metadata-migration.cli.ts
│   │       ├── metadata-migration.service.ts
│   │       └── metadata-migration.types.ts
│   └── shared/
│       ├── errors.ts
│       ├── async-handler.ts
│       └── validation.ts
├── data/
│   └── .gitkeep
├── testdata/
│   └── .gitkeep
├── ftp-data/
│   └── .gitkeep
├── docs/
│   ├── phase2.md
│   ├── phase3.md
│   ├── phase4.md
│   ├── phase5.md
│   └── phase6.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

Phase 6에서는 아래 경로를 만들지 않는다.

```text
experiments/ftp-socket/
```

---

## 구현 주의사항

* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Bucket API 동작을 변경하지 않는다.
* 기존 Object API 동작을 불필요하게 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 유지한다.
* 새로운 object CLI 명령을 추가하지 않는다.
* migration 실행은 별도 script로 분리한다.
* migration 로직은 object service에 섞지 않는다.
* migration 로직은 `src/modules/migration/**` 아래에 분리한다.
* migration 대상은 `schema_version: 1`만 처리한다.
* `schema_version: 2`는 skip한다.
* `schema_version: 3`은 skip한다.
* migration 결과는 반드시 `schema_version: 3`이다.
* migration 결과 `storage_type`은 반드시 `erasure_coded`이다.
* migration 결과로 `storage_type: sharded`를 만들지 않는다.
* migration 결과로 `shard_count` 중심 metadata를 만들지 않는다.
* migration 결과로 flat shard path를 만들지 않는다.
* 사용자 object key는 실제 파일 경로로 사용하지 않는다.
* 내부 저장 경로는 반드시 `object_id` 기준으로 구성한다.
* data shard는 `shards/{object_id}/hot/shard_{index}.data` 구조로 저장한다.
* parity shard는 `shards/{object_id}/cold/parity_0.data` 구조로 저장한다.
* data shard index는 0, 1을 사용한다.
* parity shard metadata index는 2를 사용한다.
* metadata의 shard path는 bucket 디렉토리 기준 상대 경로로 저장한다.
* metadata에 `role: data | parity`를 저장한다.
* metadata에 `tier: hot | cold`를 저장한다.
* migration 전 source object checksum을 반드시 검증한다.
* checksum 불일치 시 migration을 진행하지 않는다.
* backup 생성 전 metadata를 덮어쓰지 않는다.
* backup 실패 시 migration을 중단한다.
* dry-run에서는 파일을 변경하지 않는다.
* dry-run에서는 backup을 생성하지 않는다.
* dry-run에서는 shard를 생성하지 않는다.
* dry-run에서는 metadata를 변경하지 않는다.
* migration 실패 시 기존 metadata를 유지한다.
* migration 실패 시 source object 파일을 유지한다.
* 정상 다운로드 시 hot data shard를 index 순서로 병합한다.
* 정상 다운로드 시 cold parity shard를 필수로 읽지 않는다.
* parity shard는 원본 response에 포함하지 않는다.
* data shard 손실 복구 시 cold parity shard를 사용한다.
* data shard 복구 결과는 `hot/`에 저장한다.
* 복원 시 metadata의 원본 `size` 기준으로 padding을 제거한다.
* 병합 결과 checksum이 metadata checksum과 다르면 500 JSON 에러를 반환한다.
* Reed-Solomon을 새로 구현하지 않는다.
* 기존 erasure encode 로직 재사용만 허용한다.
* 기존 erasure 알고리즘을 변경하지 않는다.
* 기존 recovery 정책을 변경하지 않는다.
* k=4 m=2 확장 구현은 하지 않는다.
* 시간 기반 tier 이동은 구현하지 않는다.
* 접근 빈도 기반 tier 이동은 구현하지 않는다.
* hot-to-cold 자동 이동은 구현하지 않는다.
* cold-to-hot 자동 승격은 구현하지 않는다.
* lifecycle policy는 구현하지 않는다.
* 실제 S3 Storage Class 정책은 구현하지 않는다.
* TCP Socket 코드는 구현하지 않는다.
* README.md는 전체 재작성하지 않는다.
* 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.

---

## 허용 변경 파일

우선 허용:

```text
package.json
src/modules/migration/**
src/modules/metadata/**
src/modules/storage/**
src/modules/shard/**
src/modules/checksum/**
src/shared/*
src/app.test.ts
docs/phase6.md
```

조건부 허용:

```text
src/modules/erasure/**
```

허용 기준:

```text
기존 erasure encode 로직 재사용을 위한 import/export 조정만 허용한다.
Reed-Solomon 알고리즘 변경은 승인하지 않는다.
DATA_SHARDS, PARITY_SHARDS, TOTAL_SHARDS 값 변경은 승인하지 않는다.
복구 정책 변경은 승인하지 않는다.
```

필요하면 최소 범위로 수정 가능:

```text
src/modules/storage/local-storage.ts
src/modules/storage/storage.types.ts
src/modules/metadata/metadata.repository.ts
src/modules/metadata/metadata.types.ts
```

테스트 수정 또는 추가 가능:

```text
src/app.test.ts
```

주의해서 확인할 파일:

```text
package.json
pnpm-lock.yaml
src/cli.ts
src/modules/cli/*
src/server.ts
src/app.ts
src/routes/*
src/modules/bucket/*
src/modules/object/*
src/modules/debug/*
```

`package.json`은 migration script 추가 목적이면 허용한다.

`pnpm-lock.yaml`은 Phase 6에서 새 의존성이 필요하지 않아야 하므로 변경되면 이유를 먼저 확인한다.

`src/cli.ts`, `src/modules/cli/*`는 기존 CLI 호환을 위한 최소 수정만 허용한다.

새 object CLI 명령 추가는 하지 않는다.

`src/modules/object/*`, `src/modules/debug/*`는 기존 API와 recovery 동작을 바꾸는 수정이면 승인하지 않는다.

---

## 금지 변경 파일 또는 경로

```text
experiments/ftp-socket/**
FTP Socket 서버/클라이언트 코드
README.md 전체 재작성
k=4 m=2 확장 구현
시간 기반 tier 이동 관련 코드
접근 빈도 기반 tier 이동 관련 코드
hot-to-cold 자동 이동 코드
cold-to-hot 자동 승격 코드
lifecycle policy 관련 코드
실제 S3 Storage Class 정책 관련 코드
Reed-Solomon 알고리즘 재구현
기존 erasure recovery 정책 변경
기존 HTTP API 경로 변경
기존 Phase 2 CLI 명령 변경
```

---

## 검증 명령

### 의존성 설치

```bash
pnpm install
```

### 타입 검증

```bash
pnpm typecheck
```

### 자동 테스트

```bash
pnpm test
```

### 서버 실행

```bash
pnpm dev
```

정상 실행 로그:

```text
ShardStore server listening on http://localhost:8080
```

### 테스트 파일 준비

```bash
cp /path/to/sample.png testdata/sample.png
```

Windows PowerShell:

```powershell
Copy-Item "C:\path\to\sample.png" ".\testdata\sample.png"
```

---

## Phase 1 legacy metadata 준비

Migration 검증을 위해 `schema_version: 1` metadata와 source object 파일을 준비한다.

기준 구조:

```text
data/buckets/photo-bucket/
  metadata/objects/{object_id}.json
  objects/{object_id}.data
```

metadata 예시:

```json
{
  "schema_version": 1,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "original_file_name": "sample.png",
  "content_type": "image/png",
  "size": 253811,
  "checksum": "sha256...",
  "storage_path": "objects/{object_id}.data",
  "created_at": "2026-06-10T12:00:00Z"
}
```

확인 기준:

```text
schema_version: 1
storage_path 존재
objects/{object_id}.data 파일 존재
metadata checksum과 object 파일 checksum 일치
```

---

## Dry-run 검증

```bash
pnpm migration:metadata --dry-run
```

기대 결과:

```text
dry_run: true
from_schema_version: 1
to_schema_version: 3
to_storage_type: erasure_coded
status: migratable
```

확인 기준:

```text
migration 대상 object 확인
planned shard 경로가 hot/cold 구조로 출력
backup 디렉토리 생성 안 됨
metadata 파일 변경 안 됨
data shard 생성 안 됨
parity shard 생성 안 됨
objects/{object_id}.data 삭제 안 됨
```

PowerShell 확인:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\metadata\backups -Recurse
Get-ChildItem .\data\buckets\photo-bucket\shards -Recurse
```

dry-run 후에는 backup과 shard가 없어야 한다.

---

## 실제 Migration 실행

```bash
pnpm migration:metadata
```

기대 결과:

```json
{
  "dry_run": false,
  "scanned": 1,
  "migrated": 1,
  "skipped": 0,
  "failed": 0
}
```

확인 기준:

```text
기존 metadata backup 생성
schema_version: 3 metadata 생성
storage_type: erasure_coded 저장
coding 정보 저장
data shard 2개 생성
parity shard 1개 생성
data shard는 hot/ 아래 저장
parity shard는 cold/ 아래 저장
각 shard index/role/tier/path/size/checksum 저장
migration report 출력
```

---

## Backup 확인

PowerShell:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\metadata\backups -Recurse
```

확인 기준:

```text
migration 전 metadata JSON backup 존재
backup metadata의 schema_version이 1
backup metadata의 storage_path가 objects/{object_id}.data
backup metadata의 checksum이 migration 전 값과 동일
backup metadata가 migration 전 원본 metadata와 동일
```

---

## hot/cold shard 파일 생성 확인

PowerShell:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards\{object_id} -Recurse
```

기대 구조:

```text
data/buckets/photo-bucket/shards/{object_id}/hot/shard_0.data
data/buckets/photo-bucket/shards/{object_id}/hot/shard_1.data
data/buckets/photo-bucket/shards/{object_id}/cold/parity_0.data
```

확인 기준:

```text
hot/ 아래 data shard 2개 존재
cold/ 아래 parity shard 1개 존재
총 shard 3개 존재
```

---

## Phase 3 단순 shard 구조 미사용 확인

Phase 6에서는 아래 구조가 생성되면 안 된다.

```text
data/buckets/photo-bucket/shards/{object_id}/shard_0.data
data/buckets/photo-bucket/shards/{object_id}/shard_1.data
data/buckets/photo-bucket/shards/{object_id}/shard_2.data
```

PowerShell:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{object_id}\shard_0.data
Test-Path .\data\buckets\photo-bucket\shards\{object_id}\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{object_id}\shard_2.data
```

기대 결과:

```text
False
False
False
```

---

## Metadata 조회

```bash
pnpm cli object:meta photo-bucket 2026/06/sample.png
```

확인 기준:

```text
schema_version: 3
storage_type: erasure_coded
coding.algorithm: reed-solomon
coding.data_shards: 2
coding.parity_shards: 1
coding.total_shards: 3
coding.recoverable_shard_loss: 1
shards 배열 존재
각 shard index 존재
각 shard role 존재
각 shard tier 존재
각 shard path 존재
각 shard size 존재
각 shard checksum 존재
data shard 2개 존재
parity shard 1개 존재
data shard tier: hot
parity shard tier: cold
data shard path: shards/{object_id}/hot/shard_*.data
parity shard path: shards/{object_id}/cold/parity_0.data
migrated_from_schema_version: 1
migrated_at 존재
```

---

## Migration 후 다운로드

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored-after-migration.png
```

기대 결과:

```text
restored-after-migration.png 생성
downloaded: true
```

---

## Checksum 비교

Linux/macOS/Git Bash:

```bash
sha256sum testdata/sample.png
sha256sum restored-after-migration.png
```

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-after-migration.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 migration 후 다운로드 파일의 SHA-256 checksum이 일치한다.
```

---

## data shard 손실 후 cold parity 복구 검증

검증용 migrated object에서 data shard를 직접 삭제한다.

PowerShell:

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\{object_id}\hot\shard_1.data
```

삭제 상태를 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{object_id}\hot\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{object_id}\cold\parity_0.data
```

기대 결과:

```text
hot/shard_1.data: False
cold/parity_0.data: True
```

### Recovery API 실행

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{object_id}/recover"
```

기대 결과:

```json
{
  "object_id": "uuid",
  "recovered": true,
  "recovered_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/{object_id}/hot/shard_1.data"
    }
  ],
  "checksum_matched": true
}
```

복구 후 파일 상태 확인:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards\{object_id} -Recurse
```

기대 결과:

```text
hot/shard_0.data
hot/shard_1.data
cold/parity_0.data
```

### 복구 후 다운로드

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored-after-migration-recovery.png
```

### 복구 후 Checksum 비교

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-after-migration-recovery.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 복구 후 다운로드 파일의 SHA-256 checksum이 일치한다.
```

---

## Skip 케이스 검증

`schema_version: 2` metadata는 migration 대상이 아니다.

```bash
pnpm migration:metadata --dry-run
```

기대 결과:

```text
schema_version: 2 skip
reason: unsupported migration source schema
```

`schema_version: 3` metadata도 migration 대상이 아니다.

```bash
pnpm migration:metadata --dry-run
```

기대 결과:

```text
schema_version: 3 skip
reason: already current schema
```

확인 기준:

```text
기존 metadata 변경 없음
기존 shard 파일 변경 없음
```

---

## Checksum 불일치 실패 검증

검증용 legacy object 파일을 임의로 수정한다.

PowerShell:

```powershell
$target = ".\data\buckets\photo-bucket\objects\{object_id}.data"
[System.IO.File]::AppendAllBytes($target, [byte[]](0, 1, 2, 3))
```

migration을 실행한다.

```bash
pnpm migration:metadata
```

기대 결과:

```json
{
  "status": "failed",
  "reason": "checksum mismatch"
}
```

확인 기준:

```text
checksum mismatch 실패 report 출력
기존 metadata JSON 유지
schema_version: 3 metadata 생성 안 됨
data shard 생성 안 됨
parity shard 생성 안 됨
```

---

## Source object 파일 누락 실패 검증

원본 object 파일이 없는 metadata를 준비한다.

```text
metadata/objects/{object_id}.json 존재
objects/{object_id}.data 없음
```

migration을 실행한다.

```bash
pnpm migration:metadata
```

기대 결과:

```json
{
  "status": "failed",
  "reason": "source object file not found"
}
```

확인 기준:

```text
기존 metadata JSON 유지
schema_version: 3 metadata 생성 안 됨
data shard 생성 안 됨
parity shard 생성 안 됨
```

---

## Object 목록 조회

```bash
pnpm cli object:list photo-bucket
```

기대 결과:

```text
migration된 object key가 목록에 포함된다.
```

---

## Object 삭제

migration 검증용 object를 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample.png
```

삭제 후 shard 디렉토리 확인:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{object_id}
```

기대 결과:

```text
False
```

삭제 후 metadata 조회:

```bash
pnpm cli object:meta photo-bucket 2026/06/sample.png
```

기대 결과:

```text
404 JSON 에러 출력
CLI exit code 1
```

---

## 자동 테스트 기준

자동 테스트가 있다면 `src/app.test.ts`에서 아래 항목을 검증한다.

```text
dry-run에서 schema_version: 1 metadata를 migratable로 판별
dry-run에서 to_schema_version: 3 출력
dry-run에서 to_storage_type: erasure_coded 출력
dry-run에서 backup 미생성
dry-run에서 metadata 미변경
dry-run에서 data shard 미생성
dry-run에서 parity shard 미생성
schema_version: 2 metadata skip
schema_version: 3 metadata skip
source object checksum 검증
checksum mismatch 시 migration 실패
source object 누락 시 migration 실패
실패 시 기존 metadata 유지
성공 시 metadata backup 생성
성공 시 schema_version: 3 metadata 생성
성공 시 storage_type: erasure_coded 저장
성공 시 Reed-Solomon coding 정보 저장
성공 시 hot data shard 2개 생성
성공 시 cold parity shard 1개 생성
성공 시 shard metadata에 index, role, tier, path, size, checksum 저장
flat shard path가 생성되지 않음
migration 후 object 다운로드 성공
다운로드 파일 checksum이 원본 checksum과 일치
data shard 1개 손실 시 cold parity 기반 복구 가능
복구된 data shard가 hot/ 아래 재생성
복구 후 다운로드 checksum이 원본 checksum과 일치
```

---

## 완료 조건

* metadata schema version 기준으로 migration 대상을 판별함
* `schema_version: 1` metadata만 migration 대상으로 처리함
* `schema_version: 2` metadata는 skip함
* `schema_version: 3` metadata는 skip함
* migration 전 source object 파일 존재 여부를 확인함
* migration 전 source object checksum을 metadata checksum과 비교함
* checksum 불일치 시 migration 실패 반환
* source object 파일 누락 시 migration 실패 반환
* dry-run 실행 가능
* dry-run 실행 시 backup 생성 없음
* dry-run 실행 시 metadata 변경 없음
* dry-run 실행 시 data shard 생성 없음
* dry-run 실행 시 parity shard 생성 없음
* 실제 migration 전 기존 metadata JSON backup 생성
* 기존 metadata JSON을 삭제하지 않음
* 기존 source object 파일을 삭제하지 않음
* migration 성공 시 data shard 2개가 생성됨
* migration 성공 시 parity shard 1개가 생성됨
* data shard 2개가 `shards/{object_id}/hot/` 아래에 저장됨
* parity shard 1개가 `shards/{object_id}/cold/` 아래에 저장됨
* Phase 3 단순 shard 구조인 `shards/{object_id}/shard_{index}.data`가 생성되지 않음
* migration 결과 metadata JSON에 `schema_version: 3` 포함
* migration 결과 metadata JSON에 `storage_type: "erasure_coded"` 포함
* migration 결과 metadata JSON에 Reed-Solomon coding 정보 포함
* migration 결과 metadata JSON에 `coding.data_shards: 2` 포함
* migration 결과 metadata JSON에 `coding.parity_shards: 1` 포함
* migration 결과 metadata JSON에 `coding.total_shards: 3` 포함
* migration 결과 metadata JSON에 `coding.recoverable_shard_loss: 1` 포함
* migration 결과 metadata JSON에 `shards` 배열 포함
* 각 shard metadata에 `index`, `role`, `tier`, `path`, `size`, `checksum` 포함
* data shard metadata의 `tier`가 `hot`
* parity shard metadata의 `tier`가 `cold`
* migration 결과 report가 JSON으로 출력됨
* migration 후 CLI로 metadata 조회 가능
* migration 후 CLI로 다운로드 가능
* migration 후 다운로드 파일 checksum이 원본 checksum과 일치
* data shard 1개 손실 시 cold parity shard를 사용해 복구 가능
* data shard 복구 시 `hot/` 아래에 재생성됨
* 복구 후 다운로드한 파일의 SHA-256 checksum이 원본과 일치
* shard 2개 이상 손실 시 복구 실패 반환
* object 삭제 시 metadata JSON과 hot/cold shard 디렉토리 삭제
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* Reed-Solomon 신규 구현 없음
* 기존 erasure algorithm 변경 없음
* 기존 recovery policy 변경 없음
* 시간 기반 tier 이동 코드 없음
* 접근 빈도 기반 tier 이동 코드 없음
* hot-to-cold 자동 이동 코드 없음
* cold-to-hot 자동 승격 코드 없음
* lifecycle policy 코드 없음
* 실제 S3 Storage Class 정책 코드 없음
* FTP socket 코드 없음
* k=4 m=2 확장 구현 없음
* README 전체 재작성 없음
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 6 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

---

## README 처리

README.md는 현재 내용을 유지한다.

Phase 6 작업 중 README 전체 재작성은 하지 않는다.

필요한 경우 Phase 6 migration 실행 명령이나 검증 명령만 최소 수정한다.

docs/phase6.md는 짧은 요약 문서로 축약하지 않는다.

docs/phase6.md는 기존 한국어 상세 문서 구조를 유지한다.

---

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- 기존 Object API 동작이 불필요하게 변경되지 않았는지
- Phase 2 CLI 명령이 그대로 동작하는지
- object CLI 명령을 새로 추가하지 않았는지
- migration 실행 script가 추가됐는지
- metadata schema_version 기준으로 migration 대상을 판별하는지
- schema_version: 1 metadata만 migration 대상으로 처리하는지
- schema_version: 2 metadata는 skip하는지
- schema_version: 3 metadata는 skip하는지
- migration 전 source object 파일 존재 여부를 확인하는지
- migration 전 source object checksum을 metadata checksum과 비교하는지
- checksum 불일치 시 migration 실패를 반환하는지
- source object 파일 누락 시 migration 실패를 반환하는지
- dry-run에서 파일 변경이 발생하지 않는지
- dry-run에서 backup 생성, metadata 변경, data shard 생성, parity shard 생성이 발생하지 않는지
- 실제 migration 전 기존 metadata JSON backup을 생성하는지
- 기존 metadata JSON을 삭제하지 않는지
- 기존 source object 파일을 삭제하지 않는지
- migration 성공 시 schema_version: 3 erasure_coded metadata가 생성되는지
- migration 성공 시 storage_type: erasure_coded가 저장되는지
- migration 성공 시 coding.algorithm: reed-solomon이 저장되는지
- migration 성공 시 coding.data_shards: 2가 저장되는지
- migration 성공 시 coding.parity_shards: 1이 저장되는지
- migration 성공 시 coding.total_shards: 3이 저장되는지
- migration 성공 시 coding.recoverable_shard_loss: 1이 저장되는지
- migration 성공 시 data shard 2개와 parity shard 1개가 생성되는지
- data shard가 shards/{object_id}/hot/shard_*.data에 저장되는지
- parity shard가 shards/{object_id}/cold/parity_0.data에 저장되는지
- Phase 3 단순 shard 구조가 생성되지 않았는지
- shard 저장 경로가 object_id 기준인지
- 사용자 object key를 저장 경로로 사용하지 않았는지
- 각 shard metadata에 index, role, tier, path, size, checksum이 들어가는지
- data shard metadata의 tier가 hot인지
- parity shard metadata의 tier가 cold인지
- migration 결과 report가 JSON으로 출력되는지
- migration 후 object metadata 조회가 가능한지
- migration 후 object 다운로드가 가능한지
- migration 후 다운로드 checksum이 원본과 일치하는지
- data shard 손실 시 cold parity shard를 사용해 복구하는지
- data shard 복구 시 hot/ 아래에 재생성되는지
- 복원 시 padding을 metadata.size 기준으로 제거하는지
- 복원 결과 checksum을 metadata checksum과 비교하는지
- shard 2개 이상 손실 시 복구 실패를 반환하는지
- object 삭제 시 metadata JSON과 hot/cold shard 디렉토리까지 삭제하는지
- metadata를 schema_version: 2 sharded 구조로 migration하지 않았는지
- flat shard path를 만들지 않았는지
- Reed-Solomon을 새로 구현하지 않았는지
- 기존 erasure 알고리즘을 변경하지 않았는지
- 기존 recovery 정책을 변경하지 않았는지
- k=4 m=2 확장 구현을 만들지 않았는지
- 시간 기반 tier 이동이나 접근 빈도 기반 tier 이동을 만들지 않았는지
- hot-to-cold 자동 이동을 만들지 않았는지
- cold-to-hot 자동 승격을 만들지 않았는지
- lifecycle policy를 만들지 않았는지
- FTP socket 코드를 만들지 않았는지
- README.md 전체 재작성 여부가 없는지
- pnpm typecheck가 통과하는지
- 기존 테스트가 있으면 pnpm test가 통과하는지
```
