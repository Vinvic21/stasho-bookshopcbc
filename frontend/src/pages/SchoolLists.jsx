import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useNotifications } from "../context/NotificationContext";
import { apiFetch } from "../api";
import { COLORS, FONTS } from "../theme";

const css = `
  .sl-page { max-width: 900px; margin: 0 auto; padding: 3rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .sl-head h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .sl-head p { color: ${COLORS.gray}; margin-top: .4rem; }
  .sl-selects { display: flex; gap: 1rem; margin: 2rem 0; flex-wrap: wrap; }
  .sl-selects select {
    padding: 12px 16px; border: 1.5px solid ${COLORS.border}; border-radius: 10px;
    font-size: .95rem; min-width: 220px; background: #fff;
  }
  .sl-items { display: flex; flex-direction: column; gap: .6rem; margin-bottom: 1.5rem; }
  .sl-item {
    display: flex; align-items: center; justify-content: space-between;
    background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: .9rem 1.2rem;
  }
  .sl-item-left { display: flex; align-items: center; gap: .8rem; }
  .sl-item-icon { font-size: 1.4rem; }
  .sl-item-title { font-weight: 600; color: ${COLORS.dark}; }
  .sl-item-meta { font-size: .82rem; color: ${COLORS.gray}; }
  .sl-item-qty { font-size: .85rem; color: ${COLORS.greenDark}; font-weight: 600; }
  .sl-total {
    display: flex; justify-content: space-between; align-items: center;
    background: ${COLORS.greenPale}; border-radius: 12px; padding: 1rem 1.4rem; margin-bottom: 1.2rem;
  }
  .sl-add-btn {
    padding: 13px 22px; background: ${COLORS.green}; color: #fff; border: none;
    border-radius: 10px; font-weight: 600; cursor: pointer; font-size: .95rem;
  }
  .sl-add-btn:hover { background: ${COLORS.greenDark}; }
  .sl-badge { display: inline-block; margin-top: 3px; padding: 2px 9px; border-radius: 10px; font-size: .72rem; font-weight: 600; }
  .sl-badge.used { background: ${COLORS.greenPale}; color: ${COLORS.greenDark}; }
  .sl-badge.warn { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .sl-badge.bad { background: #FEE2E2; color: ${COLORS.red}; }
  .sl-smart { border: 1.5px solid ${COLORS.green}; border-radius: 12px; padding: 1rem 1.3rem; margin-bottom: 1.2rem; background: #fff; }
  .sl-smart h3 { font-size: 1rem; margin-bottom: .4rem; }
  .sl-smart-row { display: flex; justify-content: space-between; font-size: .9rem; padding: 2px 0; }
  .sl-smart-note { font-size: .78rem; color: ${COLORS.gray}; margin-top: .5rem; }
  .sl-actions { display: flex; gap: .8rem; flex-wrap: wrap; }
  .sl-add-btn.alt { background: #fff; color: ${COLORS.greenDark}; border: 1.5px solid ${COLORS.green}; }
  .sl-empty { text-align: center; padding: 3rem; color: ${COLORS.gray}; }
`;

export default function SchoolLists({ onNavigate }) {
  const { user } = useAuth();
  const { replaceCart, cartItems } = useCart();
  const { notify } = useNotifications();
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [grades, setGrades] = useState([]);
  const [grade, setGrade] = useState("");
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [analysis, setAnalysis] = useState(null);   // AI: stock check, used copies, substitutes

  useEffect(() => { apiFetch("/schools", { auth: false }).then(setSchools); }, []);

  useEffect(() => {
    if (!schoolId) { setGrades([]); setGrade(""); return; }
    apiFetch(`/schools/${schoolId}/grades`, { auth: false }).then((g) => { setGrades(g); setGrade(g[0] || ""); });
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !grade) { setItems([]); return; }
    apiFetch(`/schools/${schoolId}/lists/${encodeURIComponent(grade)}`, { auth: false }).then(setItems);
  }, [schoolId, grade]);

  // Smarter School Lists: check every item for stock, used copies and look-alikes
  useEffect(() => {
    if (!items.length) { setAnalysis(null); return; }
    apiFetch("/ai/analyze-items", { method: "POST", body: { items: items.map((i) => ({ id: i.id, qty: i.qty })) } })
      .then(setAnalysis).catch(() => setAnalysis(null));
  }, [items]);

  const lineFor = (id) => analysis?.lines.find((l) => l.product.id === id);

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  // Smart mix: new items (swapping in a look-alike when something is out of stock). Used copies are
  // bought from the seller on Resell, so they're listed rather than added to the cart.
  const handleSmartAdd = () => {
    if (!user) { onNavigate("login"); return; }
    const next = cartItems.map((c) => ({ ...c }));
    let added = 0;
    analysis.lines.forEach((l) => {
      const b = l.best;
      if (b.type === "used" || b.type === "unavailable") return;
      const prod = b.type === "substitute" ? b.product : l.product;
      const existing = next.find((c) => c.id === prod.id);
      if (existing) existing.qty += l.qty; else next.push({ ...prod, qty: l.qty });
      added += 1;
    });
    replaceCart(next);
    notify({ type: "order", icon: "🧠", title: "Smart mix added",
      body: `${added} item${added !== 1 ? "s" : ""} added to your cart. Used copies are on Resell.`, duration: 6500 });
  };

  const handleAdd = async () => {
    if (!user) { onNavigate("login"); return; }
    setAdding(true);
    try {
      const cart = await apiFetch(`/schools/${schoolId}/lists/${encodeURIComponent(grade)}/add-to-cart`, { method: "POST" });
      replaceCart(cart);
      notify({ type: "order", icon: "🎒", title: "List added to cart", body: `All ${items.length} items for ${grade} are now in your cart.`, duration: 6000 });
    } catch (e) {
      notify({ type: "order", icon: "⚠️", title: "Couldn't add list", body: e.message, duration: 6000 });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="sl-page">
        <div className="sl-head">
          <h1>🎒 School Shopping Lists</h1>
          <p>Pick your child's school and grade — we'll add everything on their official list to your cart in one click.</p>
        </div>

        <div className="sl-selects">
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Select a school…</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.county})</option>)}
          </select>
          {grades.length > 0 && (
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              {grades.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </div>

        {schoolId && grade && items.length === 0 && (
          <div className="sl-empty">No published list yet for this school &amp; grade.</div>
        )}

        {items.length > 0 && (
          <>
            <div className="sl-items">
              {items.map((it) => (
                <div className="sl-item" key={it.id}>
                  <div className="sl-item-left">
                    <span className="sl-item-icon">{it.img}</span>
                    <div>
                      <div className="sl-item-title">{it.title}</div>
                      <div className="sl-item-meta">{it.category} · KSh {it.price.toLocaleString()} each</div>
                      {(() => {
                        const l = lineFor(it.id);
                        if (!l) return null;
                        if (l.stock_status === "out") return <span className="sl-badge bad">Out of stock{l.best.type === "substitute" ? `: try ${l.best.product.title}` : l.best.type === "used" ? ": used copy available" : ""}</span>;
                        if (l.stock_status === "short") return <span className="sl-badge warn">Only {l.product.stock} left</span>;
                        if (l.best.type === "used") return <span className="sl-badge used">♻️ Used from KSh {l.best.price.toLocaleString()} (saves {l.best.saving_pct}%)</span>;
                        if (l.stock_status === "low") return <span className="sl-badge warn">Low stock</span>;
                        return null;
                      })()}
                    </div>
                  </div>
                  <div className="sl-item-qty">×{it.qty}</div>
                </div>
              ))}
            </div>
            <div className="sl-total">
              <span>Total for {grade}</span>
              <strong>KSh {total.toLocaleString()}</strong>
            </div>
            {analysis && (analysis.used_count > 0 || analysis.lines.some((l) => l.stock_status === "out" || l.stock_status === "short")) && (
              <div className="sl-smart">
                <h3>🧠 Smart mix</h3>
                <div className="sl-smart-row"><span>All new</span><span>KSh {analysis.total_new.toLocaleString()}</span></div>
                <div className="sl-smart-row"><span>With used copies and swaps</span><b>KSh {analysis.total_best.toLocaleString()}</b></div>
                {analysis.savings > 0 && <div className="sl-smart-row" style={{ color: COLORS.success }}><span>You save</span><b>KSh {analysis.savings.toLocaleString()}</b></div>}
                {analysis.unavailable > 0 && <div className="sl-smart-note">{analysis.unavailable} item{analysis.unavailable !== 1 ? "s are" : " is"} out of stock with no alternative yet, so the smart total leaves {analysis.unavailable !== 1 ? "them" : "it"} out.</div>}
                <div className="sl-smart-note">Used copies come straight from other parents on Resell, so you agree the payment with the seller.</div>
              </div>
            )}
            <div className="sl-actions">
              <button className="sl-add-btn" onClick={handleAdd} disabled={adding}>
                {adding ? "Adding…" : user ? "Add Full List to Cart" : "🔒 Login to add list"}
              </button>
              {analysis && (analysis.used_count > 0 || analysis.lines.some((l) => l.best.type === "substitute")) && (
                <button className="sl-add-btn alt" onClick={handleSmartAdd}>🧠 Add smart mix</button>
              )}
              {analysis?.used_count > 0 && (
                <button className="sl-add-btn alt" onClick={() => onNavigate("resale")}>♻️ See used copies</button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}