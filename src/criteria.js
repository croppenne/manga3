/**
 * 赤とんぼクロスカントリー 評価基準データ
 * ------------------------------------------------------------------
 * ここに置いた数値が、アプリの評価のすべての土台です。
 * 大会の公式記録（過去のリザルト）が手に入ったら、
 * DIVISIONS の base3k を実際の「部門別 平均完走タイム（3km換算）」に
 * 置き換えてください。それだけで全部門・全距離の評価が更新されます。
 */

/** 距離換算に使う Riegel 指数（T2 = T1 * (D2/D1)^k）。 */
export const RIEGEL_EXPONENT = 1.06;

/** base3k を定義している基準距離（km）。 */
export const BASE_DISTANCE_KM = 3;

/**
 * コース状況の係数。クロスカントリーは路面と起伏で
 * 同じ走力でもタイムが大きく変わるため、基準タイム側を補正します。
 */
export const COURSE_CONDITIONS = [
  { id: 'fast', label: '走りやすい（起伏小）', factor: 0.97 },
  { id: 'standard', label: '標準（起伏あり）', factor: 1.0 },
  { id: 'tough', label: 'タフ（急坂・ぬかるみ）', factor: 1.06 },
];

export const DEFAULT_CONDITION_ID = 'standard';

/**
 * 部門ごとの基準タイム。
 * base3k = その部門の「平均的な完走者」が 3km を走るのに要する秒数。
 * この基準タイムちょうどで完走すると 60点 / 評価C になります。
 */
export const DIVISIONS = [
  { id: 'e12m', group: '小学生', label: '小学1・2年 男子', base3k: 930 },
  { id: 'e12f', group: '小学生', label: '小学1・2年 女子', base3k: 975 },
  { id: 'e34m', group: '小学生', label: '小学3・4年 男子', base3k: 840 },
  { id: 'e34f', group: '小学生', label: '小学3・4年 女子', base3k: 885 },
  { id: 'e56m', group: '小学生', label: '小学5・6年 男子', base3k: 762 },
  { id: 'e56f', group: '小学生', label: '小学5・6年 女子', base3k: 810 },
  { id: 'jhm', group: '中学生', label: '中学 男子', base3k: 681 },
  { id: 'jhf', group: '中学生', label: '中学 女子', base3k: 771 },
  { id: 'hsm', group: '高校生', label: '高校 男子', base3k: 621 },
  { id: 'hsf', group: '高校生', label: '高校 女子', base3k: 732 },
  { id: 'a30m', group: '一般', label: '一般 男子（18〜39歳）', base3k: 660 },
  { id: 'a30f', group: '一般', label: '一般 女子（18〜39歳）', base3k: 780 },
  { id: 'a40m', group: '一般', label: '男子 40代', base3k: 700 },
  { id: 'a40f', group: '一般', label: '女子 40代', base3k: 822 },
  { id: 'a50m', group: '一般', label: '男子 50代', base3k: 750 },
  { id: 'a50f', group: '一般', label: '女子 50代', base3k: 882 },
  { id: 'a60m', group: '一般', label: '男子 60代', base3k: 822 },
  { id: 'a60f', group: '一般', label: '女子 60代', base3k: 960 },
  { id: 'a70m', group: '一般', label: '男子 70歳以上', base3k: 921 },
  { id: 'a70f', group: '一般', label: '女子 70歳以上', base3k: 1062 },
];

export const DEFAULT_DIVISION_ID = 'a30m';

/** 種目距離のプリセット（km）。任意の距離も入力できます。 */
export const DISTANCE_PRESETS = [1, 1.5, 2, 2.5, 3, 4, 5, 8, 10];

export const DEFAULT_DISTANCE_KM = 3;

/**
 * スコア曲線のアンカー。
 * ratio = 実タイム ÷ 基準タイム。小さいほど速い。
 * 区間ごとの線形補間で 0〜100 点に写します。
 */
export const SCORE_ANCHORS = [
  { ratio: 0.68, score: 100 },
  { ratio: 0.75, score: 96 },
  { ratio: 0.82, score: 90 },
  { ratio: 0.89, score: 80 },
  { ratio: 0.95, score: 70 },
  { ratio: 1.0, score: 60 },
  { ratio: 1.08, score: 50 },
  { ratio: 1.18, score: 40 },
  { ratio: 1.3, score: 30 },
  { ratio: 1.5, score: 15 },
  { ratio: 2.0, score: 0 },
];

/** 評価ランク。min 点以上でそのランク。上から順に判定します。 */
export const GRADES = [
  {
    rank: 'S',
    min: 90,
    label: '入賞圏',
    summary: '部門の先頭集団。表彰台を狙える走りです。',
  },
  {
    rank: 'A',
    min: 80,
    label: '上位',
    summary: '部門上位。競技志向のランナーとして十分に速い記録です。',
  },
  {
    rank: 'B',
    min: 70,
    label: '好記録',
    summary: '平均を明確に上回る記録。走り込みの成果が出ています。',
  },
  {
    rank: 'C',
    min: 60,
    label: '標準',
    summary: '部門の平均的な完走タイム。ここが伸びしろの出発点です。',
  },
  {
    rank: 'D',
    min: 45,
    label: '完走ペース',
    summary: 'まずは完走。ペース配分を整えるだけでも大きく縮みます。',
  },
  {
    rank: 'E',
    min: 0,
    label: 'チャレンジ',
    summary: '起伏のあるコースを走り切ったこと自体が記録です。次は距離に慣れることから。',
  },
];

/**
 * 同部門内のタイム分布モデル（推定順位に使用）。
 * 完走タイムは対数正規分布に近いと仮定します。
 * medianFactor: 中央値 ÷ 基準タイム、sigma: log タイムの標準偏差。
 */
export const FIELD_DISTRIBUTION = { medianFactor: 1.06, sigma: 0.15 };

/** id から部門を引く。 */
export function findDivision(id) {
  return DIVISIONS.find((d) => d.id === id) ?? null;
}

/** id からコース状況を引く。 */
export function findCondition(id) {
  return COURSE_CONDITIONS.find((c) => c.id === id) ?? null;
}
