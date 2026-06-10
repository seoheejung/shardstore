# 작업 지시: ShardStore Phase 5 Storage Tier 흉내 검증

현재 프로젝트 README, Phase 1 구현 결과, Phase 2 CLI 구현 결과, Phase 3 shard 분할 저장 결과, Phase 4 Reed-Solomon `k=2, m=1` 복구 구현 결과 기준으로 ShardStore Phase 5만 진행한다.

## 목표

Node.js + TypeScript 기반 ShardStore에서 Phase 4에 구현된 Reed-Solomon `k=2, m=1` 저장 구조를 기준으로 Storage Tier 흉내를 검증한다.

Phase 5에서는 새로운 erasure coding 알고리즘을 구현하지 않는다.

Phase 5에서는 자동 tier 이동 기능을 구현하지 않는다.

Phase 5의 목표는 다음 구조와 흐름이 실제로 만족되는지 확인하고, 부족한 부분만 최소 범위로 보완하는 것이다.

```text
data shard는 hot/
parity shard는 cold/
정상 다운로드 시 hot data shard 조회
data shard 손실 시 cold parity shard 조회
복구 시 cold parity 사용
```

완료 기준은 명확하다.

```text
hot/cold에 shard가 분리 저장되고, parity shard를 사용한 data shard 복구가 가능하다.
```

MVP에서는 시간 기반 tier 이동을 구현하지 않는다.

hot/cold는 접근 빈도 기반 자동 이동이 아니다.

hot/cold는 data shard와 parity shard를 서로 다른 저장 위치에 배치하는 단순 계층 구조다.

기존 HTTP API 경로와 Phase 2 CLI 명령은 유지해야 한다.

CLI는 내부 hot/cold tier 구조를 몰라도 기존 명령으로 object 업로드, metadata 조회, 다운로드, 목록 조회, 삭제를 수행할 수 있어야 한다.

---

## 구현 범위

구현 또는 검증할 기능:

* Phase 4 Reed-Solomon `k=2, m=1` 구조 유지
* Object 업로드 시 data shard 2개 생성 유지
* Object 업로드 시 parity shard 1개 생성 유지
* data shard는 `shards/{object_id}/hot/` 아래에 저장
* parity shard는 `shards/{object_id}/cold/` 아래에 저장
* data shard 파일명은 `shard_{index}.data` 형식 사용
* parity shard 파일명은 `parity_0.data` 형식 사용
* metadata의 parity shard `index`는 전체 shard index 기준으로 `2` 사용
* metadata JSON에 `schema_version: 3` 유지
* metadata JSON에 `storage_type: "erasure_coded"` 유지
* metadata JSON에 Reed-Solomon coding 정보 유지
* metadata JSON에 shard 목록 유지
* 각 shard metadata에 `index`, `role`, `tier`, `path`, `size`, `checksum` 저장
* data shard metadata의 `role`은 `data`
* data shard metadata의 `tier`는 `hot`
* parity shard metadata의 `role`은 `parity`
* parity shard metadata의 `tier`는 `cold`
* 정상 다운로드 시 hot data shard를 먼저 읽고 병합
* 정상 다운로드 시 cold parity shard를 필수로 요구하지 않음
* cold parity shard가 없어도 hot data shard 2개가 있으면 다운로드 성공
* data shard 1개 손실 시 cold parity shard를 사용해 복구
* 복구된 data shard는 원래 metadata path 기준으로 `hot/` 아래에 재생성
* 복원 시 원본 size 기준으로 padding 제거
* 복원 결과의 SHA-256 checksum을 metadata checksum과 비교
* shard 2개 이상 손실 시 복구 실패
* Object 삭제 시 metadata JSON과 hot/cold shard 디렉토리 삭제
* 기존 Bucket API 유지
* 기존 Object API 경로 유지
* 기존 Phase 2 CLI 명령 동작 유지
* 자동 테스트가 있다면 Storage Tier 검증 기준으로 수정 또는 추가

구현하지 않을 기능:

* Reed-Solomon 알고리즘 신규 구현
* `k=4, m=2` 확장 구현
* shard 2개 손실 복구 성공 처리
* metadata migration script
* 기존 schema_version 1 metadata migration
* 기존 schema_version 2 metadata migration
* TCP Socket FTP 스타일 서버/클라이언트
* 시간 기반 tier 이동
* 접근 빈도 기반 tier 이동
* hot-to-cold 자동 이동
* cold-to-hot 자동 승격
* lifecycle policy
* 실제 S3 Storage Class 정책
* 새로운 CLI 명령 추가
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
* Erasure coding: 기존 Phase 4 Reed-Solomon `k=2, m=1` 구현 유지
* Data shards: `2`
* Parity shards: `1`
* Total shards: `3`
* Recoverable shard loss: `1`
* data shard 위치: `hot/`
* parity shard 위치: `cold/`
* DB 사용 금지
* Docker 사용 금지
* uuid 패키지 사용 금지
* Phase 2 CLI 명령 변경 최소화

Phase 5는 새 의존성 추가가 필요하지 않아야 한다.

`package.json`, `pnpm-lock.yaml`이 변경된다면 먼저 변경 이유를 확인한다.

---

## 저장 구조

Phase 4에서는 Reed-Solomon `k=2, m=1` 기준으로 data shard와 parity shard를 구분한다.

Phase 5에서는 이 구조가 Storage Tier 흉내 기준에 맞게 동작하는지 검증한다.

data shard는 `hot/`에 저장한다.

parity shard는 `cold/`에 저장한다.

```text
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   └── objects/
        │       └── {object_id}.json
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

사용자 object key는 저장 경로로 사용하지 않는다.

내부 저장 경로에는 반드시 `object_id`를 사용한다.

Phase 5에서는 아래 Phase 3 단순 shard 구조가 생성되면 안 된다.

```text
data/buckets/{bucket_name}/shards/{object_id}/shard_0.data
data/buckets/{bucket_name}/shards/{object_id}/shard_1.data
data/buckets/{bucket_name}/shards/{object_id}/shard_2.data
```

---

## Storage Tier 기준

Phase 5의 hot/cold 의미는 다음과 같다.

```text
hot  = 원본 복원에 직접 사용하는 data shard 저장 위치
cold = data shard 손실 시 복구에 사용하는 parity shard 저장 위치
```

Phase 5에서 hot/cold는 실제 AWS S3 Storage Class가 아니다.

Phase 5에서 hot/cold는 접근 빈도 기반 자동 이동이 아니다.

Phase 5에서 hot/cold는 시간 기반 lifecycle 이동이 아니다.

Phase 5에서 hot/cold는 단순히 data shard와 parity shard를 서로 다른 디렉토리에 배치하는 구조다.

---

## Reed-Solomon 기준

Phase 5에서는 Phase 4에서 구현한 MVP 기준을 그대로 유지한다.

```ts
const DATA_SHARDS = 2;
const PARITY_SHARDS = 1;
const TOTAL_SHARDS = DATA_SHARDS + PARITY_SHARDS;
const RECOVERABLE_SHARD_LOSS = 1;
```

복구 가능 기준:

| 손실 상황                              | 원본 복구 가능 여부 | 설명                                   |
| ---------------------------------- | ----------- | ------------------------------------ |
| data shard 1개 손실                   | 가능          | 남은 data shard와 cold parity shard로 복구 |
| data shard 2개 손실                   | 불가          | `m=1` 범위 초과                          |
| data shard 1개 + parity shard 1개 손실 | 불가          | 총 2개 손실로 `m=1` 범위 초과                 |

Phase 5의 핵심 검증은 data shard 1개 손실 후 cold parity shard를 사용해 data shard를 복구하는 것이다.

parity shard 손실 후 parity shard 재생성 검증은 Phase 5 핵심 범위로 두지 않는다.

구현 기준:

* data shard 개수는 2개다.
* parity shard 개수는 1개다.
* total shard 개수는 3개다.
* data shard 1개 손실까지만 복구한다.
* shard 2개 이상 손실 시 복구 실패를 반환한다.
* 복구된 data shard는 `hot/` 아래에 다시 저장한다.
* 복원 결과는 metadata의 원본 `size` 기준으로 padding을 제거한다.
* padding 제거 후 SHA-256 checksum을 비교한다.

---

## Metadata 구조

Phase 5는 Phase 4의 erasure coded metadata 구조를 유지한다.

Object 업로드 시 metadata JSON은 아래 구조를 가져야 한다.

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
shards
shards[].index
shards[].role
shards[].tier
shards[].path
shards[].size
shards[].checksum
data shard role: data
data shard tier: hot
parity shard role: parity
parity shard tier: cold
data shard path: shards/{object_id}/hot/shard_*.data
parity shard path: shards/{object_id}/cold/parity_0.data
```

### schema_version 기준

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

기존 `schema_version: 1`, `schema_version: 2` object의 migration 또는 호환 처리는 Phase 5 범위가 아니다.

Phase 5 검증은 새로 업로드한 `schema_version: 3` object 기준으로 수행한다.

기존 Phase 1, Phase 3 데이터와 충돌할 수 있으므로 검증 전 `data/` 내부 런타임 파일을 비우고 시작해도 된다.

단, `.gitkeep`는 유지한다.

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

multipart field name은 기존과 동일하게 `file`이다.

Phase 5 기준 내부 동작:

```text
object 파일을 data shard 2개와 parity shard 1개로 저장
data shard는 shards/{object_id}/hot/shard_{index}.data에 저장
parity shard는 shards/{object_id}/cold/parity_0.data에 저장
metadata에 erasure coding 정보와 tier 정보를 저장
```

응답 형식은 기존 필드를 유지한다.

```json
{
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "size": 253811,
  "checksum": "sha256..."
}
```

### Object metadata 조회

```http
GET /buckets/:bucketName/objects/metadata?key=2026/06/sample.png
```

응답에는 erasure coding 정보와 shard tier 정보가 포함되어야 한다.

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
```

### Object 다운로드

```http
GET /buckets/:bucketName/objects?key=2026/06/sample.png
```

정상 다운로드 내부 동작:

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

data shard 손실 상태에서 복구를 지원하는 구현이라면 내부 동작:

```text
metadata 조회
→ hot/ data shard 손실 확인
→ cold/ parity shard 조회
→ 남은 hot data shard + cold parity shard로 손실 data shard 복구
→ 복구된 data shard를 hot/에 재저장
→ data shard를 index 순서로 병합
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

```json
{
  "objects": [
    {
      "object_id": "uuid",
      "key": "2026/06/sample.png",
      "size": 253811,
      "checksum": "sha256...",
      "created_at": "2026-06-06T12:00:00Z"
    }
  ]
}
```

### Object 삭제

```http
DELETE /buckets/:bucketName/objects?key=2026/06/sample.png
```

삭제 대상:

```text
metadata/objects/{object_id}.json
shards/{object_id}/
```

object 삭제 후 삭제 대상 object의 hot/cold shard 디렉토리가 남아 있으면 안 된다.

### Debug shard 삭제 API

Phase 5 검증에서는 기존 Phase 4 debug API를 사용한다.

운영 기능이 아니라 장애 상황을 수동으로 만들기 위한 테스트 API다.

```http
POST /debug/objects/:objectId/delete-shards?count=1
```

Phase 5의 data shard 복구 검증은 debug API의 삭제 대상이 랜덤이거나 내부 선택 순서에 의존하면 직접 파일 삭제 방식으로 수행한다.

명확한 data shard 손실 검증을 위해 아래 방식을 우선한다.

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\{object_id}\hot\shard_1.data
```

Debug API는 shard 2개 손실 실패 검증에서 사용할 수 있다.

```http
POST /debug/objects/:objectId/delete-shards?count=2
```

### Recovery API

Phase 5에서는 기존 Phase 4 recovery API를 사용한다.

```http
POST /debug/objects/:objectId/recover
```

Phase 5 기준 핵심 동작:

```text
metadata 조회
→ hot/ data shard 존재 여부 검사
→ cold/ parity shard 존재 여부 검사
→ 손실 shard 개수 계산
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

손실 shard가 없는 경우 응답 예시:

```json
{
  "object_id": "uuid",
  "recovered": false,
  "missing_count": 0,
  "checksum_matched": true
}
```

손실 shard가 2개 이상이면 복구 실패를 반환한다.

```json
{
  "error": {
    "message": "too many missing shards to recover",
    "missing_count": 2,
    "recoverable_shard_loss": 1
  }
}
```

---

## 예상 프로젝트 구조

Phase 5 완료 후 예상 구조는 Phase 4 구조를 유지한다.

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
│   │   └── debug/
│   │       ├── debug.controller.ts
│   │       └── debug.service.ts
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
│   └── phase5.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

Phase 5에서는 아래 경로를 만들지 않는다.

```text
src/modules/migration/
experiments/ftp-socket/
```

---

## 구현 주의사항

* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Bucket API 동작을 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 유지한다.
* CLI는 hot/cold tier 내부 구조를 몰라도 된다.
* 사용자 object key는 실제 파일 경로로 사용하지 않는다.
* 내부 저장 경로는 반드시 `object_id` 기준으로 구성한다.
* data shard는 `shards/{object_id}/hot/shard_{index}.data` 구조로 저장한다.
* parity shard는 `shards/{object_id}/cold/parity_0.data` 구조로 저장한다.
* data shard index는 0, 1을 사용한다.
* parity shard metadata index는 2를 사용한다.
* metadata의 shard path는 bucket 디렉토리 기준 상대 경로로 저장한다.
* metadata에 `role: data | parity`를 저장한다.
* metadata에 `tier: hot | cold`를 저장한다.
* 정상 다운로드 시 hot data shard를 index 순서로 병합한다.
* 정상 다운로드 시 cold parity shard를 필수로 읽지 않는다.
* parity shard는 원본 response에 포함하지 않는다.
* data shard 손실 복구 시 cold parity shard를 사용한다.
* data shard 복구 결과는 `hot/`에 저장한다.
* 복원 시 metadata의 원본 `size` 기준으로 padding을 제거한다.
* 병합 결과 checksum이 metadata checksum과 다르면 500 JSON 에러를 반환한다.
* object 삭제 시 metadata JSON과 shard 디렉토리를 모두 삭제한다.
* `schema_version: 3`은 새로 업로드되는 object에만 적용한다.
* 기존 `schema_version: 1`, `schema_version: 2` object migration은 구현하지 않는다.
* metadata migration 코드는 구현하지 않는다.
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
src/modules/object/**
src/modules/erasure/**
src/modules/shard/**
src/modules/storage/**
src/modules/metadata/**
src/modules/debug/**
src/modules/checksum/**
src/shared/*
src/app.test.ts
docs/phase5.md
```

필요하면 최소 범위로 수정 가능:

```text
src/app.ts
src/routes/*
src/modules/storage/local-storage.ts
src/modules/storage/storage.types.ts
```

라우트 연결 문제가 있을 때만 수정 가능:

```text
src/routes/debug.routes.ts
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
src/modules/bucket/*
```

`package.json`, `pnpm-lock.yaml`은 Phase 5에서 새 의존성이 필요하지 않아야 하므로 변경되면 이유를 먼저 확인한다.

`src/cli.ts`, `src/modules/cli/*`는 기존 CLI 호환을 위한 최소 수정만 허용한다.

새 CLI 명령 추가는 하지 않는다.

---

## 금지 변경 파일 또는 경로

```text
src/modules/migration/**
experiments/ftp-socket/**
metadata migration script
FTP Socket 서버/클라이언트 코드
README.md 전체 재작성
k=4 m=2 확장 구현
시간 기반 tier 이동 관련 코드
접근 빈도 기반 tier 이동 관련 코드
hot-to-cold 자동 이동 코드
cold-to-hot 자동 승격 코드
lifecycle policy 관련 코드
실제 S3 Storage Class 정책 관련 코드
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

### Bucket 생성

```bash
pnpm cli bucket:create photo-bucket
```

기대 결과:

```text
bucket 생성 가능
```

### Object 업로드

```bash
pnpm cli object:put photo-bucket 2026/06/sample.png testdata/sample.png
```

기대 결과:

```text
object_id 반환
size 반환
checksum 반환
```

`object_id`를 기록한다.

```text
sample_object_id = sample.png의 object_id
```

### hot/cold shard 파일 생성 확인

PowerShell:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards\{sample_object_id} -Recurse
```

기대 구조:

```text
data/buckets/photo-bucket/shards/{sample_object_id}/hot/shard_0.data
data/buckets/photo-bucket/shards/{sample_object_id}/hot/shard_1.data
data/buckets/photo-bucket/shards/{sample_object_id}/cold/parity_0.data
```

확인 기준:

```text
hot/ 아래 data shard 2개 존재
cold/ 아래 parity shard 1개 존재
총 shard 3개 존재
```

### Phase 3 단순 shard 구조 미사용 확인

Phase 5에서는 아래 구조가 생성되면 안 된다.

```text
data/buckets/photo-bucket/shards/{sample_object_id}/shard_0.data
data/buckets/photo-bucket/shards/{sample_object_id}/shard_1.data
data/buckets/photo-bucket/shards/{sample_object_id}/shard_2.data
```

PowerShell:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\shard_0.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\shard_2.data
```

기대 결과:

```text
False
False
False
```

### Metadata 조회

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
```

### 정상 다운로드

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored.png
```

기대 결과:

```text
restored.png 생성
downloaded: true
```

### Checksum 비교

Linux/macOS/Git Bash:

```bash
sha256sum testdata/sample.png
sha256sum restored.png
```

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 hot data shard 기반 다운로드 파일의 SHA-256 checksum이 일치한다.
```

### cold parity 누락 상태 정상 다운로드 검증

Phase 5의 핵심은 정상 다운로드가 cold parity shard를 필수로 요구하지 않는 것이다.

정상 object에서 cold parity shard만 삭제한다.

PowerShell:

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\{sample_object_id}\cold\parity_0.data
```

cold parity shard가 없는지 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\cold\parity_0.data
```

기대 결과:

```text
False
```

hot data shard 2개는 존재해야 한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_0.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_1.data
```

기대 결과:

```text
True
True
```

다운로드를 다시 수행한다.

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored-without-cold-parity.png
```

Checksum을 비교한다.

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-without-cold-parity.png -Algorithm SHA256
```

기대 결과:

```text
cold parity shard가 없어도 hot data shard 2개만으로 정상 다운로드 성공
원본 파일과 다운로드 파일의 SHA-256 checksum 일치
```

이 검증 후 data shard 복구 검증은 새 object를 업로드해서 진행한다.

### data shard 손실 후 cold parity 복구 검증

검증 혼선을 막기 위해 새 object를 업로드한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample-recovery.png testdata/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-recovery.png
```

metadata에서 새 `object_id`를 확인한다.

```text
recovery_object_id = sample-recovery.png의 object_id
```

Phase 5의 핵심 검증은 cold parity shard를 사용한 data shard 복구다.

debug API의 삭제 대상이 랜덤이거나 내부 선택 순서에 의존할 수 있으므로, data shard를 직접 삭제한다.

PowerShell:

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\{recovery_object_id}\hot\shard_1.data
```

삭제 상태를 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{recovery_object_id}\hot\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{recovery_object_id}\cold\parity_0.data
```

기대 결과:

```text
hot/shard_1.data: False
cold/parity_0.data: True
```

### Recovery API 실행

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{recovery_object_id}/recover"
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
Get-ChildItem .\data\buckets\photo-bucket\shards\{recovery_object_id} -Recurse
```

기대 결과:

```text
hot/shard_0.data
hot/shard_1.data
cold/parity_0.data
```

### 복구 후 다운로드

```bash
pnpm cli object:get photo-bucket 2026/06/sample-recovery.png restored-after-tier-recovery.png
```

### 복구 후 Checksum 비교

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-after-tier-recovery.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 복구 후 다운로드 파일의 SHA-256 checksum이 일치한다.
```

### shard 2개 손실 실패 검증

Phase 5도 Phase 4 MVP 기준을 유지한다.

`k=2, m=1`이므로 shard 2개 손실 복구는 실패가 정상이다.

검증용 object를 새로 업로드한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample-fail.png testdata/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-fail.png
```

metadata에서 새 `object_id`를 확인한다.

```text
fail_object_id = sample-fail.png의 object_id
```

shard 2개를 삭제한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{fail_object_id}/delete-shards?count=2"
```

복구를 시도한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{fail_object_id}/recover"
```

기대 결과:

```json
{
  "error": {
    "message": "too many missing shards to recover",
    "missing_count": 2,
    "recoverable_shard_loss": 1
  }
}
```

확인 기준:

```text
shard 2개 손실 복구를 성공 처리하면 안 된다.
```

### Object 목록 조회

```bash
pnpm cli object:list photo-bucket
```

기대 결과:

```text
업로드한 object key가 목록에 포함된다.
```

### Object 삭제

정상 다운로드 검증용 object를 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample.png
```

data shard 복구 검증용 object를 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample-recovery.png
```

shard 2개 손실 실패 검증용 object도 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample-fail.png
```

삭제 후 shard 디렉토리 확인:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}
Test-Path .\data\buckets\photo-bucket\shards\{recovery_object_id}
Test-Path .\data\buckets\photo-bucket\shards\{fail_object_id}
```

기대 결과:

```text
False
False
False
```

삭제 후 metadata 조회:

```bash
pnpm cli object:meta photo-bucket 2026/06/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-recovery.png
pnpm cli object:meta photo-bucket 2026/06/sample-fail.png
```

기대 결과:

```text
404 JSON 에러 출력
CLI exit code 1
```

---

## 완료 조건

* object 업로드 시 data shard 2개가 생성됨
* object 업로드 시 parity shard 1개가 생성됨
* data shard 2개가 `shards/{object_id}/hot/` 아래에 저장됨
* parity shard 1개가 `shards/{object_id}/cold/` 아래에 저장됨
* Phase 3 단순 shard 구조인 `shards/{object_id}/shard_{index}.data`가 생성되지 않음
* metadata JSON에 `schema_version: 3` 포함
* metadata JSON에 `storage_type: "erasure_coded"` 포함
* metadata JSON에 Reed-Solomon coding 정보 포함
* metadata JSON에 `coding.data_shards: 2` 포함
* metadata JSON에 `coding.parity_shards: 1` 포함
* metadata JSON에 `coding.total_shards: 3` 포함
* metadata JSON에 `coding.recoverable_shard_loss: 1` 포함
* metadata JSON에 `shards` 배열 포함
* 각 shard metadata에 `index`, `role`, `tier`, `path`, `size`, `checksum` 포함
* data shard metadata의 `tier`가 `hot`
* parity shard metadata의 `tier`가 `cold`
* object 다운로드 시 hot data shard 파일들을 index 순서로 병합
* 정상 다운로드 시 cold parity shard를 필수로 읽지 않음
* cold parity shard가 없어도 hot data shard 2개가 있으면 정상 다운로드 성공
* parity shard는 원본 response에 포함하지 않음
* data shard 1개 손실 시 cold parity shard를 사용해 복구 가능
* data shard 복구 시 `hot/` 아래에 재생성됨
* 복원 시 metadata의 원본 `size` 기준으로 padding 제거
* 복원 결과 SHA-256 checksum이 metadata checksum과 일치
* CLI로 업로드/다운로드했을 때 원본과 복원 파일 checksum 일치
* recovery API로 data shard 1개 손실 복구 가능
* 복구 후 다운로드한 파일의 SHA-256 checksum이 원본과 일치
* shard 2개 이상 손실 시 복구 실패 반환
* object 삭제 시 metadata JSON과 hot/cold shard 디렉토리 삭제
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* 시간 기반 tier 이동 코드 없음
* 접근 빈도 기반 tier 이동 코드 없음
* hot-to-cold 자동 이동 코드 없음
* cold-to-hot 자동 승격 코드 없음
* lifecycle policy 코드 없음
* 실제 S3 Storage Class 정책 코드 없음
* metadata migration 코드 없음
* FTP socket 코드 없음
* k=4 m=2 확장 구현 없음
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 5 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

---

## README 처리

README.md는 현재 내용을 유지한다.

Phase 5 작업 중 README 전체 재작성은 하지 않는다.

필요한 경우 Phase 5 저장 구조나 검증 명령만 최소 수정한다.

docs/phase5.md는 짧은 요약 문서로 축약하지 않는다.

docs/phase5.md는 기존 한국어 상세 문서 구조를 유지한다.

---

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- Phase 2 CLI 명령이 그대로 동작하는지
- CLI 명령을 새로 추가하지 않았는지
- object 업로드 시 data shard 2개와 parity shard 1개를 생성하는지
- data shard가 shards/{object_id}/hot/shard_*.data에 저장되는지
- parity shard가 shards/{object_id}/cold/parity_0.data에 저장되는지
- Phase 3 단순 shard 구조가 생성되지 않았는지
- shard 저장 경로가 object_id 기준인지
- 사용자 object key를 저장 경로로 사용하지 않았는지
- metadata에 schema_version: 3이 들어가는지
- metadata에 storage_type: erasure_coded가 들어가는지
- metadata에 coding.algorithm: reed-solomon이 들어가는지
- metadata에 data_shards: 2, parity_shards: 1, total_shards: 3이 들어가는지
- metadata에 recoverable_shard_loss: 1이 들어가는지
- metadata에 shards 배열이 들어가는지
- 각 shard metadata에 index, role, tier, path, size, checksum이 들어가는지
- data shard metadata의 tier가 hot인지
- parity shard metadata의 tier가 cold인지
- 정상 다운로드 시 hot data shard를 index 순서로 병합하는지
- 정상 다운로드 시 cold parity shard를 필수로 읽지 않는지
- cold parity shard가 없어도 hot data shard 2개가 있으면 정상 다운로드 성공하는지
- parity shard를 원본 response에 포함하지 않는지
- data shard 손실 시 cold parity shard를 사용해 복구하는지
- data shard 복구 시 hot/ 아래에 재생성되는지
- 복원 시 padding을 metadata.size 기준으로 제거하는지
- 복원 결과 checksum을 metadata checksum과 비교하는지
- shard 2개 이상 손실 시 복구 실패를 반환하는지
- object 삭제 시 hot/cold shard 디렉토리까지 삭제하는지
- metadata migration 코드를 만들지 않았는지
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
