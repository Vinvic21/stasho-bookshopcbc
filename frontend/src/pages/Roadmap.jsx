// src/pages/Roadmap.jsx
// ─── AI Learning Roadmap ─────────────────────────────────────────────────────
// A parent describes the learner in plain words ("Grade 4, weak in maths and
// Kiswahili, budget 3000") and gets a staged shopping plan built from real,
// in-stock catalogue items, trimmed to fit the budget.

import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { apiFetch } from "../api";
import { COLORS, FONTS, GRADES, CATEGORIES } from "../theme";

const css = `
  .rm-page { max-width: 900px; margin: 0 auto; padding: 2.5rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .rm-page h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .rm-sub { color: ${COLORS.gray}; margin: .4rem 0 1.6rem; }
  .rm-box { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 16px; padding: 1.4rem; margin-bottom: 1.5rem; }
  .rm-box textarea, .rm-box select, .rm-box input {
    width: 100%; padding: 11px 14px; border: 1.5px solid ${COLORS.border}; border-radius: 10px; font-size: .93rem; font-family: ${FONTS.body};
  }
  .rm-row { display: flex; gap: .8rem; margin-top: .8rem; flex-wrap: wrap; }
  .rm-row > * { flex: 1; min-width: 150px; }
  .rm-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: .8rem; }
  .rm-chip { padding: 5px 12px; border-radius: 16px; border: 1.5px solid ${COLORS.border}; background: #fff; font-size: .8rem; cursor: pointer; }
  .rm-chip.on { background: ${COLORS.green}; color: #fff; border-color: ${COLORS.green}; }
  .rm-examples { margin-top: .6rem; font-size: .8rem; color: ${COLORS.gray}; }
  .rm-examples button { background: none; border: none; color: ${COLORS.green}; cursor: pointer; text-decoration: underline; font-size: .8rem; }
  .rm-stage { background: #fff; border: 1px solid ${COLORS.border}; border-left: 5px solid ${COLORS.green}; border-radius: 14px; padding: 1.2rem 1.4rem; margin-bottom: 1rem; }
  .rm-stage h3 { font-family: ${FONTS.display}; font-size: 1.1rem; }
  .rm-why { color: ${COLORS.gray}; font-size: .83rem; margin: 2px 0 .8rem; }
  .rm-item { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid ${COLORS.border}; font-size: .9rem; }
  .rm-item .ic { font-size: 1.4rem; width: 34px; text-align: center; }
  .rm-item .t { flex: 1; }
  .rm-item .p { font-weight: 700; color: ${COLORS.green}; }
  .rm-sub-total { text-align: right; font-size: .85rem; color: ${COLORS.gray}; margin-top: .4rem; }
  .rm-summary { background: ${COLORS.greenPale}; border-radius: 14px; padding: 1.2rem 1.4rem; margin: 1.2rem 0; }
  .rm-total { font-family: ${FONTS.display}; font-size: 1.4rem; color: ${COLORS.greenDark}; font-weight: 700; }
  .rm-note { background: #FFFBEB; border: 1px solid ${COLORS.gold}; border-radius: 12px; padding: .9rem 1.1rem; margin-bottom: 1rem; font-size: .9rem; }
  .rm-tips { padding-left: 1.2rem; color: #374151; font-size: .88rem; line-height: 1.7; }
  .rm-trim { opacity: .75; }
  .rm-err { color: ${COLORS.red}; font-size: .88rem; margin-top: .6rem; }
`;

const EXAMPLES = [
  "Grade 4, weak in maths and Kiswahili, budget 3000",
  "My son is in Grade 1, I want him to love reading. Budget KSh 2500",
  "Darasa la 6, sayansi, chini ya 2000",
];

export default function Roadmap({ onNavigate }) {
  const { user } = useAuth();
  const { addManyToCart } = useCart();
  const [goal, setGoal] = useState("");
  const [grade, setGrade] = useState("");
  const [budget, setBudget] = useState("");
  const [focus, setFocus] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");

  const subjects = CATEGORIES.filter((c) => c !== "All" && c !== "Stationery");
  const toggle = (c) => setFocus((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]));

  const build = async () => {
    setLoading(true); setError(""); setAdded(""); setPlan(null);
    try {
      const res = await apiFetch("/ai/roadmap", {
        method: "POST", auth: false,
        body: { goal, grade, budget: budget || null, focus },
      });
      setPlan(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const allItems = plan ? plan.stages.flatMap((s) => s.items) : [];

  const addAll = (items, label) => {
    if (!user) { onNavigate("login"); return; }
    addManyToCart(items);
    setAdded(`✅ Added ${items.length} item${items.length !== 1 ? "s" : ""} (${label}) to your cart.`);
  };

  return (
    <>
      <style>{css}</style>
      <div className="rm-page">
        <h1>🧭 Learning Roadmap</h1>
        <p className="rm-sub">
          Tell me about the learner in your own words. I'll build a step-by-step shopping plan from books
          and supplies we actually have in stock, and keep it within your budget.
        </p>

        <div className="rm-box">
          <textarea rows={3} value={goal} onChange={(e) => setGoal(e.target.value)}
            placeholder='e.g. "Grade 4, weak in maths and Kiswahili, budget 3000"' />
          <div className="rm-examples">
            Try: {EXAMPLES.map((ex) => <button key={ex} onClick={() => setGoal(ex)}>{ex}</button>)}
          </div>
          <div className="rm-row">
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Grade (or mention it above)</option>
              {GRADES.filter((g) => g !== "All Grades").map((g) => <option key={g}>{g}</option>)}
            </select>
            <input type="number" placeholder="Budget in KSh (optional)" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div className="rm-chips">
            <span style={{ fontSize: ".8rem", color: COLORS.gray, alignSelf: "center" }}>Needs extra help with:</span>
            {subjects.map((c) => (
              <span key={c} className={`rm-chip ${focus.includes(c) ? "on" : ""}`} onClick={() => toggle(c)}>{c}</span>
            ))}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button className="btn-green" onClick={build} disabled={loading || (!goal.trim() && !grade)}>
              {loading ? "Building your plan…" : "Build my roadmap"}
            </button>
          </div>
          {error && <div className="rm-err">{error}</div>}
        </div>

        {plan && (
          <>
            {plan.coach_note && <div className="rm-note">💬 {plan.coach_note}</div>}

            {plan.stages.map((s, idx) => (
              <div className="rm-stage" key={s.key}>
                <h3>Step {idx + 1}: {s.title}</h3>
                <div className="rm-why">{s.why}</div>
                {s.items.map((p) => (
                  <div className="rm-item" key={p.id}>
                    <span className="ic">{p.img}</span>
                    <span className="t">{p.title}{p.grade ? ` · ${p.grade}` : ""}</span>
                    <span className="p">KSh {p.price.toLocaleString()}</span>
                  </div>
                ))}
                <div className="rm-sub-total">Subtotal: KSh {s.subtotal.toLocaleString()}</div>
              </div>
            ))}

            <div className="rm-summary">
              <div>Plan for <b>{plan.profile.grade}</b>{plan.profile.focus.length ? ` · focus on ${plan.profile.focus.join(", ")}` : ""}</div>
              <div className="rm-total">Total: KSh {plan.total.toLocaleString()}
                {plan.profile.budget != null && (
                  <span style={{ fontSize: ".9rem", color: COLORS.gray, fontWeight: 500 }}> of KSh {Number(plan.profile.budget).toLocaleString()} budget</span>
                )}
              </div>
              <div style={{ marginTop: ".8rem" }}>
                <button className="btn-primary" onClick={() => addAll(allItems, "full roadmap")}>🛒 Add the whole plan to cart</button>
              </div>
              {added && <div style={{ marginTop: ".7rem", color: COLORS.success, fontWeight: 600 }}>{added}</div>}
            </div>

            {plan.trimmed.length > 0 && (
              <div className="rm-stage rm-trim" style={{ borderLeftColor: COLORS.gold }}>
                <h3>Left out to fit your budget</h3>
                {plan.trimmed.map((p) => (
                  <div className="rm-item" key={p.id}>
                    <span className="ic">{p.img}</span><span className="t">{p.title}</span>
                    <span className="p">KSh {p.price.toLocaleString()}</span>
                  </div>
                ))}
                <button className="btn-green" style={{ marginTop: ".7rem" }} onClick={() => addAll(plan.trimmed, "optional items")}>Add these too</button>
              </div>
            )}

            {(plan.tips.length > 0 || plan.gaps.length > 0) && (
              <div className="rm-box">
                <b>Good to know</b>
                <ul className="rm-tips">
                  {plan.tips.map((t) => <li key={t}>{t}</li>)}
                  {plan.gaps.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}