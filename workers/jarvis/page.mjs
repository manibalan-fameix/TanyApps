export const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>Tany Jarvis</title>
<style>
  :root { --bg:#f8fafc; --fg:#0f172a; --muted:#64748b; --card:#fff; --line:#e2e8f0; --accent:#1d4ed8; --accent-fg:#fff; --rec:#dc2626; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --fg:#e2e8f0; --muted:#94a3b8; --card:#111a2e; --line:#243049; --accent:#60a5fa; --accent-fg:#0b1220; --rec:#f87171; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; min-height:100dvh; display:flex; flex-direction:column; }
  header { padding:16px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); }
  h1 { font-size:18px; margin:0; }
  select, input, button { font:inherit; color:inherit; }
  select, input[type=text] { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
  main { flex:1; width:100%; max-width:720px; margin:0 auto; padding:16px; display:flex; flex-direction:column; gap:16px; }
  #log { flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
  .msg { padding:10px 14px; border-radius:14px; max-width:92%; white-space:pre-wrap; background:var(--card); border:1px solid var(--line); }
  .me { align-self:flex-end; background:var(--accent); color:var(--accent-fg); border-color:transparent; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { background:var(--card); border:1px solid var(--line); border-radius:999px; padding:8px 14px; cursor:pointer; }
  .row { display:flex; gap:8px; }
  .row input { flex:1; }
  .btn { background:var(--accent); color:var(--accent-fg); border:0; border-radius:10px; padding:10px 16px; cursor:pointer; }
  .ghost { background:transparent; color:var(--fg); border:1px solid var(--line); }
  #mic { width:84px; height:84px; border-radius:50%; align-self:center; font-size:30px; border:0; background:var(--accent); color:var(--accent-fg); cursor:pointer; }
  #mic.on { background:var(--rec); animation:pulse 1.2s infinite; }
  @keyframes pulse { 50% { transform:scale(1.07); } }
  #status { text-align:center; color:var(--muted); min-height:1.5em; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
</head>
<body>
<header>
  <h1>Tany Jarvis</h1>
  <div class="row">
    <select id="lang" aria-label="Language"><option value="en">English</option><option value="ta">தமிழ்</option></select>
    <button class="btn ghost" id="stop" type="button">Stop voice</button>
  </div>
</header>
<main>
  <div id="log" aria-live="polite"></div>
  <div class="chips" id="chips"></div>
  <div id="status"></div>
  <button id="mic" type="button" aria-label="Tap and speak">🎤</button>
  <form class="row" id="form"><input type="text" id="text" placeholder="Or type a question" autocomplete="off" maxlength="300"><button class="btn" type="submit">Ask</button></form>
</main>
<script src="/app.js"></script>
</body>
</html>`

export const JS = `(() => {
  const $ = (id) => document.getElementById(id)
  const log = $("log"), status = $("status"), mic = $("mic"), langSel = $("lang")
  const QUICK = [["Daily digest", "Give me today's digest"], ["Sprint status", "Is the current sprint on track?"], ["Overdue", "What is overdue?"], ["Blocked", "What is blocked?"], ["Gokul", "What is Gokul working on?"], ["Vishnu", "What is Vishnu working on?"]]
  const store = { get: (k) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} }, del: (k) => { try { localStorage.removeItem(k) } catch {} } }
  langSel.value = store.get("lang") || "en"
  langSel.onchange = () => store.set("lang", langSel.value)
  const locale = () => (langSel.value === "ta" ? "ta-IN" : "en-IN")

  function add(text, me) { const d = document.createElement("div"); d.className = "msg" + (me ? " me" : ""); d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight }
  const setStatus = (t) => { status.textContent = t || "" }

  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale()
    const v = speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(u.lang.toLowerCase()))
      || speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(langSel.value))
    if (v) u.voice = v
    u.onstart = () => setStatus("Speaking…")
    u.onend = () => setStatus("")
    speechSynthesis.speak(u)
  }
  $("stop").onclick = () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); setStatus("") }

  async function ask(text) {
    text = text.trim(); if (!text) return
    add(text, true); setStatus("Thinking…")
    let pass = store.get("pass")
    if (!pass) { pass = prompt("Passphrase"); if (!pass) { setStatus(""); return } store.set("pass", pass) }
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + pass }, body: JSON.stringify({ text, lang: langSel.value }) })
      if (res.status === 401) { store.del("pass"); add("Wrong passphrase. Try again."); setStatus(""); return }
      const data = await res.json()
      if (!res.ok) { add(data.error || "Something went wrong."); setStatus(""); return }
      add(data.answer); setStatus(""); speak(data.speech)
    } catch { add("I could not reach the server."); setStatus("") }
  }

  const chips = $("chips")
  for (const [label, q] of QUICK) { const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = label; b.onclick = () => { unlock(); ask(q) }; chips.appendChild(b) }
  $("form").onsubmit = (e) => { e.preventDefault(); unlock(); const i = $("text"); const v = i.value; i.value = ""; ask(v) }

  // iOS only allows speech after a tap, so "speak" a silent utterance on every tap.
  function unlock() { if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u) } }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  let rec = null
  if (!SR) { mic.disabled = true; mic.title = "This browser cannot listen. Use Chrome, Edge or Safari, or type."; setStatus("Voice input is not supported here. You can type.") }
  mic.onclick = () => {
    if (!SR) return
    unlock()
    if (rec) { rec.stop(); return }
    rec = new SR(); rec.lang = locale(); rec.interimResults = false; rec.maxAlternatives = 1
    rec.onstart = () => { mic.classList.add("on"); setStatus("Listening…") }
    rec.onresult = (e) => ask(e.results[0][0].transcript)
    rec.onerror = (e) => setStatus(e.error === "not-allowed" ? "Allow the microphone to talk to Jarvis." : e.error === "no-speech" ? "I did not hear anything." : "")
    rec.onend = () => { mic.classList.remove("on"); rec = null; if (status.textContent === "Listening…") setStatus("") }
    rec.start()
  }
  add("Hi, I am Jarvis. Tap the microphone and ask about the Tany board, or tap a button below.")
})()`
