# ShardStore

> S3 스타일의 객체 저장 방식을 로컬 환경에서 단순 구현하는 학습용 미니 객체 스토리지

## 개요

ShardStore는 AWS S3의 내부 저장 개념을 학습용으로 단순화한 로컬 객체 스토리지이다.

파일은 `bucket/key` 기반 object로 저장되며, 내부적으로 여러 shard로 분할된다. 일부 shard가 손실된 경우 Reed-Solomon erasure coding을 통해 원본 object 복구를 검증한다.

이 프로젝트는 실제 AWS S3를 사용하지 않으며, S3 자체를 완전히 구현하지 않는다. 로컬 파일 시스템에서 bucket/key 저장 모델, shard 분할, erasure coding, hot/cold tier 개념만 단순화해 구현한다.

---

## 핵심 기능

- bucket 생성 및 조회
- bucket/key 기반 object 업로드, 다운로드, 삭제
- object metadata JSON 저장
- SHA-256 checksum 검증
- object shard 분할 및 병합
- Reed-Solomon `k=2, m=1` 기반 shard 손실 복구
- data shard와 parity shard의 hot/cold 디렉토리 분리
- shard 손실 복구 시연용 debug API

---

## 제외 범위

- AWS S3 연동
- 여러 Storage Node 프로세스
- Coordinator 분리
- PostgreSQL
- Kubernetes
- Docker Compose 기반 분산 노드 구성
- 운영용 HA
- Monitoring

---

## 구조

```text
Client
  |
  | HTTP API
  v
ShardStore Server
  ├── Bucket API
  ├── Object API
  ├── Metadata Store
  ├── Shard Splitter
  ├── Reed-Solomon Recovery
  └── Local File Storage
        ├── hot/
        └── cold/
```

---

## 저장 구조

```text
data/
├── buckets/
│   └── {bucket_name}/
│       ├── metadata/
│       │   └── objects/
│       │       └── {object_id}.json
│       └── shards/
│           └── {object_id}/
│               ├── hot/
│               │   ├── shard_0.data
│               │   └── shard_1.data
│               └── cold/
│                   └── parity_0.data
```

- `hot/`: 원본 복원에 직접 사용하는 data shard 저장 위치
- `cold/`: 복구용 parity shard 저장 위치

MVP에서는 시간 기반 tier 이동을 구현하지 않는다. `hot/cold`는 접근 빈도 기반 자동 이동이 아니라, data shard와 parity shard를 서로 다른 위치에 저장하는 단순 계층 구조이다.

---

## API 초안

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
HEAD /buckets/{bucketName}/objects?key={objectKey}
GET /buckets/{bucketName}/objects/metadata?key={objectKey}
GET /buckets/{bucketName}/objects
DELETE /buckets/{bucketName}/objects?key={objectKey}
```

### Debug

```http
POST /debug/objects/{objectId}/delete-shards?count=1
POST /debug/objects/{objectId}/recover
```

`debug` API는 shard 손실과 복구를 강제로 재현하기 위한 시연용 API이다.

## Erasure Coding 정책

MVP에서는 `k=2, m=1` 구성을 사용한다.

```text
data shard: 2개
parity shard: 1개
복구 허용: shard 1개 손실
```

확장 단계에서는 `k=4, m=2` 구성을 검토한다.

---

## 구현 순서

- [ ] Go 프로젝트 초기화
- [ ] Bucket 생성 / 단건 조회 / 목록 조회 API 구현
- [ ] Object 업로드 API 구현
- [ ] Object metadata JSON 저장
- [ ] Object 다운로드 API 구현
- [ ] SHA-256 checksum 검증
- [ ] Object를 shard로 분할 저장
- [ ] Shard 병합 다운로드 구현
- [ ] Reed-Solomon `k=2, m=1` 적용
- [ ] Shard 1개 삭제 후 복구 검증
- [ ] Data shard는 `hot/`, parity shard는 `cold/`에 저장
- [ ] Debug 복구 API 구현
- [ ] 복구 시연 문서 작성

---

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| Language | Go |
| API | HTTP |
| Metadata | JSON file |
| Storage | Local filesystem |
| Checksum | SHA-256 |
| Recovery | Reed-Solomon |
| Runtime | Local single process |

---

## 변경 관리 프로세스 (Git Workflow)

이 프로젝트는 기능 단위 브랜치와 PR 기반으로 변경 사항을 관리한다.

PR은 협업 목적보다 구현 단계별 self-review와 변경 범위 검증을 위한 용도로 사용한다.

### 작업 흐름

```bash
git checkout -b feature/xxx
git add .
git commit -m "feat: xxx"
git push origin feature/xxx
```

1. 기능 단위 브랜치 생성
2. 구현 및 테스트 수행
3. 원격 저장소로 push
4. PR 생성 (`Compare & pull request`)
5. 체크리스트 기반 검증
6. 검증 완료 후 PR merge

### 검증 방식
- 체크리스트 기반 self-review
- 모든 PR 동일 기준 적용
- `.github/pull_request_template.md`를 통해 자동 적용

### 브랜치 전략
```
feature/xxx
```
- `main` 브랜치는 항상 실행 가능한 상태로 유지한다.
- 기능 추가, 구조 변경, 문서 수정은 별도 브랜치에서 진행한다.
- `main` 브랜치 직접 커밋은 지양한다.

---
