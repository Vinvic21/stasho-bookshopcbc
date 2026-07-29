// src/context/WishlistContext.jsx
// ─── Wishlist Context ───────────────────────────────────────────────────────
// Smart Wishlist (feature): loads the signed-in user's saved items from the
// backend, lets any page toggle a product in/out of it, and — the "smart"
// part — surfaces a toast via NotificationContext whenever a wishlisted
// item's price has dropped since it was saved (`price_dropped` comes back
// from GET /api/wishlist). Once shown, we "ack" the new price server-side so
// the same drop doesn't toast again next visit.

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";
import { apiFetch } from "../api";

const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(false);
  const announced = useRef(new Set());

  const refresh = async () => {
    if (!user) { setWishlist([]); return; }
    setLoading(true);
    try {
      const items = await apiFetch("/wishlist");
      setWishlist(items);

      // Fire a price-drop toast for anything that dropped since we last saw it.
      for (const item of items) {
        if (item.price_dropped && !announced.current.has(item.id)) {
          announced.current.add(item.id);
          notify({
            type: "stock",
            icon: "🔻",
            title: "Price drop on your wishlist!",
            body: `${item.title} is now KSh ${item.price.toLocaleString()} (was KSh ${item.last_seen_price.toLocaleString()}).`,
            duration: 8000,
          });
          apiFetch(`/wishlist/${item.id}/ack-price`, { method: "POST" }).catch(() => {});
        }
      }
    } catch {
      // ignore — wishlist is a nice-to-have, never block the page on it
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [user]);

  const isWishlisted = (productId) => wishlist.some((i) => i.id === productId);

  const addToWishlist = async (productId) => {
    if (!user) return;
    await apiFetch("/wishlist", { method: "POST", body: { product_id: productId } });
    await refresh();
  };

  const removeFromWishlist = async (productId) => {
    if (!user) return;
    setWishlist((prev) => prev.filter((i) => i.id !== productId));
    await apiFetch(`/wishlist/${productId}`, { method: "DELETE" });
  };

  const toggleWishlist = async (productId) => {
    if (isWishlisted(productId)) await removeFromWishlist(productId);
    else await addToWishlist(productId);
  };

  return (
    <WishlistContext.Provider value={{ wishlist, loading, isWishlisted, addToWishlist, removeFromWishlist, toggleWishlist, refresh }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return ctx;
}
