---
date: '2026-03-01'
phase: 구현→검증
project: fishlog
status: in-progress
type: project
---
# FishLog — Firebase 통합 진행 상태

## 프로젝트 정보
- **Firebase Project ID**: fishlog-diary-2026
- **리전**: asia-northeast3 (서울)
- **웹 앱 ID**: 1:312541807632:web:b224f01db37a13ab82b695
- **Auth Provider**: Google (활성화)
- **Firestore**: 테스트 모드

## 완료된 작업
- [x] Firebase 프로젝트 생성
- [x] 웹 앱 등록 + SDK config 확보
- [x] .env.local 입력
- [x] Google Auth Provider 활성화
- [x] Firestore 서울 리전 생성
- [x] Firebase SDK 설치 + lazy init (SSR 안전)
- [x] useAuth 훅 (Google 로그인)
- [x] firestoreService (DataService 구현)
- [x] dataServiceFactory (로그인 상태별 서비스 전환)
- [x] migrationService (localStorage → Firestore)
- [x] PWA 서비스워커 + 오프라인 큐
- [x] Settings 로그인 UI
- [x] 모든 페이지 localStorageService → getDataService() 전환
- [x] 빌드 성공 (3.8s)

## 미완료 (다음 세션)
- [ ] Google 로그인 실제 테스트
- [ ] Firestore 실시간 랭킹 쿼리
- [ ] Firebase Hosting 배포
- [ ] Firestore 보안 규칙 (프로덕션용)

## 기술 결정
- Firebase lazy init: env 미설정 시 null 반환 → SSR/SSG 빌드 안전
- DataService 팩토리 패턴: 기존 인터페이스 유지, 백엔드만 교체
- 오프라인 큐: IndexedDB 기반, 네트워크 복구 시 자동 동기화
