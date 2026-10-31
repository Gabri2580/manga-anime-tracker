'use strict';
// Lettura delle note incollate (elenchi puntati, intestazioni, voti, volumi) e abbinamento ai risultati di AniList.
// Solo funzioni pure, senza DOM: sono testate con node.
const Notes = (() => {
  const EMOJI_DONE = /[✅✔✓☑]/;
  const EMOJI_FAV = /[❤♥⭐\u{1F496}\u{1F495}\u{1F497}\u{1F60D}]/u;
  const EMOJI_DROP = /[❌✖✘]/;
  const EMOJI_ALL = /[✅✔✓☑❤♥⭐\u{1F496}\u{1F495}\u{1F497}\u{1F60D}❌✖✘️​]/gu;
  // punti elenco, numerazioni ("1." "2)"), caselle ("[ ]" "[x]" "☐")
  const LEAD = /^\s*(?:[-–—−*•·●○◦▪■▫□▶►→>+]+|\d{1,3}[.)](?=\s)|\[[ xX✓]?\]|[☐☒])\s*/u;

  const STATUS_RE = [
    ['dropped', /\b(?:droppat[oiae]|abbandonat[oiae]|lasciat[oiae]|dropped)\b/i],
    ['planned', /\b(?:da\s+(?:leggere|vedere|guardare|recuperare|iniziare)|to\s+(?:read|watch)|wishlist|lista\s+desideri|futur[oi])\b/i],
    ['doing', /\b(?:in\s+corso|in\s+lettura|in\s+visione|sto\s+(?:leggendo|guardando)|a\s+met[aà]|in\s+pausa)\b/i],
    ['done', /\b(?:lett[oiae]|finit[oiae]|completat[oiae]|vist[oiae]|conclus[oiae]|gi[aà]\s+(?:letto|visto)|read|watched|done)\b/i]
  ];
  const statusIn = t => { for (const [k, re] of STATUS_RE) if (re.test(t)) return k; return null; };
  const KIND_WORD = /\b(?:light\s*novel|novel|romanzi?|manhwa|webtoon|manhua|manga|anime|serie(?:\s*tv)?|film|ova)\b/i;
  const KIND_HINT = /\(\s*(light\s*novel|ln|novel|manga|manhwa|webtoon|manhua|anime|serie(?:\s*tv)?|film|ova)\s*\)/i;
  const KIND_TAIL = /(?:^|[\s,;])(light\s*novel|novel|manga|manhwa|webtoon|anime)\s*$/i;
  function kindFromWord(w) {
    w = String(w).toLowerCase();
    if (/novel|^ln$|romanz/.test(w)) return 'novel';
    if (/manhwa|webtoon|manhua/.test(w)) return 'manhwa';
    if (/anime|serie|film|ova/.test(w)) return 'anime';
    if (/manga/.test(w)) return 'manga';
    return null;
  }
  const round1 = v => Math.round(v * 10) / 10;

  // ---------- intestazioni di sezione ("Manga", "Letti", "Anime da vedere", "=== PREFERITI ===") ----------
  function parseHeader(line) {
    let t = line.replace(EMOJI_ALL, ' ').replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ' ');
    let p; do { p = t; t = t.replace(LEAD, ''); } while (t !== p);
    t = t.replace(/\(\s*\d+\s*\)/g, ' ').replace(/[:：#=_*~\-–—]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t || t.split(' ').length > 5) return null;
    let rest = ' ' + t + ' ', kind = null, status = null, fav = false;
    const km = rest.match(KIND_WORD); if (km) { kind = kindFromWord(km[0]); rest = rest.replace(KIND_WORD, ' '); }
    const st = statusIn(rest); if (st) { status = st; rest = rest.replace(STATUS_RE.find(([k]) => k === st)[1], ' '); }
    const fm = rest.match(/\b(?:preferit[oiae]|favorit[oiae]|migliori|top)\b/); if (fm) { fav = true; rest = rest.replace(fm[0], ' '); }
    rest = rest.replace(/\b(?:i|le|gli|lo|la|il|di|dei|delle|degli|miei|mie|mio|lista|elenco|e|&|vari|altri|altre)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest || (!kind && !status && !fav)) return null;
    return { kind, status, fav };
  }

  // ---------- estrazioni dalla singola riga ----------
  function takeScore(s) {
    let m = s.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*\/\s*(10|5|100)\b/);
    if (!m) m = s.match(/\b(?:voto|punteggio|score|rating)\s*[:=]?\s*(\d{1,2}(?:[.,]\d{1,2})?)\b(?:\s*\/\s*(10))?/i);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.')) * 10 / (+m[2] || 10);
      if (v > 0 && v <= 10) return { value: round1(v), s: s.replace(m[0], ' ') };
    }
    return { value: null, s };
  }
  const RANGE = '\\d+(?:\\s*[-–]\\s*\\d+)?', SEP = '(?:\\s*[,;&]\\s*|\\s+e\\s+)';
  const LIST = `${RANGE}(?:${SEP}${RANGE})*`;
  function takeOwned(s) {
    let m = s.match(new RegExp(`\\b(?:vol(?:umi|ume)?\\.?|v\\.)\\s*[:=]?\\s*(${LIST})`, 'i'));
    if (!m) m = s.match(new RegExp(`[\\(\\[]\\s*(${RANGE}(?:${SEP}${RANGE})+|\\d+\\s*[-–]\\s*\\d+)\\s*[\\)\\]]`));
    if (!m) return { owned: null, s };
    const nums = m[1].match(/\d+/g).map(Number);
    if (nums.some(n => n > 999)) return { owned: null, s }; // anni ("2012-2014"), non volumi
    const spec = m[1].replace(/–/g, '-').replace(/\s+e\s+|\s*[;&]\s*/g, ', ').replace(/\s*,\s*/g, ', ').replace(/\s*-\s*/g, '-').trim();
    return { owned: spec, s: s.replace(m[0], ' ') };
  }

  // ---------- riga -> voce ----------
  function parseLine(raw, ctx = {}) {
    const marks = { done: EMOJI_DONE.test(raw), fav: EMOJI_FAV.test(raw), drop: EMOJI_DROP.test(raw) };
    let s = raw.replace(EMOJI_ALL, ' ').replace(/\t+/g, ' ');
    let p; do { p = s; s = s.replace(LEAD, ''); } while (s !== p);
    s = s.trim().replace(/^["'“”«»‘’`]+|["'“”«»‘’`]+$/g, '').trim();

    let kind = null, m = s.match(KIND_HINT);
    if (m) { kind = kindFromWord(m[1]); s = s.replace(m[0], ' '); }
    const sc = takeScore(s); s = sc.s;
    const ow = takeOwned(s); s = ow.s;
    m = s.match(/\bep(?:isodi[o]?)?\.?\s*(\d{1,4})\b/i);
    const ep = m ? +m[1] : null; if (m) s = s.replace(m[0], ' ');
    s = s.replace(/\s+/g, ' ').replace(/[\s:;,\-–—|]+$/, '').replace(/^[\s:;,\-–—|]+/, '');

    let title = s, note = '';
    const sepM = s.match(/\s[-–—|]\s+|\s\/\/\s+/);
    if (sepM) { title = s.slice(0, sepM.index); note = s.slice(sepM.index + sepM[0].length); }
    title = title.replace(/\s*[\(\[]([^\)\]]*)[\)\]]/g, (_, g) => { note += ' ' + g; return ''; });
    let score = sc.value, status = null;
    m = title.match(/^(.+?)\s*[:=]\s*(\d{1,2}(?:[.,]\d)?)$/);
    if (m && score == null && +m[2].replace(',', '.') > 0 && +m[2].replace(',', '.') <= 10) { title = m[1]; score = parseFloat(m[2].replace(',', '.')); }
    m = title.match(/^(.+?)\s*[:=]\s*((?:già\s+)?(?:letto|letti|finito|finiti|completato|visto|visti|droppato|abbandonato|da\s+leggere|da\s+vedere|in\s+corso))$/i);
    if (m) { title = m[1]; status = statusIn(m[2]); }
    m = title.match(/\s+(letto|letti|finito|finiti|completato|visto|visti|droppato|abbandonato)\s*$/i);
    if (m) { title = title.slice(0, m.index); status = status || statusIn(m[1]); }
    if (!kind) { m = title.match(KIND_TAIL); if (m && title.replace(KIND_TAIL, '').trim()) { kind = kindFromWord(m[1]); title = title.replace(KIND_TAIL, ''); } }

    note = note.replace(/\s+/g, ' ').replace(/^[\s\-–—|:,;]+|[\s\-–—|:,;]+$/g, '').trim();
    if (/^\d{4}(?:\s*[-–]\s*\d{4})?$/.test(note)) note = ''; // solo anni: non è una nota
    if (/^(?:già\s+|gia\s+)?(?:letto|letti|finit[oi]|complet\w+|vist[oi]|conclus\w+|droppat\w+|abbandonat\w+|in\s+corso|in\s+lettura|in\s+visione|da\s+(?:leggere|vedere|guardare|recuperare))[\s.!]*$/i.test(note)) { status = status || statusIn(note); note = ''; } // la sola parola di stato non è una nota
    if (score == null && note) {
      const nm = note.match(/^(\d{1,2}(?:[.,]\d)?)(?:\s*\/\s*10)?$/);
      const v = nm && parseFloat(nm[1].replace(',', '.'));
      if (v > 0 && v <= 10) { score = v; note = ''; }
    }
    status = status || statusIn(note) || (marks.drop ? 'dropped' : marks.done ? 'done' : null);
    title = title.replace(/\s+/g, ' ').replace(/^[\s:;,.\-–—|]+|[\s:;,\-–—|]+$/g, '').trim();

    const full = (title + (note ? ' ' + note : '')).replace(/\s+/g, ' ').trim();
    const queries = [...new Set([title, title.includes(':') ? title.split(/\s*:\s*/)[0] : '',
      title.replace(/\s*[-:–]?\s*(?:stagione|season|parte|part)\s*\d+\s*$/i, ''), full.length <= 80 ? full : ''])].filter(q => q && q.length >= 2);
    return {
      raw: raw.trim(), title, queries, note, score, owned: ow.owned, ep,
      status: status || ctx.status || null, kind: kind || ctx.kind || null, fav: !!(marks.fav || ctx.fav),
      statusFrom: status ? 'riga' : ctx.status ? 'intestazione' : null
    };
  }

  // ---------- testo intero -> voci ----------
  function parseNotes(text) {
    const entries = [], headers = [], seen = new Set(), dupes = [];
    let ctx = {};
    for (const line of String(text).split(/\r?\n/)) {
      if (!/[\p{L}\p{N}]/u.test(line)) continue;
      if (/^\W*(?:totale|totali|tot|in\s+totale)\b[\s:=.]*\d*\W*$/i.test(line)) continue; // "Totale: 40"
      const h = parseHeader(line);
      if (h) { ctx = { kind: h.kind || ctx.kind, status: h.status || ctx.status, fav: h.fav || false }; headers.push(line.trim()); continue; }
      if (/^\s*#/.test(line)) continue;
      const e = parseLine(line, ctx);
      if (!e.title || !/[\p{L}\p{N}]/u.test(e.title)) continue;
      const key = (e.kind || '') + '|' + normT(e.title);
      if (seen.has(key)) { dupes.push(e.raw); continue; }
      seen.add(key); e.id = entries.length; entries.push(e);
    }
    return { entries, headers, dupes };
  }

  // ---------- abbinamento ai risultati AniList ----------
  const normT = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function simStr(a, b) { // a, b già normalizzate
    if (!a || !b) return 0; if (a === b) return 1;
    const [s, l] = a.length <= b.length ? [a, b] : [b, a];
    if (s.length >= 4 && l.includes(s)) return 0.8 + 0.15 * (s.length / l.length);
    return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length));
  }
  const mediaTitles = m => [m.title?.english, m.title?.romaji, m.title?.native, ...(m.synonyms || [])].filter(Boolean).map(normT).filter(Boolean);
  const simMedia = (q, m) => Math.max(0, ...mediaTitles(m).map(t => simStr(normT(q), t)));

  const kindOf = m => m.type === 'ANIME' ? 'anime' : m.format === 'NOVEL' ? 'novel' : m.countryOfOrigin === 'KR' ? 'manhwa' : 'manga';
  const releasedFor = (m, k) => k !== 'anime' ? null : m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : m.status === 'FINISHED' ? (m.episodes ?? null) : null;
  const goodFormat = m => m.type === 'ANIME' ? m.format !== 'MUSIC' : true;
  function toCand(m) {
    const kind = kindOf(m), romaji = m.title?.romaji, eng = m.title?.english;
    return {
      id: m.id, kind, title: eng || romaji, alt: eng && romaji && eng !== romaji ? romaji : '', year: m.seasonYear || m.startDate?.year || null, format: m.format,
      cover: m.coverImage?.large || null, total: (kind === 'anime' ? m.episodes : m.volumes) || null, astatus: m.status || null, released: releasedFor(m, kind),
      avg: m.averageScore ?? null, pop: m.popularity ?? null, genres: (m.genres || []).slice(0, 8),
      tags: (m.tags || []).filter(t => !t.isMediaSpoiler).sort((a, b) => b.rank - a.rank).slice(0, 10).map(t => [t.name, t.rank])
    };
  }
  // candidati per una voce, ordinati per somiglianza con le sue ricerche; i suggerimenti di tipo (es. "(anime)") hanno la precedenza
  function rankFor(entry, medias) {
    const seen = new Set(), out = [];
    medias.forEach((m, idx) => {
      if (!m || seen.has(m.id) || !goodFormat(m)) return; seen.add(m.id);
      const c = toCand(m);
      c.sim = Math.max(0, ...entry.queries.map(q => simMedia(q, m)));
      c.score = c.sim + (entry.kind && c.kind === entry.kind ? 0.15 : 0) + Math.log10((c.pop || 1)) * 0.01 - idx * 0.005;
      out.push(c);
    });
    return out.filter(c => c.sim >= 0.5).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  // 'sure' = un solo abbinamento chiaro; 'ask' = serve la scelta (omonimi, anime+manga, titolo incerto); 'none' = nessun riscontro
  function judge(cands, hintKind) {
    if (!cands.length) return 'none';
    const exact = cands.filter(c => c.sim >= 0.95); // titoli praticamente identici a quello cercato
    if (exact.length === 1) return 'sure';
    if (hintKind && exact.filter(c => c.kind === hintKind).length === 1) return 'sure'; // omonimi di tipo diverso: decide il suggerimento (es. "(anime)" o l'intestazione "MANGA")
    return 'ask';
  }
  const MEDIA_FIELDS = 'id type format countryOfOrigin title{romaji english native} synonyms coverImage{large} volumes episodes status seasonYear startDate{year} averageScore popularity genres tags{name rank isMediaSpoiler} nextAiringEpisode{episode}';
  function batchQuery(qs) { // più ricerche in una sola richiesta (alias)
    const vars = {};
    const defs = qs.map((q, i) => { vars['s' + i] = q; return `$s${i}:String`; }).join(',');
    const body = qs.map((_, i) => `a${i}: Page(perPage:6){media(search:$s${i}, sort:SEARCH_MATCH){...M}}`).join(' ');
    return { query: `query(${defs}){ ${body} } fragment M on Media { ${MEDIA_FIELDS} }`, variables: vars };
  }
  return { parseNotes, parseLine, parseHeader, normT, simMedia, kindOf, toCand, rankFor, judge, batchQuery, releasedFor, MEDIA_FIELDS };
})();
