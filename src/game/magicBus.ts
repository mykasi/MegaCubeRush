type MagicEvent = 
  | { type: 'thunder'; position: [number, number, number]; damage: number; radius: number; critChance: number; critDamage: number }
  | { type: 'fire_explosion'; position: [number, number, number]; damage: number; radius: number; critChance: number; critDamage: number }
  | { type: 'ice_field'; position: [number, number, number]; duration: number; radius: number; damage: number; critChance: number; critDamage: number };

type MagicListener = (event: MagicEvent) => void;
const listeners: MagicListener[] = [];

export const onMagicEmit = (listener: MagicListener) => {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
  };
};

export const emitMagic = (event: MagicEvent) => {
  listeners.forEach(l => l(event));
};
