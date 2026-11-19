// src/components/UsedSaver.jsx
// ─── AI Used vs New Finder (cart) ────────────────────────────────────────────
// Looks at what's in the cart and shows (a) items that are out of stock or short
// and (b) cheaper used copies from the Resell marketplace, with the saving.
// Used copies are bought directly from the seller, so this links to Resell.

import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { COLORS } from "../theme";

const css = `
  .us-box { margin: 0 1.25rem 1rem; border: 1px solid ${COLORS.border}; border-radius: 12px; overflow: hidden; font-size: .82rem; }
  .us-head { padding: .6rem .9rem; font-weight: 700; }
  .us-save { background: ${COLORS.greenPale}; color: ${COLORS.greenDark}; }
  .us-warn { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .us-row { padding: .5rem .9rem; border-top: 1px solid ${COLORS.border}; background: #fff; color: #374151; }
  .us-row small { display: block; color: ${COLORS.gray}; }
  .us-link { display: block; width: 100%; padding: .55rem; border: none; border-top: 1px solid ${COLORS.border};
    background: #fff; color: ${COLORS.green}; font-weight: 700; cursor: pointer; font-size: .82rem; }
`;

export default function UsedSaver({ cartItems, onNavigate, onClose }) {
  const [res, setRes] = useState(null);
  const sig = cartItems.map((i) => `${i.id}x${i.qty}`).join(",");

  useEffect(() => {
    if (!cartItems.length) { setRes(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch("/ai/analyze-items", { method: "POST", body: { items: cartItems.map((i) => ({ id: i.id, qty: i.qty })) } })
        .then((r) => { if (!cancelled) setRes(r); })
        .catch(() => { if (!cancelled) setRes(null); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  if (!res) return null;
  const stockIssues = res.lines.filter((l) => l.stock_status === "out" || l.stock_status === "short");
  const usedLines = res.lines.filter((l) => l.best.type === "used" && l.stock_status !== "out" && l.stock_status !== "short");
  const usedSaving = usedLines.reduce((s, l) => s + (l.line_new - l.line_best), 0);
  if (!stockIssues.length && !usedLines.length) return null;

  const goResell = () => { onClose?.(); onNavigate?.("resale"); };

  return (
    <>
      <style>{css}</style>
      {stockIssues.length > 0 && (
        <div className="us-box">
          <div className="us-head us-warn">⚠️ Check stock before paying</div>
          {stockIssues.map((l) => (
            <div className="us-row" key={l.product.id}>
              <b>{l.product.title}</b>: {l.stock_status === "out" ? "out of stock" : `only ${l.product.stock} left, you have ${l.qty}`}
              <small>{l.note}</small>
            </div>
          ))}
        </div>
      )}
      {usedLines.length > 0 && (
        <div className="us-box">
          <div className="us-head us-save">♻️ Save KSh {usedSaving.toLocaleString()} with used copies</div>
          {usedLines.map((l) => (
            <div className="us-row" key={l.product.id}>
              <b>{l.product.title}</b>: used from KSh {l.best.price.toLocaleString()} (new KSh {l.product.price.toLocaleString()})
              <small>{l.best.condition} · {l.best.seller} · saves {l.best.saving_pct}%
                {l.best.trust !== "low" ? " · check details before paying" : ""}</small>
            </div>
          ))}
          <button className="us-link" onClick={goResell}>Browse these in Resell →</button>
        </div>
      )}
    </>
  );
}