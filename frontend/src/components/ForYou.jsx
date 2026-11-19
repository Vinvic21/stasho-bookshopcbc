// src/components/ForYou.jsx
// ─── AI "Picked for you" ─────────────────────────────────────────────────────
// Personalised recommendations from the shopper's orders, wishlist and viewing
// history plus what other parents buy together. Each pick says WHY it was chosen.
// Guests see what's popular with other parents instead.

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api";
import ProductCard from "./ProductCard";
import { COLORS } from "../theme";

const css = `
  .foryou-reason {
    font-size: .76rem; color: ${COLORS.greenDark}; background: ${COLORS.greenPale};
    border-radius: 0 0 12px 12px; padding: 6px 12px; margin-top: -6px; font-weight: 600;
  }
`;

export default function ForYou({ onNavigate, limit = 4, grade }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (grade) qs.set("grade", grade);
    apiFetch(`/ai/recommendations?${qs}`).then(setData).catch(() => setData(null));
  }, [user, limit, grade]);

  if (!data || data.results.length === 0) return null;

  return (
    <>
      <style>{css}</style>
      <div className="home-section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">{data.personalised ? "✨ Picked for you" : "🔥 Popular with parents"}</h2>
        <p className="section-sub">
          {data.personalised
            ? "Based on what you've bought, saved and looked at, and what similar shoppers pick."
            : "Log in and browse a little, and these picks will become personal."}
        </p>
        <div className="products-grid">
          {data.results.map((p) => (
            <div key={p.id}>
              <ProductCard product={p} onNavigate={onNavigate} />
              <div className="foryou-reason">💡 {p.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}