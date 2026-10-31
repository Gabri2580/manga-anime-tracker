'use strict';
// Importazione guidata delle note: lettura -> ricerca raggruppata su AniList -> scelta una scheda alla volta -> elenco dei non trovati.
// Usa i globali di app.js ($, esc, ic, cover, addItem, hasItem, gql, ...); l'analisi del testo sta in notes.js.
let IM = null; // stato dell'importazione in corso (si salva ad ogni passo, così si può riprendere)
const IM_KEY = () => 'tracker-import-' + (me?.id || '');
const imSave = () => { try { localStorage.setItem(IM_KEY(), JSON.stringify(IM)); } catch { /* spazio finito: niente ripresa */ } };
const imLoad = () => { try { return JSON.parse(localStorage.getItem(IM_KEY())); } catch { return null; } };
const imClear = () => { try { localStorage.removeItem(IM_KEY()); } catch { /* ok */ } IM = null; };
const IM_FORMAT = { TV: 'Serie TV', TV_SHORT: 'Serie breve', MOVIE: 'Film', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Speciale', MANGA: 'Manga', ONE_SHOT: 'One-shot', NOVEL: 'Novel' };
const IM_STATUS = [['done', 'Letto / visto'], ['doing', 'In corso'], ['planned', 'Da leggere / vedere'], ['dropped', 'Droppato']];

// ---------- copertine in coda (si salvano 3 alla volta mentre continui a usare l'app) ----------
const coverQ = []; let coverBusy = 0, coverDone = 0, coverTotal = 0;
function queueCovers(xs) {
  for (const x of xs) if (x.cover_url && !x.cover_path && !coverQ.includes(x)) { coverQ.push(x); coverTotal++; }
  pumpCovers();
}
function pumpCovers() {
  while (coverBusy < 3 && coverQ.length) {
    const x = coverQ.shift(); coverBusy++;
    uploadCover(x).catch(() => { /* già segnalato da uploadCover */ }).finally(() => {
      coverBusy--; coverDone++;
      const idle = !coverQ.length && !coverBusy;
      if (idle || coverDone % 5 === 0) { msg(idle ? 'Copertine salvate.' : `Salvo le copertine… ${coverDone}/${coverTotal}`); render(); }
      if (idle) coverDone = coverTotal = 0;
      pumpCovers();
    });
  }
}

// ---------- apertura e schermate ----------
function openImporter() {
  const saved = imLoad(), valid = saved?.entries?.length && ['overview', 'cards', 'done'].includes(saved.stage);
  // importazione a metà: prima si chiede se riprenderla; terminata: si rivede il riepilogo (con l'elenco dei non trovati)
  IM = valid ? { ...saved, next: saved.stage, stage: saved.stage === 'done' ? 'done' : 'resumeprompt' } : { stage: 'input', defStatus: 'done', entries: [], headers: [], dupes: [] };
  imRender();
  if (!$('impd').open) $('impd').showModal();
}
function imRender() {
  if (!IM) return;
  $('impd').innerHTML = { input: imInput, resumeprompt: imInput, search: imSearching, overview: imOverview, cards: imCard, done: imDone }[IM.stage]();
}
const imX = '<button class="btn ghost x" data-ia="close" aria-label="Chiudi">' + ic('x') + '</button>';
const imOpen = '<div class="dlg impd" tabindex="-1" autofocus>';
const imList = a => a.map(e => esc(e.raw)).join('\n');

function imInput() {
  const left = IM.entries.filter(e => !e.decision && e.verdict !== 'none').length;
  return `${imOpen}${imX}<h2>Importa dalle note</h2>
    <p>Incolla l'elenco così com'è: va bene con puntini, numeri, caselle, voti, volumi o appunti accanto al titolo. Cerco ogni titolo su AniList e ti faccio scegliere l'abbinamento giusto (tipo, copertina, stato, voto). Quelli senza riscontro te li restituisco in un elenco.</p>
    ${IM.stage === 'resumeprompt' ? `<div class="miss">C'è un'importazione a metà: ${left} titoli ancora da rivedere. <div class="foot-acts" style="margin-top:10px"><button class="btn" data-ia="new">Ricomincia da capo</button><button class="btn pri" data-ia="resume">Riprendi</button></div></div>` : ''}
    <label class="field"><span class="fl">Incolla qui il testo</span><textarea id="imtext" rows="8" placeholder="- Berserk&#10;• Vagabond - letto 9/10&#10;1. Monster (1-18)&#10;Frieren (anime) ❤️"></textarea></label>
    <label class="field"><span class="fl">Oppure carica un file .txt</span><input type="file" id="imfile" accept=".txt,text/plain"></label>
    <div class="field"><span class="fl">Se nelle note non è scritto nulla, considera i titoli</span>
      <div class="opts" role="group" aria-label="Stato predefinito">
        <button type="button" class="opt" data-ds="done" aria-pressed="${IM.defStatus === 'done'}">Già letti / visti</button>
        <button type="button" class="opt" data-ds="planned" aria-pressed="${IM.defStatus === 'planned'}">Da leggere / vedere</button></div></div>
    <div class="foot-acts"><button class="btn" data-ia="close">Chiudi</button><button class="btn pri" data-ia="analyze">${ic('search')}Analizza</button></div></div>`;
}
const imSearching = () => `${imOpen}<h2>Sto cercando su AniList…</h2>
  <p>Raggruppo le ricerche per fare in fretta. Puoi lasciare aperta la pagina.</p>
  <div class="pbar"><i id="imbar" style="width:${IM.total ? IM.progress / IM.total * 100 : 0}%"></i></div>
  <p class="psub" id="improg">${IM.progress} / ${IM.total} titoli</p>
  <div class="foot-acts"><span></span><button class="btn" data-ia="cancel">Annulla</button></div></div>`;

function imOverview() {
  const nf = IM.entries.filter(e => e.verdict === 'none'), found = IM.entries.filter(e => e.verdict !== 'none' && !e.decision), sure = found.filter(e => e.verdict === 'sure');
  const tile = (l, v) => `<div class="stat"><dt>${l}</dt><dd>${v}</dd></div>`;
  return `${imOpen}${imX}<h2>Ricerca completata</h2>
    <dl class="imgrid">${tile('Righe lette', IM.entries.length)}${tile('Con risultati', IM.entries.length - nf.length)}${tile('Abbinamento sicuro', sure.length)}${tile('Non trovati', nf.length)}</dl>
    <p>Ora scegli, titolo per titolo, quale abbinamento è quello giusto: tipo (manga, manhwa, novel, anime), copertina, stato e voto. Lo stato e il voto vengono già compilati con quello che avevi scritto nelle note.</p>
    <div class="foot-acts"><button class="btn" data-ia="bulk" ${sure.length ? '' : 'disabled'}>Accetta subito i ${sure.length} sicuri</button><button class="btn pri" data-ia="review" ${found.length ? '' : 'disabled'}>Inizia la revisione (${found.length})</button></div>
    ${nf.length ? `<section class="nfbox"><h3>Non trovati (${nf.length})</h3><p>Nessun riscontro su AniList per questi titoli, così come erano scritti nelle note:</p><pre class="nflist">${imList(nf)}</pre><button class="btn" data-ia="copy" data-w="nf">Copia l'elenco</button></section>` : ''}
    ${IM.headers.length ? `<p class="psub">Intestazioni riconosciute: ${IM.headers.map(h => '«' + esc(h) + '»').join(', ')}</p>` : ''}
    ${IM.dupes.length ? `<p class="psub">${IM.dupes.length} righe ripetute ignorate.</p>` : ''}</div>`;
}

function imNext() { return IM.entries.findIndex(e => e.verdict !== 'none' && !e.decision); }
function imCard() {
  const i = imNext(); if (i < 0) { IM.stage = 'done'; imSave(); return imDone(); }
  const e = IM.entries[i], total = IM.entries.filter(x => x.verdict !== 'none').length, doneN = IM.entries.filter(x => x.verdict !== 'none' && x.decision).length;
  const status = e.status || IM.defStatus, scores = [...new Set([...Array.from({ length: 10 }, (_, k) => k + 1), ...(e.score != null ? [e.score] : [])])].sort((a, b) => a - b);
  const chips = [e.statusFrom ? `<span class="kind">${esc(IM_STATUS.find(s => s[0] === status)[1])} (${e.statusFrom})</span>` : '', e.score != null ? `<span class="kind">Voto ${e.score}</span>` : '',
    e.owned ? `<span class="kind">Volumi ${esc(e.owned)}</span>` : '', e.fav ? '<span class="kind">♥ preferito</span>' : '', e.kind ? `<span class="kind">Tipo: ${KINDS[e.kind]}</span>` : ''].filter(Boolean).join(' ');
  const cands = e.cands.map((c, k) => {
    const inLib = hasItem(c.kind, c.id), unit = c.kind === 'anime' ? 'ep.' : 'vol.';
    return `<button class="cand" data-ia="pick" data-k="${k}" ${inLib ? 'disabled' : ''}><span class="thumb2">${cover({ title: c.title, cover_url: c.cover })}</span>
      <span class="ct"><b>${esc(c.title)}</b>${c.alt ? `<small>${esc(c.alt)}</small>` : ''}
      <span class="cm"><span class="kind">${KINDS[c.kind]}</span>${c.year ? ` ${c.year}` : ''}${IM_FORMAT[c.format] ? ` · ${IM_FORMAT[c.format]}` : ''}${c.total ? ` · ${c.total} ${unit}` : ''}${c.avg ? ` · ★ ${(c.avg / 10).toFixed(1)}` : ''}</span></span>
      ${inLib ? '<span class="inlib">Già in lista</span>' : ''}</button>`;
  }).join('');
  return `${imOpen}${imX}<div class="pbar"><i style="width:${doneN / total * 100}%"></i></div><p class="psub">Titolo ${doneN + 1} di ${total}</p>
    <div class="from"><small>Nelle note c'è scritto</small><b>«${esc(e.raw)}»</b>${chips ? `<div class="chipsrow">${chips}</div>` : ''}${e.note ? `<small>Nota che salvo come recensione: ${esc(e.note)}</small>` : ''}</div>
    <div class="cands" role="group" aria-label="Scegli l'abbinamento">${cands}</div>
    <div class="grid2">
      <label class="field"><span class="fl">Aggiungi come</span><select id="imkind"><option value="">Come trovato</option>${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field"><span class="fl">Stato</span><select id="imst">${IM_STATUS.map(([v, l]) => `<option value="${v}"${v === status ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="fl">Voto</span><select id="imsc"><option value="">—</option>${scores.map(v => `<option value="${v}"${v === e.score ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="field"><span class="fl">Preferito</span><button type="button" class="opt fav-toggle" id="imfav" aria-pressed="${!!e.fav}">${ic('heart')}Preferito</button></div></div>
    <label class="field"><span class="fl">Nessuno è quello giusto? Cerca un altro titolo</span><span class="stepper"><input id="imq" type="search" placeholder="es. il titolo in inglese o giapponese" value="${esc(e.title)}"><button type="button" class="btn" data-ia="research" aria-label="Cerca">${ic('search')}</button></span></label>
    <div class="foot-acts"><button class="btn ghost" data-ia="close">Metti in pausa</button><button class="btn" data-ia="skip">Salta questo</button></div></div>`;
}

function imDone() {
  const by = t => IM.entries.filter(e => e.decision?.t === t), nf = IM.entries.filter(e => e.verdict === 'none'), sk = by('skipped');
  const tile = (l, v) => `<div class="stat"><dt>${l}</dt><dd>${v}</dd></div>`;
  return `${imOpen}${imX}<h2>Importazione terminata</h2>
    <dl class="imgrid">${tile('Aggiunti', by('added').length)}${tile('Già in lista', by('dup').length)}${tile('Saltati', sk.length)}${tile('Non trovati', nf.length)}</dl>
    <p>Le copertine si salvano in sottofondo. Puoi rifinire stato, voti e volumi dalla scheda di ogni titolo.</p>
    ${nf.length ? `<section class="nfbox"><h3>Non trovati (${nf.length})</h3><p>Nessun riscontro su AniList, così come erano scritti nelle note:</p><pre class="nflist">${imList(nf)}</pre><button class="btn" data-ia="copy" data-w="nf">Copia l'elenco</button></section>` : ''}
    ${sk.length ? `<section class="nfbox"><h3>Saltati da te (${sk.length})</h3><pre class="nflist">${imList(sk)}</pre><button class="btn" data-ia="copy" data-w="sk">Copia l'elenco</button></section>` : ''}
    <div class="foot-acts"><button class="btn" data-ia="new">Nuova importazione</button><button class="btn pri" data-ia="finish">Fine</button></div></div>`;
}

// ---------- ricerca ----------
async function imBatch(qs) { // una lista di media per ogni ricerca; se la richiesta intera fallisce la divide a metà
  try { const { query, variables } = Notes.batchQuery(qs); const d = await gql(query, variables); return qs.map((_, i) => d['a' + i]?.media || []); }
  catch (err) {
    if (err instanceof TypeError) throw err; // niente rete: inutile insistere
    if (qs.length === 1) return [null];
    const h = qs.length >> 1; return [...await imBatch(qs.slice(0, h)), ...await imBatch(qs.slice(h))];
  }
}
async function imSearchAll() {
  const run = IM;
  try {
    for (let p = 0; p < 3 && !run.cancel; p++) { // passata 0: ricerca principale; 1 e 2: varianti del titolo per chi non ha risultati
      const todo = run.entries.filter(e => (p === 0 ? e.verdict == null : e.verdict === 'none' && !e.err && e.queries[p]));
      for (let i = 0; i < todo.length && !run.cancel; i += 15) {
        const chunk = todo.slice(i, i + 15), res = await imBatch(chunk.map(e => e.queries[p] || e.queries[0]));
        chunk.forEach((e, k) => {
          if (res[k] === null) { e.err = true; e.verdict = 'none'; return; }
          const c = Notes.rankFor(e, res[k]); if (c.length || p === 0) e.cands = c;
          e.verdict = Notes.judge(e.cands, e.kind);
        });
        if (p === 0) run.progress += chunk.length;
        if (IM === run && run.stage === 'search') { const b = $('imbar'); if (b) { b.style.width = run.progress / run.total * 100 + '%'; $('improg').textContent = `${run.progress} / ${run.total} titoli`; } }
        await sleep(250);
      }
    }
  } catch (err) { if (IM === run) { msg('Non riesco a raggiungere AniList: controlla la connessione e riprova.', 1); IM = { stage: 'input', defStatus: run.defStatus, entries: [], headers: [], dupes: [] }; imRender(); } return; }
  if (run.cancel || IM !== run) return;
  run.entries.forEach(e => { if (e.verdict == null) e.verdict = 'none'; });
  run.stage = 'overview'; imSave(); imRender();
}

// ---------- aggiunta di un titolo scelto ----------
async function imAdd(e, c, o) {
  const kind = o.kind || c.kind;
  if (hasItem(kind, c.id)) return 'dup';
  const total = c.total, status = o.status;
  const row = { kind, title: c.title, anilist_id: c.id, cover_url: c.cover, total, status,
    progress: status === 'done' && total ? total : (kind === 'anime' && e.ep ? e.ep : 0),
    owned: kind === 'anime' ? '' : (e.owned || ''), score: o.score ?? null, review: e.note || '' };
  if (migrated()) Object.assign(row, { favorite: !!o.fav, anilist_status: c.astatus, released: c.released });
  try {
    const x = await addItem(row); metaPut(c); queueCovers([x]); return 'added';
  } catch (err) { if (err?.code === '23505') return 'dup'; throw err; }
}
const imCardOpts = () => ({ kind: $('imkind')?.value || null, status: $('imst')?.value, score: $('imsc')?.value ? +$('imsc').value : null, fav: $('imfav')?.getAttribute('aria-pressed') === 'true' });
async function imDecide(i, c) {
  const e = IM.entries[i];
  try {
    const t = await imAdd(e, c, imCardOpts());
    e.decision = { t, title: c.title };
  } catch (err) { return msg('Aggiunta fallita: ' + (err.message || err), 1); }
  imSave(); render(); imRender();
}

// ---------- azioni ----------
async function imCopy(which) {
  const text = IM.entries.filter(e => which === 'nf' ? e.verdict === 'none' : e.decision?.t === 'skipped').map(e => e.raw).join('\n');
  try { await navigator.clipboard.writeText(text); msg('Elenco copiato negli appunti.'); }
  catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); msg('Elenco copiato negli appunti.'); } catch { msg('Copia non riuscita: selezionalo a mano.', 1); } t.remove(); }
}
$('impd').onclick = async ev => {
  if (ev.target === $('impd')) return $('impd').close();
  const ds = ev.target.closest('[data-ds]');
  if (ds) { IM.defStatus = ds.dataset.ds; ds.parentElement.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-pressed', o === ds)); return; }
  if (ev.target.closest('#imfav')) { const b = $('imfav'); b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); return; }
  const b = ev.target.closest('[data-ia]'); if (!b || b.disabled) return;
  switch (b.dataset.ia) {
    case 'close': $('impd').close(); break;
    case 'analyze': {
      const parsed = Notes.parseNotes($('imtext').value);
      if (!parsed.entries.length) return msg('Non ho trovato nessun titolo nel testo.', 1);
      if (!online()) return msg('Serve la connessione per cercare su AniList.', 1);
      const ds = IM.defStatus; imClear(); // una nuova analisi sostituisce l'importazione salvata
      IM = { stage: 'search', defStatus: ds, headers: parsed.headers, dupes: parsed.dupes, progress: 0, total: parsed.entries.length,
        entries: parsed.entries.map(e => ({ ...e, cands: [], verdict: null, decision: null })) };
      imRender(); await imSearchAll(); break;
    }
    case 'cancel': IM.cancel = true; IM = { stage: 'input', defStatus: IM.defStatus, entries: [], headers: [], dupes: [] }; imRender(); break;
    case 'resume': IM.stage = IM.next; imRender(); break;
    case 'new': imClear(); IM = { stage: 'input', defStatus: 'done', entries: [], headers: [], dupes: [] }; imRender(); break;
    case 'review': IM.stage = 'cards'; imSave(); imRender(); break;
    case 'bulk': {
      b.disabled = true;
      for (const e of IM.entries.filter(x => x.verdict === 'sure' && !x.decision)) {
        const c = e.cands[0];
        try { e.decision = { t: await imAdd(e, c, { status: e.status || IM.defStatus, score: e.score, fav: e.fav }), title: c.title }; } catch (err) { msg('Aggiunta fallita: ' + (err.message || err), 1); break; }
      }
      imSave(); render(); IM.stage = 'cards'; imRender(); break;
    }
    case 'pick': { const i = imNext(); if (i >= 0) { b.disabled = true; await imDecide(i, IM.entries[i].cands[+b.dataset.k]); } break; }
    case 'skip': { const i = imNext(); if (i >= 0) { IM.entries[i].decision = { t: 'skipped' }; imSave(); imRender(); } break; }
    case 'research': {
      const i = imNext(), q = $('imq').value.trim(); if (i < 0 || !q) return;
      if (!online()) return msg('Serve la connessione per cercare.', 1);
      b.disabled = true;
      try { const [res] = await imBatch([q]); const e = IM.entries[i]; const c = Notes.rankFor({ ...e, queries: [q] }, res || []); if (!c.length) msg('Nessun risultato per questa ricerca.', 1); else { e.cands = c; imSave(); } } catch { msg('Ricerca non riuscita.', 1); }
      imRender(); break;
    }
    case 'copy': imCopy(b.dataset.w); break;
    case 'finish': $('impd').close(); break;
  }
};
$('impd').addEventListener('change', async ev => {
  if (ev.target.id === 'imfile' && ev.target.files[0]) $('imtext').value = await ev.target.files[0].text();
});
$('impd').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'imq') { ev.preventDefault(); document.querySelector('[data-ia=research]')?.click(); } });
$('impd').addEventListener('close', () => { if (IM?.stage === 'search') { IM.cancel = true; IM = null; } render(); });
