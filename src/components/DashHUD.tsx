import React, { useEffect, useState } from 'react';
import { getDashStamina, getDashMaxStamina } from '../game/playerDash';

export const DashHUD: React.FC<{ isGamepadActive: boolean }> = ({ isGamepadActive }) => {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      setCooldown(getDashStamina());
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const maxStamina = getDashMaxStamina();
  // スタミナ量に基づいた表示
  const ratio = maxStamina > 0 ? Math.min(1, cooldown / maxStamina) : 1;
  const isReady = cooldown >= 25; // DASH_COST = 25

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '80px', // HpBarや経験値の上に配置
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        pointerEvents: 'none',
        zIndex: 100,
        opacity: isReady ? 0.8 : 0.5,
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: isReady ? '#4caf50' : '#888', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
        {isGamepadActive ? '[A] 回避' : '[Space] 回避'}
      </div>
      <div
        style={{
          width: '100px',
          height: '6px',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '3px',
          overflow: 'hidden',
          boxShadow: isReady ? '0 0 8px rgba(76, 175, 80, 0.4)' : 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            background: isReady ? '#4caf50' : '#ff9800',
            transition: isReady ? 'none' : 'width 0.1s linear',
          }}
        />
      </div>
    </div>
  );
};
