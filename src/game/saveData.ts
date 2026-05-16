export interface SaveData {
  totalEnergyCubes: number;
  hyperCubes: number;
  upgradeLevels: Record<string, number>;
  bgmVolume: number;
  seVolume: number;
  masterVolume: number;
  showInventoryMainAll: boolean;
  showInventorySubAll: boolean;
  inventoryDisplayLimit: number;
  singleStickModeSetting: 'manual' | 'always_on' | 'always_off';
}
const SAVE_KEY = 'mega_cube_rush_save';
export const getSaveData = (): SaveData => {
  const data = localStorage.getItem(SAVE_KEY);
  if (data) {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      bgmVolume: parsed.bgmVolume ?? 0.2,
      seVolume: parsed.seVolume ?? 0.5,
      masterVolume: parsed.masterVolume ?? 0,
      showInventoryMainAll: parsed.showInventoryMainAll ?? false,
      showInventorySubAll: parsed.showInventorySubAll ?? true,
      inventoryDisplayLimit: parsed.inventoryDisplayLimit ?? 60,
      singleStickModeSetting: parsed.singleStickModeSetting ?? 'manual'
    };
  }
  return { 
    totalEnergyCubes: 0, 
    hyperCubes: 0, 
    upgradeLevels: {},
    bgmVolume: 0.2,
    seVolume: 0.5,
    showInventoryMainAll: false,
    showInventorySubAll: true,
    inventoryDisplayLimit: 60,
    masterVolume: 0,
    singleStickModeSetting: 'manual'
  };
};
export const saveGameData = (data: SaveData) => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
};
