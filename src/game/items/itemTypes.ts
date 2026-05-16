import type { SoundType } from '../soundBus';

// ===================================
// ハクスラ系アイテムシステム - 型定義
// ===================================

/** レアリティ */
export const Rarity = {
  Common: 'Common',
  Uncommon: 'Uncommon',
  Magic: 'Magic',
  Rare: 'Rare',
  Epic: 'Epic',
  Legendary: 'Legendary',
  Mythic: 'Mythic',
  Immortal: 'Immortal',
  Celestial: 'Celestial',
} as const;
export type Rarity = typeof Rarity[keyof typeof Rarity];

/** レアリティごとの設定 */
export interface RarityConfig {
  readonly name: string;
  readonly nameJa: string;
  readonly color: string;
  readonly totalAffixCount: number; // 合計付与数(0〜8)
  readonly dropWeight: number;      // 抽選確率の重み
}

/** ステータス種別 */
export const StatType = {
  MeleeAttack: 'MeleeAttack',
  RangedAttack: 'RangedAttack',
  Defense: 'Defense',
  Health: 'Health',
  Speed: 'Speed',
  CritChance: 'CritChance',
  CritDamage: 'CritDamage',
  FireDamage: 'FireDamage',
  IceDamage: 'IceDamage',
  LightningDamage: 'LightningDamage',
  LifeSteal: 'LifeSteal',
  PickupRange: 'PickupRange',
  HpRegen: 'HpRegen',
  MagicPower: 'MagicPower',
  Evasion: 'Evasion',
} as const;
export type StatType = typeof StatType[keyof typeof StatType];

/** ステータス変化 */
export interface StatModifier {
  readonly stat: StatType;
  readonly minValue: number;
  readonly maxValue: number;
  readonly isPercentage: boolean;
}

/** 付加効果（接頭辞/接尾辞） */
export type AffixType = 'prefix' | 'suffix';

export interface AffixDefinition {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly type: AffixType;
  readonly modifiers: readonly StatModifier[];
  readonly requiredItemLevel: number;
}

/** 装備スロット */
export const EquipSlot = {
  MeleeWeapon: 'MeleeWeapon',
  RangedWeapon: 'RangedWeapon',
  Shield: 'Shield',
  Helmet: 'Helmet',
  Armor: 'Armor',
  Boots: 'Boots',
  Ring: 'Ring',
  Amulet: 'Amulet',
} as const;
export type EquipSlot = typeof EquipSlot[keyof typeof EquipSlot];

/** ベースアイテム定義 */
export interface BaseItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly slot: EquipSlot;
  readonly attackType: 'melee' | 'ranged' | 'none'; // 追加
  readonly baseStats: readonly {
    readonly stat: StatType;
    readonly value: number;
  }[];
  // 遠距離攻撃用パラメータ
  readonly projectileSpeed?: number;
  readonly projectileCount?: number;
  readonly spreadAngle?: number;
  readonly pierceCount?: number;
  readonly lifespan?: number;
  // 近接攻撃用パラメータ
  readonly meleeWidth?: number;
  readonly meleeRange?: number;
  readonly attackInterval?: number;
  readonly attackStyle?: 'vertical_slash' | 'slash' | 'slam' | 'punch' | 'sweep' | 'fireball' | 'grenade' | 'boomerang' | 'orbit';
  readonly pierceDecay?: number; // 貫通減衰率
  readonly visualScale?: number; // エフェクトや弾の描画サイズ倍率
  readonly isHoming?: boolean;   // 敵への誘導性能を持つかどうか
  readonly homingPower?: number; // 誘導の強さ(旋回速度)
  readonly shootSound?: SoundType;  // 武器固有の発射音
  readonly hitSound?: SoundType;    // 武器固有のヒット音
  readonly moveSpeedMultiplier?: number; // 移動速度係数 (1.00が基準、下限0.70等)
}

/** 生成された付加効果（実際の値が確定済み） */
export interface RolledAffix {
  readonly definition: AffixDefinition;
  readonly rolledValues: readonly {
    readonly stat: StatType;
    readonly value: number;
    readonly isPercentage: boolean;
  }[];
}

/** 最終的に生成されたアイテム（インスタンス） */
export interface GeneratedItem {
  readonly uid: string;
  readonly baseItem: BaseItemDefinition;
  readonly rarity: Rarity;
  readonly prefixes: readonly RolledAffix[];
  readonly suffixes: readonly RolledAffix[];
  readonly itemLevel: number;
}
