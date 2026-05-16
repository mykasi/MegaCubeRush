import { memo, useState, useEffect, useRef, useMemo } from 'react';
import type { GeneratedItem } from '../game/items/itemTypes';
import { EquipSlot, StatType, Rarity } from '../game/items/itemTypes';
import { RARITY_CONFIG } from '../game/items/itemData';
import { getItemDisplayName } from '../game/items/itemGenerator';
import type { PlayerStats, EquipmentState } from '../game/playerStats';
import { computeStats, dodgeBuffTimer, shifukuBuffAmount, playerStatsRef } from '../game/playerStats';
import { getLevel } from '../game/playerLevel';

// UIの表示状態をコンポーネントの破棄後も記憶しておくためのグローバル変数
const globalInvState = {
  showStats: true,
  showAffix: true,
  statTab: 'total' as 'total' | 'base',
  affixTab: 'percent' as 'percent' | 'value'
};

/**
 * ディアブロ風インベントリUI（装備＋ステータス＋比較対応版）
 * 左パネル: ステータス＋装備スロット
 * 右パネル: 所持品リスト（クリック/Aボタンで装備）+ ステータス比較プレビュー
 */

interface InventoryUIProps {
  items: GeneratedItem[];
  equipment: EquipmentState;
  computedStats: PlayerStats;
  onClose: () => void;
  onEquip: (item: GeneratedItem) => void;
  onUnequip: (slot: EquipSlot) => void;
  isGamepadActive: boolean;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  primaryTab: 'all' | 'melee' | 'ranged' | 'magic' | 'armor';
  secondaryTab: string;
  onPrimaryTabChange: (tab: 'all' | 'melee' | 'ranged' | 'magic' | 'armor') => void;
  onSecondaryTabChange: (tab: string) => void;
  permanentUpgrades: any; // 恒久強化状態を追加
  showInventoryMainAll: boolean;
  showInventorySubAll: boolean;
  inventoryDisplayLimit: number;
  leftActionTick?: number;
  leftLBTick?: number;
  leftRBTick?: number;
  totalItemsPickedUp?: number; // 追加
}

/** StatType の日本語ラベル */
export const STAT_LABELS: Record<string, string> = {
  [StatType.MeleeAttack]: '近接攻撃力',
  [StatType.RangedAttack]: '遠隔攻撃力',
  [StatType.Defense]: '防御力',
  [StatType.Health]: '最大HP',
  [StatType.Speed]: '移動速度',
  [StatType.CritChance]: '会心率',
  [StatType.CritDamage]: '会心ダメージ',
  [StatType.FireDamage]: '火炎ダメージ',
  [StatType.IceDamage]: '氷結ダメージ',
  [StatType.LightningDamage]: '雷撃ダメージ',
  [StatType.LifeSteal]: '吸血',
  [StatType.PickupRange]: '取得範囲',
  [StatType.HpRegen]: '自然回復速度',
  [StatType.MagicPower]: '魔力',
  [StatType.Evasion]: 'パリィ発生率',
};

const scrollRefGlobal = { current: null as HTMLDivElement | null };

/** EquipSlot の日本語ラベル + 絵文字 */
export const SLOT_LABELS: Record<string, { emoji: string; label: string }> = {
  MeleeWeapon: { emoji: '⚔️', label: '近接武器' },
  RangedWeapon: { emoji: '🔫', label: '遠隔武器' },
  Shield: { emoji: '🛡️', label: 'シールド' },
  Helmet: { emoji: '⛑️', label: 'ヘルム' },
  Armor: { emoji: '🧥', label: 'アーマー' },
  Boots: { emoji: '👢', label: 'ブーツ' },
  Ring: { emoji: '💍', label: 'リング' },
  Amulet: { emoji: '📿', label: 'アミュレット' },
};

/** 装備スロットの表示順 */
const SLOT_ORDER: EquipSlot[] = [
  EquipSlot.MeleeWeapon,
  EquipSlot.RangedWeapon,
  EquipSlot.Shield,
  EquipSlot.Helmet,
  EquipSlot.Armor,
  EquipSlot.Boots,
  EquipSlot.Ring,
  EquipSlot.Amulet,
];

const SUB_TABS = {
  melee: [
    { id: 'all', emoji: 'ALL', label: '全て' },
    { id: 'dagger', emoji: '🗡️', label: 'ダガー' },
    { id: 'saber', emoji: '🤺', label: 'セイバー' },
    { id: 'axe', emoji: '🪓', label: 'アックス' },
    { id: 'spear', emoji: '🔱', label: 'スピア' },
    { id: 'claymore', emoji: '⚔️', label: 'クレイモア' },
    { id: 'hammer', emoji: '🔨', label: 'ハンマー' },
    { id: 'knuckle', emoji: '🥊', label: 'ナックル' },
  ],
  ranged: [
    { id: 'all', emoji: 'ALL', label: '全て' },
    { id: 'handgun', emoji: '🔫', label: 'ハンドガン' },
    { id: 'smg', emoji: '🌪️', label: 'サブマシンガン' },
    { id: 'rifle', emoji: '🎯', label: 'ライフル' },
    { id: 'shotgun', emoji: '💥', label: 'ショットガン' },
    { id: 'grenade', emoji: '💣', label: 'グレネードランチャー' },
    { id: 'boomerang', emoji: '🪃', label: 'ブーメラン' },
    { id: 'chakram', emoji: '🌀', label: 'チャクラム' },
  ],
  magic: [
    { id: 'all', emoji: 'ALL', label: '全て' },
    { id: 'kris', emoji: '✨', label: 'クリス' },
    { id: 'mace', emoji: '⚒️', label: 'ルーンメイス' },
    { id: 'gauntlet', emoji: '🦾', label: 'ガントレット' },
    { id: 'grimoire', emoji: '📖', label: 'グリモワール' },
    { id: 'cards', emoji: '🃏', label: 'マジックカード' },
    { id: 'orb', emoji: '🔮', label: 'オーブ' },
  ],
  armor: [
    { id: 'all', emoji: 'ALL', label: '全て' },
    { id: 'shield', emoji: '🛡️', label: 'シールド' },
    { id: 'helm', emoji: '⛑️', label: 'ヘルム' },
    { id: 'armor', emoji: '🧥', label: 'アーマー' },
    { id: 'boots', emoji: '👢', label: 'ブーツ' },
    { id: 'ring', emoji: '💍', label: 'リング' },
    { id: 'amulet', emoji: '📿', label: 'アミュレット' },
  ]
};

/** 比較用ステータス行（プレビュー用） */
const COMPARE_ROWS: { label: string; key: keyof PlayerStats; suffix?: string; fixed: number; invert?: boolean }[] = [
  { label: '最大HP', key: 'health', fixed: 1 },
  { label: '最大SP', key: 'maxSp', fixed: 1 },
  { label: '近接攻撃力', key: 'meleeAttackPower', fixed: 1 },
  { label: '近接攻撃回数', key: 'meleeAttackInterval', suffix: '/sec', fixed: 2, invert: false },
  { label: '遠隔攻撃力', key: 'rangedAttackPower', fixed: 1 },
  { label: '遠隔攻撃回数', key: 'rangedAttackInterval', suffix: '/sec', fixed: 2, invert: false },
  { label: '魔力', key: 'magicPower', fixed: 1 },
  { label: '会心率', key: 'critChance', suffix: '%', fixed: 1 },
  { label: '防御力', key: 'defense', fixed: 1 },
  { label: 'パリィ発生率', key: 'evasion', suffix: '%', fixed: 1 },
  { label: '取得範囲', key: 'pickupRange', fixed: 1 },
  { label: '移動速度', key: 'moveSpeed', fixed: 1 },
  { label: '自然回復', key: 'hpRegen', suffix: '/秒', fixed: 2 },
];

/** ジャンル判定ヘルパー関数 (BaseItemDefinition 対応版) */
export const getItemCategoryInfo = (baseItem: any) => {
  const slot = baseItem.slot;
  const getSlotName = (s: EquipSlot) => SLOT_LABELS[s]?.label || s;
  const isWeapon = slot === EquipSlot.MeleeWeapon || slot === EquipSlot.RangedWeapon;
  
  if (!isWeapon) {
    return { genreName: getSlotName(slot), badge: '' };
  }

  const isMagic = baseItem.baseStats.some((s: any) => s.stat === StatType.MagicPower);
  const isMelee = slot === EquipSlot.MeleeWeapon;

  // バッジ判定を「近接(👊)」か「遠隔(🏹)」に集約
  if (isMelee) {
    return { genreName: isMagic ? '近接魔法武器' : '近接武器', badge: '👊' };
  } else {
    return { genreName: isMagic ? '遠隔魔法武器' : '遠隔武器', badge: '🏹' };
  }
};

/** 左画面用：完全指定の7段・2列構成ステータス行 */
// DISPLAY_ROWS は削除されました（StatsDisplay 内で直接配列を定義）

// ===================================
// アイコン取得ヘルパー
// ===================================
/** アイコン取得ヘルパー (BaseItemDefinition 対応版) */
export function getItemIcon(baseItem: any | null, fallbackSlot?: EquipSlot): { emoji: string; label: string } {
  const slot = fallbackSlot ?? baseItem?.slot;
  if (!slot) return { emoji: '❓', label: 'Unknown' };

  const slotInfo = SLOT_LABELS[slot] || { emoji: '❓', label: slot };
  if (!baseItem) return slotInfo;

  const id = baseItem.id.toLowerCase();

  if (slot === EquipSlot.MeleeWeapon) {
    if (id.includes('dagger')) return { ...slotInfo, emoji: '🗡️' };
    if (id.includes('kris')) return { ...slotInfo, emoji: '✨' }; // 魔法短剣
    if (id.includes('saber')) return { ...slotInfo, emoji: '🤺' }; // 剣士
    if (id.includes('claymore')) return { ...slotInfo, emoji: '⚔️' }; // 大剣
    if (id.includes('axe')) return { ...slotInfo, emoji: '🪓' };
    if (id.includes('spear')) return { ...slotInfo, emoji: '🔱' };
    if (id.includes('mace')) return { ...slotInfo, emoji: '⚒️' }; // 魔法槌
    if (id.includes('hammer')) return { ...slotInfo, emoji: '🔨' };
    if (id.includes('knuckle')) return { ...slotInfo, emoji: '🥊' };
    if (id.includes('gauntlet')) return { ...slotInfo, emoji: '🦾' }; // 魔法拳（機械腕）
    return { ...slotInfo, emoji: '👊' }; // デフォルト近接
  }

  if (slot === EquipSlot.RangedWeapon) {
    if (id.includes('grimoire')) return { ...slotInfo, emoji: '📖' };
    if (id.includes('cards')) return { ...slotInfo, emoji: '🃏' };
    if (id.includes('orb')) return { ...slotInfo, emoji: '🔮' };
    if (id.includes('smg')) return { ...slotInfo, emoji: '🌪️' }; // 弾丸の嵐
    if (id.includes('rifle')) return { ...slotInfo, emoji: '🎯' };
    if (id.includes('shotgun')) return { ...slotInfo, emoji: '💥' };
    if (id.includes('grenade')) return { ...slotInfo, emoji: '💣' }; // 爆弾
    if (id.includes('boomerang')) return { ...slotInfo, emoji: '🪃' }; // ブーメラン
    if (id.includes('chakram') || id.includes('orbit')) return { ...slotInfo, emoji: '🌀' };
    return { ...slotInfo, emoji: '🔫' }; // ハンドガン・その他
  }

  return slotInfo;
}

// ===================================
// アイテムカード（所持品リスト用）
// ===================================
function ItemCard({
  item,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isSelected,
}: {
  item: GeneratedItem;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  isSelected: boolean;
}) {
  const itemRef = useRef<HTMLDivElement>(null);

  // ゲームパッド選択時にスクロール位置を調整
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
      });
    }
  }, [isSelected]);

  const config = RARITY_CONFIG[item.rarity];
  const slot = getItemIcon(item.baseItem);

  const currentLevel = getLevel();
  const isLevelDisabled = currentLevel < item.itemLevel;

  return (
    <div
      ref={itemRef}
      className={`inv-item-card${isSelected ? ' inv-item-selected' : ''} ${item.rarity.toLowerCase()}-glow`}
      style={{
        borderColor: config.color,
        opacity: isLevelDisabled ? 0.4 : 1.0,
        pointerEvents: isLevelDisabled ? 'none' : 'auto',
        // インライン boxShadow を削除
        backgroundColor: config.color + '22',
      }}
      onClick={isLevelDisabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="クリックで装備"
    >
      <div className="inv-item-grid-content">
        <span className="inv-item-slot-icon" style={{ textShadow: `0 0 4px ${config.color}66` }}>{slot.emoji}</span>
        {(() => {
          const catInfo = getItemCategoryInfo(item.baseItem);
          return catInfo.badge && (
            <div style={{ position: 'absolute', top: '-2px', left: '2px', fontSize: '14px', zIndex: 2, textShadow: '0 0 2px #000' }}>
              {catInfo.badge}
            </div>
          );
        })()}
      </div>
      {isLevelDisabled && <div className="inv-item-grid-level-warning">Lv</div>}
    </div>
  );
}

// ===================================
// アイテム詳細プレビュー（選択中アイテム用）
// ===================================
// ===================================
// アイテム詳細プレビュー（防弾シールド版）
// ===================================
function ItemDetailPanel({ item }: { item: GeneratedItem | null }) {
  if (!item) {
    return (
      <div className="inv-item-detail-empty">
        <p>アイテムを選択してください</p>
      </div>
    );
  }

  const config = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.Common;
  const displayName = getItemDisplayName(item).replace(/[〜～~]/g, '');
  const slot = getItemIcon(item.baseItem);

  const currentLevel = getLevel();
  const isLevelDisabled = currentLevel < (item.itemLevel || 1);

  return (
    <div className="inv-item-detail-panel" style={{ borderColor: config.color }}>
      <div className="inv-item-detail-header">
        <span className="inv-item-slot">{slot.emoji}</span>
        <span className="inv-item-name" style={{ color: config.color, textShadow: `0 0 10px ${config.color}AA` }}>
          {displayName}
        </span>
      </div>

      <div className="inv-item-detail-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        {/* 左側グループ：レアリティとLvを並べる */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
          <span style={{ color: config.color, fontWeight: item.rarity === Rarity.Celestial ? 'bold' : 'normal' }}>
            {config.nameJa}
          </span>
          <span 
            className="inv-item-level" 
            style={{ 
              color: isLevelDisabled ? '#ef4444' : undefined,
              fontWeight: isLevelDisabled ? 'bold' : undefined
            }}
          >
            {isLevelDisabled ? `必要Lv.${item.itemLevel}` : `Lv.${item.itemLevel || 1}`}
          </span>
        </div>
        
        {/* 右側：スロット名（遠隔武器など） */}
        <span className="inv-item-slot-label">
          {(() => {
            const catInfo = getItemCategoryInfo(item.baseItem);
            return item.baseItem.slot === EquipSlot.MeleeWeapon || item.baseItem.slot === EquipSlot.RangedWeapon
              ? `${catInfo.genreName}　${item.baseItem.nameJa}`
              : item.baseItem.nameJa;
          })()}
        </span>
      </div>

      {item.baseItem?.baseStats?.length > 0 && (
        <div className="inv-item-detail-base" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px', padding: '0 12px' }}>
          {item.baseItem.baseStats.map((s, i) => {
            let label = STAT_LABELS[s?.stat] || (s?.stat as string) || '不明';
            const val = s.value * (item.itemLevel || 1);
            let displayStr = '';
            if (s.stat === StatType.HpRegen) {
              displayStr = `+${val.toFixed(2)}/sec`;
            } else if (s.stat === StatType.Evasion || s.stat === StatType.CritChance) {
              const v = Number.isInteger(val) ? val : val.toFixed(1);
              displayStr = `+${v}%`;
            } else {
              displayStr = `+${val.toFixed(1)}`;
            }
            return (
              <div key={i} className="inv-stat-line inv-stat-base" style={{ margin: 0 }}>
                {label} {displayStr}
              </div>
            );
          })}
        </div>
      )}

      {(item.prefixes?.length > 0 || item.suffixes?.length > 0) && (
        <div className="inv-item-affixes">
          <div className="inv-affix-col">
            {item.prefixes?.map((p, pi) =>
              p?.rolledValues?.map((v, vi) => (
                <div key={`p${pi}-${vi}`} className="inv-stat-line inv-stat-affix" style={{ color: '#5cb8ff', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const rawVal = v.value;
                    const displayVal = Math.round(rawVal).toString();
                    const sign = rawVal > 0 ? '+' : '';
                    return `${p?.definition?.nameJa || '未知の接頭語'}: ${STAT_LABELS[v?.stat] || v?.stat || '不明'} ${sign}${displayVal}%`;
                  })()}
                </div>
              ))
            )}
          </div>
          <div className="inv-affix-col">
            {item.suffixes?.map((s, si) =>
              s?.rolledValues?.map((v, vi) => (
                <div key={`s${si}-${vi}`} className="inv-stat-line inv-stat-affix" style={{ color: '#5cb8ff', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const cleanName = (s?.definition?.nameJa || '未知の接尾語').replace(/^[～~](の)?/, '');
                    const rawVal = v.value;
                    const displayVal = Math.round(rawVal).toString();
                    const sign = rawVal > 0 ? '+' : '';
                    return `${cleanName}: ${STAT_LABELS[v?.stat] || v?.stat || '不明'} ${sign}${displayVal}%`;
                  })()}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ===================================
// 装備スロット表示
// ===================================
function EquipSlotCard({
  slot,
  item,
  onUnequip,
  isSelected,
}: {
  slot: EquipSlot;
  item: GeneratedItem | null;
  onUnequip: () => void;
  isSelected?: boolean;
}) {
  const slotInfo = getItemIcon(item ? item.baseItem : null, slot);

  if (!item) {
    let name = slotInfo.label + '(なし)';
    if (slot === EquipSlot.MeleeWeapon) name = '素手';
    if (slot === EquipSlot.RangedWeapon) name = '遠隔武器(なし)';

    return (
      <div className="equip-slot-empty" style={{ 
        borderColor: isSelected ? '#fff' : '#333', 
        boxShadow: isSelected ? '0 0 0 2px #fff' : 'none',
        height: '44px',
        display: 'flex',
        alignItems: 'center'
      }}>
        <span className="equip-slot-emoji">{slotInfo.emoji}</span>
        <div className="equip-slot-info">
          <span className="equip-slot-label">{name}</span>
        </div>
      </div>
    );
  }

  const config = RARITY_CONFIG[item.rarity];
  const displayName = getItemDisplayName(item).replace(/[〜～~]/g, '');
  const catInfo = getItemCategoryInfo(item.baseItem);

  return (
    <div
      className="equip-slot"
      onClick={onUnequip}
      title="クリックで装備解除"
      style={{
        borderColor: isSelected ? '#fff' : config.color,
        boxShadow: isSelected ? '0 0 0 2px #fff' : 'none',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        position: 'relative',
        minHeight: 'auto',
        height: '44px',
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <span className="equip-slot-emoji">{slotInfo.emoji}</span>
      {catInfo.badge && (
        <div style={{ position: 'absolute', top: '-2px', left: '2px', fontSize: '14px', zIndex: 2, textShadow: '0 0 2px #000' }}>
          {catInfo.badge}
        </div>
      )}
          <div className="equip-slot-info" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div
              className="equip-item-name"
              style={{
                color: config.color,
                textShadow: 'none',
                fontSize: '15px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 'none',
                display: 'block',
                width: '100%'
              }}
            >
              {displayName}
            </div>
            
            <div className="equip-slot-rarity" style={{ fontSize: '12px', color: '#888' }}>
              <span style={{ color: config.color }}>{config.nameJa}</span>
              <span style={{ marginLeft: '6px' }}>Lv.{item.itemLevel}</span>
              
              <span style={{ color: '#aaa', marginLeft: '12px' }}>
                {item.baseItem.slot === EquipSlot.MeleeWeapon || item.baseItem.slot === EquipSlot.RangedWeapon
                  ? `${catInfo.genreName}　${item.baseItem.nameJa}`
                  : item.baseItem.nameJa}
              </span>
            </div>
          </div>
      <span className="equip-slot-remove">✕</span>
    </div>
  );
}

// ===================================
// ステータス表示
// ===================================
//StatsDisplay and AffixTotalDisplay have been inlined into InventoryUI

// ===================================
// ステータス比較プレビュー（防弾シールド版）
// ===================================
function ComparePreview({
  currentStats,
  previewItem,
  equipment,
  permanentUpgrades,
}: {
  currentStats: PlayerStats;
  previewItem: GeneratedItem | null;
  equipment: EquipmentState;
  permanentUpgrades: any;
}) {
  if (!previewItem || !previewItem.baseItem) {
    return (
      <div className="compare-panel" style={{ marginTop: 0, height: '100%' }}>
        <div className="compare-hint" style={{ fontSize: '13px' }}>
          アイテムにカーソルを合わせると装備時のステータス変化を表示します
        </div>
      </div>
    );
  }

  // 計算中のクラッシュを防ぐtry-catchブロック
  let simStats: PlayerStats;
  try {
    const slot = previewItem.baseItem.slot;
    const simEquip: EquipmentState = { ...equipment, [slot]: previewItem };
    simStats = computeStats(simEquip, permanentUpgrades);
  } catch (e) {
    console.error("プレビュー計算エラー:", e);
    simStats = currentStats; // エラーが起きたら変化なしとして扱う
  }

  const diffs = COMPARE_ROWS.map((r) => {
    const curVal = (currentStats[r.key] as number) || 0;
    const simVal = (simStats[r.key] as number) || 0;
    
    // 表示用のAPS変換（Interval系の場合）
    const isInterval = r.key === 'meleeAttackInterval' || r.key === 'rangedAttackInterval';
    const cur = isInterval ? (1 / Math.max(0.01, curVal)) : curVal;
    const sim = isInterval ? (1 / Math.max(0.01, simVal)) : simVal;

    const diff = sim - cur;
    const isPositive = r.invert ? diff < -0.001 : diff > 0.001;
    const isNegative = r.invert ? diff > 0.001 : diff < -0.001;
    return { ...r, diff, isPositive, isNegative, absVal: Math.abs(diff) };
  }).filter((d) => d.absVal >= 0.005);

  // 現在の装備とプレビューアイテムのレベル差分を計算
  const slot = previewItem.baseItem.slot;
  const curItem = equipment[slot];
  const curLevel = curItem ? (curItem.itemLevel || 1) : 0;
  const newLevel = previewItem.itemLevel || 1;
  const levelDiff = newLevel - curLevel;
  const isLevelPositive = levelDiff > 0;
  const isLevelNegative = levelDiff < 0;
  const levelAbsVal = Math.abs(levelDiff);
  
  const hasAnyDiff = diffs.length > 0 || levelDiff !== 0;
  const slotInfo = getItemIcon(previewItem.baseItem, previewItem.baseItem.slot);

  return (
    <div className="compare-panel" style={{ marginTop: 0, height: '100%' }}>
      <div className="compare-title">
        {slotInfo.emoji} 装備時の変化
      </div>
      {!hasAnyDiff ? (
        <div className="compare-no-change" style={{ fontSize: '13px' }}>変化なし（またはデータ破損）</div>
      ) : (
        <div className="compare-rows">
          {levelDiff !== 0 && (
            <div
              key="itemLevel"
              className={`compare-row ${isLevelPositive ? 'compare-up' : ''} ${isLevelNegative ? 'compare-down' : ''}`}
              style={{ whiteSpace: 'nowrap', fontSize: '13px' }}
            >
              <span className="compare-diff">
                {isLevelPositive ? '▲' : '▼'}{' '}
                {levelDiff > 0 ? '+' : '-'}{levelAbsVal}
              </span>
              <span className="compare-label">アイテムLv</span>
            </div>
          )}
          {diffs.map((d) => {
            const needsDecimal = ['近接攻撃力', '遠隔攻撃力', '魔力', '防御力', '会心率', '回避率'].includes(d.label);
            return (
              <div
                key={d.key}
                className={`compare-row ${d.isPositive ? 'compare-up' : ''} ${d.isNegative ? 'compare-down' : ''}`}
                style={{ whiteSpace: 'nowrap', fontSize: '13px' }}
              >
                <span className="compare-diff">
                  {d.isPositive ? '▲' : '▼'}{' '}
                  {d.diff >= 0 ? '+' : '-'}{needsDecimal ? d.absVal.toFixed(1) : d.absVal.toFixed(d.fixed)}
                  {(d.suffix || '')}
                </span>
                <span className="compare-label">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================================
// ===================================
// メインコンポーネント
// ===================================

const RARITY_ORDER: Record<string, number> = {
  [Rarity.Common]: 1,
  [Rarity.Uncommon]: 2,
  [Rarity.Magic]: 3,
  [Rarity.Rare]: 4,
  [Rarity.Epic]: 5,
  [Rarity.Legendary]: 6,
  [Rarity.Mythic]: 7,
  [Rarity.Immortal]: 8,
  [Rarity.Celestial]: 9,
};

// ===================================
export const InventoryUI = memo(function InventoryUI({
  items,
  equipment,
  computedStats,
  onClose,
  onEquip,
  onUnequip,
  isGamepadActive,
  selectedIndex,
  onSelectIndex,
  primaryTab,
  secondaryTab,
  onPrimaryTabChange,
  onSecondaryTabChange,
  permanentUpgrades,
  showInventoryMainAll,
  showInventorySubAll,
  inventoryDisplayLimit,
  leftActionTick = 0,
  leftLBTick = 0,
  leftRBTick = 0,
  totalItemsPickedUp = 0,
}: InventoryUIProps) {
  const [hoveredItem, setHoveredItem] = useState<GeneratedItem | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PageUp') {
        scrollContainerRef.current?.scrollBy({ top: -300, behavior: 'smooth' });
        e.preventDefault();
      }
      if (e.key === 'PageDown') {
        scrollContainerRef.current?.scrollBy({ top: 300, behavior: 'smooth' });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [isBuffActive, setIsBuffActive] = useState(false);
  const [isShifukuActive, setIsShifukuActive] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBuffActive(dodgeBuffTimer > 0);
      setIsShifukuActive(shifukuBuffAmount > 0);
      setTick(t => t + 1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 設定によって非表示になったタブが選択されている場合のフォールバック処理
  useEffect(() => {
    if (!showInventoryMainAll && primaryTab === 'all') {
      onPrimaryTabChange('melee');
    }
  }, [showInventoryMainAll, primaryTab, onPrimaryTabChange]);

  useEffect(() => {
    if (!showInventorySubAll && secondaryTab === 'all') {
      const availableTabs = SUB_TABS[primaryTab as keyof typeof SUB_TABS];
      if (availableTabs && availableTabs.length > 1) {
        onSecondaryTabChange(availableTabs[1].id);
      }
    }
  }, [showInventorySubAll, secondaryTab, primaryTab, onSecondaryTabChange]);

  // グローバル変数から初期値を読み込む
  const [showStats, _setShowStats] = useState(globalInvState.showStats);
  const [showAffix, _setShowAffix] = useState(globalInvState.showAffix);
  const [statTab, _setStatTab] = useState<'total' | 'base'>(globalInvState.statTab);
  const [affixTab, _setAffixTab] = useState<'percent' | 'value'>(globalInvState.affixTab);

  // ステート更新と同時にグローバル変数も更新するラッパー関数
  const setShowStats = (v: boolean) => { globalInvState.showStats = v; _setShowStats(v); };
  const setShowAffix = (v: boolean) => { globalInvState.showAffix = v; _setShowAffix(v); };
  const setStatTab = (v: 'total' | 'base') => { globalInvState.statTab = v; _setStatTab(v); };
  const setAffixTab = (v: 'percent' | 'value') => { globalInvState.affixTab = v; _setAffixTab(v); };

  // 前回の入力Tickを保持するRef（カーソル移動時の誤爆防止）
  const prevTicks = useRef({ action: leftActionTick, lb: leftLBTick, rb: leftRBTick });

  useEffect(() => {
    if (leftActionTick !== prevTicks.current.action) {
      prevTicks.current.action = leftActionTick; // 更新
      if (selectedIndex === -9) setShowStats(!globalInvState.showStats);
      else if (selectedIndex === -10) setShowAffix(!globalInvState.showAffix);
    }
  }, [leftActionTick, selectedIndex]);

  useEffect(() => {
    if (leftLBTick !== prevTicks.current.lb || leftRBTick !== prevTicks.current.rb) {
      prevTicks.current.lb = leftLBTick; // 更新
      prevTicks.current.rb = leftRBTick; // 更新
      if (selectedIndex === -9) setStatTab(globalInvState.statTab === 'total' ? 'base' : 'total');
      else if (selectedIndex === -10) setAffixTab(globalInvState.affixTab === 'percent' ? 'value' : 'percent');
    }
  }, [leftLBTick, leftRBTick, selectedIndex]);

  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      const isMelee = item.baseItem.slot === EquipSlot.MeleeWeapon;
      const isRanged = item.baseItem.slot === EquipSlot.RangedWeapon;
      const isArmor = !isMelee && !isRanged;
      const isMagic = item.baseItem.baseStats.some(s => s.stat === StatType.MagicPower);

      let matchPrimary = false;
      if (primaryTab === 'all') matchPrimary = true;
      else if (primaryTab === 'melee') matchPrimary = isMelee && !isMagic;
      else if (primaryTab === 'ranged') matchPrimary = isRanged && !isMagic;
      else if (primaryTab === 'magic') matchPrimary = (isMelee || isRanged) && isMagic;
      else if (primaryTab === 'armor') matchPrimary = isArmor;

      if (!matchPrimary) return false;
      if (secondaryTab === 'all') return true;

      if (primaryTab === 'armor') {
        if (secondaryTab === 'shield') return item.baseItem.slot === EquipSlot.Shield;
        if (secondaryTab === 'helm') return item.baseItem.slot === EquipSlot.Helmet;
        if (secondaryTab === 'armor') return item.baseItem.slot === EquipSlot.Armor;
        if (secondaryTab === 'boots') return item.baseItem.slot === EquipSlot.Boots;
        if (secondaryTab === 'ring') return item.baseItem.slot === EquipSlot.Ring;
        if (secondaryTab === 'amulet') return item.baseItem.slot === EquipSlot.Amulet;
      } else {
        return item.baseItem.id.includes(secondaryTab);
      }
      return true;
    });

    const currentLevel = getLevel();
    result.sort((a, b) => {
      const aEquip = a.itemLevel <= currentLevel ? 1 : 0;
      const bEquip = b.itemLevel <= currentLevel ? 1 : 0;
      if (aEquip !== bEquip) return bEquip - aEquip;

      const ra = RARITY_ORDER[a.rarity] ?? 0;
      const rb = RARITY_ORDER[b.rarity] ?? 0;
      if (ra !== rb) return rb - ra; // 降順（高レアが上）

      return b.itemLevel - a.itemLevel;
    });

    return result;
  }, [items, primaryTab, secondaryTab]);

  // ゲームパッド選択時は hoveredItem を selectedIndex に追従させる
  useEffect(() => {
    if (isGamepadActive && filteredItems.length > 0 && selectedIndex >= 0) {
      const clampedIndex = Math.min(selectedIndex, filteredItems.length - 1);
      if (clampedIndex !== selectedIndex) {
        onSelectIndex(clampedIndex);
      }
      setHoveredItem(filteredItems[clampedIndex] || null);
    }
  }, [isGamepadActive, selectedIndex, filteredItems, onSelectIndex]);

  // マウスホバーの対象アイテム
  const previewItem = isGamepadActive
    ? (selectedIndex >= 0
        ? (filteredItems[Math.min(selectedIndex, Math.max(0, filteredItems.length - 1))] || null)
        : (selectedIndex >= -8 ? equipment[SLOT_ORDER[Math.abs(selectedIndex) - 1]] || null : null)
      )
    : hoveredItem;

  // 基礎ステータスの計算（全装備なし状態）
  const emptyEquip: EquipmentState = {
    [EquipSlot.MeleeWeapon]: null,
    [EquipSlot.RangedWeapon]: null,
    [EquipSlot.Shield]: null,
    [EquipSlot.Helmet]: null,
    [EquipSlot.Armor]: null,
    [EquipSlot.Boots]: null,
    [EquipSlot.Ring]: null,
    [EquipSlot.Amulet]: null,
  };
  const baseStats = computeStats(emptyEquip, permanentUpgrades);
  
  // ====== 通用設定 & 計算ロジック (Step 210) ======
  const STAT_KEY_MAP: Record<string, string> = {
    [StatType.MeleeAttack]: 'meleeAttackPower',
    [StatType.RangedAttack]: 'rangedAttackPower',
    [StatType.Defense]: 'defense',
    [StatType.Health]: 'health',
    [StatType.Speed]: 'moveSpeed',
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

  const affixOrder = [
    'health', 'maxSp', 'meleeAttackPower', 'meleeAttackSpeed', 
    'rangedAttackPower', 'rangedAttackSpeed', 'magicPower', 'critChance', 
    'defense', 'evasion', 'moveSpeed', 'pickupRange', 'hpRegen'
  ];

  const STAT_INFO: Record<string, { nameJa: string }> = {
    health: { nameJa: '最大HP' },
    maxSp: { nameJa: '最大SP' },
    meleeAttackPower: { nameJa: '近接攻撃力' },
    meleeAttackSpeed: { nameJa: '近接攻撃回数' },
    rangedAttackPower: { nameJa: '遠隔攻撃力' },
    rangedAttackSpeed: { nameJa: '遠隔攻撃回数' },
    magicPower: { nameJa: '魔力' },
    critChance: { nameJa: '会心率' },
    defense: { nameJa: '防御力' },
    evasion: { nameJa: 'パリィ発生率' },
    moveSpeed: { nameJa: '移動速度' },
    pickupRange: { nameJa: '取得範囲' },
    hpRegen: { nameJa: '自然回復速度' },
  };

  const equippedGear = Object.values(equipment).filter(Boolean) as GeneratedItem[];
  const gearBase: Record<string, number> = {};
  equippedGear.forEach(item => {
    item.baseItem.baseStats.forEach(s => {
      const key = STAT_KEY_MAP[s.stat] || s.stat;
      gearBase[key] = (gearBase[key] || 0) + s.value * (item.itemLevel || 1);
    });
  });

  const getBaseStat = (stat: string) => {
    let pBase = 0;
    if (stat === 'health') pBase = baseStats.health;
    else if (stat === 'maxSp') pBase = baseStats.maxSp;
    else if (stat === 'meleeAttackPower') pBase = baseStats.meleeAttackPower;
    else if (stat === 'rangedAttackPower') pBase = baseStats.rangedAttackPower;
    else if (stat === 'magicPower') pBase = baseStats.magicPower;
    else if (stat === 'defense') pBase = baseStats.defense;
    else if (stat === 'critChance') pBase = baseStats.critChance;
    else if (stat === 'evasion') pBase = baseStats.evasion;
    else if (stat === 'moveSpeed') pBase = baseStats.moveSpeed;
    else if (stat === 'pickupRange') pBase = baseStats.pickupRange;
    else if (stat === 'hpRegen') pBase = baseStats.hpRegen;
    else if (stat === 'meleeAttackSpeed' || stat === 'rangedAttackSpeed') pBase = 1.0;
    return pBase + (gearBase[stat] || 0);
  };

  const summedStatsByType = equippedGear.reduce((acc, item) => {
    const allAffixes = [...item.prefixes, ...item.suffixes].flatMap(a => a.rolledValues);
    allAffixes.forEach(stat => {
      const key = STAT_KEY_MAP[stat.stat] || stat.stat;
      if (!acc[key]) acc[key] = { value: 0, percent: 0 };
      if (stat.isPercentage) acc[key].percent += stat.value;
      else acc[key].value += stat.value;
    });
    return acc;
  }, {} as Record<string, { value: number; percent: number }>);

  return (
    <div className="inv-overlay" style={{ zIndex: 80 }}>
      <div className="inv-panel" style={{ width: '920px', maxWidth: '95vw' }}>
        {/* タイトルバー */}
        <div className="inv-title-bar">
          <h2 className="inv-title">📦 インベントリ</h2>
          <div className="inv-title-right">
            <span className="inv-item-count">表示数: {filteredItems.length} / 所持数: {items.length} / 取得数: {totalItemsPickedUp}</span>
            <button className="inv-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>


        {/* 左右分割ボディ */}
        <div className="inv-body">
          {/* 左パネル：ステータス＋装備スロット */}
          <div className="inv-status-panel" style={{ minWidth: '540px', width: '540px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {/* 上段：装備スロット（横幅いっぱいまで伸びる） */}
            <div style={{ width: '100%' }}>
              <div className="inv-section-title">🎽 装備</div>
              {SLOT_ORDER.map((slot, index) => (
                <EquipSlotCard
                  key={slot}
                  slot={slot}
                  item={equipment[slot]}
                  isSelected={isGamepadActive && selectedIndex === -(index + 1)}
                  onUnequip={() => onUnequip(slot)}
                />
              ))}
            </div>

            {/* 下段：ステータスとプレビューを横並びに配置 */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginTop: '8px', flex: 1, alignItems: 'flex-start' }}>
              {/* 左側：ステータスとアフィックス合計（広め） */}
              <div style={{ flex: '1.3', display: 'flex', flexDirection: 'column' }}>
                
                <div 
                  className="inv-section-title" 
                  style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: (isGamepadActive && selectedIndex === -9) ? '0 0 0 2px #fff' : 'none', background: (isGamepadActive && selectedIndex === -9) ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: '4px', padding: '4px' }}
                  onClick={() => setShowStats(!showStats)}
                  title="クリックで折りたたみ/展開"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>⚙️ ステータス</span>
                    {showStats && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span 
                          onClick={(e) => { e.stopPropagation(); setStatTab('total'); }}
                          style={{ 
                            padding: '2px 8px', fontSize: '10px', borderRadius: '4px',
                            background: statTab === 'total' ? 'rgba(120, 80, 255, 0.25)' : 'rgba(255,255,255,0.05)',
                            color: statTab === 'total' ? '#d0b0ff' : '#888',
                            border: `1px solid ${statTab === 'total' ? 'rgba(120, 80, 255, 0.6)' : 'transparent'}`,
                            lineHeight: '1'
                          }}
                        >合計値</span>
                        <span 
                          onClick={(e) => { e.stopPropagation(); setStatTab('base'); }}
                          style={{ 
                            padding: '2px 8px', fontSize: '10px', borderRadius: '4px',
                            background: statTab === 'base' ? 'rgba(120, 80, 255, 0.25)' : 'rgba(255,255,255,0.05)',
                            color: statTab === 'base' ? '#d0b0ff' : '#888',
                            border: `1px solid ${statTab === 'base' ? 'rgba(120, 80, 255, 0.6)' : 'transparent'}`,
                            lineHeight: '1'
                          }}
                        >基礎値</span>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: '#666' }}>{showStats ? '▼' : '▶'}</span>
                </div>
                {showStats && (
                  <div className="inv-stats-grid">
                    {[
                      { label: '最大HP', value: (statTab === 'total' ? playerStatsRef.current.health : getBaseStat('health')).toFixed(1) },
                      { label: '最大SP', value: (statTab === 'total' ? playerStatsRef.current.maxSp : getBaseStat('maxSp')).toFixed(1) },
                      { 
                        label: '近接攻撃力', 
                        value: (statTab === 'total' ? (playerStatsRef.current.meleeAttackPower || 0) : getBaseStat('meleeAttackPower')).toFixed(1),
                        color: (statTab === 'total' && isShifukuActive) ? '#7fbfff' : undefined 
                      },
                      { label: '近接攻撃回数', value: `${(1 / Math.max(0.01, statTab === 'total' ? playerStatsRef.current.meleeAttackInterval : 1.0)).toFixed(2)}回/秒` },
                      { 
                        label: '遠隔攻撃力', 
                        value: (statTab === 'total' ? (playerStatsRef.current.rangedAttackPower || 0) : getBaseStat('rangedAttackPower')).toFixed(1),
                        color: (statTab === 'total' && isShifukuActive) ? '#7fbfff' : undefined 
                      },
                      { label: '遠隔攻撃回数', value: `${(1 / Math.max(0.01, statTab === 'total' ? playerStatsRef.current.rangedAttackInterval : 1.0)).toFixed(2)}回/秒` },
                      { label: '魔力', value: (statTab === 'total' ? playerStatsRef.current.magicPower : getBaseStat('magicPower')).toFixed(1) },
                      { 
                        label: '会心率', 
                        value: `${(statTab === 'total' ? (playerStatsRef.current.critChance + (isBuffActive ? 50.0 : 0)) : getBaseStat('critChance')).toFixed(1)}%`, 
                        color: (statTab === 'total' && isBuffActive) ? '#bf7fff' : undefined 
                      },
                      { label: '防御力', value: (statTab === 'total' ? playerStatsRef.current.defense : getBaseStat('defense')).toFixed(1) },
                      { label: 'パリィ発生率', value: `${(statTab === 'total' ? computedStats.evasion : getBaseStat('evasion')).toFixed(1)}%` },
                      { label: '移動速度', value: (statTab === 'total' ? computedStats.moveSpeed : getBaseStat('moveSpeed')).toFixed(1) },
                      { label: '取得範囲', value: (statTab === 'total' ? computedStats.pickupRange : getBaseStat('pickupRange')).toFixed(1) },
                      { label: '自然回復速度', value: `${(statTab === 'total' ? computedStats.hpRegen : getBaseStat('hpRegen')).toFixed(2)}/sec` }
                    ].map(s => (
                      <div key={s.label} className="inv-stat-row">
                        <span className="inv-stat-label">{s.label}</span>
                        <span className="inv-stat-value" style={{ color: (s as any).color }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <div 
                  className="inv-section-title" 
                  style={{ marginTop: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: (isGamepadActive && selectedIndex === -10) ? '0 0 0 2px #fff' : 'none', background: (isGamepadActive && selectedIndex === -10) ? 'rgba(255,255,255,0.1)' : 'transparent', borderRadius: '4px', padding: '4px' }}
                  onClick={() => setShowAffix(!showAffix)}
                  title="クリックで折りたたみ/展開"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>✨ アフィックス合計</span>
                    {showAffix && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <span 
                          onClick={(e) => { e.stopPropagation(); setAffixTab('percent'); }}
                          style={{ 
                            padding: '2px 8px', fontSize: '10px', borderRadius: '4px',
                            background: affixTab === 'percent' ? 'rgba(120, 80, 255, 0.25)' : 'rgba(255,255,255,0.05)',
                            color: affixTab === 'percent' ? '#d0b0ff' : '#888',
                            border: `1px solid ${affixTab === 'percent' ? 'rgba(120, 80, 255, 0.6)' : 'transparent'}`,
                            lineHeight: '1'
                          }}
                        >％表記</span>
                        <span 
                          onClick={(e) => { e.stopPropagation(); setAffixTab('value'); }}
                          style={{ 
                            padding: '2px 8px', fontSize: '10px', borderRadius: '4px',
                            background: affixTab === 'value' ? 'rgba(120, 80, 255, 0.25)' : 'rgba(255,255,255,0.05)',
                            color: affixTab === 'value' ? '#d0b0ff' : '#888',
                            border: `1px solid ${affixTab === 'value' ? 'rgba(120, 80, 255, 0.6)' : 'transparent'}`,
                            lineHeight: '1'
                          }}
                        >上昇値</span>
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '10px', color: '#666' }}>{showAffix ? '▼' : '▶'}</span>
                </div>
                {showAffix && (
                  <div className="inv-stats-grid">
                    {affixOrder.map((statType) => {
                      const statInfo = STAT_INFO[statType];
                      if (!statInfo) return null;
                      const values = summedStatsByType[statType] || { value: 0, percent: 0 };
                      
                      let displayValue = 0;
                      let hasValue = false;

                      if (affixTab === 'percent') {
                        displayValue = values.percent;
                        hasValue = displayValue !== 0;
                      } else {
                        const tBase = getBaseStat(statType);
                        displayValue = values.value + (tBase * (values.percent / 100));
                        hasValue = Math.abs(displayValue) >= 0.01 || values.value !== 0 || values.percent !== 0;
                      }

                      const formatVal = (stat: string, val: number, isPercentTab: boolean) => {
                        if (isPercentTab) return `+${Math.round(val)}%`;
                        if (stat === 'health' || stat === 'maxSp') return `+${val.toFixed(1)}`;
                        if (['moveSpeed', 'pickupRange'].includes(stat)) return `+${val.toFixed(1)}`;
                        if (['critChance', 'evasion'].includes(stat)) return `+${val.toFixed(1)}%`;
                        if (stat === 'hpRegen') return `+${val.toFixed(2)}/sec`;
                        if (stat.includes('Speed')) return `+${val.toFixed(2)}/sec`;
                        return `+${val.toFixed(1)}`;
                      };

                      return (
                        <div key={statType} className="inv-stat-row">
                          <span className="inv-stat-label">{statInfo.nameJa}</span>
                          <span className="inv-stat-value" style={{ color: hasValue ? '#64b5f6' : '#555' }}>
                            {hasValue ? formatVal(statType, displayValue, affixTab === 'percent') : '---'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                
              </div>

              {/* 右側：装備時の変化プレビュー（狭め） */}
              <div style={{ flex: '1' }}>
                <ComparePreview
                  currentStats={computedStats}
                  previewItem={previewItem}
                  equipment={equipment}
                  permanentUpgrades={permanentUpgrades}
                />
              </div>
            </div>
          </div>

          {/* 右パネル：所持品リスト + 比較プレビュー */}
          <div className="inv-items-panel">
            <div className="inv-section-title">🎒 所持品</div>

            {/* タブUI（改行禁止、1行に収める、文字中央寄せを強制） */}
            <div className="inv-tabs" style={{ display: 'flex', flexWrap: 'nowrap', gap: '2px' }}>
              {showInventoryMainAll && (
                <button style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '13px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={`inv-tab ${primaryTab === 'all' ? 'active' : ''}`} onClick={() => onPrimaryTabChange('all')}>全て</button>
              )}
              <button style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '13px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={`inv-tab ${primaryTab === 'melee' ? 'active' : ''}`} onClick={() => onPrimaryTabChange('melee')}>近接武器</button>
              <button style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '13px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={`inv-tab ${primaryTab === 'ranged' ? 'active' : ''}`} onClick={() => onPrimaryTabChange('ranged')}>遠隔武器</button>
              <button style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '13px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={`inv-tab ${primaryTab === 'magic' ? 'active' : ''}`} onClick={() => onPrimaryTabChange('magic')}>魔法武器</button>
              <button style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '13px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className={`inv-tab ${primaryTab === 'armor' ? 'active' : ''}`} onClick={() => onPrimaryTabChange('armor')}>防具</button>
            </div>

            {/* サブタブUI（改行禁止、縦幅とアイコンを拡大） */}
            {primaryTab !== 'all' && (
              <div className="inv-subtabs" style={{ display: 'flex', gap: '2px', padding: '0 14px', marginBottom: '8px', flexWrap: 'nowrap' }}>
                {SUB_TABS[primaryTab as keyof typeof SUB_TABS]
                  .filter(tab => showInventorySubAll || tab.id !== 'all')
                  .map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => onSecondaryTabChange(tab.id)}
                    title={tab.label}
                    style={{
                      flex: 1,
                      background: secondaryTab === tab.id ? 'rgba(120, 80, 255, 0.4)' : 'rgba(0,0,0,0.4)',
                      border: `1px solid ${secondaryTab === tab.id ? '#a78bfa' : '#444'}`,
                      borderRadius: '4px', 
                      padding: '6px 4px',
                      cursor: 'pointer', color: '#fff', 
                      fontSize: '18px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {tab.id === 'all' ? <span style={{fontSize: '13px', fontWeight: 'bold'}}>ALL</span> : tab.emoji}
                  </button>
                ))}
              </div>
            )}

            <div ref={scrollContainerRef} className="inv-items-scroll">
              {filteredItems.length === 0 ? (
                <div className="inv-empty">
                  {primaryTab === 'all'
                    ? 'アイテムがありません。敵を倒してドロップを拾いましょう！'
                    : '該当するアイテムがありません。'}
                </div>
              ) : (
                <div className="inv-items-grid-container">
                  {filteredItems.slice(0, inventoryDisplayLimit).map((item, idx) => (
                    <ItemCard
                      key={item.uid || idx}
                      item={item}
                      isSelected={isGamepadActive ? (idx === Math.min(selectedIndex, filteredItems.slice(0, inventoryDisplayLimit).length - 1)) : (idx === selectedIndex)}
                      onClick={() => {
                        onSelectIndex(idx);
                        onEquip(item);
                      }}
                      onMouseEnter={() => { if (!isGamepadActive) setHoveredItem(item); }}
                      onMouseLeave={() => { if (!isGamepadActive) setHoveredItem(null); }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="inv-detail-area">
              <ItemDetailPanel item={previewItem} />
            </div>

          </div>
        </div>

        {/* 操作説明 (最下部へ移動) */}
        <div className="inv-hint">
          {isGamepadActive ? (
            <div className="gp-btn-container">
              <div style={{ display: 'flex', gap: '0' }}>
                <span className="gp-btn-side">LB</span><span className="gp-btn-side">RB</span>
              </div>
              <span className="gp-label">大項目選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <div style={{ display: 'flex', gap: '0' }}>
                <span className="gp-btn-side">LT</span><span className="gp-btn-side">RT</span>
              </div>
              <span className="gp-label">小項目選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span className="gp-btn gp-btn-a">A</span>
              <span className="gp-label">装備</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span className="gp-btn gp-btn-x">X</span>
              <span className="gp-label">ソート</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>✜</span>
              <span className="gp-label">選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span className="gp-btn gp-btn-b">B</span>
              <span className="gp-label">閉じる</span>
            </div>
          ) : (
            <div className="gp-btn-container" style={{ color: '#888' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <kbd className="gp-kbd">Q</kbd><kbd className="gp-kbd">E</kbd>
              </div>
              <span className="gp-label">大項目選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <div style={{ display: 'flex', gap: '0' }}>
                <kbd className="gp-kbd">Z</kbd><kbd className="gp-kbd">C</kbd>
              </div>
              <span className="gp-label">小項目選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <kbd className="gp-kbd">L-Click</kbd>
              <span className="gp-label">装備</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <kbd className="gp-kbd">R</kbd>
              <span className="gp-label">ソート</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <div style={{ display: 'flex', gap: '0' }}>
                <kbd className="gp-kbd">←</kbd><kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd><kbd className="gp-kbd">→</kbd>
              </div>
              <span className="gp-label">選択</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <kbd className="gp-kbd">Esc</kbd>
              <span className="gp-label">閉じる</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
