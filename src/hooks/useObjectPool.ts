import { useRef, useCallback, useMemo } from 'react';

/**
 * ジェネリックなオブジェクトプールフック
 * 大量のオブジェクト（敵、ドロップアイテム等）の動的な生成・破棄を削減するため
 */
export interface PoolItem<T> {
  data: T;
  active: boolean;
  id: number;
}

export function useObjectPool<T>(
  factory: () => T,
  initialSize: number = 100,
) {
  const nextIdRef = useRef(0);

  const poolRef = useRef<PoolItem<T>[]>(
    Array.from({ length: initialSize }, () => ({
      data: factory(),
      active: false,
      id: nextIdRef.current++,
    })),
  );

  /** プールからアイテムを取得（非アクティブなものを再利用、なければ拡張） */
  const acquire = useCallback((): PoolItem<T> => {
    const pool = poolRef.current;
    const item = pool.find((p) => !p.active);
    if (item) {
      item.active = true;
      return item;
    }
    // プール拡張
    const newItem: PoolItem<T> = {
      data: factory(),
      active: true,
      id: nextIdRef.current++,
    };
    pool.push(newItem);
    return newItem;
  }, [factory]);

  /** アイテムをプールに返却 */
  const release = useCallback((id: number) => {
    const item = poolRef.current.find((p) => p.id === id);
    if (item) {
      item.active = false;
    }
  }, []);

  /** 全アクティブアイテムを取得 */
  const getActive = useCallback((): PoolItem<T>[] => {
    return poolRef.current.filter((p) => p.active);
  }, []);

  /** プール全体をリセット */
  const releaseAll = useCallback(() => {
    poolRef.current.forEach((p) => (p.active = false));
  }, []);

  return useMemo(
    () => ({ acquire, release, getActive, releaseAll, poolRef }),
    [acquire, release, getActive, releaseAll],
  );
}
