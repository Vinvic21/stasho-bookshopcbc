import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { apiFetch } from "../api";
import { COLORS, FONTS, GRADES } from "../theme";

const css = `
  .sv-page { max-width: 640px; margin: 0 auto; padding: 3rem 1.5rem 5rem; min-height: calc(100vh - 64px); }
  .sv-head h1 { font-family: ${FONTS.display}; font-size: 2rem; color: ${COLORS.greenDeep}; }
  .sv-head p { color: ${COLORS.gray}; margin-top: .4rem; }
  .sv-card {
    background: linear-gradient(135deg, ${COLORS.greenDeep}, ${COLORS.greenDark});
    color: #fff; border-radius: 18px; padding: 2rem; margin: 2rem 0; text-align: center;
  }
  .sv-balance { font-size: 2.4rem; font-weight: 700; font-family: ${FONTS.display}; }
  .sv-goal-label { opacity: .85; margin-top: .3rem; font-size: .9rem; }
  .sv-progress { background: rgba(255,255,255,.25); border-radius: 8px; height: 10px; margin-top: 1rem; overflow: hidden; }
  .sv-progress-fill { background: ${COLORS.goldLight}; height: 100%; transition: width .4s ease; }
  .sv-form { background: #fff; border: 1px solid ${COLORS.border}; border-radius: 14px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .sv-form h3 { margin-bottom: 1rem; font-size: 1.05rem; }
  .sv-row { display: flex; gap: .8rem; margin-bottom: .8rem; flex-wrap: wrap; }
  .sv-row input {
    flex: 1; min-width: 160px; padding: 11px 14px; border: 1.5px solid ${COLORS.border};
    border-radius: 10px; font-size: .95rem;
  }
  .sv-btn { padding: 12px 20px; background: ${COLORS.green}; color: #fff; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; }
  .sv-btn:hover { background: ${COLORS.greenDark}; }
  .sv-btn-outline { background: #fff; border: 1.5px solid ${COLORS.green}; color: ${COLORS.greenDark}; }
  .sv-status { font-size: .88rem; margin-top: .6rem; }
  .sv-coach { border: 1.5px solid ${COLORS.green}; }
  .sv-hint { font-size: .8rem; color: ${COLORS.gray}; margin-bottom: .8rem; }
  .sv-row select { flex: 1; min-width: 160px; padding: 11px 14px; border: 1.5px solid ${COLORS.border}; border-radius: 10px; font-size: .95rem; background: #fff; }
  .sv-chip { display: inline-block; padding: 3px 12px; border-radius: 14px; font-size: .78rem; font-weight: 700; margin-bottom: .6rem; }
  .sv-chip.on_track, .sv-chip.reached { background: ${COLORS.successBg}; color: ${COLORS.success}; }
  .sv-chip.behind, .sv-chip.deadline_passed { background: #FEE2E2; color: ${COLORS.red}; }
  .sv-chip.not_started { background: ${COLORS.warningBg}; color: ${COLORS.warning}; }
  .sv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: .6rem 0 1rem; }
  .sv-stat { background: ${COLORS.greenPale}; border-radius: 10px; padding: .7rem .9rem; }
  .sv-stat b { display: block; font-size: 1.15rem; color: ${COLORS.greenDark}; }
  .sv-stat span { font-size: .75rem; color: ${COLORS.gray}; }
  .sv-sched { width: 100%; border-collapse: collapse; font-size: .85rem; margin-bottom: .8rem; }
  .sv-sched td, .sv-sched th { text-align: left; padding: 5px 4px; border-top: 1px solid ${COLORS.border}; }
  .sv-tips { padding-left: 1.1rem; font-size: .85rem; line-height: 1.6; color: #374151; }
`;

export default function Savings({ onNavigate }) {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const [savings, setSavings] = useState({ balance: 0, goal_amount: 0, goal_label: "" });
  const [goalAmount, setGoalAmount] = useState("");
  const [goalLabel, setGoalLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  // Savings Coach
  const [deadline, setDeadline] = useState("");
  const [coachGrade, setCoachGrade] = useState("");
  const [coach, setCoach] = useState(null);
  const [coachErr, setCoachErr] = useState("");

  const load = () => apiFetch("/savings").then((s) => {
    setSavings(s);
    setGoalAmount(s.goal_amount || "");
    setGoalLabel(s.goal_label || "");
  });

  const loadCoach = () => apiFetch("/ai/savings-coach").then((r) => {
    setCoach(r.plan);
    if (r.plan) { setDeadline(r.plan.deadline); setCoachGrade(r.plan.grade || ""); }
  }).catch(() => {});

  useEffect(() => { if (user) { load(); loadCoach(); } }, [user]);

  if (!user) {
    return (
      <div style={{ textAlign: "center", padding: "6rem 2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔒</div>
        <h2>Please log in to use the School Fund</h2>
        <button className="btn-green" style={{ marginTop: "1.2rem" }} onClick={() => onNavigate("login")}>Go to Login</button>
      </div>
    );
  }

  const saveGoal = async () => {
    await apiFetch("/savings/goal", { method: "PUT", body: { goal_amount: Number(goalAmount) || 0, goal_label: goalLabel } });
    load();
    notify({ type: "order", icon: "🎯", title: "Goal saved", body: "Your School Fund goal has been updated.", duration: 5000 });
  };

  const deposit = async () => {
    if (!phone || !amount) { setStatus("Enter a phone number and amount."); return; }
    setStatus("Sending STK push…");
    try {
      const res = await apiFetch("/savings/deposit", { method: "POST", body: { phone, amount: Number(amount) } });
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const r = await apiFetch(`/mpesa/status/${res.checkout_id}`, { auth: false });
        if (r.status === "paid") {
          clearInterval(poll);
          setStatus("✅ Deposit confirmed!");
          setAmount(""); load(); loadCoach();
        } else if (r.status === "failed" || tries > 20) {
          clearInterval(poll);
          setStatus(r.message || "Deposit not completed. Try again.");
        }
      }, 3000);
    } catch (e) {
      setStatus(e.message);
    }
  };

  const runCoach = async () => {
    setCoachErr("");
    try {
      const r = await apiFetch("/ai/savings-coach", { method: "POST", body: { deadline, grade: coachGrade || "", goal_amount: Number(goalAmount) || 0 } });
      setCoach(r.plan);
    } catch (e) {
      setCoachErr(e.message);
    }
  };

  const useEstimateAsGoal = async () => {
    const amount = coach.estimate.new_total;
    await apiFetch("/savings/goal", { method: "PUT", body: { goal_amount: amount, goal_label: `${coach.estimate.grade} term kit` } });
    await load(); await runCoach();
    notify({ type: "order", icon: "🎯", title: "Goal updated", body: `Goal set to KSh ${amount.toLocaleString()}.`, duration: 5000 });
  };

  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  const STATUS_TEXT = { on_track: "On track", behind: "Behind pace", reached: "Goal reached", deadline_passed: "Deadline passed", not_started: "Let's get started" };

  const pct = savings.goal_amount > 0 ? Math.min(100, (savings.balance / savings.goal_amount) * 100) : 0;

  return (
    <>
      <style>{css}</style>
      <div className="sv-page">
        <div className="sv-head">
          <h1>🐷 School Fund</h1>
          <p>Save toward next term's books and stationery via M-Pesa, a little at a time.</p>
        </div>

        <div className="sv-card">
          <div className="sv-balance">KSh {savings.balance.toLocaleString()}</div>
          {savings.goal_amount > 0 && (
            <>
              <div className="sv-goal-label">{savings.goal_label || "Savings goal"}: KSh {savings.goal_amount.toLocaleString()}</div>
              <div className="sv-progress"><div className="sv-progress-fill" style={{ width: `${pct}%` }} /></div>
            </>
          )}
        </div>

        <div className="sv-form">
          <h3>🎯 Set a goal</h3>
          <div className="sv-row">
            <input placeholder="Goal label, e.g. Term 2 fees" value={goalLabel} onChange={(e) => setGoalLabel(e.target.value)} />
            <input placeholder="Goal amount (KSh)" type="number" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
          </div>
          <button className="sv-btn sv-btn-outline" onClick={saveGoal}>Save Goal</button>
        </div>

        <div className="sv-form sv-coach">
          <h3>🤖 Savings Coach</h3>
          <div className="sv-hint">Pick the date you need the money by. I'll work out how much to save each week and tell you if you're on pace.
            Choose a grade and I can estimate the goal from a typical term kit.</div>
          <div className="sv-row">
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <select value={coachGrade} onChange={(e) => setCoachGrade(e.target.value)}>
              <option value="">Use my goal amount</option>
              {GRADES.filter((g) => g !== "All Grades").map((g) => <option key={g} value={g}>Estimate from {g} kit</option>)}
            </select>
          </div>
          <button className="sv-btn" onClick={runCoach} disabled={!deadline}>Coach me</button>
          {coachErr && <div className="sv-status" style={{ color: COLORS.red }}>{coachErr}</div>}

          {coach && (
            <div style={{ marginTop: "1rem" }}>
              <span className={`sv-chip ${coach.status}`}>{STATUS_TEXT[coach.status]}</span>
              <div className="sv-stats">
                <div className="sv-stat"><b>KSh {coach.remaining.toLocaleString()}</b><span>still to save of KSh {coach.goal.toLocaleString()}</span></div>
                <div className="sv-stat"><b>{Math.max(coach.days_left, 0)} days</b><span>until {fmtDate(coach.deadline)}</span></div>
                {coach.weekly_needed > 0 && <div className="sv-stat"><b>KSh {coach.weekly_needed.toLocaleString()}</b><span>per week needed</span></div>}
                {coach.monthly_needed > 0 && <div className="sv-stat"><b>KSh {coach.monthly_needed.toLocaleString()}</b><span>per month needed</span></div>}
                {coach.pace_per_week && <div className="sv-stat"><b>KSh {coach.pace_per_week.toLocaleString()}</b><span>your recent pace per week</span></div>}
              </div>
              {coach.schedule.length > 0 && (
                <table className="sv-sched">
                  <thead><tr><th>By</th><th>Balance target</th></tr></thead>
                  <tbody>{coach.schedule.map((s) => <tr key={s.date}><td>{fmtDate(s.date)}</td><td>KSh {s.target_balance.toLocaleString()}</td></tr>)}</tbody>
                </table>
              )}
              {coach.estimate && (
                <div className="sv-hint">
                  A typical {coach.estimate.grade} kit costs about KSh {coach.estimate.new_total.toLocaleString()} new
                  {coach.estimate.used_count > 0 && <>; buying {coach.estimate.used_count} item{coach.estimate.used_count !== 1 ? "s" : ""} used from Resell brings it to about KSh {coach.estimate.smart_total.toLocaleString()}</>}.
                  {Math.round(savings.goal_amount) !== Math.round(coach.estimate.new_total) && (
                    <> <button className="sv-btn sv-btn-outline" style={{ padding: "6px 12px", marginLeft: 6 }} onClick={useEstimateAsGoal}>Set my goal to KSh {coach.estimate.new_total.toLocaleString()}</button></>
                  )}
                </div>
              )}
              {coach.tips.length > 0 && <ul className="sv-tips">{coach.tips.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
          )}
        </div>

        <div className="sv-form">
          <h3>📲 Deposit via M-Pesa</h3>
          <div className="sv-row">
            <input placeholder="M-Pesa phone, e.g. 0712345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input placeholder="Amount (KSh)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className="sv-btn" onClick={deposit}>Confirm & Deposit</button>
          {status && <div className="sv-status">{status}</div>}
        </div>
      </div>
    </>
  );
}