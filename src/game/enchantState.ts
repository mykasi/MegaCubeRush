export type EnchantType = 'none' | 'fire' | 'ice' | 'lightning';

export let currentEnchant: EnchantType = 'none';
export let currentEnchantLevel: number = 1;

export function setGlobalEnchantState(type: EnchantType, level: number) {
  currentEnchant = type;
  currentEnchantLevel = level;
}

export function getEnchantColor(enchant: EnchantType): string {
  if (enchant === 'fire') return '#FF4500'; // 強いオレンジ
  if (enchant === 'ice') return '#00FFFF';  // シアン
  if (enchant === 'lightning') return '#FFD700'; // ゴールド
  return '#ffffff';
}
