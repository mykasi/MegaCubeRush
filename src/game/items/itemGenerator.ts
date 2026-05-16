import type {
  GeneratedItem,
  RolledAffix,
  AffixDefinition,
  BaseItemDefinition,
} from './itemTypes';
import { Rarity, StatType, EquipSlot } from './itemTypes';
import { RARITY_CONFIG, BASE_ITEMS, PREFIX_POOL, SUFFIX_POOL } from './itemData';

// ===================================
// ユーティリティ
// ===================================
let _uidCounter = 0;
function generateUid(): string {
  return `item_${Date.now()}_${_uidCounter++}`;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function weightedRandom<T>(items: readonly T[], weights: readonly number[]): T {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}


function shuffleAndPick<T>(arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// ===================================
// レアリティ抽選
// ===================================
/** レアリティ抽選 */
export function rollRarity(): Rarity {
  const rarities = (Object.values(Rarity) as Rarity[]);
  const weights = rarities.map((r) => RARITY_CONFIG[r].dropWeight);
  return weightedRandom(rarities, weights);
}

// ===================================
// Affix ロール
// ===================================
function rollAffix(affix: AffixDefinition): RolledAffix {
  return {
    definition: affix,
    rolledValues: affix.modifiers.map((mod) => {
      const rawRandomVal = mod.minValue + Math.random() * (mod.maxValue - mod.minValue);
      // HpRegen かつ固定値の場合は丸めない。それ以外も0.1単位（toFixed(1)）で実数化するように変更
      const value = (mod.stat === StatType.HpRegen && !mod.isPercentage)
        ? rawRandomVal
        : Number(rawRandomVal.toFixed(1));

      return {
        stat: mod.stat,
        value,
        isPercentage: mod.isPercentage,
      };
    }),
  };
}

function pickAffixes(
  pool: readonly AffixDefinition[],
  minCount: number,
  maxCount: number,
  itemLevel: number,
): RolledAffix[] {
  const eligible = pool.filter((a) => a.requiredItemLevel <= itemLevel);
  if (eligible.length === 0) return [];
  
  // レアリティ設定に基づき個数を決定（最低保証を適用）
  const count = randInt(Math.min(minCount, eligible.length), Math.min(maxCount, eligible.length));
  const selected = shuffleAndPick(eligible, count);
  return selected.map(rollAffix);
}

// ===================================
// アイテム生成
// ===================================

/** ランダムにベースアイテムを選んで完全なアイテムを生成 */
export function generateRandomItem(
  itemLevel?: number,
  forceRarity?: Rarity,
): GeneratedItem {
  // 1. 武器と防具のリストをそれぞれ生成
  const weapons = BASE_ITEMS.filter(item => item.slot === EquipSlot.MeleeWeapon || item.slot === EquipSlot.RangedWeapon);
  const armors = BASE_ITEMS.filter(item => item.slot !== EquipSlot.MeleeWeapon && item.slot !== EquipSlot.RangedWeapon);

  // 2. 60%の確率で武器、40%の確率で防具のプールを選択
  const pool = Math.random() < 0.6 ? weapons : armors;

  // 3. 選ばれたプールの中から均等な確率で1つを選出
  const base: BaseItemDefinition = pool[Math.floor(Math.random() * pool.length)];

  return generateItemFromBase(base, itemLevel, forceRarity);
}

/** 指定したベースアイテムからアイテムを生成 */
export function generateItemFromBase(
  base: BaseItemDefinition,
  itemLevel?: number,
  forceRarity?: Rarity,
): GeneratedItem {
  const level = itemLevel ?? 1;
  const rarity = forceRarity ?? rollRarity();
  const config = RARITY_CONFIG[rarity];

  const totalAffixes = config.totalAffixCount;
  
  // 接頭・接尾への割り振り計算（それぞれ最大4枠）
  let prefixCount = 0;
  let suffixCount = 0;
  
  if (totalAffixes > 0) {
    // とりあえずランダムに割り振る（ただし片方最大4）
    const minPrefix = Math.max(0, totalAffixes - 4); // 接尾が最大4でも残る分は接頭へ
    const maxPrefix = Math.min(4, totalAffixes);     // 接頭の最大は4
    prefixCount = randInt(minPrefix, maxPrefix);
    suffixCount = totalAffixes - prefixCount;
  }

  // 抽出（pool内に足りない場合は抽出できるだけ）
  const prefixes = pickAffixes(PREFIX_POOL, prefixCount, prefixCount, level);
  const suffixes = pickAffixes(SUFFIX_POOL, suffixCount, suffixCount, level);

  // アイテムのベースステータス設定
  // UIやステータス反映側で「基礎値 × Lv」が計算されるため、ここでは基礎値(s.value)をそのまま保持する
  const scaledBase: BaseItemDefinition = {
    ...base,
    baseStats: base.baseStats.map(s => ({
      ...s,
      value: s.value
    })),
  };

  return {
    uid: generateUid(),
    baseItem: scaledBase,
    rarity,
    prefixes,
    suffixes,
    itemLevel: level,
  };
}

// ===================================
// 表示用ヘルパー
// ===================================


/** アイテムの表示名を生成（接頭辞＋ベース名＋接尾辞） */
export function getItemDisplayName(item: GeneratedItem): string {
  // すべての接頭語の名前を連結（例：「剛力の」「生命の」→「剛力の生命の」）
  const prefixName = item.prefixes.map(p => p.definition.nameJa).join('');
  
  // すべての接尾語の名前から波ダッシュを消して連結（例：「〜の再生」「〜の狙撃」→「の再生の狙撃」）
  const suffixName = item.suffixes.map(s => s.definition.nameJa.replace(/^[~～〜]+/, '')).join('');
  
  // スペースなしで結合
  return `${prefixName}${item.baseItem.nameJa}${suffixName}`;
}

/** アイテムの色を取得 */
export function getItemColor(item: GeneratedItem): string {
  return RARITY_CONFIG[item.rarity].color;
}

/** デバッグ用: アイテム情報の文字列化 */
export function itemToString(item: GeneratedItem): string {
  const lines: string[] = [];
  const config = RARITY_CONFIG[item.rarity];
  lines.push(`[${config.nameJa}] ${getItemDisplayName(item)} (Lv.${item.itemLevel})`);

  // ベースステータス
  for (const s of item.baseItem.baseStats) {
    lines.push(`  ベース: ${s.stat} +${s.value}`);
  }

  // 接頭辞
  for (const p of item.prefixes) {
    for (const v of p.rolledValues) {
      const pct = v.isPercentage ? '%' : '';
      lines.push(`  ${p.definition.nameJa}: ${v.stat} +${v.value}${pct}`);
    }
  }

  // 接尾辞
  for (const s of item.suffixes) {
    for (const v of s.rolledValues) {
      const pct = v.isPercentage ? '%' : '';
      lines.push(`  ${s.definition.nameJa}: ${v.stat} +${v.value}${pct}`);
    }
  }

  return lines.join('\n');
}
