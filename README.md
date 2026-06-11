# ShardStore

> S3 스타일 객체 저장소의 내부 저장 개념을 로컬 환경에서 단순화해 구현한 학습용 미니 object storage 프로젝트

## 개요

ShardStore는 AWS S3의 내부 저장 원리를 학습하기 위해 만든 로컬 객체 스토리지 프로젝트다.

파일은 `bucket/key` 기반 object로 저장되며, 내부적으로 shard로 분할된다. 일부 shard가 손실된 경우 Reed-Solomon erasure coding을 통해 원본 object 복구를 검증한다.

이 프로젝트는 실제 AWS S3를 사용하지 않으며, S3 API 전체 호환을 목표로 하지 않는다. 로컬 파일 시스템에서 bucket/key 저장 모델, shard 분할, erasure coding, hot/cold tier, metadata schema migration, CLI 검증, TCP socket 파일 전송 흐름만 단순화해 구현한다.

---

## AI Agent 활용

이 프로젝트는 OpenAI Codex를 AI 개발 보조 도구로 활용해 단계별로 구현했다.

Codex를 단순 코드 생성 도구로 사용하지 않고, Phase별 작업 지시서와 검증 기준을 먼저 작성한 뒤 제한된 범위 안에서 구현 보조, 코드 수정 제안, 테스트 보강, 문서화 보조 역할로 사용했다.

작업 흐름은 다음 기준을 따랐다.

```text
Phase별 작업 지시서 작성
→ Codex에 작업 범위 / 허용 파일 / 금지 파일 / 완료 기준 전달
→ Codex 변경 제안 확인
→ Phase 범위에 맞는 파일만 승인
→ pnpm typecheck / pnpm test 실행
→ HTTP API / CLI / TCP 수동 검증
→ 검증 결과 문서화
→ PR 체크리스트 기반 self-review
```

각 Phase에서는 다음 원칙을 유지했다.

* 구현 전 작업 범위와 제외 범위를 먼저 고정
* 기존 HTTP API 경로와 CLI 명령 변경 최소화
* Phase 범위 밖 기능 생성 금지
* 불필요한 리팩토링 제한
* README 전체 재작성 제한
* 기능 코드 변경 후 `pnpm typecheck`, `pnpm test`로 검증
* 실제 실행 결과를 기준으로 문서 기록
* 실행하지 않은 항목은 성공 처리하지 않음

Codex는 다음 작업에 활용했다.

* Phase별 구현 초안 작성
* TypeScript 코드 구조 제안
* 테스트 케이스 보강
* 범위 이탈 여부 점검
* 검증 명령 정리
* PR 설명 초안 작성
* Phase별 문서와 최종 시연 기록 정리

최종 구현 여부는 Codex 응답이 아니라 로컬 실행 결과로 판단했다.

---

## 핵심 기능

* Bucket 생성 / 조회 / 목록 조회
* Object 업로드 / 다운로드 / 목록 조회 / 삭제
* Object metadata JSON 저장
* SHA-256 checksum 검증
* Object shard 분할 저장
* Reed-Solomon `k=2, m=1` 기반 shard 1개 손실 복구
* Data shard / parity shard의 `hot/`, `cold/` 저장 위치 분리
* Metadata `schema_version` 관리
* Metadata migration dry-run / backup / 검증
* HTTP API 검증용 Node.js CLI
* Shard 손실 복구 시연용 debug API
* TCP Socket 기반 FTP 스타일 파일 전송 실습

---

## 제외 범위

* 실제 AWS S3 연동
* S3 API 전체 호환
* 여러 Storage Node 프로세스
* Coordinator 분리
* PostgreSQL / Redis / 외부 DB
* Docker Compose 기반 분산 노드 구성
* Kubernetes
* 운영용 HA
* Monitoring
* 실제 FTP 프로토콜 전체 구현
* FTP 인증 / TLS / Passive mode

---

## 아키텍처 요약

```text
Client
  |
  | HTTP API
  v
ShardStore Server
  ├── Bucket API
  ├── Object API
  ├── Metadata Store
  ├── Metadata Migration
  ├── Shard Splitter
  ├── Reed-Solomon Recovery
  └── Local File Storage
        └── data/buckets/{bucket}/
            ├── metadata/
            └── shards/
                ├── hot/
                └── cold/

Node.js CLI
  |
  | HTTP API 호출
  v
ShardStore Server

TCP Socket 실습
  ├── FTP-style TCP Server
  └── FTP-style TCP Client
```

---

## 저장 구조

최종 저장 구조는 다음과 같다.

```text
data/
└── buckets/
    └── {bucket_name}/
        ├── metadata/
        │   ├── objects/
        │   │   └── {object_id}.json
        │   └── backups/
        └── shards/
            └── {object_id}/
                ├── hot/
                │   ├── shard_0.data
                │   └── shard_1.data
                └── cold/
                    └── parity_0.data
```

* `hot/`: 원본 복원에 직접 사용하는 data shard 저장 위치
* `cold/`: 복구용 parity shard 저장 위치

`hot/cold`는 실제 S3 Storage Class 구현이 아니다. MVP에서는 data shard와 parity shard를 서로 다른 디렉토리에 배치하는 단순 계층 구조로 사용한다.

---

## Metadata 예시

최종 metadata는 `schema_version: 3` 기준이다.

```json
{
  "schema_version": 3,
  "object_id": "uuid",
  "bucket": "photo-bucket",
  "key": "2026/06/sample.png",
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
  ]
}
```

---

## API

### Bucket

```http
PUT /buckets/{bucketName}
GET /buckets/{bucketName}
GET /buckets
```

### Object

```http
PUT /buckets/{bucketName}/objects?key={objectKey}
GET /buckets/{bucketName}/objects?key={objectKey}
GET /buckets/{bucketName}/objects/metadata?key={objectKey}
GET /buckets/{bucketName}/objects
DELETE /buckets/{bucketName}/objects?key={objectKey}
```

### Debug

```http
POST /debug/objects/{objectId}/delete-shards?count=1
POST /debug/objects/{objectId}/recover
```

`debug` API는 shard 손실과 복구를 강제로 재현하기 위한 시연용 API다.

---

## CLI

CLI는 서버 내부 모듈을 직접 호출하지 않고 HTTP API만 호출한다.

```bash
pnpm cli <command> [...args]
```

지원 명령:

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

예시:

```bash
pnpm cli bucket:create photo-bucket
pnpm cli object:put photo-bucket 2026/06/sample.png testdata/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample.png
pnpm cli object:get photo-bucket 2026/06/sample.png restored.png
```

---

## TCP Socket 실습

TCP socket 기반 파일 전송 흐름을 학습하기 위해 HTTP API와 별도로 FTP 스타일 서버/클라이언트를 구현했다.

```bash
pnpm ftp:server
pnpm ftp:client
```

지원 명령:

```text
ls
put <filepath>
get <filename>
quit
```

TCP 실습 파일은 ShardStore 본체 저장소와 분리된 `ftp-data/`에 저장한다.

---

## Erasure Coding 정책

MVP 기준은 `k=2, m=1`이다.

```text
data shard: 2개
parity shard: 1개
복구 허용: shard 1개 손실
```

확장 단계에서는 `k=4, m=2` 구성을 검토할 수 있다.

---

## 기술 스택

| 구분              | 기술                   |
| --------------- | -------------------- |
| Language        | Node.js + TypeScript |
| Package Manager | pnpm                 |
| HTTP Server     | Express              |
| API             | HTTP                 |
| CLI             | Node.js CLI          |
| Metadata        | JSON file            |
| Storage         | Local filesystem     |
| Checksum        | SHA-256              |
| Recovery        | Reed-Solomon         |
| TCP 실습          | Node.js `net` module |
| Runtime         | Local single process |

---

## 로컬 실행

```bash
pnpm install
pnpm dev
```

정상 실행 로그:

```text
ShardStore server listening on http://localhost:8080
```

타입 검증:

```bash
pnpm typecheck
```

테스트:

```bash
pnpm test
```

---

## Phase 구성

| Phase   | 내용                          |
| ------- | --------------------------- |
| Phase 1 | Bucket / Object 저장          |
| Phase 2 | HTTP API 검증용 Node.js CLI    |
| Phase 3 | Object shard 분할 저장          |
| Phase 4 | Reed-Solomon `k=2, m=1` 복구  |
| Phase 5 | hot/cold Storage Tier 흉내    |
| Phase 6 | Metadata Migration          |
| Phase 7 | TCP Socket 기반 FTP 스타일 전송 실습 |
| Phase 8 | 문서화 / 최종 시연 검증              |

각 Phase의 상세 작업 지시서와 검증 기록은 `docs/` 디렉토리에 정리한다.

---

## 최종 검증 결과

Phase 8에서 최종 시연 검증을 수행했다.

검증 완료 항목:

* `pnpm typecheck` 통과
* `pnpm test` 통과
* HTTP 서버 실행 확인
* bucket/object 업로드, metadata 조회, 다운로드 검증
* `schema_version: 3`, `storage_type: erasure_coded` 확인
* data shard 2개, parity shard 1개 생성 확인
* `hot/`, `cold/` 저장 위치 확인
* shard 1개 손실 후 recovery API 복구 확인
* 복구 후 다운로드 checksum 일치 확인
* CLI 기반 업로드 / 다운로드 검증
* metadata migration dry-run 확인
* TCP socket `ls/put/get/quit` 검증
* TCP 업로드 / 다운로드 checksum 일치 확인
* object 삭제 후 shard directory cleanup 확인

자세한 검증 결과는 다음 문서에 기록한다.

```text
docs/phase8-verification.md
```

---

## Git Workflow

이 프로젝트는 기능 단위 브랜치와 PR 기반으로 변경 사항을 관리한다.

```bash
git checkout -b feature/xxx
git add .
git commit -m "feat: xxx"
git push origin feature/xxx
```

기준:

* `main` 브랜치는 실행 가능한 상태로 유지한다.
* 기능 추가, 구조 변경, 문서 수정은 별도 브랜치에서 진행한다.
* PR 체크리스트 기반으로 변경 범위를 검증한다.
* 런타임 파일은 Git에 포함하지 않는다.

---

## Runtime 파일 제외

다음 디렉토리의 실제 런타임 파일은 Git에 포함하지 않는다.

```text
data/
testdata/
ftp-data/
```

각 디렉토리는 `.gitkeep`만 유지한다.
