# 노크(KNOCK)

중장년(50~60대) 사회적 고립 위험 탐지·대응 AI 에이전트 — 제14회 2026 빅콘테스트 AI데이터활용 분야 출품작.
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
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-4-5`. 다른 모델로 바꾸려면 이 값만 수정 |

API 오류(키 오류·네트워크 등)로 답변을 시작하지 못한 경우에도 자동으로 폴백 모드로 답한다.
에이전트는 `src/lib/tools.ts`의 조회 전용 도구 10종으로만 결과표를 읽고, 답변 끝에 `근거:` 줄로 출처 파일·컬럼을 표시한다.
브리프(`/api/brief`)는 수치를 템플릿에 고정하고 Claude는 현황 요약·담당자 메모 두 칸만 쓴다. 키가 없으면 규칙 기반 문장으로 채운다.

## 화면

| 경로 | 내용 |
|---|---|
| `/` | 지도·리스트(이번 분기 우선 동 패널)·동 상세 패널·대화. `/?emd=EMD_CD`로 특정 동 선택 |
| `/guide` | 군집 5종 카드·하위유형별 대응 표 |
| `/about` | 데이터·방법·검증 수치·한계·생성형 AI 사용 명시 |

기타 스크립트

| 명령 | 내용 |
|---|---|
| `npm test` | REASON 파서·에이전트 도구 테스트 |
| `npm run check:chat -- http://localhost:3000` | 서버 실행 중에 시나리오 A 질문 3개를 `/api/chat`에 보내 근거 줄·동 이름 토큰 검사 |
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
