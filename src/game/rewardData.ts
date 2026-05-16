import type { PermanentUpgrades } from './playerStats';

export interface Reward {
  id: string;
  name: string;
  desc: string;
  type: keyof PermanentUpgrades;
  value: number;
  maxLevel?: number;
}

export const REWARDS: Reward[] = [
  // パッシブ系
  { id: 'hpUp', name: '最大HPアップ', desc: '最大HPの基本値が25アップします', type: 'maxHp', value: 25 },
  { id: 'spUp', name: '最大SPアップ', desc: '最大SPの基本値が25アップします', type: 'maxSp', value: 25, maxLevel: 4 },
  { id: 'atkMeleeUp', name: '近接攻撃力アップ', desc: '近接攻撃力の基本値が[プレイヤーLv×0.2]アップします\n※プレイヤーLvに応じて変動', type: 'meleeAttackPower', value: 0.2 },
  { id: 'meleeSpdUp', name: '近接攻撃回数アップ', desc: '近接攻撃回数が25%アップします', type: 'meleeAttackInterval', value: 1, maxLevel: 4 },
  { id: 'meleeRangeUp', name: '近接攻撃範囲アップ', desc: '近接攻撃範囲が25%アップします', type: 'meleeAttackRange', value: 0.25, maxLevel: 4 },
  { id: 'atkRangedUp', name: '遠隔攻撃力アップ', desc: '遠隔攻撃力の基本値が[プレイヤーLv×0.2]アップします\n※プレイヤーLvに応じて変動', type: 'rangedAttackPower', value: 0.2 },
  { id: 'rangedSpdUp', name: '遠隔攻撃回数アップ', desc: '遠隔攻撃回数が25%アップします', type: 'rangedAttackInterval', value: 1, maxLevel: 4 },
  { id: 'rangedPierceUp', name: '遠隔攻撃ヒット数アップ', desc: '射撃武器の貫通ヒット数が25%アップします\n投擲武器の速度が25%アップします', type: 'rangedPiercePower', value: 1, maxLevel: 4 },
  { id: 'magicAtkUp', name: '魔力アップ', desc: '魔力の基本値が[プレイヤーLv×0.2]アップします\n※プレイヤーLvに応じて変動', type: 'magicPower', value: 0.2 },
  { id: 'critUp', name: '会心率アップ', desc: '会心率の基本値が5%アップします', type: 'critChance', value: 5 },
  { id: 'defUp', name: '防御力アップ', desc: '防御力の基本値が[プレイヤーLv×0.2]アップします\n※プレイヤーLvに応じて変動', type: 'defense', value: 0.2 },
  { id: 'evaUp', name: 'パリィ発生率アップ', desc: 'パリィ発生率の基本値が2.5%アップします', type: 'evasion', value: 2.5, maxLevel: 4 },
  { id: 'hpRegenUp', name: '自然回復速度強化', desc: 'HP自然回復速度の基本値が0.05/secアップします', type: 'hpRegen', value: 0.05, maxLevel: 4 },
  { id: 'spdUp', name: '移動速度アップ', desc: '移動速度の基本値が10アップします', type: 'moveSpeed', value: 10, maxLevel: 4 },
  { id: 'pickupUp', name: '取得範囲アップ', desc: '取得範囲の基本値が5アップします', type: 'pickupRange', value: 5, maxLevel: 4 },

  // アクティブ（魔法）系
  { id: 'spellLightning', name: 'ライトニングボルト', desc: '落雷の発動速度が25%アップします', type: 'lightningDamage', value: 1, maxLevel: 5 },
  { id: 'spellFlame', name: 'フレイムバースト', desc: '火球の威力が25%アップします', type: 'fireDamage', value: 1, maxLevel: 5 },
  { id: 'spellFrost', name: 'フロストノヴァ', desc: '氷結範囲が12.5%アップします', type: 'iceDamage', value: 1, maxLevel: 5 },

  // アクティブ（エンチャント）系
  { id: 'enchantFire', name: '炎属性エンチャント', desc: '武器に炎属性を付与します。物理ダメージは減少しますが、攻撃力に応じた継続ダメージを与えます。', type: 'enchantFire' as any, value: 1, maxLevel: 5 },
  { id: 'enchantIce', name: '氷属性エンチャント', desc: '武器に氷属性を付与。\n物理ダメージが減衰する代わりに、敵に移動速度低下を付与', type: 'enchantIce' as any, value: 1, maxLevel: 5 },
  { id: 'enchantLightning', name: '雷属性エンチャント', desc: '武器に雷属性を付与します。物理ダメージは減少しますが、敵の攻撃速度を低下させる効果を与えます。', type: 'enchantLightning' as any, value: 1, maxLevel: 5 },
];

/** ランダムにN個の異なる報酬を抽選する (魔法1つ、パッシブ1つ以上を保証、上限レベル考慮) */
export function getRandomRewards(count: number, available: Reward[]): Reward[] {
  const activeTypes = ['lightningDamage', 'fireDamage', 'iceDamage', 'enchantFire', 'enchantIce', 'enchantLightning'];
  const actives = available.filter(r => activeTypes.includes(r.type as string));
  const passives = available.filter(r => !activeTypes.includes(r.type as string));

  const result: Reward[] = [];

  // アクティブから1つ選ぶ (可能なら)
  if (actives.length > 0) {
    const randomActive = actives[Math.floor(Math.random() * actives.length)];
    result.push(randomActive);
  }

  // 残りをパッシブから補充（重複なし）
  const shuffledPassives = [...passives].sort(() => 0.5 - Math.random());
  for (const p of shuffledPassives) {
    if (result.length >= count) break;
    result.push(p);
  }

  // 数が足りない場合は全体から補充（重複なし）
  if (result.length < count) {
    const remain = available.filter(r => !result.some(res => res.id === r.id)).sort(() => 0.5 - Math.random());
    for (const r of remain) {
      if (result.length >= count) break;
      result.push(r);
    }
  }

  // 表示順をシャッフル
  return result.sort(() => 0.5 - Math.random());
}
