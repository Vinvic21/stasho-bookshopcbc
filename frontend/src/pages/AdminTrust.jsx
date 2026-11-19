// src/pages/AdminTrust.jsx
// ─── Trust Shield (admin) ────────────────────────────────────────────────────
// Everything the fraud-detection rules have flagged: risky resale listings,
// chat messages, suspicious reviews and repeated failed-payment phone numbers.

import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { COLORS, FONTS } from "../theme";

const css = `
  .tr-page { max-width: 1000px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .tr-page h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .tr-sub { color: ${COLORS.gray}; margin: .4rem 0 1.5rem; }
  .tr-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 1.8rem; }
  .tr-card { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 14px; padding: 1rem 1.2rem; }
  .tr-card b { display: block; font-size: 1.8rem; font-family: ${FONTS.display}; color: ${COLORS.green}; }
  .tr-card.hot b { color: ${COLORS.red}; }
  .tr-card span { font-size: .8rem; color: ${COLORS.gray}; }
  .tr-sec { font-family: ${FONTS.display}; font-size: 1.2rem; margin: 1.6rem 0 .8rem; }
  .tr-item { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: .9rem 1.1rem; margin-bottom: .7rem; }
  .tr-top { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
  .tr-title { font-weight: 700; }
  .tr-meta { font-size: .8rem; color: ${COLORS.gray}; }
  .tr-reasons { margin: .4rem 0 0; padding-left: 1.1rem; font-size: .84rem; color: #374151; }
  .tr-badge { padding: 3px 10px; border-radius: 12px; font-size: .74rem; font-weight: 700; }
  .tr-badge.high { background: #FEE2E2; color: ${COLORS.red}; }
  .tr-badge.medium { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .tr-btn { background: ${COLORS.red}; color: #fff; border: none; border-radius: 8px; padding: 7px 14px; font-size: .8rem; font-weight: 600; cursor: pointer; }
  .tr-quote { background: ${COLORS.grayLight}; border-radius: 8px; padding: 7px 10px; font-size: .84rem; margin-top: .4rem; font-style: italic; }
  .tr-empty { color: ${COLORS.gray}; font-size: .9rem; padding: .6rem 0; }
`;

function Section({ title, items, render }) {
  return (
    <>
      <div className="tr-sec">{title} ({items.length})</div>
      {items.length === 0 ? <div className="tr-empty">Nothing flagged. 🎉</div> : items.map(render)}
    </>
  );
}

export default function AdminTrust() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = () => apiFetch("/ai/trust/admin").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const removeListing = async (id) => {
    if (!window.confirm("Remove this listing from the marketplace?")) return;
    await apiFetch(`/resale/${id}`, { method: "PUT", body: { status: "removed" } });
    load();
  };

  if (error) return <div className="tr-page"><style>{css}</style><p>{error}</p></div>;
  if (!data) return <div className="tr-page"><style>{css}</style><p>Scanning…</p></div>;
  const s = data.summary;

  return (
    <>
      <style>{css}</style>
      <div className="tr-page">
        <h1>🛡️ Trust Shield</h1>
        <p className="tr-sub">
          Automatic checks for scams and fake activity. These are warning signs for a human to review,
          not proof of wrongdoing.
        </p>

        <div className="tr-cards">
          <div className={`tr-card ${s.listings ? "hot" : ""}`}><b>{s.listings}</b><span>Risky listings</span></div>
          <div className={`tr-card ${s.messages ? "hot" : ""}`}><b>{s.messages}</b><span>Risky messages</span></div>
          <div className={`tr-card ${s.reviews ? "hot" : ""}`}><b>{s.reviews}</b><span>Suspicious reviews</span></div>
          <div className={`tr-card ${s.orders ? "hot" : ""}`}><b>{s.orders}</b><span>Payment-probing numbers</span></div>
        </div>

        <Section title="Resale listings" items={data.listings} render={(l) => (
          <div className="tr-item" key={l.id}>
            <div className="tr-top">
              <div>
                <div className="tr-title">{l.title} · KSh {l.price.toLocaleString()}</div>
                <div className="tr-meta">Seller: {l.seller}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`tr-badge ${l.level}`}>{l.level.toUpperCase()} · {l.score}</span>
                <button className="tr-btn" onClick={() => removeListing(l.id)}>Remove</button>
              </div>
            </div>
            <ul className="tr-reasons">{l.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )} />

        <Section title="Chat messages" items={data.messages} render={(m) => (
          <div className="tr-item" key={m.id}>
            <div className="tr-top">
              <div className="tr-meta">From {m.sender} · thread #{m.thread_id}</div>
              <span className={`tr-badge ${m.level}`}>{m.level.toUpperCase()}</span>
            </div>
            <div className="tr-quote">“{m.body}”</div>
            <ul className="tr-reasons">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )} />

        <Section title="Reviews" items={data.reviews} render={(r) => (
          <div className="tr-item" key={r.id}>
            <div className="tr-title">{r.product} · {"★".repeat(r.rating)} by {r.user}</div>
            <div className="tr-quote">“{r.body}”</div>
            <ul className="tr-reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )} />

        <Section title="Orders" items={data.orders} render={(o) => (
          <div className="tr-item" key={o.phone}>
            <div className="tr-title">{o.phone}</div>
            <div className="tr-meta">Refs: {o.refs.join(", ")}</div>
            <ul className="tr-reasons">{o.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )} />
      </div>
    </>
  );
}