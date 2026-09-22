/**
 * 赤とんぼクロスカントリー 評価ロジック（純粋関数のみ）
 * DOM に触らないので、そのまま node --test で検証できます。
 */

import {
  BASE_DISTANCE_KM,
  FIELD_DISTRIBUTION,
  GRADES,
  RIEGEL_EXPONENT,
  SCORE_ANCHORS,
  findCondition,
  findDivision,
} from './criteria.js';

/* ------------------------------------------------------------------ */
/* タイムの読み書き                                                     */
/* ------------------------------------------------------------------ */

/**
 * タイム文字列を秒に変換する。
 * "12:34" / "1:02:03" / "12'34" / "12分34秒" / "754"（秒）を受け付ける。
 * 解釈できなければ null。
 */
export function parseTime(input) {
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') return null;

  const normalized = input
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[時間分'′’]/g, ':')
    .replace(/[秒"″”]/g, '')
    .replace(/[.]/g, ':')
    .replace(/\s+/g, '');

  if (normalized === '') return null;

  const parts = normalized.split(':').filter((p, i, arr) => !(p === '' && i === arr.length - 1));
  if (parts.length === 0 || parts.length > 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  const nums = parts.map(Number);
  let seconds;
  if (nums.length === 1) {
    seconds = nums[0];
  } else if (nums.length === 2) {
    if (nums[1] >= 60) return null;
    seconds = nums[0] * 60 + nums[1];
  } else {
    if (nums[1] >= 60 || nums[2] >= 60) return null;
    seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  }
  return seconds > 0 ? seconds : null;
}

/** 秒を "m:ss" / "h:mm:ss" に整形する。 */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 秒/km を "m'ss\"/km" に整形する。 */
export function formatPace(secondsPerKm) {
  const total = Math.max(0, Math.round(secondsPerKm));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"/km`;
}

/* ------------------------------------------------------------------ */
/* 走力モデル                                                          */
/* ------------------------------------------------------------------ */

/** Riegel 式で距離換算する。 */
export function equivalentTime(seconds, fromKm, toKm) {
  if (!(seconds > 0) || !(fromKm > 0) || !(toKm > 0)) return NaN;
  return seconds * Math.pow(toKm / fromKm, RIEGEL_EXPONENT);
}

/** その部門・距離・コース状況における基準タイム（＝60点 / 評価C）。 */
export function standardTime(division, distanceKm, courseFactor = 1) {
  if (!division || !(distanceKm > 0)) return NaN;
  return equivalentTime(division.base3k, BASE_DISTANCE_KM, distanceKm) * courseFactor;
}

/** ratio（実タイム ÷ 基準タイム）を 0〜100 点に写す。 */
export function scoreFromRatio(ratio) {
  if (!(ratio > 0)) return NaN;
  const anchors = SCORE_ANCHORS;
  if (ratio <= anchors[0].ratio) return 100;
  const last = anchors[anchors.length - 1];
  if (ratio >= last.ratio) return 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (ratio >= a.ratio && ratio <= b.ratio) {
      const t = (ratio - a.ratio) / (b.ratio - a.ratio);
      return a.score + t * (b.score - a.score);
    }
  }
  return 0;
}

/** scoreFromRatio の逆関数。その得点をとるのに必要な ratio を返す。 */
export function ratioForScore(score) {
  const clamped = Math.min(100, Math.max(0, score));
  const anchors = SCORE_ANCHORS;
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (clamped <= a.score && clamped >= b.score) {
      if (a.score === b.score) return a.ratio;
      const t = (a.score - clamped) / (a.score - b.score);
      return a.ratio + t * (b.ratio - a.ratio);
    }
  }
  return anchors[anchors.length - 1].ratio;
}

/** その得点に必要なタイム（秒）。 */
export function timeForScore(score, standardSeconds) {
  return ratioForScore(score) * standardSeconds;
}

/** 得点から評価ランクを引く。 */
export function gradeFor(score) {
  return GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];
}

/* ------------------------------------------------------------------ */
/* 推定順位                                                            */
/* ------------------------------------------------------------------ */

/** 標準正規分布の累積分布関数（Abramowitz & Stegun 7.1.26 による近似）。 */
export function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * 同部門で自分より速い人の割合（％）＝「推定上位 N%」。
 * 小さいほど速い。1〜99 に丸める。
 */
export function estimatedTopPercent(seconds, standardSeconds) {
  if (!(seconds > 0) || !(standardSeconds > 0)) return NaN;
  const { medianFactor, sigma } = FIELD_DISTRIBUTION;
  const z = (Math.log(seconds) - Math.log(standardSeconds * medianFactor)) / sigma;
  const pct = normalCdf(z) * 100;
  return Math.min(99, Math.max(1, pct));
}

/** 実際の順位から上位何％かを出す。 */
export function actualTopPercent(place, finishers) {
  if (!(place > 0) || !(finishers > 0) || place > finishers) return null;
  return ((place - 0.5) / finishers) * 100;
}

/* ------------------------------------------------------------------ */
/* 総合評価                                                            */
/* ------------------------------------------------------------------ */

const OTHER_DISTANCES = [1, 1.5, 2, 3, 5, 10];

/**
 * 入力一式を評価する。
 * @param {{divisionId:string, distanceKm:number, timeInput:string|number,
 *          conditionId?:string, place?:number|null, finishers?:number|null}} input
 * @returns {{ok:true, ...}|{ok:false, error:string}}
 */
export function evaluate(input) {
  const division = findDivision(input.divisionId);
  if (!division) return { ok: false, error: '部門を選んでください。' };

  const distanceKm = Number(input.distanceKm);
  if (!(distanceKm > 0) || distanceKm > 100) {
    return { ok: false, error: '距離は 0 より大きい数値（km）で入力してください。' };
  }

  const seconds = parseTime(input.timeInput);
  if (seconds === null) {
    return { ok: false, error: 'タイムは 12:34 のように「分:秒」で入力してください。' };
  }

  const condition = findCondition(input.conditionId ?? '') ?? { id: 'standard', factor: 1, label: '標準' };
  const standardSeconds = standardTime(division, distanceKm, condition.factor);
  const ratio = seconds / standardSeconds;
  const score = Math.round(scoreFromRatio(ratio) * 10) / 10;
  const grade = gradeFor(score);
  const paceSecPerKm = seconds / distanceKm;

  const place = Number(input.place) > 0 ? Math.floor(Number(input.place)) : null;
  const finishers = Number(input.finishers) > 0 ? Math.floor(Number(input.finishers)) : null;
  const placePercent = place && finishers ? actualTopPercent(place, finishers) : null;

  // 次の目標：今より 1 ランク上（または +8点）の低い方＝手が届く方。
  const nextGrade = [...GRADES].reverse().find((g) => g.min > score) ?? null;
  const targetScore = Math.min(100, nextGrade ? Math.min(nextGrade.min, score + 8) : score + 4);
  const targetSeconds = timeForScore(targetScore, standardSeconds);

  return {
    ok: true,
    division,
    condition,
    distanceKm,
    seconds,
    standardSeconds,
    ratio,
    score,
    grade,
    paceSecPerKm,
    standardPaceSecPerKm: standardSeconds / distanceKm,
    estimatedTopPercent: estimatedTopPercent(seconds, standardSeconds),
    place,
    finishers,
    placePercent,
    target: {
      score: Math.round(targetScore * 10) / 10,
      grade: gradeFor(targetScore),
      seconds: targetSeconds,
      gainSeconds: Math.max(0, seconds - targetSeconds),
      paceSecPerKm: targetSeconds / distanceKm,
    },
    equivalents: OTHER_DISTANCES.filter((km) => Math.abs(km - distanceKm) > 0.01).map((km) => ({
      km,
      seconds: equivalentTime(seconds, distanceKm, km),
      paceSecPerKm: equivalentTime(seconds, distanceKm, km) / km,
    })),
    notes: buildNotes({
      score,
      grade,
      ratio,
      seconds,
      standardSeconds,
      placePercent,
      estimatedPercent: estimatedTopPercent(seconds, standardSeconds),
      condition,
    }),
  };
}

/** 評価コメントを組み立てる。 */
export function buildNotes({
  score,
  grade,
  ratio,
  seconds,
  standardSeconds,
  placePercent,
  estimatedPercent,
  condition,
}) {
  const notes = [grade.summary];
  const diff = seconds - standardSeconds;

  if (Math.abs(diff) < 5) {
    notes.push('部門の基準タイムとほぼ同じ。まさに標準ペースで走り切りました。');
  } else if (diff < 0) {
    notes.push(`部門の基準タイムより ${formatTime(-diff)} 速い記録です。`);
  } else {
    notes.push(`部門の基準タイムまであと ${formatTime(diff)}。`);
  }

  if (condition.factor > 1) {
    notes.push('タフなコース設定として補正済みです。同じ走力でも平坦路より数十秒は遅くなります。');
  } else if (condition.factor < 1) {
    notes.push('走りやすいコース設定として補正済みです。その分だけ基準タイムも速くしています。');
  }

  if (placePercent !== null && Number.isFinite(estimatedPercent)) {
    const gap = placePercent - estimatedPercent;
    if (gap < -8) {
      notes.push(
        `実際の順位は上位 ${placePercent.toFixed(0)}%。タイムから想定される ${estimatedPercent.toFixed(0)}% より上位で、当日は層の厚い組でよく戦えています。`,
      );
    } else if (gap > 8) {
      notes.push(
        `実際の順位は上位 ${placePercent.toFixed(0)}%。タイムのわりに順位が伸びていないので、周りのレベルが高い部門です。`,
      );
    } else {
      notes.push(`実際の順位（上位 ${placePercent.toFixed(0)}%）はタイムから想定される位置どおりです。`);
    }
  }

  if (ratio < 0.85) {
    notes.push('前半から押していける走力があります。次は同じ部門の入賞ラインを目標に。');
  } else if (ratio > 1.15) {
    notes.push('後半の落ち込みが大きい可能性があります。最初の 1km を目標ペース +10 秒で入るだけで記録は変わります。');
  } else {
    notes.push('ペース配分は悪くありません。登りで粘れるかどうかが次のひと伸びです。');
  }

  if (score >= 100) {
    notes.push('この評価スケールの上限に到達しています。基準タイムの見直しどきかもしれません。');
  }

  return notes;
}
