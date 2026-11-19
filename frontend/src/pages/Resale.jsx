import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { apiFetch } from "../api";
import { COLORS, FONTS } from "../theme";

const css = `
  .rs-page { max-width: 960px; margin: 0 auto; padding: 3rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .rs-head h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .rs-head p { color: ${COLORS.gray}; margin-top: .4rem; }
  .rs-tabs { display: flex; gap: .6rem; margin: 1.6rem 0; flex-wrap: wrap; }
  .rs-tab { padding: 9px 18px; border-radius: 30px; border: 1.5px solid ${COLORS.border}; background: #fff; cursor: pointer; font-weight: 600; font-size: .88rem; }
  .rs-tab.active { background: ${COLORS.greenPale}; border-color: ${COLORS.green}; color: ${COLORS.greenDark}; }
  .rs-form { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 14px; padding: 1.5rem; margin-bottom: 2rem; }
  .rs-row { display: flex; gap: .8rem; margin-bottom: .8rem; flex-wrap: wrap; }
  .rs-row input, .rs-row select {
    flex: 1; min-width: 150px; padding: 11px 14px; border: 1.5px solid ${COLORS.border};
    border-radius: 10px; font-size: .93rem;
  }
  .rs-btn { padding: 12px 20px; background: ${COLORS.green}; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; }
  .rs-btn:hover { background: ${COLORS.greenDark}; }
  .rs-btn-outline { background: #fff; border: 1.5px solid ${COLORS.green}; color: ${COLORS.greenDark}; }
  .rs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
  .rs-card { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 14px; padding: 1.2rem; }
  .rs-card-title { font-weight: 700; margin-bottom: .3rem; }
  .rs-card-meta { font-size: .82rem; color: ${COLORS.gray}; margin-bottom: .6rem; }
  .rs-card-price { color: ${COLORS.greenDark}; font-weight: 700; font-size: 1.05rem; }
  .rs-badge { display: inline-block; padding: 2px 8px; background: ${COLORS.greenPale}; color: ${COLORS.greenDark}; border-radius: 20px; font-size: .72rem; margin-bottom: .5rem; }
  .rs-empty { text-align: center; padding: 3rem; color: ${COLORS.gray}; grid-column: 1/-1; }
  .rs-remove { margin-top: .6rem; background: none; border: none; color: ${COLORS.red}; cursor: pointer; font-size: .82rem; padding: 0; }
  .rs-msg-btn { margin-top: .7rem; width: 100%; padding: 9px; background: ${COLORS.greenPale}; color: ${COLORS.greenDark}; border: none; border-radius: 8px; font-weight: 600; font-size: .82rem; cursor: pointer; }

  .rs-thread-list { display: flex; flex-direction: column; gap: .7rem; }
  .rs-thread { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 1rem 1.2rem; cursor: pointer; }
  .rs-thread:hover { border-color: ${COLORS.green}; }
  .rs-thread-top { display: flex; justify-content: space-between; font-size: .85rem; color: ${COLORS.gray}; margin-bottom: .3rem; }
  .rs-thread-title { font-weight: 700; }
  .rs-thread-preview { font-size: .85rem; color: ${COLORS.gray}; margin-top: .2rem; }

  .rs-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 1rem; }
  .rs-chat { background: #fff; border-radius: 16px; width: 100%; max-width: 480px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
  .rs-chat-head { background: ${COLORS.greenDeep}; color: #fff; padding: 1rem 1.4rem; }
  .rs-chat-head h3 { font-size: 1.05rem; }
  .rs-chat-head p { font-size: .8rem; opacity: .85; margin-top: .2rem; }
  .rs-chat-body { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; background: ${COLORS.grayLight}; }
  .rs-bubble { max-width: 78%; padding: 9px 13px; border-radius: 14px; font-size: .88rem; line-height: 1.4; }
  .rs-bubble.mine { align-self: flex-end; background: ${COLORS.green}; color: #fff; }
  .rs-bubble.theirs { align-self: flex-start; background: #fff; border: 1px solid ${COLORS.border}; }
  .rs-chat-input { display: flex; gap: .5rem; padding: .8rem; border-top: 1px solid ${COLORS.border}; }
  .rs-chat-input input { flex: 1; padding: 10px 12px; border: 1.5px solid ${COLORS.border}; border-radius: 10px; font-size: .88rem; }
  .rs-chat-input button { padding: 10px 16px; background: ${COLORS.green}; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; }
  .rs-chat-close { background: none; border: none; color: #fff; font-size: .85rem; cursor: pointer; float: right; }

  .rs-ai { background: ${COLORS.greenPale}; border: 1px dashed ${COLORS.green}; border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .rs-ai h4 { font-size: .95rem; margin-bottom: .3rem; color: ${COLORS.greenDark}; }
  .rs-ai p { font-size: .8rem; color: ${COLORS.gray}; margin-bottom: .6rem; }
  .rs-ai input[type=file] { font-size: .8rem; }
  .rs-ai-note { font-size: .8rem; margin-top: .5rem; color: ${COLORS.warning}; }
  .rs-textarea { width: 100%; padding: 11px 14px; border: 1.5px solid ${COLORS.border}; border-radius: 10px; font-size: .9rem; font-family: ${FONTS.body}; margin-bottom: .8rem; }
  .rs-advice { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 12px; padding: .9rem 1.1rem; margin-bottom: .8rem; font-size: .86rem; }
  .rs-advice .range { font-family: ${FONTS.display}; font-size: 1.2rem; color: ${COLORS.greenDark}; font-weight: 700; }
  .rs-advice ul { margin: .4rem 0 0; padding-left: 1.1rem; color: ${COLORS.gray}; font-size: .8rem; }
  .rs-kw { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: .8rem; }
  .rs-kw span { background: ${COLORS.grayLight}; border-radius: 10px; padding: 2px 9px; font-size: .74rem; }
  .rs-trust { display: block; margin: 0 0 .5rem; padding: 5px 9px; border-radius: 8px; font-size: .74rem; font-weight: 600; }
  .rs-trust.medium { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .rs-trust.high { background: #FEE2E2; color: ${COLORS.red}; }
  .rs-desc { font-size: .8rem; color: ${COLORS.gray}; margin: 0 0 .6rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .rs-warn { background: #FEF2F2; border-top: 1px solid #FECACA; padding: .7rem 1rem; font-size: .82rem; color: ${COLORS.red}; }
  .rs-warn ul { margin: .3rem 0 .5rem; padding-left: 1.1rem; }
  .rs-warn button { margin-right: 8px; padding: 6px 12px; border-radius: 8px; border: 1px solid ${COLORS.red}; background: #fff; color: ${COLORS.red}; font-size: .78rem; cursor: pointer; font-weight: 600; }
  .rs-safety { font-size: .72rem; padding: .4rem 1rem; background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
`;

const BLANK = { title: "", category: "", grade: "", condition: "Good", price: "", description: "" };

export default function Resale({ onNavigate }) {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const [tab, setTab] = useState("browse");
  const [listings, setListings] = useState([]);
  const [mine, setMine] = useState([]);
  const [threads, setThreads] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [activeThread, setActiveThread] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  // AI: listing assistant, price advisor, trust badges, scam warning in chat
  const [trust, setTrust] = useState({});
  const [photo, setPhoto] = useState(null);
  const [notes, setNotes] = useState("");
  const [assist, setAssist] = useState(null);
  const [assisting, setAssisting] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [adviceError, setAdviceError] = useState("");
  const [msgWarning, setMsgWarning] = useState(null);

  const loadBrowse = () => {
    apiFetch("/resale", { auth: false }).then(setListings);
    apiFetch("/ai/trust/listings", { auth: false }).then(setTrust).catch(() => {});
  };
  const loadMine = () => user && apiFetch("/resale/mine").then(setMine);
  const loadThreads = () => user && apiFetch("/resale/threads").then(setThreads);

  useEffect(() => { loadBrowse(); }, []);
  useEffect(() => { if (tab === "mine") loadMine(); if (tab === "messages") loadThreads(); }, [tab, user]);

  const submit = async () => {
    if (!user) { onNavigate("login"); return; }
    if (!form.title || !form.price) { notify({ type: "order", icon: "⚠️", title: "Missing info", body: "Title and price are required.", duration: 5000 }); return; }
    await apiFetch("/resale", { method: "POST", body: { ...form, price: Number(form.price) } });
    setForm(BLANK); setAssist(null); setAdvice(null); setNotes(""); setPhoto(null);
    notify({ type: "order", icon: "📚", title: "Listed for resale!", body: `"${form.title}" is now visible to other parents.`, duration: 6000 });
    loadBrowse(); loadMine();
  };

  const markSold = async (id) => {
    await apiFetch(`/resale/${id}`, { method: "PUT", body: { status: "sold" } });
    loadMine(); loadBrowse();
  };

  const openChat = async (threadId) => {
    setActiveThread(threadId);
    const msgs = await apiFetch(`/resale/threads/${threadId}/messages`);
    setChatMessages(msgs);
  };

  const messageSeller = async (listing) => {
    if (!user) { onNavigate("login"); return; }
    if (listing.seller_id === user.id) { notify({ type: "order", icon: "⚠️", title: "That's your listing", body: "You can't message yourself about your own book.", duration: 5000 }); return; }
    const res = await apiFetch(`/resale/${listing.id}/contact`, { method: "POST", body: {} });
    setTab("messages");
    await loadThreads();
    openChat(res.thread_id);
  };

  // AI Listing Assistant: scans a cover photo and/or the typed title, then fills in the form.
  const runAssistant = async () => {
    if (!user) { onNavigate("login"); return; }
    setAssisting(true); setAdvice(null); setAdviceError("");
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("category", form.category);
      fd.append("grade", form.grade);
      fd.append("notes", notes);
      if (photo) fd.append("image", photo);
      const res = await apiFetch("/ai/listing-assist", { method: "POST", body: fd });
      setAssist(res);
      setForm((f) => ({
        ...f,
        title: res.fields.title || f.title,
        category: res.fields.category || f.category,
        grade: res.fields.grade || f.grade,
        condition: res.suggested_condition || f.condition,
        description: res.description || f.description,
      }));
    } catch (e) {
      setAssist({ error: e.message });
    } finally {
      setAssisting(false);
    }
  };

  // AI Price Advisor: fair range from catalogue price, condition and similar listings.
  const getAdvice = async () => {
    setAdviceError(""); setAdvice(null);
    try {
      const res = await apiFetch("/ai/price-advice", {
        method: "POST", auth: false,
        body: { title: form.title, category: form.category, grade: form.grade, condition: form.condition, price: form.price || null },
      });
      setAdvice(res);
    } catch (e) {
      setAdviceError(e.message);
    }
  };

  const doSend = async () => {
    await apiFetch(`/resale/threads/${activeThread}/messages`, { method: "POST", body: { body: chatInput } });
    setChatInput(""); setMsgWarning(null);
    const msgs = await apiFetch(`/resale/threads/${activeThread}/messages`);
    setChatMessages(msgs);
    loadThreads();
  };

  // Trust Shield: warn before sending a message that looks like a scam pattern.
  const sendMessage = async () => {
    if (!chatInput.trim() || !activeThread) return;
    try {
      const check = await apiFetch("/ai/trust/check-message", { method: "POST", body: { body: chatInput } });
      if (check.level !== "low") { setMsgWarning(check); return; }
    } catch { /* if the check is unavailable, just send */ }
    await doSend();
  };

  const activeThreadInfo = threads.find((t) => t.thread_id === activeThread);

  return (
    <>
      <style>{css}</style>
      <div className="rs-page">
        <div className="rs-head">
          <h1>♻️ Buy & Sell Used Books</h1>
          <p>
            CBC materials get reused every year — sell what your child has outgrown, or find good-condition
            books at a lower price. Message the seller in-app to agree on price and delivery, then pay them
            directly via M-Pesa Send Money — like any peer-to-peer marketplace, Stasho doesn't move money
            between two individuals for you.
          </p>
        </div>

        <div className="rs-tabs">
          <div className={`rs-tab ${tab === "browse" ? "active" : ""}`} onClick={() => setTab("browse")}>Browse Listings</div>
          <div className={`rs-tab ${tab === "sell" ? "active" : ""}`} onClick={() => setTab("sell")}>Sell a Book</div>
          {user && <div className={`rs-tab ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>My Listings</div>}
          {user && <div className={`rs-tab ${tab === "messages" ? "active" : ""}`} onClick={() => setTab("messages")}>Messages</div>}
        </div>

        {tab === "sell" && (
          <div className="rs-form">
            <div className="rs-ai">
              <h4>✨ AI Listing Assistant</h4>
              <p>Snap the cover or type the title, add a few notes about the book's condition, and I'll fill in the
                 category, grade, condition and a description. You can edit everything before listing.</p>
              <div className="rs-row">
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                <input placeholder="Condition notes, e.g. a few pencil marks, bent corners" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button className="rs-btn" onClick={runAssistant} disabled={assisting || (!form.title && !photo)}>
                {assisting ? "Working…" : "✨ Auto-fill my listing"}
              </button>
              {assist?.error && <div className="rs-ai-note">⚠️ {assist.error}</div>}
              {assist?.scan?.error && <div className="rs-ai-note">📷 {assist.scan.error}</div>}
              {assist && !assist.error && (
                <div style={{ marginTop: ".7rem", fontSize: ".82rem" }}>
                  {assist.scan?.used && assist.scan.matches?.length > 0 && <div>📷 Cover recognised as <b>{assist.scan.matches[0].title}</b>.</div>}
                  <div>Suggested condition: <b>{assist.suggested_condition}</b>
                    {assist.condition_reasons?.length > 0 && ` (${assist.condition_reasons.join(", ")})`}
                    . Please check it matches your copy.</div>
                  {assist.keywords?.length > 0 && <div className="rs-kw" style={{ marginTop: ".5rem" }}>{assist.keywords.map((k) => <span key={k}>{k}</span>)}</div>}
                </div>
              )}
            </div>

            <div className="rs-row">
              <input placeholder="Title, e.g. CBC Mathematics Grade 4" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="rs-row">
              <input placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                <option>Good</option><option>Fair</option><option>Like New</option>
              </select>
              <input placeholder="Price (KSh)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <textarea className="rs-textarea" rows={3} placeholder="Description (the assistant can write this for you)"
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <button className="rs-btn rs-btn-outline" style={{ marginBottom: ".8rem" }} onClick={getAdvice} disabled={!form.title}>💡 Suggest a fair price</button>
            {adviceError && <div className="rs-ai-note" style={{ marginTop: 0 }}>{adviceError}</div>}
            {advice && (
              <div className="rs-advice">
                <div>Fair price range: <span className="range">KSh {advice.low.toLocaleString()} to {advice.high.toLocaleString()}</span>
                  {" "}(best guess <b>KSh {advice.suggested.toLocaleString()}</b>, {advice.confidence} confidence)</div>
                {advice.verdict && <div style={{ marginTop: 4, fontWeight: 600 }}>{advice.verdict.text}</div>}
                <ul>{advice.basis.map((b) => <li key={b}>{b}</li>)}</ul>
                <button className="rs-btn rs-btn-outline" style={{ marginTop: ".6rem", padding: "7px 14px" }}
                  onClick={() => setForm({ ...form, price: String(advice.suggested) })}>Use KSh {advice.suggested.toLocaleString()}</button>
              </div>
            )}

            <button className="rs-btn" onClick={submit}>{user ? "List for Sale" : "🔒 Login to list a book"}</button>
          </div>
        )}

        {tab === "browse" && (
          <div className="rs-grid">
            {listings.length === 0 && <div className="rs-empty">No listings yet — be the first to sell a used book!</div>}
            {listings.map((l) => (
              <div className="rs-card" key={l.id}>
                <div className="rs-badge">{l.condition}</div>
                {trust[l.id] && trust[l.id].level !== "low" && (
                  <span className={`rs-trust ${trust[l.id].level}`} title={trust[l.id].reasons.join("\n")}>
                    {trust[l.id].level === "high" ? "⚠️ High risk: " : "⚠️ Check details: "}{trust[l.id].reasons[0]}
                  </span>
                )}
                <div className="rs-card-title">{l.title}</div>
                <div className="rs-card-meta">{l.category} {l.grade && `· ${l.grade}`}</div>
                {l.description && <div className="rs-desc">{l.description}</div>}
                <div className="rs-card-price">KSh {l.price.toLocaleString()}</div>
                {(!user || user.id !== l.seller_id) && (
                  <button className="rs-msg-btn" onClick={() => messageSeller(l)}>
                    {user ? "💬 Message Seller" : "🔒 Login to message seller"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "mine" && (
          <div className="rs-grid">
            {mine.length === 0 && <div className="rs-empty">You haven't listed any books yet.</div>}
            {mine.map((l) => (
              <div className="rs-card" key={l.id}>
                <div className="rs-badge">{l.status}</div>
                <div className="rs-card-title">{l.title}</div>
                <div className="rs-card-meta">{l.category} {l.grade && `· ${l.grade}`}</div>
                <div className="rs-card-price">KSh {l.price.toLocaleString()}</div>
                {l.status === "active" && <button className="rs-remove" onClick={() => markSold(l.id)}>Mark as sold</button>}
              </div>
            ))}
          </div>
        )}

        {tab === "messages" && (
          <div className="rs-thread-list">
            {threads.length === 0 && <div className="rs-empty">No conversations yet — message a seller from Browse Listings.</div>}
            {threads.map((t) => (
              <div className="rs-thread" key={t.thread_id} onClick={() => openChat(t.thread_id)}>
                <div className="rs-thread-top">
                  <span>{t.role === "buyer" ? `Seller: ${t.other_party}` : `Buyer: ${t.other_party}`}</span>
                  <span>KSh {t.listing_price.toLocaleString()}</span>
                </div>
                <div className="rs-thread-title">{t.listing_title}</div>
                {t.last_message && <div className="rs-thread-preview">{t.last_message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {activeThread && (
        <div className="rs-overlay" onClick={() => setActiveThread(null)}>
          <div className="rs-chat" onClick={(e) => e.stopPropagation()}>
            <div className="rs-chat-head">
              <button className="rs-chat-close" onClick={() => setActiveThread(null)}>✕ Close</button>
              <h3>{activeThreadInfo?.listing_title || "Conversation"}</h3>
              <p>{activeThreadInfo ? `${activeThreadInfo.role === "buyer" ? "Seller" : "Buyer"}: ${activeThreadInfo.other_party}` : ""}</p>
            </div>
            <div className="rs-safety">🛡️ Never pay before you've seen the book, and never share your M-Pesa PIN or codes.</div>
            <div className="rs-chat-body">
              {chatMessages.map((m) => (
                <div key={m.id} className={`rs-bubble ${m.sender_id === user.id ? "mine" : "theirs"}`}>{m.body}</div>
              ))}
            </div>
            {msgWarning && (
              <div className="rs-warn">
                <b>⚠️ This message looks risky:</b>
                <ul>{msgWarning.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                <button onClick={doSend}>Send anyway</button>
                <button onClick={() => setMsgWarning(null)}>Edit message</button>
              </div>
            )}
            <div className="rs-chat-input">
              <input placeholder="Type a message…" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
              <button onClick={sendMessage}>Send</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}