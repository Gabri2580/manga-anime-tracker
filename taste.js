'use strict';
// Motore dei consigli automatici: pesi per titolo -> profilo dei gusti (tag e generi di AniList) -> punteggio dei candidati.
// Funzioni pure, senza rete né DOM: sono testate con node. Regole semplici e spiegabili, niente intelligenza artificiale.
const Taste = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const GENRE_W = 0.6;       // un genere pesa meno di un tag specifico
  const W_EDGE = 0.35, W_DIVERSITY = 0.2;

  const meanScore = items => { const s = items.filter(x => x.score != null).map(x => +x.score); return s.length >= 3 ? s.reduce((a, b) => a + b, 0) / s.length : 7.5; };

  // quanto un titolo che hai "dice" dei tuoi gusti: voto rispetto alla tua media, preferito, completato, droppato
  function weightOf(x, mean) {
    let w = 0;
    if (x.score != null) w += (x.score - mean) / 2;
    if (x.status === 'done') w += x.score != null ? 0.15 : 0.3;
    else if (x.status === 'doing') w += 0.2;
    else if (x.status === 'dropped' && x.score == null) w -= 1;
    if (x.favorite) w += 1.5;
    return clamp(w, -2, 3);
  }
  // meta: { g: [generi], t: [[tag, rank 0-100]] }  ->  vettore sparso
  function vecOf(meta) {
    const v = new Map();
    for (const [n, r] of meta.t || []) v.set('t:' + n, r / 100);
    for (const g of meta.g || []) v.set('g:' + g, GENRE_W);
    return v;
  }
  function buildProfile(items, metaOf) {
    const mean = meanScore(items), vec = new Map(), cnt = new Map(), weights = new Map();
    for (const x of items) {
      const meta = x.anilist_id && metaOf(x.anilist_id); if (!meta) continue;
      const w = weightOf(x, mean); if (!w) continue; // "da leggere" non dice nulla
      weights.set(x.anilist_id, { w, title: x.title });
      for (const [k, val] of vecOf(meta)) { vec.set(k, (vec.get(k) || 0) + w * val); cnt.set(k, (cnt.get(k) || 0) + 1); }
    }
    let n2 = 0;
    for (const [k, v] of vec) { const s = v / Math.sqrt(cnt.get(k) + 1); vec.set(k, s); n2 += s * s; } // un tag visto una volta pesa meno
    return { vec, norm: Math.sqrt(n2), mean, used: weights.size, weights };
  }
  const cosine = (p, cv) => { let dot = 0, n2 = 0; for (const [k, val] of cv) { n2 += val * val; const t = p.vec.get(k); if (t) dot += t * val; } return p.norm && n2 ? dot / (p.norm * Math.sqrt(n2)) : 0; };
  const cosVec = (a, b) => { let dot = 0, na = 0, nb = 0; for (const [k, v] of a) { na += v * v; const o = b.get(k); if (o) dot += v * o; } for (const v of b.values()) nb += v * v; return na && nb ? dot / Math.sqrt(na * nb) : 0; };
  const edgeStrength = r => Math.min(1, Math.log1p(Math.max(0, r)) / Math.log1p(1000)); // 1000 voti di raccomandazione = massimo

  // edges: { idCandidato: [{ from: idMioTitolo, r: ratingRaccomandazione }] }
  function scoreOne(c, v, p, edges) {
    const cos = cosine(p, v);
    let edge = 0;
    for (const e of edges[c.id] || []) { const w = p.weights.get(e.from); if (w) edge += w.w * edgeStrength(e.r); }
    edge = clamp(edge, -1.5, 2);
    const prior = 0.25 * ((c.avg ?? 70) - 70) / 30 + 0.1 * Math.log10(Math.max(c.pop || 1, 1)) / 5; // piccolo contributo del voto medio e della popolarità
    return { cos, edge, prior, total: cos + W_EDGE * edge + prior };
  }
  // ordina i candidati; esclude quelli che hai già o hai scartato; evita di proporre dieci titoli quasi identici
  function rank(cands, p, edges, exclude, limit = 40) {
    const pool = cands.filter(c => !exclude.has(c.id)).map(c => { const v = vecOf({ g: c.genres, t: c.tags }); return { c, v, ...scoreOne(c, v, p, edges) }; });
    const picked = [];
    while (picked.length < limit && pool.length) {
      let best = -Infinity, bi = 0;
      pool.forEach((s, i) => { let pen = 0; for (const q of picked) pen = Math.max(pen, cosVec(s.v, q.v)); const val = s.total - W_DIVERSITY * pen; if (val > best) { best = val; bi = i; } });
      picked.push(pool.splice(bi, 1)[0]);
    }
    const top = picked[0]?.total || 1;
    picked.forEach(s => { const rel = s.total / top; s.tier = rel >= 0.8 ? 'Ottima' : rel >= 0.55 ? 'Buona' : 'Possibile'; });
    return picked;
  }
  // "perché": i tag che pesano di più e il titolo tuo da cui nasce la raccomandazione
  function why(s, p, edges) {
    const tags = [...s.v].map(([k, val]) => [k, (p.vec.get(k) || 0) * val]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.slice(2));
    let from = null, bw = 0;
    for (const e of edges[s.c.id] || []) { const w = p.weights.get(e.from); if (w && w.w * edgeStrength(e.r) > bw) { bw = w.w * edgeStrength(e.r); from = w.title; } }
    return { tags, from };
  }
  // dalla libreria dell'altro: titoli che ha amato e tu non hai, pesati da quanto i vostri voti coincidono sui titoli in comune
  function fromOther(mine, theirs, keyOf, limit = 8) {
    const mk = new Map(mine.map(x => [keyOf(x), x]));
    const both = theirs.filter(x => x.score != null && mk.get(keyOf(x))?.score != null);
    const sim = both.length >= 3 ? clamp(1 - both.reduce((a, x) => a + Math.abs(x.score - mk.get(keyOf(x)).score), 0) / both.length / 5, 0.2, 1) : 0.6;
    const picks = theirs.filter(x => !mk.has(keyOf(x)) && ((x.score != null && x.score >= 8) || x.favorite))
      .map(x => ({ x, v: ((x.score ?? 8) + (x.favorite ? 1 : 0)) * (0.5 + 0.5 * sim) })).sort((a, b) => b.v - a.v).slice(0, limit);
    return { sim, common: both.length, picks: picks.map(p => p.x) };
  }
  return { meanScore, weightOf, vecOf, buildProfile, rank, why, fromOther, scoreOne };
})();
