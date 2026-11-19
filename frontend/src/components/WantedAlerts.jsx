// src/components/WantedAlerts.jsx
// ─── Wanted Board alerts ─────────────────────────────────────────────────────
// Invisible helper. While a user is logged in it checks every minute or so for
// new Resell listings that match their open "Wanted" requests and pops a toast
// once per listing.

import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { apiFetch } from "../api";

export default function WantedAlerts() {
  const { user } = useAuth();
  const { notify } = useNotifications();

  useEffect(() => {
    if (!user) return;
    let stop = false;
    const check = async () => {
      try {
        const alerts = await apiFetch("/ai/wanted/alerts");
        if (stop) return;
        alerts.forEach((a) =>
          notify({
            type: "order", icon: "📢", duration: 9000,
            title: "A book you wanted was just listed",
            body: `${a.listing.title} · KSh ${a.listing.price.toLocaleString()} from ${a.listing.seller}. Open Resell → Wanted to message them.`,
          })
        );
      } catch { /* offline or not logged in: ignore */ }
    };
    const first = setTimeout(check, 2500);
    const timer = setInterval(check, 60000);
    return () => { stop = true; clearTimeout(first); clearInterval(timer); };
  }, [user, notify]);

  return null;
}