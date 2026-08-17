import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A hover tooltip for dense data-table cells. Rendered through a portal at the
// document body with `position: fixed`, so it is never clipped by the table's
// `overflow-x: auto` container or sticky columns (which a CSS-only tooltip
// inside the cell would be). On mouse enter over a cell, it positions itself
// just below-and-right of the cursor and flips/adjusts to stay on-screen.
//
// Usage:
//   <CellTooltip content={<TooltipBody .../>}>
//     <td>...</td>      // or wrap any element
//   </CellTooltip>
//
// `content` can be a node or a function (hide) => node, so the popover can
// include interactive controls that call hide() to dismiss.
export default function CellTooltip({ content, children, align = "right" }) {
  const wrapRef = useRef(null);
  const [tip, setTip] = useState(null); // { x, y, dir } | null
  const rafRef = useRef(0);

  const show = (e) => {
    cancelAnimationFrame(rafRef.current);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX != null ? e.clientX : rect.left + rect.width / 2;
    const y = rect.bottom + 6;
    rafRef.current = requestAnimationFrame(() => setTip({ x, y }));
  };

  const hide = () => {
    cancelAnimationFrame(rafRef.current);
    setTip(null);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <>
      <span
        ref={wrapRef}
        className="cell-tip-host"
        onMouseEnter={show}
        onMouseLeave={hide}
        onMouseMove={show}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
      >
        {children}
      </span>
      {tip && <PortalTip x={tip.x} y={tip.y} align={align} onClose={hide} content={content} />}
    </>
  );
}

function PortalTip({ x, y, align, onClose, content }) {
  const nodeRef = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // After mount, measure and clamp so the popover never overflows the viewport.
  useLayoutEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === "center" ? x - r.width / 2 : x;
    let top = y;
    if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
    if (left < 8) left = 8;
    if (top + r.height > vh - 8) top = Math.max(8, y - r.height - 24);
    setPos({ left, top });
  }, [x, y, align]);

  return createPortal(
    <div ref={nodeRef} className="cell-pop" style={{ left: pos.left, top: pos.top }} role="tooltip">
      {typeof content === "function" ? content(onClose) : content}
    </div>,
    document.body
  );
}
