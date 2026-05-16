/**
 * ボスHP情報の共有用バス
 * 画面下部の大型HPバーや他のUIコンポーネントにボスの状態を伝える
 */

export interface BossHPData {
  active: boolean;
  name: string;
  hp: number;
  maxHp: number;
}

/** キング戦用: コア個別HPデータ */
export interface KingCoreHPData {
  active: boolean;
  cores: { hp: number; maxHp: number; alive: boolean }[];
}

let currentBossHP: BossHPData = {
  active: false,
  name: '',
  hp: 0,
  maxHp: 100,
};

let currentKingCoreHP: KingCoreHPData = {
  active: false,
  cores: [],
};

type BossHPListener = (data: BossHPData) => void;
const listeners: BossHPListener[] = [];

type KingCoreHPListener = (data: KingCoreHPData) => void;
const kingCoreListeners: KingCoreHPListener[] = [];

/** ボスのHP情報を更新し、リスナーに通知する */
export function updateBossHP(data: BossHPData) {
  currentBossHP = { ...data };
  listeners.forEach((l) => l(currentBossHP));
}

/** ボスのHP情報を購読する */
export function subscribeBossHP(listener: BossHPListener) {
  listeners.push(listener);
  // 初回通知
  listener(currentBossHP);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

/** 現在の値を直接取得 */
export function getBossHPData(): BossHPData {
  return currentBossHP;
}

/** キング戦コア個別HPを更新 */
export function updateKingCoreHP(data: KingCoreHPData) {
  currentKingCoreHP = data;
  kingCoreListeners.forEach((l) => l(currentKingCoreHP));
}

/** キング戦コア個別HPを購読 */
export function subscribeKingCoreHP(listener: KingCoreHPListener) {
  kingCoreListeners.push(listener);
  listener(currentKingCoreHP);
  return () => {
    const idx = kingCoreListeners.indexOf(listener);
    if (idx > -1) kingCoreListeners.splice(idx, 1);
  };
}
/** ボスHP情報を初期化（非表示化）する */
export function resetBossHPBus() {
  currentBossHP = {
    active: false,
    name: '',
    hp: 0,
    maxHp: 100,
  };
  currentKingCoreHP = {
    active: false,
    cores: [],
  };
  // リスナーに通知してUIを非表示にさせる
  listeners.forEach((l) => l(currentBossHP));
  kingCoreListeners.forEach((l) => l(currentKingCoreHP));
}
