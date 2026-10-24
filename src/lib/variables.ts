// 변수 5개 표기 정보 — data/variable_dictionary.md 에서 옮겨 적음 (바뀌면 같이 고칠 것)
import type { VariableCode } from "./constants";

export interface VariableMeta {
  code: VariableCode;
  /** 보고서용 이름 */
  label: string;
  axis: "인구축" | "지역축";
  formula: string;
  plain: string;
  /** true = 값이 낮을수록 위험 */
  lowIsRisk: boolean;
  format: (v: number) => string;
}

const dec3 = (v: number) => v.toFixed(3);

export const VARIABLE_META: VariableMeta[] = [
  {
    code: "HH1_EXPO_5060",
    label: "중장년 1인세대 노출도",
    axis: "인구축",
    formula: "(1인 세대 수 ÷ 전체 세대 수) × (50·60대 인구 ÷ 전체 인구)",
    plain: "혼자 사는 집이 많으면서 50·60대 주민도 많은 동네인지",
    lowIsRisk: false,
    format: dec3,
  },
  {
    code: "MALE_SHARE_5060",
    label: "중장년 남성 비율",
    axis: "인구축",
    formula: "(50대 남성 + 60대 남성) ÷ 50·60대 전체 인구",
    plain: "50·60대 주민 가운데 남성이 얼마나 많은지 (중장년 남성이 고립에 더 취약함)",
    lowIsRisk: false,
    format: dec3,
  },
  {
    code: "VISIBLE_IDX_50P",
    label: "중장년 생활 노출 지수",
    axis: "인구축",
    formula: "(유동인구 중 5060 비중) ÷ (10세 이상 주민 중 5060 비중)",
    plain: "동네에 사는 50·60대가 실제로 거리에 나와 얼마나 눈에 띄는지 (1보다 작으면 사는 사람에 비해 바깥 활동이 적음)",
    lowIsRisk: true,
    format: dec3,
  },
  {
    code: "TIME_ENTROPY",
    label: "생활 리듬 다양성",
    axis: "지역축",
    formula: "시간대별(0~23시) 유동인구 비중의 엔트로피 −Σ p·log p (최댓값 log 24 ≈ 3.178)",
    plain: "하루 종일 고르게 사람이 오가는지, 특정 시간에만 붐비고 나머지는 비어 있는지",
    lowIsRisk: true,
    format: dec3,
  },
  {
    code: "POP_DENSITY",
    label: "인구밀도",
    axis: "지역축",
    formula: "총인구 ÷ 행정동 면적(km²)",
    plain: "동네에 사람이 얼마나 빽빽하게 사는지 (드물수록 이웃과 마주칠 일이 적음)",
    lowIsRisk: true,
    format: (v) => `${Math.round(v).toLocaleString("ko-KR")}명/km²`,
  },
];
