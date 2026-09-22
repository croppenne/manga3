/**
 * 赤とんぼカントリークラブ スコア評価ロジック（純粋関数のみ）
 * DOM に触らないので、そのまま node --test で検証できます。
 */

import {
  COURSE,
  FIELD_DISTRIBUTION,
  GRADES,
  HOLES,
  HOLE_RESULTS,
  MAX_STROKES_PER_HOLE,
  SCORE_ANCHORS,
  findTee,
} from './course.js';

/* ------------------------------------------------------------------ */
/* 入力の読み取り                                                       */
/* ------------------------------------------------------------------ */

/** スコア文字列を打数に直す。整数でなければ null。 */
export function parseStrokes(input) {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') return null;
  const normalized = input.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return value > 0 ? value : null;
}

/** パーとの差を "+28" / "±0" / "-2" の形にする。 */
export function formatDiff(diff) {
  if (diff === 0) return '±0';
  return diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
}

/* ------------------------------------------------------------------ */
/* 採点                                                                */
/* ------------------------------------------------------------------ */

/** パーとの差を 0〜100 点に写す。 */
export function pointsFromDiff(diff) {
  const anchors = SCORE_ANCHORS;
  if (diff <= anchors[0].diff) return 100;
  const last = anchors[anchors.length - 1];
  if (diff >= last.diff) return 0;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (diff >= a.diff && diff <= b.diff) {
      const t = (diff - a.diff) / (b.diff - a.diff);
      return a.points + t * (b.points - a.points);
    }
  }
  return 0;
}

/** pointsFromDiff の逆関数。その点数に必要なパーとの差を返す。 */
export function diffForPoints(points) {
  const clamped = Math.min(100, Math.max(0, points));
  const anchors = SCORE_ANCHORS;
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (clamped <= a.points && clamped >= b.points) {
      if (a.points === b.points) return a.diff;
      const t = (a.points - clamped) / (a.points - b.points);
      return a.diff + t * (b.diff - a.diff);
    }
  }
  return anchors[anchors.length - 1].diff;
}

/** 点数から評価ランクを引く。 */
export function gradeFor(points) {
  return GRADES.find((g) => points >= g.min) ?? GRADES[GRADES.length - 1];
}

/* ------------------------------------------------------------------ */
/* ハンディキャップ                                                     */
/* ------------------------------------------------------------------ */

/**
 * 1ラウンドのスコアディファレンシャル。
 * (113 / スロープレート) × (スコア − コースレート)
 */
export function scoreDifferential(strokes, tee) {
  if (!tee || !(strokes > 0)) return NaN;
  return (113 / tee.slope) * (strokes - tee.courseRating);
}

/**
 * 提出ラウンド数に応じて、ディファレンシャルの何本を使い、
 * いくつ調整するか（ワールドハンディキャップシステムの少数ラウンド表）。
 */
export function handicapAllowance(roundCount) {
  if (roundCount < 3) return null;
  if (roundCount === 3) return { use: 1, adjustment: -2 };
  if (roundCount === 4) return { use: 1, adjustment: -1 };
  if (roundCount === 5) return { use: 1, adjustment: 0 };
  if (roundCount === 6) return { use: 2, adjustment: -1 };
  if (roundCount <= 8) return { use: 2, adjustment: 0 };
  if (roundCount <= 11) return { use: 3, adjustment: 0 };
  if (roundCount <= 14) return { use: 4, adjustment: 0 };
  if (roundCount <= 16) return { use: 5, adjustment: 0 };
  if (roundCount <= 18) return { use: 6, adjustment: 0 };
  if (roundCount === 19) return { use: 7, adjustment: 0 };
  return { use: 8, adjustment: 0 };
}

/**
 * 直近20ラウンドのディファレンシャルからハンディキャップ指数を出す。
 * 3ラウンド未満なら null。
 */
export function handicapIndex(differentials) {
  const values = differentials.filter((d) => Number.isFinite(d)).slice(0, 20);
  const allowance = handicapAllowance(values.length);
  if (!allowance) return null;

  const best = [...values].sort((a, b) => a - b).slice(0, allowance.use);
  const average = best.reduce((sum, d) => sum + d, 0) / best.length;
  return Math.round((average + allowance.adjustment) * 10) / 10;
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

/** 同じコースを回るアマチュアのうち、自分より良いスコアの割合（％）。 */
export function estimatedTopPercent(diff) {
  if (!Number.isFinite(diff)) return NaN;
  const { meanOverPar, sd } = FIELD_DISTRIBUTION;
  const pct = normalCdf((diff - meanOverPar) / sd) * 100;
  return Math.min(99, Math.max(1, pct));
}

/* ------------------------------------------------------------------ */
/* ホール別の集計                                                       */
/* ------------------------------------------------------------------ */

/** ホールのスコアの呼び名（バーディ／ボギー…）を引く。 */
export function holeResultKey(strokes, par) {
  const diff = strokes - par;
  return HOLE_RESULTS.find((r) => diff <= r.max).key;
}

/**
 * 18ホール分の打数から内訳を集計する。
 * strokes は長さ18の配列。未入力は null。
 */
export function summarizeHoles(strokes) {
  const filled = [];
  for (let i = 0; i < HOLES.length; i += 1) {
    const value = strokes[i];
    if (Number.isFinite(value) && value > 0) filled.push({ hole: HOLES[i], strokes: value });
  }
  if (filled.length === 0) return null;

  const counts = Object.fromEntries(HOLE_RESULTS.map((r) => [r.key, 0]));
  for (const { hole, strokes: s } of filled) counts[holeResultKey(s, hole.par)] += 1;

  const sideTotal = (side) =>
    filled
      .filter(({ hole }) => hole.side === side)
      .reduce((acc, { strokes: s, hole }) => ({ strokes: acc.strokes + s, par: acc.par + hole.par }), {
        strokes: 0,
        par: 0,
      });

  const byPar = [3, 4, 5].map((par) => {
    const group = filled.filter(({ hole }) => hole.par === par);
    return {
      par,
      holes: group.length,
      average: group.length ? group.reduce((sum, { strokes: s }) => sum + s, 0) / group.length : null,
      overPar: group.length
        ? group.reduce((sum, { strokes: s, hole }) => sum + (s - hole.par), 0) / group.length
        : null,
    };
  });

  const ranked = [...filled].sort(
    (a, b) => b.strokes - b.hole.par - (a.strokes - a.hole.par),
  );

  return {
    holesEntered: filled.length,
    strokes: filled.reduce((sum, { strokes: s }) => sum + s, 0),
    par: filled.reduce((sum, { hole }) => sum + hole.par, 0),
    counts,
    out: sideTotal('OUT'),
    in: sideTotal('IN'),
    byPar,
    worst: ranked[0] ?? null,
    best: ranked[ranked.length - 1] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* 総合評価                                                            */
/* ------------------------------------------------------------------ */

/**
 * 1ラウンドを評価する。
 * @param {{teeId:string, strokes?:number|string, holeStrokes?:Array<number|null>,
 *          putts?:number|null, fairways?:number|null, greens?:number|null,
 *          pastDifferentials?:number[]}} input
 */
export function evaluate(input) {
  const tee = findTee(input.teeId);
  if (!tee) return { ok: false, error: 'ティーを選んでください。' };

  const holeStrokes = Array.isArray(input.holeStrokes) ? input.holeStrokes : [];
  const holeSummary = summarizeHoles(holeStrokes);
  const allHolesEntered = holeSummary?.holesEntered === HOLES.length;

  const strokes = allHolesEntered ? holeSummary.strokes : parseStrokes(input.strokes);
  if (strokes === null) {
    return {
      ok: false,
      error: 'スコアを入力してください。合計だけでも、18ホール分でも評価できます。',
    };
  }
  if (strokes < COURSE.holeCount) {
    return { ok: false, error: `18ホールの合計スコアなので ${COURSE.holeCount} 打以上になります。` };
  }
  if (strokes > COURSE.holeCount * MAX_STROKES_PER_HOLE) {
    return { ok: false, error: 'スコアが大きすぎます。入力を見直してください。' };
  }

  const par = COURSE.par;
  const diff = strokes - par;
  const points = Math.round(pointsFromDiff(diff) * 10) / 10;
  const grade = gradeFor(points);
  const differential = scoreDifferential(strokes, tee);

  const putts = Number.isFinite(Number(input.putts)) && Number(input.putts) > 0 ? Math.floor(Number(input.putts)) : null;
  const greens = Number(input.greens) >= 0 && input.greens !== null && input.greens !== '' ? Math.floor(Number(input.greens)) : null;
  const fairways = Number(input.fairways) >= 0 && input.fairways !== null && input.fairways !== '' ? Math.floor(Number(input.fairways)) : null;

  // 次の目標：1ランク上か +6点の、手が届く方。
  const nextGrade = [...GRADES].reverse().find((g) => g.min > points) ?? null;
  const targetPoints = Math.min(100, nextGrade ? Math.min(nextGrade.min, points + 6) : points + 3);
  const targetStrokes = Math.max(par - 3, Math.ceil(par + diffForPoints(targetPoints)));

  const pastDifferentials = Array.isArray(input.pastDifferentials) ? input.pastDifferentials : [];

  return {
    ok: true,
    tee,
    par,
    strokes,
    diff,
    points,
    grade,
    differential,
    handicapIndex: handicapIndex([differential, ...pastDifferentials]),
    roundsUsed: Math.min(20, pastDifferentials.length + 1),
    estimatedTopPercent: estimatedTopPercent(diff),
    putts,
    puttsPerHole: putts !== null ? putts / COURSE.holeCount : null,
    shotsWithoutPutts: putts !== null ? strokes - putts : null,
    greens,
    greenRate: greens !== null ? (greens / COURSE.holeCount) * 100 : null,
    fairways,
    holeSummary,
    allHolesEntered,
    target: {
      points: Math.round(targetPoints * 10) / 10,
      grade: gradeFor(targetPoints),
      strokes: targetStrokes,
      gain: Math.max(0, strokes - targetStrokes),
    },
    notes: buildNotes({ strokes, diff, grade, points, putts, greens, holeSummary, tee }),
  };
}

/** 評価コメントを組み立てる。 */
export function buildNotes({ diff, grade, points, putts, greens, holeSummary, tee }) {
  const notes = [grade.summary];

  notes.push(
    `${tee.label}ティー（${tee.yards}ヤード・パー${COURSE.par}）でパーとの差は ${formatDiff(diff)}。` +
      `推定で上位 ${estimatedTopPercent(diff).toFixed(0)}% のスコアです。`,
  );

  if (holeSummary) {
    const { counts, out, in: inSide, byPar, worst } = holeSummary;
    const parOrBetter = counts.eagle + counts.birdie + counts.par;
    notes.push(
      `パー以上が ${parOrBetter}ホール、ボギー ${counts.bogey}、ダブルボギー ${counts.double}、` +
        `トリプル以上が ${counts.triple}ホール。`,
    );

    if (counts.triple >= 3) {
      notes.push(
        `トリプル以上が ${counts.triple} ホール。ここをダブルボギーで止めるだけで ` +
          `${counts.triple}打前後は縮みます。スコアを崩すのはたいてい2打目の欲張りです。`,
      );
    }

    if (out.strokes > 0 && inSide.strokes > 0) {
      const outOver = out.strokes - out.par;
      const inOver = inSide.strokes - inSide.par;
      if (Math.abs(outOver - inOver) >= 4) {
        const worseSide = outOver > inOver ? 'OUT' : 'IN';
        notes.push(
          `OUT ${out.strokes}（${formatDiff(outOver)}）／ IN ${inSide.strokes}（${formatDiff(inOver)}）。` +
            `${worseSide} で崩れています。`,
        );
      } else {
        notes.push(`OUT ${out.strokes}／ IN ${inSide.strokes}。前後半の差は小さく、安定して回れています。`);
      }
    }

    const weakest = byPar.filter((g) => g.overPar !== null).sort((a, b) => b.overPar - a.overPar)[0];
    if (weakest && weakest.overPar >= 1.5) {
      const advice = {
        3: 'ショートホールはピンではなくグリーンセンターを狙うと大崩れが減ります。',
        4: 'ミドルホールはティーショットをフェアウェイに置くことが最優先です。',
        5: 'ロングホールは2打目を刻んで、3打目を得意な距離に残すのが近道です。',
      }[weakest.par];
      notes.push(`パー${weakest.par}が平均 ${formatDiff(Math.round(weakest.overPar * 10) / 10)} と苦しんでいます。${advice}`);
    }

    if (worst) {
      const hole = HOLES.find((h) => h.no === worst.hole.no);
      const detail = hole?.note ? `（${hole.note}）` : '';
      notes.push(
        `いちばん叩いたのは ${worst.hole.no}番・パー${worst.hole.par} の ${worst.strokes}打${detail}。`,
      );
    }
  }

  if (putts !== null) {
    const perHole = putts / COURSE.holeCount;
    if (perHole >= 2.2) {
      notes.push(`パット ${putts}（1ホール平均 ${perHole.toFixed(2)}）。3パットを減らすのがいちばん手早い短縮です。`);
    } else if (perHole <= 1.8) {
      notes.push(`パット ${putts}（1ホール平均 ${perHole.toFixed(2)}）。グリーン上は好調。伸ばすならショットの精度です。`);
    } else {
      notes.push(`パット ${putts}（1ホール平均 ${perHole.toFixed(2)}）。アマチュアとしては標準的な数字です。`);
    }
  }

  if (greens !== null) {
    const rate = (greens / COURSE.holeCount) * 100;
    notes.push(`パーオン ${greens}／18（${rate.toFixed(0)}%）。100切りの目安は3〜5ホールです。`);
  }

  if (tee.estimated) {
    notes.push('コースレート／スロープレートは推定値です。スコアカード記載の値に差し替えると、推定ハンディキャップが正確になります。');
  }

  if (points >= 100) {
    notes.push('この評価スケールの上限です。基準の見直しどきかもしれません。');
  }

  return notes;
}
