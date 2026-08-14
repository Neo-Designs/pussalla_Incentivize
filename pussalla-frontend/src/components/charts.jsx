import React, { useMemo, useState } from "react";
import { formatMoney } from "../utils/helpers";

// Shared SVG chart kit (no external chart dependency, matching the existing
// hand-rolled-SVG convention). All charts are responsive via viewBox + width
// 100%, and animate their shapes via CSS classes in app.css.

const PALETTE = ["#a30404", "#c41818", "#e04545", "#7a1e1e", "#590707", "#b3402f", "#d6604d", "#8a2a2a"];

function useResponsive({ w = 720, h = 300, pad = 36 }) {
  return { w, h, pad };
}

// Tooltip state helper
function useTip() {
  const [tip, setTip] = useState(null);
  return { tip, setTip };
}

// ---------------- Vertical bar chart (clickable) ----------------
export function VerticalBarChart({ data, onSelect, valueKey = "total", labelKey = "name", color = "#a30404", money = true }) {
  const { w, h, pad } = useResponsive({ h: 300 });
  const { tip, setTip } = useTip();
  const max = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  const chartH = h - pad * 2;
  const slot = (w - pad * 2) / Math.max(data.length, 1);
  const barW = Math.min(slot * 0.56, 64);

  const y = (v) => pad + chartH - (v / max) * chartH;

  return (
    <div className="chart-wrap" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Vertical bar chart">
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const val = max * t;
          const yy = pad + chartH - t * chartH;
          return (
            <g key={t}>
              <line x1={pad} y1={yy} x2={w - pad} y2={yy} stroke="var(--ink-100)" strokeDasharray="3 4" />
              <text x={pad - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--ink-500)">
                {money ? formatMoney(val).replace("Rs. ", "") : Math.round(val)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = pad + slot * i + slot / 2;
          const bh = (Number(d[valueKey]) / max) * chartH;
          const by = pad + chartH - bh;
          const active = d._active;
          return (
            <g
              key={d.id ?? i}
              className="bar-group"
              style={{ cursor: onSelect ? "pointer" : "default" }}
              onClick={onSelect ? () => onSelect(d) : undefined}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d })}
              onMouseLeave={() => setTip(null)}
            >
              <rect
                x={cx - barW / 2}
                y={by}
                width={barW}
                height={Math.max(bh, 0.5)}
                rx="5"
                fill={active ? PALETTE[1] : color}
                className="bar-rect"
                style={{ transition: "fill 0.2s var(--ease)" }}
              />
              <text x={cx} y={by - 7} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink-900)">
                {money ? formatMoney(d[valueKey]).replace("Rs. ", "") : d[valueKey]}
              </text>
              <text x={cx} y={h - pad + 16} textAnchor="middle" fontSize="10" fill="var(--ink-700)">
                {(d[labelKey] || "").length > 16 ? (d[labelKey] || "").slice(0, 15) + "…" : d[labelKey]}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartTip tip={tip} money={money} valueKey={valueKey} labelKey={labelKey} />
    </div>
  );
}

// ---------------- Multi-line chart ----------------
export function MultiLineChart({ series, dates }) {
  const { w, h, pad } = useResponsive({ h: 280 });
  const { tip, setTip } = useTip();
  const allVals = series.flatMap((s) => s.points.map((p) => Number(p.value)));
  const max = Math.max(...allVals, 1);
  const chartH = h - pad * 2;
  const stepX = dates.length > 1 ? (w - pad * 2) / (dates.length - 1) : 0;
  const x = (i) => pad + i * stepX;
  const y = (v) => pad + chartH - (v / max) * chartH;

  return (
    <div className="chart-wrap" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Multi-line trend chart">
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad + chartH - t * chartH;
          return (
            <g key={t}>
              <line x1={pad} y1={yy} x2={w - pad} y2={yy} stroke="var(--ink-100)" strokeDasharray="3 4" />
              <text x={pad - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--ink-500)">
                {formatMoney(max * t).replace("Rs. ", "")}
              </text>
            </g>
          );
        })}
        {series.map((s, si) => {
          const pts = s.points.map((p, i) => `${x(i)},${y(Number(p.value))}`).join(" ");
          return (
            <g key={s.id ?? si}>
              <polyline points={pts} fill="none" stroke={s.color || PALETTE[si % PALETTE.length]} strokeWidth="2.5" className="line-anim" />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(Number(p.value))}
                  r="2.6"
                  fill={s.color || PALETTE[si % PALETTE.length]}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d: { name: s.name, value: p.value, date: dates[i] } })}
                  onMouseLeave={() => setTip(null)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </g>
          );
        })}
        {dates.map((d, i) => (i % Math.ceil(dates.length / 6) === 0 ? (
          <text key={d} x={x(i)} y={h - pad + 16} textAnchor="middle" fontSize="9" fill="var(--ink-500)">{d.slice(5)}</text>
        ) : null))}
      </svg>
      <div className="legend">
        {series.map((s, si) => (
          <span key={s.id ?? si} className="legend-item">
            <span className="legend-swatch" style={{ background: s.color || PALETTE[si % PALETTE.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      <ChartTip tip={tip} money labelKey="name" valueKey="value" extraKey="date" />
    </div>
  );
}

// ---------------- Area chart ----------------
export function AreaChart({ data, valueKey = "participants", labelKey = "date", color = "#a30404" }) {
  const { w, h, pad } = useResponsive({ h: 260 });
  const { tip, setTip } = useTip();
  const max = Math.max(...data.map((d) => Number(d[valueKey])), 1);
  const chartH = h - pad * 2;
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const x = (i) => pad + i * stepX;
  const y = (v) => pad + chartH - (v / max) * chartH;
  const pts = data.map((d, i) => `${x(i)},${y(Number(d[valueKey]))}`);
  const areaPath = `M ${pad},${pad + chartH} L ${pts.join(" L ")} L ${x(data.length - 1)},${pad + chartH} Z`;

  return (
    <div className="chart-wrap" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Area chart">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.35" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad + chartH - t * chartH;
          return (
            <g key={t}>
              <line x1={pad} y1={yy} x2={w - pad} y2={yy} stroke="var(--ink-100)" strokeDasharray="3 4" />
              <text x={pad - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--ink-500)">{Math.round(max * t)}</text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#areaFill)" className="area-anim" />
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(Number(d[valueKey]))}
            r="2.6"
            fill={color}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d: { name: d[labelKey], value: d[valueKey] } })}
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
        {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 ? (
          <text key={i} x={x(i)} y={h - pad + 16} textAnchor="middle" fontSize="9" fill="var(--ink-500)">{String(d[labelKey]).slice(5)}</text>
        ) : null))}
      </svg>
      <ChartTip tip={tip} money={false} labelKey="name" valueKey="value" />
    </div>
  );
}

// ---------------- Stacked column chart ----------------
export function StackedColumnChart({ dates, stacks, colors }) {
  const { w, h, pad } = useResponsive({ h: 280 });
  const { tip, setTip } = useTip();
  const max = Math.max(
    ...dates.map((_, i) => stacks.reduce((s, st) => s + (Number(st.values[i]) || 0), 0)),
    1
  );
  const chartH = h - pad * 2;
  const slot = (w - pad * 2) / Math.max(dates.length, 1);
  const colW = Math.min(slot * 0.62, 40);

  return (
    <div className="chart-wrap" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Stacked column chart">
        {[0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad + chartH - t * chartH;
          return (
            <g key={t}>
              <line x1={pad} y1={yy} x2={w - pad} y2={yy} stroke="var(--ink-100)" strokeDasharray="3 4" />
              <text x={pad - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--ink-500)">{Math.round(max * t)}</text>
            </g>
          );
        })}
        {dates.map((d, i) => {
          const cx = pad + slot * i + slot / 2;
          let acc = pad + chartH;
          return (
            <g
              key={d}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, d: { date: d, stacks: stacks.map((st) => ({ name: st.name, value: st.values[i] || 0 })) } })}
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "pointer" }}
            >
              {stacks.map((st, si) => {
                const v = Number(st.values[i]) || 0;
                const segH = (v / max) * chartH;
                acc -= segH;
                return segH > 0 ? (
                  <rect key={st.name} x={cx - colW / 2} y={acc} width={colW} height={segH} fill={colors[si % colors.length]} rx="2" />
                ) : null;
              })}
              {dates.length <= 31 && (
                <text x={cx} y={h - pad + 16} textAnchor="middle" fontSize="9" fill="var(--ink-500)">{String(d).slice(5)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {stacks.map((st, si) => (
          <span key={st.name} className="legend-item">
            <span className="legend-swatch" style={{ background: colors[si % colors.length] }} />
            {st.name}
          </span>
        ))}
      </div>
      <ChartTip tip={tip} money={false} labelKey="date" valueKey="value" stacked />
    </div>
  );
}

// ---------------- Sparkline ----------------
export function Sparkline({ data, color = "#a30404", width = 96, height = 28 }) {
  const max = Math.max(...data.map((d) => Number(d)), 0.001);
  const min = Math.min(...data.map((d) => Number(d)), 0);
  const range = max - min || 1;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((v, i) => `${i * step},${height - ((Number(v) - min) / range) * height}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      {data.length > 0 && (
        <circle cx={(data.length - 1) * step} cy={height - ((Number(data[data.length - 1]) - min) / range) * height} r="2" fill={color} />
      )}
    </svg>
  );
}

// ---------------- Tooltip ----------------
function ChartTip({ tip, money = true, labelKey = "name", valueKey = "value", extraKey, stacked }) {
  if (!tip) return null;
  const d = tip.d || {};
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      {stacked ? (
        <>
          <div className="chart-tip-title">{d.date}</div>
          {(d.stacks || []).map((s) => (
            <div key={s.name} className="chart-tip-row"><span>{s.name}</span><strong>{Number(s.value)}</strong></div>
          ))}
        </>
      ) : (
        <>
          {d[labelKey] && <div className="chart-tip-title">{d[labelKey]}</div>}
          {extraKey && d[extraKey] && <div className="chart-tip-sub">{d[extraKey]}</div>}
          <div className="chart-tip-row"><span>Payout</span><strong>{money ? formatMoney(d[valueKey]) : d[valueKey]}</strong></div>
        </>
      )}
    </div>
  );
}

export const CHART_PALETTE = PALETTE;
