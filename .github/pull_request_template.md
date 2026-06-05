## 작업 내용

<!-- 이번 PR에서 실제로 수행한 작업을 작성 -->

-

---

## 변경 요약

<!-- 변경된 파일과 핵심 변경 사항을 작성 -->

-

---

## 구현 단계

<!-- 이번 PR과 직접 관련 있는 Phase에 체크 -->

- [ ] Phase 1. Bucket / Object 저장
- [ ] Phase 2. HTTP API 검증용 Node.js CLI
- [ ] Phase 3. Object shard 분할 저장
- [ ] Phase 4. Reed-Solomon `k=2, m=1` 복구
- [ ] Phase 5. hot/cold Storage Tier 흉내
- [ ] Phase 6. Metadata Migration
- [ ] Phase 7. TCP Socket 기반 FTP 스타일 전송 실습
- [ ] Phase 8. 문서화 / 시연

---

## 세부 구현 항목

<!-- 이번 PR에서 구현한 항목만 체크 -->

- [ ] Node.js + TypeScript 프로젝트 초기화
- [ ] pnpm 기반 패키지 관리 구성
- [ ] Express HTTP 서버 구성

### Bucket

- [ ] Bucket 생성 API
- [ ] Bucket 단건 조회 API
- [ ] Bucket 목록 조회 API

### Object

- [ ] Object 업로드 API
- [ ] Object metadata JSON 저장
- [ ] Object metadata 조회 API
- [ ] Object 다운로드 API
- [ ] Object 목록 조회 API
- [ ] Object 삭제 API
- [ ] 동일 object key 중복 업로드 방지

### Metadata / Checksum

- [ ] `schema_version` 관리
- [ ] SHA-256 checksum 계산
- [ ] 다운로드 시 checksum 재검증
- [ ] Metadata migration
- [ ] Migration dry-run
- [ ] Migration backup
- [ ] Migration 결과 검증

### Shard / Recovery

- [ ] Object shard 분할 저장
- [ ] Shard metadata 저장
- [ ] Shard 병합 다운로드
- [ ] Reed-Solomon `k=2, m=1` 적용
- [ ] Shard 1개 삭제 후 복구 검증
- [ ] hot/cold 디렉토리 분리
- [ ] Debug 복구 API

### CLI / TCP Socket

- [ ] HTTP API 검증용 Node.js CLI
- [ ] CLI 기반 bucket 명령
- [ ] CLI 기반 object 명령
- [ ] TCP Socket 서버
- [ ] TCP Socket 클라이언트
- [ ] TCP Socket `ls/get/put/quit` 명령

### 문서

- [ ] README 정리
- [ ] Phase 문서 정리
- [ ] 시연 문서 정리

---

## 기본 검증

- [ ] 로컬 실행 확인
- [ ] 타입 검증 통과
- [ ] 테스트 통과
- [ ] 기존 기능 영향 없음
- [ ] 불필요한 런타임 파일 제외 확인
- [ ] `data/` 내부 생성 파일 커밋 제외 확인
- [ ] `testdata/` 내부 테스트 파일 커밋 제외 확인
- [ ] `ftp-data/` 내부 생성 파일 커밋 제외 확인
- [ ] 민감 정보 포함 없음

---

## 기능 검증

<!-- 해당되는 항목만 체크 -->

### Bucket / Object

- [ ] Bucket 생성 확인
- [ ] Bucket 단건 조회 확인
- [ ] Bucket 목록 조회 확인
- [ ] Object 업로드 확인
- [ ] Object 다운로드 확인
- [ ] Object metadata 조회 확인
- [ ] Object 목록 조회 확인
- [ ] Object 삭제 확인
- [ ] 동일 object key 중복 업로드 방지 확인
- [ ] SHA-256 checksum 일치 확인

### Shard / Recovery

- [ ] Shard 분할 저장 확인
- [ ] Shard 병합 복원 확인
- [ ] Shard 손실 후 복구 확인
- [ ] hot/cold 저장 위치 확인

### Migration

- [ ] Metadata migration dry-run 확인
- [ ] Metadata migration backup 확인
- [ ] Migration 후 checksum 검증 확인

### CLI / TCP Socket

- [ ] CLI 명령 실행 확인
- [ ] TCP Socket `ls` 확인
- [ ] TCP Socket `put` 확인
- [ ] TCP Socket `get` 확인
- [ ] TCP Socket `quit` 확인

---

## 제외한 작업

<!-- 이번 PR에서 의도적으로 제외한 작업이 있으면 작성 -->

-

---

## 참고 사항

<!-- 리뷰 또는 추후 작업 시 참고할 내용 작성 -->

-