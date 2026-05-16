/**
 * プレイヤーレベル＆EXP管理
 * モジュールスコープ変数で管理し、React再レンダリングを回避
 * ExpGems (Expキューブ) が addExp() を呼び、レベルアップ時にコールバックを発火する
 */
import { playSound } from './soundBus';


// ===================================
// 定数・設定
// ===================================

let _expMultiplier = 1.0;

function getRequiredExp(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.5) * _expMultiplier);
}

export function setExpMultiplier(m: number) {
  _expMultiplier = m;
  // 現在のレベルの必要経験値を再計算
  _requiredExp = getRequiredExp(_level);
}

/** レベルアップ時の基礎ステータス成長分 */
export interface LevelBonusStats {
  attackPower: number;
  defense: number;
  health: number;
  speed: number;
}

export function getLevelBonusStats(level: number): LevelBonusStats {
  return {
    attackPower: (level - 1) * 2,   // Lv毎に攻撃+2
    defense: (level - 1) * 1,       // Lv毎に防御+1
    health: (level - 1) * 10,       // Lv毎に体力+10
    speed: (level - 1) * 1,         // Lv毎に速度+1
  };
}

// ===================================
// 状態（モジュールスコープ）
// ===================================
let _level = 1;
let _currentExp = 0;
let _requiredExp = getRequiredExp(1);
let _totalExp = 0; // 追加: 総取得経験値

// ===================================
// レベルアップコールバック
// ===================================
type LevelUpCallback = (newLevel: number) => void;
const _levelUpCallbacks: LevelUpCallback[] = [];

export function onLevelUp(cb: LevelUpCallback): () => void {
  _levelUpCallbacks.push(cb);
  return () => {
    const idx = _levelUpCallbacks.indexOf(cb);
    if (idx >= 0) _levelUpCallbacks.splice(idx, 1);
  };
}

// ===================================
// EXP操作
// ===================================

/** EXPを加算し、レベルアップを処理する */
export function addExp(amount: number): void {
  _currentExp += amount;
  _totalExp += amount; // 追加
  while (_currentExp >= _requiredExp) {
    _currentExp -= _requiredExp;
    _level++;
    _requiredExp = getRequiredExp(_level);
    playSound('levelup');
    // コールバック発火
    for (const cb of _levelUpCallbacks) {
      cb(_level);
    }
  }
}

// ===================================
// ゲッター（UI用のポーリングに使用）
// ===================================
export function getLevel(): number {
  return _level;
}

export function getCurrentExp(): number {
  return _currentExp;
}

export function getRequiredExpForCurrentLevel(): number {
  return _requiredExp;
}

export function getExpRatio(): number {
  return _requiredExp > 0 ? _currentExp / _requiredExp : 0;
}

/** リスタート用: レベルとEXPを初期状態に戻す */
export function resetLevel() {
  _level = 1;
  _currentExp = 0;
  _requiredExp = getRequiredExp(1);
  _totalExp = 0; // 追加
}

export function getTotalExp(): number {
  return _totalExp;
}
