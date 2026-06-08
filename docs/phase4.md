# 작업 지시: ShardStore Phase 4 구현

현재 프로젝트 README, Phase 1 구현 결과, Phase 2 CLI 구현 결과, Phase 3 shard 분할 저장 결과 기준으로 ShardStore Phase 4만 구현한다.

## 목표

Node.js + TypeScript 기반 ShardStore에서 Reed-Solomon erasure coding을 적용한다.

Phase 4에서는 MVP 기준 `k=2, m=1` 구조를 구현한다.

업로드된 object를 data shard 2개와 parity shard 1개로 저장하고, shard 1개 손실 상황에서 원본 object를 복구할 수 있어야 한다.

완료 기준은 명확하다.

```text
shard 1개 삭제 후 원본 복구 성공
```

Phase 4에서는 data shard를 `hot/`에 저장하고, parity shard를 `cold/`에 저장한다.

기존 HTTP API 경로와 Phase 2 CLI 명령은 유지해야 한다.

CLI는 내부 erasure coding 구조를 몰라도 기존 명령으로 object 업로드, metadata 조회, 다운로드, 목록 조회, 삭제를 수행할 수 있어야 한다.

## 구현 범위

구현할 기능:

* Reed-Solomon erasure coding 적용
* MVP 기준 `k=2, m=1` 고정
* Object 업로드 시 data shard 2개 생성
* Object 업로드 시 parity shard 1개 생성
* data shard는 `shards/{object_id}/hot/` 아래에 저장
* parity shard는 `shards/{object_id}/cold/` 아래에 저장
* data shard 파일명은 `shard_{index}.data` 형식 사용
* parity shard 파일명은 `parity_{parityIndex}.data` 형식 사용
* MVP 기준 parity shard는 1개이므로 파일명은 `parity_0.data`를 사용한다.
* metadata의 parity shard `index`는 전체 shard index 기준으로 `2`를 사용한다.
* metadata JSON에 `schema_version: 3` 저장
* metadata JSON에 `storage_type: "erasure_coded"` 저장
* metadata JSON에 Reed-Solomon coding 정보 저장
* metadata JSON에 shard 목록 저장
* 각 shard metadata에 `index`, `role`, `tier`, `path`, `size`, `checksum` 저장
* Object 다운로드 시 data shard를 병합해 원본 object 복원
* 복원 시 원본 size 기준으로 padding 제거
* 복원 결과의 SHA-256 checksum을 metadata checksum과 비교
* checksum 불일치 시 파일을 내려주지 않고 500 JSON 에러 반환
* Debug shard 삭제 API 추가
* Recovery API 추가
* shard 1개 손실 시 복구 성공
* shard 2개 이상 손실 시 복구 실패
* Object 삭제 시 metadata JSON과 shard 디렉토리 삭제
* 기존 Bucket API 유지
* 기존 Object API 경로 유지
* 기존 Phase 2 CLI 명령 동작 유지
* 자동 테스트가 있다면 erasure coding 저장 구조와 복구 기준으로 수정 또는 추가

구현하지 않을 기능:

* `k=4, m=2` 확장 구현
* shard 2개 손실 복구 성공 처리
* metadata migration script
* 기존 schema_version 1 metadata migration
* 기존 schema_version 2 metadata migration
* TCP Socket FTP 스타일 서버/클라이언트
* 시간 기반 tier 이동
* 접근 빈도 기반 tier 이동
* 실제 S3 Storage Class 정책
* 새로운 CLI 명령 추가
* DB 사용
* Docker 사용
* README 전체 재작성

## 기술 조건

* Language: Node.js + TypeScript
* Package manager: pnpm
* HTTP Server: Express
* File upload: multer
* Object ID: Node.js 내장 `crypto.randomUUID()`
* Checksum: SHA-256
* Metadata: JSON file
* Storage: Local filesystem
* Erasure coding: Reed-Solomon
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

Reed-Solomon 구현을 위해 외부 패키지가 필요하면 `package.json`, `pnpm-lock.yaml` 변경을 허용한다.

단, 의존성 추가 전 현재 프로젝트 구조와 기존 구현 방식을 먼저 확인한다.

## 저장 구조

Phase 3에서는 단순 shard 파일을 저장했다.

```text
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   └── objects/
        │       └── {object_id}.json
        └── shards/
            └── {object_id}/
                ├── shard_0.data
                ├── shard_1.data
                └── shard_2.data
```

Phase 4에서는 Reed-Solomon `k=2, m=1` 기준으로 data shard와 parity shard를 구분한다.

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

| shard 종류 | 저장 위치 | 파일명 |
| --- | --- | --- |
| data shard 0 | `shards/{object_id}/hot/` | `shard_0.data` |
| data shard 1 | `shards/{object_id}/hot/` | `shard_1.data` |
| parity shard 0 | `shards/{object_id}/cold/` | `parity_0.data` |

사용자 object key는 저장 경로로 사용하지 않는다.

내부 저장 경로에는 반드시 `object_id`를 사용한다.

## Reed-Solomon 기준

Phase 4에서는 MVP 기준을 고정값으로 둔다.

```ts
const DATA_SHARDS = 2;
const PARITY_SHARDS = 1;
const TOTAL_SHARDS = DATA_SHARDS + PARITY_SHARDS;
const RECOVERABLE_SHARD_LOSS = 1;
```

복구 가능 기준:

| 손실 상황 | 원본 복구 가능 여부 | 설명 |
| --- | --- | --- |
| data shard 1개 손실 | 가능 | 남은 data shard와 parity shard로 복구 |
| parity shard 1개 손실 | 가능 | data shard 2개가 남아 있으므로 원본 복원 가능, parity 재생성 가능 |
| data shard 2개 손실 | 불가 | `m=1` 범위 초과 |
| data shard 1개 + parity shard 1개 손실 | 불가 | 총 2개 손실로 `m=1` 범위 초과 |

구현 기준:

* data shard 개수는 2개다.
* parity shard 개수는 1개다.
* total shard 개수는 3개다.
* shard 1개 손실까지만 복구한다.
* shard 2개 이상 손실 시 복구 실패를 반환한다.
* 복원 결과는 metadata의 원본 `size` 기준으로 padding을 제거한다.
* padding 제거 후 SHA-256 checksum을 비교한다.

## Metadata 구조

Object 업로드 시 metadata JSON에 erasure coding 정보를 포함한다.

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

Phase 4 metadata는 erasure coding 저장 구조다.

```json
{
  "schema_version": 3,
  "storage_type": "erasure_coded",
  "coding": {},
  "shards": []
}
```

기존 `schema_version: 1`, `schema_version: 2` object의 migration 또는 호환 처리는 Phase 4 범위가 아니다.

Phase 4 검증은 새로 업로드한 `schema_version: 3` object 기준으로 수행한다.

기존 Phase 1, Phase 3 데이터와 충돌할 수 있으므로 검증 전 `data/` 내부 런타임 파일을 비우고 시작해도 된다.

단, `.gitkeep`는 유지한다.

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

변경되는 내부 동작:

```text
기존 Phase 3:
object 파일을 shards/{object_id}/shard_{index}.data로 단순 분할 저장

변경 Phase 4:
object 파일을 data shard 2개와 parity shard 1개로 저장
data shard는 shards/{object_id}/hot/shard_{index}.data에 저장
parity shard는 shards/{object_id}/cold/parity_{index}.data에 저장
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

응답에는 erasure coding 정보와 shard 정보가 포함되어야 한다.

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
```

### Object 다운로드

```http
GET /buckets/:bucketName/objects?key=2026/06/sample.png
```

다운로드 내부 동작:

```text
metadata 조회
→ hot/ data shard 상태 확인
→ 손실 shard가 없으면 data shard를 index 순서로 병합
→ data shard 1개가 손실되어 있으면 cold/ parity shard를 사용해 복구
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

object 삭제 후 삭제 대상 object의 shard 디렉토리가 남아 있으면 안 된다.

### Debug shard 삭제 API

Phase 4 검증용 API다.

운영 기능이 아니라 장애 상황을 수동으로 만들기 위한 테스트 API다.

```http
POST /debug/objects/:objectId/delete-shards?count=1
```

기본 동작:

```text
object_id 기준 metadata 조회
→ 삭제 가능한 shard 중 count 개수만큼 삭제
→ 삭제된 shard 정보 반환
```

응답 예시:

```json
{
  "object_id": "uuid",
  "deleted_count": 1,
  "deleted_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/{object_id}/hot/shard_1.data"
    }
  ]
}
```

주의사항:

* `count=1`은 shard 1개 손실 복구 검증에 사용한다.
* `count=2`는 복구 실패 검증에 사용한다.
* 삭제된 shard 정보는 반드시 응답에 포함한다.
* 삭제할 shard는 data shard 또는 parity shard 중 존재하는 shard에서 선택한다.
* 랜덤 삭제 또는 deterministic 삭제 모두 가능하지만 테스트가 예측 가능하도록 deterministic 삭제를 우선한다.

### Recovery API

Phase 4 복구 검증용 API다.

```http
POST /debug/objects/:objectId/recover
```

기본 동작:

```text
metadata 조회
→ shard 존재 여부 검사
→ 손실 shard 개수 계산
→ 손실 shard가 0개면 no-op 응답
→ 손실 shard가 1개면 복구
→ 손실 shard가 2개 이상이면 복구 실패
→ 복구된 data shard는 hot/에 저장
→ 복구된 parity shard는 cold/에 저장
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

parity shard 복구 응답 예시:

```json
{
  "object_id": "uuid",
  "recovered": true,
  "recovered_shards": [
    {
      "role": "parity",
      "tier": "cold",
      "index": 2,
      "path": "shards/{object_id}/cold/parity_0.data"
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

## 예상 프로젝트 구조

Phase 4 완료 후 예상 구조는 아래와 같다.

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
│   └── phase4.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

`src/modules/erasure/`는 Reed-Solomon encode/recover 로직 분리를 위해 생성한다.

`src/modules/debug/`와 `src/routes/debug.routes.ts`는 Phase 4 복구 검증 API를 위해 생성한다.

Phase 4에서는 다음 경로를 만들지 않는다.

```text
src/modules/migration/
experiments/ftp-socket/
```

## 구현 주의사항

* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Bucket API 동작을 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 유지한다.
* CLI는 erasure coding 내부 구조를 몰라도 된다.
* 사용자 object key는 실제 파일 경로로 사용하지 않는다.
* 내부 저장 경로는 반드시 `object_id` 기준으로 구성한다.
* object 업로드 시 Phase 3의 단순 shard 3개 저장 구조를 대체한다.
* object 업로드 시 data shard 2개와 parity shard 1개를 저장한다.
* data shard는 `shards/{object_id}/hot/shard_{index}.data` 구조로 저장한다.
* parity shard는 `shards/{object_id}/cold/parity_{index}.data` 구조로 저장한다.
* shard index는 0부터 시작한다.
* data shard index는 0, 1을 사용한다.
* parity shard index는 2를 사용한다.
* metadata의 shard path는 bucket 디렉토리 기준 상대 경로로 저장한다.
* metadata에 `role: data | parity`를 저장한다.
* metadata에 `tier: hot | cold`를 저장한다.
* 다운로드 시 data shard를 index 순서로 병합한다.
* parity shard는 원본 응답에 포함하지 않는다.
* 복구 시 손실 shard 개수가 1개 이하면 복구를 시도한다.
* 복구 시 손실 shard 개수가 2개 이상이면 복구 실패를 반환한다.
* data shard 복구 결과는 `hot/`에 저장한다.
* parity shard 복구 결과는 `cold/`에 저장한다.
* 복원 시 metadata의 원본 `size` 기준으로 padding을 제거한다.
* 병합 결과 checksum이 metadata checksum과 다르면 500 JSON 에러를 반환한다.
* object 삭제 시 metadata JSON과 shard 디렉토리를 모두 삭제한다.
* `schema_version: 3`은 새로 업로드되는 object에만 적용한다.
* 기존 `schema_version: 1`, `schema_version: 2` object migration은 구현하지 않는다.
* metadata migration 코드는 구현하지 않는다.
* k=4 m=2 확장 구현은 하지 않는다.
* 시간 기반 tier 이동은 구현하지 않는다.
* 접근 빈도 기반 tier 이동은 구현하지 않는다.
* 실제 S3 Storage Class 정책은 구현하지 않는다.
* TCP Socket 코드는 구현하지 않는다.
* README.md는 전체 재작성하지 않는다.
* 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.

## 허용 변경 파일

우선 허용:

```text
src/modules/erasure/**
src/modules/shard/**
src/modules/object/**
src/modules/metadata/**
src/modules/storage/**
src/modules/checksum/**
src/shared/*
src/app.test.ts
docs/phase4.md
```

필요하면 최소 범위로 추가 가능:

```text
src/modules/debug/**
src/routes/debug.routes.ts
```

debug API 라우팅 등록 목적일 때만 허용한다.

필요하면 최소 범위로 수정 가능:

```text
src/app.ts
src/routes/*
src/modules/storage/local-storage.ts
src/modules/storage/storage.types.ts
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

`package.json`, `pnpm-lock.yaml`은 Reed-Solomon 라이브러리 추가가 필요한 경우에만 수정한다.

`src/cli.ts`, `src/modules/cli/*`는 기존 CLI 호환을 위한 최소 수정만 허용한다.

새 CLI 명령 추가는 하지 않는다.

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
실제 S3 Storage Class 정책 관련 코드
```

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

### erasure shard 파일 생성 확인

PowerShell:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards -Recurse
```

기대 구조:

```text
data/buckets/photo-bucket/shards/{object_id}/hot/shard_0.data
data/buckets/photo-bucket/shards/{object_id}/hot/shard_1.data
data/buckets/photo-bucket/shards/{object_id}/cold/parity_0.data
```

### Phase 3 단순 shard 구조 미사용 확인

Phase 4에서는 아래 구조가 생성되면 안 된다.

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
원본 파일과 erasure coding 다운로드 파일의 SHA-256 checksum이 일치한다.
```

### shard 1개 삭제

`object_id`는 업로드 응답 또는 metadata 조회 응답에서 확인한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{object_id}/delete-shards?count=1"
```

기대 결과:

```json
{
  "object_id": "uuid",
  "deleted_count": 1,
  "deleted_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/{object_id}/hot/shard_1.data"
    }
  ]
}
```

삭제 후 파일 상태 확인:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards\{object_id} -Recurse
```

확인 기준:

```text
hot/shard_0.data
hot/shard_1.data
cold/parity_0.data

위 3개 중 1개가 삭제되어 있어야 한다.
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
pnpm cli object:get photo-bucket 2026/06/sample.png restored-after-recovery.png
```

### 복구 후 Checksum 비교

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-after-recovery.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 복구 후 다운로드 파일의 SHA-256 checksum이 일치한다.
```

### shard 2개 손실 실패 검증

Phase 4 MVP는 shard 1개 손실까지만 복구한다.

shard 2개 손실 상황에서는 복구 실패가 정상이다.

이 검증은 기존 정상 복구 검증에 사용한 object를 재사용하지 않는다.

검증 혼선을 막기 위해 새 object를 업로드한 뒤 진행한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample-fail.png testdata/sample.png
```

업로드 응답 또는 metadata 조회 응답에서 새 `object_id`를 확인한다.

```bash
pnpm cli object:meta photo-bucket 2026/06/sample-fail.png
```

shard 2개를 삭제한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{object_id}/delete-shards?count=2"
```

복구를 시도한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{object_id}/recover"
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

### checksum 불일치 검증

검증 혼선을 막기 위해 checksum 불일치 검증용 object를 새로 업로드한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample-broken.png testdata/sample.png
```

metadata 조회로 `object_id`를 확인한다.

```bash
pnpm cli object:meta photo-bucket 2026/06/sample-broken.png
```

shard 파일을 임의로 수정한 뒤 다운로드한다.

`Set-Content`는 텍스트 인코딩 처리로 바이너리 파일을 의도와 다르게 바꿀 수 있다.

검증 목적은 shard checksum 불일치 상황을 만드는 것이므로, PowerShell에서 byte append 방식으로 파일을 손상시킨다.

PowerShell:

```PowerShell
$target = ".\data\buckets\photo-bucket\shards\{object_id}\hot\shard_0.data"
[System.IO.File]::AppendAllBytes($target, [byte[]](0, 1, 2, 3))
```

다운로드를 시도한다.

```bash
pnpm cli object:get photo-bucket 2026/06/sample-broken.png broken-restored.png
```

기대 결과:
```
500 JSON 에러 반환
checksum mismatch 메시지 포함
손상된 파일을 정상 다운로드로 처리하지 않음
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

정상 복구 검증용 object를 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample.png
```

shard 2개 손실 실패 검증용 object도 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample-fail.png
```

checksum 불일치 검증용 object도 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample-broken.png
```

삭제 후 shard 디렉토리 확인:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards -Recurse
```

기대 결과:

```text
삭제한 object_id의 shard 디렉토리가 남아 있지 않다.
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
* object 다운로드 시 data shard 파일들을 index 순서로 병합
* parity shard는 원본 response에 포함하지 않음
* 복원 시 metadata의 원본 `size` 기준으로 padding 제거
* 복원 결과 SHA-256 checksum이 metadata checksum과 일치
* CLI로 업로드/다운로드했을 때 원본과 복원 파일 checksum 일치
* debug API로 shard 1개 삭제 가능
* recovery API로 shard 1개 손실 복구 가능
* data shard 복구 시 `hot/` 아래에 재생성됨
* parity shard 복구 시 `cold/` 아래에 재생성됨
* 복구 후 hot/cold 아래 shard 파일 3개가 다시 존재함
* 복구 후 다운로드한 파일의 SHA-256 checksum이 원본과 일치
* shard 2개 이상 손실 시 복구 실패 반환
* checksum 불일치 시 500 JSON 에러 반환
* checksum 불일치 검증은 별도 object인 `sample-broken.png`로 수행됨
* object 삭제 시 metadata JSON과 shard 디렉토리 삭제
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 4 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

## README 처리

README.md는 현재 내용을 유지한다.

Phase 4 구현 중 README 전체 재작성은 하지 않는다.

필요한 경우 Phase 4 저장 구조나 검증 명령만 최소 수정한다.

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- Phase 2 CLI 명령이 그대로 동작하는지
- CLI 명령을 새로 추가하지 않았는지
- object 업로드 시 data shard 2개와 parity shard 1개를 생성하는지
- data shard가 shards/{object_id}/hot/shard_*.data에 저장되는지
- parity shard가 shards/{object_id}/cold/parity_*.data에 저장되는지
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
- 다운로드 시 data shard를 index 순서로 병합하는지
- parity shard를 원본 response에 포함하지 않는지
- 복원 시 padding을 metadata.size 기준으로 제거하는지
- 복원 결과 checksum을 metadata checksum과 비교하는지
- checksum 불일치 시 500 JSON 에러를 반환하는지
- debug API로 shard 1개 삭제가 가능한지
- recovery API로 shard 1개 손실 복구가 가능한지
- data shard 복구 시 hot/ 아래에 재생성되는지
- parity shard 복구 시 cold/ 아래에 재생성되는지
- shard 2개 이상 손실 시 복구 실패를 반환하는지
- object 삭제 시 shard 디렉토리까지 삭제하는지
- metadata migration 코드를 만들지 않았는지
- k=4 m=2 확장 구현을 만들지 않았는지
- 시간 기반 tier 이동이나 접근 빈도 기반 tier 이동을 만들지 않았는지
- FTP socket 코드를 만들지 않았는지
- README.md 전체 재작성 여부가 없는지
- pnpm typecheck가 통과하는지
- 기존 테스트가 있으면 pnpm test가 통과하는지
```
