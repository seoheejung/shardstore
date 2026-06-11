# 작업 지시: ShardStore Phase 8 문서화 / 시연 검증

현재 프로젝트 README, Phase 1 Bucket/Object 저장 결과, Phase 2 HTTP API 검증용 CLI 구현 결과, Phase 3 shard 분할 저장 결과, Phase 4 Reed-Solomon `k=2, m=1` 복구 구현 결과, Phase 5 Storage Tier 흉내 검증 결과, Phase 6 Metadata Migration 구현 결과, Phase 7 TCP Socket 기반 FTP 스타일 전송 실습 결과 기준으로 ShardStore Phase 8만 진행한다.

## 목표

Phase 8은 코드 구현 단계가 아니라 문서화 / 최종 시연 검증 단계다.

지금까지 구현한 ShardStore 기능이 실제 실행 흐름 기준으로 동작하는지 확인하고, 검증 결과를 `docs/phase8-verification.md`에 기록한다.

Phase 8에서는 새 기능을 구현하지 않는다.

Phase 8의 목표는 다음 흐름이 실제로 검증 가능한지 확인하는 것이다.

```text
기본 검증 실행
→ HTTP 서버 실행
→ bucket 생성
→ object 업로드
→ object metadata 조회
→ metadata schema_version: 3 확인
→ metadata storage_type: erasure_coded 확인
→ 내부 shard 파일 생성 확인
→ hot/cold 저장 위치 확인
→ 정상 object 다운로드
→ 정상 다운로드 checksum 일치 확인
→ data shard 1개 삭제
→ recovery API 실행 또는 다운로드 자동 복구 확인
→ 복구 후 object 다운로드
→ 복구 후 checksum 일치 확인
→ CLI 기반 object 업로드/다운로드 추가 검증
→ metadata migration dry-run 확인
→ migration 대상 데이터 유무 기록
→ migration 대상이 있으면 backup / schema 변환 / checksum 검증
→ migration 대상이 없으면 확인 불가 사유 기록
→ TCP socket 기반 ls/put/get/quit 시연
→ TCP socket 업로드/다운로드 checksum 일치 확인
→ object 삭제 후 shard directory cleanup 확인
→ docs/phase8-verification.md에 실제 결과 기록
```

완료 기준은 명확하다.

```text
ShardStore 최종 기능을 실제 명령 기준으로 시연할 수 있고,
검증 결과가 docs/phase8-verification.md에 기록되어야 한다.
```

Phase 8에서는 기능 코드, HTTP API, CLI 명령, migration 명령, TCP socket 구현을 변경하지 않는다.

실행 중 버그가 발견되면 기능 코드를 바로 수정하지 말고, 문제 파일과 증상을 먼저 보고한다.

---

## 구현 범위

작성 또는 검증할 내용:

* `docs/phase8-verification.md` 작성
* Phase 8 최종 시연 절차 문서화
* `pnpm typecheck` 결과 기록
* `pnpm test` 결과 기록
* HTTP 서버 실행 결과 기록
* bucket 생성 결과 기록
* object 업로드 결과 기록
* object metadata 조회 결과 기록
* metadata `schema_version: 3` 확인
* metadata `storage_type: erasure_coded` 확인
* data shard 2개 생성 확인
* parity shard 1개 생성 확인
* data shard `hot/` 저장 확인
* parity shard `cold/` 저장 확인
* 정상 object 다운로드 checksum 비교
* data shard 1개 삭제
* recovery API 실행 또는 다운로드 자동 복구 확인
* 복구 후 object 다운로드 checksum 비교
* CLI 기반 object 업로드/metadata 조회/다운로드 추가 검증
* metadata migration dry-run 확인
* migration 대상 데이터 유무 기록
* migration 대상이 있는 경우 backup 생성 확인
* migration 대상이 있는 경우 `schema_version: 3` 변환 확인
* migration 대상이 있는 경우 migration 후 다운로드 checksum 확인
* migration 대상이 없는 경우 확인 불가 사유 기록
* TCP 서버 실행 결과 기록
* TCP 클라이언트 접속 결과 기록
* TCP `ls` 결과 기록
* TCP `put` 결과 기록
* TCP `get` 결과 기록
* TCP `quit` 결과 기록
* TCP 업로드/다운로드 checksum 비교
* object 삭제 후 shard directory cleanup 확인
* 최종 시연 체크리스트 작성
* 실제 시연 결과 기록 양식 작성

작성하지 않을 내용:

* 신규 HTTP API 추가
* 기존 HTTP API 경로 변경
* 기존 Object API 동작 변경
* 기존 Bucket API 동작 변경
* 기존 Phase 2 CLI 명령 변경
* 신규 `pnpm cli` 명령 추가
* 기존 metadata migration 명령 변경
* 기존 TCP socket 서버/클라이언트 구현 변경
* shard 분할 로직 변경
* erasure coding 로직 변경
* hot/cold tier 로직 변경
* recovery 정책 변경
* debug API 변경
* `k=4, m=2` 확장 구현
* 실제 FTP 전체 프로토콜 구현
* 사용자 인증 구현
* TLS 구현
* Docker / DB / Kubernetes 도입
* README 전체 재작성

---

## 기술 조건

* Language: Node.js + TypeScript
* Package manager: pnpm
* HTTP server: Express
* CLI: 기존 Phase 2 `pnpm cli`
* Metadata migration: 기존 `pnpm migration:metadata`
* TCP socket 실습: 기존 `pnpm ftp:server`, `pnpm ftp:client`
* Checksum: SHA-256
* Object 저장 구조: 기존 `data/buckets/`
* TCP 실습 저장 구조: 기존 `ftp-data/`
* Phase 8 결과 문서: `docs/phase8-verification.md`

Phase 8은 새 의존성 추가가 필요하지 않아야 한다.

`package.json`, `pnpm-lock.yaml`은 수정하지 않는다.

---

## 저장 구조 기준

Phase 8에서는 현재 최종 저장 구조를 검증한다.

### ShardStore 본체 저장소

```text
data/
└── buckets/
    └── photo-bucket/
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

확인 기준:

```text
data shard 2개는 hot/ 아래 존재
parity shard 1개는 cold/ 아래 존재
metadata에는 schema_version: 3 저장
metadata에는 storage_type: erasure_coded 저장
```

### TCP Socket 실습 저장소

```text
ftp-data/
└── {filename}
```

확인 기준:

```text
TCP put 결과 파일은 ftp-data/ 아래 저장
TCP get 결과 파일은 클라이언트 현재 작업 디렉토리에 저장
TCP 실습 파일은 data/buckets/ 아래 저장하지 않음
TCP 실습 파일은 bucket/key/object metadata와 연결하지 않음
```

---

## API 기준

Phase 8에서는 기존 HTTP API 경로를 변경하지 않는다.

확인할 기존 HTTP API:

```text
PUT /buckets/{bucketName}
GET /buckets/{bucketName}
GET /buckets
PUT /buckets/{bucketName}/objects?key={objectKey}
GET /buckets/{bucketName}/objects?key={objectKey}
GET /buckets/{bucketName}/objects/metadata?key={objectKey}
GET /buckets/{bucketName}/objects
DELETE /buckets/{bucketName}/objects?key={objectKey}
POST /debug/objects/{objectId}/delete-shards?count=1
POST /debug/objects/{objectId}/recover
```

Phase 8에서는 새로운 HTTP API를 추가하지 않는다.

---

## CLI 기준

기존 Phase 2 CLI 명령은 유지한다.

확인할 기존 CLI 명령:

```text
pnpm cli bucket:create
pnpm cli bucket:get
pnpm cli bucket:list
pnpm cli object:put
pnpm cli object:meta
pnpm cli object:get
pnpm cli object:list
pnpm cli object:delete
```

Phase 8에서는 신규 CLI 명령을 추가하지 않는다.

---

## Metadata Migration 기준

기존 Phase 6 migration 명령은 유지한다.

```bash
pnpm migration:metadata --dry-run
pnpm migration:metadata
```

Phase 8에서는 migration 기능을 변경하지 않는다.

Phase 8에서는 migration 검증 결과만 문서에 기록한다.

중요:

```text
Phase 8 앞 단계에서 새로 업로드한 2026/06/sample.png는 이미 schema_version: 3 object이므로 migration 대상이 아니다.
```

Migration 검증은 dry-run 결과에서 확인한 `schema_version: 1` object를 별도 대상으로 사용한다.

기록용 변수:

```text
migration_bucket = dry-run 결과에서 확인한 schema_version: 1 object bucket
migration_object_id = dry-run 결과에서 확인한 schema_version: 1 object_id
migration_object_key = dry-run 결과에서 확인한 schema_version: 1 object key
```

`schema_version: 1` migration 대상 데이터가 없으면 실제 migration 성공으로 기록하지 않는다.

다음처럼 기록한다.

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

---

## TCP Socket 기준

기존 Phase 7 TCP socket 실행 명령은 유지한다.

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

Phase 8에서는 TCP socket 구현을 변경하지 않는다.

Phase 8에서는 TCP socket `ls`, `put`, `get`, `quit` 명령이 실제로 동작하는지 기록한다.

---

## 허용 변경 파일

우선 허용:

```text
docs/phase8-verification.md
```

필요한 경우에만 허용:

```text
README.md
```

README.md는 전체 재작성하지 않는다.

허용되는 README 수정은 다음 정도로 제한한다.

```text
docs/phase8-verification.md 링크 추가
Phase 8 검증 명령 요약 추가
```

---

## 금지 변경 파일 또는 경로

```text
src/**
experiments/ftp-socket/**
package.json
pnpm-lock.yaml
data/buckets/**
ftp-data/**
testdata/**
README.md 전체 재작성
bucket/object HTTP API 변경
기존 Phase 2 CLI 명령 변경
metadata migration 변경
shard 분할 변경
erasure coding 변경
hot/cold tier 변경
debug API 변경
recovery 정책 변경
TCP socket 구현 변경
```

주의:

```text
data/, ftp-data/, testdata/ 내부 파일은 런타임 검증 결과일 수 있으므로 Git에 포함하지 않는다.
```

---

## 작업 전 확인

작업 전 현재 파일 구조를 확인한다.

```bash
git branch
git status
```

확인할 항목:

```text
현재 브랜치가 feature/phase8-documentation-demo인지 확인
작업 전 변경 파일이 있는지 확인
예상치 못한 src/** 변경이 없는지 확인
```

Node.js / pnpm 버전을 기록한다.

```bash
node -v
pnpm -v
```

---

## 기본 검증 명령

### 의존성 설치

```bash
pnpm install
```

### 타입 검증

```bash
pnpm typecheck
```

기대 결과:

```text
error 없음
```

### 자동 테스트

```bash
pnpm test
```

기대 결과:

```text
fail 0
```

실패하면 실패 내용을 `docs/phase8-verification.md`에 기록하고, 기능 코드를 바로 수정하지 않는다.

---

## HTTP 서버 실행 검증

터미널 1에서 실행한다.

```bash
pnpm dev
```

기대 결과:

```text
ShardStore server listening on http://localhost:8080
```

확인 기준:

```text
HTTP 서버가 localhost:8080에서 실행됨
```

---

## Bucket 생성 검증

터미널 2에서 실행한다.

```bash
pnpm cli bucket:create photo-bucket
```

기대 결과:

```json
{
  "bucket": "photo-bucket",
  "created": true
}
```

이미 존재하는 bucket이면 다음 응답도 정상이다.

```json
{
  "bucket": "photo-bucket",
  "created": false
}
```

---

## Object 업로드 검증

테스트 파일을 확인한다.

```powershell
Test-Path .\testdata\sample.png
```

기대 결과:

```text
True
```

object를 업로드한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample.png testdata/sample.png
```

업로드 응답에서 다음 값을 기록한다.

```text
sample_object_id
bucket
key
size
checksum
```

기록용 변수:

```text
sample_object_id = 업로드 응답의 object_id
```

---

## Object Metadata 조회 검증

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
data shard 2개 존재
parity shard 1개 존재
data shard tier: hot
parity shard tier: cold
```

---

## 내부 Shard 파일 생성 확인

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

---

## Hot / Cold 저장 위치 확인

PowerShell:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_0.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\cold\parity_0.data
```

기대 결과:

```text
True
True
True
```

---

## 정상 다운로드 및 Checksum 비교

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored.png
```

PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 정상 다운로드 파일의 SHA-256 checksum이 일치한다.
```

---

## Data Shard 1개 삭제 검증

Phase 8에서는 data shard 손실 상황을 명확히 만들기 위해 `hot/shard_1.data`를 직접 삭제한다.

PowerShell:

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_1.data
```

삭제 상태를 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\cold\parity_0.data
```

기대 결과:

```text
False
True
```

확인 기준:

```text
data shard 1개는 삭제됨
cold parity shard는 유지됨
```

---

## Recovery API 또는 다운로드 자동 복구 검증

Recovery API를 실행한다.

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/{sample_object_id}/recover"
```

기대 결과 예시:

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

복구 후 data shard가 다시 생성됐는지 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}\hot\shard_1.data
```

기대 결과:

```text
True
```

다운로드 자동 복구를 지원하는 구현이라면 recovery API 없이 다운로드 단계에서 복구가 수행될 수 있다.

그 경우 실제 동작을 문서에 명확히 기록한다.

---

## 복구 후 다운로드 및 Checksum 비교

```bash
pnpm cli object:get photo-bucket 2026/06/sample.png restored-after-recovery.png
```

PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-after-recovery.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 복구 후 다운로드 파일의 SHA-256 checksum이 일치한다.
```

---

## CLI 기반 Object 업로드 / 다운로드 추가 검증

별도 object key로 CLI 흐름을 다시 검증한다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample-cli.png testdata/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-cli.png
pnpm cli object:get photo-bucket 2026/06/sample-cli.png restored-cli.png
```

checksum을 비교한다.

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\restored-cli.png -Algorithm SHA256
```

기대 결과:

```text
원본 파일과 CLI 다운로드 파일의 SHA-256 checksum이 일치한다.
```

업로드 응답에서 `cli_object_id`를 기록할 수 있으면 기록한다.

```text
cli_object_id = sample-cli.png의 object_id
```

---

## Metadata Migration Dry-run 검증

```bash
pnpm migration:metadata --dry-run
```

확인 기준:

```text
dry_run: true
scanned / migratable / skipped / failed 수치 출력
migration 대상 또는 skip 결과 출력
파일 변경 없음
backup 생성 없음
shard 생성 없음
```

문서에 기록할 항목:

```text
migration dry-run 결과
migration 대상 데이터 유무
```

---

## Migration 대상 확인

dry-run 결과에서 `schema_version: 1` migration 대상이 있는지 확인한다.

대상이 있으면 다음 값을 기록한다.

```text
migration_bucket
migration_object_id
migration_object_key
from_schema_version: 1
to_schema_version: 3
to_storage_type: erasure_coded
planned shard 경로
```

대상이 없으면 다음처럼 기록한다.

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

---

## 실제 Metadata Migration 검증

migration 대상이 있을 때만 실행한다.

```bash
pnpm migration:metadata
```

확인 기준:

```text
backup 생성
schema_version: 3 metadata 생성
storage_type: erasure_coded 저장
data shard 2개 hot/ 생성
parity shard 1개 cold/ 생성
migration report 출력
```

대상이 없으면 실행하지 않고 확인 불가 사유를 기록한다.

---

## Migration Backup 확인

migration 대상이 있을 때만 확인한다.

PowerShell:

```powershell
Get-ChildItem .\data\buckets\{migration_bucket}\metadata\backups -Recurse
```

확인 기준:

```text
migration 전 metadata JSON backup 존재
backup metadata의 schema_version이 1
backup metadata의 storage_path가 objects/{migration_object_id}.data
```

---

## Migration 후 Metadata 확인

migration 대상이 있을 때만 확인한다.

```bash
pnpm cli object:meta {migration_bucket} {migration_object_key}
```

확인 기준:

```text
schema_version: 3
storage_type: erasure_coded
migrated_from_schema_version: 1
migrated_at 존재
data shard 2개 hot/ 생성
parity shard 1개 cold/ 생성
```

---

## Migration 후 다운로드 Checksum 비교

migration 대상이 있을 때만 확인한다.

```bash
pnpm cli object:get {migration_bucket} {migration_object_key} restored-after-migration.png
```

PowerShell:

```powershell
Get-FileHash .\data\buckets\{migration_bucket}\objects\{migration_object_id}.data -Algorithm SHA256
Get-FileHash .\restored-after-migration.png -Algorithm SHA256
```

기대 결과:

```text
두 SHA-256 값이 일치한다.
```

원본 object 파일을 특정할 수 없는 경우에는 metadata 또는 migration report의 checksum과 다운로드 파일 checksum을 비교한다.

```powershell
Get-FileHash .\restored-after-migration.png -Algorithm SHA256
```

확인 기준:

```text
다운로드 파일 checksum == migrated metadata checksum
```

---

## TCP 서버 실행 검증

터미널 3에서 실행한다.

```bash
pnpm ftp:server
```

기대 결과:

```text
FTP-style TCP server listening on 127.0.0.1:2121
```

확인 기준:

```text
TCP 서버가 종료되지 않고 대기 상태 유지
포트 충돌 없음
에러 로그 없음
```

---

## TCP 클라이언트 접속 검증

터미널 4에서 실행한다.

```bash
pnpm ftp:client
```

기대 결과:

```text
connected to FTP-style TCP server
ftp>
```

확인 기준:

```text
TCP 서버에 정상 접속
명령 입력 프롬프트 표시
```

---

## TCP ls 명령 검증

TCP 클라이언트에서 실행한다.

```text
ls
```

기대 결과:

```json
{
  "files": []
}
```

또는 기존 파일이 있으면 파일 목록이 출력된다.

확인 기준:

```text
ftp-data/ 기준 파일 목록만 출력
data/buckets/ 파일이 출력되지 않음
```

---

## TCP put 명령 검증

TCP 클라이언트에서 실행한다.

```text
put testdata/sample.png
```

기대 결과:

```json
{
  "uploaded": true,
  "filename": "sample.png",
  "size": 253811,
  "checksum_matched": true
}
```

서버 저장 결과를 확인한다.

```powershell
Test-Path .\ftp-data\sample.png
```

기대 결과:

```text
True
```

---

## TCP get 명령 검증

다운로드 파일 충돌을 막기 위해 기존 루트 파일이 있으면 삭제한다.

```powershell
Remove-Item .\sample.png -ErrorAction SilentlyContinue
```

TCP 클라이언트에서 실행한다.

```text
get sample.png
```

기대 결과:

```json
{
  "downloaded": true,
  "filename": "sample.png",
  "output_path": "sample.png",
  "checksum_matched": true
}
```

다운로드 파일 존재 여부를 확인한다.

```powershell
Test-Path .\sample.png
```

기대 결과:

```text
True
```

---

## TCP Checksum 비교

PowerShell:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\ftp-data\sample.png -Algorithm SHA256
Get-FileHash .\sample.png -Algorithm SHA256
```

기대 결과:

```text
testdata/sample.png
ftp-data/sample.png
sample.png

세 파일의 SHA-256 값이 모두 일치한다.
```

---

## TCP quit 명령 검증

TCP 클라이언트에서 실행한다.

```text
quit
```

기대 결과:

```json
{
  "closed": true
}
```

확인 기준:

```text
클라이언트 연결이 정상 종료됨
서버 프로세스는 계속 실행 중
```

---

## Object 삭제 및 Cleanup 검증

시연에 사용한 object를 삭제한다.

```bash
pnpm cli object:delete photo-bucket 2026/06/sample.png
pnpm cli object:delete photo-bucket 2026/06/sample-cli.png
```

삭제 후 shard directory를 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{sample_object_id}
```

`cli_object_id`를 기록했다면 같이 확인한다.

```powershell
Test-Path .\data\buckets\photo-bucket\shards\{cli_object_id}
```

기대 결과:

```text
False
False
```

metadata 조회가 실패하는지도 확인한다.

```bash
pnpm cli object:meta photo-bucket 2026/06/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-cli.png
```

기대 결과:

```text
404 JSON 에러 출력
CLI exit code 1
```

---

## 최종 시연 체크리스트 작성 기준

성공한 항목만 `[x]`로 표시한다.

실행하지 못했거나 실패한 항목은 `[ ]`로 남기고 사유를 기록한다.

```markdown
## 최종 시연 체크리스트

| 항목 | 확인 |
| --- | --- |
| `pnpm typecheck` 통과 | [ ] |
| `pnpm test` 통과 | [ ] |
| HTTP 서버 실행 | [ ] |
| bucket 생성 | [ ] |
| object 업로드 | [ ] |
| object metadata 조회 | [ ] |
| metadata `schema_version: 3` 확인 | [ ] |
| metadata `storage_type: erasure_coded` 확인 | [ ] |
| data shard 2개 생성 확인 | [ ] |
| parity shard 1개 생성 확인 | [ ] |
| data shard `hot/` 저장 확인 | [ ] |
| parity shard `cold/` 저장 확인 | [ ] |
| 정상 다운로드 checksum 일치 | [ ] |
| data shard 1개 삭제 | [ ] |
| recovery API 또는 다운로드 자동 복구 확인 | [ ] |
| 복구 후 다운로드 성공 | [ ] |
| 복구 후 checksum 일치 | [ ] |
| CLI 기반 업로드/다운로드 검증 | [ ] |
| metadata migration dry-run 확인 | [ ] |
| migration 대상 데이터 유무 기록 | [ ] |
| migration 대상이 있는 경우 backup 생성 확인 | [ ] |
| migration 대상이 있는 경우 `schema_version: 3` 변환 확인 | [ ] |
| migration 대상이 있는 경우 다운로드 checksum 일치 확인 | [ ] |
| migration 대상이 없는 경우 확인 불가 사유 기록 | [ ] |
| TCP 서버 실행 | [ ] |
| TCP 클라이언트 접속 | [ ] |
| TCP `ls` 성공 | [ ] |
| TCP `put` 성공 | [ ] |
| TCP `get` 성공 | [ ] |
| TCP `quit` 성공 | [ ] |
| TCP 업로드/다운로드 checksum 일치 | [ ] |
| object 삭제 후 shard directory cleanup 확인 | [ ] |
```

---

## 시연 결과 기록 양식

Phase 8 시연 완료 후 실제 결과 기준으로 작성한다.

```markdown
## 시연 결과 기록

- 실행 날짜:
- 브랜치:
- Node.js 버전:
- pnpm 버전:
- pnpm typecheck 결과:
- pnpm test 결과:
- HTTP 서버 실행 결과:
- bucket 이름:
- object key:
- sample_object_id:
- cli_object_id:
- 업로드 파일:
- 업로드 파일 size:
- 업로드 파일 checksum:
- 정상 다운로드 파일 checksum:
- 복구 후 다운로드 파일 checksum:
- 생성된 data shard 경로:
- 생성된 parity shard 경로:
- 삭제한 shard:
- recovery API 또는 다운로드 자동 복구 결과:
- hot/cold 저장 위치 확인 결과:
- migration dry-run 결과:
- migration 대상 데이터:
- migration 대상 bucket:
- migration 대상 object_id:
- migration 대상 object key:
- migration backup 생성 결과:
- migration 후 schema_version 확인 결과:
- migration 후 다운로드 checksum:
- migration 대상 없음 사유:
- TCP 서버 실행 결과:
- TCP client 접속 결과:
- TCP ls 결과:
- TCP put 결과:
- TCP get 결과:
- TCP quit 결과:
- TCP checksum 비교 결과:
- 삭제 cleanup 결과:
- 실패 항목:
- 확인 불가 항목:
```

값을 확인하지 못한 항목은 비워두지 않고 다음처럼 기록한다.

```text
확인 불가: 사유
```

---

## README 처리

README.md는 현재 내용을 유지한다.

Phase 8 작업 중 README 전체 재작성은 하지 않는다.

필요한 경우 Phase 8 문서 링크나 최종 검증 명령만 최소 수정한다.

`docs/phase8-verification.md`는 짧은 요약 문서로 축약하지 않는다.

`docs/phase8-verification.md`는 기존 한국어 상세 문서 구조를 유지한다.

---

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기능 코드 수정이 없는지
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- 기존 Object API 동작이 변경되지 않았는지
- 기존 Phase 2 CLI 명령이 그대로 유지되는지
- 기존 migration:metadata 명령이 그대로 유지되는지
- 기존 TCP socket 서버/클라이언트 구현이 변경되지 않았는지
- package.json 기존 scripts가 변경되지 않았는지
- pnpm-lock.yaml이 불필요하게 변경되지 않았는지
- README.md 전체 재작성 여부가 없는지
- docs/phase8-verification.md가 생성 또는 수정됐는지
- 실제 실행하지 않은 항목을 [x]로 표시하지 않았는지
- 실패하거나 확인하지 못한 항목에 사유를 기록했는지
- sample.png를 migration 대상으로 잘못 기록하지 않았는지
- migration 대상이 없는데 migration 성공으로 기록하지 않았는지
- migration 대상이 있는 경우 bucket/object_id/key를 실제 dry-run 결과 기준으로 기록했는지
- checksum 값이 실제 Get-FileHash 출력과 일치하는지
- object_id가 실제 업로드 응답과 일치하는지
- hot/cold shard 경로가 실제 파일 경로와 일치하는지
- recovery API 또는 다운로드 자동 복구 결과가 실제 출력과 일치하는지
- TCP ls/put/get/quit 결과가 실제 출력과 일치하는지
- TCP checksum 비교 결과가 실제 출력과 일치하는지
- object 삭제 후 shard directory cleanup 결과가 실제 Test-Path 결과와 일치하는지
- data/, testdata/, ftp-data/ 내부 런타임 파일이 Git에 포함되지 않았는지
```

---

## Codex 후속 검토 요청

Phase 8 문서 작성과 검증이 끝나면 Codex에게 아래 내용을 다시 점검시킨다.

```text
방금 작성한 Phase 8 검증 기록을 실제 실행 결과 기준으로 다시 점검해줘.

확인할 항목:
- 실제 실행한 항목만 [x]로 표시했는지
- 실행하지 않은 항목을 [x]로 표시하지 않았는지
- pnpm typecheck 결과가 실제 출력과 일치하는지
- pnpm test 결과가 실제 출력과 일치하는지
- HTTP 서버 실행 결과가 실제 로그와 일치하는지
- object_id가 실제 업로드 응답 값인지
- checksum 값이 실제 Get-FileHash 출력과 일치하는지
- metadata schema_version: 3 확인 결과가 실제 metadata 응답과 일치하는지
- metadata storage_type: erasure_coded 확인 결과가 실제 metadata 응답과 일치하는지
- data shard 2개 경로가 실제 파일 경로와 일치하는지
- parity shard 1개 경로가 실제 파일 경로와 일치하는지
- data shard hot/ 저장 확인이 실제 Test-Path 결과와 일치하는지
- parity shard cold/ 저장 확인이 실제 Test-Path 결과와 일치하는지
- recovery API 또는 다운로드 자동 복구 결과가 실제 출력과 일치하는지
- 복구 후 다운로드 checksum이 원본 checksum과 일치하는지
- migration dry-run 결과가 실제 출력과 일치하는지
- migration 대상 데이터 유무를 정확히 기록했는지
- migration 대상 bucket/object_id/object key가 실제 dry-run 또는 migration report와 일치하는지
- migration 대상이 없는데 migration 성공으로 기록하지 않았는지
- migration backup 생성 결과가 실제 파일 상태와 일치하는지
- migration 후 schema_version: 3 확인 결과가 실제 metadata와 일치하는지
- migration 후 checksum 비교 결과가 실제 Get-FileHash 출력과 일치하는지
- TCP ls/put/get/quit 결과가 실제 클라이언트 출력과 일치하는지
- TCP checksum 비교 결과가 실제 Get-FileHash 출력과 일치하는지
- object 삭제 후 shard directory cleanup 결과가 실제 Test-Path 결과와 일치하는지
- README.md 전체 재작성 여부가 없는지
- 기능 코드 수정이 없는지
- 기존 HTTP API 경로 변경이 없는지
- 기존 CLI 명령 변경이 없는지
- metadata migration 구현 변경이 없는지
- TCP socket 구현 변경이 없는지

문제 있음/없음으로 나누고, 문제가 있으면 문서의 수정 필요 지점을 적어줘.
```

---

## 전체 작업 흐름

```text
VS Code에서 shardstore 폴더 열기
→ 현재 브랜치 확인
→ Phase 8 작업 브랜치 확인 또는 생성
→ Codex Chat 열기
→ Phase 8 작업 지시서 붙여넣기
→ 현재 파일 구조 확인
→ package.json scripts 확인
→ testdata/sample.png 존재 여부 확인
→ pnpm install
→ pnpm typecheck
→ pnpm test
→ pnpm dev 실행
→ CLI bucket 생성
→ CLI object 업로드
→ object_id / checksum 기록
→ object metadata 조회
→ schema_version / storage_type / coding 정보 확인
→ hot/ data shard 2개 확인
→ cold/ parity shard 1개 확인
→ 정상 다운로드
→ checksum 비교
→ data shard 1개 삭제
→ recovery API 실행 또는 다운로드 자동 복구 확인
→ 복구 후 다운로드
→ checksum 비교
→ CLI 추가 업로드/다운로드 검증
→ metadata migration dry-run 실행
→ migration 대상 데이터 유무 확인
→ migration 대상이 있으면 migration_bucket / migration_object_id / migration_object_key 기록
→ migration 대상이 있으면 실제 migration / backup / schema 변환 / checksum 검증
→ migration 대상이 없으면 확인 불가 사유 기록
→ TCP 서버 실행
→ TCP 클라이언트 접속
→ TCP ls / put / get / quit 검증
→ TCP checksum 비교
→ object 삭제
→ shard directory cleanup 확인
→ docs/phase8-verification.md에 실제 결과 기록
→ Codex 후속 검토 요청
→ git diff 확인
→ 커밋
```

---

## 완료 조건

* `docs/phase8-verification.md`가 작성된다.
* `pnpm typecheck` 결과가 기록된다.
* `pnpm test` 결과가 기록된다.
* HTTP 서버 실행 결과가 기록된다.
* bucket 생성 결과가 기록된다.
* object 업로드 결과가 기록된다.
* object metadata 조회 결과가 기록된다.
* metadata `schema_version: 3` 확인 결과가 기록된다.
* metadata `storage_type: erasure_coded` 확인 결과가 기록된다.
* data shard 2개 생성 확인 결과가 기록된다.
* parity shard 1개 생성 확인 결과가 기록된다.
* data shard `hot/` 저장 확인 결과가 기록된다.
* parity shard `cold/` 저장 확인 결과가 기록된다.
* 정상 다운로드 checksum 비교 결과가 기록된다.
* data shard 1개 삭제 결과가 기록된다.
* recovery API 또는 다운로드 자동 복구 결과가 기록된다.
* 복구 후 다운로드 checksum 비교 결과가 기록된다.
* CLI 기반 업로드/다운로드 검증 결과가 기록된다.
* metadata migration dry-run 결과가 기록된다.
* migration 대상 데이터 유무가 기록된다.
* migration 대상 데이터가 있으면 backup 생성과 `schema_version: 3` 변환 결과가 기록된다.
* migration 대상 데이터가 있으면 migration 후 다운로드 checksum 비교 결과가 기록된다.
* migration 대상 데이터가 없으면 확인 불가 사유가 기록된다.
* TCP 서버 실행 결과가 기록된다.
* TCP 클라이언트 접속 결과가 기록된다.
* TCP `ls` 결과가 기록된다.
* TCP `put` 결과가 기록된다.
* TCP `get` 결과가 기록된다.
* TCP `quit` 결과가 기록된다.
* TCP 업로드/다운로드 checksum 비교 결과가 기록된다.
* object 삭제 후 shard directory cleanup 결과가 기록된다.
* 실제 실행하지 않은 항목은 `[x]`로 표시하지 않는다.
* 실패하거나 확인하지 못한 항목은 사유를 기록한다.
* 기능 코드 변경 없이 문서화 / 시연 검증만 수행한다.
* README.md 전체 재작성은 하지 않는다.
* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 변경하지 않는다.
* 기존 metadata migration 명령을 변경하지 않는다.
* 기존 TCP socket 구현을 변경하지 않는다.
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않는다.
