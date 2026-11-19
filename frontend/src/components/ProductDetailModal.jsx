// src/components/ProductDetailModal.jsx
// ─── Product Detail Modal ───────────────────────────────────────────────────
// Opened when a shopper clicks a product's image/title. Combines three
// engagement features in one place:
//   • AI Review Analyzer  — rule-based summary (verdict, praise, complaints)
//   • Reviews             — read + leave a star rating & comment
//   • Similar products    — "You might also like" strip from the similarity engine

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { apiFetch } from "../api";
import { COLORS, FONTS } from "../theme";

const css = `
  .pdm-overlay {
    position: fixed; inset: 0; background: rgba(10,20,15,.55);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 3rem 1rem; z-index: 300; overflow-y: auto;
  }
  .pdm-card {
    background: #fff; border-radius: 18px; max-width: 640px; width: 100%;
    padding: 1.75rem; position: relative; box-shadow: 0 20px 60px rgba(0,0,0,.3);
  }
  .pdm-close {
    position: absolute; top: 14px; right: 14px; background: ${COLORS.grayLight};
    border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1rem;
  }
  .pdm-head { display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem; }
  .pdm-img { font-size: 3rem; background: ${COLORS.greenPale}; border-radius: 14px; width: 80px; height: 80px; display:flex; align-items:center; justify-content:center; flex-shrink: 0; }
  .pdm-title { font-family: ${FONTS.display}; font-size: 1.25rem; font-weight: 700; margin-bottom: 3px; }
  .pdm-meta { font-size: .85rem; color: ${COLORS.gray}; }
  .pdm-price { font-family: ${FONTS.display}; color: ${COLORS.green}; font-weight: 700; font-size: 1.1rem; margin-top: 4px; }
  .pdm-section-title { font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: ${COLORS.gray}; margin: 1.25rem 0 .6rem; }
  .pdm-summary-box { background: ${COLORS.greenPale}; border-radius: 12px; padding: .9rem 1rem; font-size: .88rem; }
  .pdm-summary-avg { font-weight: 700; color: ${COLORS.green}; }
  .pdm-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .pdm-tag { font-size: .74rem; padding: 3px 9px; border-radius: 12px; font-weight: 600; }
  .pdm-tag.praise { background: #D1FAE5; color: ${COLORS.success}; }
  .pdm-tag.complaint { background: #FEE2E2; color: ${COLORS.red}; }
  .pdm-breakdown { margin-top: 6px; font-size: .8rem; color: ${COLORS.gray}; }
  .pdm-aspect { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; padding: 5px 0; border-top: 1px dashed ${COLORS.border}; font-size: .82rem; }
  .pdm-aspect:first-of-type { margin-top: 8px; }
  .pdm-aspect b { min-width: 150px; }
  .pdm-pill { font-size: .7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
  .pdm-pill.Praised { background: #D1FAE5; color: ${COLORS.success}; }
  .pdm-pill.Criticised { background: #FEE2E2; color: ${COLORS.red}; }
  .pdm-pill.Mixed, .pdm-pill.Mentioned { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .pdm-quote { color: ${COLORS.gray}; font-style: italic; flex-basis: 100%; }
  .pdm-warn { margin-top: 8px; font-size: .78rem; color: ${COLORS.warning}; background: ${COLORS.warningBg}; border-radius: 8px; padding: 6px 10px; }
  .pdm-review { border-top: 1px solid ${COLORS.border}; padding: .7rem 0; font-size: .85rem; }
  .pdm-review-stars { color: ${COLORS.gold}; font-size: .85rem; }
  .pdm-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .pdm-form select, .pdm-form textarea {
    border: 1.5px solid ${COLORS.border}; border-radius: 8px; padding: 8px 10px; font-size: .85rem; font-family: ${FONTS.body};
  }
  .pdm-form button {
    align-self: flex-start; background: ${COLORS.green}; color: #fff; border: none;
    border-radius: 8px; padding: 8px 16px; font-size: .85rem; font-weight: 600; cursor: pointer;
  }
  .pdm-similar-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
  .pdm-similar-card {
    flex: 0 0 120px; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 8px; text-align: center; cursor: pointer;
  }
  .pdm-similar-card:hover { border-color: ${COLORS.green}; }
  .pdm-similar-img { font-size: 1.8rem; }
  .pdm-similar-title { font-size: .72rem; font-weight: 600; margin: 4px 0 2px; line-height: 1.3; }
  .pdm-similar-price { font-size: .72rem; color: ${COLORS.green}; font-weight: 700; }
  .pdm-add-btn { margin-top: 1rem; width: 100%; background: ${COLORS.gold}; color: #fff; border: none; border-radius: 10px; padding: 11px; font-weight: 700; cursor: pointer; }
`;

export default function ProductDetailModal({ product, onClose, onNavigate }) {
  const { user } = useAuth();
  const { addToCart } = useCart();
  const [summary, setSummary] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!product) return;
    apiFetch("/ai/track-view", { method: "POST", body: { product_id: product.id } }).catch(() => {}); // feeds "Picked for you"
    apiFetch(`/products/${product.id}/review-summary`, { auth: false }).then(setSummary).catch(() => {});
    apiFetch(`/products/${product.id}/reviews`, { auth: false }).then(setReviews).catch(() => {});
    apiFetch(`/products/${product.id}/similar`, { auth: false }).then(setSimilar).catch(() => {});
  }, [product]);

  if (!product) return null;

  const submitReview = async () => {
    if (!user) { onNavigate?.("login"); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/products/${product.id}/reviews`, { method: "POST", body: { rating, body } });
      const [s, r] = await Promise.all([
        apiFetch(`/products/${product.id}/review-summary`, { auth: false }),
        apiFetch(`/products/${product.id}/reviews`, { auth: false }),
      ]);
      setSummary(s); setReviews(r); setBody("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{css}</style>
      <div className="pdm-overlay" onClick={onClose}>
        <div className="pdm-card" onClick={(e) => e.stopPropagation()}>
          <button className="pdm-close" onClick={onClose}>✕</button>

          <div className="pdm-head">
            <div className="pdm-img">{product.img || "📦"}</div>
            <div>
              <div className="pdm-title">{product.title}</div>
              <div className="pdm-meta">{[product.grade, product.publisher].filter(Boolean).join(" • ")}</div>
              <div className="pdm-price">KSh {product.price.toLocaleString()}</div>
            </div>
          </div>

          {/* AI Review Insights: aspect-based summary from real review text */}
          <div className="pdm-section-title">Review insights</div>
          <div className="pdm-summary-box">
            {summary?.count ? (
              <>
                <span className="pdm-summary-avg">★ {summary.trusted_average ?? summary.average}/5</span> from {summary.count} review{summary.count !== 1 ? "s" : ""}. {summary.verdict}
                {summary.aspects?.length > 0 && (
                  <div>
                    {summary.aspects.map((a) => (
                      <div className="pdm-aspect" key={a.name}>
                        <b>{a.name}</b>
                        <span className={`pdm-pill ${a.label}`}>{a.label}</span>
                        <span>{a.mentions} mention{a.mentions !== 1 ? "s" : ""} · 👍 {a.positive} · 👎 {a.negative}</span>
                        {a.quote && <span className="pdm-quote">“{a.quote}”</span>}
                      </div>
                    ))}
                  </div>
                )}
                {summary.suspicious_count > 0 && (
                  <div className="pdm-warn">
                    🛡️ {summary.suspicious_count} review{summary.suspicious_count !== 1 ? "s look" : " looks"} unreliable
                    (copied text or contact details) and {summary.suspicious_count !== 1 ? "were" : "was"} left out of the insights above.
                  </div>
                )}
              </>
            ) : (
              <span>{summary?.verdict || "Loading…"}</span>
            )}
          </div>

          {/* Leave a review */}
          <div className="pdm-form">
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}{"☆".repeat(5 - n)}</option>)}
            </select>
            <textarea rows={2} placeholder={user ? "Share your thoughts about this item…" : "Log in to leave a review"} value={body} onChange={(e) => setBody(e.target.value)} disabled={!user} />
            <button onClick={submitReview} disabled={submitting}>{user ? "Post review" : "Log in to review"}</button>
          </div>

          {reviews.length > 0 && (
            <div>
              <div className="pdm-section-title">What readers say</div>
              {reviews.slice(0, 4).map((r) => (
                <div className="pdm-review" key={r.id}>
                  <div className="pdm-review-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} <b style={{ color: "#111827" }}>{r.user_name}</b></div>
                  {r.body && <div style={{ marginTop: 4 }}>{r.body}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Similarity engine */}
          {similar.length > 0 && (
            <>
              <div className="pdm-section-title">You might also like</div>
              <div className="pdm-similar-strip">
                {similar.map((p) => (
                  <div key={p.id} className="pdm-similar-card" onClick={() => { addToCart(p); }}>
                    <div className="pdm-similar-img">{p.img}</div>
                    <div className="pdm-similar-title">{p.title}</div>
                    <div className="pdm-similar-price">KSh {p.price.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button className="pdm-add-btn" onClick={() => (user ? addToCart(product) : onNavigate?.("login"))}>
            {user ? "+ Add to cart" : "🔒 Log in to add to cart"}
          </button>
        </div>
      </div>
    </>
  );
}