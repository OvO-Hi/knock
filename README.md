# 노크(KNOCK)

중장년(50~60대) 사회적 고립 위험 탐지·대응 AI 에이전트 — 제14회 2026 빅콘테스트 AI데이터활용 분야 출품작.
강남구 22동·춘천시 25동의 모델 결과(군집 5종 · 위험도 5단계)를 지도·패널·대화·브리프로 보여준다.

## 실행

```bash
npm i              # 의존성 설치 (Node 20+)
npm run validate   # 데이터 검증: 47동·컬럼·분포·REASON 파싱·GeoJSON 조인
npm run dev        # 개발 서버 http://localhost:3000
```

기타 스크립트

| 명령 | 내용 |
|---|---|
| `npm test` | REASON 파서 테스트 (47행 × 2개) |
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
