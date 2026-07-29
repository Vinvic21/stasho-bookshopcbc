// src/pages/Discover.jsx
// ─── Discover ────────────────────────────────────────────────────────────────
// Home for the gamified / recommendation engagement features:
//   🏆 Achievements   — hidden badge system based on shopping behaviour
//   📊 Leaderboard    — top shoppers by items bought
//   🔥 Activity        — GitHub-style heatmap of order activity
//   🧬 Book DNA        — short quiz → personalised product matches
//   🎁 Mystery Box     — surprise pick within a budget
//   🗄️ My Bookshelf    — a customisable shelf of favourite items

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { apiFetch } from "../api";
import { COLORS, FONTS, CATEGORIES, GRADES } from "../theme";

const css = `
  .discover-page { max-width: 1000px; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
  .discover-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 1.5rem 0 2rem; }
  .discover-tab {
    padding: 9px 16px; border-radius: 20px; border: 1.5px solid ${COLORS.border};
    background: #fff; font-size: .86rem; font-weight: 600; cursor: pointer; color: #374151;
  }
  .discover-tab.active { background: ${COLORS.green}; color: #fff; border-color: ${COLORS.green}; }
  .card { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 16px; padding: 1.5rem; margin-bottom: 1.25rem; }
  .card h3 { font-family: ${FONTS.display}; font-size: 1.15rem; margin-bottom: .9rem; }

  .badge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .badge-tile { border: 1.5px solid ${COLORS.border}; border-radius: 12px; padding: 1rem; text-align: center; opacity: .45; }
  .badge-tile.earned { opacity: 1; border-color: ${COLORS.gold}; background: #FFFBEB; }
  .badge-icon { font-size: 2rem; }
  .badge-label { font-weight: 700; margin: 4px 0 2px; font-size: .92rem; }
  .badge-desc { font-size: .76rem; color: ${COLORS.gray}; margin-bottom: 6px; }
  .badge-bar { height: 6px; background: ${COLORS.grayLight}; border-radius: 4px; overflow: hidden; }
  .badge-bar-fill { height: 100%; background: ${COLORS.green}; }

  .lb-row { display: flex; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid ${COLORS.border}; font-size: .9rem; }
  .lb-row.you { background: ${COLORS.greenPale}; border-radius: 8px; padding: 9px 10px; }
  .lb-rank { width: 28px; font-weight: 700; color: ${COLORS.gray}; }
  .lb-name { flex: 1; font-weight: 600; }
  .lb-total { color: ${COLORS.green}; font-weight: 700; }

  .heat-grid { display: grid; grid-template-columns: repeat(26, 1fr); gap: 3px; }
  .heat-cell { width: 100%; padding-bottom: 100%; border-radius: 2px; background: ${COLORS.grayLight}; position: relative; }
  .heat-stats { display: flex; gap: 2rem; margin-top: 1rem; font-size: .85rem; color: ${COLORS.gray}; }
  .heat-stats b { color: ${COLORS.dark}; }

  .quiz-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 1rem; }
  .quiz-chip { padding: 6px 14px; border-radius: 16px; border: 1.5px solid ${COLORS.border}; background: #fff; font-size: .82rem; cursor: pointer; }
  .quiz-chip.active { background: ${COLORS.green}; color: #fff; border-color: ${COLORS.green}; }
  .quiz-select, .quiz-input { padding: 8px 12px; border-radius: 8px; border: 1.5px solid ${COLORS.border}; font-size: .85rem; }
  .match-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 1rem; }
  .match-tile { border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 10px; text-align: center; }
  .match-pct { font-size: .72rem; font-weight: 700; color: ${COLORS.gold}; }

  .mystery-box { text-align: center; padding: 2rem 1rem; }
  .mystery-result { margin-top: 1.25rem; padding: 1.25rem; background: ${COLORS.greenPale}; border-radius: 12px; }

  .shelf-themes { display: flex; gap: 8px; margin-bottom: 1rem; }
  .shelf { display: flex; flex-wrap: wrap; gap: 14px; padding: 1.25rem; border-radius: 14px; }
  .shelf.classic { background: #F5EFE3; }
  .shelf.dark { background: #1F2937; }
  .shelf.pastel { background: #FCE7F3; }
  .shelf-item { width: 70px; text-align: center; font-size: 2rem; }
  .shelf-item-title { font-size: .65rem; margin-top: 2px; color: #374151; }
  .shelf.dark .shelf-item-title { color: #E5E7EB; }
`;

const TABS = [
  { id: "achievements", label: "🏆 Achievements" },
  { id: "leaderboard", label: "📊 Leaderboard" },
  { id: "heatmap", label: "🔥 Activity" },
  { id: "dna", label: "🧬 Book DNA" },
  { id: "mystery", label: "🎁 Mystery Box" },
  { id: "shelf", label: "🗄️ My Bookshelf" },
];

export default function Discover({ onNavigate }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("achievements");

  if (!user) {
    return (
      <div className="discover-page">
        <style>{css}</style>
        <h1 className="section-title">Discover</h1>
        <div className="card">
          <p>Log in to see your achievements, leaderboard rank, activity, and personalised picks.</p>
          <button className="btn-green" style={{ marginTop: "1rem" }} onClick={() => onNavigate("login")}>Log In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="discover-page">
      <style>{css}</style>
      <h1 className="section-title">Discover</h1>
      <p style={{ color: COLORS.gray, marginTop: 4 }}>Badges, rankings, activity, and smart picks tailored to how you shop.</p>

      <div className="discover-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`discover-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === "achievements" && <AchievementsPanel />}
      {tab === "leaderboard" && <LeaderboardPanel />}
      {tab === "heatmap" && <HeatmapPanel />}
      {tab === "dna" && <BookDnaPanel onNavigate={onNavigate} />}
      {tab === "mystery" && <MysteryBoxPanel />}
      {tab === "shelf" && <BookshelfPanel />}
    </div>
  );
}

// ── 🏆 Achievements ─────────────────────────────────────────────────────────
function AchievementsPanel() {
  const [data, setData] = useState(null);
  useEffect(() => { apiFetch("/achievements").then(setData).catch(() => {}); }, []);

  return (
    <div className="card">
      <h3>Badges {data && `— ${data.earned_count}/${data.total} earned`}</h3>
      {!data ? <p>Loading…</p> : (
        <div className="badge-grid">
          {data.badges.map((b) => (
            <div key={b.id} className={`badge-tile ${b.earned ? "earned" : ""}`}>
              <div className="badge-icon">{b.icon}</div>
              <div className="badge-label">{b.label}</div>
              <div className="badge-desc">{b.description}</div>
              <div className="badge-bar"><div className="badge-bar-fill" style={{ width: `${Math.min(100, (b.progress / b.target) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 📊 Leaderboard ──────────────────────────────────────────────────────────
function LeaderboardPanel() {
  const [data, setData] = useState(null);
  useEffect(() => { apiFetch("/leaderboard").then(setData).catch(() => {}); }, []);

  return (
    <div className="card">
      <h3>Top Shoppers</h3>
      {!data ? <p>Loading…</p> : data.board.length === 0 ? (
        <p style={{ color: COLORS.gray }}>No completed orders yet — be the first on the board!</p>
      ) : (
        <>
          {data.board.map((row) => (
            <div key={row.rank} className={`lb-row ${row.is_you ? "you" : ""}`}>
              <div className="lb-rank">#{row.rank}</div>
              <div className="lb-name">{row.is_you ? "You" : row.name}</div>
              <div className="lb-total">{row.items_bought} items</div>
            </div>
          ))}
          {data.you.rank && data.you.rank > 10 && (
            <p style={{ marginTop: "1rem", fontSize: ".85rem", color: COLORS.gray }}>
              You're currently ranked <b>#{data.you.rank}</b> with {data.you.items_bought} items bought. Keep going!
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── 🔥 Activity heatmap ─────────────────────────────────────────────────────
function HeatmapPanel() {
  const [data, setData] = useState(null);
  useEffect(() => { apiFetch("/activity-heatmap").then(setData).catch(() => {}); }, []);

  const cellColor = (count) => {
    if (!count) return COLORS.grayLight;
    if (count >= 8) return COLORS.greenDark;
    if (count >= 4) return COLORS.green;
    if (count >= 2) return COLORS.greenMid;
    return "#B7E4C7";
  };

  // Build the last 182 days as a flat grid (7 rows x 26 cols, oldest → newest).
  const days = [];
  const today = new Date();
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  return (
    <div className="card">
      <h3>Your Shopping Activity</h3>
      {!data ? <p>Loading…</p> : (
        <>
          <div className="heat-grid">
            {days.map((d) => (
              <div key={d} className="heat-cell" style={{ background: cellColor(data.days[d]) }} title={`${d}: ${data.days[d] || 0} item(s)`} />
            ))}
          </div>
          <div className="heat-stats">
            <div><b>{data.total_active_days}</b> active days</div>
            <div><b>{data.longest_streak}</b> day longest streak</div>
          </div>
        </>
      )}
    </div>
  );
}

// ── 🧬 Book DNA quiz ────────────────────────────────────────────────────────
function BookDnaPanel({ onNavigate }) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [grade, setGrade] = useState("");
  const [budget, setBudget] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleCat = (c) => setCategories((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const runQuiz = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/book-dna", { method: "POST", auth: false, body: { categories, grade, budget: budget ? Number(budget) : null } });
      setResults(data.results);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Find Your Book DNA</h3>
      <p style={{ fontSize: ".85rem", color: COLORS.gray, marginBottom: "1rem" }}>Answer a few quick questions and we'll match you to the right materials.</p>

      <div className="quiz-row">
        {CATEGORIES.filter((c) => c !== "All").map((c) => (
          <button key={c} className={`quiz-chip ${categories.includes(c) ? "active" : ""}`} onClick={() => toggleCat(c)}>{c}</button>
        ))}
      </div>
      <div className="quiz-row">
        <select className="quiz-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Any grade</option>
          {GRADES.filter((g) => g !== "All Grades").map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input className="quiz-input" type="number" placeholder="Budget (KSh)" value={budget} onChange={(e) => setBudget(e.target.value)} />
        <button className="btn-green" onClick={runQuiz} disabled={loading}>{loading ? "Matching…" : "Get my matches"}</button>
      </div>

      {results && (
        <div className="match-grid">
          {results.map((p) => (
            <div key={p.id} className="match-tile">
              <div style={{ fontSize: "1.6rem" }}>{p.img}</div>
              <div style={{ fontSize: ".78rem", fontWeight: 600, margin: "4px 0" }}>{p.title}</div>
              <div className="match-pct">{p.match}% match</div>
              <div style={{ fontSize: ".8rem", color: COLORS.green, fontWeight: 700, margin: "4px 0" }}>KSh {p.price.toLocaleString()}</div>
              <button className="add-btn" style={{ fontSize: ".72rem", padding: "5px 10px" }} onClick={() => (user ? addToCart(p) : onNavigate("login"))}>+ Add</button>
            </div>
          ))}
          {results.length === 0 && <p style={{ color: COLORS.gray }}>No strong matches — try widening your budget or picking more subjects.</p>}
        </div>
      )}
    </div>
  );
}

// ── 🎁 Mystery box ──────────────────────────────────────────────────────────
function MysteryBoxPanel() {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [budget, setBudget] = useState(300);
  const [category, setCategory] = useState("All");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const openBox = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await apiFetch(`/mystery-box?budget=${budget}&category=${encodeURIComponent(category)}`, { auth: false });
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card mystery-box">
      <h3>Mystery Book Box</h3>
      <p style={{ fontSize: ".85rem", color: COLORS.gray }}>Set a budget, pick a category (optional), and let us surprise you.</p>
      <div className="quiz-row" style={{ justifyContent: "center", marginTop: "1rem" }}>
        <input className="quiz-input" type="number" value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: 110 }} />
        <select className="quiz-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn-primary" onClick={openBox} disabled={loading}>{loading ? "Opening…" : "🎁 Open Mystery Box"}</button>
      </div>
      {error && <p style={{ color: COLORS.red, marginTop: "1rem" }}>{error}</p>}
      {result && (
        <div className="mystery-result">
          <div style={{ fontSize: "2.5rem" }}>{result.product.img}</div>
          <div style={{ fontWeight: 700, margin: "6px 0" }}>{result.product.title}</div>
          <div style={{ color: COLORS.green, fontWeight: 700 }}>KSh {result.product.price.toLocaleString()}</div>
          <p style={{ fontSize: ".82rem", color: COLORS.gray, margin: "6px 0 10px" }}>{result.message}</p>
          <button className="btn-green" onClick={() => (user ? addToCart(result.product) : null)}>{user ? "+ Add to cart" : "Log in to add to cart"}</button>
        </div>
      )}
    </div>
  );
}

// ── 🗄️ Digital bookshelf ────────────────────────────────────────────────────
function BookshelfPanel() {
  const [shelf, setShelf] = useState(null);
  const themes = ["classic", "dark", "pastel"];

  useEffect(() => { apiFetch("/bookshelf").then(setShelf).catch(() => {}); }, []);

  const setTheme = async (theme) => {
    setShelf((prev) => ({ ...prev, theme }));
    await apiFetch("/bookshelf", { method: "PUT", body: { theme, featured: (shelf?.featured || []).map((p) => p.id) } }).catch(() => {});
  };

  return (
    <div className="card">
      <h3>My Digital Bookshelf</h3>
      <p style={{ fontSize: ".85rem", color: COLORS.gray, marginBottom: "1rem" }}>Auto-filled from your wishlist. Pick a shelf theme below.</p>
      <div className="shelf-themes">
        {themes.map((t) => (
          <button key={t} className={`discover-tab ${shelf?.theme === t ? "active" : ""}`} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {!shelf ? <p>Loading…</p> : (
        <div className={`shelf ${shelf.theme}`}>
          {shelf.featured.length === 0 ? (
            <p style={{ color: COLORS.gray, fontSize: ".85rem" }}>Wishlist a few items to fill your shelf! ❤️</p>
          ) : shelf.featured.map((p) => (
            <div key={p.id} className="shelf-item">
              <div>{p.img}</div>
              <div className="shelf-item-title">{p.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
