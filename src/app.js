/**
 * 画面の組み立てとイベント配線。
 * 計算は scoring.js、保存は history.js が担当します。
 */

import {
  COURSE_CONDITIONS,
  DEFAULT_CONDITION_ID,
  DEFAULT_DISTANCE_KM,
  DEFAULT_DIVISION_ID,
  DIVISIONS,
  GRADES,
  findDivision,
} from './criteria.js';
import {
  evaluate,
  formatPace,
  formatTime,
  standardTime,
} from './scoring.js';
import { addRecord, clearRecords, loadRecords, makeId, removeRecord } from './history.js';

const $ = (id) => document.getElementById(id);

const els = {
  form: $('scoreForm'),
  division: $('division'),
  distance: $('distance'),
  time: $('time'),
  condition: $('condition'),
  place: $('place'),
  finishers: $('finishers'),
  raceDate: $('raceDate'),
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
  equivBody: $('equivBody'),
  chartHolder: $('chartHolder'),
  historyBody: $('historyBody'),
  clearHistory: $('clearHistory'),
  sampleNote: $('sampleNote'),
  themeToggle: $('themeToggle'),
};

/** 画面が空っぽに見えないよう、保存がないときだけ出すサンプル履歴。 */
const SAMPLE_RECORDS = [
  { date: '2023-10-15', divisionId: 'a30m', distanceKm: 3, seconds: 738, conditionId: 'standard' },
  { date: '2024-10-20', divisionId: 'a30m', distanceKm: 3, seconds: 702, conditionId: 'standard' },
  { date: '2025-10-19', divisionId: 'a30m', distanceKm: 3, seconds: 624, conditionId: 'standard' },
].map((r) => {
  const result = evaluate({ ...r, timeInput: r.seconds });
  return {
    ...r,
    id: `sample-${r.date}`,
    score: result.score,
    rank: result.grade.rank,
    sample: true,
  };
});

let lastResult = null;

/* ------------------------------------------------------------------ */
/* 初期化                                                              */
/* ------------------------------------------------------------------ */

function fillSelects() {
  const groups = new Map();
  for (const d of DIVISIONS) {
    if (!groups.has(d.group)) groups.set(d.group, []);
    groups.get(d.group).push(d);
  }
  for (const [group, items] of groups) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const d of items) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label;
      og.append(opt);
    }
    els.division.append(og);
  }
  els.division.value = DEFAULT_DIVISION_ID;

  for (const c of COURSE_CONDITIONS) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    els.condition.append(opt);
  }
  els.condition.value = DEFAULT_CONDITION_ID;
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

/* ------------------------------------------------------------------ */
/* 評価の表示                                                          */
/* ------------------------------------------------------------------ */

function readForm() {
  return {
    divisionId: els.division.value,
    distanceKm: Number(els.distance.value),
    timeInput: els.time.value,
    conditionId: els.condition.value,
    place: els.place.value ? Number(els.place.value) : null,
    finishers: els.finishers.value ? Number(els.finishers.value) : null,
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

function renderResult(result) {
  lastResult = result;

  els.rankChip.dataset.rank = result.grade.rank;
  els.rankChip.textContent = result.grade.rank;
  els.scoreValue.textContent = result.score.toFixed(1);
  els.rankLabel.textContent = `評価 ${result.grade.rank} — ${result.grade.label}`;
  els.verdictMeta.textContent =
    `${result.division.label} ／ ${formatDistance(result.distanceKm)}km ／ ${formatTime(result.seconds)}`;

  els.meterFill.dataset.rank = result.grade.rank;
  els.meterFill.style.width = `${Math.max(1.5, result.score)}%`;
  els.meterTrack.setAttribute(
    'aria-label',
    `評価スコア 100点満点中 ${result.score.toFixed(1)}点、評価 ${result.grade.rank}`,
  );

  const topPct = result.estimatedTopPercent;
  els.stats.replaceChildren(
    statTile('あなたのペース', formatPace(result.paceSecPerKm).replace('/km', ''), '/km'),
    statTile(
      '部門の基準タイム',
      formatTime(result.standardSeconds),
      '',
      `${formatPace(result.standardPaceSecPerKm)}・60点相当`,
    ),
    statTile('推定順位', `上位 ${topPct.toFixed(0)}`, '%', '同部門のタイム分布からの推定'),
    result.placePercent !== null
      ? statTile(
          '実際の順位',
          `${result.place} / ${result.finishers}`,
          '位',
          `上位 ${result.placePercent.toFixed(0)}%`,
        )
      : statTile(
          '基準タイム差',
          signedTime(result.seconds - result.standardSeconds),
          '',
          'マイナスなら基準より速い',
        ),
  );

  els.notes.replaceChildren(
    ...result.notes.map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );

  if (result.target.gainSeconds > 0.5) {
    els.target.hidden = false;
    els.target.replaceChildren();
    els.target.append(
      document.createTextNode('次の目標： '),
      strong(formatTime(result.target.seconds)),
      document.createTextNode(
        `（${formatPace(result.target.paceSecPerKm)}）。いまより `,
      ),
      strong(`${Math.round(result.target.gainSeconds)}秒`),
      document.createTextNode(
        ` 縮めると ${result.target.score.toFixed(0)}点・評価 ${result.target.grade.rank} に届きます。`,
      ),
    );
  } else {
    els.target.hidden = true;
  }

  renderEquivalents(result);
  renderHistory();
}

function strong(text) {
  const el = document.createElement('strong');
  el.textContent = text;
  return el;
}

function signedTime(diffSeconds) {
  const sign = diffSeconds < 0 ? '−' : '+';
  return `${sign}${formatTime(Math.abs(diffSeconds))}`;
}

function formatDistance(km) {
  return Number.isInteger(km) ? String(km) : String(Number(km.toFixed(2)));
}

function renderEquivalents(result) {
  els.equivBody.replaceChildren();
  const rows = [
    {
      km: result.distanceKm,
      seconds: result.seconds,
      paceSecPerKm: result.paceSecPerKm,
      current: true,
    },
    ...result.equivalents,
  ].sort((a, b) => a.km - b.km);

  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.current) tr.className = 'is-current';

    const th = document.createElement('td');
    th.textContent = `${formatDistance(row.km)} km${row.current ? '（今回）' : ''}`;

    const time = document.createElement('td');
    time.className = 'num';
    time.textContent = formatTime(row.seconds);

    const pace = document.createElement('td');
    pace.className = 'num';
    pace.textContent = formatPace(row.paceSecPerKm).replace('/km', '');

    const std = document.createElement('td');
    std.className = 'num';
    std.textContent = formatTime(
      standardTime(result.division, row.km, result.condition.factor),
    );

    tr.append(th, time, pace, std);
    els.equivBody.append(tr);
  }
}

/* ------------------------------------------------------------------ */
/* 履歴                                                                */
/* ------------------------------------------------------------------ */

function currentRecords() {
  const saved = loadRecords();
  return saved.length > 0 ? { records: saved, sample: false } : { records: SAMPLE_RECORDS, sample: true };
}

function renderHistory() {
  const { records, sample } = currentRecords();
  els.sampleNote.hidden = !sample;
  els.clearHistory.disabled = sample;

  els.historyBody.replaceChildren();
  const byDateDesc = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const r of byDateDesc) {
    const division = findDivision(r.divisionId);
    const tr = document.createElement('tr');

    const cells = [
      [r.date || '—', ''],
      [division ? division.label : r.divisionId, ''],
      [`${formatDistance(r.distanceKm)} km`, 'num'],
      [formatTime(r.seconds), 'num'],
      [formatPace(r.seconds / r.distanceKm).replace('/km', ''), 'num'],
      [r.score.toFixed(1), 'num'],
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
      del.setAttribute('aria-label', `${r.date} の記録を削除`);
      del.addEventListener('click', () => {
        removeRecord(r.id);
        renderHistory();
      });
      actionCell.append(del);
    }
    tr.append(actionCell);

    els.historyBody.append(tr);
  }

  renderChart([...records].sort((a, b) => (a.date < b.date ? -1 : 1)));
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

let chartRecords = [];

function renderChart(records) {
  chartRecords = records;
  els.chartHolder.replaceChildren();

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '記録を保存すると、ここにスコアの推移が出ます。';
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
    'aria-label': `評価スコアの推移。${records.length}件の記録。`,
  });

  const x = (i) => (records.length === 1 ? pad.left + plotW / 2 : pad.left + (i / (records.length - 1)) * plotW);
  const y = (score) => pad.top + plotH - (score / 100) * plotH;

  for (const value of [0, 20, 40, 60, 80, 100]) {
    root.append(
      svg('line', { class: 'grid', x1: pad.left, x2: pad.left + plotW, y1: y(value), y2: y(value) }),
    );
    root.append(
      svg('text', { class: 'tick', x: pad.left - 8, y: y(value) + 3.5, 'text-anchor': 'end' }, String(value)),
    );
  }
  root.append(
    svg('line', { class: 'axis', x1: pad.left, x2: pad.left + plotW, y1: y(0), y2: y(0) }),
  );

  if (records.length > 1) {
    const d = records.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r.score).toFixed(1)}`).join(' ');
    root.append(svg('path', { class: 'series', d }));
  }

  records.forEach((r, i) => {
    const cx = x(i);
    const cy = y(r.score);
    root.append(svg('circle', { class: 'dot', cx, cy, r: 5 }));

    const hit = svg('circle', { class: 'dot-hit', cx, cy, r: 16 });
    hit.append(
      svg(
        'title',
        {},
        `${r.date}｜${formatTime(r.seconds)}（${formatDistance(r.distanceKm)}km）｜${r.score.toFixed(1)}点・評価${r.rank}`,
      ),
    );
    root.append(hit);

    const isEdge = i === 0 || i === records.length - 1;
    const isBest = r.score === Math.max(...records.map((p) => p.score));
    if (isEdge || isBest) {
      root.append(
        svg(
          'text',
          {
            class: 'dot-label',
            x: cx,
            y: cy - 12,
            'text-anchor': i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle',
          },
          r.score.toFixed(0),
        ),
      );
    }

    root.append(
      svg(
        'text',
        { class: 'tick', x: cx, y: H - 12, 'text-anchor': i === 0 ? 'start' : i === records.length - 1 ? 'end' : 'middle' },
        (r.date || '').slice(0, 7),
      ),
    );
  });

  els.chartHolder.append(root);
}

/* ------------------------------------------------------------------ */
/* イベント                                                            */
/* ------------------------------------------------------------------ */

function handleEvaluate(event) {
  event?.preventDefault();
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

  const date = els.raceDate.value || new Date().toISOString().slice(0, 10);
  addRecord({
    id: makeId(),
    date,
    divisionId: result.division.id,
    distanceKm: result.distanceKm,
    seconds: result.seconds,
    conditionId: result.condition.id,
    score: result.score,
    rank: result.grade.rank,
    place: result.place,
    finishers: result.finishers,
  });
  renderHistory();
}

function applyStoredTheme() {
  try {
    const stored = window.localStorage.getItem('akatombo-xc:theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.dataset.theme = stored;
    }
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
    window.localStorage.setItem('akatombo-xc:theme', next);
  } catch {
    /* 保存できなくても表示は切り替わります */
  }
}

function init() {
  applyStoredTheme();
  fillSelects();
  renderMeterTicks();

  els.distance.value = String(DEFAULT_DISTANCE_KM);
  els.time.value = '10:24';
  els.raceDate.value = new Date().toISOString().slice(0, 10);

  els.form.addEventListener('submit', handleEvaluate);
  for (const el of [els.division, els.distance, els.time, els.condition, els.place, els.finishers]) {
    el.addEventListener('change', () => handleEvaluate());
  }
  els.saveButton.addEventListener('click', handleSave);
  els.clearHistory.addEventListener('click', () => {
    clearRecords();
    renderHistory();
  });
  els.themeToggle.addEventListener('click', toggleTheme);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderChart(chartRecords), 150);
  });

  handleEvaluate();
}

init();
