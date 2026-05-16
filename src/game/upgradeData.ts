export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  currency: 'energy' | 'hyper';
  baseCost: number; // energyの場合は 100000
}

export const UPGRADE_ITEMS: UpgradeDef[] = [
  { id: 'up_hp', name: '最大HP', desc: '基礎値+10', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_sp', name: '最大SP', desc: '基礎値+10', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_melee_atk', name: '近接攻撃力', desc: '基礎値+1', maxLevel: 10, currency: 'energy', baseCost: 100000 },
  { id: 'up_melee_spd', name: '近接攻撃回数', desc: '+10%', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_ranged_atk', name: '遠隔攻撃力', desc: '基礎値+1', maxLevel: 10, currency: 'energy', baseCost: 100000 },
  { id: 'up_ranged_spd', name: '遠隔攻撃回数', desc: '+10%', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_magic', name: '魔力', desc: '基礎値+1', maxLevel: 10, currency: 'energy', baseCost: 100000 },
  { id: 'up_crit', name: '会心率', desc: '基礎値+2%', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_def', name: '防御力', desc: '基礎値+1', maxLevel: 10, currency: 'energy', baseCost: 100000 },
  { id: 'up_eva', name: '回避率', desc: '基礎値+1%', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_speed', name: '移動速度', desc: '基礎値+4', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_pickup', name: '取得範囲', desc: '基礎値+2', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_regen', name: '自然回復速度', desc: '基礎値+0.02/sec', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_invincible', name: '無敵時間', desc: '被ダメージ後・メガクラッシュ後の無敵時間10%延長', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_knockback', name: '吹き飛ばし距離', desc: 'パリィ成功・メガクラッシュ時のノックバック距離10%アップ', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_ob', name: 'Obscurity (OB) 上限', desc: '最大値+10%', maxLevel: 10, currency: 'energy', baseCost: 40000 },
  { id: 'up_ar', name: 'Adrenaline Rush (AR) 時間', desc: '持続時間+10%', maxLevel: 10, currency: 'energy', baseCost: 40000 },
  { id: 'up_heal', name: 'ヒール', desc: '[HEAL_BTN]で自然回復速度100秒分のHPを即時回復(回数+1)', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_magnet', name: 'マグネット', desc: '[MAGNET_BTN]で全アイテム吸引(回数+1)', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_reroll', name: 'リロール', desc: 'アップグレードの再抽選(回数+1)', maxLevel: 10, currency: 'energy', baseCost: 100000 },
  { id: 'up_vanish', name: 'バニッシュ', desc: '不要なアップグレードを除外して再抽選(回数+1)', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_exp_req', name: '必要経験値減少', desc: 'レベルアップに必要な経験値が10%減少', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_reward_req', name: '必要キル数減少', desc: 'リワード獲得に必要なキル数が10%減少', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_drop_rate', name: 'アイテムドロップ', desc: 'アイテムドロップ確率10%アップ&ドロップ数10%増加(ボス)', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_overclock', name: 'オーバーロード', desc: '敵の出現数増加(毎秒+1) ※ボスは除く', maxLevel: 5, currency: 'energy', baseCost: 100000 },
  { id: 'up_enc_fire', name: '初期炎エンチャント', desc: 'ゲーム開始時から炎属性エンチャントを所持(Lv+1)', maxLevel: 2, currency: 'hyper', baseCost: 1 },
  { id: 'up_enc_ice', name: '初期氷エンチャント', desc: 'ゲーム開始時から氷属性エンチャントを所持(Lv+1)', maxLevel: 2, currency: 'hyper', baseCost: 1 },
  { id: 'up_enc_lightning', name: '初期雷エンチャント', desc: 'ゲーム開始時から雷属性エンチャントを所持(Lv+1)', maxLevel: 2, currency: 'hyper', baseCost: 1 },
  { id: 'up_resonance', name: 'レゾナンス', desc: '貫通力を維持し、特定の武器では貫通するほど威力を増幅させる', maxLevel: 2, currency: 'hyper', baseCost: 1 },
  { id: 'up_resilience', name: 'レジリエンス', desc: 'HPが0になったとき最大HP基礎値50を消費して復活(回数+1)', maxLevel: 2, currency: 'hyper', baseCost: 1 },
  { id: 'up_overdrive', name: 'オーバークロック', desc: 'チェイン時の攻撃速度＆敵出現数の上限+5%', maxLevel: 10, currency: 'hyper', baseCost: 1 },
];

export const getUpgradeCostInfo = (id: string, currentLevel: number): { cost: number; currency: 'energy' | 'hyper' } => {
  const nextLv = currentLevel + 1;

  if (id === 'up_hp' || id === 'up_sp' || id === 'up_melee_spd' || id === 'up_ranged_spd' || id === 'up_crit' || id === 'up_eva' || id === 'up_regen' || id === 'up_invincible' || id === 'up_heal' || id === 'up_vanish') {
    if (nextLv === 1) return { cost: 40000, currency: 'energy' };
    return { cost: 200000 + (nextLv - 2) * 100000, currency: 'energy' };
  }

  if (id === 'up_melee_atk' || id === 'up_ranged_atk' || id === 'up_magic') {
    if (nextLv === 1) return { cost: 20000, currency: 'energy' };
    if (nextLv === 2) return { cost: 60000, currency: 'energy' };
    if (nextLv === 3) return { cost: 120000, currency: 'energy' };
    return { cost: 120000 + (nextLv - 3) * 40000, currency: 'energy' };
  }

  if (id === 'up_def') {
    if (nextLv === 1) return { cost: 40000, currency: 'energy' };
    if (nextLv === 2) return { cost: 120000, currency: 'energy' };
    if (nextLv === 3) return { cost: 240000, currency: 'energy' };
    return { cost: 240000 + (nextLv - 3) * 80000, currency: 'energy' };
  }

  if (id === 'up_speed' || id === 'up_pickup' || id === 'up_knockback' || id === 'up_magnet') {
    if (nextLv === 1) return { cost: 20000, currency: 'energy' };
    return { cost: 100000 + (nextLv - 2) * 50000, currency: 'energy' };
  }

  if (id === 'up_reroll') {
    if (nextLv === 1) return { cost: 20000, currency: 'energy' };
    if (nextLv === 2) return { cost: 60000, currency: 'energy' };
    return { cost: 120000 + (nextLv - 3) * 40000, currency: 'energy' };
  }

  if (id === 'up_exp_req' || id === 'up_reward_req' || id === 'up_drop_rate') {
    return { cost: nextLv * 100000, currency: 'energy' };
  }

  if (id === 'up_overclock') {
    if (nextLv === 1) return { cost: 444, currency: 'energy' };
    if (nextLv === 2) return { cost: 4444, currency: 'energy' };
    if (nextLv === 3) return { cost: 44444, currency: 'energy' };
    if (nextLv === 4) return { cost: 444444, currency: 'energy' };
    return { cost: 4, currency: 'hyper' };
  }

  if (id === 'up_enc_fire' || id === 'up_enc_ice' || id === 'up_enc_lightning') {
    if (nextLv === 1) return { cost: 1, currency: 'hyper' };
    return { cost: 3, currency: 'hyper' };
  }

  if (id === 'up_resonance') {
    if (nextLv === 1) return { cost: 2, currency: 'hyper' };
    return { cost: 6, currency: 'hyper' };
  }

  if (id === 'up_resilience') {
    if (nextLv === 1) return { cost: 2, currency: 'hyper' };
    return { cost: 5, currency: 'hyper' };
  }

  if (id === 'up_ob' || id === 'up_ar') {
    if (nextLv === 1) return { cost: 30000, currency: 'energy' };
    if (nextLv === 2) return { cost: 90000, currency: 'energy' };
    if (nextLv === 3) return { cost: 180000, currency: 'energy' };
    return { cost: 180000 + (nextLv - 3) * 60000, currency: 'energy' };
  }

  if (id === 'up_overdrive') {
    return { cost: nextLv, currency: 'hyper' };
  }

  return { cost: 999999, currency: 'energy' }; // Fallback
};
