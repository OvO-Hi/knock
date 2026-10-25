# 노크(KNOCK)

중장년(50~60대) 사회적 고립 위험 탐지·대응 AI 에이전트. 제14회 2026 빅콘테스트 AI데이터활용 분야 출품작.
강남구 22동·춘천시 25동의 모델 결과(군집 5종 · 위험도 5단계)를 지도·패널·대화·브리프로 보여준다.

## 실행

```bash
npm i              # 의존성 설치 (Node 20+)
npm run validate   # 데이터 검증: 47동·컬럼·분포·REASON 파싱·GeoJSON 조인
npm run dev        # 개발 서버 http://localhost:3000
```

## 에이전트(Claude) 설정

```bash
cp .env.local.example .env.local   # ANTHROPIC_API_KEY 입력
```

| 변수 | 내용 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API 키. 비워 두면 `/api/chat`이 **규칙 기반 폴백 모드**로 답한다 (동 조회·우선순위·신뢰도 질문, 답변에 "규칙 기반 답변" 배지) |
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-5-5`. 다른 모델로 바꾸려면 이 값만 수정 (`claude-sonnet-4-5`는 2026-11-30 지원 종료) |
| `DEMO_CACHE` | `1`이면 `data/demo_cache.json`에 있는 데모 질문은 저장된 답변을 스트리밍 (네트워크 장애 대비). 기본 `0` |

답변은 서버가 이번 턴의 도구 결과와 대조한다(`src/lib/guard.ts`): 도구 결과에 없는 숫자, % 환산, 47개 동 밖의 지명이 있으면 1회 재요청하고, 그래도 남으면 그 문장을 지운다.

API 오류(키 오류·네트워크 등)로 답변을 시작하지 못한 경우에도 자동으로 폴백 모드로 답한다.
에이전트는 `src/lib/tools.ts`의 조회 전용 도구 10종으로만 결과표를 읽고, 답변 끝에 `근거:` 줄로 출처 파일·컬럼을 표시한다.
브리프(`/api/brief`)는 수치를 템플릿에 고정하고 Claude는 현황 요약·담당자 메모 두 칸만 쓴다. 키가 없으면 규칙 기반 문장으로 채운다.

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 지도·리스트·우선 동 탭, 동 상세 패널, 대화(드래그로 높이 조절). `/?emd=EMD_CD`로 특정 동 선택 |
| `/guide` | 군집 5종 카드·하위유형별 대응 표 |
| `/about` | 데이터·방법·검증 수치·한계·생성형 AI 사용 명시 |

## 배포 (Vercel)

1. GitHub 저장소를 Vercel 프로젝트로 가져오기 (Framework: Next.js, 설정 변경 없음)
2. Settings → Environment Variables

   | 이름 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Claude API 키 |
   | `ANTHROPIC_MODEL` | `claude-sonnet-5-5` |
   | `DEMO_CACHE` | 시연 당일 `1` (평소 `0`) |

3. Deploy. `/api/chat`·`/api/brief`는 `maxDuration = 60`초, 모든 API 라우트는 `next.config.ts`의 `outputFileTracingIncludes`로 `data/**`를 함수 번들에 포함한다.
4. 배포 후 확인: `npm run check:chat -- https://<배포 주소>` (5개 질문 · 근거 줄 · 동 토큰 · 가드 위반 0건)

데모 캐시 갱신: 서버를 `DEMO_CACHE=0`으로 띄우고 `npm run warm:demo -- http://localhost:3000` → `data/demo_cache.json` 커밋.

## 시연 순서 (헤더 "데모" 선택 → 아래 질문 칩을 순서대로 누르기)

| 순서 | 시나리오 | 화면 | 질문 | 보여줄 것 |
|---|---|---|---|---|
| 1 | **A · 춘천시 복지정책과** | 춘천·5단계 필터, 우선 동 탭 | ① 외곽 면 중 어디부터 ② 서면은 왜 5단계 ③ 서면 브리프 | 탐지→판단→원인→대응. 패널 [브리프 만들기] → 인쇄 |
| 2 | **B · 강남구 담당자** | 강남구, 역삼1동 선택 | ① 역삼1동이 왜 5단계? 부자 동네 아닌가 ② 삼성1동은? | 소득 비기준 발굴, 삼성1동 탐색지구(업무지구 과대평가) |
| 3 | **C · 춘천 효자동 복지센터** | 춘천, 효자2동 선택 | ① 대학가인데 왜 위험 신호? ② 청년 1인 가구와 차이 | HL 대학가형: 청년 생활권 속 중장년 따로 발굴 |

각 시나리오 90초 이내 (A→B→C). 신뢰도 질문은 데모 시나리오 대신 기본 추천 질문 칩 "이 결과 얼마나 믿을 수 있어요?"로 묻고 /about 페이지로 이어간다. 답변 말풍선의 "(데모 캐시 답변)" 배지는 `DEMO_CACHE=1`일 때 표시된다.

기타 스크립트

| 명령 | 내용 |
|---|---|
| `npm test` | REASON 파서·에이전트 도구 테스트 |
| `npm run check:chat -- http://localhost:3000` | 서버 실행 중에 5개 질문(시나리오 A 3개 + 비교·목록)을 `/api/chat`에 보내 근거 줄·동 이름 토큰·가드 위반 0건 검사 |
| `npm run warm:demo -- http://localhost:3000` | 데모 시나리오 질문 전부의 답변을 `data/demo_cache.json`에 저장 |
| `npm run build:geojson` | [vuski/admdongkor](https://github.com/vuski/admdongkor) 행정동 경계에서 강남구·춘천시 47동 추출 → `data/gangnam_chuncheon_emd.geojson`, 코드 매핑 `scripts/emd_code_map.json`. 원본은 `data/raw/`에 캐시(git 제외). 버전은 `ADMDONG_VER=ver20261001` 로 변경 |
| `npm run build` / `npm start` | 프로덕션 빌드·실행 |

## 데이터 (`data/`)

| 파일 | 내용 |
|---|---|
| `dong_cluster.csv` | 47동 모델 결과 (변수 5개, 단계점수, 군집, 위험도, SHAP 근거) |
| `cluster_profile.csv` | 군집 5종 프로파일 |
| `validation_summary.csv` · `sensitivity_final.csv` · `shap_importance.csv` | 검증·민감도·SHAP 중요도 |
| `variable_dictionary.md` | 변수 설명서 (에이전트 시스템 프롬프트에 삽입) |
| `gangnam_chuncheon_emd.geojson` | 행정동 경계 (EMD_CD = admdongkor `adm_cd`, 통계청 8자리) |

모델 결과 CSV는 팀 제공 원본이며 수정하지 않는다. 서버에서 `src/lib/data.ts`가 1회 로드해 메모리에 둔다.
