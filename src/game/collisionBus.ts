/**
 * 当たり判定用の共有データバス
 * コンポーネント間で敵の座標・生存状態・HPを共有するための軽量モジュール
 * React のステート管理を経由せず、直接配列を参照することで高速化
 *
 * オブジェクトプール方式: poolSize 分のスロットを事前確保し、
 * alive=false のスロットを再利用（リスポーン）する
 */
import { addKill } from './gameProgress';
import { currentEnchant, currentEnchantLevel } from './enchantState';
import { tryDropItem } from './dropBus';
import { spawnGem } from './expGemBus';
import { playerStatsRef, dodgeBuffTimer } from './playerStats';
import { spawnDamagePopup } from '../components/DamagePopups';
import { addCombo } from './comboBus';
import { playSound, type SoundType } from './soundBus';

let poolSize = 0;
/** 敵の座標（フラット配列: [x0, z0, x1, z1, ...]） */
let enemyPositions = new Float32Array(0);
/** 敵の生存フラグ（true=アクティブ） */
let enemyAlive: boolean[] = [];
/** 敵の現在HP */
let enemyHp = new Float32Array(0);
/** 敵の最大HP */
let enemyMaxHp = new Float32Array(0);
/** 敵のタイプ (0: Pawn, 1: Knight, 2: Rook, 3: Bishop) */
let enemyType = new Uint8Array(0);

/** 蓄積されたノックバック量 */
let enemyKnockbackX = new Float32Array(0);
let enemyKnockbackZ = new Float32Array(0);

// ===================================
// エンチャント状態（enchantState.tsに移行）
// ===================================

// ===================================
// 敵デバフ用配列
// ===================================
let enemyFireSlipDps = new Float32Array(0);
let enemyIceSlowRate = new Float32Array(0);
let enemyLightningSlowRate = new Float32Array(0);

let enemyFireDuration = new Float32Array(0);
let enemyIceDuration = new Float32Array(0);
let enemyLightningDuration = new Float32Array(0);

// ===================================
// 空間分割 (Spatial Hashing) 用
// ===================================
const CELL_SIZE = 3.0; // 3x3 セル
const GRID_COLS = 50;  // -75 ~ +75 くらいをカバー
const GRID_ROWS = 50;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;
const OFFSET_X = (GRID_COLS * CELL_SIZE) / 2;
const OFFSET_Z = (GRID_ROWS * CELL_SIZE) / 2;

/**
 * cellHead[cellIndex] = そのセルにいる最初の敵のインデックス
 * null の代わり（空）は -1 とする
 */
let cellHead = new Int16Array(0);

/**
 * nextInCell[enemyIndex] = 同じセルにいる次の敵のインデックス
 * null の代わり（末尾）は -1 とする
 */
let nextInCell = new Int16Array(0);



/** 最大HPの計算式（Waveごとに階段状にスケール。後半をマイルドに調整） */
export function calcMaxHp(timeSeconds: number): number {
  // 経過秒数を分（Wave）で切り捨てる
  const minutes = Math.floor(timeSeconds / 60);
  
  // 基礎値5.0、一次係数4.5、二次係数0.6 で終盤の理不尽な固さを抑制
  const rawHp = 5.0 + (minutes * 4.5) + (minutes * minutes * 0.6);
  
  return Number(rawHp.toFixed(1));
}

let _globalGameTime = 0;
export function setGlobalGameTime(t: number) { _globalGameTime = t; }
export function getGlobalGameTime() { return _globalGameTime; }

/** 敵の基本攻撃力（WAVE制: 滑らかな二次曲線で上昇） */
export function getEnemyBaseDamage(): number {
  const minutes = Math.floor(_globalGameTime / 60);
  
  // 基礎値6.0 から始まり、1次係数0.8、2次係数0.12で滑らかに上昇
  const rawDmg = 6.0 + (minutes * 0.8) + (minutes * minutes * 0.12);
  
  return Number(rawDmg.toFixed(1));
}

// ===================================
// 初期化
// ===================================

/** プール初期化（InstancedEnemies マウント時に呼ぶ） */
export function registerEnemies(size: number) {
  if (size !== poolSize || enemyAlive.length !== size) {
    poolSize = size;
    enemyPositions = new Float32Array(size * 2);
    enemyAlive = new Array(size).fill(false);
    enemyHp = new Float32Array(size);
    enemyMaxHp = new Float32Array(size);
    enemyFireSlipDps = new Float32Array(size);
    enemyIceSlowRate = new Float32Array(size);
    enemyLightningSlowRate = new Float32Array(size);
    enemyFireDuration = new Float32Array(size);
    enemyIceDuration = new Float32Array(size);
    enemyLightningDuration = new Float32Array(size);
    
    cellHead = new Int16Array(TOTAL_CELLS).fill(-1);
    nextInCell = new Int16Array(size).fill(-1);
    enemyType = new Uint8Array(size);
    enemyKnockbackX = new Float32Array(size);
    enemyKnockbackZ = new Float32Array(size);
  } else {
    resetAllEnemies(); // 同じサイズなら既存の内容をクリア
  }
}

/** 全スロットリセット（リスタート時用） */
export function resetAllEnemies() {
  for (let i = 0; i < poolSize; i++) {
    enemyAlive[i] = false;
    enemyHp[i] = 0;
    enemyMaxHp[i] = 0;
    enemyPositions[i * 2] = 0;
    enemyPositions[i * 2 + 1] = 0;
    enemyFireSlipDps[i] = 0;
    enemyIceSlowRate[i] = 0;
    enemyLightningSlowRate[i] = 0;
    enemyFireDuration[i] = 0;
    enemyIceDuration[i] = 0;
    enemyLightningDuration[i] = 0;
    nextInCell[i] = -1;
    enemyType[i] = 0;
    enemyKnockbackX[i] = 0;
    enemyKnockbackZ[i] = 0;
  }
  _globalGameTime = 0;
  cellHead.fill(-1);
}

// ===================================
// スポーン（リスポーン）
// ===================================

/** 非アクティブなスロットのインデックスを探す（なければ-1） */
export function findInactiveSlot(): number {
  for (let i = 0; i < poolSize; i++) {
    if (!enemyAlive[i]) {
      // クイーン(4)、キングコア(5)、シールド(6)などのボスパーツだったスロットは通常雑魚スポーンで再利用しない
      if (enemyType[i] >= 4) continue;
      return i;
    }
  }
  return -1;
}

/** 指定スロットを指定座標にアクティブ化（スポーン） */
export function respawnEnemy(index: number, x: number, z: number, timeSeconds: number, type: number = 0) {
  let hp = calcMaxHp(timeSeconds);
  
  // タイプ別のHP補正
  if (type === 1) hp = Math.max(1, hp * 0.6); // Knight(高速) HP0.6倍
  if (type === 2) hp = hp * 2.0; // Rook(重装) HP2.0倍
  if (type === 3) hp = Math.max(1, hp * 0.75); // 変更: Bishop HP0.75倍
  if (type === 4) hp = hp * 100.0; // Queen 最大HP 100倍
  if (type === 5) hp = hp * 50.0; // King Core (ポーンのHPの50倍)
  if (type === 6) hp = hp * 100.0; // Shield Sub-segment (ポーンのHPの100倍)
  
  enemyType[index] = type;
  enemyAlive[index] = true;
  enemyHp[index] = hp;
  enemyMaxHp[index] = hp;
  enemyPositions[index * 2] = x;
  enemyPositions[index * 2 + 1] = z;
  enemyFireSlipDps[index] = 0;
  enemyIceSlowRate[index] = 0;
  enemyLightningSlowRate[index] = 0;
  enemyFireDuration[index] = 0;
  enemyIceDuration[index] = 0;
  enemyLightningDuration[index] = 0;

  // 空間分割グリッドに即座に登録
  updateEnemyPos(index, x, z);
}

export function getEnemyType(index: number): number { return enemyType[index]; }

export function getEnemyRadius(index: number): number {
  const type = enemyType[index];
  if (type === 4) return 2.0; // Queen
  if (type === 5) return 2.0; // King Core
  if (type === 6) return 0.8; // Shield (多段判定の個々の半径を縮小)
  if (type === 2) return 0.9; // Rook
  if (type === 1) return 0.45; // Knight (見た目の0.75倍に合わせて縮小)
  return 0.6; // Default (Pawn, Bishop)
}

// ===================================
// 座標更新
// ===================================

/** 毎フレーム、敵の描画座標を更新（InstancedEnemies が呼ぶ） */
export function updateEnemyPos(index: number, x: number, z: number) {
  const offset = index * 2;
  enemyPositions[offset] = x;
  enemyPositions[offset + 1] = z;
}

/** 敵のHPを直接更新する (ボスパーツの同期用) */
export function updateEnemyHp(index: number, hp: number) {
  enemyHp[index] = hp;
  if (hp <= 0 && enemyAlive[index]) {
    enemyAlive[index] = false;
  }
}

/** 
 * グリッド完全洗浄と再構築 (Full Rebuild)
 * 毎フレーム全ての生存敵をグリッドに再登録することで、削除漏れや同期ズレを物理的に排除する
 */
export function rebuildGrid() {
  cellHead.fill(-1);
  nextInCell.fill(-1);

  for (let i = 0; i < poolSize; i++) {
    if (!enemyAlive[i]) continue;

    const x = enemyPositions[i * 2];
    const z = enemyPositions[i * 2 + 1];

    let cx = Math.floor((x + OFFSET_X) / CELL_SIZE);
    let cz = Math.floor((z + OFFSET_Z) / CELL_SIZE);
    
    // 画面外も安全に処理
    cx = Math.max(0, Math.min(GRID_COLS - 1, cx));
    cz = Math.max(0, Math.min(GRID_ROWS - 1, cz));
    
    const cell = cz * GRID_COLS + cx;

    // 先頭挿入 (Linked List)
    nextInCell[i] = cellHead[cell];
    cellHead[cell] = i;
  }
}

    /**
     * 敵にノックバック（吹き飛ばし）のベクトルを蓄積する
     * @param index 敵のインデックス
     * @param nx 押し出す方向X（ベクトル）
     * @param nz 押し出す方向Z（ベクトル）
     * @param force 押し出す力（距離）
     */
    export function applyKnockback(index: number, nx: number, nz: number, force: number) {
      if (index < 0 || index >= poolSize || !enemyAlive[index]) return;
      
      let finalForce = force;
      const type = enemyType[index];
      
      // 敵のタイプ（質量）によるノックバック距離のスケーリング
      // 基準となるDODGE의 force(1.5)に対する倍率として計算
      if (type === 1) {
        // Knight: 軽く吹き飛びやすい (基準1.5m -> 2.5m になるようスケール)
        finalForce = force * (2.5 / 1.5);
      } else if (type === 2) {
        // Rook: 重く吹き飛びにくい (基準1.5m -> 1.0m になるようスケール)
        finalForce = force * (1.0 / 1.5);
      }

      enemyKnockbackX[index] += nx * finalForce;
      enemyKnockbackZ[index] += nz * finalForce;
    }

/** 蓄積されたノックバック量を取得し、ゼロにリセットする */
export function consumeKnockback(index: number): { x: number; z: number } {
  const kx = enemyKnockbackX[index];
  const kz = enemyKnockbackZ[index];
  enemyKnockbackX[index] = 0;
  enemyKnockbackZ[index] = 0;
  return { x: kx, z: kz };
}

// ===================================
// 照会（当たり判定用足切り）
// ===================================
/** 指定された座標（x, z）と半径の円を内包するセル群から、候補となる敵のIDを列挙して返す */
export function getEnemiesInRadius(x: number, z: number, radius: number, outIndices: number[]): number {
  outIndices.length = 0;
  const minCx = Math.max(0, Math.floor((x - radius + OFFSET_X) / CELL_SIZE));
  const maxCx = Math.min(GRID_COLS - 1, Math.floor((x + radius + OFFSET_X) / CELL_SIZE));
  const minCz = Math.max(0, Math.floor((z - radius + OFFSET_Z) / CELL_SIZE));
  const maxCz = Math.min(GRID_ROWS - 1, Math.floor((z + radius + OFFSET_Z) / CELL_SIZE));

  let count = 0;
  for (let cz = minCz; cz <= maxCz; cz++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const cell = cz * GRID_COLS + cx;
      let curr = cellHead[cell];
      while (curr !== -1) {
        // 取得したインデックスが本当に生きているか、この瞬間に再確認する（ゴースト対策）
        if (!enemyAlive[curr]) {
          curr = nextInCell[curr];
          continue;
        }
        
        outIndices.push(curr);
        count++;
        curr = nextInCell[curr];
      }
    }
  }
  return count;
}

// ===================================
// ダメージ
// ===================================

/**
 * 敵にダメージを与える
 * @returns { killed: boolean, finalDamage: number }
 */
export function damageEnemy(index: number, damage: number, isPhysical: boolean = true, isMelee: boolean = true, skipEnchant: boolean = false, hitSoundOverride?: SoundType): { killed: boolean; finalDamage: number } {
  if (index < 0 || index >= poolSize || !enemyAlive[index]) return { killed: false, finalDamage: 0 };

  const t = enemyType[index];
  // 遮蔽板 (Type 6) は全てのデバフを完全に無効化する
  if (t === 6) skipEnchant = true;

  let finalDmg = damage;

  // ===== エンチャントによるダメージ補正（減衰と緩和） =====
  if (isPhysical && currentEnchant !== 'none' && !skipEnchant) {
    // 物理ダメージ減衰率の緩和: Lv1で0.80、Lv5で1.00
    const multiplier = 0.75 + (currentEnchantLevel * 0.05);
    finalDmg *= multiplier;

    const t = enemyType[index];
    // クイーン(Type 4)は2.0秒、キング(Type 5, 6)は判定漏れ防止のため1.1秒、他は4秒
    const duration = t === 4 ? 2.0 : (t === 5 || t === 6 ? 1.1 : 4.0);

    // デバフ付与
    if (currentEnchant === 'fire') {
      const baseAtk = isMelee ? playerStatsRef.current.meleeAttackPower : playerStatsRef.current.rangedAttackPower;
      const slipDps = Math.max(1, baseAtk * (currentEnchantLevel * 0.05));
      enemyFireSlipDps[index] = Math.max(enemyFireSlipDps[index], slipDps);
      enemyFireDuration[index] = duration; // 時間は常に上書き
    } else if (currentEnchant === 'ice') {
      const slow = currentEnchantLevel * 0.1;
      enemyIceSlowRate[index] = Math.max(enemyIceSlowRate[index], slow);
      enemyIceDuration[index] = duration;
    } else if (currentEnchant === 'lightning') {
      const slow = currentEnchantLevel * 0.1;
      enemyLightningSlowRate[index] = Math.max(enemyLightningSlowRate[index], slow);
      enemyLightningDuration[index] = duration;
    }
  }

  // 最低1ダメージ保証 (小数のまま処理)
  finalDmg = Math.max(1, finalDmg);

  const actualDamage = Math.min(enemyHp[index], finalDmg);
  
  if (isPhysical && enemyHp[index] > 0 && actualDamage > 0) {
    addCombo(1); // ヒット時コンボ加算 (物理攻撃のみ)
  }
  
  enemyHp[index] -= actualDamage;
  if (actualDamage > 0) {
    // ① 武器ヒット音を再生（常に鳴る）
    if (hitSoundOverride) playSound(hitSoundOverride);
    else playSound('hit');
    // ② エンチャント音を追加で重ねて再生（発動中のみ、かつ skipEnchant が false のときのみ）
    if (!skipEnchant) {
      if (currentEnchant === 'fire') playSound('hit_fire');
      else if (currentEnchant === 'ice') playSound('hit_ice');
      else if (currentEnchant === 'lightning') playSound('hit_lightning');
    }
  }
  
  const killed = enemyHp[index] <= 0;
  if (killed) {
    playSound('enemy_death');
    enemyAlive[index] = false;

    const t = enemyType[index];
    // Type 6 (シールド) はキル数・ドロップ・経験値を発生させない
    if (t !== 6) {
      addKill();

      let exp = 5;
      let dropCount = 1;
      if (t === 1) { exp = 12; dropCount = 1; } // Knight
      else if (t === 2) { exp = 6; dropCount = 2; } // Rook
      else if (t === 3) { exp = 10; dropCount = 2; } // Bishop
      else if (t === 4) { exp = 5000; dropCount = 20; } // Queen
      else if (t === 5) { exp = 2000; dropCount = 10; } // King Core

      for (let d = 0; d < dropCount; d++) {
        tryDropItem(enemyPositions[index * 2], enemyPositions[index * 2 + 1], window.__systemUpgrades?.dropMult);
      }
      spawnGem(enemyPositions[index * 2], enemyPositions[index * 2 + 1], exp);
    }

    // 撃破時は enemyAlive = false にするため、
    // 次フレームの rebuildGrid で自動的にグリッドから除外される
  }

  return { killed, finalDamage: finalDmg };
}

/**
 * メガクラッシュ発動: 5m以内の敵にダメージ & 強制ノックバック
 */
export function triggerMegaCrush(px: number, pz: number, damage: number, knockbackDist: number) {
  const outIndices: number[] = [];
  getEnemiesInRadius(px, pz, 7.5, outIndices);

  for (const idx of outIndices) {
    if (!enemyAlive[idx]) continue;
    
    // 距離判定（円形）
    const ex = enemyPositions[idx * 2];
    const ez = enemyPositions[idx * 2 + 1];
    const dx = ex - px;
    const dz = ez - pz;
    const distSq = dx * dx + dz * dz;
    if (distSq > 7.5 * 7.5) continue;

    // ダメージ計算 (個別クリティカル判定: 回避バフ 50% を動的に加算)
    const stats = playerStatsRef.current;
    const effectiveCritChance = stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0);
    const isCrit = Math.random() < (effectiveCritChance / 100);
    const finalDamage = isCrit 
      ? damage * (stats.critDamage / 100) 
      : damage;

    // ダメージ適用
    const result = damageEnemy(idx, finalDamage, false, false);
    
    // ダメージポップアップ表示 (クリティカル時は critType: 1)
    spawnDamagePopup(ex, 1.2, ez, result.finalDamage, isCrit ? 1 : 0, '#ffffff', '#000000');

    // 強制ノックバック: プレイヤーから遠ざかる方向へスライド
    const dist = Math.sqrt(distSq) || 0.001;
    const nx = dx / dist;
    const nz = dz / dist;
    
    // applyKnockback を使って InstancedEnemies 側の移動ロジックに流す
    // ForceSlideのため大きな値を設定（質量無視の設定は後ほど InstancedEnemies 側で調整するが
    // ここでは引数通りの距離を与える）
    applyKnockback(idx, nx, nz, knockbackDist);
  }
}

// --- FULL REBUILD 方式採用のため removeEnemyFromGrid は廃止 ---

/** 
 * スリップダメージ等の直接HP減少処理
 * @returns 死亡したか
 */
export function applyDoT(index: number, damage: number): boolean {
  if (!enemyAlive[index]) return false;
  enemyHp[index] -= damage;
  if (enemyHp[index] <= 0) {
    enemyAlive[index] = false;

    const t = enemyType[index];
    // Type 6 (シールド) はキル数・ドロップ・経験値を発生させない
    if (t !== 6) {
      addKill();

      let exp = 5;
      let dropCount = 1;
      if (t === 1) { exp = 12; dropCount = 1; } // Knight
      else if (t === 2) { exp = 6; dropCount = 2; } // Rook
      else if (t === 3) { exp = 10; dropCount = 2; } // Bishop
      else if (t === 4) { exp = 5000; dropCount = 20; } // Queen
      else if (t === 5) { exp = 2000; dropCount = 10; } // King Core

      for (let d = 0; d < dropCount; d++) {
        tryDropItem(enemyPositions[index * 2], enemyPositions[index * 2 + 1]);
      }
      spawnGem(enemyPositions[index * 2], enemyPositions[index * 2 + 1], exp);
    }
    
    // 次フレームの rebuildGrid で自動的に除外される
    return true;
  }
  return false;
}

// ===================================
// 状態取得
// ===================================

export function isEnemyAlive(index: number): boolean {
  return enemyAlive[index];
}

export function getEnemyCount(): number {
  return poolSize;
}

export function getEnemyPositions(): Float32Array {
  return enemyPositions;
}

export function getEnemyHp(index: number): number {
  return enemyHp[index];
}

export function getEnemyMaxHp(index: number): number {
  return enemyMaxHp[index];
}

/** 現在アクティブな敵の数 */
export function getActiveEnemyCount(): number {
  let count = 0;
  for (let i = 0; i < poolSize; i++) {
    if (enemyAlive[i]) count++;
  }
  return count;
}
/** ランダムなアクティブな敵の座標を取得 */
export function getRandomActiveEnemyPosition(): [number, number] | null {
  const activeIndices: number[] = [];
  for (let i = 0; i < poolSize; i++) {
    if (enemyAlive[i]) activeIndices.push(i);
  }
  if (activeIndices.length === 0) return null;
  const idx = activeIndices[Math.floor(Math.random() * activeIndices.length)];
  return [enemyPositions[idx * 2], enemyPositions[idx * 2 + 1]];
}

let _isPlayerGuarding = false;
export function setPlayerGuarding(val: boolean) {
  _isPlayerGuarding = val;
}
export function isPlayerGuarding() { return _isPlayerGuarding; }

// ===================================
// ジャストガード判定システム (距離ベース)
// ===================================
type ExternalCheckFn = (px: number, pz: number, barrierRadius: number) => boolean;
let _projCheck: ExternalCheckFn = () => false;
let _rippleCheck: ExternalCheckFn = () => false;

export function registerProjectileCheck(fn: ExternalCheckFn) { _projCheck = fn; }
export function registerRippleCheck(fn: ExternalCheckFn) { _rippleCheck = fn; }

/** 
 * ジャストガード判定: バリア発動時に「全身がバリア内に収まっている」か
 */
export function checkJustGuard(px: number, pz: number, barrierRadius: number): boolean {
  // 1. 敵ユニットのチェック
  const count = getEnemyCount();
  const pos = getEnemyPositions();
  for (let i = 0; i < count; i++) {
    if (!isEnemyAlive(i)) continue;
    const dx = pos[i * 2] - px;
    const dz = pos[i * 2 + 1] - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    const type = getEnemyType(i);
    // 判定用半径: ルーク(0.4), ナイト(0.2), その他(0.3)
    const r = (type === 2) ? 0.4 : (type === 1) ? 0.2 : 0.3;
    
    // 全身がバリア(1.2m)内に収まっている = 中心距離 + 半径 <= 1.2
    if (dist + r <= barrierRadius + 0.001) return true;
  }

  // 2. 弾丸のチェック (外部登録関数)
  if (_projCheck(px, pz, barrierRadius)) return true;

  // 3. ボス波紋のチェック (外部登録関数)
  if (_rippleCheck(px, pz, barrierRadius)) return true;

  return false;
}

let _isPlayerBoosting = false;
export function setPlayerBoosting(val: boolean) { _isPlayerBoosting = val; }
export function isPlayerBoosting() { return _isPlayerBoosting; }

/**
 * 回避用判定: 敵のサイズを無視し、中心同士の距離だけで判定する
 */
export function checkEnemyCenterDistance(px: number, pz: number, radius: number): boolean {
  const count = getEnemyCount();
  const pos = getEnemyPositions();
  const radiusSq = radius * radius;

  for (let i = 0; i < count; i++) {
    if (!isEnemyAlive(i)) continue;
    const dx = pos[i * 2] - px;
    const dz = pos[i * 2 + 1] - pz;
    const distSq = dx * dx + dz * dz;
    
    if (distSq <= radiusSq) return true;
  }
  return false;
}

// ===================================
// デバフ操作
// ===================================

/** デバフを付与する */
export function applyDebuff(index: number, type: 'fire' | 'ice' | 'lightning', value: number) {
  if (!enemyAlive[index]) return;
  if (type === 'fire') {
    enemyFireSlipDps[index] = Math.max(enemyFireSlipDps[index], value);
  } else if (type === 'ice') {
    enemyIceSlowRate[index] = value;
  } else if (type === 'lightning') {
    enemyLightningSlowRate[index] = value;
  }
}

/** デバフ値を取得 */
export function getEnemyDebuff(index: number) {
  return {
    fireSlipDps: enemyFireSlipDps[index] || 0,
    iceSlowRate: enemyIceSlowRate[index] || 0,
    lightningSlowRate: enemyLightningSlowRate[index] || 0,
  };
}

/** 氷デバフの値を直接取得（BossKing用） */
export function getEnemyIceSlowRate(index: number): number {
  return enemyIceSlowRate[index] || 0;
}

export function tickDebuffDurations(delta: number) {
  for (let i = 0; i < poolSize; i++) {
    if (!enemyAlive[i]) continue;
    if (enemyFireDuration[i] > 0) {
      enemyFireDuration[i] -= delta;
      if (enemyFireDuration[i] <= 0) enemyFireSlipDps[i] = 0;
    }
    if (enemyIceDuration[i] > 0) {
      enemyIceDuration[i] -= delta;
      if (enemyIceDuration[i] <= 0) enemyIceSlowRate[i] = 0;
    }
    if (enemyLightningDuration[i] > 0) {
      enemyLightningDuration[i] -= delta;
      if (enemyLightningDuration[i] <= 0) enemyLightningSlowRate[i] = 0;
    }
  }
}

// ===================================
// 敵弾発射バス
// ===================================
export interface EnemyProjectileSpawn {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  speed: number;
  damage: number;
  multiplier?: number;
  life?: number;
  sourceType?: number;
}
type EnemyProjectileListener = (spawn: EnemyProjectileSpawn) => void;
const enemyProjectileListeners: EnemyProjectileListener[] = [];
export function onSpawnEnemyProjectile(listener: EnemyProjectileListener) {
  enemyProjectileListeners.push(listener);
  return () => {
    const idx = enemyProjectileListeners.indexOf(listener);
    if (idx > -1) enemyProjectileListeners.splice(idx, 1);
  };
}
export function spawnEnemyProjectile(spawn: EnemyProjectileSpawn) {
  enemyProjectileListeners.forEach(l => l(spawn));
}

// ===================================
// 全敵弾消去バス
// ===================================
type ClearProjectilesListener = () => void;
const clearProjectilesListeners: ClearProjectilesListener[] = [];
export function onClearEnemyProjectiles(listener: ClearProjectilesListener) {
  clearProjectilesListeners.push(listener);
  return () => {
    const idx = clearProjectilesListeners.indexOf(listener);
    if (idx > -1) clearProjectilesListeners.splice(idx, 1);
  };
}
export function clearAllEnemyProjectiles() {
  clearProjectilesListeners.forEach(l => l());
}

// ===================================
// 範囲指定の敵弾消去バス
// ===================================
type ClearRadiusListener = (x: number, z: number, radius: number) => void;
const clearRadiusListeners: ClearRadiusListener[] = [];
export function onClearEnemyProjectilesInRadius(l: ClearRadiusListener) {
  clearRadiusListeners.push(l);
  return () => { const idx = clearRadiusListeners.indexOf(l); if (idx > -1) clearRadiusListeners.splice(idx, 1); };
}
export function clearEnemyProjectilesInRadius(x: number, z: number, radius: number) {
  clearRadiusListeners.forEach(l => l(x, z, radius));
}

// ===================================
// プチメガクラッシュ発動バス
// ===================================
type PmcListener = () => void;
const pmcListeners: PmcListener[] = [];
export function onPetitMegaCrash(l: PmcListener) {
  pmcListeners.push(l);
  return () => { const idx = pmcListeners.indexOf(l); if (idx > -1) pmcListeners.splice(idx, 1); };
}
export function triggerPetitMegaCrash() {
  pmcListeners.forEach(l => l());
}
