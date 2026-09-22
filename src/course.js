/**
 * 赤とんぼカントリークラブ のコースデータと評価基準
 * ------------------------------------------------------------------
 * ここの数値がアプリの評価のすべての土台です。
 * スコアカードやクラブ発表の値が手に入ったら、
 * TEES の courseRating / slope と HOLES の par を差し替えてください。
 */

/** コースの基本情報（公開情報にもとづく確定値）。 */
export const COURSE = {
  name: '赤とんぼカントリークラブ',
  formerName: '神崎カントリー倶楽部',
  prefecture: '千葉県香取郡神崎町',
  opened: 1994,
  renamed: 2022,
  designer: '三浦一美',
  style: '丘陵・林間',
  holeCount: 18,
  par: 72,
  backTeeYards: 6539,
  green: 'ベント1グリーン',
};

/**
 * ティーごとのコースレート／スロープレート。
 *
 * ★ courseRating と slope は暫定値です ★
 * 赤とんぼCCの公式レートは公開情報から確認できませんでした。
 * バックティ 6,539ヤード・パー72 の丘陵コースとして一般的な値を置いています。
 * スコアカード記載の値に差し替えると、推定ハンディキャップが正確になります。
 * レギュラー／フロントのヤードも同様の推定です。
 */
export const TEES = [
  { id: 'back', label: 'バック', yards: 6539, courseRating: 71.0, slope: 126, estimated: true },
  { id: 'regular', label: 'レギュラー', yards: 6100, courseRating: 69.4, slope: 121, estimated: true },
  { id: 'front', label: 'フロント', yards: 5480, courseRating: 66.8, slope: 114, estimated: true },
];

export const DEFAULT_TEE_ID = 'regular';

/**
 * ホール別のパー。
 *
 * ★ par の並びは暫定値です ★
 * 合計はパー72（OUT 36 / IN 36）で確定ですが、ホールごとの配分は
 * 公開情報から確認できませんでした。一般的なパー72の並びを置いています。
 * note は口コミ・コースガイドで繰り返し挙げられる特徴です。
 */
export const HOLES = [
  { no: 1, side: 'OUT', par: 4, note: '' },
  { no: 2, side: 'OUT', par: 4, note: '左ドッグレッグ。ティーショットの置き場所で決まる' },
  { no: 3, side: 'OUT', par: 3, note: '' },
  { no: 4, side: 'OUT', par: 5, note: '右ドッグレッグ。右の林に入れると出すだけになる' },
  { no: 5, side: 'OUT', par: 4, note: '' },
  { no: 6, side: 'OUT', par: 4, note: '' },
  { no: 7, side: 'OUT', par: 3, note: '' },
  { no: 8, side: 'OUT', par: 5, note: '' },
  { no: 9, side: 'OUT', par: 4, note: '' },
  { no: 10, side: 'IN', par: 4, note: '' },
  { no: 11, side: 'IN', par: 5, note: '池が絡む。刻んで花道から狙いたい' },
  { no: 12, side: 'IN', par: 3, note: '' },
  { no: 13, side: 'IN', par: 4, note: '' },
  { no: 14, side: 'IN', par: 4, note: '' },
  { no: 15, side: 'IN', par: 3, note: '' },
  { no: 16, side: 'IN', par: 5, note: '池が絡む。無理をしない番手選択で' },
  { no: 17, side: 'IN', par: 4, note: '' },
  { no: 18, side: 'IN', par: 4, note: '池越えの上がりホール' },
];

/**
 * スコア曲線のアンカー。
 * diff = 総スコア − コースのパー。
 * 区切りが 10 打ごとのアマチュアの実感（70台・80台…）と一致するように置いています。
 */
export const SCORE_ANCHORS = [
  { diff: -3, points: 100 },
  { diff: 0, points: 96 },
  { diff: 7, points: 90 },
  { diff: 17, points: 80 },
  { diff: 27, points: 70 },
  { diff: 37, points: 60 },
  { diff: 47, points: 45 },
  { diff: 57, points: 32 },
  { diff: 77, points: 12 },
  { diff: 108, points: 0 },
];

/** 評価ランク。points が min 以上でそのランク。上から順に判定します。 */
export const GRADES = [
  {
    rank: 'S',
    min: 90,
    label: '70台',
    summary: 'シングル圏のラウンド。赤とんぼCCで70台はコースを攻略できている証拠です。',
  },
  {
    rank: 'A',
    min: 80,
    label: '80台',
    summary: '80台。大きなミスを出さずに18ホールをまとめられています。',
  },
  {
    rank: 'B',
    min: 70,
    label: '90台',
    summary: '90台。アマチュアとしては上位。崩れたホールを1〜2個減らせば80台が見えます。',
  },
  {
    rank: 'C',
    min: 60,
    label: '100台',
    summary: '100台。ちょうど平均的なアマチュアの水準です。',
  },
  {
    rank: 'D',
    min: 45,
    label: '110台',
    summary: '110台。大叩きホールを止められれば一気に100切りが近づきます。',
  },
  {
    rank: 'E',
    min: 0,
    label: '120以上',
    summary: '18ホール回り切ったことがまず収穫。1ホールずつダブルボギーで止めるのが次の目標です。',
  },
];

/**
 * アマチュアのスコア分布モデル（推定順位に使用）。
 * パー72で平均100前後、標準偏差13打として扱います。
 */
export const FIELD_DISTRIBUTION = { meanOverPar: 28, sd: 13 };

/** 1ホールに記録する上限（ダブルパー打ち切り）。 */
export const MAX_STROKES_PER_HOLE = 12;

/** ホールのスコアの呼び名。par からの差で引く。 */
export const HOLE_RESULTS = [
  { key: 'eagle', label: 'イーグル以上', max: -2 },
  { key: 'birdie', label: 'バーディ', max: -1 },
  { key: 'par', label: 'パー', max: 0 },
  { key: 'bogey', label: 'ボギー', max: 1 },
  { key: 'double', label: 'ダブルボギー', max: 2 },
  { key: 'triple', label: 'トリプル以上', max: Infinity },
];

/** id からティーを引く。 */
export function findTee(id) {
  return TEES.find((t) => t.id === id) ?? null;
}

/** ホール別パーの合計（＝コースのパー）。 */
export function totalPar() {
  return HOLES.reduce((sum, h) => sum + h.par, 0);
}
