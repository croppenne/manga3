import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffForPoints,
  estimatedTopPercent,
  evaluate,
  formatDiff,
  gradeFor,
  handicapAllowance,
  handicapIndex,
  holeResultKey,
  normalCdf,
  parseStrokes,
  pointsFromDiff,
  scoreDifferential,
  summarizeHoles,
} from '../src/scoring.js';
import { COURSE, HOLES, TEES, findTee, totalPar } from '../src/course.js';

/** パー通りに回った 18 ホール分の打数。 */
const evenPar = HOLES.map((h) => h.par);

test('コースデータのパー合計が公表値と一致する', () => {
  assert.equal(totalPar(), COURSE.par);
  assert.equal(HOLES.length, COURSE.holeCount);
  assert.equal(HOLES.filter((h) => h.side === 'OUT').reduce((s, h) => s + h.par, 0), 36);
  assert.equal(HOLES.filter((h) => h.side === 'IN').reduce((s, h) => s + h.par, 0), 36);
});

test('ティーはヤードが長いほどコースレートも高い', () => {
  const sorted = [...TEES].sort((a, b) => a.yards - b.yards);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].courseRating > sorted[i - 1].courseRating);
    assert.ok(sorted[i].slope > sorted[i - 1].slope);
  }
});

test('parseStrokes は打数だけを受け取る', () => {
  assert.equal(parseStrokes('94'), 94);
  assert.equal(parseStrokes('９４'), 94);
  assert.equal(parseStrokes(' 94 '), 94);
  assert.equal(parseStrokes(94), 94);
  for (const bad of ['', '9.4', '-3', '0', 'abc', 94.5, null, undefined, {}]) {
    assert.equal(parseStrokes(bad), null, `期待: null（入力 ${JSON.stringify(bad)}）`);
  }
});

test('formatDiff は符号を日本語表記に揃える', () => {
  assert.equal(formatDiff(0), '±0');
  assert.equal(formatDiff(28), '+28');
  assert.equal(formatDiff(-2), '−2');
});

test('評価ランクの境界が 70台・80台・90台… と一致する', () => {
  const rankOf = (strokes) => gradeFor(pointsFromDiff(strokes - COURSE.par)).rank;
  assert.equal(rankOf(72), 'S');
  assert.equal(rankOf(79), 'S');
  assert.equal(rankOf(80), 'A');
  assert.equal(rankOf(89), 'A');
  assert.equal(rankOf(90), 'B');
  assert.equal(rankOf(99), 'B');
  assert.equal(rankOf(100), 'C');
  assert.equal(rankOf(109), 'C');
  assert.equal(rankOf(110), 'D');
  assert.equal(rankOf(119), 'D');
  assert.equal(rankOf(120), 'E');
  assert.equal(rankOf(150), 'E');
});

test('pointsFromDiff は打つほど下がり、0〜100 に収まる', () => {
  let previous = Infinity;
  for (let diff = -10; diff <= 130; diff += 1) {
    const points = pointsFromDiff(diff);
    assert.ok(points >= 0 && points <= 100, `範囲外: ${points}`);
    assert.ok(points <= previous + 1e-9, `単調減少でない: diff=${diff}`);
    previous = points;
  }
  assert.equal(pointsFromDiff(-20), 100);
  assert.equal(pointsFromDiff(200), 0);
});

test('diffForPoints は pointsFromDiff の逆関数になっている', () => {
  for (let points = 1; points <= 99; points += 1) {
    const diff = diffForPoints(points);
    assert.ok(Math.abs(pointsFromDiff(diff) - points) < 1e-6, `points=${points} で往復しない`);
  }
});

test('スコアディファレンシャルが WHS の式どおりに出る', () => {
  const tee = findTee('back');
  const expected = (113 / tee.slope) * (100 - tee.courseRating);
  assert.ok(Math.abs(scoreDifferential(100, tee) - expected) < 1e-9);
  assert.ok(scoreDifferential(90, tee) < scoreDifferential(100, tee), '良いスコアほど指数は小さい');
});

test('少数ラウンド表が WHS の規定どおり', () => {
  assert.equal(handicapAllowance(2), null);
  assert.deepEqual(handicapAllowance(3), { use: 1, adjustment: -2 });
  assert.deepEqual(handicapAllowance(4), { use: 1, adjustment: -1 });
  assert.deepEqual(handicapAllowance(5), { use: 1, adjustment: 0 });
  assert.deepEqual(handicapAllowance(6), { use: 2, adjustment: -1 });
  assert.deepEqual(handicapAllowance(8), { use: 2, adjustment: 0 });
  assert.deepEqual(handicapAllowance(20), { use: 8, adjustment: 0 });
  assert.deepEqual(handicapAllowance(40), { use: 8, adjustment: 0 });
});

test('handicapIndex は最良ディファレンシャルから計算する', () => {
  assert.equal(handicapIndex([20, 22]), null, '3ラウンド未満は出さない');
  assert.equal(handicapIndex([20, 22, 26]), 18, '3ラウンドなら最良1本 −2.0');
  assert.equal(handicapIndex([20, 22, 26, 30]), 19, '4ラウンドなら最良1本 −1.0');
  assert.equal(handicapIndex([20, 22, 26, 30, 31]), 20, '5ラウンドなら最良1本そのまま');
  assert.equal(handicapIndex([20, 22, 26, 30, 31, 33]), 20, '6ラウンドなら最良2本の平均 −1.0');
});

test('holeResultKey がスコアの呼び名を返す', () => {
  assert.equal(holeResultKey(2, 4), 'eagle');
  assert.equal(holeResultKey(3, 4), 'birdie');
  assert.equal(holeResultKey(4, 4), 'par');
  assert.equal(holeResultKey(5, 4), 'bogey');
  assert.equal(holeResultKey(6, 4), 'double');
  assert.equal(holeResultKey(9, 4), 'triple');
  assert.equal(holeResultKey(1, 3), 'eagle', 'ホールインワンはイーグル以上');
});

test('summarizeHoles が内訳と前後半を集計する', () => {
  assert.equal(summarizeHoles(HOLES.map(() => null)), null, '未入力なら null');

  const all = summarizeHoles(evenPar);
  assert.equal(all.holesEntered, 18);
  assert.equal(all.strokes, COURSE.par);
  assert.equal(all.counts.par, 18);
  assert.equal(all.out.strokes, 36);
  assert.equal(all.in.strokes, 36);
  for (const group of all.byPar) assert.equal(group.overPar, 0);

  const partial = summarizeHoles(evenPar.map((p, i) => (i < 9 ? p + 1 : null)));
  assert.equal(partial.holesEntered, 9);
  assert.equal(partial.strokes, 45);
  assert.equal(partial.counts.bogey, 9);
  assert.equal(partial.in.strokes, 0);
});

test('summarizeHoles がいちばん叩いたホールを見つける', () => {
  const strokes = [...evenPar];
  strokes[10] += 5; // 11番
  const summary = summarizeHoles(strokes);
  assert.equal(summary.worst.hole.no, 11);
  assert.equal(summary.worst.strokes, HOLES[10].par + 5);
});

test('normalCdf が標準正規分布の値に一致する', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
});

test('estimatedTopPercent は良いスコアほど上位で 1〜99 に収まる', () => {
  assert.ok(estimatedTopPercent(10) < estimatedTopPercent(40));
  assert.ok(Math.abs(estimatedTopPercent(28) - 50) < 1, '平均100打がほぼ上位50%');
  for (const diff of [-5, 0, 28, 60, 120]) {
    const p = estimatedTopPercent(diff);
    assert.ok(p >= 1 && p <= 99, `範囲外: ${p}`);
  }
});

test('evaluate は入力エラーを日本語で返す', () => {
  assert.equal(evaluate({ teeId: 'nope', strokes: 94 }).ok, false);
  assert.equal(evaluate({ teeId: 'regular', strokes: '' }).ok, false);
  assert.equal(evaluate({ teeId: 'regular', strokes: 'abc' }).ok, false);
  assert.equal(evaluate({ teeId: 'regular', strokes: 12 }).ok, false, '18ホールに満たない打数');
  assert.equal(evaluate({ teeId: 'regular', strokes: 400 }).ok, false, '大きすぎる打数');
});

test('evaluate は合計スコアだけで一式そろった結果を返す', () => {
  const result = evaluate({ teeId: 'regular', strokes: 94, putts: 33, greens: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.strokes, 94);
  assert.equal(result.diff, 22);
  assert.equal(result.grade.rank, 'B');
  assert.equal(result.shotsWithoutPutts, 61);
  assert.ok(Math.abs(result.puttsPerHole - 33 / 18) < 1e-9);
  assert.ok(Math.abs(result.greenRate - (5 / 18) * 100) < 1e-9);
  assert.equal(result.handicapIndex, null, '履歴が無ければハンディキャップは出ない');
  assert.ok(result.notes.length >= 3);
  assert.ok(result.target.strokes < result.strokes, '目標はいまより少ない打数');
});

test('18ホール入力なら合計スコアを自分で出す', () => {
  const strokes = evenPar.map((p) => p + 1); // 全ホール ボギー
  const result = evaluate({ teeId: 'regular', holeStrokes: strokes });
  assert.equal(result.ok, true);
  assert.equal(result.strokes, COURSE.par + 18);
  assert.equal(result.allHolesEntered, true);
  assert.equal(result.holeSummary.counts.bogey, 18);
});

test('ホール別入力は合計スコア欄より優先される', () => {
  const result = evaluate({ teeId: 'regular', strokes: 200, holeStrokes: evenPar });
  assert.equal(result.strokes, COURSE.par);
});

test('ティーが変わるとディファレンシャルだけが変わる', () => {
  const back = evaluate({ teeId: 'back', strokes: 94 });
  const front = evaluate({ teeId: 'front', strokes: 94 });
  assert.equal(back.points, front.points, '評価点はコースのパーとの差で決まる');
  assert.ok(back.differential < front.differential, '長いティーの方が同じスコアでも指数は良い');
});

test('履歴がたまるとハンディキャップ指数が出る', () => {
  const result = evaluate({
    teeId: 'regular',
    strokes: 94,
    pastDifferentials: [26.5, 30.1, 28.4],
  });
  assert.equal(result.roundsUsed, 4);
  assert.ok(result.handicapIndex !== null);
  const expected = handicapIndex([result.differential, 26.5, 30.1, 28.4]);
  assert.equal(result.handicapIndex, expected);
});
