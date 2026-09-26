import { useState } from 'react';
import { ArrowLeft, Contrast, Eraser, Eye, EyeOff, Plus, Sparkles, Trash2 } from 'lucide-react';
import { EFFECTS, EFFECT_BY_ID, MAX_INKS, type EffectId } from '../engine/effects';
import type { Ink } from '../engine/Engine';
import { Slider, Toggle } from './controls';
import { EffectGlyph } from './EffectGlyph';
import { toast, useEngine } from './store';

function EffectPicker({ onPick, current }: { onPick: (id: EffectId) => void; current?: EffectId }) {
  return (
    <div className="effect-grid">
      {EFFECTS.map((fx) => (
        <button
          key={fx.id}
          type="button"
          className={`effect-tile ${current === fx.id ? 'on' : ''}`}
          onClick={() => onPick(fx.id)}
        >
          <EffectGlyph effect={fx.id} size={48} />
          <span className="effect-name">
            {fx.name}
            {!fx.free && <em className="pro">PRO</em>}
          </span>
          <small>{fx.blurb}</small>
        </button>
      ))}
    </div>
  );
}

function InkSettings({ ink }: { ink: Ink }) {
  const e = useEngine();
  const def = EFFECT_BY_ID[ink.effect];
  const [showEffects, setShowEffects] = useState(false);
  const p = ink.params;
  const speedLabel = def.stepped ? `${p.speed} fps` : `${p.speed}×`;

  return (
    <div className="ink-settings">
      <button type="button" className="effect-switch" onClick={() => setShowEffects((s) => !s)}>
        <EffectGlyph effect={ink.effect} size={34} color={ink.color} />
        <span>
          <b>{def.name}</b>
          <small>{def.blurb}</small>
        </span>
        <span className="change">{showEffects ? 'Done' : 'Change'}</span>
      </button>
      {showEffects && (
        <EffectPicker
          current={ink.effect}
          onPick={(id) => {
            e.setInkEffect(ink.id, id);
            setShowEffects(false);
          }}
        />
      )}
      <Slider label="Strength" value={p.strength} min={0} max={100} onChange={(v) => e.updateInk(ink.id, { params: { strength: v } })} />
      <Slider
        label="Speed"
        value={p.speed}
        min={def.speedRange.min}
        max={def.speedRange.max}
        step={def.speedRange.step}
        display={speedLabel}
        onChange={(v) => e.updateInk(ink.id, { params: { speed: v } })}
      />
      {def.hasSize && (
        <Slider label="Wiggle size" value={p.size} min={0} max={100} onChange={(v) => e.updateInk(ink.id, { params: { size: v } })} />
      )}
      <Toggle
        label="Lines only"
        hint="Move the linework, keep colors still"
        checked={p.linesOnly}
        onChange={(v) => e.updateInk(ink.id, { params: { linesOnly: v } })}
      />
      <div className="ink-actions">
        <button type="button" className="animate-all" onClick={() => e.fillInk(ink.id)} title="Cover the whole artwork with this ink">
          <Sparkles size={16} /> Animate all
        </button>
        <button type="button" onClick={() => e.invertInk(ink.id)} title="Swap painted and unpainted areas">
          <Contrast size={16} /> Invert
        </button>
        <button type="button" onClick={() => e.clearInk(ink.id)} title="Remove this ink from everywhere">
          <Eraser size={16} /> Clear
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            e.removeInk(ink.id);
            toast(`Deleted ${ink.name} · Undo to bring it back`, 2400);
          }}
          title="Delete this ink"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export function InksPanel({ onClose }: { onClose: () => void }) {
  const e = useEngine();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const add = (id: EffectId) => {
    const ink = e.addInk(id);
    setAdding(false);
    if (ink) {
      e.setTool('brush');
      toast(`${ink.name} ink ready — brush over your art`);
    }
  };

  return (
    <section className="panel inks-panel" aria-label="Inks" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="panel-head">
        {adding ? (
          <>
            <button type="button" className="ghost-btn" onClick={() => setAdding(false)} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            <h2>Pick an ink</h2>
          </>
        ) : (
          <>
            <h2>Inks</h2>
            <span className="muted">
              {e.inks.length}/{MAX_INKS}
            </span>
            <button
              type="button"
              className="ghost-btn add"
              disabled={!e.canAddInk}
              onClick={() => setAdding(true)}
              aria-label="Add ink"
              title={e.canAddInk ? 'Add ink' : `Up to ${MAX_INKS} inks`}
            >
              <Plus size={20} />
            </button>
          </>
        )}
        <button type="button" className="ghost-btn close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="panel-body">
        {adding || e.inks.length === 0 ? (
          <>
            {e.inks.length === 0 && !adding && <p className="empty-note">Inks are invisible brushes that make your art move. Pick one to start.</p>}
            <EffectPicker onPick={add} />
          </>
        ) : (
          <ul className="ink-list">
            {e.inks.map((ink) => {
              const selected = ink.id === e.activeInkId;
              return (
                <li key={ink.id} className={selected ? 'selected' : ''}>
                  <div className="ink-row" onClick={() => e.setActiveInk(ink.id)}>
                    <span className="ink-dot" style={{ background: ink.color }}>
                      <EffectGlyph effect={ink.effect} size={26} color="#16161a" />
                    </span>
                    {renaming === ink.id ? (
                      <input
                        className="rename"
                        autoFocus
                        defaultValue={ink.name}
                        maxLength={24}
                        onClick={(ev) => ev.stopPropagation()}
                        onBlur={(ev) => {
                          e.updateInk(ink.id, { name: ev.target.value.trim() || ink.name });
                          setRenaming(null);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                          if (ev.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <span className="ink-name" onDoubleClick={() => setRenaming(ink.id)} title="Double-click to rename">
                        {ink.name}
                        {!ink.painted && <small>Not painted yet</small>}
                      </span>
                    )}
                    <button
                      type="button"
                      className="ghost-btn"
                      aria-label={ink.visible ? `Hide ${ink.name}` : `Show ${ink.name}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        e.updateInk(ink.id, { visible: !ink.visible });
                      }}
                    >
                      {ink.visible ? <Eye size={17} /> : <EyeOff size={17} className="muted" />}
                    </button>
                  </div>
                  {selected && <InkSettings ink={ink} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
