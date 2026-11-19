// src/pages/AdminForecast.jsx
// ─── Stock Forecaster (admin) ────────────────────────────────────────────────
// Which products will run out, when, and how much to reorder. Aware of the
// back-to-school rush. Also lists slow movers once there's enough sales history.

import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { COLORS, FONTS } from "../theme";

const css = `
  .fc-page { max-width: 1000px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .fc-page h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .fc-sub { color: ${COLORS.gray}; margin: .4rem 0 1.4rem; }
  .fc-season { background: ${COLORS.warningBg}; color: ${COLORS.warning}; border-radius: 12px; padding: .8rem 1.1rem; margin-bottom: 1rem; font-size: .9rem; }
  .fc-note { background: ${COLORS.grayLight}; border-radius: 12px; padding: .8rem 1.1rem; margin-bottom: 1rem; font-size: .85rem; color: #374151; }
  .fc-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 1.4rem; }
  .fc-card { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: .8rem 1rem; }
  .fc-card b { display: block; font-size: 1.6rem; font-family: ${FONTS.display}; }
  .fc-card span { font-size: .78rem; color: ${COLORS.gray}; }
  .fc-toolbar { display: flex; gap: .6rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
  .fc-filter { padding: 6px 14px; border-radius: 18px; border: 1.5px solid ${COLORS.border}; background: #fff; cursor: pointer; font-size: .8rem; font-weight: 600; }
  .fc-filter.on { background: ${COLORS.green}; color: #fff; border-color: ${COLORS.green}; }
  .fc-copy { margin-left: auto; padding: 7px 14px; border: none; border-radius: 8px; background: ${COLORS.gold}; color: #fff; font-weight: 600; cursor: pointer; font-size: .8rem; }
  .fc-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; overflow: hidden; font-size: .85rem; }
  .fc-table th { text-align: left; background: ${COLORS.grayLight}; padding: .6rem .8rem; font-size: .75rem; text-transform: uppercase; color: ${COLORS.gray}; }
  .fc-table td { padding: .6rem .8rem; border-top: 1px solid ${COLORS.border}; vertical-align: top; }
  .fc-pill { padding: 2px 9px; border-radius: 10px; font-size: .72rem; font-weight: 700; white-space: nowrap; }
  .fc-pill.out, .fc-pill.critical { background: #FEE2E2; color: ${COLORS.red}; }
  .fc-pill.low { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .fc-pill.slow { background: #E0E7FF; color: #3730A3; }
  .fc-pill.ok { background: ${COLORS.successBg}; color: ${COLORS.success}; }
  .fc-why { color: ${COLORS.gray}; font-size: .78rem; }
  .fc-assume { margin-top: 1.4rem; font-size: .8rem; color: ${COLORS.gray}; }
  .fc-wrap { overflow-x: auto; }
`;

const LABELS = { out: "Out of stock", critical: "Critical", low: "Low", slow: "Slow mover", ok: "OK" };

export default function AdminForecast() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("action");
  const [copied, setCopied] = useState(false);

  useEffect(() => { apiFetch("/ai/forecast").then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="fc-page"><style>{css}</style><p>{error}</p></div>;
  if (!data) return <div className="fc-page"><style>{css}</style><p>Crunching the numbers…</p></div>;

  const rows = data.items.filter((i) =>
    filter === "all" ? true : filter === "action" ? ["out", "critical", "low"].includes(i.status) : i.status === filter);
  const reorder = data.items.filter((i) => i.reorder_qty);

  const copyList = () => {
    const text = "Stasho reorder list (" + data.as_of + ")\n" + reorder.map((i) => `- ${i.title}: ${i.reorder_qty}`).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <>
      <style>{css}</style>
      <div className="fc-page">
        <h1>📈 Stock Forecaster</h1>
        <p className="fc-sub">What's likely to run out, how much to reorder, and what's not moving.</p>

        <div className="fc-season">
          🗓️ <b>{data.season.label}.</b> Estimated next term opening: {data.season.next_opening} ({data.season.days_to_opening} days).
          {data.season.factor > 1 && ` Expected sales are scaled up by ×${data.season.factor}.`}
        </div>
        {data.data_note && <div className="fc-note">ℹ️ {data.data_note}</div>}

        <div className="fc-cards">
          {["out", "critical", "low", "slow", "ok"].map((k) => (
            <div className="fc-card" key={k}><b>{data.counts[k]}</b><span>{LABELS[k]}</span></div>
          ))}
        </div>

        <div className="fc-toolbar">
          {[["action", "Needs action"], ["slow", "Slow movers"], ["all", "All products"]].map(([k, l]) => (
            <button key={k} className={`fc-filter ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
          {reorder.length > 0 && <button className="fc-copy" onClick={copyList}>{copied ? "✅ Copied" : `📋 Copy reorder list (${reorder.length})`}</button>}
        </div>

        <div className="fc-wrap">
          <table className="fc-table">
            <thead><tr><th>Product</th><th>Stock</th><th>Sold 60d</th><th>Days left</th><th>Status</th><th>Reorder</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} style={{ color: COLORS.gray }}>Nothing here right now. 🎉</td></tr>}
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.title}</b>{i.reason && <div className="fc-why">{i.reason}{i.discount ? ` ${i.discount}` : ""}</div>}</td>
                  <td>{i.stock}</td>
                  <td>{i.sold_60d}</td>
                  <td>{i.days_cover ?? "–"}</td>
                  <td><span className={`fc-pill ${i.status}`}>{LABELS[i.status]}</span>
                    {i.confidence === "low" && i.status !== "ok" && <div className="fc-why">low confidence</div>}</td>
                  <td>{i.reorder_qty ? <b>{i.reorder_qty}</b> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="fc-assume">
          {data.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </div>
    </>
  );
}