import { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { useProducts } from "../context/ProductsContext";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import ProductCard from "../components/ProductCard";
import ProductDetailModal from "../components/ProductDetailModal";
import { COLORS, CATEGORIES, GRADES, CBC_KITS } from "../theme";

const css = `
  .shop-page { max-width: 1200px; margin: 0 auto; padding: 2.5rem 1.5rem; }
  .shop-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .filters {
    display: flex;
    gap: .85rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .search-wrap {
    flex: 1;
    min-width: 220px;
    position: relative;
  }
  .search-wrap input {
    width: 100%;
    padding: 10px 16px 10px 40px;
    border: 1.5px solid ${COLORS.border};
    border-radius: 10px;
    font-size: .93rem;
    outline: none;
    transition: border-color .2s;
    background: #fff;
  }
  .search-wrap input:focus { border-color: ${COLORS.green}; }
  .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 1.05rem; }
  .mic-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; font-size: 1.1rem; cursor: pointer;
    border-radius: 50%; width: 30px; height: 30px;
  }
  .mic-btn.listening { animation: mic-pulse 1s infinite; }
  @keyframes mic-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  .filter-select {
    padding: 10px 14px;
    border: 1.5px solid ${COLORS.border};
    border-radius: 10px;
    font-size: .88rem;
    outline: none;
    background: #fff;
    cursor: pointer;
  }
  .filter-select:focus { border-color: ${COLORS.green}; }

  .cat-chips { display: flex; gap: 8px; margin-bottom: 2rem; flex-wrap: wrap; }
  .chip {
    padding: 7px 16px;
    border-radius: 20px;
    border: 1.5px solid ${COLORS.border};
    background: #fff;
    font-size: .83rem;
    font-weight: 500;
    cursor: pointer;
    transition: all .18s;
    color: #374151;
  }
  .chip:hover { border-color: ${COLORS.green}; color: ${COLORS.green}; }
  .chip.active { background: ${COLORS.green}; color: #fff; border-color: ${COLORS.green}; }

  .empty-state {
    text-align: center;
    padding: 5rem 1rem;
    color: ${COLORS.gray};
  }
  .empty-state div { font-size: 3.5rem; margin-bottom: 1rem; }

  .result-count {
    font-size: .85rem;
    color: ${COLORS.gray};
    font-weight: 500;
  }

  .ai-understood {
    display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    margin: -.6rem 0 1.2rem; font-size: .8rem; color: ${COLORS.gray};
  }
  .ai-chip {
    background: ${COLORS.greenPale}; color: ${COLORS.greenDark}; border-radius: 14px;
    padding: 3px 10px; font-weight: 600; font-size: .76rem;
  }
  .ai-note { margin: -.6rem 0 1.2rem; font-size: .85rem; color: ${COLORS.gray}; }
  .ai-note button { background: none; border: none; color: ${COLORS.green}; font-weight: 700; cursor: pointer; text-decoration: underline; padding: 0 4px; }
  .why-line { font-size: .72rem; color: ${COLORS.gray}; margin-top: 2px; }
  .lang-btn {
    padding: 10px 12px; border: 1.5px solid ${COLORS.border}; border-radius: 10px; background: #fff;
    font-size: .8rem; font-weight: 700; cursor: pointer; color: ${COLORS.greenDark};
  }
`;

export default function Shop({ onNavigate, initialFilters }) {
  const { products, deleteProduct } = useProducts();
  const { addManyToCart } = useCart();
  const { isAdmin, user } = useAuth();
  const [search,   setSearch]   = useState("");
  const [category, setCategory] = useState(initialFilters?.category || "All");
  const [grade,    setGrade]    = useState(initialFilters?.grade || "All Grades");
  const [editItem, setEditItem] = useState(null);   

  
  const [kitGrade,   setKitGrade]   = useState(initialFilters?.grade && CBC_KITS[initialFilters.grade] ? initialFilters.grade : "Grade 1");
  const [kitAdded,   setKitAdded]   = useState(false);
  const [listening,  setListening]  = useState(false);
  const [voiceLang,  setVoiceLang]  = useState("en-KE");   // "en-KE" or "sw-KE"
  const [ai,         setAi]         = useState(null);       // smart-search response, or null for plain browsing
  const [detailProduct, setDetailProduct] = useState(null);

  // Voice Search — uses the browser's built-in Web Speech API, no backend needed.
  const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const handleVoiceSearch = () => {
    if (!SpeechRecognition) { alert("Voice search isn't supported in this browser. Try Chrome on desktop or Android."); return; }
    const recognizer = new SpeechRecognition();
    recognizer.lang = voiceLang;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onstart = () => setListening(true);
    recognizer.onend = () => setListening(false);
    recognizer.onerror = () => setListening(false);
    recognizer.onresult = (e) => setSearch(e.results[0][0].transcript);
    recognizer.start();
  };

  
  useEffect(() => {
    if (initialFilters?.category) setCategory(initialFilters.category);
    if (initialFilters?.grade)     setGrade(initialFilters.grade);
  }, [initialFilters]);

  // AI Smart Search: understands things like "maths grade 4 under 500" or "darasa la 5 kiswahili".
  // Falls back to the simple filter below if the server can't be reached.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setAi(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch(`/ai/search?q=${encodeURIComponent(q)}`, { auth: false })
        .then((res) => { if (!cancelled) setAi(res); })
        .catch(() => { if (!cancelled) setAi(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const matchesDropdowns = (p) =>
    (category === "All" || p.category === category) &&
    (grade === "All Grades" || p.grade === grade);

  const filtered = ai
    ? ai.results.filter(matchesDropdowns)
    : products.filter((p) => {
        const q = search.toLowerCase();
        return (p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) && matchesDropdowns(p);
      });

  const parsed = ai?.parsed || {};
  const understood = [
    parsed.grade && parsed.grade,
    parsed.category && parsed.category,
    parsed.set_books && "KCSE set books",
    parsed.budget != null && `under KSh ${Number(parsed.budget).toLocaleString()}`,
    parsed.cheapest_first && "cheapest first",
  ].filter(Boolean);

  const kit = CBC_KITS[kitGrade];
  const kitItems = kit ? products.filter((p) => kit.productIds.includes(p.id)) : [];
  const kitTotal = kitItems.reduce((s, p) => s + p.price, 0);

  const handleAddKit = () => {
    if (!user) { onNavigate("login"); return; }
    addManyToCart(kitItems);
    setKitAdded(true);
    setTimeout(() => setKitAdded(false), 3000);
  };

  return (
    <>
      <style>{css}</style>
      <div className="shop-page">
        <div className="shop-header">
          <div>
            <h1 className="section-title">Shop CBC Materials</h1>
            <p className="result-count">{filtered.length} product{filtered.length !== 1 ? "s" : ""} found</p>
          </div>
          {isAdmin && (
            <button className="btn-primary" onClick={() => onNavigate("add-products")}>
              ➕ Add New Product
            </button>
          )}
        </div>

        
        <div className="kit-banner">
          <div className="kit-banner-text">
            <div className="kit-banner-title">🎒 Quick CBC Kits</div>
            <div className="kit-banner-sub">
              Pick a grade and add the full set of recommended books & stationery in one click.
            </div>
          </div>
          <div className="kit-controls">
            <select className="kit-select" value={kitGrade} onChange={(e) => setKitGrade(e.target.value)}>
              {Object.keys(CBC_KITS).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <button className="kit-add-btn" onClick={handleAddKit}>
              ➕ Add Full {kitGrade} Kit to Cart
            </button>
          </div>

          {kit && (
            <div className="kit-preview">
              {kitItems.map((p) => (
                <span className="kit-chip" key={p.id}>{p.img} {p.title}</span>
              ))}
              <span className="kit-total" style={{ marginLeft: "auto" }}>
                Total: KSh {kitTotal.toLocaleString()}
              </span>
            </div>
          )}

          {kitAdded && (
            <div className="kit-added-toast">
              ✅ {kit.label} added to your cart — {kitItems.length} items (KSh {kitTotal.toLocaleString()})!
            </div>
          )}
        </div>

        
        <div className="filters">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
              placeholder={`Try "maths grade 4 under 500" or "darasa la 5 kiswahili"`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {SpeechRecognition && (
              <button
                className={`mic-btn ${listening ? "listening" : ""}`}
                onClick={handleVoiceSearch}
                title="Search by voice"
                type="button"
              >🎤</button>
            )}
          </div>
          {SpeechRecognition && (
            <button className="lang-btn" type="button" title="Voice search language"
              onClick={() => setVoiceLang((l) => (l === "en-KE" ? "sw-KE" : "en-KE"))}>
              🎤 {voiceLang === "en-KE" ? "EN" : "SW"}
            </button>
          )}
          <select className="filter-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>

        {ai && understood.length > 0 && (
          <div className="ai-understood">
            🧠 Understood:
            {understood.map((u) => <span className="ai-chip" key={u}>{u}</span>)}
          </div>
        )}
        {ai && ai.message && filtered.length === 0 && (
          <div className="ai-note">
            {ai.message}
            {(ai.parsed?.did_you_mean || []).map((w) => (
              <button key={w} onClick={() => setSearch(w)}>{w}?</button>
            ))}
          </div>
        )}

        <div className="cat-chips">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`chip ${category === c ? "active" : ""}`}
              onClick={() => setCategory(c)}
            >{c}</button>
          ))}
        </div>

        {}
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div>🔍</div>
            <p>No products found.<br />Try a different search or filter.</p>
          </div>
        ) : (
          <div className="products-grid">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                showAdminActions={isAdmin}
                onEdit={setEditItem}
                onDelete={deleteProduct}
                onNavigate={onNavigate}
                onOpenDetail={setDetailProduct}
              />
            ))}
          </div>
        )}

        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onNavigate={onNavigate}
        />
      </div>
    </>
  );
}