import { SC, NAPKIN, optsFor, clueText, pick, NAMES, WIN, FAIL, NOC, VERDICT } from './scenarios.js';
const SUPABASE_URL = 'YOUR_SUPABASE_URL', SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const AV = ['🦩', '🐙', '🧀'], COL = ['#ff5fa2', '#37d6c4', '#ffc83d'], TOT = { talk: 75, vote: 25, result: 12 };
let S, code, ch, off = 0, chat = [], lastTick = 0, peek = false, nm = localStorage.nm || '';

const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3200); };
const rpc = async (f, a) => { const { data, error } = await sb.rpc(f, a); if (error) { toast(error.message); throw error; } return data; };
const seat = id => S.players.findIndex(p => p.id === id);
const myName = () => esc(S.players[seat(S.me)]?.name || '');

async function init() {
  if (!(await sb.auth.getSession()).data.session) { const r = await sb.auth.signInAnonymously(); if (r.error) return toast(r.error.message); }
  localStorage.code ? enter(localStorage.code) : menu();
}
function menu() {
  S = null; code = null; if (ch) sb.removeChannel(ch); ch = null; localStorage.removeItem('code');
  app.innerHTML = `<div class="logo">THE<br>WRONG<br>ROOM</div><p class="sub">Three strangers. One hotel. Somebody is lying. Maybe.</p>
  <input id="nm" maxlength="12" placeholder="Your name" value="${esc(nm)}">
  <button class="b pink" id="c">CREATE LOBBY</button>
  <div class="row"><input id="jc" maxlength="5" placeholder="CODE"><button class="b teal" id="j">JOIN LOBBY</button></div>
  <button class="b yel" id="q">QUICK PLAY</button>`;
  const n = () => { nm = $('#nm').value.trim() || pick(NAMES); localStorage.nm = nm; return nm; };
  $('#c').onclick = async () => enter(await rpc('mk', { nm: n(), q: false }));
  $('#j').onclick = async () => { const c = $('#jc').value.trim().toUpperCase(); await rpc('join_room', { c, nm: n() }); enter(c); };
  $('#q').onclick = async () => enter(await rpc('quick_play', { nm: n() }));
}
async function enter(c) {
  code = c; localStorage.code = c; chat = [];
  ch = sb.channel('room-' + c, { config: { broadcast: { self: true } } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${c}` }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `code=eq.${c}` }, load)
    .on('broadcast', { event: 'm' }, ({ payload }) => { chat = [...chat, payload].slice(-40); drawChat(); })
    .subscribe();
  await load();
}
async function load() {
  if (!code) return;
  const { data, error } = await sb.rpc('get_state', { c: code });
  if (error) { if (/Not in room|No such/.test(error.message)) menu(); return; }
  S = data; off = Date.parse(data.now) - Date.now(); draw();
}
function draw() {
  if (!S) return;
  const v = $('#ci')?.value, hadFocus = document.activeElement?.id === 'ci';
  S.room.phase === 'lobby' ? lobby() : S.room.phase === 'end' ? end() : game();
  const i = $('#ci'); if (i) { i.value = v || ''; if (hadFocus) i.focus(); }
  const f = $('#cf'); if (f) f.onsubmit = e => {
    e.preventDefault(); const t = $('#ci').value.trim(); if (!t) return; $('#ci').value = '';
    ch.send({ type: 'broadcast', event: 'm', payload: { k: seat(S.me), n: S.players[seat(S.me)].name, t } });
  };
  drawChat();
}
function drawChat() {
  const l = $('#log'); if (!l) return;
  l.innerHTML = chat.length ? chat.map(m => `<div style="--c:${COL[m.k] || '#fff'}"><b>${AV[m.k] || ''} ${esc(m.n)}:</b> ${esc(m.t)}</div>`).join('') : '<div style="opacity:.6">Silence. The carpet is listening.</div>';
  l.scrollTop = l.scrollHeight;
}
const chatBox = () => `<div class="chat"><div id="log"></div><form id="cf"><input id="ci" maxlength="140" placeholder="Say something suspicious…" autocomplete="off"><button>➤</button></form></div>`;

function lobby() {
  const R = S.room, ps = S.players, mm = ps[seat(S.me)], host = R.host === S.me, all = ps.length === 3 && ps.every(p => p.ready);
  app.innerHTML = `<div class="code">ROOM CODE<b>${R.code}</b><small>Exactly three players. Share the code.</small></div>
  <div class="cast">${[0, 1, 2].map(i => { const p = ps[i]; return p ? `<div class="pl pop" style="--c:${COL[i]}"><span class="av">${AV[i]}</span><b>${esc(p.name)}${p.id === S.me ? ' (you)' : ''}</b><i>${p.ready ? '✅ READY' : '🤔 not yet'}</i></div>` : `<div class="pl empty"><span class="av">❓</span><b>Waiting…</b></div>`; }).join('')}</div>
  <button class="b teal" id="rd">${mm.ready ? 'NOT READY' : 'I’M READY'}</button>
  ${host ? `<button class="b pink" id="go" ${all ? '' : 'disabled'}>START THE NIGHTMARE</button>` : '<p class="sub">The host starts once all three are ready.</p>'}
  <button class="b ghost" id="lv">Leave lobby</button>`;
  $('#rd').onclick = () => rpc('set_ready', { c: code, rd: !mm.ready });
  $('#go') && ($('#go').onclick = () => rpc('start_game', { c: code }));
  $('#lv').onclick = async () => { await rpc('leave_room', { c: code }); menu(); };
}

function game() {
  const R = S.room, ph = R.phase, sc = SC[R.sc[R.step]], ops = optsFor(sc, S.players.map(p => p.name)), k = seat(S.me);
  const my = S.rnd.find(x => x.step === R.step), voted = S.voted.includes(S.me);
  const secret = `<div class="secret ${peek ? '' : 'blur'}" id="sec"><h4>🤫 YOUR PRIVATE ORDERS <small>(tap to ${peek ? 'hide' : 'peek'})</small></h4>
    <p>${S.role === 'enemy' ? '😈 You are the SABOTEUR. Make the group pick WRONG. Don’t get caught.' : '🙂 You are a GUEST. A saboteur may be among you. Or not.'}</p>
    <p>📣 ${clueText(my, ops, R.step * 3 + k)}</p><p>⭐ Gold star if the group picks “${esc(ops[my.want])}”.</p></div>`;
  let body = '';
  if (ph === 'talk') body = `${secret}<p class="sub">Talk. Bluff. Bargain. Voting opens when the bar runs out.</p>${chatBox()}`;
  if (ph === 'vote') body = `<div class="opts">${ops.map((o, i) => `<button class="b opt" data-i="${i}" ${voted ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
    <p class="sub">${voted ? '🔒 Locked in.' : 'Votes stay secret until all are in.'} (${S.voted.length}/3 voted)</p>${secret}${chatBox()}`;
  if (ph === 'result') {
    const r = R.res[R.step], ok = r.o === r.t;
    body = `<div class="res ${ok ? 'win' : 'lose'}"><div class="card"><h2>${ok ? '✅ SUCCESS' : '❌ FAILURE'}</h2>
      <p>${r.o < 0 ? NOC : (ok ? WIN : FAIL)[R.step % 3]}</p><p>🧻 Napkin: <b>${esc(ops[r.t])}</b></p>
      <ul class="vl">${S.players.map((p, i) => `<li>${AV[i]} ${esc(p.name)} → <b>${r.v[p.id] >= 0 ? esc(ops[r.v[p.id]]) : 'froze in panic'}</b></li>`).join('')}</ul></div></div>`;
  }
  app.innerHTML = `<div class="top"><span>${sc.i} ${R.step + 1}/3</span><div class="bar" style="flex:1"><i id="tb"></i></div><span id="t"></span></div>
  <div class="card"><h2>${sc.t}</h2><p>${sc.s}</p><p><b>${sc.q}</b></p><p style="font-size:13px;opacity:.7">${NAPKIN}</p></div>${body}`;
  $('#sec') && ($('#sec').onclick = () => { peek = !peek; draw(); });
  document.querySelectorAll('.opt').forEach(b => b.onclick = async () => { await rpc('vote', { c: code, x: +b.dataset.i }); load(); });
}

function end() {
  const R = S.room, res = R.res, ps = S.players, names = ps.map(p => p.name), en = Object.values(S.roles).includes('enemy');
  const W = (id, i) => S.rnd.find(x => x.uid === id && x.step === i), gw = res.filter(r => r.o === r.t).length;
  const st = ps.map((p, k) => {
    const enemy = S.roles[p.id] === 'enemy', stars = res.filter((r, i) => r.o === W(p.id, i).want).length, right = res.filter(r => r.v[p.id] === r.t).length;
    return { p, k, enemy, stars, right, ok: enemy ? gw <= 1 : gw >= 2 && stars >= 1 };
  });
  const sage = [...st].sort((a, b) => b.right - a.right)[0], fool = [...st].sort((a, b) => a.right - b.right)[0];
  const boss = st.find(s => s.enemy);
  app.innerHTML = `<p class="big">${en ? `😈 THE SABOTEUR WAS ${esc(boss.p.name)}!` : '😇 THERE WAS NO SABOTEUR!'}</p>
  <p class="sub">${en ? 'Everyone else was just trying their best. Allegedly.' : 'You were all just weird. The strange orders were the only villain.'}</p>
  <div class="card"><h2>${VERDICT[gw]}</h2><p>Group matched the napkin ${gw}/3 times.</p>
  <p>🔮 Oracle: <b>${esc(sage.p.name)}</b> (${sage.right}/3 right)</p><p>🤡 Hotel’s favourite: <b>${esc(fool.p.name)}</b> (${fool.right}/3 right)</p>
  <p>⭐ Stars: ${st.map(s => `${esc(s.p.name)} ${s.stars}`).join(' · ')}</p></div>
  ${st.map(s => `<div class="rv" style="--c:${COL[s.k]}"><h4>${AV[s.k]} ${esc(s.p.name)} — ${s.enemy ? '😈 Saboteur' : '🙂 Guest'} ${s.ok ? '🏆 objective achieved' : '💀 objective failed'}</h4>
    <small>${s.enemy ? 'Goal: group fails at least 2 of 3.' : 'Goal: group wins at least 2 of 3 and you earn a star.'}</small>
    <ul>${res.map((r, i) => { const w = W(s.p.id, i), o = optsFor(SC[R.sc[i]], names); return `<li>${SC[R.sc[i]].i} ${clueText(w, o, i * 3 + s.k)} ⭐ wanted “${esc(o[w.want])}”. Truth: ${esc(o[r.t])}.</li>`; }).join('')}</ul></div>`).join('')}
  <button class="b pink" id="ag">PLAY AGAIN</button><button class="b ghost" id="lv">Back to menu</button>`;
  $('#ag').onclick = () => rpc('again', { c: code });
  $('#lv').onclick = menu;
}

setInterval(() => {
  if (!S || ['lobby', 'end'].includes(S.room.phase)) return;
  const l = Math.max(0, (Date.parse(S.room.ends_at) - Date.now() - off) / 1000);
  $('#t') && ($('#t').textContent = Math.ceil(l) + 's');
  $('#tb') && ($('#tb').style.width = Math.min(100, l / TOT[S.room.phase] * 100) + '%');
  if (l <= 0 && Date.now() - lastTick > 1500) { lastTick = Date.now(); setTimeout(() => sb.rpc('tick', { c: code }).then(load), Math.random() * 600); }
}, 500);
setInterval(() => load(), 5000);
init();
