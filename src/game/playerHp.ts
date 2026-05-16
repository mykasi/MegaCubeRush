/**
 * プレイヤーHP管理モジュール
 * モジュールスコープでHP・無敵時間を管理し、React再レンダリングを回避
 */
import { playerDebuffs, triggerDodgeBuff, cancelDodgeBuff, resetShifukuBuff, playerPosRef } from './playerStats';
import { resetCombo } from './comboBus';
import { isDashing, getLastDashStartTime, hasDodgeReward, setDodgeRewardClaimed, hasJustDodgeReward, setJustDodgeRewardClaimed } from './playerDash';
import { getGlobalGameTime, triggerPetitMegaCrash, checkEnemyCenterDistance } from './collisionBus';
import { spawnDamagePopup } from '../components/DamagePopups';
import { playSound } from './soundBus';

let lastDodgePopupTime = 0;

const INV_DURATION = 0.5; // 無敵時間（秒）

let _maxHp = 100;
let _currentHp = 100;
let _invTimer = 0; // 無敵時間の残りタイマー

// ===================================
// 初期化・リセット
// ===================================

/** HP初期化（ゲーム開始時 or ステータス更新時） */
export function initPlayerHp(maxHp: number) {
  _maxHp = maxHp;
  _currentHp = maxHp;
  _invTimer = 0;
}

/** リスタート用 */
export function resetPlayerHp(maxHp: number, invDuration: number = 0) {
  _maxHp = maxHp;
  _currentHp = maxHp;
  _invTimer = invDuration;
  lastDodgePopupTime = 0; // 【重要】リスタート時にリセット
}

/** 最大HPを更新（レベルアップや装備変更で最大HPが変わった時） */
export function setMaxHp(newMax: number) {
  _maxHp = newMax;
  if (_currentHp > _maxHp) {
    _currentHp = _maxHp;
  }
}

// ===================================
// ダメージ処理
// ===================================

export type DamageResult = 'damaged' | 'dead' | 'dodged' | 'invincible' | 'none';

export function damagePlayer(amount: number, isSlipDamage: boolean = false): DamageResult {
  if (isPlayerInvincible()) {
    // 【回避判定】ダッシュ（回避アクション）中にダメージを受けた場合は報酬を付与
    if (!isSlipDamage && isDashing()) {
      const now = getGlobalGameTime();
      const dashStart = getLastDashStartTime();
      
      // ジャスト回避条件 (0.05秒以内 & 距離0.4m以内)
      const isJustTiming = (now - dashStart) <= 0.05;
      const isNearEnemy = checkEnemyCenterDistance(playerPosRef.x, playerPosRef.z, 0.4);

      if (isJustTiming && isNearEnemy) {
        // ジャスト回避：既に通常報酬(1.25)を受け取っている場合は差分(3.75)のみ加算
        if (!hasJustDodgeReward()) {
          const bonus = hasDodgeReward() ? 3.75 : 5.0;
          setJustDodgeRewardClaimed();
          setDodgeRewardClaimed(); // 通常報酬も取得済みにする
          
          triggerDodgeBuff(bonus);
          triggerPetitMegaCrash(); // プチメガクラ発動（弾消し＋周囲ダメージ）
          
          if (now - lastDodgePopupTime >= 0.25) {
            lastDodgePopupTime = now;
            spawnDamagePopup(0, 2.5, 2.0, 'I-frame dodge!', 0, '#ffffff', '#bf7fff', -1.5, true);
          }
        }
      } else if (!hasDodgeReward()) {
        // 通常の回避（すり抜け）：まだ報酬を受け取っていない場合のみ
        triggerDodgeBuff(1.25);
        setDodgeRewardClaimed();
      }
      return 'dodged';
    }
    return 'invincible'; // 無敵中（被弾後 or 回避中）はスキップ
  }
  if (_currentHp <= 0) return 'dead'; // すでに死亡

  // 炎やられ中は通常攻撃（スリップダメージ以外）の被ダメージが2倍
  let finalAmount = amount;
  if (!isSlipDamage && playerDebuffs.fire > 0) {
    finalAmount *= 2.0;
  }

  _currentHp = Math.max(0, _currentHp - finalAmount);

  // スリップダメージ（オーラ等）以外の場合のみ、被弾後の無敵時間を付与する
  if (!isSlipDamage) {
    playSound('player_hit');
    _invTimer = INV_DURATION; // 無敵時間を開始
    resetCombo(); // 被弾リセット
    cancelDodgeBuff(); // 被弾時にバフを解消
    resetShifukuBuff(); // ガードバフ（OB/Obscurity）解消
  }

  return _currentHp <= 0 ? 'dead' : 'damaged';
}

/** 回避成功時やメガクラッシュ時に無敵時間を付与する */
export function triggerInvincibility(duration: number = INV_DURATION) {
  _invTimer = duration;
}

/**
 * プレイヤーのHPを回復させる
 * @param amount 回復量
 */
export function regeneratePlayerHp(amount: number) {
  if (_currentHp <= 0) return; // 死亡中は回復しない
  _currentHp = Math.min(_maxHp, _currentHp + amount);
}

/**
 * プレイヤーのHPを能動的に回復させる (ヒール使用時等)
 * @param amount 回復量
 */
export function healPlayer(amount: number) {
  if (_currentHp <= 0) return; // 死亡時は無効
  _currentHp = Math.min(_maxHp, _currentHp + amount);
}

let _lastFireDuration = 0;

/** 毎フレーム呼び出し: 無敵タイマーを減算 + 炎やられスリップダメージ */
export function updateInvTimer(delta: number) {
  if (_invTimer > 0) {
    _invTimer = Math.max(0, _invTimer - delta);
  }

  // 炎やられ中: 1秒ごとに3ダメージのスリップダメージ（無敵時間を付与しない）
  // 判定ライン: 7.1, 6.1, 5.1, 4.1, 3.1, 2.1, 1.1, 0.1 を下回った瞬間に発動
  if (playerDebuffs.fire > 0 && _currentHp > 0) {
    const prevTickIdx = Math.floor(_lastFireDuration - 0.1);
    const currTickIdx = Math.floor(playerDebuffs.fire - 0.1);

    if (prevTickIdx > currTickIdx) {
      // 1秒の境界を越えた
      _currentHp = Math.max(0, _currentHp - 3.0);
    }
  }
  _lastFireDuration = playerDebuffs.fire;
}

// ===================================
// 状態取得
// ===================================

export function isPlayerInvincible(): boolean {
  return _invTimer > 0 || isDashing();
}

export function getPlayerHp(): number {
  return _currentHp;
}

export function getPlayerMaxHp(): number {
  return _maxHp;
}

export function getPlayerHpRatio(): number {
  return _maxHp > 0 ? _currentHp / _maxHp : 0;
}

export function isPlayerDead(): boolean {
  return _currentHp <= 0;
}
