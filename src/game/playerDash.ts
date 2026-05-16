/**
 * 回避アクションの状態を管理するモジュール
 * Reactのレンダリングから独立して、毎フレーム更新およびアクセスが可能
 */
import { Vector3 } from 'three';
import { playerStatsRef, addShifukuBuff, playerDebuffs } from './playerStats';
import { getGlobalGameTime } from './collisionBus';
import { playSound } from './soundBus';

const DASH_COST = 25;         // 1回の消費量
const DASH_REGEN_RATE = 12.5; // 1秒あたりの回復量
const DASH_DURATION = 0.25;    // 秒
const DASH_SPEED_MULTIPLIER = 4.0; // 通常の何倍の速度で移動するか

let _dashStamina = 100; // 初期値
let _dashTimer = 0;
let _lastDashStartTime = 0; // 【新設】回避開始時刻
let _hasDodgeReward = false; // 【新設】現在の回避で報酬を得たか
let _hasJustDodgeReward = false; // 【新設】現在の回避でジャスト報酬を得たか
const _dashDirection = new Vector3();

// ===================================
// 基本的なゲッター
// ===================================

export function isDashing(): boolean {
  return _dashTimer > 0;
}

export function getDashStamina(): number {
  return _dashStamina;
}

export function getDashMaxStamina(): number {
  return playerStatsRef.current.maxSp;
}

export function getDashDirection(): Vector3 {
  return _dashDirection;
}

export function getDashSpeedMultiplier(): number {
  return DASH_SPEED_MULTIPLIER;
}

export function getLastDashStartTime(): number {
  return _lastDashStartTime;
}

export function hasDodgeReward(): boolean {
  return _hasDodgeReward;
}

export function setDodgeRewardClaimed() {
  _hasDodgeReward = true;
}

export function hasJustDodgeReward(): boolean {
  return _hasJustDodgeReward;
}

export function setJustDodgeRewardClaimed() {
  _hasJustDodgeReward = true;
}

/** 指定した量のSPを消費する。氷やられ中は消費量が2倍。足りない場合は0にし、falseを返す */
export function drainStamina(amount: number): boolean {
  // 氷やられ中: SP消費量が2倍
  const actualAmount = playerDebuffs.ice > 0 ? amount * 2.0 : amount;
  if (_dashStamina <= 0) return false;
  if (_dashStamina < actualAmount) {
    _dashStamina = 0;
    return false;
  }
  _dashStamina -= actualAmount;
  return true;
}

export function drainGuardStamina(amount: number): boolean {
  const success = drainStamina(amount);
  if (success) addShifukuBuff(amount);
  return success;
}

// ===================================
// ロジック
// ===================================

/**
 * 回避の発動を試みる
 * @param currentInputDirection 現在プレイヤーが入力している移動ベクトル（正規化済みが望ましい）
 * @param currentFacingDirection 入力がない場合に現在向いているベクトル
 * @returns 回避が発動したかどうか
 */
export function tryDash(
  currentInputDirection: Vector3,
  currentFacingDirection: Vector3
): boolean {
  // 氷やられ中: SP消費量が2倍
  const actualCost = playerDebuffs.ice > 0 ? DASH_COST * 2.0 : DASH_COST;

  // すでに回避中、またはスタミナが足りない場合は発動不可
  if (_dashTimer > 0 || _dashStamina < actualCost) return false;

  // 移動入力があればその方向へ、なければ向いている方向へ回避動作を実行
  if (currentInputDirection.lengthSq() > 0.01) {
    _dashDirection.copy(currentInputDirection).normalize();
  } else {
    _dashDirection.copy(currentFacingDirection).normalize();
  }

  _dashTimer = DASH_DURATION;
  _lastDashStartTime = getGlobalGameTime(); // ゲーム内時間で記録
  _hasDodgeReward = false; // フラグリセット
  _hasJustDodgeReward = false; // フラグリセット
  _dashStamina -= actualCost;
  
  playSound('dash');

  return true;
}

/**
 * 毎フレーム呼び出し: 回避時間の経過処理
 */
export function updateDash(delta: number) {
  const maxSp = getDashMaxStamina();
  if (_dashTimer > 0) {
    _dashTimer = Math.max(0, _dashTimer - delta);
  }
  if (_dashStamina < maxSp) {
    _dashStamina = Math.min(maxSp, _dashStamina + DASH_REGEN_RATE * delta);
  } else if (_dashStamina > maxSp) {
    _dashStamina = maxSp; // 最大値減少時にクリッピング
  }
}

/**
 * リセット用（リスタート時など）
 */
export function resetDash() {
  _dashStamina = getDashMaxStamina();
  _dashTimer = 0;
  _lastDashStartTime = 0; // 【重要】リスタート時にリセット
  _hasDodgeReward = false;
  _hasJustDodgeReward = false;
  _dashDirection.set(0, 0, 0);
}
