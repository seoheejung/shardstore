# 작업 지시: ShardStore Phase 2 구현

현재 프로젝트 README 및 Phase 1 구현 결과 기준으로 ShardStore Phase 2만 구현한다.

## 목표

Node.js + TypeScript 기반으로 ShardStore HTTP API를 호출하는 CLI를 구현한다.

Phase 2에서는 서버 내부 함수를 직접 호출하지 않는다.
CLI는 Phase 1에서 구현한 Express HTTP API를 호출하는 검증용 도구로만 동작한다.

curl 명령을 반복해서 입력하지 않고, `pnpm cli` 명령으로 bucket/object API를 검증할 수 있게 만든다.

## 구현 범위

구현할 기능:

* Node.js CLI 진입점 추가
* `pnpm cli` 실행 스크립트 추가
* Bucket 생성 CLI 명령
* Bucket 단건 조회 CLI 명령
* Bucket 목록 조회 CLI 명령
* Object 업로드 CLI 명령
* Object metadata 조회 CLI 명령
* Object 다운로드 CLI 명령
* Object 목록 조회 CLI 명령
* Object 삭제 CLI 명령
* CLI 다운로드 파일 저장
* CLI 에러 응답 JSON 출력
* HTTP 실패 시 exit code `1` 반환
* 서버 주소 환경 변수 처리
* 다운로드 파일과 원본 파일 SHA-256 checksum 비교 가능 상태 구성

구현하지 않을 기능:

* shard 분할
* Reed-Solomon
* hot/cold 저장
* debug API
* metadata migration script
* TCP Socket FTP 스타일 서버/클라이언트
* 서버 내부 저장 구조 변경
* Phase 1 HTTP API 대규모 수정
* README 전체 재작성

## 기술 조건

* Language: Node.js + TypeScript
* Package manager: pnpm
* CLI Runtime: tsx
* API 호출: HTTP
* 기본 API 주소: `http://localhost:8080`
* 서버 주소 환경 변수: `SHARDSTORE_API_URL`
* File upload: multipart/form-data
* multipart field name: `file`
* Checksum: SHA-256
* DB 사용 금지
* Docker 사용 금지
* CLI에서 server service/repository/storage 직접 호출 금지

## CLI 실행 방식

```bash
pnpm cli <command> [...args]
```

기본 서버 주소는 다음 값을 사용한다.

```text
http://localhost:8080
```

환경 변수가 있으면 해당 값을 우선 사용한다.

```bash
SHARDSTORE_API_URL=http://localhost:8080 pnpm cli bucket:list
```

Windows PowerShell에서는 다음 방식으로 검증할 수 있어야 한다.

```powershell
$env:SHARDSTORE_API_URL="http://localhost:8080"
pnpm cli bucket:list
```

환경 변수가 없으면 기본값 `http://localhost:8080`을 사용한다.

## CLI 명령

### Bucket 생성

```bash
pnpm cli bucket:create photo-bucket
```

HTTP 매핑:

```http
PUT /buckets/:bucketName
```

출력 예시:

```json
{
  "bucket": "photo-bucket",
  "created": true
}
```

이미 존재하는 bucket이면 서버 응답 그대로 출력한다.

```json
{
  "bucket": "photo-bucket",
  "created": false
}
```

### Bucket 단건 조회

```bash
pnpm cli bucket:get photo-bucket
```

HTTP 매핑:

```http
GET /buckets/:bucketName
```

출력 예시:

```json
{
  "bucket": "photo-bucket",
  "exists": true
}
```

없는 bucket이면 서버의 404 JSON 응답을 출력하고 exit code `1`로 종료한다.

### Bucket 목록 조회

```bash
pnpm cli bucket:list
```

HTTP 매핑:

```http
GET /buckets
```

출력 예시:

```json
{
  "buckets": [
    "photo-bucket"
  ]
}
```

### Object 업로드

```bash
pnpm cli object:put photo-bucket 2026/05/sample.jpg testdata/sample.jpg
```

HTTP 매핑:

```http
PUT /buckets/:bucketName/objects?key=2026/05/sample.jpg
Content-Type: multipart/form-data
```

multipart field name은 `file`을 사용한다.

출력 예시:

```json
{
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/05/sample.jpg",
  "size": 123456,
  "checksum": "sha256..."
}
```

주의사항:

* `objectKey`에는 `/`가 들어갈 수 있다.
* query string에 넣을 때 반드시 URL encode 처리한다.
* 파일 경로가 존재하지 않으면 HTTP 요청을 보내지 않고 JSON 에러를 출력한다.
* 동일 bucket 안에 같은 key가 이미 존재하면 서버의 409 응답을 그대로 출력하고 exit code `1`로 종료한다.

### Object metadata 조회

```bash
pnpm cli object:meta photo-bucket 2026/05/sample.jpg
```

HTTP 매핑:

```http
GET /buckets/:bucketName/objects/metadata?key=2026/05/sample.jpg
```

출력 예시:

```json
{
  "schema_version": 1,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/05/sample.jpg",
  "original_file_name": "sample.jpg",
  "content_type": "image/jpeg",
  "size": 123456,
  "checksum": "sha256...",
  "storage_path": "objects/{object_id}.data",
  "created_at": "2026-05-25T12:00:00Z"
}
```

### Object 다운로드

```bash
pnpm cli object:get photo-bucket 2026/05/sample.jpg restored.jpg
```

HTTP 매핑:

```http
GET /buckets/:bucketName/objects?key=2026/05/sample.jpg
```

동작:

* 서버에서 object 파일을 다운로드한다.
* 응답 body를 `outputPath`에 저장한다.
* 서버가 checksum 불일치로 500을 반환하면 파일을 저장하지 않는다.
* HTTP 실패 시 서버 JSON 에러를 출력하고 exit code `1`로 종료한다.

출력 예시:

```json
{
  "bucket": "photo-bucket",
  "key": "2026/05/sample.jpg",
  "output_path": "restored.jpg",
  "downloaded": true
}
```

### Object 목록 조회

```bash
pnpm cli object:list photo-bucket
```

HTTP 매핑:

```http
GET /buckets/:bucketName/objects
```

출력 예시:

```json
{
  "objects": [
    {
      "object_id": "uuid",
      "key": "2026/05/sample.jpg",
      "size": 123456,
      "checksum": "sha256...",
      "created_at": "2026-05-25T12:00:00Z"
    }
  ]
}
```

### Object 삭제

```bash
pnpm cli object:delete photo-bucket 2026/05/sample.jpg
```

HTTP 매핑:

```http
DELETE /buckets/:bucketName/objects?key=2026/05/sample.jpg
```

출력 예시:

```json
{
  "deleted": true,
  "bucket": "photo-bucket",
  "key": "2026/05/sample.jpg"
}
```

## Checksum 비교

Phase 2 완료 검증에서는 CLI로 다운로드한 파일과 원본 파일의 SHA-256 checksum이 일치해야 한다.

기본 검증은 OS 명령으로 수행한다.

Linux/macOS/Git Bash:

```bash
sha256sum testdata/sample.jpg
sha256sum restored.jpg
```

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.jpg -Algorithm SHA256
Get-FileHash .\restored.jpg -Algorithm SHA256
```

선택 구현으로 checksum 비교 CLI 명령을 추가할 수 있다.

```bash
pnpm cli checksum:compare testdata/sample.jpg restored.jpg
```

출력 예시:

```json
{
  "left": "testdata/sample.jpg",
  "right": "restored.jpg",
  "algorithm": "SHA-256",
  "left_checksum": "sha256...",
  "right_checksum": "sha256...",
  "matched": true
}
```

단, `checksum:compare`는 보조 기능이다.
bucket/object CLI 명령 구현이 우선이다.

## 예상 프로젝트 구조

Phase 2 완료 후 예상 구조는 아래와 같다.

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
│   │   └── cli/
│   │       ├── cli-http.ts
│   │       └── cli-output.ts
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
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

`src/modules/cli/`는 필요할 때만 만든다.

Phase 2에서는 다음 경로를 만들지 않는다.

```text
src/modules/migration/
experiments/ftp-socket/
src/modules/shard/
src/modules/erasure/
```

## package.json 스크립트

기존 스크립트는 유지하고 `cli`만 추가한다.

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "cli": "tsx src/cli.ts"
  }
}
```

기존에 `test` 스크립트가 있으면 삭제하지 않는다.

## 구현 주의사항

* CLI는 서버 내부 함수를 직접 호출하지 않는다.
* CLI는 HTTP API만 호출한다.
* `bucket.service.ts`, `object.service.ts`, `metadata.repository.ts`, `local-storage.ts`를 CLI에서 직접 import하지 않는다.
* `objectKey`는 실제 파일 경로로 사용하지 않는다.
* `objectKey`는 query parameter로 전달할 때 URL encode 처리한다.
* multipart upload field name은 반드시 `file`이다.
* HTTP 응답이 4xx 또는 5xx이면 exit code `1`로 종료한다.
* 에러 응답은 JSON으로 출력한다.
* 네트워크 연결 실패 시 서버 실행 여부를 확인할 수 있는 JSON 에러를 출력한다.
* CLI 출력은 기본적으로 JSON pretty print로 통일한다.
* Windows PowerShell에서도 명령이 동작해야 한다.
* 새 외부 패키지는 가급적 추가하지 않는다.
* `uuid` 패키지는 사용하지 않는다.
* Phase 1 저장 구조를 변경하지 않는다.
* README.md는 전체 재작성하지 않는다.
* 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.

## 허용 변경 파일

우선 허용:

```text
package.json
src/cli.ts
src/modules/checksum/sha256.ts
src/shared/*
```

필요하면 최소 범위로 추가 가능:

```text
src/modules/cli/*
```

주의해서 확인할 파일:

```text
src/app.ts
src/server.ts
src/routes/*
src/modules/bucket/*
src/modules/object/*
src/modules/metadata/*
src/modules/storage/*
```

위 파일은 CLI 구현 때문에 꼭 필요한 경우에만 수정한다.

## 금지 변경 파일 또는 경로

```text
src/modules/migration/**
experiments/ftp-socket/**
src/modules/shard/**
src/modules/erasure/**
debug API 관련 파일
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

### 서버 실행

```bash
pnpm dev
```

정상 실행 로그:

```text
ShardStore server listening on http://localhost:8080
```

### Bucket CLI 검증

다른 터미널에서 실행한다.

```bash
pnpm cli bucket:create photo-bucket
pnpm cli bucket:get photo-bucket
pnpm cli bucket:list
```

기대 결과:

```text
bucket 생성 가능
bucket 단건 조회 가능
bucket 목록 조회 가능
```

### Object CLI 검증

테스트 파일을 준비한다.

```bash
cp /path/to/sample.jpg testdata/sample.jpg
```

Object 업로드:

```bash
pnpm cli object:put photo-bucket 2026/05/sample.jpg testdata/sample.jpg
```

Metadata 조회:

```bash
pnpm cli object:meta photo-bucket 2026/05/sample.jpg
```

Object 다운로드:

```bash
pnpm cli object:get photo-bucket 2026/05/sample.jpg restored.jpg
```

Object 목록 조회:

```bash
pnpm cli object:list photo-bucket
```

Object 삭제:

```bash
pnpm cli object:delete photo-bucket 2026/05/sample.jpg
```

### Checksum 비교

Linux/macOS/Git Bash:

```bash
sha256sum testdata/sample.jpg
sha256sum restored.jpg
```

Windows PowerShell:

```powershell
Get-FileHash .\testdata\sample.jpg -Algorithm SHA256
Get-FileHash .\restored.jpg -Algorithm SHA256
```

기대 결과:

```text
업로드 원본 파일과 CLI로 다운로드한 파일의 SHA-256 checksum이 일치한다.
```

## 완료 조건

* `pnpm cli bucket:create <bucketName>` 실행 가능
* `pnpm cli bucket:get <bucketName>` 실행 가능
* `pnpm cli bucket:list` 실행 가능
* `pnpm cli object:put <bucketName> <objectKey> <filePath>` 실행 가능
* `pnpm cli object:meta <bucketName> <objectKey>` 실행 가능
* `pnpm cli object:get <bucketName> <objectKey> <outputPath>` 실행 가능
* `pnpm cli object:list <bucketName>` 실행 가능
* `pnpm cli object:delete <bucketName> <objectKey>` 실행 가능
* CLI 다운로드 파일과 원본 파일의 SHA-256 checksum 일치
* HTTP 실패 시 CLI가 exit code `1`로 종료
* 에러 응답이 JSON으로 출력
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 2 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

## README 처리

README.md는 현재 내용을 유지한다.

Phase 2 구현 중 README 전체 재작성은 하지 않는다.
필요한 경우 `pnpm cli` 실행 명령이나 Phase 2 검증 명령만 최소 수정한다.

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- CLI가 HTTP API만 호출하는지
- CLI에서 service/repository/storage를 직접 import하지 않았는지
- package.json 기존 스크립트를 삭제하지 않았는지
- cli 스크립트가 추가됐는지
- src/cli.ts가 생성됐는지
- object key에 /가 들어가도 정상 동작하는지
- multipart field name이 file인지
- 다운로드 파일이 outputPath에 저장되는지
- HTTP 4xx/5xx 응답에서 exit code 1로 종료하는지
- 네트워크 연결 실패 시 JSON 에러를 출력하는지
- shard, erasure, migration, ftp-socket 관련 파일을 만들지 않았는지
- README.md 전체 재작성 여부가 없는지
- pnpm typecheck가 통과하는지
- 기존 테스트가 있으면 pnpm test가 통과하는지
```
