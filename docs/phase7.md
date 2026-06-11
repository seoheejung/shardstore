# 작업 지시: ShardStore Phase 7 TCP Socket 기반 FTP 스타일 전송 실습

현재 프로젝트 README, Phase 1 Bucket/Object 저장 결과, Phase 2 HTTP API 검증용 CLI 구현 결과, Phase 3 shard 분할 저장 결과, Phase 4 Reed-Solomon `k=2, m=1` 복구 구현 결과, Phase 5 Storage Tier 흉내 검증 결과, Phase 6 Metadata Migration 구현 결과 기준으로 ShardStore Phase 7만 진행한다.

## 목표

Node.js + TypeScript 기반 ShardStore에서 HTTP API가 아닌 TCP socket 기반의 단순 FTP 스타일 파일 전송 서버/클라이언트를 구현한다.

Phase 7은 ShardStore 본체 object storage 기능을 확장하는 단계가 아니다.

Phase 7은 TCP socket을 사용해 클라이언트가 명령어를 보내고, 서버가 파일 목록 조회, 업로드, 다운로드, 연결 종료를 처리하는 흐름을 학습하는 실습 단계다.

Phase 7에서는 Node.js `net` 모듈 기반 TCP 서버와 별도 TCP 클라이언트를 구현한다.

TCP 클라이언트는 기존 Phase 2의 `pnpm cli` HTTP API 검증용 CLI와 분리한다.

Phase 7의 목표는 다음 흐름이 실제로 동작하는지 확인하는 것이다.

```text
TCP 서버 실행
→ TCP 클라이언트 접속
→ ls 명령으로 서버 ftp-data/ 파일 목록 조회
→ put 명령으로 클라이언트 로컬 파일 업로드
→ 서버가 ftp-data/{filename}에 저장
→ get 명령으로 서버 파일 다운로드
→ 업로드 전후 SHA-256 checksum 비교
→ 다운로드 전후 SHA-256 checksum 비교
→ quit 명령으로 TCP 연결 종료
```

완료 기준은 명확하다.

```text
TCP socket을 통해 파일 업로드/다운로드가 가능하고,
전송 전후 checksum이 일치한다.
```

Phase 7에서는 ShardStore 본체 저장소인 `data/buckets/`와 TCP 실습 저장소인 `ftp-data/`를 섞지 않는다.

Phase 7에서는 bucket/key/object metadata와 TCP 전송 파일을 연결하지 않는다.

Phase 7에서는 object_id를 발급하지 않는다.

Phase 7에서는 shard 분할, erasure coding, metadata migration을 적용하지 않는다.

기존 HTTP API 경로와 Phase 2 CLI 명령은 유지해야 한다.

---

## 구현 범위

구현 또는 검증할 기능:

* Node.js `net` 모듈 기반 TCP 서버 구현
* Node.js 기반 별도 TCP 클라이언트 구현
* TCP 클라이언트는 기존 Phase 2 HTTP CLI와 분리
* `ls` 명령 처리
* `put <filepath>` 명령 처리
* `get <filename>` 명령 처리
* `quit` 명령 처리
* 서버 파일 목록 조회
* 클라이언트 로컬 파일 업로드
* 서버 파일 다운로드
* 업로드 전후 SHA-256 checksum 비교
* 다운로드 전후 SHA-256 checksum 비교
* TCP 실습 파일 저장 위치는 `ftp-data/`로 고정
* 서버 저장 파일명은 로컬 파일 경로의 basename 사용
* 서버 파일명에 디렉토리 구분자가 포함되면 `invalid filename`으로 거부
* 존재하지 않는 서버 파일 다운로드 시 JSON 에러 반환
* 존재하지 않는 로컬 파일 업로드 시 JSON 에러 반환
* 지원하지 않는 명령어 입력 시 JSON 에러 반환
* `quit` 명령으로 TCP 연결 정상 종료
* `package.json`에 TCP 서버/클라이언트 실행 script 추가
* 필요 시 `docs/phase7.md` 작성 또는 최소 수정
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* 기존 metadata migration 명령 유지
* 자동 테스트가 있다면 Phase 7 범위 내에서만 최소 추가 또는 보강

구현하지 않을 기능:

* 실제 FTP 프로토콜 전체 구현
* 사용자 인증
* TLS
* Passive mode
* Active mode
* 디렉토리 탐색
* ShardStore object 저장소 연동
* bucket/key API 연동
* object metadata 연동
* object_id 발급
* shard 분할 저장
* Reed-Solomon erasure coding 적용
* hot/cold tier 적용
* metadata migration 변경
* debug API 변경
* 기존 recovery 정책 변경
* 새로운 Object API 추가
* 기존 Object API 경로 변경
* 기존 Phase 2 CLI 명령 변경
* 새로운 `pnpm cli` 명령 추가
* DB 사용
* Docker 사용
* README 전체 재작성

---

## 기술 조건

* Language: Node.js + TypeScript
* Package manager: pnpm
* TCP server: Node.js `net` module
* TCP client: Node.js 기반 별도 클라이언트
* Checksum: SHA-256
* TCP 실습 저장 위치: `ftp-data/`
* 서버 파일명 기준: basename
* 기존 HTTP Server: Express 유지
* 기존 HTTP API 변경 금지
* 기존 Phase 2 CLI 변경 금지
* 기존 migration 명령 변경 금지
* DB 사용 금지
* Docker 사용 금지
* 새 외부 의존성 추가는 가능하면 하지 않음

Phase 7은 새 의존성 추가가 필요하지 않아야 한다.

`package.json` 변경은 TCP 서버/클라이언트 실행 script 추가 목적일 때만 허용한다.

예상 script:

```json
{
  "scripts": {
    "ftp:server": "tsx experiments/ftp-socket/ftp-server.ts",
    "ftp:client": "tsx experiments/ftp-socket/ftp-client.ts"
  }
}
```

기존 scripts는 삭제하거나 변경하지 않는다.

```json
{
  "dev": "tsx watch src/server.ts",
  "start": "node dist/server.js",
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test": "npm run build && node --test dist",
  "cli": "tsx src/cli.ts",
  "migration:metadata": "tsx src/modules/migration/metadata-migration.cli.ts"
}
```

---

## 저장 구조

Phase 7 TCP 실습은 ShardStore 본체 저장소와 분리한다.

### ShardStore 본체 저장소

기존 ShardStore object storage는 아래 구조를 사용한다.

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

Phase 7에서는 위 구조를 변경하지 않는다.

Phase 7 TCP 실습 파일을 `data/buckets/` 아래에 저장하지 않는다.

### TCP Socket 실습 저장소

Phase 7 TCP 서버는 업로드 파일을 아래 위치에 저장한다.

```text
ftp-data/
└── {filename}
```

예시:

```text
ftp-data/sample.png
```

주의사항:

```text
data/buckets/ 아래에 저장하지 않는다.
bucket/key/object metadata와 연결하지 않는다.
object_id를 발급하지 않는다.
shard 분할 또는 erasure coding을 적용하지 않는다.
metadata migration 대상에 포함하지 않는다.
```

---

## 명령어 기준

Phase 7 TCP 클라이언트는 다음 명령어만 지원한다.

| 명령어              | 설명                                        |
| ---------------- | ----------------------------------------- |
| `ls`             | 서버 `ftp-data/` 파일 목록 조회                   |
| `put <filepath>` | 클라이언트 로컬 파일을 서버 `ftp-data/`에 업로드          |
| `get <filename>` | 서버 `ftp-data/` 파일을 클라이언트 현재 작업 디렉토리에 다운로드 |
| `quit`           | TCP 연결 종료                                 |

### `ls`

서버의 `ftp-data/` 파일 목록을 조회한다.

```text
ls
```

기대 결과:

```json
{
  "files": [
    "sample.png"
  ]
}
```

`ftp-data/`가 비어 있으면 다음처럼 반환한다.

```json
{
  "files": []
}
```

### `put`

클라이언트 로컬 파일을 서버로 업로드한다.

```text
put <filepath>
```

예시:

```text
put testdata/sample.png
```

처리 흐름:

```text
클라이언트 로컬 파일 존재 확인
→ 클라이언트 파일 SHA-256 checksum 계산
→ 클라이언트가 파일명, 파일 크기, checksum, 파일 데이터를 서버로 전송
→ 서버가 ftp-data/{filename}에 저장
→ 서버 저장 파일 SHA-256 checksum 계산
→ 클라이언트 checksum과 서버 checksum 비교 결과 반환
```

서버 저장 파일명은 로컬 경로의 basename만 사용한다.

예시:

```text
put testdata/sample.png
→ 서버 저장 경로: ftp-data/sample.png
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

### `get`

서버 파일을 클라이언트로 다운로드한다.

```text
get <filename>
```

예시:

```text
get sample.png
```

처리 흐름:

```text
클라이언트가 filename 요청
→ 서버가 ftp-data/{filename} 존재 확인
→ 서버 파일 SHA-256 checksum 계산
→ 서버가 파일 데이터를 클라이언트로 전송
→ 클라이언트가 현재 작업 디렉토리에 {filename} 저장
→ 클라이언트 저장 파일 SHA-256 checksum 계산
→ 서버 checksum과 클라이언트 checksum 비교
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

주의:

```text
Phase 7의 get 명령은 get <filename> 형식으로 고정한다.
get <filename> <outputPath> 형식은 사용하지 않는다.
```

### `quit`

TCP 연결을 종료한다.

```text
quit
```

기대 결과:

```json
{
  "closed": true
}
```

---

## 파일명 및 경로 보안 기준

서버는 업로드 파일을 `ftp-data/{filename}`에 저장한다.

서버가 저장하거나 읽을 `filename`에는 디렉토리 구분자가 포함되면 안 된다.

허용:

```text
sample.png
```

금지:

```text
../sample.png
2026/06/sample.png
..\sample.png
data/buckets/photo-bucket/sample.png
```

중요:

```text
서버는 경로를 제거해서 보정하지 않는다.
경로 구분자가 포함된 filename은 invalid filename으로 거부한다.
```

`put <filepath>`는 클라이언트 로컬 파일 경로를 받는다.

따라서 클라이언트 입력 경로 자체가 `testdata/sample.png`처럼 디렉토리를 포함할 수 있다.

다만 서버 저장 시에는 basename만 사용한다.

예시:

```text
클라이언트 입력: put testdata/sample.png
서버 저장 파일명: sample.png
서버 저장 경로: ftp-data/sample.png
```

`get <filename>`은 서버 파일명을 직접 받는 명령이므로 경로 구분자를 허용하지 않는다.

예시:

```text
get ../secret.txt
→ invalid filename
```

---

## Checksum 기준

업로드와 다운로드 모두 SHA-256 checksum을 검증한다.

업로드 검증 기준:

```text
클라이언트 원본 파일 checksum == 서버 ftp-data 저장 파일 checksum
```

다운로드 검증 기준:

```text
서버 ftp-data 파일 checksum == 클라이언트 다운로드 파일 checksum
```

수동 검증 기준:

```powershell
Get-FileHash .\testdata\sample.png -Algorithm SHA256
Get-FileHash .\ftp-data\sample.png -Algorithm SHA256
Get-FileHash .\sample.png -Algorithm SHA256
```

기대 결과:

```text
세 파일의 SHA-256 값이 모두 일치한다.
```

---

## API 기준

Phase 7은 TCP 실습 단계다.

기존 HTTP API 경로를 변경하지 않는다.

```http
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

Phase 7은 새로운 HTTP API를 추가하지 않는다.

Phase 7은 기존 Object API 내부 동작을 변경하지 않는다.

---

## CLI 기준

기존 Phase 2 CLI 명령은 유지한다.

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

Phase 7 TCP 클라이언트는 기존 `pnpm cli`와 분리한다.

Phase 7 TCP 클라이언트 실행 script는 별도 script로 둔다.

예상 실행 방식:

```bash
pnpm ftp:client
```

기존 `pnpm cli` 명령이 깨지면 안 된다.

기존 `pnpm cli`에 TCP 관련 명령을 추가하지 않는다.

---

## 예상 프로젝트 구조

Phase 7 완료 후 예상 구조는 기존 Phase 6 구조에 TCP 실습 디렉토리가 추가된 형태다.

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
│   │   ├── object/
│   │   ├── metadata/
│   │   ├── storage/
│   │   ├── checksum/
│   │   ├── cli/
│   │   ├── shard/
│   │   ├── erasure/
│   │   ├── debug/
│   │   └── migration/
│   └── shared/
├── experiments/
│   └── ftp-socket/
│       ├── ftp-server.ts
│       ├── ftp-client.ts
│       └── README.md
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
│   ├── phase6.md
│   └── phase7.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── .gitignore
└── README.md
```

Phase 7에서 새로 만들 수 있는 경로:

```text
experiments/ftp-socket/**
docs/phase7.md
```

Phase 7에서 본체 저장 로직을 수정하지 않는다.

---

## 구현 주의사항

* TCP 서버와 TCP 클라이언트는 Node.js `net` 모듈을 사용한다.
* HTTP 서버, Express, fetch 기반 구현으로 TCP 실습을 대체하지 않는다.
* TCP 실습 코드는 `experiments/ftp-socket/**` 아래에 둔다.
* TCP 실습 저장 위치는 `ftp-data/`로 고정한다.
* `data/buckets/` 아래에 TCP 실습 파일을 저장하지 않는다.
* TCP 실습 파일을 bucket/key/object metadata와 연결하지 않는다.
* TCP 실습에서 object_id를 발급하지 않는다.
* TCP 실습에서 shard 분할을 하지 않는다.
* TCP 실습에서 erasure coding을 하지 않는다.
* TCP 실습에서 hot/cold tier를 사용하지 않는다.
* TCP 실습에서 metadata migration을 호출하지 않는다.
* TCP 실습 코드가 object service를 호출하지 않는다.
* TCP 실습 코드가 metadata repository를 호출하지 않는다.
* TCP 실습 코드가 storage service를 호출하지 않는다.
* TCP 실습 코드가 shard service를 호출하지 않는다.
* TCP 실습 코드가 erasure service를 호출하지 않는다.
* TCP 실습 코드가 debug service를 호출하지 않는다.
* TCP 실습 코드가 migration service를 호출하지 않는다.
* 기존 HTTP API 경로를 변경하지 않는다.
* 기존 Bucket API 동작을 변경하지 않는다.
* 기존 Object API 동작을 변경하지 않는다.
* 기존 Phase 2 CLI 명령을 변경하지 않는다.
* 기존 metadata migration 명령을 변경하지 않는다.
* 기존 recovery 정책을 변경하지 않는다.
* 실제 FTP 프로토콜 전체를 구현하지 않는다.
* 인증을 구현하지 않는다.
* TLS를 구현하지 않는다.
* Passive mode를 구현하지 않는다.
* Active mode를 구현하지 않는다.
* 디렉토리 탐색을 허용하지 않는다.
* 서버 파일명에 `/`, `\`, `..`가 포함되면 거부한다.
* `get <filename> <outputPath>` 형식을 만들지 않는다.
* `get <filename>` 형식만 지원한다.
* `put <filepath>` 업로드 시 서버 저장 파일명은 basename만 사용한다.
* 주요 함수에는 초보자가 이해할 수 있는 주석을 작성한다.
* README.md는 전체 재작성하지 않는다.

---

## 허용 변경 파일

우선 허용:

```text
experiments/ftp-socket/**
ftp-data/.gitkeep
docs/phase7.md
package.json
```

`package.json`은 TCP 서버/클라이언트 실행 script 추가 목적일 때만 허용한다.

예상 추가 script:

```json
{
  "scripts": {
    "ftp:server": "tsx experiments/ftp-socket/ftp-server.ts",
    "ftp:client": "tsx experiments/ftp-socket/ftp-client.ts"
  }
}
```

조건부 승인 대상:

```text
없음
```

Phase 7 실습에 필요한 checksum 계산, protocol parsing, 테스트 보조 로직은 가능하면 `experiments/ftp-socket/**` 안에서 처리한다.

기존 `src/modules/**`, `src/shared/**`, `src/app.test.ts` 수정 제안이 나오면 승인하지 않고, 먼저 `experiments/ftp-socket/**` 내부 구현으로 대체 가능한지 요청한다.

주의해서 확인할 파일:

```text
src/app.ts
src/server.ts
src/routes/**
src/modules/object/**
src/modules/metadata/**
src/modules/storage/**
src/modules/shard/**
src/modules/erasure/**
src/modules/debug/**
src/modules/migration/**
src/cli.ts
src/modules/cli/**
pnpm-lock.yaml
README.md
```

위 파일들은 Phase 7 구현에 직접 필요하지 않다.

수정 제안이 나오면 먼저 변경 이유를 확인한다.

기존 HTTP API, 기존 CLI, shard, erasure, debug, metadata migration 동작을 바꾸는 수정이면 승인하지 않는다.

`pnpm-lock.yaml`은 Phase 7에서 새 의존성이 필요하지 않아야 하므로 변경되면 이유를 먼저 확인한다.

---

## 금지 변경 파일 또는 경로

```text
src/modules/object/**
src/modules/metadata/**
src/modules/storage/**
src/modules/shard/**
src/modules/erasure/**
src/modules/debug/**
src/modules/migration/**
src/cli.ts
src/modules/cli/**
data/buckets/**
README.md 전체 재작성
bucket/object HTTP API 변경
기존 Phase 2 CLI 명령 변경
metadata migration 변경
shard 분할 변경
erasure coding 변경
hot/cold tier 변경
debug API 변경
recovery 정책 변경
실제 FTP 전체 프로토콜 구현
사용자 인증 구현
TLS 구현
passive mode 구현
active mode 구현
```

주의:

```text
src/modules/** 경로는 Phase 7에서 원칙적으로 수정하지 않는다.
TCP 실습 구현은 experiments/ftp-socket/** 안에서 해결한다.
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

### HTTP 서버 기존 동작 확인

필요 시 기존 서버를 실행해 기존 HTTP API가 깨지지 않았는지 확인한다.

```bash
pnpm dev
```

정상 실행 로그:

```text
ShardStore server listening on http://localhost:8080
```

Phase 7 TCP 실습은 HTTP 서버 실행과 별도다.

---

## TCP 서버 실행 검증

터미널 1에서 실행한다.

```bash
pnpm ftp:server
```

기대 결과:

```text
FTP-style TCP server listening on 127.0.0.1:2121
```

확인 기준:

```text
서버가 종료되지 않고 대기 상태 유지
포트 충돌 없음
에러 로그 없음
```

---

## TCP 클라이언트 접속 검증

터미널 2에서 실행한다.

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

## 테스트 파일 준비

PowerShell:

```powershell
Copy-Item "C:\path\to\sample.png" ".\testdata\sample.png"
```

확인:

```powershell
Test-Path .\testdata\sample.png
```

기대 결과:

```text
True
```

---

## `ls` 명령 검증

클라이언트에서 실행한다.

```text
ls
```

기대 결과:

```json
{
  "files": []
}
```

또는 `ftp-data/`에 기존 파일이 있으면 파일 목록이 출력된다.

확인 기준:

```text
ftp-data/ 기준 파일 목록만 출력
data/buckets/ 파일이 출력되지 않음
```

---

## `put` 명령 검증

클라이언트에서 실행한다.

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

PowerShell:

```powershell
Test-Path .\ftp-data\sample.png
```

기대 결과:

```text
True
```

파일 목록을 다시 조회한다.

```text
ls
```

기대 결과:

```json
{
  "files": [
    "sample.png"
  ]
}
```

---

## `get` 명령 검증

다운로드 파일 충돌을 막기 위해 기존 루트 파일이 있으면 삭제한다.

PowerShell:

```powershell
Remove-Item .\sample.png -ErrorAction SilentlyContinue
```

클라이언트에서 실행한다.

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

PowerShell:

```powershell
Test-Path .\sample.png
```

기대 결과:

```text
True
```

---

## SHA-256 checksum 비교

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

확인 기준:

```text
업로드 전 원본 == 서버 저장 파일
서버 저장 파일 == 다운로드 파일
원본 == 다운로드 파일
```

---

## `quit` 명령 검증

클라이언트에서 실행한다.

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

## 에러 처리 검증

### 존재하지 않는 서버 파일 다운로드

```text
get missing.png
```

기대 결과:

```json
{
  "error": {
    "message": "file not found"
  }
}
```

확인 기준:

```text
missing.png 파일을 만들지 않음
```

### 존재하지 않는 로컬 파일 업로드

```text
put testdata/missing.png
```

기대 결과:

```json
{
  "error": {
    "message": "local file not found"
  }
}
```

확인 기준:

```text
서버에 빈 파일을 만들지 않음
```

### 지원하지 않는 명령어

```text
pwd
```

기대 결과:

```json
{
  "error": {
    "message": "unsupported command"
  }
}
```

### 서버 파일명 경로 탐색 차단

```text
get ../secret.txt
```

기대 결과:

```json
{
  "error": {
    "message": "invalid filename"
  }
}
```

확인 기준:

```text
ftp-data/ 밖의 파일을 읽지 않음
```

---

## 기존 기능 영향 확인

Phase 7 구현 후 기존 ShardStore 기능이 깨지지 않아야 한다.

### 기존 HTTP API 경로 변경 없음

확인할 경로:

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

### 기존 Phase 2 CLI 명령 변경 없음

확인할 명령:

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

### 기존 metadata migration 명령 변경 없음

확인할 명령:

```text
pnpm migration:metadata --dry-run
pnpm migration:metadata
```

---

## 자동 테스트 기준

자동 테스트가 있다면 Phase 7 범위에서 아래 항목을 검증한다.

단, 기존 `src/app.test.ts` 수정보다는 `experiments/ftp-socket/**` 내부 테스트 또는 별도 최소 검증을 우선한다.

```text
TCP 서버가 Node.js net 모듈 기반으로 실행됨
TCP 클라이언트가 서버에 접속 가능
ls 명령으로 ftp-data/ 파일 목록 조회 가능
put 명령으로 로컬 파일 업로드 가능
put 후 ftp-data/{filename} 파일 생성
get 명령으로 서버 파일 다운로드 가능
get 후 현재 작업 디렉토리에 {filename} 생성
업로드 전후 checksum 일치
다운로드 전후 checksum 일치
quit 명령으로 연결 종료 가능
존재하지 않는 서버 파일 다운로드 시 JSON 에러 반환
존재하지 않는 로컬 파일 업로드 시 JSON 에러 반환
지원하지 않는 명령어 입력 시 JSON 에러 반환
get ../secret.txt 입력 시 invalid filename 반환
ftp-data/ 밖의 파일을 읽지 않음
data/buckets/ 저장 구조와 섞이지 않음
```

---

## 완료 조건

* TCP 서버 실행 가능
* TCP 클라이언트 접속 가능
* TCP 서버가 Node.js `net` 모듈 기반임
* TCP 클라이언트가 기존 Phase 2 HTTP CLI와 분리됨
* `ls` 명령으로 서버 파일 목록 조회 가능
* `put <filepath>` 명령으로 파일 업로드 가능
* 업로드 파일이 `ftp-data/` 아래 저장됨
* `get <filename>` 명령으로 파일 다운로드 가능
* 다운로드 파일이 클라이언트 현재 작업 디렉토리에 저장됨
* 업로드 전후 SHA-256 checksum 일치
* 다운로드 전후 SHA-256 checksum 일치
* `quit` 명령으로 연결 종료 가능
* 존재하지 않는 서버 파일 요청 시 JSON 에러 반환
* 존재하지 않는 로컬 파일 업로드 시 JSON 에러 반환
* 지원하지 않는 명령어 요청 시 JSON 에러 반환
* 서버 파일명 경로 탐색 입력 차단
* `ftp-data/` 밖의 파일을 읽지 않음
* `data/buckets/` 저장 구조와 섞이지 않음
* bucket/key/object metadata와 연결하지 않음
* object_id를 발급하지 않음
* shard 분할을 하지 않음
* erasure coding을 하지 않음
* hot/cold tier를 사용하지 않음
* metadata migration을 변경하지 않음
* debug API를 변경하지 않음
* 기존 HTTP API 경로 유지
* 기존 Phase 2 CLI 명령 유지
* 기존 `migration:metadata` 명령 유지
* 실제 FTP 전체 프로토콜 구현 없음
* 사용자 인증 구현 없음
* TLS 구현 없음
* passive mode 구현 없음
* active mode 구현 없음
* README 전체 재작성 없음
* `pnpm typecheck` 통과
* 기존 테스트가 있으면 `pnpm test` 통과
* Phase 7 범위 밖 기능이 생성되지 않음
* `data/`, `testdata/`, `ftp-data/` 내부 런타임 파일이 Git에 포함되지 않음

---

## README 처리

README.md는 현재 내용을 유지한다.

Phase 7 작업 중 README 전체 재작성은 하지 않는다.

필요한 경우 Phase 7 TCP 실습 실행 명령이나 검증 명령만 최소 수정한다.

docs/phase7.md는 짧은 요약 문서로 축약하지 않는다.

docs/phase7.md는 기존 한국어 상세 문서 구조를 유지한다.

---

## 작업 후 자체 점검

작업 완료 후 아래 항목을 확인한다.

```text
- 기존 HTTP API 경로가 변경되지 않았는지
- 기존 Bucket API 동작이 유지되는지
- 기존 Object API 동작이 변경되지 않았는지
- 기존 Phase 2 CLI 명령이 그대로 동작하는지
- 기존 migration:metadata 명령이 그대로 유지되는지
- TCP 서버가 Node.js net 모듈 기반인지
- TCP 클라이언트가 기존 pnpm cli와 분리되어 있는지
- TCP 실습 코드가 experiments/ftp-socket/ 아래에 있는지
- TCP 실습 저장 위치가 ftp-data/인지
- data/buckets/ 저장 구조와 섞이지 않았는지
- bucket/key/object metadata와 연결하지 않았는지
- object_id를 발급하지 않았는지
- shard 분할을 하지 않았는지
- erasure coding을 하지 않았는지
- hot/cold tier를 사용하지 않았는지
- metadata migration을 변경하지 않았는지
- debug API를 변경하지 않았는지
- recovery 정책을 변경하지 않았는지
- ls 명령으로 ftp-data/ 파일 목록을 조회하는지
- put <filepath> 명령으로 클라이언트 파일을 업로드하는지
- put 업로드 결과가 ftp-data/{filename}에 저장되는지
- put 업로드 시 서버 저장 파일명은 basename만 사용하는지
- get <filename> 명령으로 파일을 다운로드하는지
- get <filename> <outputPath> 형식을 만들지 않았는지
- get 다운로드 결과가 현재 작업 디렉토리의 {filename}인지
- 업로드 전후 SHA-256 checksum을 비교하는지
- 다운로드 전후 SHA-256 checksum을 비교하는지
- quit 명령으로 연결이 정상 종료되는지
- 존재하지 않는 서버 파일 다운로드 시 JSON 에러를 반환하는지
- 존재하지 않는 로컬 파일 업로드 시 JSON 에러를 반환하는지
- 지원하지 않는 명령어 입력 시 JSON 에러를 반환하는지
- get ../secret.txt 입력 시 invalid filename을 반환하는지
- ftp-data/ 밖의 파일을 읽지 않는지
- 실제 FTP 전체 프로토콜을 만들지 않았는지
- 사용자 인증을 만들지 않았는지
- TLS를 만들지 않았는지
- passive mode를 만들지 않았는지
- active mode를 만들지 않았는지
- README.md 전체 재작성 여부가 없는지
- package.json 기존 scripts를 삭제하지 않았는지
- ftp:server script가 추가됐는지
- ftp:client script가 추가됐는지
- pnpm-lock.yaml이 불필요하게 변경되지 않았는지
- pnpm typecheck가 통과하는지
- 기존 테스트가 있으면 pnpm test가 통과하는지
```
