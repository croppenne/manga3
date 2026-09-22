/**
 * 画面の組み立てとイベント配線。
 * 計算は scoring.js、コースデータは course.js、保存は history.js が担当します。
 */

import {
  COURSE,
  DEFAULT_TEE_ID,
  GRADES,
  HOLES,
  HOLE_RESULTS,
  MAX_STROKES_PER_HOLE,
  TEES,
  findTee,
} from './course.js';
import { evaluate, formatDiff, scoreDifferential } from './scoring.js';
import { addRecord, clearRecords, loadRecords, makeId, removeRecord } from './history.js';

const $ = (id) => document.getElementById(id);

const els = {
  form: $('scoreForm'),
  courseLine: $('courseLine'),
  dataNote: $('dataNote'),
  tee: $('tee'),
  modeTotal: $('modeTotal'),
  modeHoles: $('modeHoles'),
  totalField: $('totalField'),
  holesField: $('holesField'),
  scorecard: $('scorecard'),
  scorecardTotal: $('scorecardTotal'),
  strokes: $('strokes'),
  putts: $('putts'),
  greens: $('greens'),
  playDate: $('playDate'),
  error: $('formError'),
  saveButton: $('saveButton'),
  rankChip: $('rankChip'),
  scoreValue: $('scoreValue'),
  rankLabel: $('rankLabel'),
  verdictMeta: $('verdictMeta'),
  meterTrack: $('meterTrack'),
  meterFill: $('meterFill'),
  meterTicks: $('meterTicks'),
  stats: $('stats'),
  notes: $('notes'),
  target: $('target'),
  breakdownPanel: $('breakdownPanel'),
  resultCounts: $('resultCounts'),
  byParBody: $('byParBody'),
  chartHolder: $('chartHolder'),
  historyBody: $('historyBody'),
  clearHistory: $('clearHistory'),
  sampleNote: $('sampleNote'),
  themeToggle: $('themeToggle'),
};

/** 保存がまだ無いときだけ出すサンプル履歴。画面が空っぽに見えないように。 */
const SAMPLE_ROUNDS = [
  { date: '2025-04-12', teeId: 'regular', strokes: 112, putts: 38 },
  { date: '2025-06-21', teeId: 'regular', strokes: 104, putts: 36 },
  { date: '2025-09-06', teeId: 'regular', strokes: 99, putts: 34 },
  { date: '2026-05-16', teeId: 'regular', strokes: 94, putts: 33 },
].map((r) => {
  const result = evaluate({ teeId: r.teeId, strokes: r.strokes, putts: r.putts });
  return {
    ...r,
    id: `sample-${r.date}`,
    points: result.points,
    rank: result.grade.rank,
    diff: result.diff,
    differential: result.differential,
    sample: true,
  };
});

let lastResult = null;
let holeInputs = [];
let holeMode = false;

/* ------------------------------------------------------------------ */
/* 初期化                                                              */
/* ------------------------------------------------------------------ */

function fillCourseText() {
  els.courseLine.textContent =
    `${COURSE.prefecture}・${COURSE.name}（旧 ${COURSE.formerName}）。` +
    `${COURSE.holeCount}ホール パー${COURSE.par}／バックティ ${COURSE.backTeeYards.toLocaleString()}ヤード／` +
    `${COURSE.green}。スコアを入れると100点満点の評価と推定ハンディキャップを出します。`;

  els.dataNote.textContent =
    'コースの基本情報（パー72・6,539ヤード・ベント1グリーン・三浦一美設計・1994年開場）は公開情報にもとづく値です。' +
    'コースレート／スロープレートとホール別のパーは公表値を確認できなかったため、同規模のコースの一般的な値を暫定で置いています。' +
    'スコアカードの数字を src/course.js に書き写すと、推定ハンディキャップとホール別の評価が正確になります。';

  for (const tee of TEES) {
    const opt = document.createElement('option');
    opt.value = tee.id;
    opt.textContent = `${tee.label}　${tee.yards.toLocaleString()}yd　CR ${tee.courseRating.toFixed(1)}`;
    els.tee.append(opt);
  }
  els.tee.value = DEFAULT_TEE_ID;
}

function renderMeterTicks() {
  els.meterTicks.replaceChildren();
  for (const g of [...GRADES].reverse()) {
    if (g.min === 0) continue;
    const tick = document.createElement('span');
    tick.className = 'meter-tick';
    tick.style.left = `${g.min}%`;
    const num = document.createElement('span');
    num.className = 'tick-num';
    num.textContent = String(g.min);
    const rank = document.createElement('div');
    rank.textContent = g.rank;
    tick.append(num, rank);
    els.meterTicks.append(tick);
  }
}

function buildScorecard() {
  els.scorecard.replaceChildren();
  holeInputs = [];

  for (const side of ['OUT', 'IN']) {
    const group = document.createElement('div');
    group.className = 'card-side';

    const heading = document.createElement('p');
    heading.className = 'card-side-head';
    heading.textContent = side;
    group.append(heading);

    const grid = document.createElement('div');
    grid.className = 'card-grid';

    for (const hole of HOLES.filter((h) => h.side === side)) {
      const cell = document.createElement('label');
      cell.className = 'card-cell';
      cell.htmlFor = `hole-${hole.no}`;

      const no = document.createElement('span');
      no.className = 'card-no';
      no.textContent = String(hole.no);

      const par = document.createElement('span');
      par.className = 'card-par';
      par.textContent = `P${hole.par}`;

      const input = document.createElement('input');
      input.type = 'number';
      input.id = `hole-${hole.no}`;
      input.className = 'card-input';
      input.inputMode = 'numeric';
      input.min = '1';
      input.max = String(MAX_STROKES_PER_HOLE);
      input.step = '1';
      input.placeholder = '—';
      input.setAttribute('aria-label', `${hole.no}番 パー${hole.par} の打数`);
      if (hole.note) input.title = `${hole.no}番: ${hole.note}`;

      input.addEventListener('input', () => {
        updateScorecardTotal();
        handleEvaluate();
      });

      holeInputs.push(input);
      cell.append(no, par, input);
      grid.append(cell);
    }

    group.append(grid);
    els.scorecard.append(group);
  }
}

function readHoleStrokes() {
  return holeInputs.map((input) => {
    const value = Number(input.value);
    return input.value !== '' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  });
}

function updateScorecardTotal() {
  const values = readHoleStrokes().filter((v) => v !== null);
  const total = values.reduce((sum, v) => sum + v, 0);
  els.scorecardTotal.textContent =
    values.length === 0
      ? '各ホールの打数を入れると合計を出します。'
      : values.length < 18
        ? `${values.length}／18ホール入力　合計 ${total}打　— 18ホールそろうと評価します`
        : `18／18ホール入力　合計 ${total}打`;
}

/* ------------------------------------------------------------------ */
/* 評価の表示                                                          */
/* ------------------------------------------------------------------ */

function pastDifferentials() {
  return loadRecords()
    .map((r) => (Number.isFinite(r.differential) ? r.differential : scoreDifferential(r.strokes, findTee(r.teeId))))
    .filter((d) => Number.isFinite(d));
}

function readForm() {
  return {
    teeId: els.tee.value,
    strokes: holeMode ? null : els.strokes.value,
    holeStrokes: holeMode ? readHoleStrokes() : [],
    putts: els.putts.value === '' ? null : Number(els.putts.value),
    greens: els.greens.value === '' ? null : Number(els.greens.value),
    pastDifferentials: pastDifferentials(),
  };
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

function statTile(term, value, unit, sub) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.append(document.createTextNode(value));
  if (unit) {
    const u = document.createElement('span');
    u.className = 'unit';
    u.textContent = unit;
    dd.append(u);
  }
  if (sub) {
    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = sub;
    dd.append(s);
  }
  const wrap = document.createElement('div');
  wrap.className = 'stat';
  wrap.append(dt, dd);
  return wrap;
}

function strong(text) {
  const el = document.createElement('strong');
  el.textContent = text;
  return el;
}

function renderResult(result) {
  lastResult = result;

  els.rankChip.dataset.rank = result.grade.rank;
  els.rankChip.textContent = result.grade.rank;
  els.scoreValue.textContent = result.points.toFixed(1);
  els.rankLabel.textContent = `評価 ${result.grade.rank} — ${result.grade.label}`;
  els.verdictMeta.textContent =
    `${result.strokes}打（パー${result.par} ${formatDiff(result.diff)}）／ ${result.tee.label}ティー ${result.tee.yards.toLocaleString()}yd`;

  els.meterFill.dataset.rank = result.grade.rank;
  els.meterFill.style.width = `${Math.max(1.5, result.points)}%`;
  els.meterTrack.setAttribute(
    'aria-label',
    `評価スコア 100点満点中 ${result.points.toFixed(1)}点、評価 ${result.grade.rank}`,
  );

  const tiles = [
    statTile('スコア', String(result.strokes), '打', `パー${result.par} ${formatDiff(result.diff)}`),
    statTile('今日の指数', result.differential.toFixed(1), '', 'ディファレンシャル'),
    result.handicapIndex !== null
      ? statTile('推定ハンデ指数', result.handicapIndex.toFixed(1), '', `直近${result.roundsUsed}ラウンドから`)
      : statTile('推定ハンデ指数', '—', '', `あと${Math.max(0, 3 - result.roundsUsed)}ラウンドで算出`),
    statTile('推定順位', `上位 ${result.estimatedTopPercent.toFixed(0)}`, '%', 'アマチュアのスコア分布からの推定'),
  ];

  if (result.putts !== null) {
    tiles.push(
      statTile('パット', String(result.putts), '', `1ホール平均 ${result.puttsPerHole.toFixed(2)}`),
      statTile('パット以外', String(result.shotsWithoutPutts), '打', 'ショット数'),
    );
  }
  if (result.greens !== null) {
    tiles.push(statTile('パーオン', `${result.greens} / 18`, '', `${result.greenRate.toFixed(0)}%`));
  }

  els.stats.replaceChildren(...tiles);

  els.notes.replaceChildren(
    ...result.notes.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );

  if (result.target.gain > 0) {
    els.target.hidden = false;
    els.target.replaceChildren(
      document.createTextNode('次の目標： '),
      strong(`${result.target.strokes}打`),
      document.createTextNode('。いまより '),
      strong(`${result.target.gain}打`),
      document.createTextNode(
        ` 縮めると ${result.target.points.toFixed(0)}点・評価 ${result.target.grade.rank}（${result.target.grade.label}）に届きます。`,
      ),
    );
  } else {
    els.target.hidden = true;
  }

  renderBreakdown(result);
  renderHistory();
}

function renderBreakdown(result) {
  const summary = result.holeSummary;
  els.breakdownPanel.hidden = !summary;
  if (!summary) return;

  els.resultCounts.replaceChildren(
    ...HOLE_RESULTS.map((r) =>
      statTile(r.label, String(summary.counts[r.key]), 'H'),
    ),
    statTile(
      'OUT / IN',
      `${summary.out.strokes || '—'} / ${summary.in.strokes || '—'}`,
      '',
      `${formatDiff(summary.out.strokes - summary.out.par)} / ${formatDiff(summary.in.strokes - summary.in.par)}`,
    ),
  );

  els.byParBody.replaceChildren();
  for (const group of summary.byPar) {
    const tr = document.createElement('tr');
    const cells = [
      [`パー${group.par}`, ''],
      [group.holes ? `${group.holes}H` : '—', 'num'],
      [group.average !== null ? group.average.toFixed(2) : '—', 'num'],
      [group.overPar !== null ? formatDiff(Math.round(group.overPar * 100) / 100) : '—', 'num'],
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = text;
      tr.append(td);
    }
    els.byParBody.append(tr);
  }
}

/* ------------------------------------------------------------------ */
/* 履歴                                                                */
/* ------------------------------------------------------------------ */

function currentRounds() {
  const saved = loadRecords();
  return saved.length > 0 ? { rounds: saved, sample: false } : { rounds: SAMPLE_ROUNDS, sample: true };
}

function renderHistory() {
  const { rounds, sample } = currentRounds();
  els.sampleNote.hidden = !sample;
  els.clearHistory.disabled = sample;

  els.historyBody.replaceChildren();
  const newestFirst = [...rounds].sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const r of newestFirst) {
    const tee = findTee(r.teeId);
    const tr = document.createElement('tr');

    const cells = [
      [r.date || '—', ''],
      [tee ? tee.label : r.teeId, ''],
      [String(r.strokes), 'num'],
      [formatDiff(r.diff ?? r.strokes - COURSE.par), 'num'],
      [r.putts ? String(r.putts) : '—', 'num'],
      [r.points.toFixed(1), 'num'],
    ];
    for (const [text, cls] of cells) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = text;
      tr.append(td);
    }

    const rankCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.rank = r.rank;
    badge.textContent = r.rank;
    rankCell.append(badge);
    tr.append(rankCell);

    const actionCell = document.createElement('td');
    if (!sample) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'row-action';
      del.textContent = '削除';
      del.setAttribute('aria-label', `${r.date} のラウンドを削除`);
      del.addEventListener('click', () => {
        removeRecord(r.id);
        handleEvaluate();
      });
      actionCell.append(del);
    }
    tr.append(actionCell);

    els.historyBody.append(tr);
  }

  renderChart([...rounds].sort((a, b) => (a.date < b.date ? -1 : 1)));
}

/* ------------------------------------------------------------------ */
/* スコア推移チャート（単一系列 / 0〜100点スケール）                     */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

let chartRounds = [];

function renderChart(rounds) {
  chartRounds = rounds;
  els.chartHolder.replaceChildren();

  if (rounds.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'ラウンドを保存すると、ここに評価スコアの推移が出ます。';
    els.chartHolder.append(empty);
    return;
  }

  const W = Math.max(320, Math.round(els.chartHolder.clientWidth || 720));
  const H = W < 520 ? 200 : 240;
  const pad = { top: 18, right: 26, bottom: 34, left: 34 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const root = svg('svg', {
    class: 'chart',
    width: W,
    height: H,
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `評価スコアの推移。${rounds.length}ラウンド。`,
  });

  const x = (i) => (rounds.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (rounds.length - 1)) * plotW);
  const y = (points) => pad.top + plotH - (points / 100) * plotH;

  for (const value of [0, 20, 40, 60, 80, 100]) {
    root.append(svg('line', { class: 'grid', x1: pad.left, x2: pad.left + plotW, y1: y(value), y2: y(value) }));
    root.append(svg('text', { class: 'tick', x: pad.left - 8, y: y(value) + 3.5, 'text-anchor': 'end' }, String(value)));
  }
  root.append(svg('line', { class: 'axis', x1: pad.left, x2: pad.left + plotW, y1: y(0), y2: y(0) }));

  if (rounds.length > 1) {
    const d = rounds.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r.points).toFixed(1)}`).join(' ');
    root.append(svg('path', { class: 'series', d }));
  }

  const bestPoints = Math.max(...rounds.map((r) => r.points));

  rounds.forEach((r, i) => {
    const cx = x(i);
    const cy = y(r.points);
    root.append(svg('circle', { class: 'dot', cx, cy, r: 5 }));

    const hit = svg('circle', { class: 'dot-hit', cx, cy, r: 16 });
    hit.append(
      svg('title', {}, `${r.date}｜${r.strokes}打｜${r.points.toFixed(1)}点・評価${r.rank}`),
    );
    root.append(hit);

    const anchor = i === 0 ? 'start' : i === rounds.length - 1 ? 'end' : 'middle';
    if (i === 0 || i === rounds.length - 1 || r.points === bestPoints) {
      root.append(svg('text', { class: 'dot-label', x: cx, y: cy - 12, 'text-anchor': anchor }, String(r.strokes)));
    }
    root.append(svg('text', { class: 'tick', x: cx, y: H - 12, 'text-anchor': anchor }, (r.date || '').slice(0, 7)));
  });

  els.chartHolder.append(root);
}

/* ------------------------------------------------------------------ */
/* イベント                                                            */
/* ------------------------------------------------------------------ */

function setHoleMode(on) {
  holeMode = on;
  els.modeHoles.classList.toggle('is-on', on);
  els.modeTotal.classList.toggle('is-on', !on);
  els.modeHoles.setAttribute('aria-pressed', String(on));
  els.modeTotal.setAttribute('aria-pressed', String(!on));
  els.holesField.hidden = !on;
  els.totalField.hidden = on;
  handleEvaluate();
}

function handleEvaluate(event) {
  event?.preventDefault();

  // ホール別入力の途中は、まだエラーではない。進捗はスコアカード側に出す。
  if (holeMode && readHoleStrokes().some((v) => v === null)) {
    showError('');
    return null;
  }

  const result = evaluate(readForm());
  if (!result.ok) {
    showError(result.error);
    return null;
  }
  showError('');
  renderResult(result);
  return result;
}

function handleSave() {
  const result = lastResult ?? handleEvaluate();
  if (!result || !result.ok) return;

  addRecord({
    id: makeId(),
    date: els.playDate.value || new Date().toISOString().slice(0, 10),
    teeId: result.tee.id,
    strokes: result.strokes,
    diff: result.diff,
    points: result.points,
    rank: result.grade.rank,
    differential: Math.round(result.differential * 10) / 10,
    putts: result.putts,
    greens: result.greens,
    holeStrokes: result.allHolesEntered ? readHoleStrokes() : null,
  });
  handleEvaluate();
}

function applyStoredTheme() {
  try {
    const stored = window.localStorage.getItem('akatombo-golf:theme');
    if (stored === 'dark' || stored === 'light') document.documentElement.dataset.theme = stored;
  } catch {
    /* 保存が使えない環境ではOS設定に従います */
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const isDark =
    root.dataset.theme === 'dark' ||
    (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const next = isDark ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    window.localStorage.setItem('akatombo-golf:theme', next);
  } catch {
    /* 保存できなくても表示は切り替わります */
  }
}

function init() {
  applyStoredTheme();
  fillCourseText();
  renderMeterTicks();
  buildScorecard();
  updateScorecardTotal();

  els.strokes.value = '94';
  els.putts.value = '33';
  els.playDate.value = new Date().toISOString().slice(0, 10);

  els.form.addEventListener('submit', handleEvaluate);
  for (const el of [els.tee, els.strokes, els.putts, els.greens]) {
    el.addEventListener('input', () => handleEvaluate());
    el.addEventListener('change', () => handleEvaluate());
  }
  els.modeTotal.addEventListener('click', () => setHoleMode(false));
  els.modeHoles.addEventListener('click', () => setHoleMode(true));
  els.saveButton.addEventListener('click', handleSave);
  els.clearHistory.addEventListener('click', () => {
    clearRecords();
    handleEvaluate();
  });
  els.themeToggle.addEventListener('click', toggleTheme);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderChart(chartRounds), 150);
  });

  handleEvaluate();
}

init();
