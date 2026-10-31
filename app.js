'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const KINDS = { manga: 'Manga', manhwa: 'Manhwa', novel: 'Novel', anime: 'Anime' };
const TAB_LABEL = { all: 'Tutti', ...KINDS, stats: 'Statistiche' };
const ST = ['planned', 'doing', 'done', 'dropped'];
const LBL = { read: ['Da leggere', 'In lettura', 'Letto', 'Droppato'], watch: ['Da vedere', 'In corso', 'Visto', 'Droppato'] };
const stLabel = (k, s) => LBL[k === 'anime' ? 'watch' : 'read'][ST.indexOf(s)] || s;
const AL = { RELEASING: 'In corso', FINISHED: 'Concluso', NOT_YET_RELEASED: 'In arrivo', HIATUS: 'In pausa', CANCELLED: 'Cancellato' };
const CK = 'tracker-cache-v2';
const MIG_MSG = 'Per attivare preferiti e aggiornamenti automatici esegui supabase/migration-2.sql nel database (vedi SETUP.md).';

let sb, session = null, me = null, profiles = [], items = [], recs = [];
let view = 'mine', kind = 'manga', sfv = '', rfilter = 'all', sort = 'title';
let media = [], pending = null, stopImport = false, lastRefresh = 0, loading = false, animate = true;
try { sort = localStorage.getItem('tracker-sort') || 'title'; } catch { /* storage non disponibile */ }
const isLib = v => v === 'mine' || v === 'other';
const realKind = () => KINDS[kind] ? kind : 'manga'; // 'all' e 'stats' non sono tipi veri

// ---------- icone SVG (stile Lucide, tratto 2px) ----------
const IC = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  pkg: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  sort: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  wifioff: '<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  library: '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
document.querySelectorAll('i[data-ic]').forEach(i => i.outerHTML = ic(i.dataset.ic));

// ---------- avvisi (toast) ----------
let toastT;
function msg(t, err) {
  const el = $('toast'); clearTimeout(toastT);
  if (!t) { el.classList.remove('show'); return; }
  el.textContent = t; el.classList.toggle('err', !!err); el.classList.add('show');
  toastT = setTimeout(() => el.classList.remove('show'), err ? 9000 : 4500);
}
const show = () => { if (!$('dlg').open) $('dlg').showModal(); };

// ---------- volumi: "1-12, 15" -> insieme di numeri ----------
function volSet(s) {
  const set = new Set();
  for (const p of String(s || '').split(',')) {
    const m = p.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = a; i <= Math.min(b, a + 2000); i++) set.add(i);
  }
  return set;
}
const countVols = s => volSet(s).size;
function missingVols(x) { // volumi che mancano per completare la serie (solo se serve un totale noto e ne possiedi almeno uno)
  if (x.kind === 'anime' || !x.total || !x.owned) return [];
  const have = volSet(x.owned), out = [];
  for (let i = 1; i <= x.total; i++) if (!have.has(i)) out.push(i);
  return out;
}
function ranges(a) { // [13,14,16,17] -> "13-14, 16-17"
  const out = [];
  for (let i = 0; i < a.length;) { let j = i; while (a[j + 1] === a[j] + 1) j++; out.push(j > i ? `${a[i]}-${a[j]}` : `${a[i]}`); i = j + 1; }
  return out.join(', ');
}
console.assert(countVols('1-12, 15') === 13 && countVols('1-5, 3') === 5 && countVols('') === 0 && countVols('x') === 0);
console.assert(ranges([13, 14, 16, 17, 18, 20]) === '13-14, 16-18, 20' && missingVols({ kind: 'manga', total: 5, owned: '1-2, 5' }).join() === '3,4');

// ---------- stato, cache locale (per l'uso offline) ----------
const nameOf = id => profiles.find(p => p.id === id)?.name || '';
const otherId = () => profiles.find(p => p.id !== me?.id)?.id;
const online = () => !!session && navigator.onLine;
const viewUser = () => view === 'mine' ? me?.id : view === 'other' ? otherId() : undefined;
const initial = id => (nameOf(id)[0] || '?').toUpperCase();
// colore/ordine stabile su entrambi i dispositivi: ordine alfabetico dei nomi (poi id)
const profOrder = () => [...profiles].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
const uidx = id => Math.max(0, profOrder().findIndex(p => p.id === id));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const myName = () => (me && nameOf(me.id)) || cap(me?.email?.split('@')[0] || 'Io'); // finché i profili non sono caricati
const otherName = () => (otherId() && nameOf(otherId())) || 'Lux'; // finché il secondo profilo non esiste
const migrated = () => !items.length || ('favorite' in items[0] && 'anilist_status' in items[0]); // migration-2 eseguita?
const cacheSave = () => { try { localStorage.setItem(CK, JSON.stringify({ me, profiles, items, recs })); } catch { /* quota: si perde solo la copia offline */ } };
function cacheLoad() { try { const c = JSON.parse(localStorage.getItem(CK)); if (c) ({ me, profiles, items, recs } = c); } catch { /* cache assente o rovinata */ } }
function wipe() { items = []; recs = []; profiles = []; me = null; localStorage.removeItem(CK); render(); }

async function fetchAll(t, order) { // PostgREST restituisce al massimo 1000 righe per richiesta
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(t).select('*').order(order).order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
async function refresh() {
  lastRefresh = Date.now();
  loading = !items.length; render();
  try {
    [profiles, items, recs] = await Promise.all([fetchAll('profiles', 'id'), fetchAll('items', 'created_at'), fetchAll('recs', 'created_at')]);
    cacheSave();
  } catch (e) { msg('Impossibile aggiornare, mostro l\'ultima copia salvata. ' + (e.message || ''), 1); }
  loading = false; animate = true; render();
  if (items.length && !migrated()) msg(MIG_MSG, 1);
  else syncOngoing().then(n => { if (n) { msg(`Aggiornate ${n} opere in corso.`); render(); } }).catch(() => { /* AniList non raggiungibile: riprova alla prossima apertura */ });
}
async function setField(x, patch, table = 'items') {
  const { error } = await sb.from(table).update(patch).eq('id', x.id);
  if (error) { msg('Salvataggio fallito: ' + error.message, 1); return false; }
  Object.assign(x, patch); cacheSave(); return true;
}
async function addItem(o) {
  const { data, error } = await sb.from('items').insert({ kind: realKind(), status: 'planned', ...o }).select().single();
  if (error) throw error;
  items.push(data); cacheSave(); return data;
}

// ---------- copertine: AniList -> 200px JPEG -> bucket "covers" ----------
function cover(x, over = '') {
  const src = x.cover_path ? `${CFG.url}/storage/v1/object/public/covers/${x.cover_path}` : x.cover_url;
  const cors = x.cover_path ? ' crossorigin="anonymous"' : '';
  return `<span class="cover"><span class="ph">${esc(x.title)}</span>${src ? `<img src="${esc(src)}"${cors} loading="lazy" alt="" onload="this.classList.add('l')" onerror="this.remove()">` : ''}${over}</span>`;
}
async function putCover(blob, path, x, table) {
  const { error } = await sb.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return setField(x, { cover_path: path }, table);
}
async function uploadCover(x, table = 'items') {
  try {
    // cache:'reload' evita che il browser riusi la risposta dell'<img>, che non ha gli header CORS
    const r = await fetch(x.cover_url, { mode: 'cors', cache: 'reload' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const bmp = await createImageBitmap(await r.blob());
    const c = document.createElement('canvas'); c.width = 200; c.height = Math.round(200 * bmp.height / bmp.width);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .75));
    return await putCover(blob, `${me.id}/${x.anilist_id || x.id}.jpg`, x, table);
  } catch (err) { msg(`Copertina non salvata per “${x.title}”: ${err.message}`, 1); return false; }
}

// ---------- AniList ----------
const GQL = 'query($s:String,$t:MediaType,$fi:[MediaFormat],$c:CountryCode){Page(perPage:10){media(search:$s,type:$t,format_in:$fi,countryOfOrigin:$c){id title{romaji english}coverImage{large}volumes episodes status nextAiringEpisode{episode}}}}';
const GQL_SYNC = 'query($ids:[Int],$n:Int){Page(perPage:$n){media(id_in:$ids){id status volumes episodes nextAiringEpisode{episode}}}}';
const mt = m => m.title.english || m.title.romaji;
async function gql(query, variables, tries = 2) {
  const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (r.status === 429 && tries > 0) { await sleep((+r.headers.get('Retry-After') || 30) * 1000); return gql(query, variables, tries - 1); }
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0].message);
  return j.data;
}
async function ani(k, s) {
  const v = k === 'anime' ? { s, t: 'ANIME' } : k === 'novel' ? { s, t: 'MANGA', fi: ['NOVEL'] }
    : k === 'manhwa' ? { s, t: 'MANGA', fi: ['MANGA', 'ONE_SHOT'], c: 'KR' } : { s, t: 'MANGA', fi: ['MANGA', 'ONE_SHOT'] };
  return (await gql(GQL, v)).Page.media;
}
// episodi già usciti: solo per gli anime (in onda: il prossimo meno uno; finiti: tutti)
const releasedOf = (m, k) => k !== 'anime' ? null : m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.status === 'FINISHED' ? (m.episodes ?? null) : null;
const fromMedia = (m, k = realKind()) => ({ kind: k, title: mt(m), anilist_id: m.id, cover_url: m.coverImage.large, total: (k === 'anime' ? m.episodes : m.volumes) || null,
  ...(migrated() ? { anilist_status: m.status, released: releasedOf(m, k) } : {}) });
const hasItem = (k, aid) => items.some(i => i.user_id === me.id && i.kind === k && i.anilist_id === aid);

// Aggiornamento automatico: ogni 12 ore (o a richiesta) controlla su AniList le opere NON concluse e aggiorna totale, stato ed episodi usciti.
// Nota: per i manga AniList indica il numero di volumi solo quando la serie è conclusa (o inserito da loro).
async function syncOngoing(force = false) {
  if (!online() || !me || !migrated()) return 0;
  if (!force && Date.now() - (+localStorage.getItem('tracker-sync') || 0) < 12 * 3600e3) return 0;
  const mine = items.filter(x => x.user_id === me.id && x.anilist_id && !['FINISHED', 'CANCELLED'].includes(x.anilist_status));
  let changed = 0;
  for (let i = 0; i < mine.length; i += 50) {
    const chunk = mine.slice(i, i + 50);
    const map = new Map((await gql(GQL_SYNC, { ids: chunk.map(x => x.anilist_id), n: 50 })).Page.media.map(m => [m.id, m]));
    for (const x of chunk) {
      const m = map.get(x.anilist_id); if (!m) continue;
      const total = x.kind === 'anime' ? m.episodes : m.volumes, rel = releasedOf(m, x.kind), patch = {};
      if (m.status !== x.anilist_status) patch.anilist_status = m.status;
      if (total != null && total !== x.total) patch.total = total;
      if (x.kind === 'anime' && rel !== x.released) patch.released = rel;
      if (Object.keys(patch).length && await setField(x, patch)) changed++;
    }
  }
  localStorage.setItem('tracker-sync', String(Date.now()));
  return changed;
}

// ---------- animazioni di supporto ----------
function slide(nav) { // sposta l'indicatore sotto il pulsante attivo
  const b = nav.querySelector('[aria-pressed=true]'), i = nav.querySelector('.ind'); if (!b || !i) return;
  i.style.setProperty('--x', b.offsetLeft + 'px'); i.style.setProperty('--w', b.offsetWidth + 'px');
  if (!i.classList.contains('ready')) requestAnimationFrame(() => requestAnimationFrame(() => i.classList.add('ready')));
}
function tween(el, to, dec = 0) { // conteggio animato dei numeri
  const from = el._v ?? 0; el._v = to; cancelAnimationFrame(el._r);
  if (to === null) { el.textContent = '—'; return; }
  if (REDUCED.matches || from === to) { el.textContent = to.toFixed(dec); return; }
  const t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / 650); el.textContent = (from + (to - from) * (1 - Math.pow(1 - p, 3))).toFixed(dec); if (p < 1) el._r = requestAnimationFrame(step); };
  el._r = requestAnimationFrame(step);
}
const fade = el => { if (!REDUCED.matches && el.animate) el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' }); };
const tiles = arr => arr.forEach(([label, val, dec], i) => { $('l' + i).textContent = label; tween($('s' + i), val, dec || 0); });
const avgOf = a => a.length ? a.reduce((s, v) => s + +v, 0) / a.length : null;

// ---------- rendering ----------
const pct = x => x.total ? Math.min(1, (x.progress || 0) / x.total) : 0;
const SORTS = {
  title: (a, b) => a.title.localeCompare(b.title),
  recent: (a, b) => b.created_at.localeCompare(a.created_at),
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.title.localeCompare(b.title),
  progress: (a, b) => pct(b) - pct(a) || a.title.localeCompare(b.title)
};
const progressTxt = x => `${x.progress || 0}${x.total ? '/' + x.total : ''} ${x.kind === 'anime' ? 'ep.' : 'vol.'}`;

function card(x, i) {
  const a = x.kind === 'anime', n = x.progress || 0, lab = stLabel(x.kind, x.status), mineItem = x.user_id === me?.id;
  const own = a ? !!x.owned : countVols(x.owned) > 0, fresh = a && x.released > n ? x.released - n : 0;
  const info = a ? `${n}${x.total ? ' / ' + x.total : ''} ep. visti${fresh ? ` · ${fresh} nuov${fresh > 1 ? 'i' : 'o'}` : ''}`
    : `${n}${x.total ? ' / ' + x.total : ''} vol. letti${own ? ` · ${countVols(x.owned)}${x.total ? '/' + x.total : ''} pos.` : ''}`;
  const over = `<span class="pill st${ST.indexOf(x.status)}">${esc(lab)}</span>`
    + (x.score != null ? `<span class="score" title="Voto">${ic('star')}${x.score}</span>` : '')
    + (own ? `<span class="badge-i own" title="Posseduto">${ic('pkg')}</span>` : '')
    + (!x.cover_path && x.cover_url && mineItem ? `<span class="badge-i warn" title="Copertina non salvata per l'uso offline">${ic('alert')}</span>` : '')
    + (x.favorite || mineItem ? `<span class="fav${x.favorite ? ' on' : ''}"${mineItem ? ` data-fav role="button" aria-label="${x.favorite ? 'Togli dai' : 'Aggiungi ai'} preferiti"` : ''}>${ic('heart')}</span>` : '');
  return `<button class="card st${ST.indexOf(x.status)}" style="--i:${Math.min(i, 14)}" data-id="${x.id}" aria-label="${esc(x.title)}${x.favorite ? ', preferito' : ''}, ${esc(lab)}, ${info}">
    ${cover(x, over)}
    <span class="meta"><b>${esc(x.title)}</b><small>${info}</small><span class="bar"><i style="--p:${pct(x) * 100}%"></i></span></span></button>`;
}
const skeletons = () => Array.from({ length: 10 }, () => '<div class="card sk" aria-hidden="true"><span class="cover"></span><span class="meta"><i></i><i style="width:60%"></i></span></div>').join('');

function recCard(r, i) {
  const k = uidx(r.user_id), own = r.user_id === me?.id, have = r.anilist_id && me && hasItem(r.kind, r.anilist_id);
  return `<article class="rec u${k}" style="--i:${Math.min(i, 10)}" data-id="${r.id}">
    <div class="cv">${cover(r)}</div>
    <div class="body">
      <div class="line"><span class="kind">${KINDS[r.kind]}</span><span>${new Date(r.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span></div>
      <h3>${esc(r.title)}</h3>
      ${r.note ? `<p class="qt">${esc(r.note)}</p>` : ''}
      <div class="foot"><span class="by"><span class="av u${k}">${esc(initial(r.user_id))}</span>Consigliato da <b>${esc(nameOf(r.user_id) || '?')}</b></span>
        <span>${!own && online() ? (have ? `<span class="added">${ic('check')}Già nella tua lista</span>` : `<button class="btn" data-act="addrec">${ic('plus')}Aggiungi alla mia lista</button>`) : ''}
        ${own && online() ? `<button class="btn ghost danger" data-act="delrec" aria-label="Elimina consiglio">${ic('trash')}</button>` : ''}</span></div>
    </div></article>`;
}

// opere che hanno entrambi (stesso AniList id, oppure stesso titolo nello stesso tipo)
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
function commonPairs() {
  const o = otherId(); if (!me || !o) return [];
  const byId = new Map(), byTitle = new Map();
  items.filter(x => x.user_id === me.id).forEach(x => { if (x.anilist_id) byId.set(x.kind + x.anilist_id, x); byTitle.set(x.kind + norm(x.title), x); });
  return items.filter(x => x.user_id === o).map(x => [byId.get(x.kind + x.anilist_id) || byTitle.get(x.kind + norm(x.title)), x]).filter(p => p[0]);
}
function commonCard([a, b], i) {
  const rows = [a, b].sort((p, q) => uidx(p.user_id) - uidx(q.user_id)), sc = rows.map(r => r.score).filter(v => v != null);
  const delta = sc.length === 2 ? (+sc[0] === +sc[1] ? 'Stesso voto' : `Differenza di voto: ${Math.abs(sc[0] - sc[1]).toFixed(1)}`) : '';
  const row = r => `<button class="prow u${uidx(r.user_id)}" data-open="${r.id}"><span class="av u${uidx(r.user_id)}">${esc(initial(r.user_id))}</span><b>${esc(nameOf(r.user_id))}</b>
    <span><i class="dot st${ST.indexOf(r.status)}"></i>${esc(stLabel(r.kind, r.status))}</span><span class="sp"></span>
    ${r.score != null ? `<span class="sc">${ic('star')}${r.score}</span>` : ''}<span class="pg">${progressTxt(r)}</span></button>`;
  return `<article class="cmn" style="--i:${Math.min(i, 10)}"><button class="cv" data-open="${a.id}" aria-label="Apri ${esc(a.title)}">${cover(a)}</button>
    <div class="body"><div class="line"><span class="kind">${KINDS[a.kind]}</span>${delta ? `<span>${delta}</span>` : ''}</div><h3>${esc(a.title)}</h3>${rows.map(row).join('')}</div></article>`;
}

function empty(icon, title, text, acts = '') {
  return `<div class="empty"><span class="eico">${ic(icon)}</span><h3>${title}</h3><p>${text}</p>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
}

function render() {
  const anim = animate; animate = false;
  const lib = isLib(view), mineV = view === 'mine', isRecs = view === 'recs', isCommon = view === 'common';
  if (lib && kind === 'all') kind = 'manga';
  if (!lib && kind === 'stats') kind = 'all';
  const stats = lib && kind === 'stats', uid = viewUser(), q = $('q').value.trim().toLowerCase();
  const pairs = isCommon ? commonPairs() : [];

  // identità e colore
  document.body.dataset.a = isRecs ? '2' : isCommon ? '3' : String(uidx(uid));
  const names = { mine: myName(), other: otherName() };
  $('t-mine').textContent = names.mine; $('t-other').textContent = names.other;
  $('av-mine').textContent = (names.mine[0] || '?').toUpperCase(); $('av-other').textContent = (names.other[0] || '?').toUpperCase();
  $('av-mine').className = 'av u' + uidx(me?.id); $('av-other').className = 'av u' + (otherId() ? uidx(otherId()) : 1 - uidx(me?.id));
  $('av-me').className = 'av u' + uidx(me?.id); $('av-me').textContent = (names.mine[0] || '?').toUpperCase();
  document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === view));
  const cnt = isRecs ? k => recs.filter(r => k === 'all' || r.kind === k).length : isCommon ? k => pairs.filter(p => k === 'all' || p[0].kind === k).length : null;
  document.querySelectorAll('#kinds button').forEach(b => {
    const k = b.dataset.k;
    b.hidden = (k === 'all' && lib) || (k === 'stats' && !lib);
    b.setAttribute('aria-pressed', k === kind);
    b.innerHTML = TAB_LABEL[k] + (cnt && k !== 'stats' ? `<em>${cnt(k)}</em>` : '');
  });
  $('sort').value = sort;

  // visibilità per vista
  const showList = lib && !stats;
  $('list').hidden = !showList; $('recs').hidden = !isRecs; $('commonbody').hidden = !isCommon; $('statsbody').hidden = !stats;
  $('find').hidden = stats; $('sortw').hidden = !showList; $('chips').hidden = !(showList || isRecs);
  $('tools').hidden = !((mineV && !stats) || isRecs); $('man').hidden = $('imp').hidden = !(mineV && !stats);
  $('q').placeholder = isRecs ? 'Cerca un titolo da consigliare…' : isCommon ? 'Filtra le opere in comune' : view === 'other' ? 'Filtra la sua lista' : 'Filtra o cerca online…';
  const notes = [];
  if (view === 'other') notes.push(`${ic('eye')}<span>Stai guardando la libreria di ${esc(names.other)}: sola lettura.</span>`);
  if (me && !online()) notes.push(`${ic('wifioff')}<span>Offline: ultima copia salvata, modifiche disattivate.</span>`);
  $('ro').hidden = !notes.length; $('ro').innerHTML = notes.join('<span style="flex:1"></span>');

  // intestazione
  const hn = isRecs ? 'Consigli' : isCommon ? 'In comune' : mineV ? names.mine : names.other;
  $('hey').textContent = isRecs ? 'Zona comune' : isCommon ? 'Insieme' : stats ? 'Statistiche di' : 'Libreria di';
  $('hname').textContent = hn;
  $('hav').hidden = isRecs || isCommon; $('hav').className = 'av lg u' + uidx(uid); $('hav').textContent = (hn[0] || '?').toUpperCase();
  $('hsub').hidden = !(isRecs || isCommon);
  $('hsub').textContent = isRecs ? `Cosa ci stiamo consigliando. Scegli il tipo, cerca un titolo e proponilo a ${names.other}.` : 'Le opere che avete entrambi, con i vostri voti a confronto.';
  $('stats').hidden = isRecs;
  if (anim) fade($('hero'));

  if (isRecs) {
    const inKind = r => kind === 'all' || r.kind === kind;
    $('chips').innerHTML = [['all', 'Tutti', recs.filter(inKind).length], ...profOrder().map(p => [p.id, p.name, recs.filter(r => inKind(r) && r.user_id === p.id).length])]
      .map(([v, l, n]) => `<button class="chip" data-s="${v}" aria-pressed="${v === rfilter}">${esc(l)}<em>${n}</em></button>`).join('');
    const list = recs.filter(r => inKind(r) && (rfilter === 'all' || r.user_id === rfilter)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    $('recs').classList.toggle('anim', anim);
    $('recs').innerHTML = list.map(recCard).join('') || (recs.length
      ? empty('bulb', 'Nessun consiglio qui', 'Prova con un altro tipo o un altro autore.')
      : empty('bulb', 'Nessun consiglio, per ora', 'Scegli il tipo, cerca un titolo qui sopra e lascia una nota: l\'altra persona la troverà qui.'));
  } else if (isCommon) {
    const shown = pairs.filter(([a]) => (kind === 'all' || a.kind === kind) && a.title.toLowerCase().includes(q)).sort((p, r) => p[0].title.localeCompare(r[0].title));
    const [p0, p1] = profOrder().map(p => p.id);
    const avgFor = id => avgOf(shown.map(p => p.find(x => x.user_id === id)?.score).filter(v => v != null));
    tiles([['In comune', shown.length], ['Finiti da entrambi', shown.filter(p => p.every(x => x.status === 'done')).length],
      [`Voto medio ${nameOf(p0) || ''}`, avgFor(p0), 1], [`Voto medio ${nameOf(p1) || ''}`, avgFor(p1), 1]]);
    $('commonbody').classList.toggle('anim', anim);
    $('commonbody').innerHTML = shown.map(commonCard).join('') || (!otherId()
      ? empty('users', 'Manca il secondo profilo', 'Quando anche l\'altra persona avrà un account, qui vedrai cosa avete in comune.')
      : empty('users', pairs.length ? 'Nessun risultato' : 'Ancora nessuna opera in comune', pairs.length ? 'Prova a cambiare tipo o ricerca.' : 'Appena aggiungete lo stesso titolo, comparirà qui con i due voti affiancati.'));
  } else if (stats) {
    const its = items.filter(x => x.user_id === uid), sc = its.filter(x => x.score != null).map(x => x.score);
    tiles([['Titoli', its.length], ['Completati', its.filter(x => x.status === 'done').length], ['Voto medio', avgOf(sc), 1], ['Preferiti', its.filter(x => x.favorite).length]]);
    $('statsbody').classList.toggle('anim', anim);
    $('statsbody').innerHTML = renderStats(uid);
  } else {
    const a = kind === 'anime', all = items.filter(x => x.user_id === uid && x.kind === kind), scored = all.filter(x => x.score != null);
    tiles([['Titoli', all.length], [a ? 'Episodi visti' : 'Volumi letti', all.reduce((n, x) => n + (x.progress || 0), 0)],
      [a ? 'Posseduti' : 'Volumi posseduti', a ? all.filter(x => x.owned).length : all.reduce((n, x) => n + countVols(x.owned), 0)],
      ['Voto medio', avgOf(scored.map(x => x.score)), 1]]);
    const miss = x => missingVols(x).length && x.status !== 'dropped';
    const chips = [['', 'Tutti', all.length], ...ST.map(s => [s, stLabel(kind, s), all.filter(x => x.status === s).length]),
      ['fav', 'Preferiti', all.filter(x => x.favorite).length], ['owned', 'Posseduti', all.filter(x => x.owned).length],
      ...(a ? [] : [['missing', 'Mancano volumi', all.filter(miss).length]])];
    $('chips').innerHTML = chips.map(([v, l, n]) => `<button class="chip" data-s="${v}" aria-pressed="${v === sfv}">${l}<em>${n}</em></button>`).join('');
    const ok = x => !sfv || (sfv === 'owned' ? x.owned : sfv === 'fav' ? x.favorite : sfv === 'missing' ? miss(x) : x.status === sfv);
    const shown = all.filter(x => ok(x) && x.title.toLowerCase().includes(q))
      .sort((p, r) => (r.favorite ? 1 : 0) - (p.favorite ? 1 : 0) || SORTS[sort](p, r)); // i preferiti restano sempre in cima
    $('list').classList.toggle('anim', anim); $('list').setAttribute('aria-busy', loading);
    if (loading) $('list').innerHTML = skeletons();
    else if (shown.length) $('list').innerHTML = shown.map(card).join('');
    else if (!me) $('list').innerHTML = empty('library', 'Accedi per iniziare', 'Serve il login per vedere la libreria.');
    else if (all.length && (q || sfv)) $('list').innerHTML = empty('search', 'Nessun risultato', 'Prova a cambiare filtro o a cancellare la ricerca.');
    else $('list').innerHTML = mineV
      ? empty('library', `Nessun ${KINDS[kind].toLowerCase()} ancora`, 'Cerca un titolo online: copertina e numero di volumi si compilano da soli. Oppure importa un elenco da file di testo.',
          `<button class="btn pri" data-go="search">${ic('search')}Cerca online</button><button class="btn" data-go="import">${ic('upload')}Importa da file</button>`)
      : empty('inbox', `${esc(names.other)} non ha ancora aggiunto ${KINDS[kind].toLowerCase()}`, 'Quando lo farà, li vedrai qui.');
  }
  requestAnimationFrame(() => { slide($('views')); slide($('kinds')); });
}

// ---------- scheda titolo ----------
function openEdit(id) {
  const x = items.find(i => i.id === id); if (!x) return;
  const ro = x.user_id !== me.id || !online(), a = x.kind === 'anime', k = uidx(x.user_id);
  const miss = x.status !== 'dropped' ? missingVols(x) : [], fresh = a && x.released > (x.progress || 0) ? x.released - x.progress : 0;
  const val = (label, v) => `<div class="field"><span class="fl">${label}</span><span class="fv">${esc(v) || '—'}</span></div>`;
  const inp = (label, key, o = {}) => ro ? val(label, o.fmt ? o.fmt(x[key]) : x[key] ?? '')
    : `<label class="field"><span class="fl">${label}</span><input data-f="${key}" type="${o.t || 'text'}"${o.t === 'number' ? ` min="0"${o.max ? ` max="${o.max}"` : ''}${o.step ? ` step="${o.step}"` : ''} inputmode="decimal"` : ''} value="${esc(x[key] ?? '')}"></label>`;
  const step = (label, key) => ro ? val(label, x[key] ?? 0)
    : `<div class="field"><label class="fl" for="f-${key}">${label}</label><div class="stepper">
        <button type="button" class="btn" data-step="-1" aria-label="Meno uno">${ic('minus')}</button>
        <input id="f-${key}" data-f="${key}" type="number" min="0" inputmode="numeric" value="${x[key] ?? 0}">
        <button type="button" class="btn" data-step="1" aria-label="Più uno">${ic('plus')}</button></div></div>`;
  const status = ro ? `<span class="pill st${ST.indexOf(x.status)}" style="position:static;align-self:flex-start;background:var(--surface2);color:var(--fg)">${esc(stLabel(x.kind, x.status))}</span>`
    : `<div class="opts" role="group" aria-label="Stato">${ST.map(s => `<button type="button" class="opt" data-set="status" data-val="${s}" aria-pressed="${s === x.status}">${stLabel(x.kind, s)}</button>`).join('')}</div>`;
  $('dlg').innerHTML = `<div class="dlg" data-id="${id}" tabindex="-1" autofocus>
    <button class="btn ghost x" data-act="close" aria-label="Chiudi">${ic('x')}</button>
    <div class="dh">${cover(x)}<div class="col">
      <p class="eyebrow u${k}" style="color:var(--ut)">${KINDS[x.kind]}${x.anilist_status ? ' · ' + AL[x.anilist_status] : ''}${x.user_id !== me.id ? ' · ' + esc(nameOf(x.user_id)) : ''}</p>
      ${ro ? `<h2>${esc(x.title)}</h2>` : inp('Titolo', 'title')}
      ${ro ? status : `<button type="button" class="opt fav-toggle" data-set="favorite" data-val="${x.favorite ? '' : '1'}" aria-pressed="${!!x.favorite}">${ic('heart')}Preferito</button>`}</div></div>
    ${ro ? '' : `<div class="field"><span class="fl">Stato</span>${status}</div>`}
    ${fresh ? `<p class="miss"><b>${fresh}</b> episod${fresh > 1 ? 'i nuovi' : 'io nuovo'} da vedere (usciti ${x.released})</p>` : ''}
    <div class="grid2">${step(a ? 'Episodi visti' : 'Volumi letti', 'progress')}${inp(a ? 'Episodi totali' : 'Volumi totali', 'total', { t: 'number' })}</div>
    ${a ? (ro ? val('Posseduto', x.owned ? 'Sì' : 'No')
          : `<label class="field"><span class="fl">Posseduto (BD/DVD)</span><span class="opts"><button type="button" class="opt" data-set="owned" data-val="${x.owned ? '' : '1'}" aria-pressed="${!!x.owned}">${x.owned ? 'Sì, ce l\'ho' : 'No'}</button></span></label>`)
        : inp('Volumi posseduti (es. 1-12, 15)', 'owned')}
    ${miss.length ? `<p class="miss">Mancano <b>${miss.length}</b> volumi: ${esc(ranges(miss))}</p>` : ''}
    ${inp('Voto (0–10)', 'score', { t: 'number', max: 10, step: 0.5 })}
    ${ro ? val('Recensione', x.review) : `<label class="field"><span class="fl">Recensione</span><textarea data-f="review" rows="4" placeholder="Cosa ne pensi?">${esc(x.review)}</textarea></label>`}
    <div class="foot-acts">${ro ? '<span></span>' : `<button class="btn ghost danger" data-act="del">${ic('trash')}Elimina</button>`}
      ${!ro && !x.cover_path && x.cover_url ? `<button class="btn" data-act="cover">${ic('refresh')}Riprova copertina</button>` : ''}
      <button class="btn pri" data-act="close">${ro ? 'Chiudi' : 'Fatto'}</button></div></div>`;
  show();
}
async function saveFromDialog(el, k, v) {
  const x = items.find(i => i.id === el.closest('.dlg').dataset.id);
  if (!x || x.user_id !== me.id) return false;
  if (k === 'title' && !String(v).trim()) { msg('Il titolo non può essere vuoto.', 1); return false; }
  if (await setField(x, { [k]: v })) { render(); return true; }
  return false;
}
$('dlg').onchange = e => {
  const k = e.target.dataset.f; if (!k) return;
  let v = e.target.type === 'number' ? (e.target.value === '' ? null : +e.target.value) : e.target.value;
  if (k === 'progress' && v === null) v = 0;
  saveFromDialog(e.target, k, v);
};
async function toggleFav(id) {
  const x = items.find(i => i.id === id); if (!x || x.user_id !== me.id) return;
  if (!migrated()) return msg(MIG_MSG, 1);
  if (await setField(x, { favorite: !x.favorite })) render(); // il titolo salta in cima alla lista
}

// ---------- dialog: menu, importazione, consiglio ----------
const legacyList = () => { try { return localStorage.getItem('tracker-v1-done') ? [] : (JSON.parse(localStorage.getItem('tracker-v1')) || []); } catch { return []; } };
const rowBtn = (act, icon, label, cls = '') => `<button class="row-btn ${cls}" data-act="${act}">${ic(icon)}<span>${label}</span></button>`;
const xBtn = `<button class="btn ghost x" data-act="close" aria-label="Chiudi">${ic('x')}</button>`;
function openMenu() {
  const L = legacyList();
  $('dlg').innerHTML = `<div class="dlg" tabindex="-1" autofocus>${xBtn}
    <div class="prof"><span class="av lg u${uidx(me?.id)}">${me ? esc(initial(me.id) || (myName()[0] || '?').toUpperCase()) : '?'}</span>
      <div><h2>${esc(me ? myName() : 'Non connesso')}</h2><p>${esc(me?.email || '')}</p></div></div>
    <div class="list">
      ${online() ? rowBtn('rename', 'pencil', 'Cambia nome') : ''}
      ${online() && migrated() ? rowBtn('sync', 'refresh', 'Aggiorna ora le opere in corso') : ''}
      ${me ? rowBtn('backup', 'download', 'Scarica il backup della mia libreria (JSON)') : ''}
      ${L.length && online() ? rowBtn('legacy', 'upload', `Importa la vecchia lista locale (${L.length} titoli)`) : ''}
      ${session ? rowBtn('logout', 'logout', 'Esci', 'danger') : ''}
    </div></div>`;
  show();
}
function openImport() {
  $('dlg').innerHTML = `<div class="dlg" tabindex="-1" autofocus>${xBtn}<h2>Importa da file di testo</h2>
    <p>Un titolo per riga (righe vuote o che iniziano con # sono ignorate). Ogni titolo viene cercato su AniList e aggiunto col primo risultato come “da leggere/vedere”. Controlla il registro: il primo risultato può essere sbagliato.</p>
    <label class="field"><span class="fl">File .txt</span><input type="file" id="ifile" accept=".txt,text/plain"></label>
    <label class="field"><span class="fl">Oppure incolla qui i titoli</span><textarea id="itxt" rows="6"></textarea></label>
    <label class="field"><span class="fl">Tipo</span><select id="ikind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <pre id="log" hidden></pre>
    <div class="foot-acts"><button class="btn" data-act="close">Chiudi</button><button class="btn pri" data-act="runimport">Avvia importazione</button></div></div>`;
  $('ifile').onchange = async e => { if (e.target.files[0]) $('itxt').value = await e.target.files[0].text(); };
  show();
}
async function runImport() {
  const k = $('ikind').value, lines = [...new Set($('itxt').value.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')))];
  if (!lines.length) return;
  const log = $('log'), btn = document.querySelector('[data-act=runimport]');
  log.hidden = false; log.textContent = ''; btn.disabled = true; stopImport = false;
  let ok = 0;
  for (let i = 0; i < lines.length && !stopImport; i++) {
    if (i) await sleep(900); // AniList limita le richieste al minuto
    log.textContent += `[${i + 1}/${lines.length}] ${lines[i]} … `; log.scrollTop = log.scrollHeight;
    try {
      const [m] = await ani(k, lines[i]);
      if (!m) { log.textContent += 'NON TROVATO\n'; continue; }
      if (hasItem(k, m.id)) { log.textContent += `già presente (${mt(m)})\n`; continue; }
      const x = await addItem(fromMedia(m, k));
      log.textContent += `→ ${mt(m)}${await uploadCover(x) ? '' : ' (copertina non salvata)'}\n`; ok++;
    } catch (err) { log.textContent += `ERRORE ${err.message}\n`; }
  }
  log.textContent += `\nFinito: ${ok} aggiunti.`; log.scrollTop = log.scrollHeight; btn.disabled = false; render();
}
$('dlg').addEventListener('close', () => { stopImport = true; });

async function importLegacy() {
  const L = legacyList();
  if (!L.length || !confirm(`Importare ${L.length} titoli della vecchia lista di questo browser nel tuo profilo?`)) return;
  const idx = { 'Da comprare': 0, 'Da vedere': 0, 'In corso': 1, 'Completo': 2, 'Completato': 2, 'Droppato': 3 };
  let n = 0, fail = 0;
  for (const o of L) {
    msg(`Importo ${n + fail + 1}/${L.length}…`);
    try {
      const x = await addItem({ kind: o.type, title: o.title, status: ST[idx[o.status] ?? 0], owned: o.owned || '', progress: o.watched || 0,
        total: o.total ?? null, score: o.score ?? null, review: o.notes || '', cover_url: o.coverUrl || null });
      if (o.cover) await putCover(await (await fetch(o.cover)).blob(), `${me.id}/legacy-${x.id}.jpg`, x, 'items');
      n++;
    } catch { fail++; }
  }
  if (!fail) localStorage.setItem('tracker-v1-done', '1');
  msg(`Importati ${n} titoli${fail ? `, ${fail} falliti (riprova: i già importati verrebbero duplicati, quindi controlla la lista)` : ''}.`, !!fail);
  render();
}

function recDialog(m) {
  pending = { m, k: realKind() };
  $('dlg').innerHTML = `<div class="dlg" tabindex="-1" autofocus>${xBtn}<h2>Consiglia ${esc(KINDS[pending.k].toLowerCase())}</h2>
    <div class="dh">${cover({ title: mt(m), cover_url: m.coverImage.large })}<div class="col"><h2 style="font-size:20px">${esc(mt(m))}</h2></div></div>
    <label class="field"><span class="fl">Nota per ${esc(otherName())}</span><textarea id="rnote" rows="3" placeholder="Perché dovrebbe piacerti?"></textarea></label>
    <div class="foot-acts"><button class="btn" data-act="close">Annulla</button><button class="btn pri" data-act="sendrec">${ic('bulb')}Invia consiglio</button></div></div>`;
  show();
}
async function sendRec() {
  const { m, k } = pending, f = fromMedia(m, k);
  const { data, error } = await sb.from('recs').insert({ kind: k, title: f.title, total: f.total, anilist_id: f.anilist_id, cover_url: f.cover_url, note: $('rnote').value.trim() }).select().single();
  if (error) return msg('Invio fallito: ' + error.message, 1);
  recs.push(data); cacheSave(); $('dlg').close(); animate = true; render(); msg('Consiglio inviato.');
  await uploadCover(data, 'recs'); render();
}

$('dlg').onclick = async e => {
  if (e.target === $('dlg')) return $('dlg').close(); // click sullo sfondo
  const stp = e.target.closest('[data-step]');
  if (stp) { // + / − sul contatore
    const inp = stp.parentElement.querySelector('input');
    inp.value = Math.max(0, (+inp.value || 0) + +stp.dataset.step);
    inp.dispatchEvent(new Event('change', { bubbles: true })); return;
  }
  const set = e.target.closest('[data-set]');
  if (set) { // stato, preferito, posseduto
    const key = set.dataset.set, v = key === 'favorite' ? set.dataset.val === '1' : set.dataset.val;
    if (key === 'favorite' && !migrated()) return msg(MIG_MSG, 1);
    if (await saveFromDialog(set, key, v)) {
      if (key === 'status') set.parentElement.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-pressed', o === set));
      else if (key === 'favorite') { set.dataset.val = v ? '' : '1'; set.setAttribute('aria-pressed', v); }
      else openEdit(set.closest('.dlg').dataset.id);
    }
    return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.dlg')?.dataset.id, x = items.find(i => i.id === id);
  switch (b.dataset.act) {
    case 'close': $('dlg').close(); break;
    case 'del':
      if (confirm(`Eliminare "${x.title}"?`)) {
        const { error } = await sb.from('items').delete().eq('id', x.id);
        if (error) return msg('Eliminazione fallita: ' + error.message, 1);
        items = items.filter(i => i !== x); cacheSave(); render(); $('dlg').close();
      } break;
    case 'cover': if (await uploadCover(x)) { msg(''); render(); openEdit(id); } break;
    case 'rename': {
      const n = prompt('Il tuo nome:', nameOf(me.id));
      if (n?.trim() && await setField(profiles.find(p => p.id === me.id), { name: n.trim() }, 'profiles')) { render(); openMenu(); }
      break;
    }
    case 'sync': {
      $('dlg').close(); msg('Controllo gli aggiornamenti su AniList…');
      try { const n = await syncOngoing(true); msg(n ? `Aggiornate ${n} opere in corso.` : 'Tutto già aggiornato.'); render(); } catch (err) { msg('Aggiornamento fallito: ' + err.message, 1); }
      break;
    }
    case 'backup': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(items.filter(i => i.user_id === me.id), null, 1)], { type: 'application/json' }));
      a.download = `tracker-${new Date().toISOString().slice(0, 10)}.json`; a.click(); break;
    }
    case 'legacy': $('dlg').close(); await importLegacy(); break;
    case 'logout': $('dlg').close(); await doLogout(); break;
    case 'runimport': await runImport(); break;
    case 'sendrec': await sendRec(); break;
  }
};

// ---------- login ----------
async function doLogout() {
  let failed = false;
  try { failed = !!(await sb.auth.signOut({ scope: 'local' })).error; } catch { failed = true; } // 'local': esce solo da questo dispositivo, non dagli altri
  if (!failed) return; // il listener SIGNED_OUT svuota la copia locale e mostra il login
  // rete assente o server in errore: la libreria non ha tolto la sessione, la togliamo noi da questo dispositivo
  Object.keys(localStorage).filter(k => /^sb-.*-auth-token/.test(k)).forEach(k => localStorage.removeItem(k));
  session = null; wipe(); showLogin();
  $('lerr').style.color = 'var(--mut)'; $('lerr').textContent = 'Disconnesso da questo dispositivo (senza rete non ho potuto avvisare il server).';
}
function showLogin() {
  if ($('login').open) return;
  $('login').innerHTML = `<form class="dlg login" id="lf">
    <div class="brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#e11d48"/><rect x="8" y="8" width="4.5" height="16" rx="1.5" fill="#fff"/><rect x="14.5" y="8" width="4.5" height="16" rx="1.5" fill="#fff" opacity=".8"/><rect x="21" y="9.5" width="4.5" height="15" rx="1.5" transform="rotate(-12 23 17)" fill="#fff" opacity=".6"/></svg><span>Tracker</span></div>
    <p>Accedi per vedere e aggiornare la tua libreria. Gli account sono creati dal proprietario.</p>
    <label class="field"><span class="fl">Email</span><input name="email" type="email" required autocomplete="username"></label>
    <label class="field"><span class="fl">Password</span><input name="password" type="password" required autocomplete="current-password"></label>
    <p id="lerr" class="err" role="alert"></p><button class="btn pri">Entra</button></form>`;
  $('lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    $('lerr').style.color = 'var(--mut)'; $('lerr').textContent = 'Accesso in corso…';
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) { $('lerr').style.color = ''; $('lerr').textContent = 'Accesso fallito: ' + error.message; }
  };
  $('login').showModal();
}
$('login').addEventListener('cancel', e => e.preventDefault()); // non si chiude con Esc senza accedere

// ---------- eventi ----------
$('views').onclick = e => {
  const v = e.target.closest('[data-v]')?.dataset.v; if (!v || v === view) return;
  view = v; sfv = ''; rfilter = 'all';
  if (!isLib(v)) kind = 'all'; else if (kind === 'all') kind = 'manga'; // consigli e "in comune" partono da "Tutti"
  animate = true; $('res').className = ''; msg(''); render();
};
$('kinds').onclick = e => { const k = e.target.closest('[data-k]')?.dataset.k; if (k && k !== kind) { kind = k; sfv = ''; animate = true; $('res').className = ''; render(); } };
$('chips').onclick = e => {
  const s = e.target.closest('[data-s]')?.dataset.s; if (s === undefined) return;
  if (view === 'recs') rfilter = s; else sfv = s;
  animate = true; render();
};
$('sort').onchange = e => { sort = e.target.value; try { localStorage.setItem('tracker-sort', sort); } catch { /* ok */ } animate = true; render(); };
$('q').oninput = render;
$('q').onkeydown = e => { if (e.key === 'Enter' && (view === 'mine' || view === 'recs')) $('web').click(); };
$('list').onclick = e => {
  const f = e.target.closest('[data-fav]');
  if (f) { e.stopPropagation(); return toggleFav(f.closest('.card').dataset.id); }
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (go === 'search') return $('q').focus();
  if (go === 'import') return openImport();
  const p = e.target.closest('.card[data-id]'); if (p) openEdit(p.dataset.id);
};
const openFrom = e => { const o = e.target.closest('[data-open]')?.dataset.open; if (o) openEdit(o); };
$('commonbody').onclick = openFrom; $('statsbody').onclick = openFrom;
$('menu').onclick = openMenu;
$('imp').onclick = openImport;
$('man').onclick = async () => {
  const title = prompt('Titolo?'); if (!title?.trim()) return;
  try { await addItem({ title: title.trim() }); render(); } catch (err) { msg('Aggiunta fallita: ' + err.message, 1); }
};
$('web').onclick = async () => {
  if (!KINDS[kind]) return msg('Scegli prima un tipo (Manga, Manhwa, Novel o Anime) per cercare.', 1);
  const s = $('q').value.trim(); if (!s) { $('q').focus(); return msg('Scrivi un titolo nella barra di ricerca.'); }
  if (!online()) return msg('Serve la connessione per cercare online.', 1);
  msg('Cerco…');
  try {
    media = await ani(kind, s);
    msg(media.length ? '' : 'Nessun risultato.');
    $('res').className = 'show';
    $('res').innerHTML = `<div class="head"><div><b class="fnt">${view === 'recs' ? 'Cosa vuoi consigliare?' : 'Scegli quello da aggiungere'}</b><small>Risultati per “${esc(s)}” in ${KINDS[kind]}</small></div><button class="btn ghost" id="rx" aria-label="Chiudi risultati">${ic('x')}</button></div><div class="grid anim">`
      + media.map((m, i) => `<button class="card" style="--i:${i}" data-i="${i}" aria-label="${esc(mt(m))}">${cover({ title: mt(m), cover_url: m.coverImage.large })}
        <span class="meta"><b>${esc(mt(m))}</b><small>${(kind === 'anime' ? m.episodes : m.volumes) || '?'} ${kind === 'anime' ? 'episodi' : 'volumi'}</small></span></button>`).join('') + '</div>';
    $('rx').onclick = () => $('res').className = '';
    $('res').scrollIntoView({ behavior: REDUCED.matches ? 'auto' : 'smooth', block: 'nearest' });
  } catch (err) { msg('Ricerca fallita: ' + err.message, 1); }
};
$('res').onclick = async e => {
  const c = e.target.closest('.card[data-i]'); if (!c) return;
  const m = media[c.dataset.i];
  $('res').className = '';
  if (view === 'recs') return recDialog(m);
  if (hasItem(kind, m.id)) return msg('È già nella tua lista.', 1);
  msg('Aggiungo…');
  try { const x = await addItem(fromMedia(m)); render(); if (await uploadCover(x)) msg(`“${x.title}” aggiunto.`); } catch (err) { msg('Aggiunta fallita: ' + err.message, 1); }
  render();
};
$('recs').onclick = async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const r = recs.find(i => i.id === b.closest('.rec').dataset.id);
  if (b.dataset.act === 'addrec') {
    try {
      await addItem({ kind: r.kind, title: r.title, anilist_id: r.anilist_id, total: r.total, cover_url: r.cover_url, cover_path: r.cover_path });
      msg(`“${r.title}” aggiunto alla tua lista come da ${r.kind === 'anime' ? 'vedere' : 'leggere'}.`);
    } catch (err) { msg('Aggiunta fallita: ' + err.message, 1); }
  }
  if (b.dataset.act === 'delrec' && confirm('Eliminare questo consiglio?')) {
    const { error } = await sb.from('recs').delete().eq('id', r.id);
    if (error) return msg('Eliminazione fallita: ' + error.message, 1);
    recs = recs.filter(i => i !== r); cacheSave();
  }
  render();
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && online() && Date.now() - lastRefresh > 30000) refresh(); });
addEventListener('online', () => { session && refresh(); });
addEventListener('offline', render);
addEventListener('resize', () => { slide($('views')); slide($('kinds')); });
addEventListener('scroll', () => $('top').classList.toggle('scrolled', scrollY > 4), { passive: true });
document.fonts?.ready.then(() => { slide($('views')); slide($('kinds')); });

// ---------- avvio ----------
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
cacheLoad(); render();
if (!CFG.url || /INSERISCI/.test(CFG.url)) {
  msg('Configura config.js con URL e chiave di Supabase (vedi SETUP.md).', 1);
} else {
  sb = supabase.createClient(CFG.url, CFG.key);
  sb.auth.onAuthStateChange((ev, s) => {
    session = s;
    if (s) {
      me = { id: s.user.id, email: s.user.email };
      if ($('login').open) $('login').close();
      if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(refresh, 0); // niente await di Supabase dentro il callback
    } else if (ev === 'SIGNED_OUT') { wipe(); showLogin(); }
    else if (ev === 'INITIAL_SESSION') { if (navigator.onLine || !me) showLogin(); else render(); }
  });
}
