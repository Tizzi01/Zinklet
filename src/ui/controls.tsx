import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** Procreate-style vertical slider. `t` is 0..1 (top = 1). */
export function VSlider({
  t,
  onChange,
  label,
  display,
  onStart,
  onEnd,
}: {
  t: number;
  onChange: (t: number) => void;
  label: string;
  display: string;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const setFrom = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height)));
  };
  return (
    <div
      ref={ref}
      className={`vslider ${active ? 'active' : ''}`}
      role="slider"
      aria-label={label}
      aria-valuetext={display}
      aria-valuenow={Math.round(t * 100)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setActive(true);
        onStart?.();
        setFrom(e.clientY);
      }}
      onPointerMove={(e) => active && setFrom(e.clientY)}
      onPointerUp={() => {
        setActive(false);
        onEnd?.();
      }}
      onPointerCancel={() => {
        setActive(false);
        onEnd?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') onChange(Math.min(1, t + 0.02));
        if (e.key === 'ArrowDown') onChange(Math.max(0, t - 0.02));
      }}
    >
      <div className="vslider-track">
        <div className="vslider-fill" style={{ height: `${t * 100}%` }} />
      </div>
      <div className="vslider-thumb" style={{ bottom: `calc(${t} * (100% - 22px))` }} />
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
  onStart,
  onEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (v: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-value">{display ?? Math.round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onPointerDown={onStart}
        onPointerUp={onEnd}
        onKeyUp={onEnd}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button type="button" className="toggle-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <span className={`switch ${checked ? 'on' : ''}`}>
        <span />
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented-wrap">
      {label && <div className="field-label">{label}</div>}
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'on' : ''}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function IconButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  className = '',
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
