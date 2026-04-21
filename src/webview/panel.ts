export function getWebviewContent(
  issues: any[], code: string, language: string,
  autoReview: boolean, history: any[], streak: number,
  providerLabel: string = "Groq"
): string {

  const bugs = issues.filter(i => i.category === "bug");
  const perf = issues.filter(i => i.category === "performance");
  const sec  = issues.filter(i => i.category === "security");
  const sty  = issues.filter(i => i.category === "style");
  const total = issues.length;

  const bugD  = Math.min(bugs.length * 6, 30);
  const secD  = Math.min(sec.length  * 5, 25);
  const perfD = Math.min(perf.length * 3, 15);
  const styD  = Math.min(sty.length  * 1, 10);
  const score = 100 - Math.min(bugD + secD + perfD + styD, 80);

  const grade =
    score >= 90 ? { label: "Excellent", cls: "grade-good"  } :
    score >= 75 ? { label: "Good",      cls: "grade-good"  } :
    score >= 60 ? { label: "Fair",      cls: "grade-fair"  } :
    score >= 40 ? { label: "Poor",      cls: "grade-poor"  } :
                  { label: "Critical",  cls: "grade-poor"  };

  const scoreColor =
    score >= 75 ? "#00ff88" :
    score >= 60 ? "#ffb830" :
    score >= 40 ? "#b06aff" : "#ff4d6a";

  const circ = 2 * Math.PI * 27;
  const dash = circ - (score / 100) * circ;

  const barFill = score;

  const last7 = history.slice(-7);
  let delta = "";
  if (history.length >= 2) {
    const d = score - history[history.length - 2].score;
    if (d > 0) delta = `↑ +${d} pts`;
    else if (d < 0) delta = `↓ ${d} pts`;
  }

  const histBars = last7.map((h: any, i: number) => {
    const latest = i === last7.length - 1;
    const ht = Math.max((h.score / 100) * 44, 3);
    const c = h.score >= 75 ? "#00ff88" : h.score >= 50 ? "#ffb830" : "#ff4d6a";
    const style = latest
      ? `height:${ht}px;background:linear-gradient(180deg,#00e5ff,#b06aff);border-radius:3px 3px 0 0;box-shadow:0 0 8px rgba(0,229,255,0.4)`
      : `height:${ht}px;background:${c}55;border-radius:3px 3px 0 0`;
    const lblStyle = latest ? `color:#00e5ff` : ``;
    return `<div class="cb"><div class="cbf" style="${style}"></div><span class="cbl" style="${lblStyle}">${h.score}</span></div>`;
  }).join("");

  function rows(list: any[], dotColor: string) {
    if (!list.length) return `<div class="empty">No issues found ✓</div>`;
    return list.map(i => `
      <div class="issue-item">
        <div class="issue-dot" style="background:${dotColor};box-shadow:0 0 5px ${dotColor}"></div>
        <span class="issue-line">L${i.line}</span>
        <span class="issue-msg">${i.message}</span>
        ${i.concept ? `<button class="learn-pill" onclick="learnIt('${i.concept.replace(/'/g, "\\'")}')">Learn</button>` : ""}
      </div>`).join("");
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#080b14;--surface:#0d1120;--surface2:#111827;
  --border:rgba(255,255,255,0.06);--border2:rgba(255,255,255,0.1);
  --cyan:#00e5ff;--purple:#b06aff;--pink:#ff3d9a;
  --green:#00ff88;--amber:#ffb830;--red:#ff4d6a;
  --text:#f0f4ff;--text2:#8892a4;--text3:#3d4758;
  --font:'Space Grotesk',sans-serif;--mono:'JetBrains Mono',monospace;
}
.light{
  --bg:#f0f4ff;--surface:#ffffff;--surface2:#f8faff;
  --border:rgba(0,0,0,0.07);--border2:rgba(0,0,0,0.12);
  --text:#0d1120;--text2:#4a5568;--text3:#a0aec0;
}
html,body{background:var(--bg);color:var(--text);font-family:var(--font);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 60% 40% at 20% 10%,rgba(0,229,255,0.07) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(176,106,255,0.08) 0%,transparent 60%),radial-gradient(ellipse 40% 40% at 60% 20%,rgba(255,61,154,0.05) 0%,transparent 50%);pointer-events:none;z-index:0}
.light body::before{background:radial-gradient(ellipse 60% 40% at 20% 10%,rgba(0,229,255,0.04) 0%,transparent 60%),radial-gradient(ellipse 50% 60% at 80% 80%,rgba(176,106,255,0.04) 0%,transparent 60%)}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.25);border-radius:2px}
.root{position:relative;z-index:1;padding:14px;display:flex;flex-direction:column;gap:10px}

/* HEADER */
.header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(0,229,255,0.12);border-radius:12px}
.light .header{background:rgba(255,255,255,0.9);border-color:rgba(0,180,200,0.2)}
.header-left{display:flex;align-items:center;gap:10px}
.logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#00e5ff22,#b06aff22);border:1px solid rgba(0,229,255,0.3);display:flex;align-items:center;justify-content:center;font-size:14px}
.app-name{font-size:14px;font-weight:700;color:var(--text);letter-spacing:-.3px}
.lang-chip{background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;color:var(--cyan);font-family:var(--mono);letter-spacing:.5px}
.provider-chip{background:rgba(176,106,255,0.08);border:1px solid rgba(176,106,255,0.18);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:600;color:var(--purple);font-family:var(--mono)}
.header-right{display:flex;align-items:center;gap:8px}
.auto-pill{display:flex;align-items:center;gap:6px;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.15);border-radius:99px;padding:3px 10px;font-size:10px;font-weight:600;color:var(--green)}
.auto-pill.off{background:rgba(255,255,255,0.04);border-color:var(--border2);color:var(--text3)}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);animation:pulse 2s ease-in-out infinite;flex-shrink:0}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
.icon-btn{width:26px;height:26px;border-radius:7px;background:rgba(255,255,255,0.04);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;transition:all .15s}
.icon-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,.2)}

/* SCORE HERO */
.score-hero{background:linear-gradient(135deg,rgba(0,229,255,0.06) 0%,rgba(176,106,255,0.08) 50%,rgba(255,61,154,0.05) 100%);border:1px solid rgba(0,229,255,0.12);border-radius:16px;padding:18px 18px 16px;position:relative;overflow:hidden}
.light .score-hero{background:linear-gradient(135deg,rgba(0,229,255,0.05) 0%,rgba(176,106,255,0.06) 50%,rgba(255,61,154,0.03) 100%);border-color:rgba(0,180,200,0.18)}
.score-hero::before{content:'';position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(176,106,255,0.15),transparent 70%);pointer-events:none}
.score-inner{display:flex;align-items:center;justify-content:space-between}
.score-value{font-size:56px;font-weight:800;letter-spacing:-4px;line-height:1;background:linear-gradient(135deg,#00e5ff,#b06aff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.score-meta{display:flex;align-items:center;gap:8px;margin-top:6px}
.score-of{font-size:12px;color:var(--text3);font-weight:500}
.grade{padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.grade-fair{background:rgba(255,184,48,.15);border:1px solid rgba(255,184,48,.25);color:var(--amber)}
.grade-good{background:rgba(0,255,136,.12);border:1px solid rgba(0,255,136,.22);color:var(--green)}
.grade-poor{background:rgba(255,77,106,.12);border:1px solid rgba(255,77,106,.22);color:var(--red)}
.delta-up{font-size:11px;font-weight:600;color:var(--green)}
.delta-dn{font-size:11px;font-weight:600;color:var(--red)}
.score-ring-wrap{position:relative;width:68px;height:68px;flex-shrink:0}
.score-ring-wrap svg{transform:rotate(-90deg)}
.ring-bg{fill:none;stroke:rgba(255,255,255,.05);stroke-width:5}
.ring-fill{fill:none;stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .8s ease}
.ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--text);font-family:var(--mono)}
.score-bar-wrap{margin-top:14px}
.score-bar-labels{display:flex;justify-content:space-between;margin-bottom:5px}
.score-bar-lbl{font-size:10px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:.6px}
.score-bar-val{font-size:10px;color:var(--cyan);font-weight:600;font-family:var(--mono)}
.score-bar-track{height:5px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden}
.score-bar-fill{height:100%;background:linear-gradient(90deg,var(--cyan),var(--purple));border-radius:99px;box-shadow:0 0 8px rgba(0,229,255,.4)}

/* STATS */
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.stat-card{border-radius:12px;padding:12px 10px;text-align:center;position:relative;overflow:hidden;cursor:default;transition:transform .2s}
.stat-card:hover{transform:translateY(-2px)}
.stat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;border-radius:0 0 12px 12px}
.s-red{background:rgba(255,77,106,.08);border:1px solid rgba(255,77,106,.18)}
.s-red::after{background:var(--red);box-shadow:0 0 8px var(--red)}
.s-amber{background:rgba(255,184,48,.08);border:1px solid rgba(255,184,48,.18)}
.s-amber::after{background:var(--amber);box-shadow:0 0 8px var(--amber)}
.s-purple{background:rgba(176,106,255,.08);border:1px solid rgba(176,106,255,.18)}
.s-purple::after{background:var(--purple);box-shadow:0 0 8px var(--purple)}
.s-cyan{background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.18)}
.s-cyan::after{background:var(--cyan);box-shadow:0 0 8px var(--cyan)}
.stat-icon{font-size:16px;margin-bottom:6px;display:block}
.stat-num{font-size:22px;font-weight:800;letter-spacing:-1px;line-height:1;font-family:var(--mono)}
.s-red .stat-num{color:var(--red);text-shadow:0 0 12px rgba(255,77,106,.5)}
.s-amber .stat-num{color:var(--amber);text-shadow:0 0 12px rgba(255,184,48,.5)}
.s-purple .stat-num{color:var(--purple);text-shadow:0 0 12px rgba(176,106,255,.5)}
.s-cyan .stat-num{color:var(--cyan);text-shadow:0 0 12px rgba(0,229,255,.5)}
.stat-lbl{font-size:9px;color:var(--text3);margin-top:3px;text-transform:uppercase;letter-spacing:.6px;font-weight:600}

/* CHART */
.chart-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
.chart-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.chart-title{font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.8px}
.chart-right{display:flex;align-items:center;gap:6px}
.streak-badge{background:rgba(255,184,48,.1);border:1px solid rgba(255,184,48,.2);border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;color:var(--amber)}
.clr-btn{background:none;border:none;font-size:10px;color:var(--text3);cursor:pointer;font-family:var(--font);transition:color .15s}
.clr-btn:hover{color:var(--red)}
.chart-bars{display:flex;align-items:flex-end;gap:5px;height:48px}
.cb{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1}
.cbf{width:100%;min-height:3px}
.cbl{font-size:8px;color:var(--text3);font-family:var(--mono)}
.no-chart{font-size:11px;color:var(--text3);text-align:center;padding:12px 0;font-style:italic}

/* ACTIONS */
.action-section{display:flex;flex-direction:column;gap:6px}
.action-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.act-btn{border-radius:10px;padding:10px 6px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid transparent;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .18s;font-family:var(--font);letter-spacing:.2px;text-transform:uppercase}
.act-btn:hover{transform:translateY(-1px)}
.act-btn:active{transform:scale(.97)}
.btn-review{background:rgba(0,229,255,.08);border-color:rgba(0,229,255,.2);color:var(--cyan)}
.btn-review:hover{background:rgba(0,229,255,.15);border-color:rgba(0,229,255,.4);box-shadow:0 4px 16px rgba(0,229,255,.15)}
.btn-fix{background:rgba(0,255,136,.08);border-color:rgba(0,255,136,.2);color:var(--green)}
.btn-fix:hover{background:rgba(0,255,136,.15);border-color:rgba(0,255,136,.4);box-shadow:0 4px 16px rgba(0,255,136,.15)}
.btn-test{background:rgba(255,184,48,.08);border-color:rgba(255,184,48,.2);color:var(--amber)}
.btn-test:hover{background:rgba(255,184,48,.15);border-color:rgba(255,184,48,.4);box-shadow:0 4px 16px rgba(255,184,48,.15)}
.btn-explain{background:rgba(176,106,255,.08);border-color:rgba(176,106,255,.2);color:var(--purple)}
.btn-explain:hover{background:rgba(176,106,255,.15);border-color:rgba(176,106,255,.4);box-shadow:0 4px 16px rgba(176,106,255,.15)}
.btn-refactor{background:rgba(255,61,154,.08);border-color:rgba(255,61,154,.2);color:var(--pink)}
.btn-refactor:hover{background:rgba(255,61,154,.15);border-color:rgba(255,61,154,.4);box-shadow:0 4px 16px rgba(255,61,154,.15)}
.btn-commit{background:rgba(0,229,255,.05);border-color:rgba(0,229,255,.14);color:#7dd3e8}
.btn-commit:hover{background:rgba(0,229,255,.1);border-color:rgba(0,229,255,.28)}

/* RESULTS */
.rp{display:none;background:var(--surface);border:1px solid var(--border2);border-radius:12px;overflow:hidden;animation:slideUp .25s ease}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.rp-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(255,255,255,.03);border-bottom:1px solid var(--border)}
.rp-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.rp-acts{display:flex;gap:5px}
.mini-btn{background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:5px;padding:2px 8px;font-size:9px;font-weight:700;color:var(--text2);cursor:pointer;font-family:var(--font);transition:all .15s;text-transform:uppercase;letter-spacing:.3px}
.mini-btn:hover{background:rgba(255,255,255,.1);color:var(--text)}
.rp-body{padding:12px;font-family:var(--mono);font-size:11px;color:var(--text2);line-height:1.7;white-space:pre-wrap;word-break:break-word;max-height:220px;overflow-y:auto;background:rgba(0,0,0,.3)}
.rp-text{padding:12px;font-size:12px;color:var(--text2);line-height:1.75;white-space:pre-wrap;max-height:220px;overflow-y:auto;background:rgba(0,0,0,.2)}
.rp-body::-webkit-scrollbar,.rp-text::-webkit-scrollbar{width:3px}
.rp-body::-webkit-scrollbar-thumb,.rp-text::-webkit-scrollbar-thumb{background:rgba(0,229,255,.25);border-radius:2px}

/* ISSUE SECTIONS */
.issue-section{background:var(--surface);border-radius:12px;overflow:hidden;border:1px solid var(--border);transition:border-color .15s}
.issue-section:hover{border-color:var(--border2)}
.sec-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;transition:background .12s}
.sec-head:hover{background:rgba(255,255,255,.02)}
.sec-head-left{display:flex;align-items:center;gap:8px}
.sec-color-bar{width:3px;height:16px;border-radius:2px;flex-shrink:0}
.sec-name{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}
.sec-badge{border-radius:5px;padding:1px 7px;font-size:10px;font-weight:800;font-family:var(--mono)}
.chev{font-size:10px;color:var(--text3);transition:transform .2s}
.chev.up{transform:rotate(-90deg)}
.sec-body{border-top:1px solid var(--border)}
.sec-body.gone{display:none}
.issue-item{display:flex;align-items:center;padding:9px 12px;gap:10px;border-bottom:1px solid rgba(255,255,255,.03);transition:background .1s}
.issue-item:last-child{border-bottom:none}
.issue-item:hover{background:rgba(255,255,255,.025)}
.issue-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.issue-line{flex-shrink:0;font-family:var(--mono);font-size:10px;font-weight:700;background:rgba(255,255,255,.06);border:1px solid var(--border2);border-radius:4px;padding:1px 5px;color:var(--text2);min-width:36px;text-align:center}
.issue-msg{flex:1;font-size:11.5px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.issue-item:hover .issue-msg{white-space:normal;overflow:visible}
.learn-pill{flex-shrink:0;background:none;border:1px solid var(--border2);border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;color:var(--text3);cursor:pointer;font-family:var(--font);transition:all .15s;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.learn-pill:hover{color:var(--cyan);border-color:rgba(0,229,255,.35);background:rgba(0,229,255,.06)}
.empty{padding:10px 12px;font-size:11px;color:var(--text3);text-align:center;font-style:italic}

/* Section colors */
.bugs-sec .sec-color-bar{background:var(--red);box-shadow:0 0 6px var(--red)}
.bugs-sec .sec-name{color:var(--red)}
.bugs-sec .sec-badge{background:rgba(255,77,106,.1);border:1px solid rgba(255,77,106,.2);color:var(--red)}
.sec-sec .sec-color-bar{background:var(--amber);box-shadow:0 0 6px var(--amber)}
.sec-sec .sec-name{color:var(--amber)}
.sec-sec .sec-badge{background:rgba(255,184,48,.1);border:1px solid rgba(255,184,48,.2);color:var(--amber)}
.perf-sec .sec-color-bar{background:var(--purple);box-shadow:0 0 6px var(--purple)}
.perf-sec .sec-name{color:var(--purple)}
.perf-sec .sec-badge{background:rgba(176,106,255,.1);border:1px solid rgba(176,106,255,.2);color:var(--purple)}
.style-sec .sec-color-bar{background:var(--cyan);box-shadow:0 0 6px var(--cyan)}
.style-sec .sec-name{color:var(--cyan)}
.style-sec .sec-badge{background:rgba(0,229,255,.1);border:1px solid rgba(0,229,255,.2);color:var(--cyan)}

/* LEARN */
.lp{display:none;background:var(--surface);border:1px solid rgba(176,106,255,.25);border-radius:12px;overflow:hidden;animation:slideUp .25s ease}
.lp-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(176,106,255,.06);border-bottom:1px solid rgba(176,106,255,.12)}
.lp-title{font-size:11px;font-weight:700;color:var(--purple);text-transform:uppercase;letter-spacing:.6px}
.lp-sub{font-size:9px;color:var(--text3);margin-top:1px;font-family:var(--mono)}
.lp-body{padding:12px;font-size:12px;color:var(--text2);line-height:1.8;white-space:pre-wrap;max-height:250px;overflow-y:auto;background:rgba(0,0,0,.2)}

/* CHAT */
.chat-section{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.chat-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
.chat-title{font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.8px}
.chat-msgs{padding:10px;display:flex;flex-direction:column;gap:8px;max-height:180px;overflow-y:auto}
.chat-msgs::-webkit-scrollbar{width:3px}
.chat-msgs::-webkit-scrollbar-thumb{background:rgba(176,106,255,.3);border-radius:2px}
.bubble{padding:8px 11px;border-radius:10px;font-size:11.5px;line-height:1.5;max-width:88%;animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.bai{background:rgba(176,106,255,.08);border:1px solid rgba(176,106,255,.15);color:var(--text2);align-self:flex-start;border-bottom-left-radius:3px}
.bai strong{color:var(--cyan)}
.buser{background:rgba(0,229,255,.08);border:1px solid rgba(0,229,255,.15);color:var(--text);align-self:flex-end;border-bottom-right-radius:3px}
.bthink{color:var(--text3);font-style:italic}
.chat-row{display:flex;gap:7px;padding:8px 10px;border-top:1px solid var(--border)}
.cin{flex:1;background:rgba(255,255,255,.04);border:1px solid var(--border2);border-radius:8px;padding:7px 11px;font-size:11.5px;color:var(--text);outline:none;font-family:var(--font);transition:border-color .15s}
.cin::placeholder{color:var(--text3)}
.cin:focus{border-color:rgba(0,229,255,.3)}
.sbtn{background:linear-gradient(135deg,rgba(0,229,255,.2),rgba(176,106,255,.2));border:1px solid rgba(0,229,255,.3);border-radius:8px;padding:7px 14px;font-size:11px;font-weight:700;color:var(--cyan);cursor:pointer;font-family:var(--font);transition:all .15s;white-space:nowrap;letter-spacing:.2px}
.sbtn:hover{background:linear-gradient(135deg,rgba(0,229,255,.3),rgba(176,106,255,.3));border-color:rgba(0,229,255,.5);box-shadow:0 0 12px rgba(0,229,255,.2)}
</style>
</head><body>
<div class="root">

<!-- Header -->
<div class="header">
  <div class="header-left">
    <div class="logo">⬡</div>
    <span class="app-name">Code Review</span>
    <span class="lang-chip">${language}</span>
    <span class="provider-chip">${providerLabel}</span>
  </div>
  <div class="header-right">
    <div class="auto-pill ${autoReview ? "" : "off"}">
      ${autoReview ? `<div class="live-dot"></div>Auto On` : `Auto Off`}
    </div>
    <div class="icon-btn" id="theme-btn" onclick="toggleTheme()" title="Toggle theme">☀️</div>
  </div>
</div>

<!-- Score Hero -->
<div class="score-hero">
  <div class="score-inner">
    <div>
      <div class="score-value">${score}</div>
      <div class="score-meta">
        <span class="score-of">/ 100</span>
        <span class="grade ${grade.cls}">${grade.label}</span>
        ${delta ? `<span class="${delta.startsWith("↑") ? "delta-up" : "delta-dn"}">${delta}</span>` : ""}
      </div>
    </div>
    <div class="score-ring-wrap">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle class="ring-bg" cx="34" cy="34" r="27"/>
        <circle class="ring-fill" cx="34" cy="34" r="27"
          stroke="url(#scoreGrad)"
          stroke-dasharray="${circ}"
          stroke-dashoffset="${dash}"
          transform="rotate(-90 34 34)"/>
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#00e5ff"/>
            <stop offset="100%" stop-color="#b06aff"/>
          </linearGradient>
        </defs>
      </svg>
      <div class="ring-num">${score}</div>
    </div>
  </div>
  <div class="score-bar-wrap">
    <div class="score-bar-labels">
      <span class="score-bar-lbl">Quality Score</span>
      <span class="score-bar-val">${score}%</span>
    </div>
    <div class="score-bar-track">
      <div class="score-bar-fill" style="width:${barFill}%"></div>
    </div>
  </div>
</div>

<!-- Stats -->
<div class="stat-grid">
  <div class="stat-card s-red"><span class="stat-icon">🐛</span><div class="stat-num">${bugs.length}</div><div class="stat-lbl">Bugs</div></div>
  <div class="stat-card s-amber"><span class="stat-icon">🔒</span><div class="stat-num">${sec.length}</div><div class="stat-lbl">Security</div></div>
  <div class="stat-card s-purple"><span class="stat-icon">⚡</span><div class="stat-num">${perf.length}</div><div class="stat-lbl">Perf</div></div>
  <div class="stat-card s-cyan"><span class="stat-icon">💡</span><div class="stat-num">${sty.length}</div><div class="stat-lbl">Style</div></div>
</div>

<!-- Chart -->
<div class="chart-card">
  <div class="chart-top">
    <span class="chart-title">Score History</span>
    <div class="chart-right">
      ${streak > 0 ? `<span class="streak-badge">🔥 ${streak} streak</span>` : ""}
      <button class="clr-btn" onclick="clrH()">Clear</button>
    </div>
  </div>
  ${last7.length > 0
    ? `<div class="chart-bars">${histBars}</div>`
    : `<div class="no-chart">Save a file to start tracking progress</div>`}
</div>

<!-- Actions -->
<div class="action-section">
  <div class="action-row">
    <button class="act-btn btn-review" onclick="reviewAgain()">↺ Review</button>
    <button class="act-btn btn-fix" onclick="doFix()">✦ Auto Fix</button>
    <button class="act-btn btn-test" onclick="doTests()">◈ Tests</button>
  </div>
  <div class="action-row">
    <button class="act-btn btn-explain" onclick="doExplain()">◎ Explain</button>
    <button class="act-btn btn-refactor" onclick="doRefactor()">⟳ Refactor</button>
    <button class="act-btn btn-commit" onclick="doCommit()">⊕ Commit</button>
  </div>
</div>

<!-- Results -->
<div class="rp" id="rp-fix">
  <div class="rp-head"><span class="rp-title" style="color:var(--green)">✦ Fixed Code</span><div class="rp-acts"><button class="mini-btn" onclick="cp('rb-fix')">Copy</button><button class="mini-btn" onclick="closeR('rp-fix')">✕</button></div></div>
  <div class="rp-body" id="rb-fix"></div>
</div>
<div class="rp" id="rp-test">
  <div class="rp-head"><span class="rp-title" style="color:var(--amber)">◈ Unit Tests</span><div class="rp-acts"><button class="mini-btn" onclick="cp('rb-test')">Copy</button><button class="mini-btn" onclick="closeR('rp-test')">✕</button></div></div>
  <div class="rp-body" id="rb-test"></div>
</div>
<div class="rp" id="rp-explain">
  <div class="rp-head"><span class="rp-title" style="color:var(--purple)">◎ Explanation</span><div class="rp-acts"><button class="mini-btn" onclick="closeR('rp-explain')">✕</button></div></div>
  <div class="rp-text" id="rb-explain"></div>
</div>
<div class="rp" id="rp-refactor">
  <div class="rp-head"><span class="rp-title" style="color:var(--pink)">⟳ Refactor</span><div class="rp-acts"><button class="mini-btn" onclick="closeR('rp-refactor')">✕</button></div></div>
  <div class="rp-text" id="rb-refactor"></div>
</div>
<div class="rp" id="rp-commit">
  <div class="rp-head"><span class="rp-title" style="color:var(--cyan)">⊕ Commit Messages</span><div class="rp-acts"><button class="mini-btn" onclick="cp('rb-commit')">Copy</button><button class="mini-btn" onclick="closeR('rp-commit')">✕</button></div></div>
  <div class="rp-text" id="rb-commit"></div>
</div>

<!-- Learn Panel -->
<div class="lp" id="lp">
  <div class="lp-head">
    <div><div class="lp-title" id="lp-tag">Loading...</div><div class="lp-sub">${language} · AI Explanation</div></div>
    <button class="mini-btn" onclick="closeL()">✕</button>
  </div>
  <div class="lp-body" id="lp-body">Loading...</div>
</div>

<!-- Bugs -->
<div class="issue-section bugs-sec">
  <div class="sec-head" onclick="tog('bugs')">
    <div class="sec-head-left"><div class="sec-color-bar"></div><span class="sec-name">Bugs</span><span class="sec-badge">${bugs.length}</span></div>
    <span class="chev" id="cv-bugs">▾</span>
  </div>
  <div class="sec-body" id="sb-bugs">${rows(bugs, "var(--red)")}</div>
</div>

<!-- Security -->
<div class="issue-section sec-sec">
  <div class="sec-head" onclick="tog('security')">
    <div class="sec-head-left"><div class="sec-color-bar"></div><span class="sec-name">Security</span><span class="sec-badge">${sec.length}</span></div>
    <span class="chev" id="cv-security">▾</span>
  </div>
  <div class="sec-body" id="sb-security">${rows(sec, "var(--amber)")}</div>
</div>

<!-- Performance -->
<div class="issue-section perf-sec">
  <div class="sec-head" onclick="tog('perf')">
    <div class="sec-head-left"><div class="sec-color-bar"></div><span class="sec-name">Performance</span><span class="sec-badge">${perf.length}</span></div>
    <span class="chev" id="cv-perf">▾</span>
  </div>
  <div class="sec-body" id="sb-perf">${rows(perf, "var(--purple)")}</div>
</div>

<!-- Style -->
<div class="issue-section style-sec">
  <div class="sec-head" onclick="tog('style')">
    <div class="sec-head-left"><div class="sec-color-bar"></div><span class="sec-name">Style</span><span class="sec-badge">${sty.length}</span></div>
    <span class="chev" id="cv-style">▾</span>
  </div>
  <div class="sec-body" id="sb-style">${rows(sty, "var(--cyan)")}</div>
</div>

<!-- Chat -->
<div class="chat-section">
  <div class="chat-head"><div class="live-dot"></div><span class="chat-title">Ask AI About Your Code</span></div>
  <div class="chat-msgs" id="chat-msgs">
    <div class="bubble bai">Reviewed your <strong>${language}</strong> code — ${total} issue${total !== 1 ? "s" : ""} found. Ask me anything!</div>
  </div>
  <div class="chat-row">
    <input class="cin" id="cin" placeholder='e.g. "How do I fix line 7?"' onkeydown="if(event.key==='Enter')sendMsg()"/>
    <button class="sbtn" onclick="sendMsg()">Send ↗</button>
  </div>
</div>

</div>
<script>
const vsc = acquireVsCodeApi();
let isLight = false;

const RP = {
  fixResult:      ['rp-fix',     'rb-fix'],
  testResult:     ['rp-test',    'rb-test'],
  explainResult:  ['rp-explain', 'rb-explain'],
  refactorResult: ['rp-refactor','rb-refactor'],
  commitResult:   ['rp-commit',  'rb-commit'],
};

function hideAll() { Object.values(RP).forEach(([id]) => { document.getElementById(id).style.display = 'none'; }); }
function reviewAgain() { vsc.postMessage({ command: 'reviewAgain' }); }
function doFix()      { hideAll(); vsc.postMessage({ command: 'autoFix' }); }
function doTests()    { hideAll(); vsc.postMessage({ command: 'generateTests' }); }
function doExplain()  { hideAll(); vsc.postMessage({ command: 'explainCode' }); }
function doRefactor() { hideAll(); vsc.postMessage({ command: 'refactor' }); }
function doCommit()   { hideAll(); vsc.postMessage({ command: 'commitMessage' }); }
function closeR(id)   { document.getElementById(id).style.display = 'none'; }
function closeL()     { document.getElementById('lp').style.display = 'none'; }
function clrH()       { vsc.postMessage({ command: 'clearHistory' }); }

function toggleTheme() {
  isLight = !isLight;
  document.body.classList.toggle('light', isLight);
  document.getElementById('theme-btn').textContent = isLight ? '🌙' : '☀️';
}

function learnIt(concept) {
  const p = document.getElementById('lp');
  document.getElementById('lp-tag').textContent = concept;
  document.getElementById('lp-body').textContent = 'Loading explanation...';
  p.style.display = 'block';
  p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  vsc.postMessage({ command: 'learnConcept', concept });
}

function tog(n) {
  const b = document.getElementById('sb-' + n);
  const c = document.getElementById('cv-' + n);
  c.classList.toggle('up', b.classList.toggle('gone'));
}

function sendMsg() {
  const inp = document.getElementById('cin');
  const msg = inp.value.trim();
  if (!msg) return;
  const msgs = document.getElementById('chat-msgs');
  msgs.innerHTML += '<div class="bubble buser">' + msg + '</div>';
  msgs.innerHTML += '<div class="bubble bai bthink" id="thinking">Thinking...</div>';
  msgs.scrollTop = msgs.scrollHeight;
  inp.value = '';
  vsc.postMessage({ command: 'chat', message: msg });
}

function cp(id) {
  navigator.clipboard.writeText(document.getElementById(id).textContent);
}

window.addEventListener('message', e => {
  const { command, content, concept } = e.data;
  if (RP[command]) {
    const [pid, bid] = RP[command];
    const panel = document.getElementById(pid);
    panel.style.display = 'block';
    document.getElementById(bid).textContent = content;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (command === 'chatResult') {
    document.getElementById('thinking')?.remove();
    const msgs = document.getElementById('chat-msgs');
    msgs.innerHTML += '<div class="bubble bai">' + content + '</div>';
    msgs.scrollTop = msgs.scrollHeight;
  }
  if (command === 'learnResult') {
    document.getElementById('lp-tag').textContent = concept;
    document.getElementById('lp-body').textContent = content;
  }
});
</script>
</body></html>`;
}
