import { useState, useMemo, useCallback, useEffect } from "react";

// ── API helpers ──────────────────────────────────────────────────────────────
const API = "http://localhost:8000";

async function fetchLivePrices(tickers) {
  if (!tickers.length) return {};
  try {
    const res = await fetch(`${API}/api/prices?tickers=${tickers.join(",")}`);
    return await res.json();
  } catch { return {}; }
}

async function loadHoldings(token) {
  const res = await fetch(`${API}/api/holdings`, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

async function saveHolding(holding, token) {
  const res = await fetch(`${API}/api/holdings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(holding),
  });
  return await res.json();
}

async function deleteHolding(id, token) {
  await fetch(`${API}/api/holdings/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
}

async function loadSettings(token) {
  const res = await fetch(`${API}/api/settings`, { headers: { Authorization: `Bearer ${token}` } });
  return await res.json();
}

async function saveSettings(data, token) {
  await fetch(`${API}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

// ── Portfolio logic ───────────────────────────────────────────────────────────
function scorePortfolio(holdings, prices, goal, weeklyDeposit) {
  if (!holdings.length) return { score: 0, breakdown: [], totalValue: 0, projected: 0, etfPct: 0, goalProgress: 0 };
  const getP = t => prices[t.toUpperCase()] || 0;
  const totalValue = holdings.reduce((s, h) => s + h.shares * getP(h.ticker), 0);
  const etfVal = holdings.filter(h => h.type === "ETF").reduce((s, h) => s + h.shares * getP(h.ticker), 0);
  const etfPct = totalValue ? etfVal / totalValue : 0;
  const projected = totalValue + weeklyDeposit * 52;
  const goalProgress = goal ? Math.min(projected / goal, 1) : 0;
  const d = Math.min(holdings.length * 12, 30);
  const e = Math.round(etfPct * 25);
  const g = Math.round(goalProgress * 30);
  const dep = weeklyDeposit >= 50 ? 15 : Math.round((weeklyDeposit / 50) * 15);
  return {
    score: Math.min(Math.round((d + e + g + dep) / 10), 10),
    breakdown: [
      { label: "DIVERSIFICATION", pts: d, max: 30 },
      { label: "ETF ALLOCATION", pts: e, max: 25 },
      { label: "GOAL PROGRESS", pts: g, max: 30 },
      { label: "DEPOSIT HABIT", pts: dep, max: 15 },
    ],
    totalValue, projected, etfPct, goalProgress,
  };
}

function getRecommendations(holdings, prices, weeklyDeposit) {
  const getP = t => prices[t?.toUpperCase()] || 0;
  const totalValue = holdings.reduce((s, h) => s + h.shares * getP(h.ticker), 0);
  const etfPct = totalValue ? holdings.filter(h => h.type === "ETF").reduce((s, h) => s + h.shares * getP(h.ticker), 0) / totalValue : 0;
  const numStocks = holdings.filter(h => h.type === "EQ").length;
  const recs = [];
  if (etfPct < 0.5) recs.push({ code: "REC001", priority: "!!!", action: "INCREASE ETF EXPOSURE", detail: "TARGET 60-70% BROAD ETF ALLOC (VTI/VOO). REDUCES SINGLE-STOCK RISK WHILE MAINTAINING MKT PARTICIPATION. SHORT HORIZON WARRANTS STABILITY." });
  if (numStocks > 4) recs.push({ code: "REC002", priority: ">> ", action: "CONSOLIDATE EQ POSITIONS", detail: `${numStocks} INDIVIDUAL EQ POSITIONS ADDS CONCENTRATION RISK. TRIM UNDERPERFORMERS. FOCUS ON 2-3 HIGH-CONVICTION NAMES ONLY.` });
  if (!holdings.find(h => ["BND", "SCHD", "VYM"].includes(h.ticker.toUpperCase()))) recs.push({ code: "REC003", priority: ">> ", action: "ADD STABILIZING INSTRUMENT", detail: "10-15% ALLOC TO BND OR SCHD REDUCES DRAWDOWN RISK. CRITICAL FOR SUB-3YR HORIZON. DIVIDEND YIELD PROVIDES RETURN FLOOR." });
  if (weeklyDeposit < 50) recs.push({ code: "REC004", priority: "!!!", action: "INCREASE DEPOSIT FREQUENCY", detail: "CONSISTENT CONTRIBUTIONS COMPOUND MEANINGFULLY OVER 1-3YR. INCREASE $25-50/WK. DCA STRATEGY REDUCES TIMING RISK." });
  if (etfPct >= 0.6 && numStocks <= 3 && weeklyDeposit >= 50) recs.push({ code: "REC005", priority: "   ", action: "PORTFOLIO STRUCTURE SOUND", detail: "ETF/EQ BALANCE ALIGNED WITH SHORT-TERM BALANCED MANDATE. MAINTAIN DEPOSIT SCHEDULE. AVOID OVERTRADING." });
  if (!recs.length) recs.push({ code: "REC006", priority: "   ", action: "MAINTAIN CURRENT STRATEGY", detail: "NO MATERIAL ADJUSTMENTS REQUIRED. PRIORITIZE CONSISTENT DEPOSITS. TIME IN MARKET > TIMING THE MARKET." });
  return recs;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useBlinkingCursor() {
  const [show, setShow] = useState(true);
  useEffect(() => { const t = setInterval(() => setShow(s => !s), 530); return () => clearInterval(t); }, []);
  return show ? "█" : " ";
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return time;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const A      = "#3d2e1a";
const BRIGHT = "#1a1008";
const DIM    = "#6b5540";
const GHOST  = "#a08060";
const GREEN  = "#2d6e45";
const RED    = "#8b2e2e";
const CYAN   = "#1e5a7a";
const BG     = "#f5f0e8";
const PANEL  = "#ede8df";
const BORDER = "#c8bfaa";
const TOPBAR = "#ddd5c4";
const ACTIVE = "#c4b89e";

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cursor = useBlinkingCursor();
  const clock = useClock();

  async function handleSubmit() {
    if (!username || !password) { setError("ALL FIELDS REQUIRED"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail?.toUpperCase() || "ERROR"); setLoading(false); return; }
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      onAuth(data.token, data.username);
    } catch {
      setError("CANNOT CONNECT TO SERVER");
    }
    setLoading(false);
  }

  const inp = {
    background: "transparent", border: "none", borderBottom: `1px solid ${BORDER}`,
    color: BRIGHT, fontFamily: "'Courier New', monospace", fontSize: "14px",
    padding: "4px 2px", width: "100%", outline: "none", letterSpacing: "0.05em",
  };

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Courier New', monospace", color: A, display: "flex", flexDirection: "column" }}>
      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } input::placeholder { color: ${GHOST}; }`}</style>

      <div style={{ background: TOPBAR, borderBottom: `1px solid ${BORDER}`, padding: "2px 10px", display: "flex", justifyContent: "space-between", fontSize: "12px", letterSpacing: "0.07em" }}>
        <span style={{ color: BRIGHT, fontWeight: "bold" }}>PORTFOLIO ANALYST</span>
        <span style={{ color: DIM }}>SECURE LOGIN  //  MULTI-USER</span>
        <span style={{ color: A }}>{clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}  {clock.toLocaleTimeString("en-US", { hour12: false })}</span>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "380px" }}>
          <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "32px" }}>
            <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.15em", marginBottom: "24px", borderBottom: `1px solid ${BORDER}`, paddingBottom: "12px" }}>
              {mode === "login" ? "USER AUTHENTICATION  //  ENTER CREDENTIALS" : "NEW ACCOUNT REGISTRATION  //  CHOOSE CREDENTIALS"}
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "6px" }}>USERNAME</div>
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="E.G. LUCAS"
                style={{ ...inp, textTransform: "uppercase" }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>

            <div style={{ marginBottom: "28px" }}>
              <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "6px" }}>PASSWORD</div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                style={inp}
                onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            </div>

            {error && <div style={{ fontSize: "11px", color: RED, marginBottom: "16px", letterSpacing: "0.06em" }}>ERROR: {error}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ background: TOPBAR, color: A, border: `1px solid ${A}`, padding: "10px", fontFamily: "'Courier New', monospace", fontSize: "12px", letterSpacing: "0.1em", cursor: "pointer", width: "100%", marginBottom: "16px" }}
              onMouseEnter={e => e.target.style.background = ACTIVE}
              onMouseLeave={e => e.target.style.background = TOPBAR}>
              {loading ? "AUTHENTICATING..." : mode === "login" ? "LOGIN  //  ENTER SYSTEM" : "REGISTER  //  CREATE ACCOUNT"}
            </button>

            <div style={{ textAlign: "center", fontSize: "11px", color: GHOST }}>
              {mode === "login" ? "NO ACCOUNT?  " : "HAVE AN ACCOUNT?  "}
              <span onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
                style={{ color: A, cursor: "pointer", textDecoration: "underline" }}>
                {mode === "login" ? "REGISTER" : "LOGIN"}
              </span>
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: "10px", color: GHOST, marginTop: "12px" }}>
            PORTFOLIO ANALYST v1.0  //  {cursor}
          </div>
        </div>
      </div>

      <div style={{ background: TOPBAR, borderTop: `1px solid ${BORDER}`, padding: "3px 10px", fontSize: "10px", color: GHOST, display: "flex", justifyContent: "space-between" }}>
        <span>PRESS ENTER TO SUBMIT</span>
        <span>ALL DATA STORED LOCALLY  //  SECURED WITH JWT</span>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [username, setUsername] = useState(() => localStorage.getItem("username") || "");

  function handleAuth(t, u) { setToken(t); setUsername(u); }
  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("username"); setToken(null); setUsername(""); }

  if (!token) return <LoginScreen onAuth={handleAuth} />;
  return <Portfolio token={token} username={username} onLogout={handleLogout} />;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────
function Portfolio({ token, username, onLogout }) {
  const [holdings, setHoldings] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [goal, setGoal] = useState(10000);
  const [weeklyDeposit, setWeeklyDeposit] = useState(100);
  const [tab, setTab] = useState(1);
  const [newTicker, setNewTicker] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newType, setNewType] = useState("ETF");
  const [addingPrice, setAddingPrice] = useState(false);
  const [nextId, setNextId] = useState(10);
  const [inputFocus, setInputFocus] = useState(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const cursor = useBlinkingCursor();
  const clock = useClock();

  useEffect(() => {
    loadHoldings(token).then(data => setHoldings(data));
    loadSettings(token).then(s => {
      if (s.goal) setGoal(s.goal);
      if (s.weeklyDeposit) setWeeklyDeposit(s.weeklyDeposit);
      setSettingsReady(true);
    });
  }, [token]);

  useEffect(() => {
    if (!settingsReady) return;
    saveSettings({ goal, weeklyDeposit }, token);
  }, [goal, weeklyDeposit, settingsReady]);

  const refreshPrices = useCallback(async (h) => {
    const tickers = (h || holdings).map(x => x.ticker);
    if (!tickers.length) return;
    setLoading(true);
    const p = await fetchLivePrices(tickers);
    setPrices(p); setLoaded(true); setLoading(false);
  }, [holdings]);

  const getP = t => prices[t?.toUpperCase()] || 0;
  const analysis = useMemo(() => scorePortfolio(holdings, prices, goal, weeklyDeposit), [holdings, prices, goal, weeklyDeposit]);
  const recs = useMemo(() => getRecommendations(holdings, prices, weeklyDeposit), [holdings, prices, weeklyDeposit]);

  async function addHolding() {
    if (!newTicker || !newShares) return;
    const ticker = newTicker.toUpperCase();
    setAddingPrice(true);
    const saved = await saveHolding({ ticker, shares: parseFloat(newShares), type: newType }, token);
    const updated = [...holdings, { ...saved, name: ticker }];
    setHoldings(updated);
    setNewTicker(""); setNewShares("");
    const p = await fetchLivePrices(updated.map(x => x.ticker));
    setPrices(p); setLoaded(true); setAddingPrice(false);
  }

  const scoreLabel = analysis.score >= 8 ? "STRONG" : analysis.score >= 6 ? "ADEQUATE" : analysis.score >= 4 ? "DEVELOPING" : "WEAK";
  const scoreColor = analysis.score >= 8 ? GREEN : analysis.score >= 6 ? DIM : analysis.score >= 4 ? GHOST : RED;

  const inpStyle = (name) => ({
    background: inputFocus === name ? "#e8e0d0" : "transparent",
    border: "none", borderBottom: `1px solid ${inputFocus === name ? A : BORDER}`,
    color: BRIGHT, fontFamily: "'Courier New', Courier, monospace", fontSize: "13px",
    padding: "2px 4px", width: "100%", outline: "none", letterSpacing: "0.05em", textTransform: "uppercase",
  });

  const tabs = ["1-PORTFOLIO", "2-GOALS", "3-ANALYSIS", "4-ADD HOLDING"];

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Courier New', Courier, monospace", color: A, userSelect: "none" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: ${BORDER}; color: ${BRIGHT}; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${PANEL}; } ::-webkit-scrollbar-thumb { background: ${BORDER}; }
        input::placeholder { color: ${GHOST}; } input, select { caret-color: ${A}; } select option { background: ${PANEL}; color: ${A}; }
        .trow:hover td { background: ${BORDER} !important; cursor: default; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .panel { animation: fadeIn 0.15s ease; }
        .fnkey { transition: all 0.05s; } .fnkey:hover { background: ${BORDER} !important; color: ${BRIGHT} !important; cursor: pointer; }
        .navitem { transition: all 0.05s; } .navitem:hover { background: ${ACTIVE} !important; cursor: pointer; }
      `}</style>

      {/* TOP BAR */}
      <div style={{ background: TOPBAR, borderBottom: `1px solid ${BORDER}`, color: A, padding: "2px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", letterSpacing: "0.07em" }}>
        <span style={{ color: BRIGHT, fontWeight: "bold" }}>PORTFOLIO ANALYST</span>
        <span style={{ color: DIM }}>SHORT-TERM BALANCED MANDATE  //  {username.toUpperCase()}</span>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span style={{ color: A }}>{clock.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric" }).toUpperCase()}  {clock.toLocaleTimeString("en-US", { hour12: false })}</span>
          <span onClick={onLogout} style={{ color: RED, cursor: "pointer", fontSize: "11px", letterSpacing: "0.08em" }}
            onMouseEnter={e => e.target.style.textDecoration = "underline"}
            onMouseLeave={e => e.target.style.textDecoration = "none"}>LOGOUT</span>
        </div>
      </div>

      {/* SECONDARY BAR */}
      <div style={{ background: TOPBAR, borderBottom: `1px solid ${BORDER}`, padding: "2px 10px", display: "flex", justifyContent: "space-between", fontSize: "11px", color: DIM, letterSpacing: "0.06em" }}>
        <span>ACCT: FIDELITY-BROKERAGE  |  STRAT: BALANCED  |  HORIZON: &lt;3YR  |  MKT DATA:{" "}
          {loading ? <span style={{ color: GREEN }}>FETCHING...</span> : loaded ? <span style={{ color: GREEN }}>LIVE</span> : <span style={{ color: RED }}>NOT LOADED</span>}
        </span>
        <span style={{ color: scoreColor }}>PORTFOLIO RATING: {analysis.score}/10  [{scoreLabel}]</span>
      </div>

      {/* TICKER STRIP */}
      <div style={{ background: PANEL, borderBottom: `1px solid ${BORDER}`, padding: "3px 10px", fontSize: "11px", display: "flex", gap: "24px", overflowX: "auto", whiteSpace: "nowrap" }}>
        {holdings.length === 0 && <span style={{ color: GHOST }}>NO HOLDINGS — ADD POSITIONS IN TAB 4</span>}
        {holdings.map(h => {
          const p = getP(h.ticker);
          return (
            <span key={h.id} style={{ display: "inline-flex", gap: "6px" }}>
              <span style={{ color: BRIGHT, fontWeight: "bold" }}>{h.ticker}</span>
              <span style={{ color: p ? A : GHOST }}>{p ? `$${p.toFixed(2)}` : "N/A"}</span>
            </span>
          );
        })}
        <span style={{ color: GHOST, marginLeft: "auto" }}>F9 REFRESH PRICES {cursor}</span>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "176px 1fr", minHeight: "calc(100vh - 100px)" }}>

        {/* SIDEBAR */}
        <div style={{ background: TOPBAR, borderRight: `1px solid ${BORDER}` }}>
          <div style={{ background: ACTIVE, padding: "4px 8px", fontSize: "10px", color: DIM, letterSpacing: "0.1em", borderBottom: `1px solid ${BORDER}` }}>NAVIGATION</div>
          {tabs.map((t, i) => (
            <div key={i} className="navitem" onClick={() => setTab(i + 1)}
              style={{ padding: "8px 10px", fontSize: "12px", letterSpacing: "0.04em", borderBottom: `1px solid ${BORDER}`, background: tab === i + 1 ? ACTIVE : "transparent", color: tab === i + 1 ? BRIGHT : DIM, borderLeft: tab === i + 1 ? `3px solid ${A}` : `3px solid transparent` }}>
              {t}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: "8px", padding: "8px 10px" }}>
            <div style={{ fontSize: "10px", color: GHOST, marginBottom: "8px", letterSpacing: "0.08em" }}>SUMMARY</div>
            {[["POSITIONS", holdings.length], ["MKT VALUE", loaded ? `$${analysis.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "N/A"], ["ETF WT", loaded ? `${Math.round(analysis.etfPct * 100)}%` : "N/A"], ["SCORE", `${analysis.score}/10`]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "5px" }}>
                <span style={{ color: GHOST }}>{k}</span>
                <span style={{ color: A }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER}` }}>
            <div className="fnkey" onClick={() => refreshPrices()}
              style={{ background: PANEL, border: `1px solid ${BORDER}`, color: DIM, padding: "5px 8px", fontSize: "11px", letterSpacing: "0.06em", textAlign: "center", cursor: "pointer" }}>
              {loading ? "LOADING..." : "F9  REFRESH"}
            </div>
          </div>
        </div>

        {/* MAIN PANEL */}
        <div style={{ background: BG }}>
          <div style={{ background: TOPBAR, borderBottom: `1px solid ${BORDER}`, padding: "3px 14px", display: "flex", justifyContent: "space-between", fontSize: "11px", letterSpacing: "0.08em" }}>
            <span style={{ color: BRIGHT }}>{tabs[tab - 1]}</span>
            <span style={{ color: GHOST }}>SIDEBAR TO NAVIGATE  |  F9=REFRESH  |  F4=ADD HOLDING</span>
          </div>

          <div className="panel" style={{ padding: "12px 16px" }}>

            {/* TAB 1 */}
            {tab === 1 && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: BORDER, border: `1px solid ${BORDER}`, marginBottom: "12px" }}>
                  {[["MKT VALUE", loaded ? `$${analysis.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "N/A", BRIGHT], ["PROJ 1YR", loaded ? `$${analysis.projected.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "N/A", CYAN], ["ETF WEIGHT", loaded ? `${Math.round(analysis.etfPct * 100)}%` : "N/A", A], ["WKY DEPOSIT", `$${weeklyDeposit}`, GREEN]].map(([k, v, c]) => (
                    <div key={k} style={{ background: PANEL, padding: "8px 12px" }}>
                      <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "4px" }}>{k}</div>
                      <div style={{ fontSize: "18px", color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ border: `1px solid ${BORDER}`, background: PANEL, marginBottom: "4px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: TOPBAR, borderBottom: `1px solid ${BORDER}` }}>
                        {["TICKER", "TYPE", "SHARES", "CUR PX", "MKT VALUE", "PORT WT"].map(h => (
                          <th key={h} style={{ padding: "5px 10px", color: DIM, fontWeight: "normal", textAlign: "right", letterSpacing: "0.06em", fontSize: "10px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => {
                        const cur = getP(h.ticker);
                        const val = cur ? h.shares * cur : null;
                        const portWt = loaded && analysis.totalValue ? (h.shares * cur) / analysis.totalValue * 100 : null;
                        return (
                          <tr key={h.id} className="trow" style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: "6px 10px", color: BRIGHT, fontWeight: "bold", letterSpacing: "0.08em", textAlign: "left" }}>
                              {h.ticker}
                              <button onClick={() => { deleteHolding(h.id, token); setHoldings(p => p.filter(x => x.id !== h.id)); }}
                                style={{ background: "none", border: "none", color: GHOST, cursor: "pointer", fontSize: "10px", marginLeft: "8px", fontFamily: "monospace" }}
                                onMouseEnter={e => e.target.style.color = RED} onMouseLeave={e => e.target.style.color = GHOST}>DEL</button>
                            </td>
                            <td style={{ padding: "6px 10px", color: h.type === "ETF" ? CYAN : A, fontSize: "11px", textAlign: "right" }}>{h.type}</td>
                            <td style={{ padding: "6px 10px", color: A, textAlign: "right" }}>{h.shares.toFixed(2)}</td>
                            <td style={{ padding: "6px 10px", color: cur ? A : GHOST, textAlign: "right" }}>{cur ? `$${cur.toFixed(2)}` : "---"}</td>
                            <td style={{ padding: "6px 10px", color: val ? BRIGHT : GHOST, textAlign: "right" }}>{val ? `$${val.toFixed(2)}` : "---"}</td>
                            <td style={{ padding: "6px 10px", color: portWt !== null ? DIM : GHOST, textAlign: "right" }}>{portWt !== null ? `${portWt.toFixed(1)}%` : "---"}</td>
                          </tr>
                        );
                      })}
                      {!holdings.length && <tr><td colSpan={6} style={{ padding: "20px", textAlign: "center", color: GHOST, fontSize: "12px" }}>NO ACTIVE POSITIONS  //  USE TAB 4 TO ADD HOLDINGS</td></tr>}
                      {holdings.length > 0 && loaded && (
                        <tr style={{ borderTop: `1px solid ${BORDER}`, background: TOPBAR }}>
                          <td colSpan={3} style={{ padding: "6px 10px", color: DIM, fontSize: "11px", textAlign: "left" }}>TOTAL PORTFOLIO</td>
                          <td></td>
                          <td style={{ padding: "6px 10px", color: BRIGHT, textAlign: "right", fontWeight: "bold" }}>${analysis.totalValue.toFixed(2)}</td>
                          <td style={{ padding: "6px 10px", color: DIM, textAlign: "right", fontSize: "11px" }}>100.0%</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!loaded && <div style={{ fontSize: "10px", color: GHOST, padding: "4px 2px" }}>* CLICK F9 REFRESH TO LOAD LIVE PRICES FROM FINNHUB</div>}
              </div>
            )}

            {/* TAB 2 */}
            {tab === 2 && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  {[["SAVINGS TARGET ($)", goal, setGoal], ["WEEKLY DEPOSIT ($)", weeklyDeposit, setWeeklyDeposit]].map(([label, val, set]) => (
                    <div key={label} style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "12px" }}>
                      <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
                      <input type="number" value={val} onChange={e => set(Number(e.target.value))}
                        style={{ ...inpStyle(label), fontSize: "26px", color: BRIGHT, borderBottom: `1px solid ${BORDER}` }}
                        onFocus={() => setInputFocus(label)} onBlur={() => setInputFocus(null)} />
                    </div>
                  ))}
                </div>
                <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "12px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "12px" }}>GOAL PROGRESS ANALYSIS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "14px" }}>
                    {[["CURRENT MKT VAL", loaded ? `$${analysis.totalValue.toFixed(2)}` : "N/A", A], ["PROJECTED (1YR)", loaded ? `$${analysis.projected.toFixed(2)}` : "N/A", CYAN], ["TARGET", `$${goal.toLocaleString()}`, DIM]].map(([k, v, c]) => (
                      <div key={k}>
                        <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.08em", marginBottom: "4px" }}>{k}</div>
                        <div style={{ fontSize: "20px", color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: DIM, marginBottom: "5px" }}>
                    <span>PROGRESS TO GOAL</span>
                    <span style={{ color: A }}>{loaded ? `${Math.min(Math.round((analysis.totalValue / goal) * 100), 100)}%` : "N/A"}</span>
                  </div>
                  <div style={{ background: TOPBAR, height: "12px", border: `1px solid ${BORDER}` }}>
                    <div style={{ width: loaded ? `${Math.min((analysis.totalValue / goal) * 100, 100)}%` : "0%", height: "100%", background: DIM, transition: "width 0.8s ease" }} />
                  </div>
                  <div style={{ marginTop: "8px", fontSize: "11px", color: DIM }}>
                    {loaded && weeklyDeposit > 0 ? `>> AT $${weeklyDeposit}/WK — EST. GOAL COMPLETION: ~${goal - analysis.totalValue <= 0 ? "0" : Math.ceil((goal - analysis.totalValue) / (weeklyDeposit * 4.33))} MONTHS` : ">> LOAD PRICES TO CALCULATE TIMELINE"}
                  </div>
                </div>
                <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "12px" }}>
                  <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "12px" }}>SCORE COMPONENT ANALYSIS  //  TOTAL: {analysis.score}/10 [{scoreLabel}]</div>
                  {analysis.breakdown.map(item => (
                    <div key={item.label} style={{ marginBottom: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                        <span style={{ color: DIM }}>{item.label}</span>
                        <span style={{ color: A }}>{item.pts}/{item.max} PTS</span>
                      </div>
                      <div style={{ background: TOPBAR, height: "7px", border: `1px solid ${BORDER}` }}>
                        <div style={{ width: `${(item.pts / item.max) * 100}%`, height: "100%", background: item.pts / item.max > 0.7 ? GREEN : item.pts / item.max > 0.4 ? DIM : RED, transition: "width 0.6s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3 */}
            {tab === 3 && (
              <div>
                <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "12px", marginBottom: "12px", display: "flex", gap: "20px", alignItems: "flex-start" }}>
                  <div style={{ border: `1px solid ${scoreColor}`, padding: "10px 14px", textAlign: "center", minWidth: "70px", flexShrink: 0 }}>
                    <div style={{ fontSize: "32px", color: scoreColor, lineHeight: 1 }}>{analysis.score}</div>
                    <div style={{ fontSize: "9px", color: GHOST, letterSpacing: "0.1em" }}>/ 10</div>
                    <div style={{ fontSize: "9px", color: scoreColor, marginTop: "4px", letterSpacing: "0.06em" }}>{scoreLabel}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "6px" }}>PORTFOLIO ASSESSMENT</div>
                    <div style={{ fontSize: "12px", color: A, lineHeight: 1.9 }}>
                      {analysis.score >= 8 ? ">> PORTFOLIO WELL-STRUCTURED FOR SHORT-TERM BALANCED MANDATE.\n>> MAINTAIN DEPOSIT SCHEDULE. NO MATERIAL REALLOCATION REQUIRED."
                        : analysis.score >= 6 ? ">> ADEQUATE FOUNDATION. TARGETED ADJUSTMENTS COULD IMPROVE RISK-ADJ RETURNS.\n>> REVIEW RECOMMENDATIONS BELOW."
                        : analysis.score >= 4 ? ">> PORTFOLIO IN DEVELOPMENT PHASE. PRIORITIZE RECOMMENDATIONS BELOW.\n>> FOCUS ON DEPOSIT CONSISTENCY AND DIVERSIFICATION."
                        : ">> EARLY STAGE PORTFOLIO. ESTABLISH DEPOSIT SCHEDULE IMMEDIATELY.\n>> DIVERSIFICATION AND ETF EXPOSURE CRITICAL AT THIS STAGE."}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "8px", padding: "4px 0", borderBottom: `1px solid ${BORDER}` }}>
                  RECOMMENDATIONS  //  {recs.length} ITEM(S)  //  SORTED BY PRIORITY
                </div>
                {recs.map((rec, i) => (
                  <div key={i} style={{ border: `1px solid ${BORDER}`, borderLeft: `3px solid ${rec.priority === "!!!" ? RED : rec.priority === ">> " ? DIM : GHOST}`, background: PANEL, padding: "10px 12px", marginBottom: "6px" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: GHOST, flexShrink: 0 }}>{rec.code}</span>
                      <span style={{ fontSize: "10px", color: rec.priority === "!!!" ? RED : rec.priority === ">> " ? A : GHOST, flexShrink: 0 }}>[{rec.priority}]</span>
                      <span style={{ fontSize: "12px", color: BRIGHT, letterSpacing: "0.04em" }}>{rec.action}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: DIM, lineHeight: 1.7, paddingLeft: "80px" }}>{rec.detail}</div>
                  </div>
                ))}
                <div style={{ marginTop: "16px", fontSize: "10px", color: GHOST, lineHeight: 1.8, borderTop: `1px solid ${BORDER}`, paddingTop: "8px" }}>
                  DISCLAIMER: FOR EDUCATIONAL PURPOSES ONLY. NOT FINANCIAL ADVICE. PRICES SOURCED VIA FINNHUB. CONSULT A LICENSED FINANCIAL ADVISOR BEFORE MAKING INVESTMENT DECISIONS.
                </div>
              </div>
            )}

            {/* TAB 4 */}
            {tab === 4 && (
              <div>
                <div style={{ border: `1px solid ${BORDER}`, background: PANEL, padding: "16px", maxWidth: "500px" }}>
                  <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "16px", paddingBottom: "6px", borderBottom: `1px solid ${BORDER}` }}>
                    NEW POSITION ENTRY  //  FILL ALL FIELDS BEFORE SUBMITTING
                  </div>
                  <div style={{ display: "grid", gap: "14px" }}>
                    {[["TICKER SYMBOL", newTicker, setNewTicker, "ticker", "E.G. VTI", "text"], ["SHARE QUANTITY", newShares, setNewShares, "shares", "E.G. 10", "number"]].map(([label, val, set, name, ph, type]) => (
                      <div key={name}>
                        <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "6px" }}>{label}</div>
                        <input type={type} value={val} placeholder={ph} onChange={e => set(e.target.value)}
                          style={inpStyle(name)} onFocus={() => setInputFocus(name)} onBlur={() => setInputFocus(null)} />
                      </div>
                    ))}
                    <div>
                      <div style={{ fontSize: "10px", color: GHOST, letterSpacing: "0.1em", marginBottom: "6px" }}>INSTRUMENT TYPE</div>
                      <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inpStyle("type"), cursor: "pointer" }}
                        onFocus={() => setInputFocus("type")} onBlur={() => setInputFocus(null)}>
                        <option value="ETF">ETF - EXCHANGE TRADED FUND</option>
                        <option value="EQ">EQ  - EQUITY / STOCK</option>
                      </select>
                    </div>
                    <div style={{ fontSize: "10px", color: GHOST, lineHeight: 1.7 }}>* CURRENT PRICE FETCHED AUTOMATICALLY VIA FINNHUB ON SUBMIT</div>
                    <button onClick={addHolding} disabled={addingPrice}
                      style={{ background: TOPBAR, color: addingPrice ? GHOST : A, border: `1px solid ${addingPrice ? BORDER : A}`, padding: "8px 20px", fontFamily: "'Courier New', monospace", fontSize: "12px", letterSpacing: "0.1em", cursor: addingPrice ? "default" : "pointer", width: "100%", transition: "all 0.1s" }}
                      onMouseEnter={e => { if (!addingPrice) e.target.style.background = ACTIVE; }}
                      onMouseLeave={e => { e.target.style.background = TOPBAR; }}>
                      {addingPrice ? "FETCHING PRICE..." : "SUBMIT  //  ADD TO PORTFOLIO"}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: "12px", border: `1px solid ${BORDER}`, background: PANEL, padding: "12px", maxWidth: "500px" }}>
                  <div style={{ fontSize: "10px", color: DIM, letterSpacing: "0.1em", marginBottom: "8px" }}>CURRENT POSITIONS ({holdings.length})</div>
                  {holdings.map(h => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "4px 0", borderBottom: `1px solid ${BORDER}`, color: DIM }}>
                      <span><span style={{ color: BRIGHT }}>{h.ticker}</span>  {h.shares} SHS  {getP(h.ticker) ? `// $${(h.shares * getP(h.ticker)).toFixed(2)}` : "// PRICE N/A"}</span>
                      <span style={{ color: GHOST, fontSize: "10px" }}>[{h.type}]</span>
                    </div>
                  ))}
                  {!holdings.length && <div style={{ color: GHOST, fontSize: "11px" }}>NO POSITIONS ON FILE</div>}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* FKEY BAR */}
      <div style={{ background: TOPBAR, borderTop: `1px solid ${BORDER}`, padding: "3px 6px", display: "flex", gap: "2px", fontSize: "11px" }}>
        {[["F1","HELP"],["F2","EDIT"],["F3","FIND"],["F4","ADD POS"],["F5","MENU"],["F6","PRINT"],["F7","BACK"],["F8","FWRD"],["F9","REFR"],["F10","EXIT"]].map(([fn, label]) => (
          <div key={fn} className="fnkey"
            onClick={fn === "F9" ? () => refreshPrices() : fn === "F4" ? () => setTab(4) : undefined}
            style={{ display: "flex", gap: "2px", padding: "2px 6px", cursor: "pointer" }}>
            <span style={{ background: BORDER, color: BRIGHT, padding: "0 3px", fontSize: "10px", fontWeight: "bold" }}>{fn}</span>
            <span style={{ color: DIM }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", color: GHOST, fontSize: "10px", display: "flex", alignItems: "center" }}>
          PORTFOLIO ANALYST v1.0  //  {cursor}
        </div>
      </div>
    </div>
  );
}
