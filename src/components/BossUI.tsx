import { useState, useEffect, memo } from 'react';
import { subscribeBossHP, subscribeKingCoreHP, type BossHPData, type KingCoreHPData } from '../game/bossHPBus';

/**
 * 画面下部に表示される、ソウルライクな大型ボスHPバー
 */
export const BossUI = memo(function BossUI({ isPaused = false }: { isPaused?: boolean }) {
  const [data, setData] = useState<BossHPData>({
    active: false,
    name: '',
    hp: 0,
    maxHp: 0,
  });

  const [kingData, setKingData] = useState<KingCoreHPData>({
    active: false,
    cores: [],
  });

  useEffect(() => {
    // Bus からボスの状態を購読
    const unsubBoss = subscribeBossHP((newData) => {
      setData(newData);
    });
    const unsubKing = subscribeKingCoreHP((newKingData) => {
      setKingData({ ...newKingData });
    });
    return () => {
      unsubBoss();
      unsubKing();
    };
  }, []);

  // いずれかのボスがアクティブでなければ非表示
  if ((!data.active && !kingData.active) || isPaused) return null;

  const ratio = Math.max(0, Math.min(1, data.hp / data.maxHp));

  return (
    <div style={{
      position: 'fixed',
      bottom: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '600px',
      maxWidth: '80%',
      zIndex: 100,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: kingData.active ? '6px' : '0'
    }}>
      {/* キング戦専用: 3連コアHPバー */}
      {kingData.active ? (
        <>
          <div style={{
            color: 'white',
            fontSize: '22px',
            fontWeight: 'bold',
            textShadow: '0 0 10px rgba(255, 0, 0, 0.8), 2px 2px 4px black',
            fontFamily: "'GenEiLateMin', serif",
            letterSpacing: '3px',
            textAlign: 'left',
            marginBottom: '-4px'
          }}>
            FINAL DEFENSE SYSTEM : THE KING
          </div>
            {kingData.cores.map((core, idx) => {
              const ratio = core.alive ? Math.max(0, core.hp / core.maxHp) : 0;
              const labels = ['CORE α (FIRE)', 'CORE β (ICE)', 'CORE γ (THUNDER)'];
              // 属性ごとの色設定
              const colors = [
                { main: '#ff5252', dark: '#b71c1c', shadow: 'rgba(255, 82, 82, 0.5)' }, // 炎
                { main: '#00e5ff', dark: '#006064', shadow: 'rgba(0, 229, 255, 0.5)' }, // 氷
                { main: '#ffea00', dark: '#f57f17', shadow: 'rgba(255, 234, 0, 0.5)' }, // 雷
              ];
              const c = colors[idx];

              return (
                <div key={idx} style={{ width: '100%', opacity: core.alive ? 1 : 0.3, transition: 'opacity 0.5s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                    <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '11px', fontFamily: "'GenEiLateMin', serif", textShadow: '1px 1px 2px black' }}>
                      {labels[idx]}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                      {core.alive ? (
                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.9)', fontFamily: 'monospace', textShadow: '1px 1px 2px black' }}>
                          {Math.ceil(core.hp)} / {Math.ceil(core.maxHp)}
                        </div>
                      ) : (
                        <div style={{ color: '#ff1744', fontSize: '10px', fontWeight: 'bold' }}>OFFLINE</div>
                      )}
                    </div>
                  </div>
                  <div style={{
                    width: '100%', height: '10px', backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.2)', padding: '1px', borderRadius: '2px',
                    boxShadow: '0 0 15px rgba(0, 0, 0, 0.5)',
                  }}>
                    <div style={{
                      width: `${ratio * 100}%`, height: '100%',
                      background: core.alive ? `linear-gradient(90deg, ${c.dark} 0%, ${c.main} 50%, ${c.dark} 100%)` : '#333',
                      transition: 'width 0.2s ease-out',
                      boxShadow: core.alive ? `0 0 8px ${c.shadow}` : 'none',
                      borderRadius: '1px',
                    }} />
                  </div>
                </div>
              );
            })}
        </>
      ) : (
        /* 通常ボス(クイーン等): 単一HPバー */
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: '4px',
            width: '100%'
          }}>
            <div style={{
              color: 'white',
              fontSize: '22px',
              fontWeight: 'bold',
              textShadow: '0 0 10px rgba(255, 0, 0, 0.8), 2px 2px 4px black',
              fontFamily: "'GenEiLateMin', serif",
              letterSpacing: '3px',
            }}>
              {data.name}
            </div>
            <div style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.8)',
              fontFamily: 'monospace',
              textShadow: '1px 1px 2px black',
            }}>
              {Math.ceil(data.hp)} / {Math.ceil(data.maxHp)}
            </div>
          </div>
          <div style={{
            width: '100%',
            height: '12px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '2px',
            borderRadius: '2px',
            boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{
              width: `${ratio * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #b71c1c 0%, #ff5252 50%, #b71c1c 100%)',
              transition: 'width 0.1s ease-out',
              boxShadow: '0 0 8px rgba(255, 82, 82, 0.5)',
              borderRadius: '1px',
            }} />
          </div>
        </>
      )}
    </div>
  );
});
