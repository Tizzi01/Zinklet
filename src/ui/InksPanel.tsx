import { useState } from 'react';
import { Brush, Contrast, Eraser, Eye, EyeOff, Sparkles, Trash2 } from 'lucide-react';
import { EFFECTS, EFFECT_BY_ID, MAX_INKS, type EffectId, type InkParams } from '../engine/effects';
import type { Ink } from '../engine/Engine';
import { Slider, Toggle } from './controls';
import { EffectGlyph } from './EffectGlyph';
import { toast, useAdvanced, useEngine } from './store';

function EffectChooser({ value, onPick }: { value: EffectId; onPick: (id: EffectId) => void }) {
  return (
    <div className="effect-chips" role="radiogroup" aria-label="Effect">
      {EFFECTS.map((fx) => (
        <button
          key={fx.id}
          type="button"
          role="radio"
          aria-checked={value === fx.id}
          className={`effect-chip ${value === fx.id ? 'on' : ''}`}
          onClick={() => onPick(fx.id)}
          title={fx.blurb}
        >
          <EffectGlyph effect={fx.id} size={34} />
          <span>{fx.name}</span>
        </button>
      ))}
    </div>
  );
}

/** Strength / speed / size / lines-only sliders, shared by the brush and a selected ink. */
function SettingsFields({ effect, params, onChange }: { effect: EffectId; params: InkParams; onChange: (p: Partial<InkParams>) => void }) {
  const adv = useAdvanced();
  const def = EFFECT_BY_ID[effect];
  // "Uncapped sliders" (Artwork → Advanced) lets values go well past the normal limits.
  const k = adv.uncapped;
  return (
    <>
      <Slider label="Strength" value={params.strength} min={0} max={k ? 300 : 100} onChange={(v) => onChange({ strength: v })} />
      <Slider
        label="Speed"
        value={params.speed}
        min={def.speedRange.min}
        max={def.speedRange.max * (k ? 2.5 : 1)}
        step={def.speedRange.step}
        display={def.stepped ? `${params.speed} fps` : `${params.speed}×`}
        onChange={(v) => onChange({ speed: v })}
      />
      {def.hasSize && (
        <Slider label="Wiggle size" value={params.size} min={0} max={k ? 200 : 100} onChange={(v) => onChange({ size: v })} />
      )}
      <Toggle label="Only dark lines" hint="Off: everything you brush moves. On: only dark linework moves and colors stay still" checked={params.linesOnly} onChange={(v) => onChange({ linesOnly: v })} />
    </>
  );
}

function summary(ink: Ink) {
  const def = EFFECT_BY_ID[ink.effect];
  const p = ink.params;
  const parts = [`Strength ${p.strength}`, def.stepped ? `${p.speed} fps` : `${p.speed}×`];
  if (def.hasSize) parts.push(`Size ${p.size}`);
  if (p.linesOnly) parts.push('lines only');
  return parts.join(' · ');
}

function SelectedInkEditor({ ink }: { ink: Ink }) {
  const e = useEngine();
  const [changing, setChanging] = useState(false);
  return (
    <div className="ink-settings">
      <p className="field-hint editing-note">Changes here update this ink everywhere it’s painted.</p>
      {changing ? (
        <EffectChooser
          value={ink.effect}
          onPick={(id) => {
            e.setInkEffect(ink.id, id);
            setChanging(false);
          }}
        />
      ) : (
        <button type="button" className="effect-switch" onClick={() => setChanging(true)}>
          <EffectGlyph effect={ink.effect} size={30} />
          <span>
            <b>{EFFECT_BY_ID[ink.effect].name}</b>
            <small>{EFFECT_BY_ID[ink.effect].blurb}</small>
          </span>
          <span className="change">Change</span>
        </button>
      )}
      <SettingsFields effect={ink.effect} params={ink.params} onChange={(p) => e.updateInk(ink.id, { params: p })} />
      <div className="ink-actions">
        <button
          type="button"
          className="use-brush"
          onClick={() => {
            e.useInkAsBrush(ink.id);
            e.setTool('brush');
            toast(`Brush now paints like ${ink.name}`);
          }}
          title="Copy this ink's effect and settings onto your brush"
        >
          <Brush size={16} /> Use for brush
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
          aria-label={`Delete ${ink.name}`}
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
  const brush = e.inkBrush;

  return (
    <section className="panel inks-panel" aria-label="Inks" onPointerDown={(ev) => ev.stopPropagation()}>
      <div className="panel-head">
        <h2>Ink brush</h2>
        <button type="button" className="ghost-btn close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="panel-body">
        {/* ---------------- the brush: only affects what you paint next */}
        <div className="brush-section">
          <EffectChooser value={brush.effect} onPick={(effect) => e.setInkBrush({ effect })} />
          <p className="field-hint">{EFFECT_BY_ID[brush.effect].blurb}. Settings apply to what you paint next.</p>
          <SettingsFields effect={brush.effect} params={brush.params} onChange={(params) => e.setInkBrush({ params })} />
          <button
            type="button"
            className="wide-btn animate-all"
            onClick={() => {
              if (!e.fillWithBrush()) toast(`Up to ${MAX_INKS} different inks — reuse one from the list below`, 2600);
            }}
          >
            <Sparkles size={16} /> Animate everything with this brush
          </button>
        </div>

        <div className="divider" />

        {/* ---------------- ink already on the art */}
        <div className="on-art-head">
          <h3>On your art</h3>
          <span className="muted">{e.inks.length ? `${e.inks.length} ink${e.inks.length === 1 ? '' : 's'}` : ''}</span>
        </div>
        {e.inks.length === 0 ? (
          <p className="empty-note">Nothing painted yet. Brush over your art and each ink you use shows up here.</p>
        ) : (
          <>
            <p className="field-hint list-hint">Tap an ink to see where it is and edit just that one.</p>
            <ul className="ink-list">
              {e.inks.map((ink) => {
                const selected = ink.id === e.selectedInkId;
                return (
                  <li key={ink.id} className={selected ? 'selected' : ''}>
                    <div className="ink-row" onClick={() => e.selectInk(selected ? null : ink.id)}>
                      <span className="ink-dot" style={{ background: e.overlayColor }}>
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
                          <small>{summary(ink)}</small>
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
                    {selected && <SelectedInkEditor ink={ink} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
