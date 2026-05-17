import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGamepad } from '../hooks/useGamepad';
import { playSound } from '../game/soundBus';
import { RARITY_CONFIG, PREFIX_POOL, SUFFIX_POOL, BASE_ITEMS } from '../game/items/itemData';
import { Rarity, EquipSlot, StatType } from '../game/items/itemTypes';
import { getItemIcon, getItemCategoryInfo } from './InventoryUI';

interface HelpUIProps {
  isOpen: boolean;
  onClose: () => void;
  isGamepad?: boolean;
}

/** StatType の日本語ラベル */
const STAT_LABELS: Record<string, string> = {
  MeleeAttack: '近接攻撃力',
  RangedAttack: '遠隔攻撃力',
  Defense: '防御力',
  Health: '最大HP',
  Speed: '移動速度',
  CritChance: '会心率',
  CritDamage: '会心ダメージ',
  FireDamage: '火炎ダメージ',
  IceDamage: '氷結ダメージ',
  LightningDamage: '雷撃ダメージ',
  LifeSteal: '吸血',
  PickupRange: '取得範囲',
  HpRegen: '自然回復速度',
  MagicPower: '魔力',
  Evasion: 'パリィ発生率',
};

// getItemEmoji は削除し、InventoryUI の getItemIcon を使用します

const HelpUI: React.FC<HelpUIProps> = ({ isOpen, onClose, isGamepad }) => {
  const [activeTab, setActiveTab] = useState<'controls' | 'systems' | 'items' | 'elements'>('controls');
  const { poll } = useGamepad();
  const lastLB = useRef(false);
  const lastRB = useRef(false);
  const lastLT = useRef(false);
  const lastRT = useRef(false);
  const lastB = useRef(false);
  const lastDUp = useRef(false);
  const lastDDown = useRef(false);
  const lastDLeft = useRef(false);
  const lastDRight = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [controlSubTab, setControlSubTab] = useState<'game' | 'menu'>('game');
  const [elementSubTab, setElementSubTab] = useState<'enchant' | 'status'>('enchant');
  const [systemSubTab, setSystemSubTab] = useState<'action' | 'core' | 'battle' | 'stats' | 'hud'>('action');
  const [itemSubTab, setItemSubTab] = useState<'drops' | 'resources' | 'rarity' | 'affixes' | 'equip'>('drops');

  const switchTab = useCallback((dir: number) => {
    setActiveTab(prev => {
      const tabs: Array<'controls' | 'systems' | 'items' | 'elements'> = ['controls', 'systems', 'items', 'elements'];
      const currentIdx = tabs.indexOf(prev);
      const nextIdx = (currentIdx + dir + tabs.length) % tabs.length;
      return tabs[nextIdx];
    });
    playSound('ui_tab_large');
  }, []);

  const switchSubTab = useCallback((dir: number) => {
    if (activeTab === 'controls') {
      setControlSubTab(prev => (prev === 'game' ? 'menu' : 'game'));
    } else if (activeTab === 'elements') {
      setElementSubTab(prev => (prev === 'enchant' ? 'status' : 'enchant'));
    } else if (activeTab === 'systems') {
      setSystemSubTab(prev => {
        const subTabs: Array<'action' | 'core' | 'battle' | 'stats' | 'hud'> = ['action', 'core', 'battle', 'stats', 'hud'];
        const currentIdx = subTabs.indexOf(prev);
        const nextIdx = (currentIdx + dir + subTabs.length) % subTabs.length;
        return subTabs[nextIdx];
      });
    } else if (activeTab === 'items') {
      setItemSubTab(prev => {
        const subTabs: Array<'drops' | 'resources' | 'rarity' | 'affixes' | 'equip'> = ['drops', 'resources', 'rarity', 'affixes', 'equip'];
        const currentIdx = subTabs.indexOf(prev);
        const nextIdx = (currentIdx + dir + subTabs.length) % subTabs.length;
        return subTabs[nextIdx];
      });
    }
    playSound('ui_tab_large');
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;

    let frameId: number;
    const loop = () => {
      const { mainDevice } = poll();
      if (mainDevice) {
        const lb = mainDevice.buttons[4] > 0.5;
        const rb = mainDevice.buttons[5] > 0.5;
        const lt = mainDevice.buttons[6] > 0.5;
        const rt = mainDevice.buttons[7] > 0.5;
        const bBtn = mainDevice.buttons[1] > 0.5;
        const dLeft = mainDevice.buttons[14] > 0.5;
        const dRight = mainDevice.buttons[15] > 0.5;

        // Bボタンで閉じる
        if (bBtn && !lastB.current) onClose();

        if (lb && !lastLB.current) switchTab(-1);
        if (rb && !lastRB.current) switchTab(1);

        if (activeTab === 'controls' || activeTab === 'elements' || activeTab === 'systems' || activeTab === 'items') {
          if (lt && !lastLT.current) switchSubTab(-1);
          if (rt && !lastRT.current) switchSubTab(1);
          if (dLeft && !lastDLeft.current) switchSubTab(-1);
          if (dRight && !lastDRight.current) switchSubTab(1);
        }

        lastLB.current = lb;
        lastRB.current = rb;
        lastLT.current = lt;
        lastRT.current = rt;
        lastB.current = bBtn;
        lastDLeft.current = dLeft;
        lastDRight.current = dRight;

        // 右スティックでスクロール
        const rsY = mainDevice.axes[3];
        if (Math.abs(rsY) > 0.2) {
          contentRef.current?.scrollBy({ top: rsY * 15 });
        }
      }
      frameId = requestAnimationFrame(loop);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'q') switchTab(-1);
      if (key === 'e') switchTab(1);
      if (activeTab === 'controls' || activeTab === 'elements' || activeTab === 'systems' || activeTab === 'items') {
        if (key === 'z' || e.key === 'ArrowLeft') switchSubTab(-1);
        if (key === 'c' || e.key === 'ArrowRight') switchSubTab(1);
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        onClose();
        e.preventDefault();
      }
      if (e.key === 'PageUp') {
        contentRef.current?.scrollBy({ top: -200, behavior: 'smooth' });
        e.preventDefault();
      }
      if (e.key === 'PageDown') {
        contentRef.current?.scrollBy({ top: 200, behavior: 'smooth' });
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    frameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frameId);
    };
  }, [isOpen, poll, switchTab, switchSubTab]);

  if (!isOpen) return null;

  const renderControls = () => (
    <div className="help-content-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* サブタブUI */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button
          onClick={() => { setControlSubTab('game'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${controlSubTab === 'game' ? '#00e5ff' : '#444'}`,
            background: controlSubTab === 'game' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
            color: controlSubTab === 'game' ? '#00e5ff' : '#666',
            transition: 'all 0.2s',
            fontFamily: "'GenEiLateMin', serif"
          }}
        >
          🕹️ ゲーム
        </button>
        <button
          onClick={() => { setControlSubTab('menu'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${controlSubTab === 'menu' ? '#ffeb3b' : '#444'}`,
            background: controlSubTab === 'menu' ? 'rgba(255, 235, 59, 0.2)' : 'rgba(0,0,0,0.3)',
            color: controlSubTab === 'menu' ? '#ffeb3b' : '#666',
            transition: 'all 0.2s',
            fontFamily: "'GenEiLateMin', serif"
          }}
        >
          📋 メニュー
        </button>
      </div>

      {controlSubTab === 'game' && (
        <section className="help-content-fade">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* キーボード */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#00e5ff', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #00e5ff', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>キーボード</h3>
              <div className="help-row"><span>移動</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>W</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>A</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>S</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>D</kbd></div></div>
              <div className="help-row"><span>攻撃(エイム)</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>←</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>↑</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>↓</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>→</kbd></div></div>
              <div className="help-row"><span>回避</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Space</kbd></div>
              <div className="help-row"><span>バリア(ガード)</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Shift</kbd></div>
              <div className="help-row"><span>ブースト</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>E</kbd></div>
              <div className="help-row"><span>属性エンチャント</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>1</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>2</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>3</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>4</kbd></div></div>
              <div className="help-row"><span>ヒール</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Q</kbd></div>
              <div className="help-row"><span>マグネット</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>F</kbd></div>
              <div className="help-row"><span>メガクラッシュ</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>R</kbd></div>
              <div className="help-row"><span>インベントリ</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Tab</kbd></div>
              <div className="help-row"><span>ポーズ</span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Esc</kbd></div>
            </div>

            {/* ゲームパッド */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#a78bfa', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #a78bfa', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>ゲームパッド</h3>
              <div className="help-row"><span>移動</span><span className="gp-btn gp-btn-ls" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>LS</span></div>
              <div className="help-row"><span>攻撃(エイム)</span><span className="gp-btn gp-btn-rs" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>RS</span></div>
              <div className="help-row"><span>回避</span><span className="gp-btn gp-btn-a" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>A</span></div>
              <div className="help-row"><span>バリア(ガード)</span><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>RB</span></div>
              <div className="help-row"><span>ブースト</span><span className="gp-btn gp-btn-x" style={{ width: '24px', height: '24px', fontSize: '14px' }}>X</span></div>
              <div className="help-row"><span>属性エンチャント</span><div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fff' }}><span style={{ fontSize: '24px', lineHeight: 1, width: '24px', textAlign: 'center' }}>✜</span></div></div>
              <div className="help-row"><span>ヒール</span><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>LB</span></div>
              <div className="help-row"><span>マグネット</span><span className="gp-btn gp-btn-b" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>B</span></div>
              <div className="help-row"><span>メガクラッシュ</span><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>RT</span></div>
              <div className="help-row"><span>インベントリ</span><span className="gp-btn gp-btn-y" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>Y</span></div>
              <div className="help-row"><span>ポーズ</span><div style={{ display: 'flex', gap: '8px' }}><span className="gp-btn gp-btn-start" style={{ width: '24px', height: '24px', fontSize: '12px', fontFamily: 'GenEiLateMin, serif' }}>☰</span></div></div>
            </div>
          </div>

          {/* マウス */}
          <div style={{ marginTop: '24px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#39ff14', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #39ff14', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>🖱️ マウス</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <div className="help-row"><span>エイム（方向転換）</span><span style={{ color: '#aaa', fontSize: '13px' }}>カーソル移動</span></div>
                <div className="help-row"><span>回避</span><span style={{ color: '#aaa', fontSize: '13px' }}>左クリック</span></div>
                <div className="help-row"><span>バリア(ガード)</span><span style={{ color: '#aaa', fontSize: '13px' }}>右クリック</span></div>
              </div>
              <div>
                <div className="help-row"><span>メガクラッシュ</span><span style={{ color: '#aaa', fontSize: '13px' }}>中クリック</span></div>
                <div className="help-row"><span>ヒール</span><span style={{ color: '#aaa', fontSize: '13px' }}>サイドボタン1</span></div>
                <div className="help-row"><span>マグネット</span><span style={{ color: '#aaa', fontSize: '13px' }}>サイドボタン2</span></div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#666', margin: '12px 0 0 0', lineHeight: '1.4' }}>
              ※ 矢印キーまたは右スティックの入力中はマウスエイムが一時停止します
            </p>
          </div>

          {/* シンクロモード (※内部コード上は singleStickMode / isSingleStick) */}
          <div style={{ marginTop: '24px', background: 'rgba(0, 229, 255, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
            <h3 style={{ color: '#00e5ff', marginTop: 0, marginBottom: '12px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'GenEiLateMin', serif" }}>
              🕹️ シンクロモード
            </h3>
            <p style={{ fontSize: '14px', color: '#ccc', margin: '0 0 16px 0', lineHeight: '1.6' }}>
              左スティック（またはWASD）のみで移動と攻撃方向の制御を同時に行うモードです。移動した方向に自動的に攻撃を繰り出します。（移動と攻撃方向がシンクロします）
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <h4 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '14px' }}>モードの切り替え</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="help-row" style={{ padding: '4px 0' }}><span>キーボード</span><kbd className="gp-kbd" style={{ fontSize: '13px', padding: '2px 10px' }}>Ctrl</kbd></div>
                  <div className="help-row" style={{ padding: '4px 0' }}><span>ゲームパッド</span><span className="gp-btn gp-btn-rs" style={{ width: '22px', height: '22px', fontSize: '12px' }}>R3</span></div>
                </div>
              </div>
              <div>
                <h4 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '14px' }}>特殊な操作</h4>
                <p style={{ fontSize: '13px', color: '#aaa', margin: 0, lineHeight: '1.5' }}>
                  ・ONの間はインベントリのカーソル移動を<strong style={{ color: '#00e5ff' }}>右スティック</strong>でも行えます。<br />
                  ・ONの状態でも、右スティック（または矢印キー）を操作した場合はそちらへのエイムが優先されます。
                </p>
              </div>
            </div>
          </div>


        </section>
      )}

      {controlSubTab === 'menu' && (
        <section className="help-content-fade">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* キーボード */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#00e5ff', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #00e5ff', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>キーボード</h3>
              <div className="help-row"><span>選択</span><div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}><span><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>←</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>↑</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>↓</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 8px' }}>→</kbd></span></div></div>
              <div className="help-row"><span>決定</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Space</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Enter</kbd></div></div>
              <div className="help-row"><span>キャンセル</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Esc</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>BackSpace</kbd></div></div>
              <div className="help-row"><span>メインタブ切り替え</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Q</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>E</kbd></div></div>
              <div className="help-row"><span>サブタブ切り替え</span><div><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>Z</kbd><kbd className="gp-kbd" style={{ fontSize: '14px', padding: '2px 12px' }}>C</kbd></div></div>
            </div>

            {/* ゲームパッド */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#a78bfa', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #a78bfa', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>ゲームパッド</h3>
              <div className="help-row"><span>選択</span><div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fff' }}><span style={{ fontSize: '24px', lineHeight: 1, width: '24px', textAlign: 'center' }}>✜</span></div></div>
              <div className="help-row"><span>決定</span><span className="gp-btn gp-btn-a" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>A</span></div>
              <div className="help-row"><span>キャンセル</span><span className="gp-btn gp-btn-b" style={{ width: '24px', height: '24px', fontSize: '14px', fontFamily: 'GenEiLateMin, serif' }}>B</span></div>
              <div className="help-row"><span>メインタブ切り替え</span><div style={{ display: 'flex', gap: '0' }}><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>LB</span><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>RB</span></div></div>
              <div className="help-row"><span>サブタブ切り替え</span><div style={{ display: 'flex', gap: '0' }}><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>LT</span><span className="gp-btn gp-btn-side" style={{ height: '22px', minWidth: '40px', fontSize: '13px', fontFamily: 'GenEiLateMin, serif' }}>RT</span></div></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  const renderSystems = () => (
    <div className="help-content-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* サブタブUI */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button
          onClick={() => { setSystemSubTab('action'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${systemSubTab === 'action' ? '#ff6b6b' : '#444'}`,
            background: systemSubTab === 'action' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(0,0,0,0.3)',
            color: systemSubTab === 'action' ? '#ff6b6b' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          🏃 アクション
        </button>
        <button
          onClick={() => { setSystemSubTab('core'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${systemSubTab === 'core' ? '#00e5ff' : '#444'}`,
            background: systemSubTab === 'core' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
            color: systemSubTab === 'core' ? '#00e5ff' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          ⚙️ コア・システム
        </button>
        <button
          onClick={() => { setSystemSubTab('battle'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${systemSubTab === 'battle' ? '#bf7fff' : '#444'}`,
            background: systemSubTab === 'battle' ? 'rgba(191, 127, 255, 0.2)' : 'rgba(0,0,0,0.3)',
            color: systemSubTab === 'battle' ? '#bf7fff' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          ⚔️ バトル
        </button>
        <button
          onClick={() => { setSystemSubTab('stats'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${systemSubTab === 'stats' ? '#ffd700' : '#444'}`,
            background: systemSubTab === 'stats' ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0,0,0,0.3)',
            color: systemSubTab === 'stats' ? '#ffd700' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          📊 ステータス
        </button>
        <button
          onClick={() => { setSystemSubTab('hud'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${systemSubTab === 'hud' ? '#00e5ff' : '#444'}`,
            background: systemSubTab === 'hud' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
            color: systemSubTab === 'hud' ? '#00e5ff' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          📱 HUD構成
        </button>
      </div>

      {systemSubTab === 'action' && (
        <section className="help-content-fade">
          {/* アクション解説 */}
          <div style={{ marginTop: '24px', background: 'rgba(255,255,255,0.03)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#ff6b6b', marginTop: 0, marginBottom: '16px', fontSize: '18px', borderLeft: '4px solid #ff6b6b', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>⚔️ アクション解説</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* 回避 */}
              <div style={{ background: 'rgba(0,229,255,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #00e5ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>💨</span>
                  <span style={{ color: '#00e5ff', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>回避（ダッシュ）</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  <strong style={{ color: '#ffeb3b' }}>SPを25消費</strong>して移動方向（入力が無い場合は向いている方向）へ素早くダッシュします。
                  <strong style={{ color: '#00e5ff' }}>動作中(0.25秒間)は完全無敵</strong>になり、無敵中に敵や弾丸をすり抜けることで、ARゲージを少量チャージできます。
                  <br />
                  <span style={{ color: '#7fbfff' }}>● ジャスト回避：</span>敵や敵弾をギリギリまで引き付けた状態で回避すると「I-frame dodge!」と表示され発動。
                  ARゲージを大きくチャージし、周囲にプチメガクラッシュを発生させます。
                </p>
              </div>

              {/* バリア */}
              <div style={{ background: 'rgba(167,139,250,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #a78bfa' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🛡️</span>
                  <span style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>バリア（ガード）</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  トグル式の防御姿勢です。維持中はSPを継続消費し、敵弾を受けると消費が増加します。SPが尽きると自動的に解除されます。
                  解除後に<strong style={{ color: '#ffeb3b' }}>1秒間のクールタイム</strong>が発生します。
                  <br />
                  <span style={{ color: '#7fbfff' }}>● ジャストガード：</span>敵や敵弾をギリギリまで引き付けた状態でバリアを展開すると「I-frame block!」と表示され発動。
                  <strong style={{ color: '#e8b4f8' }}>OBゲージをチャージ</strong>し、周囲にプチメガクラッシュが発生します。
                </p>
              </div>

              {/* ブースト */}
              <div style={{ background: 'rgba(255,183,77,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #ffb74d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🔥</span>
                  <span style={{ color: '#ffb74d', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>ブースト</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  トグル式の強化状態です。発動中は<strong style={{ color: '#ffeb3b' }}>物理与ダメージ（近接・遠距離武器）が2.0倍</strong>になりますが、
                  リスクとして<strong style={{ color: '#ff5252' }}>被ダメージも2.0倍</strong>になります。
                  <span style={{ color: '#ff8a80', fontSize: '12px' }}>※魔法の威力は上昇しません。</span>
                  <br />
                  バリアとは同時に使用できず、片方の発動中にもう片方を使用すると自動的に切り替わります。SPを継続的に消費し、SPが尽きると自動解除されます。
                </p>
              </div>

              {/* ヒール */}
              <div style={{ background: 'rgba(76,175,80,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #4caf50' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>💖</span>
                  <span style={{ color: '#4caf50', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>ヒール</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  HPを回復します。回復量はHP再生ステータスに基づきます。
                  1ゲームあたりの<strong style={{ color: '#ffeb3b' }}>使用回数が限られて</strong>おり、回数はメタプログレッション「ヒール」のレベルに依存します。
                </p>
              </div>



              {/* マグネット */}
              <div style={{ background: 'rgba(33,150,243,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #2196f3' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🧲</span>
                  <span style={{ color: '#2196f3', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>マグネット</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  フィールド上のすべてのドロップアイテムと経験値ジェムをプレイヤーの元へ引き寄せます。
                  ヒールと同様に<strong style={{ color: '#ffeb3b' }}>使用回数が限られて</strong>おり、回数はメタプログレッション「マグネット」のレベルに依存します。
                </p>
              </div>

              {/* メガクラッシュ */}
              <div style={{ background: 'rgba(244,67,54,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #f44336' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>💥</span>
                  <span style={{ color: '#f44336', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>メガクラッシュ</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  周囲の敵全体に大ダメージを与え、<strong style={{ color: '#00e5ff' }}>すべての敵弾を消去</strong>し、一定時間無敵になります。
                  ダメージ量は近接攻撃力＋遠距離攻撃力＋魔法攻撃力の合算です。
                </p>
                <p style={{ fontSize: '13px', color: '#ff8a80', margin: '8px 0 0 0', lineHeight: '1.6', background: 'rgba(244,67,54,0.1)', padding: '8px 10px', borderRadius: '6px' }}>
                  ⚠️ 発動にはSPを<strong>50</strong>消費し、さらに<strong style={{ color: '#ff5252' }}>最大HPの基礎値が10永続減少</strong>するペナルティがあります。
                  最大HPが10以下の場合は発動できません。
                </p>
              </div>

              {/* プチメガクラッシュ */}
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '14px', borderRadius: '8px', borderLeft: '3px solid #fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>✨</span>
                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>プチメガクラッシュ</span>
                </div>
                <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                  ジャスト回避やジャストガード成功時に発生する衝撃波です。<br />
                  ・半径5.0m以内の<strong style={{ color: '#00e5ff' }}>攻撃判定（敵弾や波紋）を消去</strong>します。<br />
                  ・半径2.5m以内の敵にダメージを与え、大きく吹き飛ばします。<br />
                  ・基本威力は<strong style={{ color: '#ffeb3b' }}>(近接攻撃力＋遠隔攻撃力)/2</strong>です。
                </p>
              </div>

            </div>
          </div>
        </section>
      )}

      {systemSubTab === 'core' && (
        <section className="help-content-fade">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="help-system-item" style={{ borderLeftColor: '#7fbfff' }}>
              <div className="help-system-title"><span style={{ color: '#7fbfff' }}>OB</span> (Obscurity) - ガードバフ</div>
              <p className="help-system-desc">
                ・概要: 盾による防御（ジャストガード）で蓄積される攻撃バフ。<br />
                ・発動条件: 敵や敵弾をギリギリまで引き付けた状態でバリアを展開する「ジャストガード」成功で100%蓄積。<br />
                ・効果: ゲージ量に応じて攻撃力が最大+50%上昇。<br />
                ・減衰: 防御していない間、秒間20%（5秒で消失）の速度で減少。
              </p>
            </div>
            <div className="help-system-item" style={{ borderLeftColor: '#bf7fff' }}>
              <div className="help-system-title"><span style={{ color: '#bf7fff' }}>AR</span> (Adrenaline Rush) - 回避バフ</div>
              <p className="help-system-desc">
                ・概要: 敵の攻撃を紙一重で回避することで発動する会心バフ。<br />
                ・発動条件: 「ジャスト回避」の成功、回避アクション中の「すり抜け」、または「パリィ」の発生により蓄積。<br />
                ・効果: 一定時間、会心率が+50%加算。<br />
                ・減衰: 一定時間（基本5秒）経過で消失。回避中はタイマーの減少が停止。
              </p>
            </div>
            <div className="help-system-item" style={{ borderLeftColor: '#ffd700' }}>
              <div className="help-system-title"><span style={{ color: '#ffd700' }}>Parry</span> (パリィ) - 特殊リカバー</div>
              <p className="help-system-desc">
                ・概要: 敵との接触時に確率で発生する完全回避。<br />
                ・効果: 発生時にダメージを無効化し、さらに**OBゲージとARゲージの両方が上昇**します。<br />
                ・補足: ステータスの「パリィ発生率」を上げることで発動率が高まります。
              </p>
            </div>
          </div>
        </section>
      )}

      {systemSubTab === 'battle' && (
        <section className="help-content-fade">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="help-system-item" style={{ borderLeftColor: '#39ff14' }}>
              <div className="help-system-title"><span style={{ color: '#39ff14' }}>Combo</span> (Overclock) - チェインボーナス</div>
              <p className="help-system-desc">
                ・概要: 攻撃を当て続けることで上昇する攻撃回数バフ。<br />
                ・効果: チェイン数に応じて攻撃回数が最大+50%上昇（500 CHAINで最大）。<br />
                ・減衰: 被弾すると即座にリセット。
              </p>
            </div>
            <div className="help-system-item" style={{ borderLeftColor: '#ff5252' }}>
              <div className="help-system-title"><span style={{ color: '#ff5252' }}>Mega Crush</span> (メガクラッシュ)</div>
              <p className="help-system-desc">
                ・概要: SPを消費して周囲の敵と弾丸を吹き飛ばす緊急回避手段。<br />
                ・効果: 半径7.5m以内の敵にダメージ＋ノックバック。範囲内の敵弾を消去。<br />
                ・コスト: 使用時に50 SPを消費し、さらに最大HPが10減少。
              </p>
            </div>
          </div>
        </section>
      )}

      {systemSubTab === 'stats' && renderStats()}

      {systemSubTab === 'hud' && (
        <section className="help-content-fade">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="help-system-item" style={{ borderLeftColor: '#39ff14' }}>
              <div className="help-system-title">画面最上部：進行・警告</div>
              <p className="help-system-desc">
                ・EXPバー：現在のレベルと経験値を表示します。レベルが上がると、より強力な高レベル装備がドロップするようになり、それらを装備するための条件も満たされます（自身のレベルを超える装備は装着できません）。<br />
                ・タイマー：現在のプレイ時間を表示します。<br />
                ・警告メッセージ：次WAVE接近などの通知をリアルタイムで行います。
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="help-system-item" style={{ borderLeftColor: '#ff5252' }}>
                <div className="help-system-title">画面左上：自己ステータス・バフ</div>
                <p className="help-system-desc">
                  ・HP：体力。残量でバーの色が変化します。<br />
                  ・SP：回避、バリア、メガクラッシュに使用するエネルギーです。<br />
                  ・OB：ガードバフ。盾での防御成功により蓄積されます。<br />
                  ・AR：回避バフ。紙一重の回避成功により発動します。<br />
                  ・リワードアイコン：現在取得しているスキルの一覧です。
                </p>
              </div>
              <div className="help-system-item" style={{ borderLeftColor: '#ffd700' }}>
                <div className="help-system-title">画面右上：リワード目標・コンボ</div>
                <p className="help-system-desc">
                  ・WAVE：現在の階層（ステージ数）です。<br />
                  ・E.CUBE：このランで獲得したエナジーキューブ（通貨）の量です。<br />
                  ・KILLS：次のリワード獲得までに必要な撃破数の進捗です。<br />
                  ・CHAIN：連続ヒット数。攻撃回数と敵の出現速度（稼ぎ効率）が上昇します。
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="help-system-item" style={{ borderLeftColor: '#a78bfa' }}>
                <div className="help-system-title">画面左下：能力・リソース</div>
                <p className="help-system-desc">
                  ・スキル：回復・磁力・復活などの残り使用回数です。<br />
                  ・属性：武器に付与されている魔法属性（炎・氷・雷）の状態です。<br />
                  ・ステータス：攻撃力や防御力などの最終的なパラメータ数値です。
                </p>
              </div>
              <div className="help-system-item" style={{ borderLeftColor: '#00e5ff' }}>
                <div className="help-system-title">画面右下：システムログ</div>
                <p className="help-system-desc">
                  ・取得ログ：拾ったアイテムのレアリティと名称を表示します。<br />
                  ・自動装備：未装備のスロットにアイテムを取得した際、自動装着の履歴を表示します。
                </p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  const renderStats = () => (
    <div className="help-content-fade">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[
          { label: '最大HP', desc: 'プレイヤーの生命力。0になるとゲームオーバーです。' },
          { label: '最大SP', desc: '回避やバリア（防御）、属性エンチャント、メガクラッシュに使用するエネルギーの最大値。' },
          { label: '近接攻撃力', desc: '近接武器による直接攻撃の威力。' },
          { label: '近接攻撃回数', desc: '近接攻撃を行う頻度（1秒あたりの回数）。' },
          { label: '遠隔攻撃力', desc: '遠距離武器の威力。' },
          { label: '遠隔攻撃回数', desc: '遠距離攻撃を行う頻度（1秒あたりの回数）。' },
          { label: '魔力', desc: '自動発動する魔法（火球・雷撃・氷結）の威力。' },
          { label: '会心率', desc: '攻撃が強力な「会心（クリティカル）」になる確率。' },
          { label: '防御力', desc: '受けるダメージを一定量軽減します。' },
          { label: 'パリィ発生率', desc: '敵との接触時にダメージを無効化する確率。' },
          { label: '移動速度', desc: 'プレイヤーの歩行・回避の速さ。' },
          { label: '取得範囲', desc: 'アイテムや経験値ジェムを引き寄せる半径。' },
          { label: '自然回復速度', desc: '1秒あたりのHP自動回復量。' },
        ].map((item, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ color: '#00e5ff', fontWeight: 'bold', marginBottom: '8px', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>{item.label}</div>
            <p style={{ fontSize: '13px', color: '#ccc', margin: 0, lineHeight: '1.5' }}>{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const renderItems = () => {
    // ステータス名の日本語マッピング
    const statNameJa: Record<string, string> = {
      MeleeAttack: '近接攻撃力',
      RangedAttack: '遠隔攻撃力',
      Defense: '防御力',
      Health: '最大HP',
      Speed: '移動速度',
      CritChance: '会心率',
      CritDamage: '会心ダメージ',
      FireDamage: '炎ダメージ',
      IceDamage: '氷ダメージ',
      LightningDamage: '雷ダメージ',
      LifeSteal: 'HP吸収',
      PickupRange: '取得範囲',
      HpRegen: '自然回復速度',
      MagicPower: '魔力',
      Evasion: 'パリィ発生率',
    };

    // ドロップ率の計算
    const rarities = Object.values(Rarity) as Rarity[];
    const totalWeight = rarities.reduce((sum, r) => sum + RARITY_CONFIG[r].dropWeight, 0);

    return (
      <div className="help-content-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* サブタブUI */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <button
            onClick={() => { setItemSubTab('drops'); playSound('ui_tab_large'); }}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${itemSubTab === 'drops' ? '#00e5ff' : '#444'}`,
              background: itemSubTab === 'drops' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
              color: itemSubTab === 'drops' ? '#00e5ff' : '#666',
              transition: 'all 0.2s',
              fontFamily: 'GenEiLateMin, serif'
            }}
          >
            📦 ドロップ
          </button>
          <button
            onClick={() => { setItemSubTab('resources'); playSound('ui_tab_large'); }}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${itemSubTab === 'resources' ? '#d500f9' : '#444'}`,
              background: itemSubTab === 'resources' ? 'rgba(213, 0, 249, 0.2)' : 'rgba(0,0,0,0.3)',
              color: itemSubTab === 'resources' ? '#d500f9' : '#666',
              transition: 'all 0.2s',
              fontFamily: 'GenEiLateMin, serif'
            }}
          >
            💎 リソース
          </button>
          <button
            onClick={() => { setItemSubTab('rarity'); playSound('ui_tab_large'); }}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${itemSubTab === 'rarity' ? '#ffd700' : '#444'}`,
              background: itemSubTab === 'rarity' ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0,0,0,0.3)',
              color: itemSubTab === 'rarity' ? '#ffd700' : '#666',
              transition: 'all 0.2s',
              fontFamily: 'GenEiLateMin, serif'
            }}
          >
            ⭐ レアリティ
          </button>
          <button
            onClick={() => { setItemSubTab('affixes'); playSound('ui_tab_large'); }}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${itemSubTab === 'affixes' ? '#4caf50' : '#444'}`,
              background: itemSubTab === 'affixes' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0,0,0,0.3)',
              color: itemSubTab === 'affixes' ? '#4caf50' : '#666',
              transition: 'all 0.2s',
              fontFamily: 'GenEiLateMin, serif'
            }}
          >
            🔧 アフィックス
          </button>
          <button
            onClick={() => { setItemSubTab('equip'); playSound('ui_tab_large'); }}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${itemSubTab === 'equip' ? '#ff9800' : '#444'}`,
              background: itemSubTab === 'equip' ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0,0,0,0.3)',
              color: itemSubTab === 'equip' ? '#ff9800' : '#666',
              transition: 'all 0.2s',
              fontFamily: 'GenEiLateMin, serif'
            }}
          >
            ⚔️ 装備
          </button>
        </div>

        {itemSubTab === 'drops' && (
          <section className="help-content-fade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="help-system-item" style={{ borderLeftColor: '#00bcd4' }}>
                <div className="help-system-title">💠 <span style={{ color: '#00bcd4' }}>EXPキューブ</span></div>
                <p className="help-system-desc">
                  ・形状: 水色に発光する菱形の結晶。<br />
                  ・効果: 取得するとプレイヤーの経験値が増加し、レベルアップに貢献します。<br />
                  ・入手: 敵を撃破すると出現。プレイヤーの「取得範囲」内に入ると自動で吸引・回収されます。<br />
                  ・補足: レベルが上がると、より高レベルの装備がドロップするようになります。
                </p>
              </div>
              <div className="help-system-item" style={{ borderLeftColor: '#94a3b8' }}>
                <div className="help-system-title">📦 <span style={{ color: '#fff' }}>アイテムキューブ</span></div>
                <p className="help-system-desc">
                  ・形状: レアリティに応じた色で発光するキューブ。<br />
                  ・効果: 取得するとインベントリに格納され、装備することでステータスが変化します。<br />
                  ・入手: 敵撃破時に一定確率でドロップ。プレイヤーの「取得範囲」内に入ると自動回収されます。<br />
                  ・自動装備: 対応するスロットが装備なしの場合、取得した装備は自動的に装着されます。<br />
                  ・補足: 画面外にあるマジック以上のレアリティのアイテムはインジケーター（▲）で方向が示され、ミシック以上のレアリティのアイテムには光の柱が出現します。
                </p>
              </div>
            </div>
          </section>
        )}

        {itemSubTab === 'resources' && (
          <section className="help-content-fade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="help-system-item" style={{ borderLeftColor: '#00e5ff' }}>
                <div className="help-system-title">💎 <span style={{ color: '#00e5ff' }}>E.CUBE</span> (エナジーキューブ)</div>
                <p className="help-system-desc">
                  ・概要: メタプログレッション（永続強化）に使用する基本通貨。<br />
                  ・入手: ゲーム中に装備アイテムを取得すると、レアリティに応じた量が自動的に蓄積されます。<br />
                  ・用途: タイトル画面の「Meta Progression」メニューで、各種ステータスの永続的な底上げに使用します。
                </p>
              </div>
              <div className="help-system-item" style={{ borderLeftColor: '#d500f9' }}>
                <div className="help-system-title">⚛️ <span style={{ color: '#d500f9' }}>H.CUBE</span> (ハイパーキューブ)</div>
                <p className="help-system-desc">
                  ・概要: 高度な永続強化に使用する貴重なリソース。<br />
                  ・入手: 特定の条件を満たすことで獲得できます。<br />
                  ・用途: エナジーキューブでは購入できない、上位の強化項目（オーバードライブ等）に使用します。
                </p>
              </div>
            </div>
          </section>
        )}

        {itemSubTab === 'rarity' && (
          <section className="help-content-fade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: '14px', color: '#aaa', margin: '0 0 16px 0', lineHeight: '1.6' }}>
                  装備アイテムにはレアリティ（希少度）があり、高いほど多くのアフィックス（追加効果）が付与されます。<br />
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    ※接頭辞・接尾辞はそれぞれ最大4枠（合計で最大8枠）まで付与されます。<br />
                    ※ドロップLvは、取得時のプレイヤーレベルに加算されるレベル補正値です。
                  </span>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* ヘッダー行 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 140px 90px 1fr', gap: '8px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '4px' }}>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold' }}>レアリティ</span>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>ドロップLv</span>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>アフィックス</span>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>E.CUBE</span>
                    <span style={{ color: '#888', fontSize: '12px', fontWeight: 'bold', textAlign: 'right' }}>ドロップ率</span>
                  </div>
                  {rarities.map((r) => {
                    const config = RARITY_CONFIG[r];
                    const dropPercent = ((config.dropWeight / totalWeight) * 100).toFixed(3);
                    const cubeRates: Record<string, number> = {
                      [Rarity.Common]: 1, [Rarity.Uncommon]: 3, [Rarity.Magic]: 9, [Rarity.Rare]: 27,
                      [Rarity.Epic]: 81, [Rarity.Legendary]: 243, [Rarity.Mythic]: 729, [Rarity.Immortal]: 2187, [Rarity.Celestial]: 6561
                    };
                    const cubeBase = cubeRates[r] || 0;

                    // ドロップLv補正の取得
                    const dropLvOffsets: Record<string, string> = {
                      [Rarity.Common]: '+0', [Rarity.Uncommon]: '+0~1', [Rarity.Magic]: '+0~2', [Rarity.Rare]: '+0~3',
                      [Rarity.Epic]: '+0~4', [Rarity.Legendary]: '+0~5', [Rarity.Mythic]: '+0~6', [Rarity.Immortal]: '+0~7', [Rarity.Celestial]: '+0~8'
                    };
                    const dropLv = dropLvOffsets[r] || '+0';

                    // アフィックスの内訳パターンの生成
                    const total = config.totalAffixCount;
                    let affixDisplay = `${total}`;

                    if (total > 0) {
                      const maxPrefix = Math.min(4, total);
                      const minPrefix = Math.max(0, total - 4);
                      const maxSuffix = Math.min(4, total);
                      const minSuffix = Math.max(0, total - 4);

                      if (total === 8) {
                        affixDisplay = `8 (4 + 4)`;
                      } else if (total === 1) {
                        affixDisplay = `1 (1+0 / 0+1)`;
                      } else {
                        // 例: 5 (4+1 ～ 1+4)
                        affixDisplay = `${total} (${maxPrefix}+${minSuffix} ～ ${minPrefix}+${maxSuffix})`;
                      }
                    }

                    return (
                      <div key={r} style={{ display: 'grid', gridTemplateColumns: '120px 80px 140px 90px 1fr', gap: '8px', padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' }}>
                        <span style={{ color: config.color, fontWeight: 'bold', fontSize: '14px', fontFamily: 'GenEiLateMin, serif', display: 'flex', alignItems: 'center' }}>
                          {config.nameJa}
                        </span>
                        <span style={{ color: '#ccc', fontSize: '12px', fontFamily: 'Consolas, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {dropLv}
                        </span>
                        <span style={{ color: '#ccc', fontSize: '11px', fontFamily: 'Consolas, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>
                          {affixDisplay}
                        </span>
                        <span style={{ color: '#00e5ff', fontSize: '13px', fontFamily: 'Consolas, monospace', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {cubeBase} ×Lv
                        </span>
                        <span style={{ color: '#aaa', fontSize: '14px', fontFamily: 'Consolas, monospace', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {dropPercent}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {itemSubTab === 'affixes' && (
          <section className="help-content-fade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: '14px', color: '#aaa', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                  アフィックスとは、装備に付与される追加効果です。<strong style={{ color: '#fff' }}>接頭辞（Prefix）</strong>と<strong style={{ color: '#fff' }}>接尾辞（Suffix）</strong>の2種類があり、レアリティが高いほど多くのアフィックスが付与されます。各アフィックスの効果値は+1%〜+25%の範囲でランダムに決定されます。
                </p>
              </div>

              {/* 接頭辞 */}
              <div>
                <h4 style={{ color: '#00e5ff', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #00e5ff', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>接頭辞 (Prefix)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {PREFIX_POOL.map((affix) => (
                    <div key={affix.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontFamily: "'GenEiLateMin', serif" }}>{affix.nameJa}</span>
                      <span style={{ color: '#888', fontSize: '12px' }}>{affix.modifiers.map(m => STAT_LABELS[m.stat] || m.stat).join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 接尾辞 */}
              <div>
                <h4 style={{ color: '#ffd700', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #ffd700', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>接尾辞 (Suffix)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {SUFFIX_POOL.map((affix) => (
                    <div key={affix.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 14px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontFamily: "'GenEiLateMin', serif" }}>{affix.nameJa}</span>
                      <span style={{ color: '#888', fontSize: '12px' }}>{affix.modifiers.map(m => STAT_LABELS[m.stat] || m.stat).join(', ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {itemSubTab === 'equip' && (
          <section className="help-content-fade">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <p style={{ fontSize: '14px', color: '#aaa', margin: 0, lineHeight: '1.6' }}>
                  <strong style={{ color: '#00e5ff' }}>貫通減衰率について</strong><br />
                  近接武器と一部の遠隔武器には「貫通減衰率」が設定されており、1回の攻撃で多数の敵を攻撃すると威力が徐々に低下していきます。近接武器による攻撃はヒット数に上限は無く威力も10%未満になることはありませんが、遠隔武器による攻撃は威力が0%になると消失します。
                </p>
                <p style={{ fontSize: '14px', color: '#aaa', margin: '12px 0 0 0', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', lineHeight: '1.6' }}>
                  <strong style={{ color: '#00e5ff' }}>移動速度係数について</strong><br />
                  武器の重量や負荷を表す指標です。値が小さいほど移動速度が低下します。近接・遠隔の両方に武器を装備している場合はそれぞれの係数が乗算されます。
                </p>
              </div>
              {/* 近接武器 */}
              <div>
                <h4 style={{ color: '#ff5252', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #ff5252', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>近接武器 (Melee Weapon)</h4>
                <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                  方向キーで狙った方向に近距離攻撃を繰り出します。近接攻撃力が上昇し、武器ごとに攻撃範囲・速度・貫通減衰率が異なります。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {BASE_ITEMS.filter(item => item.slot === EquipSlot.MeleeWeapon && !item.baseStats.some(s => s.stat === StatType.MagicPower)).map(item => {
                    const slotInfo = getItemIcon(item);
                    const catInfo = getItemCategoryInfo(item);

                    return (
                      <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', borderLeft: '4px solid #ff5252' }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '24px' }}>{slotInfo.emoji}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>{item.nameJa}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span style={{ color: '#888', fontSize: '12px' }}>攻撃間隔 {item.attackInterval}秒</span>
                            <span style={{ color: '#888', fontSize: '12px' }}>
                              {item.pierceDecay ? `貫通減衰率 ${(item.pierceDecay * 100).toFixed(1)}%` : '貫通減衰なし'}
                            </span>
                            <span style={{ color: '#888', fontSize: '12px' }}>移動速度係数 {item.moveSpeedMultiplier ? item.moveSpeedMultiplier.toFixed(2) : '1.00'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 遠隔武器 */}
              <div>
                <h4 style={{ color: '#42a5f5', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #42a5f5', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>遠隔武器 (Ranged Weapon)</h4>
                <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                  方向キーで狙った方向に遠距離攻撃を繰り出します。遠隔攻撃力が上昇し、武器ごとに弾速・弾数・最大ヒット数などが異なります。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {BASE_ITEMS.filter(item => item.slot === EquipSlot.RangedWeapon && !item.baseStats.some(s => s.stat === StatType.MagicPower)).map(item => {
                    const slotInfo = getItemIcon(item);
                    const catInfo = getItemCategoryInfo(item);
                    const maxHits = item.pierceDecay ? Math.floor(0.99 / item.pierceDecay) + 1 : (item.pierceCount || 1);
                    const hitInfo = maxHits >= 999 ? '貫通無限' : `最大${maxHits}ヒット`;

                    return (
                      <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', borderLeft: '4px solid #42a5f5' }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '24px' }}>{slotInfo.emoji}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>{item.nameJa}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span style={{ color: '#888', fontSize: '12px' }}>攻撃間隔 {item.attackInterval}秒 / {item.projectileCount}発</span>
                            {item.nameJa === 'グレネードランチャー' ? (
                              <>
                                <span style={{ color: '#888', fontSize: '12px' }}>貫通減衰率 {(item.pierceDecay! * 100).toFixed(1)}%</span>
                                <span style={{ color: '#888', fontSize: '12px' }}>{hitInfo}</span>
                              </>
                            ) : (
                              <span style={{ color: '#888', fontSize: '12px' }}>
                                {item.pierceDecay ? `貫通減衰率 ${(item.pierceDecay * 100).toFixed(1)}%` : '貫通減衰なし'} / {hitInfo}
                              </span>
                            )}
                            <span style={{ color: '#888', fontSize: '12px' }}>移動速度係数 {item.moveSpeedMultiplier ? item.moveSpeedMultiplier.toFixed(2) : '1.00'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 魔法武器 */}
              <div>
                <h4 style={{ color: '#ab47bc', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #ab47bc', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>魔法武器 (Magic Weapon)</h4>
                <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                  魔力を帯びた武器です。武器種（近接・遠隔）によって、近接攻撃力と魔力、または遠隔攻撃力と魔力が上昇します。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {BASE_ITEMS.filter(item => item.baseStats.some(s => s.stat === StatType.MagicPower)).map(item => {
                    const slotInfo = getItemIcon(item);
                    const catInfo = getItemCategoryInfo(item);
                    const maxHits = item.pierceDecay ? Math.floor(0.99 / item.pierceDecay) + 1 : (item.pierceCount || 1);
                    const hitInfo = maxHits >= 999 ? '貫通無限' : `最大${maxHits}ヒット`;
                    const isMeleeStyle = item.slot === EquipSlot.MeleeWeapon;
                    const borderColor = isMeleeStyle ? '#ff5252' : '#42a5f5';

                    return (
                      <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', borderLeft: `4px solid ${borderColor}` }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '24px' }}>{slotInfo.emoji}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ color: '#fff', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>{item.nameJa}</span>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span style={{ color: '#888', fontSize: '12px' }}>攻撃間隔 {item.attackInterval}秒{!isMeleeStyle && item.projectileCount ? ` / ${item.projectileCount}発` : ''}</span>
                            <span style={{ color: '#888', fontSize: '12px' }}>
                              {item.pierceDecay ? `貫通減衰率 ${(item.pierceDecay * 100).toFixed(1)}%` : '貫通減衰なし'}{item.pierceCount !== undefined ? ` / ${hitInfo}` : ''}
                            </span>
                            <span style={{ color: '#888', fontSize: '12px' }}>移動速度係数 {item.moveSpeedMultiplier ? item.moveSpeedMultiplier.toFixed(2) : '1.00'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 防具・装飾品 */}
              <div>
                <h4 style={{ color: '#66bb6a', margin: '0 0 12px 0', fontSize: '16px', borderLeft: '4px solid #66bb6a', paddingLeft: '12px', fontFamily: "'GenEiLateMin', serif" }}>防具・装飾品 (Armor & Accessory)</h4>
                <p style={{ fontSize: '13px', color: '#aaa', margin: '0 0 12px 0', lineHeight: '1.6' }}>
                  防御・体力・移動速度や自然回復などのステータスを強化する装備です。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {BASE_ITEMS.filter(item => ([EquipSlot.Shield, EquipSlot.Armor, EquipSlot.Helmet, EquipSlot.Boots, EquipSlot.Ring, EquipSlot.Amulet] as EquipSlot[]).includes(item.slot)).map(item => {
                    const slotInfo = getItemIcon(item);
                    return (
                      <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '60px', borderLeft: '4px solid #66bb6a' }}>
                        <div style={{ position: 'relative', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: '24px' }}>{slotInfo.emoji}</span>
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#fff', fontSize: '15px', fontFamily: "'GenEiLateMin', serif" }}>{item.nameJa}</span>
                          <span style={{ color: '#888', fontSize: '12px' }}>
                            {item.baseStats.map(s => STAT_LABELS[s.stat] || s.stat).join(', ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderElements = () => (
    <div className="help-content-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* サブタブUI */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <button
          onClick={() => { setElementSubTab('enchant'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${elementSubTab === 'enchant' ? '#00e5ff' : '#444'}`,
            background: elementSubTab === 'enchant' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
            color: elementSubTab === 'enchant' ? '#00e5ff' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          ✨ 属性エンチャント
        </button>
        <button
          onClick={() => { setElementSubTab('status'); playSound('ui_tab_large'); }}
          style={{
            flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
            border: `2px solid ${elementSubTab === 'status' ? '#ffeb3b' : '#444'}`,
            background: elementSubTab === 'status' ? 'rgba(255, 235, 59, 0.2)' : 'rgba(0,0,0,0.3)',
            color: elementSubTab === 'status' ? '#ffeb3b' : '#666',
            transition: 'all 0.2s',
            fontFamily: 'GenEiLateMin, serif'
          }}
        >
          💥 属性やられ
        </button>
      </div>

      {elementSubTab === 'enchant' && (
        <section className="help-content-fade">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="help-element-item" style={{ borderColor: '#aaa' }}>
              <div className="help-element-title"><span style={{ color: '#aaa' }}>⚪ 無属性</span> (NONE)</div>
              <p className="help-system-desc">特殊なデバフ効果はありませんが、物理ダメージが減衰せず100%の威力で攻撃できます。安定したダメージを与えたい場合に有効です。</p>
            </div>
            <div className="help-element-item" style={{ borderColor: '#ff4500' }}>
              <div className="help-element-title"><span style={{ color: '#ff4500' }}>🔥 炎属性</span> (FIRE)</div>
              <p className="help-system-desc">敵に一定時間「燃焼」状態を付与します。物理ダメージは若干低下しますが、敵のHPを継続的に削り取ることができます。</p>
            </div>
            <div className="help-element-item" style={{ borderColor: '#00e5ff' }}>
              <div className="help-element-title"><span style={{ color: '#00e5ff' }}>❄️ 氷属性</span> (ICE)</div>
              <p className="help-system-desc">敵に一定時間「凍結」状態を付与します。敵の移動速度を低下させ、接近されるリスクを抑えることができます。</p>
            </div>
            <div className="help-element-item" style={{ borderColor: '#ffd700' }}>
              <div className="help-element-title"><span style={{ color: '#ffd700' }}>⚡ 雷属性</span> (LIGHTNING)</div>
              <p className="help-system-desc">敵に一定時間「感電」状態を付与します。敵の攻撃頻度（攻撃タイマー）と、発射される弾の速度を低下させます。</p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', marginTop: '10px' }}>
              <h4 style={{ color: '#00e5ff', margin: '0 0 12px 0', fontFamily: 'GenEiLateMin, serif' }}>属性の付与方法</h4>
              <p style={{ fontSize: '14px', color: '#ccc', margin: 0, lineHeight: '1.6' }}>
                各属性のエンチャント報酬（炎・氷・雷）を取得すると、対応するボタンでいつでも武器属性を切り替えられます。発動には**SPを100消費**しますが、**無属性に戻す際はSPを消費しません**。<br />
                <br />
                - **キーボード**: [1]炎 [2]氷 [3]雷 [4]無<br />
                - **ゲームパッド**: [✜左]炎 [✜上]氷 [✜右]雷 [✜下]無
              </p>
            </div>
          </div>
        </section>
      )}

      {elementSubTab === 'status' && (
        <section className="help-content-fade">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="help-system-item" style={{ borderLeftColor: '#ff4500' }}>
              <div className="help-system-title"><span style={{ color: '#ff4500' }}>燃焼</span> (BURN)</div>
              <p className="help-system-desc">
                ・スリップダメージ: 1秒ごとに3ダメージを受け続けます（無敵時間を無視）。<br />
                ・被ダメージ増加: 敵から受ける通常ダメージが**2倍**になります。
              </p>
            </div>
            <div className="help-system-item" style={{ borderLeftColor: '#00e5ff' }}>
              <div className="help-system-title"><span style={{ color: '#00e5ff' }}>凍結</span> (FREEZE)</div>
              <p className="help-system-desc">
                ・機動力低下: 移動速度が**約33%低下**します。
              </p>
            </div>
            <div className="help-system-item" style={{ borderLeftColor: '#ffd700' }}>
              <div className="help-system-title"><span style={{ color: '#ffd700' }}>感電</span> (SHOCK)</div>
              <p className="help-system-desc">
                ・攻撃速度低下: 武器の攻撃間隔が**1.5倍**に増加し、手数が大幅に減ります。<br />
                ・集中力低下: クリティカル率が**約33%低下**します。
              </p>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>※これらのデバフは時間経過（約8秒）で解除されます。</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: "'Inter', sans-serif"
      }}
    >
      <div
        className="menu-anim"
        style={{
          width: '800px', maxHeight: '90vh', background: 'rgba(20,20,25,0.95)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
          boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 20px rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}
      >
        {/* ヘッダー */}
        <div style={{ padding: '32px 40px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '4px', height: '32px', background: '#00e5ff', borderRadius: '2px', boxShadow: '0 0 10px #00e5ff' }} />
            <h2 className="zen-dots" style={{ margin: 0, fontSize: '32px', letterSpacing: '4px', fontWeight: 'bold' }}>Help & Tips</h2>
          </div>
          <button
            onClick={onClose}
            className="help-close-btn"
            style={{
              background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
              width: '40px', height: '40px', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
              transition: 'all 0.2s'
            }}
          >
            ✕
          </button>
        </div>

        {/* タブナビゲーション */}
        <div style={{ display: 'flex', padding: '0 40px', background: 'rgba(255,255,255,0.02)', alignItems: 'center' }}>
          <div style={{ display: 'flex', flex: 1 }}>
            <button onClick={() => { setActiveTab('controls'); playSound('ui_tab_large'); }} className={`help-tab ${activeTab === 'controls' ? 'active' : ''}`}>操作方法</button>
            <button onClick={() => { setActiveTab('systems'); playSound('ui_tab_large'); }} className={`help-tab ${activeTab === 'systems' ? 'active' : ''}`}>システム</button>
            <button onClick={() => { setActiveTab('items'); playSound('ui_tab_large'); }} className={`help-tab ${activeTab === 'items' ? 'active' : ''}`}>アイテム</button>
            <button onClick={() => { setActiveTab('elements'); playSound('ui_tab_large'); }} className={`help-tab ${activeTab === 'elements' ? 'active' : ''}`}>属性</button>
          </div>
        </div>

        {/* コンテンツエリア */}
        <div
          ref={contentRef}
          style={{ padding: '32px 40px', flex: 1, overflowY: 'auto', minHeight: '400px' }}
        >
          {activeTab === 'controls' && renderControls()}
          {activeTab === 'systems' && renderSystems()}
          {activeTab === 'items' && renderItems()}
          {activeTab === 'elements' && renderElements()}
        </div>

        {/* フッター (操作ガイド) */}
        <div style={{ padding: '20px 40px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', gap: '32px' }}>
          {/* 操作ガイド */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#888', fontSize: '14px' }}>
            {isGamepad ? (
              <div className="gp-btn-container" style={{ fontFamily: 'GenEiLateMin, serif' }}>
                <div style={{ display: 'flex', gap: '0' }}>
                  <span className="gp-btn gp-btn-side">LB</span><span className="gp-btn gp-btn-side">RB</span>
                </div>
                <span className="gp-label">メインタブ切り替え</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <div style={{ display: 'flex', gap: '0', alignItems: 'center' }}>
                  <span className="gp-btn gp-btn-side">LT</span><span className="gp-btn gp-btn-side">RT</span>
                  <span style={{ fontSize: '18px', verticalAlign: 'middle', marginLeft: '2px' }}>✜</span>
                </div>
                <span className="gp-label">サブタブ切り替え</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <span className="gp-btn gp-btn-rs" style={{ width: '18px', height: '18px', fontSize: '10px' }}>RS</span>
                <span className="gp-label">スクロール</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <span className="gp-btn gp-btn-b">B</span>
                <span className="gp-label">閉じる</span>
              </div>
            ) : (
              <div className="gp-btn-container" style={{ fontFamily: 'GenEiLateMin, serif' }}>
                <div style={{ display: 'flex', gap: '0' }}>
                  <kbd className="gp-kbd">Q</kbd><kbd className="gp-kbd">E</kbd>
                </div>
                <span className="gp-label">メインタブ切り替え</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <div style={{ display: 'flex', gap: '0' }}>
                  <kbd className="gp-kbd">Z</kbd><kbd className="gp-kbd">C</kbd>
                  <kbd className="gp-kbd">←</kbd><kbd className="gp-kbd">→</kbd>
                </div>
                <span className="gp-label">サブタブ切り替え</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <div style={{ display: 'flex', gap: '0' }}>
                  <kbd className="gp-kbd">PgUp</kbd><kbd className="gp-kbd">PgDn</kbd>
                </div>
                <span className="gp-label">スクロール</span>
                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                <kbd className="gp-kbd">Esc</kbd>
                <span className="gp-label">閉じる</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .help-tab {
          padding: 16px 32px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #666;
          font-family: 'GenEiLateMin', serif;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          transition: all 0.3s;
          letter-spacing: 1px;
        }
        .help-tab.active {
          color: #00e5ff;
          border-bottom-color: #00e5ff;
          text-shadow: 0 0 10px rgba(0,229,255,0.5);
        }
        .help-tab:hover:not(.active) {
          color: #aaa;
          background: rgba(255,255,255,0.02);
        }
        .help-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 14px;
          color: #ccc;
        }
        .help-system-item {
          background: rgba(255,255,255,0.03);
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .help-system-title {
          font-family: 'GenEiLateMin', serif;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 8px;
          letter-spacing: 1px;
        }
        .help-system-desc {
          font-size: 15px;
          color: #aaa;
          line-height: 1.6;
          margin: 0;
        }
        .help-element-item {
          background: rgba(255,255,255,0.03);
          padding: 16px 20px;
          border-radius: 12px;
          border-left: 4px solid;
        }
        .help-element-title {
          font-family: 'GenEiLateMin', serif;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .help-content-fade {
          animation: helpFadeIn 0.4s ease-out;
        }
        @keyframes helpFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .help-close-btn:hover {
          background: #ff5252 !important;
          transform: rotate(90deg);
        }
      `}</style>
    </div>
  );
};


export default HelpUI;
