export let currentCombo = 0;
export let maxCombo = 0;

export function addCombo(amount: number = 1) { 
  currentCombo += amount; 
  if (currentCombo > maxCombo) maxCombo = currentCombo;
}

export function resetCombo() { 
  currentCombo = 0; 
}

export function resetMaxCombo() {
  maxCombo = 0;
}

export function getComboBonus() {
  const ocBonusCap = window.__systemUpgrades?.overclock || 0; // +0~0.5 (最大+50%)
  const maxHitCap = 500 + Math.round(ocBonusCap * 1000); // 50% = 500 hits, 0.05=50hits
  return Math.min(maxHitCap, currentCombo) * 0.001;
}
