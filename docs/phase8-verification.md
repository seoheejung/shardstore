# ShardStore Phase 8 최종 시연 검증 기록

## 1. 검증 개요

- 실행 날짜: 2026-06-12 (Asia/Seoul)
- 브랜치: `feature/phase8-documentation-demo`
- Node.js 버전: `v20.19.6`
- pnpm 버전: `9.15.9`
- 작업 범위: 문서화 / 최종 시연 검증
- 결과 기록 파일: `docs/phase8-verification.md`
- 기능 코드 수정 여부: 수정하지 않음
- README.md 수정 여부: 수정하지 않음
- `docs/phase8.md` 수정 여부: 수정하지 않음

## 2. 작업 전 확인

### 브랜치 / Git 상태

```text
git branch --show-current
feature/phase8-documentation-demo

git status --short
?? docs/phase8.md
```

작업 전 변경 파일은 추적되지 않은 `docs/phase8.md`뿐이었다. 이 파일은 Phase 8 작업지시서로 참고만 했고 수정하지 않았다.

### 파일 구조 확인

프로젝트 루트에서 확인한 주요 항목:

```text
.git/
.github/
data/
dist/
docs/
experiments/
ftp-data/
node_modules/
src/
testdata/
package.json
pnpm-lock.yaml
README.md
tsconfig.json
```

### package.json scripts 확인

```json
{
  "dev": "tsx watch src/server.ts",
  "start": "node dist/server.js",
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "cli": "tsx src/cli.ts",
  "ftp:server": "tsx experiments/ftp-socket/ftp-server.ts",
  "ftp:client": "tsx experiments/ftp-socket/ftp-client.ts",
  "migration:metadata": "tsx src/modules/migration/metadata-migration.cli.ts",
  "test": "npm run build && node --test dist"
}
```

### docs/ 폴더 확인

```text
phase1.md
phase2.md
phase3.md
phase4.md
phase5.md
phase6.md
phase7.md
phase8.md
```

### testdata/ 확인

```text
.gitkeep
sample.png
```

`testdata/sample.png` 존재 여부:

```text
True
```

검증에 사용한 업로드 파일:

```text
testdata/sample.png
size: 253811 bytes
SHA-256: FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15
```

## 3. 기본 검증 결과

### pnpm typecheck

명령:

```bash
pnpm typecheck
```

결과:

```text
> shardstore@0.1.0 typecheck D:\01_Programming\11_Infra\Shardstore
> tsc --noEmit
```

판정:

```text
성공: TypeScript typecheck error 없음
```

### pnpm test

명령:

```bash
pnpm test
```

결과:

```text
TAP version 13
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1622.6738
```

판정:

```text
성공: 8개 테스트 통과, fail 0
```

## 4. HTTP 서버 실행 검증

명령:

```bash
pnpm dev
```

실행 방식:

```text
백그라운드 프로세스로 실행
stdout/stderr 로그를 temp 파일로 기록
curl.exe http://localhost:8080/buckets 로 응답 확인
```

HTTP 서버 PID:

```text
2896
```

HTTP 서버 stdout 로그 경로:

```text
C:\Users\user\AppData\Local\Temp\shardstore-phase8-http.out.log
```

HTTP 서버 stderr 로그 경로:

```text
C:\Users\user\AppData\Local\Temp\shardstore-phase8-http.err.log
```

stdout 로그:

```text
> shardstore@0.1.0 dev D:\01_Programming\11_Infra\Shardstore
> tsx watch src/server.ts

ShardStore server listening on http://localhost:8080
```

서버 응답 확인:

```text
curl.exe -s -i http://localhost:8080/buckets

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"buckets":["photo-bucket"]}
```

판정:

```text
성공: localhost:8080 HTTP 서버 응답 확인
```

참고:

```text
sandbox 내부에서 pnpm dev 실행 시 tsx/esbuild child process 생성이 spawn EPERM으로 실패했다.
승인된 외부 실행으로 동일 명령을 백그라운드 실행하여 검증했다.
```

## 5. Bucket 검증

명령:

```bash
pnpm cli bucket:create photo-bucket
```

결과:

```json
{
  "bucket": "photo-bucket",
  "created": false
}
```

판정:

```text
성공: bucket이 이미 존재하며 조회 가능한 상태
```

추가 확인:

```bash
pnpm cli bucket:get photo-bucket
pnpm cli bucket:list
```

결과:

```json
{
  "bucket": "photo-bucket",
  "exists": true
}
```

```json
{
  "buckets": [
    "photo-bucket"
  ]
}
```

## 6. Object 업로드 검증

### 기존 key 상태

지시서의 예시 key인 `2026/06/sample.png`는 이미 존재했다.

```bash
pnpm cli object:put photo-bucket 2026/06/sample.png testdata/sample.png
```

결과:

```json
{
  "error": {
    "code": "object_already_exists",
    "message": "Object key already exists"
  }
}
```

기존 object metadata 확인 결과:

```text
object_id: abf90ba3-012c-4d56-abe9-48d9e9710d80
key: 2026/06/sample.png
schema_version: 3
storage_type: erasure_coded
migrated_from_schema_version: 1
```

기존 데이터를 삭제하거나 덮어쓰지 않기 위해 Phase 8 검증용 신규 key를 사용했다.

### Phase 8 검증용 object 업로드

명령:

```bash
pnpm cli object:put photo-bucket 2026/06/sample-phase8.png testdata/sample.png
```

결과:

```json
{
  "object_id": "2240ff36-42f8-416a-880c-69b3c21bf81c",
  "bucket": "photo-bucket",
  "key": "2026/06/sample-phase8.png",
  "size": 253811,
  "checksum": "fb66b55439c331d6734f763ca2ec66784c6a45976a1de1cdac7cd24c0858aa15"
}
```

기록값:

```text
bucket 이름: photo-bucket
object key: 2026/06/sample-phase8.png
sample_object_id: 2240ff36-42f8-416a-880c-69b3c21bf81c
업로드 파일: testdata/sample.png
업로드 파일 size: 253811
업로드 파일 checksum: fb66b55439c331d6734f763ca2ec66784c6a45976a1de1cdac7cd24c0858aa15
```

## 7. Object Metadata 검증

명령:

```bash
pnpm cli object:meta photo-bucket 2026/06/sample-phase8.png
```

핵심 결과:

```json
{
  "schema_version": 3,
  "object_id": "2240ff36-42f8-416a-880c-69b3c21bf81c",
  "bucket": "photo-bucket",
  "key": "2026/06/sample-phase8.png",
  "size": 253811,
  "checksum": "fb66b55439c331d6734f763ca2ec66784c6a45976a1de1cdac7cd24c0858aa15",
  "storage_type": "erasure_coded",
  "coding": {
    "algorithm": "reed-solomon",
    "data_shards": 2,
    "parity_shards": 1,
    "total_shards": 3,
    "recoverable_shard_loss": 1
  }
}
```

shards:

```text
data shard 0:
  tier: hot
  path: shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_0.data
  size: 126906
  checksum: 6e1613f8538bc6ce116ce03cc6e161efe780c5a7d5c05b314e081825f79cc57a

data shard 1:
  tier: hot
  path: shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data
  size: 126906
  checksum: 16ea0bf84ad3a1654213d1dd88b97cbeeb145daa8a331c2ca649a5f9697dd0fd

parity shard 0:
  tier: cold
  path: shards/2240ff36-42f8-416a-880c-69b3c21bf81c/cold/parity_0.data
  size: 126906
  checksum: 571565272502808021181e5a81fe5ba7d53c6296233f9d9cfaa3ad69cb4af249
```

판정:

```text
성공: schema_version: 3 확인
성공: storage_type: erasure_coded 확인
성공: reed-solomon k=2, m=1 metadata 확인
성공: data shard 2개, parity shard 1개 metadata 확인
성공: data shard tier hot, parity shard tier cold 확인
```

## 8. 내부 shard 파일 생성 / hot-cold 위치 검증

명령:

```powershell
Get-ChildItem .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c -Recurse
```

생성된 data shard 경로:

```text
data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_0.data
data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data
```

생성된 parity shard 경로:

```text
data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/cold/parity_0.data
```

Hot / Cold 저장 위치 확인:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c\hot\shard_0.data
Test-Path .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c\hot\shard_1.data
Test-Path .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c\cold\parity_0.data
```

결과:

```text
True
True
True
```

판정:

```text
성공: data shard 2개 hot/ 아래 생성 확인
성공: parity shard 1개 cold/ 아래 생성 확인
성공: 총 shard 3개 확인
```

## 9. 정상 다운로드 / checksum 검증

명령:

```bash
pnpm cli object:get photo-bucket 2026/06/sample-phase8.png phase8-restored.png
```

결과:

```json
{
  "bucket": "photo-bucket",
  "key": "2026/06/sample-phase8.png",
  "output_path": "phase8-restored.png",
  "downloaded": true
}
```

checksum 비교:

```text
testdata/sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15

phase8-restored.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15
```

판정:

```text
성공: 정상 다운로드 파일 checksum이 원본과 일치
```

## 10. Data shard 삭제 / Recovery 검증

삭제 대상:

```text
data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data
```

직접 삭제 시도:

```powershell
Remove-Item .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c\hot\shard_1.data
```

결과:

```text
Access to the path ...\hot\shard_1.data is denied.
```

직접 삭제는 Windows 파일 권한 문제로 실패했다. 기능 코드는 수정하지 않고, 기존 debug API로 shard 손실 상태를 만들었다.

기존 debug API:

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/2240ff36-42f8-416a-880c-69b3c21bf81c/delete-shards?count=1"
```

결과:

```json
{
  "object_id": "2240ff36-42f8-416a-880c-69b3c21bf81c",
  "deleted_count": 1,
  "deleted_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data"
    }
  ]
}
```

Recovery API:

```bash
curl.exe -X POST "http://localhost:8080/debug/objects/2240ff36-42f8-416a-880c-69b3c21bf81c/recover"
```

결과:

```json
{
  "object_id": "2240ff36-42f8-416a-880c-69b3c21bf81c",
  "recovered": true,
  "recovered_shards": [
    {
      "role": "data",
      "tier": "hot",
      "index": 1,
      "path": "shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data"
    }
  ],
  "checksum_matched": true
}
```

복구 후 shard 존재 확인:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c\hot\shard_1.data
```

결과:

```text
True
```

판정:

```text
성공: 기존 debug API로 data shard 1개 삭제 확인
성공: recovery API로 hot/shard_1.data 복구 확인
성공: recovery API checksum_matched: true 확인
```

주의:

```text
삭제 직후 Test-Path False 확인은 recovery API와 병렬 실행되어 별도 증거로 남기지 못했다.
삭제 성공 여부는 delete-shards API 응답의 deleted_count: 1 및 deleted_shards 값으로 기록한다.
```

## 11. 복구 후 다운로드 / checksum 검증

명령:

```bash
pnpm cli object:get photo-bucket 2026/06/sample-phase8.png phase8-restored-after-recovery.png
```

결과:

```json
{
  "bucket": "photo-bucket",
  "key": "2026/06/sample-phase8.png",
  "output_path": "phase8-restored-after-recovery.png",
  "downloaded": true
}
```

checksum 비교:

```text
testdata/sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15

phase8-restored-after-recovery.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15
```

판정:

```text
성공: 복구 후 다운로드 성공
성공: 복구 후 다운로드 checksum이 원본과 일치
```

## 12. CLI 기반 추가 object 검증

명령:

```bash
pnpm cli object:put photo-bucket 2026/06/sample-cli-phase8.png testdata/sample.png
pnpm cli object:meta photo-bucket 2026/06/sample-cli-phase8.png
pnpm cli object:get photo-bucket 2026/06/sample-cli-phase8.png phase8-restored-cli.png
```

업로드 결과:

```json
{
  "object_id": "d5f0e0c0-c2db-4334-8bd2-81163e348937",
  "bucket": "photo-bucket",
  "key": "2026/06/sample-cli-phase8.png",
  "size": 253811,
  "checksum": "fb66b55439c331d6734f763ca2ec66784c6a45976a1de1cdac7cd24c0858aa15"
}
```

기록값:

```text
cli_object_id: d5f0e0c0-c2db-4334-8bd2-81163e348937
```

metadata 핵심 확인:

```text
schema_version: 3
storage_type: erasure_coded
coding.algorithm: reed-solomon
coding.data_shards: 2
coding.parity_shards: 1
coding.total_shards: 3
data shard tier: hot
parity shard tier: cold
```

다운로드 결과:

```json
{
  "bucket": "photo-bucket",
  "key": "2026/06/sample-cli-phase8.png",
  "output_path": "phase8-restored-cli.png",
  "downloaded": true
}
```

checksum 비교:

```text
testdata/sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15

phase8-restored-cli.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15
```

판정:

```text
성공: CLI 기반 object 업로드 / metadata 조회 / 다운로드 검증
성공: CLI 다운로드 checksum이 원본과 일치
```

## 13. Metadata Migration dry-run 검증

명령:

```bash
pnpm migration:metadata --dry-run
```

결과:

```json
{
  "dry_run": true,
  "scanned": 3,
  "migratable": 0,
  "skipped": 3,
  "failed": 0,
  "items": [
    {
      "object_id": "2240ff36-42f8-416a-880c-69b3c21bf81c",
      "bucket": "photo-bucket",
      "key": "2026/06/sample-phase8.png",
      "schema_version": 3,
      "status": "skipped",
      "reason": "already current schema"
    },
    {
      "object_id": "abf90ba3-012c-4d56-abe9-48d9e9710d80",
      "bucket": "photo-bucket",
      "key": "2026/06/sample.png",
      "schema_version": 3,
      "status": "skipped",
      "reason": "already current schema"
    },
    {
      "object_id": "d5f0e0c0-c2db-4334-8bd2-81163e348937",
      "bucket": "photo-bucket",
      "key": "2026/06/sample-cli-phase8.png",
      "schema_version": 3,
      "status": "skipped",
      "reason": "already current schema"
    }
  ]
}
```

판정:

```text
성공: dry_run: true 확인
성공: scanned / migratable / skipped / failed 수치 확인
성공: schema_version 1 migration 대상 데이터 없음 확인
```

Migration 대상 데이터:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

Migration 대상 bucket:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

Migration 대상 object_id:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

Migration 대상 object key:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음
```

Migration backup 생성 결과:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음. 실제 migration 명령은 실행하지 않음.
```

Migration 후 schema_version 확인 결과:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음. 실제 migration 명령은 실행하지 않음.
```

Migration 후 다운로드 checksum:

```text
확인 불가: schema_version 1 migration 대상 데이터 없음. 실제 migration 명령은 실행하지 않음.
```

Migration 대상 없음 사유:

```text
dry-run 결과 scanned: 3, migratable: 0, skipped: 3, failed: 0.
모든 object가 schema_version: 3 이며 reason: already current schema 로 skip 됨.
```

## 14. TCP Socket 검증

### TCP 서버 실행

명령:

```bash
pnpm ftp:server
```

실행 방식:

```text
백그라운드 프로세스로 실행
stdout/stderr 로그를 temp 파일로 기록
netstat으로 127.0.0.1:2121 LISTEN 확인
```

TCP 서버 PID:

```text
11660
```

TCP 서버 stdout 로그 경로:

```text
C:\Users\user\AppData\Local\Temp\shardstore-phase8-ftp.out.log
```

TCP 서버 stderr 로그 경로:

```text
C:\Users\user\AppData\Local\Temp\shardstore-phase8-ftp.err.log
```

stdout 로그:

```text
> shardstore@0.1.0 ftp:server D:\01_Programming\11_Infra\Shardstore
> tsx experiments/ftp-socket/ftp-server.ts

FTP-style TCP server listening on 127.0.0.1:2121
```

판정:

```text
성공: TCP 서버가 127.0.0.1:2121에서 LISTEN
```

### TCP client 접속 / ls

명령:

```bash
pnpm ftp:client
```

비대화식 입력:

```text
ls
```

결과:

```text
connected to FTP-style TCP server
ftp> {
  "files": [
    "sample.png"
  ]
}
```

판정:

```text
성공: TCP client 접속 확인
성공: TCP ls 결과가 ftp-data/ 기준 파일 목록만 반환함
```

참고:

```text
이 환경에서 pnpm ftp:client에 여러 줄 stdin을 redirect하면 첫 번째 ls 이후 readline was closed 오류가 발생했다.
put/get/quit는 기능 코드 수정 없이 같은 FtpSocketClient 모듈의 executeCommand로 검증했다.
```

### TCP put / get / quit

검증 방식:

```bash
pnpm exec tsx -e "... connectFtpClient(); executeCommand('put testdata/sample.png'); executeCommand('get sample.png'); executeCommand('quit') ..."
```

결과:

```json
[
  {
    "uploaded": true,
    "filename": "sample.png",
    "size": 253811,
    "checksum_matched": true
  },
  {
    "downloaded": true,
    "filename": "sample.png",
    "output_path": "sample.png",
    "checksum_matched": true
  },
  {
    "closed": true
  }
]
```

서버 저장 결과:

```powershell
Test-Path .\ftp-data\sample.png
True
```

클라이언트 다운로드 결과:

```powershell
Test-Path .\sample.png
True
```

TCP checksum 비교:

```text
testdata/sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15

ftp-data/sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15

sample.png
FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15
```

판정:

```text
성공: TCP put 성공
성공: TCP get 성공
성공: TCP quit 성공
성공: TCP 업로드/다운로드 checksum 일치
```

## 15. Object 삭제 / shard directory cleanup 검증

삭제 명령:

```bash
pnpm cli object:delete photo-bucket 2026/06/sample-phase8.png
pnpm cli object:delete photo-bucket 2026/06/sample-cli-phase8.png
```

삭제 결과:

```json
{
  "deleted": true,
  "bucket": "photo-bucket",
  "key": "2026/06/sample-phase8.png"
}
```

```json
{
  "deleted": true,
  "bucket": "photo-bucket",
  "key": "2026/06/sample-cli-phase8.png"
}
```

shard directory cleanup 확인:

```powershell
Test-Path .\data\buckets\photo-bucket\shards\2240ff36-42f8-416a-880c-69b3c21bf81c
Test-Path .\data\buckets\photo-bucket\shards\d5f0e0c0-c2db-4334-8bd2-81163e348937
```

결과:

```text
False
False
```

metadata 조회 실패 확인:

```bash
pnpm cli object:meta photo-bucket 2026/06/sample-phase8.png
pnpm cli object:meta photo-bucket 2026/06/sample-cli-phase8.png
```

결과:

```json
{
  "error": {
    "code": "object_not_found",
    "message": "Object not found"
  }
}
```

```text
CLI exit code 1
```

삭제 cleanup 결과:

```text
성공: 두 object 삭제 성공
성공: 두 object shard directory 제거 확인
성공: 삭제 후 metadata 조회 object_not_found 및 CLI exit code 1 확인
```

## 16. 최종 시연 체크리스트

| 항목 | 확인 |
| --- | --- |
| `pnpm typecheck` 통과 | [x] |
| `pnpm test` 통과 | [x] |
| HTTP 서버 실행 | [x] |
| bucket 생성 | [x] |
| object 업로드 | [x] |
| object metadata 조회 | [x] |
| metadata `schema_version: 3` 확인 | [x] |
| metadata `storage_type: erasure_coded` 확인 | [x] |
| data shard 2개 생성 확인 | [x] |
| parity shard 1개 생성 확인 | [x] |
| data shard `hot/` 저장 확인 | [x] |
| parity shard `cold/` 저장 확인 | [x] |
| 정상 다운로드 checksum 일치 | [x] |
| data shard 1개 삭제 | [x] |
| recovery API 또는 다운로드 자동 복구 확인 | [x] |
| 복구 후 다운로드 성공 | [x] |
| 복구 후 checksum 일치 | [x] |
| CLI 기반 업로드/다운로드 검증 | [x] |
| metadata migration dry-run 확인 | [x] |
| migration 대상 데이터 유무 기록 | [x] |
| migration 대상이 있는 경우 backup 생성 확인 | [ ] |
| migration 대상이 있는 경우 `schema_version: 3` 변환 확인 | [ ] |
| migration 대상이 있는 경우 다운로드 checksum 일치 확인 | [ ] |
| migration 대상이 없는 경우 확인 불가 사유 기록 | [x] |
| TCP 서버 실행 | [x] |
| TCP 클라이언트 접속 | [x] |
| TCP `ls` 성공 | [x] |
| TCP `put` 성공 | [x] |
| TCP `get` 성공 | [x] |
| TCP `quit` 성공 | [x] |
| TCP 업로드/다운로드 checksum 일치 | [x] |
| object 삭제 후 shard directory cleanup 확인 | [x] |

## 17. 시연 결과 기록

- 실행 날짜: 2026-06-12 (Asia/Seoul)
- 브랜치: `feature/phase8-documentation-demo`
- Node.js 버전: `v20.19.6`
- pnpm 버전: `9.15.9`
- pnpm typecheck 결과: 성공, `tsc --noEmit` error 없음
- pnpm test 결과: 성공, tests 8 / pass 8 / fail 0
- HTTP 서버 실행 결과: 성공, `ShardStore server listening on http://localhost:8080`, `/buckets` 200 응답 확인
- HTTP 서버 PID: `2896`
- HTTP 서버 stdout 로그 경로: `C:\Users\user\AppData\Local\Temp\shardstore-phase8-http.out.log`
- HTTP 서버 stderr 로그 경로: `C:\Users\user\AppData\Local\Temp\shardstore-phase8-http.err.log`
- bucket 이름: `photo-bucket`
- object key: `2026/06/sample-phase8.png`
- sample_object_id: `2240ff36-42f8-416a-880c-69b3c21bf81c`
- cli_object_id: `d5f0e0c0-c2db-4334-8bd2-81163e348937`
- 업로드 파일: `testdata/sample.png`
- 업로드 파일 size: `253811`
- 업로드 파일 checksum: `fb66b55439c331d6734f763ca2ec66784c6a45976a1de1cdac7cd24c0858aa15`
- 정상 다운로드 파일 checksum: `FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15`
- 복구 후 다운로드 파일 checksum: `FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15`
- 생성된 data shard 경로: `data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_0.data`, `data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data`
- 생성된 parity shard 경로: `data/buckets/photo-bucket/shards/2240ff36-42f8-416a-880c-69b3c21bf81c/cold/parity_0.data`
- 삭제한 shard: `shards/2240ff36-42f8-416a-880c-69b3c21bf81c/hot/shard_1.data`
- recovery API 또는 다운로드 자동 복구 결과: recovery API 성공, `recovered: true`, `checksum_matched: true`
- hot/cold 저장 위치 확인 결과: `True`, `True`, `True`
- migration dry-run 결과: `dry_run: true`, `scanned: 3`, `migratable: 0`, `skipped: 3`, `failed: 0`
- migration 대상 데이터: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 대상 bucket: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 대상 object_id: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 대상 object key: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration backup 생성 결과: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 후 schema_version 확인 결과: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 후 다운로드 checksum: `확인 불가: schema_version 1 migration 대상 데이터 없음`
- migration 대상 없음 사유: dry-run 결과 모든 object가 `schema_version: 3`, `reason: already current schema`
- TCP 서버 실행 결과: 성공, `FTP-style TCP server listening on 127.0.0.1:2121`
- TCP client 접속 결과: 성공, `connected to FTP-style TCP server`
- TCP `ls` 결과: 성공, `{"files":["sample.png"]}`
- TCP `put` 결과: 성공, `uploaded: true`, `filename: sample.png`, `size: 253811`, `checksum_matched: true`
- TCP `get` 결과: 성공, `downloaded: true`, `filename: sample.png`, `output_path: sample.png`, `checksum_matched: true`
- TCP `quit` 결과: 성공, `closed: true`
- TCP checksum 비교 결과: `testdata/sample.png`, `ftp-data/sample.png`, `sample.png` 모두 `FB66B55439C331D6734F763CA2EC66784C6A45976A1DE1CDAC7CD24C0858AA15`
- 삭제 cleanup 결과: `Test-Path` 결과 `False`, `False`; metadata 조회 `object_not_found`, CLI exit code 1
- 실패 항목: `2026/06/sample.png` 신규 업로드는 기존 object 존재로 `object_already_exists`; 직접 `Remove-Item` shard 삭제는 Windows access denied; `pnpm ftp:client` redirected stdin은 `ls` 이후 `readline was closed`
- 확인 불가 항목: schema_version 1 migration 대상 없음으로 실제 migration / backup 생성 / migration 후 schema 변환 / migration 후 checksum 비교 확인 불가

## 18. 작업 후 자체 점검

- 기능 코드 수정 여부: 수정하지 않음
- 기존 HTTP API 경로 변경 여부: 변경하지 않음
- 기존 Bucket API 동작 변경 여부: 변경하지 않음
- 기존 Object API 동작 변경 여부: 변경하지 않음
- 기존 Phase 2 CLI 명령 변경 여부: 변경하지 않음
- 기존 metadata migration 명령 변경 여부: 변경하지 않음
- 기존 TCP socket 서버/클라이언트 구현 변경 여부: 변경하지 않음
- `package.json` 수정 여부: 수정하지 않음
- `pnpm-lock.yaml` 수정 여부: 수정하지 않음
- README.md 전체 재작성 여부: 수정하지 않음
- `docs/phase8.md` 수정 여부: 수정하지 않음
- `docs/phase8-verification.md` 작성 여부: 작성함
- 실제 실행하지 않은 항목 체크 여부: schema_version 1 migration 대상 필요 항목은 체크하지 않음
- migration 대상 없음 기록 여부: 기록함
- runtime 산출물 처리: `phase8-restored.png`, `phase8-restored-after-recovery.png`, `phase8-restored-cli.png`, `sample.png` 삭제 완료
