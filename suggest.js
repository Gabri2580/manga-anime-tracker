'use strict';
// Consigli automatici "Per te": profilo dei gusti dai tuoi voti e preferiti (taste.js) + candidati da AniList
// (raccomandazioni della community per i titoli che ami, e titoli popolari per i tuoi tag). Usa i globali di app.js.
let recsMode = 'us'; // 'us' = consigli tra voi due, 'auto' = automatici
const SG = { status: 'idle', list: [], other: null, info: null, busy: false, sig: '', err: '', at: 0 };
const META_KEY = 'tracker-meta-v1', POOL_KEY = 'tracker-pool-v1';
const jget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* spazio finito: si ricalcola */ } };
const dismissKey = () => 'tracker-dismissed-' + (me?.id || '');
let META = jget(META_KEY, {}); // { idAniList: { g: generi, t: [[tag, rank]] } }
const metaGet = id => META[id];
function metaPut(c) { META[c.id] = { g: c.genres, t: c.tags }; clearTimeout(metaPut.t); metaPut.t = setTimeout(() => jset(META_KEY, META), 500); }
const mkMeta = m => ({ g: m.genres || [], t: (m.tags || []).filter(t => !t.isMediaSpoiler).sort((a, b) => b.rank - a.rank).slice(0, 12).map(t => [t.name, t.rank]) });

const SG_MC = 'id type format countryOfOrigin title{romaji english} coverImage{large} volumes episodes averageScore popularity genres tags{name rank isMediaSpoiler} startDate{year} isAdult status';
const sgFormatOk = m => m.type === 'ANIME' ? ['TV', 'TV_SHORT', 'MOVIE', 'ONA', 'OVA'].includes(m.format) : true;
function sgSig() { // impronta della libreria: cambia quando cambi voti, stati o preferiti
  const s = items.filter(x => x.user_id === me?.id).map(x => `${x.anilist_id || x.id}|${x.status}|${x.score ?? ''}|${x.favorite ? 1 : 0}`).sort().join(';');
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h + ':' + (recsMode === 'auto' ? 'a' : '-');
}
const sgTop = p => [...p.weights].filter(([, w]) => w.w > 0.5).sort((a, b) => b[1].w - a[1].w).slice(0, 8).map(([id]) => id);

async function sgFetchMeta(ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const d = await gql('query($ids:[Int]){Page(perPage:50){media(id_in:$ids){id genres tags{name rank isMediaSpoiler}}}}', { ids: part });
    const got = new Set(d.Page.media.map(m => m.id));
    d.Page.media.forEach(m => { META[m.id] = mkMeta(m); });
    part.filter(id => !got.has(id)).forEach(id => { META[id] = { g: [], t: [] }; }); // non più su AniList: non richiederlo di nuovo
    await sleep(300);
  }
  jset(META_KEY, META);
}
async function sgFetchPool(profile) {
  const cands = {}, edges = {}, top = sgTop(profile);
  const add = m => { if (!m || m.isAdult || !sgFormatOk(m)) return null; const c = Notes.toCand(m); cands[c.id] = c; return c; };
  if (top.length) {
    const d = await gql(`query($ids:[Int]){Page(perPage:8){media(id_in:$ids){id recommendations(sort:RATING_DESC,perPage:8){nodes{rating mediaRecommendation{${SG_MC}}}}}}}`, { ids: top });
    for (const m of d.Page.media) for (const n of m.recommendations.nodes) { const c = add(n.mediaRecommendation); if (c) (edges[c.id] ||= []).push({ from: m.id, r: n.rating }); }
  }
  const tags = [...profile.vec].filter(([k]) => k.startsWith('t:')).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.slice(2));
  if (tags.length) for (const type of ['MANGA', 'ANIME']) {
    await sleep(300);
    const d = await gql(`query($tags:[String],$t:MediaType){Page(perPage:25){media(type:$t,tag_in:$tags,sort:POPULARITY_DESC,isAdult:false){${SG_MC}}}}`, { tags, t: type });
    d.Page.media.forEach(add);
  }
  return { uid: me.id, at: Date.now(), sig: top.join(','), cands, edges };
}
const sgOtherFormat = (c, mine) => mine.find(x => x.kind !== c.kind && x.anilist_id !== c.id && Notes.normT(x.title) === Notes.normT(c.title));

function sgOther() { // dalla libreria dell'altro: nessuna richiesta di rete
  const o = otherId(); if (!o || !me) { SG.other = null; return; }
  const gone = new Set(jget(dismissKey(), []));
  const key = x => x.kind + ':' + (x.anilist_id || Notes.normT(x.title));
  const r = Taste.fromOther(items.filter(x => x.user_id === me.id), items.filter(x => x.user_id === o && !gone.has('i:' + x.id)), key, 8);
  SG.other = r.picks.length ? r : null;
}
async function ensureSuggestions(force = false) {
  if (SG.busy || !me) return;
  const sig = sgSig();
  if (!force && SG.sig === sig && SG.status !== 'idle') return; // già calcolato (anche se è andato in errore: si riprova con "Aggiorna")
  SG.busy = true; SG.sig = sig; if (SG.status !== 'ready') SG.status = 'loading';
  try {
    const mine = items.filter(x => x.user_id === me.id);
    const need = [...new Set(mine.filter(x => x.anilist_id && x.status !== 'planned' && !META[x.anilist_id]).map(x => x.anilist_id))];
    if (need.length) { if (!online()) throw new Error('offline'); await sgFetchMeta(need); }
    const profile = Taste.buildProfile(mine, metaGet);
    SG.info = { used: profile.used, mean: profile.mean };
    if (profile.used < 5) { SG.status = 'few'; SG.list = []; }
    else {
      let pool = jget(POOL_KEY, null);
      const fresh = pool && pool.uid === me.id && Date.now() - pool.at < 3 * 86400e3 && pool.sig === sgTop(profile).join(',');
      if (force || !fresh) { if (online()) { pool = await sgFetchPool(profile); jset(POOL_KEY, pool); } else if (!pool || pool.uid !== me.id) throw new Error('offline'); }
      const gone = new Set(jget(dismissKey(), [])), exclude = new Set([...mine.map(x => x.anilist_id).filter(Boolean), ...gone]);
      SG.list = Taste.rank(Object.values(pool.cands), profile, pool.edges, exclude, 40)
        .map(s => ({ c: s.c, tier: s.tier, why: Taste.why(s, profile, pool.edges), twin: sgOtherFormat(s.c, mine) }));
      SG.status = 'ready';
    }
    SG.at = Date.now(); SG.err = '';
  } catch (e) { SG.status = 'error'; SG.err = e.message === 'offline' ? 'Servono la connessione e almeno un aggiornamento fatto in precedenza.' : 'Non riesco a contattare AniList: ' + e.message; }
  SG.busy = false; sgOther(); render();
}

// ---------- rendering ----------
const sgKindOk = k => kind === 'all' || k === kind;
function sgCard(s) {
  const c = s.c, w = s.why;
  const reason = [w.from ? `Per chi ha amato «${esc(w.from)}»` : '', w.tags.length ? `Ti piacciono: ${w.tags.map(esc).join(', ')}` : ''].filter(Boolean).join(' · ');
  return `<article class="rec sg" data-cid="${c.id}"><div class="cv">${cover({ title: c.title, cover_url: c.cover })}</div>
    <div class="body"><div class="line"><span class="kind">${KINDS[c.kind]}</span>${c.year ? `<span>${c.year}</span>` : ''}${c.avg ? `<span>★ ${(c.avg / 10).toFixed(1)}</span>` : ''}<span class="tier t-${s.tier}">${s.tier}</span></div>
      <h3>${esc(c.title)}</h3>
      ${reason ? `<p class="why">${reason}</p>` : ''}
      ${s.twin ? `<p class="why">Hai già ${esc(KINDS[s.twin.kind].toLowerCase())}: «${esc(s.twin.title)}»</p>` : ''}
      <div class="foot sgact"><button class="btn" data-sg="add" data-id="${c.id}">${ic('plus')}Aggiungi</button>
        ${otherId() ? `<button class="btn" data-sg="send" data-id="${c.id}">${ic('bulb')}Consiglia a ${esc(otherName())}</button>` : ''}
        <a class="btn ghost" href="https://anilist.co/${c.kind === 'anime' ? 'anime' : 'manga'}/${c.id}" target="_blank" rel="noopener" aria-label="Apri ${esc(c.title)} su AniList">${ic('link')}</a>
        <button class="btn ghost" data-sg="no" data-id="${c.id}" aria-label="Non mi interessa">${ic('x')}</button></div></div></article>`;
}
function sgOtherCard(x) {
  const k = uidx(x.user_id);
  return `<article class="rec sg u${k}" data-xid="${x.id}"><div class="cv">${cover(x)}</div>
    <div class="body"><div class="line"><span class="kind">${KINDS[x.kind]}</span>${x.score != null ? `<span>★ ${x.score}</span>` : ''}${x.favorite ? '<span>♥ preferito</span>' : ''}</div>
      <h3>${esc(x.title)}</h3><p class="why"><b style="color:var(--ut)">${esc(nameOf(x.user_id))}</b> lo ha ${x.favorite ? 'messo tra i preferiti' : 'valutato bene'}: tu non ce l'hai ancora.</p>
      <div class="foot sgact"><button class="btn" data-sg="addx" data-id="${x.id}">${ic('plus')}Aggiungi</button><button class="btn ghost" data-sg="nox" data-id="${x.id}" aria-label="Non mi interessa">${ic('x')}</button></div></div></article>`;
}
function suggestHTML() {
  sgOther(); // la libreria dell'altro può essere cambiata dopo l'ultimo calcolo
  const sk = Array.from({ length: 4 }, () => '<div class="rec sk" aria-hidden="true"><div class="cv"><span class="cover"></span></div><div class="body"><i></i><i style="width:60%"></i></div></div>').join('');
  if (SG.status === 'idle' || SG.status === 'loading') return `<div class="sg-head"><div><b>Preparo i consigli…</b><small>Leggo i tuoi voti e cerco su AniList titoli simili a quelli che ami.</small></div></div>${sk}`;
  if (SG.status === 'error') return empty('alert', 'Consigli non disponibili', esc(SG.err), `<button class="btn pri" data-sg="refresh">${ic('refresh')}Riprova</button>`)
    + (SG.other ? sgOtherSection() : '');
  if (SG.status === 'few') return empty('bulb', 'Servono un po\' più di gusti', `Per proporti qualcosa di sensato mi servono almeno 5 titoli collegati ad AniList su cui hai espresso un giudizio: un voto, un preferito, completato o droppato. Per ora ne ho ${SG.info?.used ?? 0}. Aggiungi qualche voto e torna qui.`)
    + (SG.other ? sgOtherSection() : '');
  const list = SG.list.filter(s => sgKindOk(s.c.kind));
  return `<div class="sg-head"><div><b>Basati sui tuoi ${SG.info.used} titoli</b><small>Media dei tuoi voti ${SG.info.mean.toFixed(1)} · aggiornati alle ${new Date(SG.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Più voti e preferiti inserisci, più diventano precisi.</small></div>
    <button class="btn" data-sg="refresh">${ic('refresh')}Aggiorna</button></div>`
    + (SG.other ? sgOtherSection() : '')
    + `<h3 class="sg-h">Scelti per te da AniList</h3>`
    + (list.length ? list.map(sgCard).join('') : empty('inbox', 'Niente in questa categoria', 'Prova con "Tutti" o con un altro tipo.'));
}
function sgOtherSection() {
  const picks = SG.other.picks.filter(x => sgKindOk(x.kind));
  return picks.length ? `<h3 class="sg-h">Dalla libreria di ${esc(otherName())}</h3>${picks.map(sgOtherCard).join('')}` : '';
}

// ---------- azioni ----------
const sgFind = id => SG.list.find(s => s.c.id === +id);
function sgDismiss(key) { const g = jget(dismissKey(), []); if (!g.includes(key)) { g.push(key); jset(dismissKey(), g); } }
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-sg]'); if (!b || b.closest('#recs') == null) return;
  const act = b.dataset.sg, id = b.dataset.id;
  if (act === 'refresh') { SG.status = SG.list.length ? 'ready' : 'loading'; render(); return ensureSuggestions(true); }
  if (!online() && act !== 'no' && act !== 'nox') return msg('Serve la connessione per aggiungere.', 1);
  try {
    if (act === 'add') {
      const s = sgFind(id), c = s.c;
      const x = await addItem({ kind: c.kind, title: c.title, anilist_id: c.id, cover_url: c.cover, total: c.total, ...(migrated() ? { anilist_status: c.astatus, released: c.released } : {}) });
      metaPut(c); queueCovers([x]); SG.list = SG.list.filter(t => t !== s); SG.sig = sgSig(); msg(`“${c.title}” aggiunto alla tua lista.`); render();
    } else if (act === 'send') {
      const c = sgFind(id).c, f = sgFind(id);
      recDialog({ id: c.id, title: { english: c.title, romaji: c.title }, coverImage: { large: c.cover }, volumes: c.kind === 'anime' ? null : c.total, episodes: c.kind === 'anime' ? c.total : null },
        c.kind, `Secondo i tuoi gusti potrebbe piacerti.${f.why.tags.length ? ' Tag: ' + f.why.tags.join(', ') + '.' : ''}`);
    } else if (act === 'no') {
      const s = sgFind(id); sgDismiss(+id); SG.list = SG.list.filter(t => t !== s); SG.sig = sgSig(); msg('Non te lo riproporrò più su questo dispositivo.'); render();
    } else if (act === 'addx') {
      const x = items.find(i => i.id === id);
      const row = await addItem({ kind: x.kind, title: x.title, anilist_id: x.anilist_id, total: x.total, cover_url: x.cover_url, cover_path: x.cover_path });
      queueCovers([row]); SG.sig = sgSig(); sgOther(); msg(`“${x.title}” aggiunto alla tua lista.`); render();
    } else if (act === 'nox') { sgDismiss('i:' + id); sgOther(); render(); }
  } catch (err) { msg('Operazione fallita: ' + (err.message || err), 1); }
});
$('rmode').onclick = e => {
  const m = e.target.closest('[data-m]')?.dataset.m; if (!m || m === recsMode) return;
  recsMode = m; animate = true; render();
};
