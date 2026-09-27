import { useState } from 'react';
import { ArrowLeft, Contrast, Eraser, Eye, EyeOff, Plus, Sparkles, Trash2 } from 'lucide-react';
import { EFFECTS, EFFECT_BY_ID, MAX_INKS, type EffectDef, type EffectId } from '../engine/effects';
import type { Ink } from '../engine/Engine';
import { Slider, Toggle } from './controls';
import { EffectGlyph } from './EffectGlyph';
import { toast, useAdvanced, useEngine } from './store';

/** Inks the user can pick. */
function useAvailableEffects(): EffectDef[] {
  return EFFECTS;
}

function EffectPicker({ onPick, current }: { onPick: (id: EffectId) => void; current?: EffectId }) {
  const effects = useAvailableEffects();
  return (
    <div className="effect-grid">
      {effects.map((fx) => (
        <button
          key={fx.id}
          type="button"
          className={`effect-tile ${current === fx.id ? 'on' : ''}`}
          onClick={() => onPick(fx.id)}
        >
          <EffectGlyph effect={fx.id} size={48} />
          <span className="effect-name">{fx.name}</span>
          <small>{fx.blurb}</small>
        </button>
      ))}
    </div>
  );
}

function InkSettings({ ink }: { ink: Ink }) {
  const e = useEngine();
  const adv = useAdvanced();
  const canSwitch = useAvailableEffects().length > 1;
  const [showEffects, setShowEffects] = useState(false);
  const def = EFFECT_BY_ID[ink.effect];
  const p = ink.params;
  const speedLabel = def.stepped ? `${p.speed} fps` : `${p.speed}×`;
  // "Uncapped sliders" (Artwork → Advanced) lets values go well past the normal limits.
  const cap = adv.uncapped ? 3 : 1;

  return (
    <div className="ink-settings">
      {canSwitch && (
        <button type="button" className="effect-switch" onClick={() => setShowEffects((v) => !v)}>
          <EffectGlyph effect={ink.effect} size={34} color={ink.color} />
          <span>
            <b>{def.name}</b>
            <small>{def.blurb}</small>
          </span>
          <span className="change">{showEffects ? 'Done' : 'Change'}</span>
        </button>
      )}
      {canSwitch && showEffects && (
        <EffectPicker
          current={ink.effect}
          onPick={(id) => {
            e.setInkEffect(ink.id, id);
            setShowEffects(false);
          }}
        />
      )}
      <Slider label="Strength" value={p.strength} min={0} max={100 * cap} onChange={(v) => e.updateInk(ink.id, { params: { strength: v } })} />
      <Slider
        label="Speed"
        value={p.speed}
        min={def.speedRange.min}
        max={def.speedRange.max * (adv.uncapped ? 2.5 : 1)}
        step={def.speedRange.step}
        display={speedLabel}
        onChange={(v) => e.updateInk(ink.id, { params: { speed: v } })}
      />
      {def.hasSize && (
        <Slider label="Wiggle size" value={p.size} min={0} max={100 * (adv.uncapped ? 2 : 1)} onChange={(v) => e.updateInk(ink.id, { params: { size: v } })} />
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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const effects = useAvailableEffects();

  const add = (id: EffectId = 'boil') => {
    const ink = e.addInk(id);
    setPicking(false);
    if (ink) {
      e.setTool('brush');
      toast(`${ink.name} ready — brush over your art`);
    }
  };
  // With only one ink type there's nothing to pick: "+" adds it straight away.
  const onPlus = () => (effects.length > 1 ? setPicking(true) : add());

  return (
    <section className="panel inks-panel" aria-label="Inks" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="panel-head">
        {picking ? (
          <>
            <button type="button" className="ghost-btn" onClick={() => setPicking(false)} aria-label="Back">
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
              onClick={onPlus}
              aria-label="Add ink"
              title={e.canAddInk ? 'Add another ink (e.g. a stronger boil for one area)' : `Up to ${MAX_INKS} inks`}
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
        {picking ? (
          <EffectPicker onPick={add} />
        ) : e.inks.length === 0 ? (
          <div className="empty-inks">
            <p className="empty-note">Inks are invisible brushes that make your art move.</p>
            <button type="button" className="primary-btn wide" onClick={onPlus}>
              <EffectGlyph effect="boil" size={30} color="currentColor" /> {effects.length > 1 ? 'Add an ink' : 'Add a Boil ink'}
            </button>
          </div>
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
