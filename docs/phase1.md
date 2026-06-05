# 작업 지시: ShardStore Phase 1 구현

현재 프로젝트 README 기준으로 ShardStore Phase 1만 구현한다.

## 목표

Node.js + TypeScript + Express 기반으로 로컬 파일 시스템에 bucket/object를 저장하는 HTTP API를 구현한다.

Phase 1에서는 object를 shard로 분할하지 않는다.  
원본 파일 단위로 저장하고, JSON metadata와 SHA-256 checksum 검증까지만 구현한다.

## 구현 범위

구현할 기능:

- Express HTTP 서버 구성
- Bucket 생성 API
- Bucket 단건 조회 API
- Bucket 목록 조회 API
- Object 업로드 API
- Object metadata 조회 API
- Object 다운로드 API
- Object 목록 조회 API
- Object 삭제 API
- SHA-256 checksum 계산 및 다운로드 시 검증
- JSON metadata 저장
- `schema_version: 1` metadata 저장
- `data/`, `testdata/`, `ftp-data/` 런타임 파일 Git 제외

구현하지 않을 기능:

- Node.js CLI
- shard 분할
- Reed-Solomon
- hot/cold 저장
- debug API
- metadata migration script
- TCP Socket FTP 스타일 서버/클라이언트

## 기술 조건

- Language: Node.js + TypeScript
- Package manager: pnpm
- HTTP Server: Express
- File upload: multer
- Object ID: Node.js 내장 `crypto.randomUUID()`
- Checksum: SHA-256
- Metadata: JSON file
- Storage: Local filesystem
- DB 사용 금지
- Docker 사용 금지

## API

### Bucket 생성

```http
PUT /buckets/:bucketName
```

응답 예시:

```
{
  "bucket":"photo-bucket",
  "created":true
}
```

이미 존재하면 에러를 내지 말고 `created: false`를 반환한다.

### Bucket 단건 조회

```
GET /buckets/:bucketName
```

응답 예시:

```
{
  "bucket":"photo-bucket",
  "exists":true
}
```

없으면 404 반환.

### Bucket 목록 조회

```
GET /buckets
```

응답 예시:

```
{
  "buckets": ["photo-bucket"]
}
```

### Object 업로드

```
PUT /buckets/:bucketName/objects?key=2026/05/sample.jpg
Content-Type: multipart/form-data
```

multipart field name은 `file`.

응답 예시:

```
{
  "object_id":"uuid",
  "bucket":"photo-bucket",
  "key":"2026/05/sample.jpg",
  "size":123456,
  "checksum":"sha256..."
}
```

### Object metadata 조회

```
GET /buckets/:bucketName/objects/metadata?key=2026/05/sample.jpg
```

응답 예시:

```
{
  "schema_version":1,
  "object_id":"uuid",
  "bucket":"photo-bucket",
  "key":"2026/05/sample.jpg",
  "original_file_name":"sample.jpg",
  "content_type":"image/jpeg",
  "size":123456,
  "checksum":"sha256...",
  "storage_path":"objects/{object_id}.data",
  "created_at":"2026-05-25T12:00:00Z"
}
```

### Object 다운로드

```
GET /buckets/:bucketName/objects?key=2026/05/sample.jpg
```

다운로드 전에 실제 파일 SHA-256을 다시 계산하고 metadata checksum과 비교한다.

불일치하면 파일을 내려주지 말고 500 에러를 반환한다.

### Object 목록 조회

```
GET /buckets/:bucketName/objects
```

응답 예시:

```
{
  "objects": [
    {
      "object_id":"uuid",
      "key":"2026/05/sample.jpg",
      "size":123456,
      "checksum":"sha256...",
      "created_at":"2026-05-25T12:00:00Z"
    }
  ]
}
```

### Object 삭제

```
DELETE /buckets/:bucketName/objects?key=2026/05/sample.jpg
```

응답 예시:

```
{
  "deleted":true,
  "bucket":"photo-bucket",
  "key":"2026/05/sample.jpg"
}
```

object 파일과 metadata JSON을 모두 삭제한다.

## 저장 구조

Phase 1 저장 구조는 아래와 같다.

```
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   └── objects/
        │       └── {object_id}.json
        └── objects/
            └── {object_id}.data
```

## 예상 프로젝트 구조

```
shardstore/
├── src/
│   ├── app.ts
│   ├── server.ts
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
│   │   └── checksum/
│   │       └── sha256.ts
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

Phase 1에서는 `src/cli.ts`, `src/modules/migration/`, `experiments/ftp-socket/`는 만들지 않는다.

## package.json 스크립트

```
{
  "scripts": {
    "dev":"tsx watch src/server.ts",
    "start":"node dist/server.js",
    "build":"tsc",
    "typecheck":"tsc --noEmit"
  }
}
```

## .gitignore

```
node_modules/
dist/
.env
.env.*

data/*
!data/.gitkeep

testdata/*
!testdata/.gitkeep

ftp-data/*
!ftp-data/.gitkeep

.DS_Store
```

## 구현 주의사항

- 사용자 object key는 실제 파일 경로로 사용하지 않는다.
- 내부 저장 파일명은 반드시 `object_id`를 사용한다.
- bucket 이름은 로컬 디렉토리명으로 안전한 값만 허용한다.
- object metadata 조회는 Phase 1에서는 JSON 파일 전체 스캔으로 처리해도 된다.
- 큰 파일 최적화는 하지 않는다.
- multer는 Phase 1에서 `memoryStorage`를 사용해도 된다.
- `uuid` 패키지는 사용하지 않는다.
- 에러 응답은 JSON으로 반환한다.
- controller/service/repository/storage 계층을 분리한다.
- 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.
- `ftp-data/.gitkeep`는 생성해도 되지만, TCP Socket 관련 코드는 만들지 않는다.
- Phase 1에서는 src/cli.ts, src/modules/migration/, experiments/ftp-socket/는 만들지 않는다.
- 동일 bucket 안에 같은 object key가 이미 존재하면 덮어쓰지 않는다. 409 Conflict를 반환한다.
- Object metadata 조회 라우트는 `/buckets/:bucketName/objects` 라우트보다 먼저 등록한다.
- `GET /buckets/:bucketName/objects`는 `key` query가 있으면 다운로드, 없으면 목록 조회로 처리한다.

## 검증 명령

### 서버 실행
```
pnpm install
pnpm dev
```

### Bucket 생성
```
curl -X PUT http://localhost:8080/buckets/photo-bucket
```

### Bucket 조회
```
curl http://localhost:8080/buckets/photo-bucket
curl http://localhost:8080/buckets
```

### Object 업로드
```
curl -X PUT \
  -F "file=@testdata/sample.jpg" \
  "http://localhost:8080/buckets/photo-bucket/objects?key=2026/05/sample.jpg"
```

### Metadata 조회
```
curl "http://localhost:8080/buckets/photo-bucket/objects/metadata?key=2026/05/sample.jpg"
```

### Object 다운로드
```
curl -o restored.jpg \
  "http://localhost:8080/buckets/photo-bucket/objects?key=2026/05/sample.jpg"
```

### Checksum 비교
```
sha256sum testdata/sample.jpg
sha256sum restored.jpg
```

### Object 목록 조회
```
curl http://localhost:8080/buckets/photo-bucket/objects
```

### Object 삭제
```
curl -X DELETE \
  "http://localhost:8080/buckets/photo-bucket/objects?key=2026/05/sample.jpg"
```

## 완료 조건

- `pnpm dev`로 서버 실행 가능
- `pnpm typecheck` 통과
- bucket 생성/조회/목록 API 동작
- object 업로드/metadata 조회/다운로드/목록/삭제 API 동작
- metadata JSON에 `schema_version: 1` 포함
- 업로드 파일과 다운로드 파일의 SHA-256 checksum 일치
- `data/` 내부 런타임 파일이 Git에 포함되지 않음

## README 처리

README.md는 현재 내용을 유지한다.
Phase 1 구현 중 README 전체 재작성은 하지 않는다.
필요한 경우 실행 명령이나 Phase 1 관련 최소 수정만 한다.
