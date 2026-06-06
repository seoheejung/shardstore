# 작업 지시: ShardStore Phase 3 구현

현재 프로젝트 README, Phase 1 구현 결과, Phase 2 CLI 구현 결과 기준으로 ShardStore Phase 3만 구현한다.

## 목표

Node.js + TypeScript 기반 ShardStore에서 object 저장 방식을 원본 파일 단위 저장에서 shard 분할 저장 방식으로 변경한다.

Phase 3에서는 업로드된 object를 여러 shard 파일로 분할 저장하고, 다운로드 시 shard 파일을 순서대로 병합해 원본 object를 복원한다.

Phase 3에서는 Reed-Solomon 복구를 구현하지 않는다.
Parity shard도 만들지 않는다.
hot/cold storage tier도 만들지 않는다.

기존 HTTP API 경로와 Phase 2 CLI 명령은 유지해야 한다.

CLI는 내부 shard 구조를 몰라도 기존 명령으로 object 업로드, metadata 조회, 다운로드, 목록 조회, 삭제를 수행할 수 있어야 한다.

## 구현 범위

구현할 기능:

* Object 업로드 시 원본 파일을 shard 여러 개로 분할 저장
* 내부 저장 경로는 `object_id` 기준 사용
* shard 파일명은 `shard_{index}.data` 형식 사용
* shard 저장 경로는 `data/buckets/{bucket}/shards/{object_id}/shard_{index}.data` 사용
* metadata JSON에 `schema_version: 2` 저장
* metadata JSON에 `storage_type: "sharded"` 저장
* metadata JSON에 `shard_count` 저장
* metadata JSON에 shard 목록 저장
* 각 shard metadata에 `index`, `path`, `size`, `checksum` 저장
* Object 다운로드 시 shard 파일을 index 순서로 병합
* 병합 결과의 SHA-256 checksum을 metadata checksum과 비교
* checksum 불일치 시 파일을 내려주지 않고 500 JSON 에러 반환
* Object 삭제 시 metadata JSON과 shard 디렉토리 삭제
* 기존 Bucket API 유지
* 기존 Object API 경로 유지
* 기존 Phase 2 CLI 명령 동작 유지
* 자동 테스트가 있다면 shard 저장 구조 기준으로 수정 또는 추가

구현하지 않을 기능:

* Reed-Solomon
* parity shard 생성
* shard 손실 복구
* hot/cold storage tier
* debug shard 삭제 API
* metadata migration script
* 기존 schema_version 1 metadata migration
* TCP Socket FTP 스타일 서버/클라이언트
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
* Shard count: `3`
* DB 사용 금지
* Docker 사용 금지
* Reed-Solomon 패키지 추가 금지
* uuid 패키지 사용 금지
* Phase 2 CLI 명령 변경 최소화

## 저장 구조

Phase 2까지는 object를 원본 파일 단위로 저장했다.

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

Phase 3에서는 `objects/{object_id}.data` 대신 `shards/{object_id}/` 구조를 사용한다.

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

Phase 3에서는 `hot/`, `cold/` 디렉토리를 만들지 않는다.
hot/cold 분리는 Phase 5에서 진행한다.

## Shard 분할 기준

Phase 3에서는 고정 shard 개수를 사용한다.

```ts
const SHARD_COUNT = 3;
```

분할 기준:

```text
전체 파일 크기 / SHARD_COUNT
```

나누어떨어지지 않는 경우 남은 byte는 앞쪽 shard부터 1 byte씩 분배한다.

계산 기준:

```text
baseSize = Math.floor(size / SHARD_COUNT)
remainder = size % SHARD_COUNT
```

예:
```text
10 bytes / 3 shards

baseSize = 3
remainder = 1

shard_0: 4 bytes
shard_1: 3 bytes
shard_2: 3 bytes
```

주의사항:

* 빈 파일 업로드는 기존 API 정책을 따른다.
* shard index 순서가 다운로드 복원 순서다.
* shard 파일명은 반드시 `shard_{index}.data` 형식을 사용한다.
* 사용자 object key를 shard 경로로 사용하지 않는다.
* 내부 저장 경로에는 반드시 `object_id`를 사용한다.

## Metadata 구조

Object 업로드 시 metadata JSON에 shard 정보를 포함한다.

```json
{
  "schema_version": 2,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
  "original_file_name": "sample.png",
  "content_type": "image/png",
  "size": 253811,
  "checksum": "sha256...",
  "storage_type": "sharded",
  "shard_count": 3,
  "shards": [
    {
      "index": 0,
      "path": "shards/{object_id}/shard_0.data",
      "size": 84604,
      "checksum": "sha256..."
    },
    {
      "index": 1,
      "path": "shards/{object_id}/shard_1.data",
      "size": 84604,
      "checksum": "sha256..."
    },
    {
      "index": 2,
      "path": "shards/{object_id}/shard_2.data",
      "size": 84603,
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

Phase 3 metadata는 shard 저장 구조다.

```json
{
  "schema_version": 2,
  "storage_type": "sharded",
  "shard_count": 3,
  "shards": []
}
```

기존 `schema_version: 1` object의 migration 또는 호환 처리는 Phase 3 범위가 아니다.
Phase 3 검증은 새로 업로드한 `schema_version: 2` object 기준으로 수행한다.

기존 Phase 1 데이터와 충돌할 수 있으므로 검증 전 `data/` 내부 런타임 파일을 비우고 시작해도 된다.
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
기존:
object 파일을 objects/{object_id}.data로 저장

변경:
object 파일을 shards/{object_id}/shard_{index}.data로 분할 저장
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

응답에는 shard 정보가 포함되어야 한다.

확인 기준:

```text
schema_version: 2
storage_type: sharded
shard_count: 3
shards
shards[].index
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
→ shards 배열을 index 기준으로 정렬
→ shard 파일들을 순서대로 읽음
→ Buffer.concat으로 병합
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

## 예상 프로젝트 구조

Phase 3 완료 후 예상 구조는 아래와 같다.

```text
shardstore/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── cli.ts
│   ├── routes/
│   │   ├── bucket.routes.ts
│   │   └── object.routes.ts
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
│   │   └── shard/
│   │       ├── shard.service.ts
│   │       └── shard.types.ts
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
│   └── phase3.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

`src/modules/shard/`는 shard 분할/병합 로직 분리를 위해 필요한 경우 생성한다.

Phase 3에서는 다음 경로를 만들지 않는다.

```text
src/modules/migration/
experiments/ftp-socket/
src/modules/erasure/
```

## 구현 주의사항

* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Bucket API 동작을 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 유지한다.
* CLI는 shard 내부 구조를 몰라도 된다.
* 사용자 object key는 실제 파일 경로로 사용하지 않는다.
* 내부 저장 경로는 반드시 `object_id` 기준으로 구성한다.
* object 업로드 시 `objects/{object_id}.data` 원본 파일을 저장하지 않는다.
* object 업로드 시 `shards/{object_id}/shard_{index}.data` 구조로 저장한다.
* shard index는 0부터 시작한다.
* shard 파일명은 `shard_{index}.data` 형식을 사용한다.
* metadata의 shard path는 bucket 디렉토리 기준 상대 경로로 저장한다.
* 다운로드 시 metadata의 `shards` 배열을 `index` 기준으로 정렬한 뒤 병합한다.
* 병합 결과 checksum이 metadata checksum과 다르면 500 JSON 에러를 반환한다.
* object 삭제 시 metadata JSON과 shard 디렉토리를 모두 삭제한다.
* `schema_version: 2`는 새로 업로드되는 object에만 적용한다.
* 기존 `schema_version: 1` object migration은 구현하지 않는다.
* Reed-Solomon, parity shard, recovery는 구현하지 않는다.
* hot/cold tier는 구현하지 않는다.
* debug API는 구현하지 않는다.
* TCP Socket 코드는 구현하지 않는다.
* README.md는 전체 재작성하지 않는다.
* 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.

## 허용 변경 파일

우선 허용:

```text
src/modules/object/object.service.ts
src/modules/object/object.types.ts
src/modules/metadata/metadata.types.ts
src/modules/metadata/metadata.repository.ts
src/modules/storage/local-storage.ts
src/modules/storage/storage.types.ts
src/modules/checksum/sha256.ts
src/shared/*
```

필요하면 최소 범위로 추가 가능:

```text
src/modules/shard/shard.service.ts
src/modules/shard/shard.types.ts
```

테스트 수정 또는 추가 가능:

```text
src/app.test.ts
```

문서:

```text
docs/phase3.md
```

주의해서 확인할 파일:

```text
src/app.ts
src/server.ts
src/routes/*
src/modules/bucket/*
package.json
src/cli.ts
src/modules/cli/*
```

위 파일은 Phase 3 구현 때문에 꼭 필요한 경우에만 수정한다.

`package.json`, `src/cli.ts`, `src/modules/cli/*`는 기존 CLI 호환을 위한 최소 수정만 허용한다.
새 CLI 명령 추가는 하지 않는다.

## 금지 변경 파일 또는 경로

```text
src/modules/migration/**
experiments/ftp-socket/**
src/modules/erasure/**
debug API 관련 파일
Reed-Solomon 관련 파일
parity shard 관련 파일
hot/cold tier 관련 파일
README.md 전체 재작성
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

### shard 파일 생성 확인

PowerShell:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards -Recurse
```

기대 구조:

```text
data/buckets/photo-bucket/shards/{object_id}/shard_0.data
data/buckets/photo-bucket/shards/{object_id}/shard_1.data
data/buckets/photo-bucket/shards/{object_id}/shard_2.data
```

### 원본 파일 저장 제외 확인

PowerShell:

```powershell
Test-Path .\data\buckets\photo-bucket\objects
```

기대 결과:

```text
objects/ 디렉토리가 없거나, 있어도 해당 object_id.data 원본 파일이 없어야 한다.
```

더 정확히 확인하려면 object_id를 응답에서 확인한 뒤:

```powershell
Test-Path .\data\buckets\photo-bucket\objects\{object_id}.data
```

기대 결과:

```text
False
```

### Metadata 조회

```bash
pnpm cli object:meta photo-bucket 2026/06/sample.png
```

확인 기준:

```text
schema_version: 2
storage_type: sharded
shard_count: 3
shards 배열 존재
각 shard index 존재
각 shard path 존재
각 shard size 존재
각 shard checksum 존재
```

### Object 다운로드

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
원본 파일과 shard 병합 다운로드 파일의 SHA-256 checksum이 일치한다.
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

```bash
pnpm cli object:delete photo-bucket 2026/06/sample.png
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

* object 업로드 시 원본 파일이 `objects/{object_id}.data`로 저장되지 않음
* object 업로드 시 shard 파일들이 `shards/{object_id}/shard_{index}.data`로 저장됨
* metadata JSON에 `schema_version: 2` 포함
* metadata JSON에 `storage_type: "sharded"` 포함
* metadata JSON에 `shard_count: 3` 포함
* metadata JSON에 `shards` 배열 포함
* 각 shard metadata에 `index`, `path`, `size`, `checksum` 포함
* object 다운로드 시 shard 파일들을 index 순서로 병합
* 병합 결과 SHA-256 checksum이 metadata checksum과 일치
* CLI로 업로드/다운로드했을 때 원본과 복원 파일 checksum 일치
* object 삭제 시 metadata JSON과 shard 디렉토리 삭제
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 3 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

## README 처리

README.md는 현재 내용을 유지한다.

Phase 3 구현 중 README 전체 재작성은 하지 않는다.
필요한 경우 Phase 3 저장 구조나 검증 명령만 최소 수정한다.

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- Phase 2 CLI 명령이 그대로 동작하는지
- CLI 명령을 새로 추가하지 않았는지
- object 업로드 시 objects/{object_id}.data 원본 파일 저장을 하지 않는지
- object 업로드 시 shards/{object_id}/shard_{index}.data 구조로 저장하는지
- shard 파일명이 shard_{index}.data 형식인지
- shard 저장 경로가 object_id 기준인지
- 사용자 object key를 저장 경로로 사용하지 않았는지
- metadata에 schema_version: 2가 들어가는지
- metadata에 storage_type: sharded가 들어가는지
- metadata에 shard_count: 3이 들어가는지
- metadata에 shards 배열이 들어가는지
- 각 shard metadata에 index, path, size, checksum이 들어가는지
- 다운로드 시 shard를 index 순서로 병합하는지
- 병합 결과 checksum을 metadata checksum과 비교하는지
- checksum 불일치 시 500 JSON 에러를 반환하는지
- object 삭제 시 shard 디렉토리까지 삭제하는지
- Reed-Solomon, erasure, parity shard를 만들지 않았는지
- hot/cold tier를 만들지 않았는지
- migration 코드를 만들지 않았는지
- debug API를 만들지 않았는지
- FTP socket 코드를 만들지 않았는지
- README.md 전체 재작성 여부가 없는지
- pnpm typecheck가 통과하는지
- 기존 테스트가 있으면 pnpm test가 통과하는지
```
