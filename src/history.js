/**
 * ラウンド履歴の保存（ブラウザのローカル保存のみ。サーバーには何も送りません）
 */

const STORAGE_KEY = 'akatombo-golf:rounds:v1';
const MAX_RECORDS = 40;

/** localStorage が使えない環境（プライベートウィンドウ等）のフォールバック。 */
let memoryFallback = null;

function readRaw() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return memoryFallback ?? [];
  }
}

function writeRaw(records) {
  memoryFallback = records;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function isRecord(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.teeId === 'string' &&
    Number.isFinite(value.strokes) &&
    Number.isFinite(value.points)
  );
}

/** 保存済みのラウンドを新しい順で返す。 */
export function loadRecords() {
  const records = readRaw();
  if (!Array.isArray(records)) return [];
  return records.filter(isRecord).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** ラウンドを 1 件追加して、保存後の一覧を返す。 */
export function addRecord(record) {
  const next = [{ ...record, id: record.id ?? makeId() }, ...loadRecords()].slice(0, MAX_RECORDS);
  writeRaw(next);
  return loadRecords();
}

/** id を指定して 1 件削除する。 */
export function removeRecord(id) {
  writeRaw(loadRecords().filter((r) => r.id !== id));
  return loadRecords();
}

/** すべて削除する。 */
export function clearRecords() {
  writeRaw([]);
  return [];
}

/** 衝突しにくい id を作る。 */
export function makeId() {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
