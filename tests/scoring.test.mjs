import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actualTopPercent,
  equivalentTime,
  estimatedTopPercent,
  evaluate,
  formatPace,
  formatTime,
  gradeFor,
  normalCdf,
  parseTime,
  ratioForScore,
  scoreFromRatio,
  standardTime,
  timeForScore,
} from '../src/scoring.js';
import { BASE_DISTANCE_KM, findDivision } from '../src/criteria.js';

test('parseTime は色々な書き方を秒に直す', () => {
  assert.equal(parseTime('12:34'), 754);
  assert.equal(parseTime('1:02:03'), 3723);
  assert.equal(parseTime("12'34"), 754);
  assert.equal(parseTime('12分34秒'), 754);
  assert.equal(parseTime('12.34'), 754);
  assert.equal(parseTime('１２:３４'), 754);
  assert.equal(parseTime(' 754 '), 754);
  assert.equal(parseTime(754), 754);
});

test('parseTime は読めない入力を null にする', () => {
  for (const bad of ['', 'abc', '12:99', '1:2:3:4', '-5', '0', null, undefined, {}]) {
    assert.equal(parseTime(bad), null, `期待: null（入力 ${JSON.stringify(bad)}）`);
  }
});

test('formatTime / formatPace は桁を揃える', () => {
  assert.equal(formatTime(754), '12:34');
  assert.equal(formatTime(3723), '1:02:03');
  assert.equal(formatTime(59.6), '1:00');
  assert.equal(formatPace(251), "4'11\"/km");
});

test('equivalentTime は距離が伸びるとペースを落とす', () => {
  const t5 = equivalentTime(1200, 3, 5);
  assert.ok(t5 > 1200 * (5 / 3), 'Riegel は単純比例より遅くなる');
  assert.ok(Math.abs(equivalentTime(1200, 3, 3) - 1200) < 1e-9, '同距離なら不変');
  const back = equivalentTime(t5, 5, 3);
  assert.ok(Math.abs(back - 1200) < 1e-6, '往復すると元に戻る');
});

test('standardTime は基準距離でそのまま base3k を返す', () => {
  const division = findDivision('a30m');
  assert.equal(standardTime(division, BASE_DISTANCE_KM, 1), division.base3k);
  assert.ok(standardTime(division, BASE_DISTANCE_KM, 1.06) > division.base3k, 'タフなコースは基準が緩む');
});

test('基準タイムちょうどで 60 点・評価C になる', () => {
  assert.equal(Math.round(scoreFromRatio(1)), 60);
  assert.equal(gradeFor(60).rank, 'C');
});

test('scoreFromRatio は速いほど高得点で、0〜100 に収まる', () => {
  let previous = Infinity;
  for (let ratio = 0.5; ratio <= 2.5; ratio += 0.01) {
    const score = scoreFromRatio(ratio);
    assert.ok(score >= 0 && score <= 100, `範囲外: ${score}`);
    assert.ok(score <= previous + 1e-9, `単調減少でない: ratio=${ratio}`);
    previous = score;
  }
  assert.equal(scoreFromRatio(0.4), 100);
  assert.equal(scoreFromRatio(3), 0);
});

test('ratioForScore は scoreFromRatio の逆関数になっている', () => {
  for (let score = 1; score <= 99; score += 1) {
    const ratio = ratioForScore(score);
    assert.ok(Math.abs(scoreFromRatio(ratio) - score) < 1e-6, `score=${score} で往復しない`);
  }
});

test('timeForScore はその得点に必要なタイムを返す', () => {
  const standard = 700;
  const target = timeForScore(80, standard);
  assert.ok(target < standard, '80点は基準より速い');
  const result = scoreFromRatio(target / standard);
  assert.ok(Math.abs(result - 80) < 1e-6);
});

test('gradeFor は境界値を上のランクに入れる', () => {
  assert.equal(gradeFor(100).rank, 'S');
  assert.equal(gradeFor(90).rank, 'S');
  assert.equal(gradeFor(89.9).rank, 'A');
  assert.equal(gradeFor(60).rank, 'C');
  assert.equal(gradeFor(44.9).rank, 'E');
  assert.equal(gradeFor(0).rank, 'E');
});

test('normalCdf が標準正規分布の値に一致する', () => {
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 1e-3);
});

test('estimatedTopPercent は速いほど上位で 1〜99 に収まる', () => {
  const standard = 700;
  const fast = estimatedTopPercent(500, standard);
  const slow = estimatedTopPercent(1000, standard);
  assert.ok(fast < slow);
  for (const t of [100, 500, 700, 1200, 5000]) {
    const p = estimatedTopPercent(t, standard);
    assert.ok(p >= 1 && p <= 99, `範囲外: ${p}`);
  }
});

test('actualTopPercent は順位を割合に直す', () => {
  assert.equal(actualTopPercent(1, 100), 0.5);
  assert.equal(actualTopPercent(100, 100), 99.5);
  assert.equal(actualTopPercent(101, 100), null, '完走者数を超える順位は無効');
  assert.equal(actualTopPercent(0, 100), null);
});

test('evaluate は入力エラーを日本語で返す', () => {
  assert.equal(evaluate({ divisionId: 'nope', distanceKm: 3, timeInput: '12:00' }).ok, false);
  assert.equal(evaluate({ divisionId: 'a30m', distanceKm: 0, timeInput: '12:00' }).ok, false);
  assert.equal(evaluate({ divisionId: 'a30m', distanceKm: 3, timeInput: 'はやい' }).ok, false);
});

test('evaluate は一式そろった結果を返す', () => {
  const result = evaluate({
    divisionId: 'a30m',
    distanceKm: 3,
    timeInput: '10:00',
    conditionId: 'standard',
    place: 5,
    finishers: 120,
  });
  assert.equal(result.ok, true);
  assert.equal(result.seconds, 600);
  assert.equal(result.standardSeconds, 660);
  assert.ok(result.score > 60, '基準より速いので 60 点超');
  assert.ok(result.notes.length >= 3);
  assert.ok(result.equivalents.every((e) => e.km !== 3), '入力距離は換算表から除く');
  assert.ok(Math.abs(result.placePercent - 3.75) < 1e-9);
  assert.ok(result.target.seconds < result.seconds, '目標は今より速い');
});

test('コース状況が評価に効く', () => {
  const base = { divisionId: 'a30m', distanceKm: 5, timeInput: '22:00' };
  const fast = evaluate({ ...base, conditionId: 'fast' });
  const tough = evaluate({ ...base, conditionId: 'tough' });
  assert.ok(tough.score > fast.score, '同じタイムならタフなコースの方が高評価');
});

test('全部門で基準タイムちょうどが C 評価になる', () => {
  for (const km of [1, 2, 3, 5, 10]) {
    for (const id of ['e12f', 'e56m', 'jhm', 'hsf', 'a30m', 'a70f']) {
      const division = findDivision(id);
      const seconds = standardTime(division, km, 1);
      const result = evaluate({ divisionId: id, distanceKm: km, timeInput: seconds });
      assert.equal(result.grade.rank, 'C', `${id} / ${km}km`);
    }
  }
});
