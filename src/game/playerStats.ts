import type { GeneratedItem } from './items/itemTypes';
import { EquipSlot, StatType } from './items/itemTypes';
import { getComboBonus } from './comboBus';
import { playSound, type SoundType } from './soundBus';

// ===================================
// 型定義
// ===================================

/** プレイヤーの最終ステータス */
export interface PlayerStats {
  meleeAttackPower: number;
  rangedAttackPower: number;
  defense: number;
  health: number;
  speed: number;
  meleeAttackInterval: number;  // 秒（近接）
  rangedAttackInterval: number; // 秒（遠距離）
  // 近接武器固有パラメータ
  meleeWidth: number;
  meleeRange: number;
  meleeAttackStyle: 'slash' | 'slam' | 'punch' | 'sweep' | 'vertical_slash' | 'fireball' | 'grenade' | 'boomerang' | 'orbit';
  moveSpeed: number;        // 実際の移動速度
  critChance: number;       // %
  critDamage: number;       // %
  fireDamage: number;
  iceDamage: number;
  lightningDamage: number;
  lifeSteal: number;        // %
  pickupRange: number;      // 取得半径
  hpRegen: number;          // HP/秒
  // 遠距離武器固有パラメータ（現在の装備から取得）
  projectileSpeed: number;
  projectileCount: number;
  spreadAngle: number;
  piercePower: number;
  projectileLife: number;
  magicPower: number;
  maxSp: number;
  evasion: number;       // 回避率 (%)
  meleeAttackRange: number; // 近接攻撃範囲倍率
  rangedPiercePower: number; // 遠隔攻撃追加貫通力
  meleePierceDecay: number; // 近接貫通減衰
  rangedAttackStyle?: string;
  rangedPierceDecay: number;
  visualScale: number;
  isHoming: boolean;
  homingPower: number; // 旋回性能
  activeEnchant?: 'none' | 'fire' | 'ice' | 'lightning';
  resonance: number; // 貫通時ボーナス（旧ミラージュ）
  // 武器固有サウンド
  meleeShootSound: SoundType;
  meleeHitSound: SoundType;
  rangedShootSound: SoundType;
  rangedHitSound: SoundType;
}

/** 装備スロットの状態 */
export interface EquipmentState {
  [EquipSlot.MeleeWeapon]: GeneratedItem | null;
  [EquipSlot.RangedWeapon]: GeneratedItem | null;
  [EquipSlot.Shield]: GeneratedItem | null;
  [EquipSlot.Helmet]: GeneratedItem | null;
  [EquipSlot.Armor]: GeneratedItem | null;
  [EquipSlot.Boots]: GeneratedItem | null;
  [EquipSlot.Ring]: GeneratedItem | null;
  [EquipSlot.Amulet]: GeneratedItem | null;
}

/** 恒久的なアップグレード（報酬）の状態 */
export interface PermanentUpgrades {
  maxHp: number;
  maxSp: number;
  meleeAttackPower: number;
  meleeAttackInterval: number;
  meleeAttackRange: number;
  rangedAttackPower: number;
  rangedAttackInterval: number;
  rangedPiercePower: number;
  magicPower: number;
  critChance: number;
  defense: number;
  hpRegen: number;
  moveSpeed: number;
  pickupRange: number;
  evasion: number;
  fireDamage: number;
  iceDamage: number;
  lightningDamage: number;
  resonance: number;
}

export const INITIAL_PERMANENT_UPGRADES: PermanentUpgrades = {
  maxHp: 0,
  maxSp: 0,
  meleeAttackPower: 0,
  meleeAttackInterval: 0, // レベル（回数）として使用
  meleeAttackRange: 0,
  rangedAttackPower: 0,
  rangedAttackInterval: 0, // レベル（回数）として使用
  rangedPiercePower: 0,
  magicPower: 0,
  critChance: 0,
  defense: 0,
  hpRegen: 0,
  moveSpeed: 0,
  pickupRange: 0,
  evasion: 0,
  fireDamage: 0,
  iceDamage: 0,
  lightningDamage: 0,
  resonance: 0,
};

// ===================================
// 基本ステータス（装備なしの初期値）
// ===================================
export const BASE_STATS: PlayerStats = {
  meleeAttackPower: 5,
  rangedAttackPower: 5,
  defense: 5,
  health: 100,
  speed: 0,
  meleeAttackInterval: 0.5,
  rangedAttackInterval: 1.0,
  meleeWidth: 1.0,
  meleeRange: 1.0,
  meleeAttackStyle: 'punch',
  moveSpeed: 40.0,
  critChance: 20,
  critDamage: 200,
  fireDamage: 0,
  iceDamage: 0,
  lightningDamage: 0,
  lifeSteal: 0,
  pickupRange: 20.0,
  hpRegen: 0.2,
  evasion: 10,
  projectileSpeed: 15,
  projectileCount: 1,
  spreadAngle: 0,
  piercePower: 1,
  projectileLife: 1.5,
  magicPower: 5,
  maxSp: 100,
  meleeAttackRange: 1.0,
  rangedPiercePower: 0,
  meleePierceDecay: 0.1,
  rangedPierceDecay: 0,
  visualScale: 1.0,
  isHoming: false,
  homingPower: 3.0,
  resonance: 0,
  meleeShootSound: 'swing_unarmed',
  meleeHitSound: 'hit_unarmed',
  rangedShootSound: 'shoot',
  rangedHitSound: 'hit',
};

// メガクラッシュによるHP最大値減少ペナルティ（現在のラン中のみ有効）
export let megaCrushHpPenalty = 0;

// OB/AR アップグレードレベルのキャッシュ
let obUpgradeLevel = 0;
let arUpgradeLevel = 0;

/** OBの現在の最大値を取得 (基本100 + 1Lvにつき10) */
export function getMaxOb(): number {
  return 100 * (1.0 + 0.1 * obUpgradeLevel);
}

/** ARの現在の最大持続時間を取得 (基本5.0s + 1Lvにつき0.5s) */
export function getMaxArDuration(): number {
  return 5.0 * (1.0 + 0.1 * arUpgradeLevel);
}

/** ペナルティをリセット（再挑戦時など） */
export function resetMegaCrushPenalty() {
  megaCrushHpPenalty = 0;
}

/** ペナルティを加算 */
export function addMegaCrushPenalty(amount: number) {
  megaCrushHpPenalty += amount;
}

// ===================================
// 空の装備状態
// ===================================
export const EMPTY_EQUIPMENT: EquipmentState = {
  [EquipSlot.MeleeWeapon]: null,
  [EquipSlot.RangedWeapon]: null,
  [EquipSlot.Shield]: null,
  [EquipSlot.Helmet]: null,
  [EquipSlot.Armor]: null,
  [EquipSlot.Boots]: null,
  [EquipSlot.Ring]: null,
  [EquipSlot.Amulet]: null,
};

// ===================================
// ステータス計算
// ===================================

/** StatType → PlayerStats のキーへのマッピング */
const STAT_KEY_MAP: Record<StatType, keyof PlayerStats> = {
  [StatType.MeleeAttack]: 'meleeAttackPower',
  [StatType.RangedAttack]: 'rangedAttackPower',
  [StatType.Defense]: 'defense',
  [StatType.Health]: 'health',
  [StatType.Speed]: 'speed',
  [StatType.CritChance]: 'critChance',
  [StatType.CritDamage]: 'critDamage',
  [StatType.FireDamage]: 'fireDamage',
  [StatType.IceDamage]: 'iceDamage',
  [StatType.LightningDamage]: 'lightningDamage',
  [StatType.LifeSteal]: 'lifeSteal',
  [StatType.PickupRange]: 'pickupRange',
  [StatType.HpRegen]: 'hpRegen',
  [StatType.MagicPower]: 'magicPower',
  [StatType.Evasion]: 'evasion',
};

/**
 * 装備品から最終ステータスを計算する (乗算方式)
 * 最終ステータス = (基礎値 + リワード加算 + 装備固定値) * (1 + 装備修飾語%合計 / 100)
 */
export function computeStats(
  equipment: EquipmentState,
  upgrades: PermanentUpgrades = INITIAL_PERMANENT_UPGRADES
): PlayerStats {
  // 1. フラット加算値の集計 (基礎値 + リワード)
  // 累積計算によるグローバル定数の汚染を防ぐため、JSONディープコピーで完全に独立したオブジェクトを生成する
  const flatStats: PlayerStats = JSON.parse(JSON.stringify(BASE_STATS));
  
  // レベルに応じてスケールするリワードの適用
  flatStats.health += upgrades.maxHp;
  // メガクラッシュのペナルティを差し引く（下限は1。10未満にもしっかり下がるように修正）
  flatStats.health = Math.max(1, flatStats.health - megaCrushHpPenalty);

  // OB/AR アップグレードレベルのキャッシュ更新
  obUpgradeLevel = (upgrades as any).up_ob || 0;
  arUpgradeLevel = (upgrades as any).up_ar || 0;
  
  flatStats.maxSp += upgrades.maxSp;
  flatStats.meleeAttackPower += upgrades.meleeAttackPower;
  flatStats.rangedAttackPower += upgrades.rangedAttackPower;
  flatStats.defense += upgrades.defense;
  flatStats.magicPower += upgrades.magicPower;
  flatStats.evasion += upgrades.evasion;

  // 定数加算リワード
  flatStats.critChance += upgrades.critChance;
  flatStats.hpRegen += upgrades.hpRegen;
  // flatStats.speed += upgrades.moveSpeed; // 二重計算を避けるため削除
  flatStats.pickupRange += upgrades.pickupRange;
  
  flatStats.fireDamage += upgrades.fireDamage;
  flatStats.iceDamage += upgrades.iceDamage;
  flatStats.lightningDamage += upgrades.lightningDamage;
  flatStats.resonance += upgrades.resonance;
  
  flatStats.meleeAttackRange += upgrades.meleeAttackRange;
  // rangedPiercePower はレベル数。後続の武器計算で倍率として使用。

  // 2. 乗算補正（%）の初期化 (100% = 1.0)
  // 固定倍率リワード (Interval系: 1レベルにつき25%短縮 = 0.75倍)
  const meleeSpeedMod = 1.0 + (upgrades.meleeAttackInterval * 0.25);
  const rangedSpeedMod = 1.0 + (upgrades.rangedAttackInterval * 0.25);

  const multipliers: Record<string, number> = {};
  Object.values(StatType).forEach(type => {
    multipliers[type] = 1.0;
  });

  // 3. 装備品のスキャン
  for (const slotKey of Object.values(EquipSlot)) {
    const item = equipment[slotKey];
    if (!item) continue;

    // 装備の「固定値（BaseStats）」を加算 (Lv1基礎値 × アイテムLv を計算)
    for (const bs of item.baseItem.baseStats) {
      const scaledValue = bs.value * item.itemLevel;
      const key = STAT_KEY_MAP[bs.stat];
      if (key) (flatStats[key] as number) += scaledValue;
    }

    // 修飾語（Affix）を集計
    const allAffixes = [...item.prefixes, ...item.suffixes];
    for (const affix of allAffixes) {
      for (const rv of affix.rolledValues) {
        // すべてのステータスについて割合加算（例: 25なら25% = 0.25）として倍率を集計
        multipliers[rv.stat] += (rv.value / 100);
      }
    }
  }

  // --- Obscurity（OB）システムの火力バフ適用（ガードバフ加算枠） ---
  if (shifukuBuffAmount > 0) {
    const obAffixBonus = shifukuBuffAmount * 0.005; // 100で0.5(+50%)
    multipliers[StatType.MeleeAttack] += obAffixBonus;
    multipliers[StatType.RangedAttack] += obAffixBonus;
  }

  // 4. 最終計算 (加算値 * 倍率) と丸め処理
  const finalStats: PlayerStats = { ...flatStats };
  
  // 各主要ステータスに倍率を適用
  Object.keys(STAT_KEY_MAP).forEach((statType) => {
    const type = statType as StatType;
    const mult = multipliers[type];
    if (mult === 1.0) return;

    const key = STAT_KEY_MAP[type];
    // speed は moveSpeed 計算時にスケール調整と乗算を個別に行うため、ここではスキップする
    if (key && key !== 'speed') (finalStats[key] as number) *= mult;
  });

  // 数値を読みやすく丸める (0.1単位での保持に変更)
  finalStats.health = Number(finalStats.health.toFixed(1));
  finalStats.defense = Number(finalStats.defense.toFixed(1));
  finalStats.speed = Number(finalStats.speed.toFixed(1));
  finalStats.critChance = Number(finalStats.critChance.toFixed(1));
  finalStats.hpRegen = Number(finalStats.hpRegen.toFixed(2));
  finalStats.pickupRange = Number(finalStats.pickupRange.toFixed(1));
  finalStats.maxSp = Number(finalStats.maxSp.toFixed(1));
  finalStats.evasion = Number(finalStats.evasion.toFixed(1));
  
  // 攻撃力も0.1単位で保持 (念のため)
  finalStats.meleeAttackPower = Number(finalStats.meleeAttackPower.toFixed(1));
  finalStats.rangedAttackPower = Number(finalStats.rangedAttackPower.toFixed(1));
  finalStats.magicPower = Number(finalStats.magicPower.toFixed(1));

  // 5. 派生値の計算（新ステータス基準）
  // 武器による移動速度係数（重さペナルティ等）を計算（乗算）
  let weaponMoveSpeedMult = 1.0;
  const meleeWeapon = equipment[EquipSlot.MeleeWeapon];
  if (meleeWeapon) {
    weaponMoveSpeedMult *= meleeWeapon.baseItem.moveSpeedMultiplier ?? 1.0;
  }
  const rangedWeapon = equipment[EquipSlot.RangedWeapon];
  if (rangedWeapon) {
    weaponMoveSpeedMult *= rangedWeapon.baseItem.moveSpeedMultiplier ?? 1.0;
  }

  // 基本移動速度40.0に 加算スピード(finalStats.speed) と アップグレード分を足し、乗算補正(multipliers)と武器係数を掛ける
  finalStats.moveSpeed = (40.0 + finalStats.speed + (upgrades.moveSpeed || 0)) * (multipliers[StatType.Speed] || 1.0) * weaponMoveSpeedMult;

  if (equipment[EquipSlot.MeleeWeapon]) {
    const item = equipment[EquipSlot.MeleeWeapon]!;
    const baseInterval = item.baseItem.attackInterval ?? 1.0;
    // 攻撃力による隠し短縮補正を削除し、純粋にリワードによる速度倍率のみで計算
    finalStats.meleeAttackInterval = Math.max(0.05, baseInterval / meleeSpeedMod);
    finalStats.meleeWidth = (item.baseItem.meleeWidth ?? 4.0) * finalStats.meleeAttackRange;
    finalStats.meleeRange = (item.baseItem.meleeRange ?? 0.25) * finalStats.meleeAttackRange;
    finalStats.meleeAttackStyle = item.baseItem.attackStyle ?? 'slash';
    finalStats.meleePierceDecay = item.baseItem.pierceDecay ?? 0.1;
    finalStats.visualScale = item.baseItem.visualScale ?? 1.0;
    finalStats.isHoming = item.baseItem.isHoming ?? false;
    finalStats.meleeShootSound = item.baseItem.shootSound ?? 'swing';
    finalStats.meleeHitSound = item.baseItem.hitSound ?? 'hit';
  } else {
    // 近接武器未装備（素手）
    finalStats.meleeShootSound = 'swing_unarmed';
    finalStats.meleeHitSound = 'hit_unarmed';
  }

  if (equipment[EquipSlot.RangedWeapon]) {
    const item = equipment[EquipSlot.RangedWeapon]!;
    const baseRangedInterval = item.baseItem.attackInterval ?? 0.8;
    // 攻撃力による隠し短縮補正を削除し、純粋にリワードによる速度倍率のみで計算
    finalStats.rangedAttackInterval = Math.max(0.1, baseRangedInterval / rangedSpeedMod);
    finalStats.projectileSpeed = item.baseItem.projectileSpeed ?? 15;
    finalStats.projectileCount = item.baseItem.projectileCount ?? 1;
    finalStats.spreadAngle = item.baseItem.spreadAngle ?? 0;
    const rangedWeapon = equipment[EquipSlot.RangedWeapon];
    const basePierce = (rangedWeapon && rangedWeapon.baseItem.pierceCount) ? rangedWeapon.baseItem.pierceCount : 1;
    finalStats.piercePower = basePierce * (1 + 0.25 * (upgrades.rangedPiercePower || 0));
    finalStats.projectileLife = item.baseItem.lifespan ?? 1.5;
    
    // 【貫通シナジーボーナス】特定の武器は貫通数アップ（rangedPiercePower）に応じて弾速や回転速度が上昇する
    const synergySpeedMult = 1.0 + 0.25 * (upgrades.rangedPiercePower || 0);
    const wId = item.baseItem.id;
    if (['grenade_launcher', 'boomerang', 'chakram', 'orb'].includes(wId)) {
      finalStats.projectileSpeed *= synergySpeedMult;
      // グレネードとブーメランは飛距離を変えないために、速度が上がった分だけ寿命を短くする
      if (wId === 'grenade_launcher' || wId === 'boomerang') {
        finalStats.projectileLife /= synergySpeedMult;
      }
    }

    finalStats.rangedAttackStyle = item.baseItem.attackStyle;
    finalStats.rangedPierceDecay = item.baseItem.pierceDecay ?? 0;
    // 遠距離武器がある場合、プロパティがあれば上書き（近接より優先または併用）
    if (item.baseItem.visualScale !== undefined) finalStats.visualScale = item.baseItem.visualScale;
    if (item.baseItem.isHoming !== undefined) finalStats.isHoming = item.baseItem.isHoming;
    if (item.baseItem.homingPower !== undefined) finalStats.homingPower = item.baseItem.homingPower;
    finalStats.rangedShootSound = item.baseItem.shootSound ?? 'shoot';
    finalStats.rangedHitSound = item.baseItem.hitSound ?? 'hit';
  } else {
    // 遠隔武器を装備していない場合は弾数を強制的に0にする
    finalStats.projectileCount = 0;
  }

  // --- コンボボーナスの適用 ---
  const comboBonus = getComboBonus(); // 0.0 ~ 0.5
  finalStats.meleeAttackInterval /= (1.0 + comboBonus);
  finalStats.rangedAttackInterval /= (1.0 + comboBonus);

  // --- 回避バフ（I-frame dodge）の適用 ---
  // 【重要】ここで加算するとリワード取得時に永続化してしまうため、
  // 実際のダメージ計算時（collisionBus / Projectiles）に動的に加算するように変更します。

  return finalStats;
}

// ===================================
// プレイヤー属性やられ（デバフ）管理
// ===================================

/** 各属性やられの残り時間（秒）。0 = デバフなし */
export const playerDebuffs = { fire: 0, ice: 0, lightning: 0 };

export let dodgeBuffTimer = 0;

// ===================================
// Obscurity（OB）システム管理
// ===================================
export let shifukuBuffAmount = 0; // 最大100
let statsUpdateCallback: (() => void) | null = null;

/** ステータス更新時のコールバックを登録 */
export function registerStatsUpdateCallback(cb: () => void) {
  statsUpdateCallback = cb;
}

function triggerStatsUpdate() {
  if (statsUpdateCallback) statsUpdateCallback();
}
export function addShifukuBuff(amount: number) {
  const prev = shifukuBuffAmount;
  const maxOb = getMaxOb();
  shifukuBuffAmount = Math.min(maxOb, shifukuBuffAmount + amount);
  if (shifukuBuffAmount !== prev) triggerStatsUpdate();
}
export function resetShifukuBuff() {
  if (shifukuBuffAmount !== 0) {
    shifukuBuffAmount = 0;
    triggerStatsUpdate();
  }
}
export function updateShifukuBuff(delta: number, isGuarding: boolean) {
  if (!isGuarding && shifukuBuffAmount > 0) {
    shifukuBuffAmount = Math.max(0, shifukuBuffAmount - (20.0 * delta)); // 0.1秒で1%、1秒で20減衰
    triggerStatsUpdate();
  }
}

export function triggerDodgeBuff(seconds?: number) {
  const max = getMaxArDuration();
  if (seconds === undefined) {
    dodgeBuffTimer = max;
  } else {
    dodgeBuffTimer = Math.min(max, dodgeBuffTimer + seconds);
  }
  playSound('buff');
}

export function cancelDodgeBuff() {
  dodgeBuffTimer = 0;
}

/** 属性やられを付与する（同属性は8秒にリセット、別属性は独立して重複） */
export function applyPlayerDebuff(type: 'fire' | 'ice' | 'lightning') {
  playerDebuffs[type] = 8.0;
}

/** 毎フレーム呼び出し: デバフタイマーを減算 */
export function updatePlayerDebuffs(delta: number, isDashing: boolean = false) {
  if (playerDebuffs.fire > 0) playerDebuffs.fire = Math.max(0, playerDebuffs.fire - delta);
  if (playerDebuffs.ice > 0) playerDebuffs.ice = Math.max(0, playerDebuffs.ice - delta);
  if (playerDebuffs.lightning > 0) playerDebuffs.lightning = Math.max(0, playerDebuffs.lightning - delta);
  
  // 回避中はARゲージの減少を停止
  if (!isDashing && dodgeBuffTimer > 0) {
    dodgeBuffTimer = Math.max(0, dodgeBuffTimer - delta);
  }
}

/** 
 * ゲームリスタート時にプレイヤーの全動的ステータスをリセット 
 */
export function resetAllPlayerStats() {
  shifukuBuffAmount = 0;
  dodgeBuffTimer = 0;
  playerDebuffs.fire = 0;
  playerDebuffs.ice = 0;
  playerDebuffs.lightning = 0;
  triggerStatsUpdate();
}

/** ゲーム再開時に全デバフをリセット（旧互換用） */
export function resetPlayerDebuffs() {
  resetAllPlayerStats();
}

// ===================================
// グローバル参照
// ===================================
export const playerStatsRef: { current: PlayerStats } = {
  current: { ...BASE_STATS },
};

export const playerPosRef = { x: 0, y: 0, z: 0 };
