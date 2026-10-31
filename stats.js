'use strict';
// Statistiche: grafici in HTML/CSS, senza librerie. Usa i globali di app.js (items, KINDS, ST, ...) solo quando viene chiamata.
// Regole (skill dataviz): una serie = un colore; barre sottili (<=24px) con punta tonda e base dritta; valori solo sul massimo;
// stato = barra segmentata con legenda dei nomi; ogni grafico ha tooltip, focus da tastiera e tabella dati.

const tipAttr = t => `tabindex="0" data-tip="${esc(t)}" aria-label="${esc(t)}"`;

function panel(title, sub, body, rows, cls = '') {
  const tbl = rows ? `<details class="tbl"><summary>Tabella dati</summary><table><tbody>${rows.map(([a, b]) =>
    `<tr><th scope="row">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table></details>` : '';
  return `<section class="pan ${cls}"><h3>${title}</h3>${sub ? `<p class="psub">${sub}</p>` : ''}${body}${tbl}</section>`;
}

// barre orizzontali ordinate: confronto tra categorie nominali, valore in punta
function barsH(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="bh">${rows.map((r, i) => `<div class="bh-row" style="--i:${i}"><span class="bh-l">${esc(r.label)}</span>
    <span class="bh-t"><i style="--k:${r.value / max}" ${tipAttr(r.tip)}></i><b>${r.value}</b></span></div>`).join('')}</div>`;
}

// un intero diviso in parti: barra segmentata alta, quota dentro solo dove ci sta, legenda dei soli nomi
function segBar(parts) {
  const tot = parts.reduce((s, p) => s + p.value, 0);
  const on = parts.filter(p => p.value);
  if (!tot) return '<p class="pempty">Nessun dato.</p>';
  return `<div class="sgb" role="img" aria-label="${esc(on.map(p => `${p.label} ${p.value}`).join(', '))}">${on.map(p => {
    const pc = Math.round(p.value / tot * 100);
    return `<span class="sgp ${p.cls}" style="flex:${p.value}" ${tipAttr(`${p.label}: ${p.value} (${pc}%)`)}>${pc >= 14 ? pc + '%' : ''}</span>`;
  }).join('')}</div><ul class="leg">${on.map(p => `<li><i class="sw ${p.cls}"></i>${esc(p.label)}</li>`).join('')}</ul>`;
}

// colonne: scala ordinata o tempo; solo il massimo porta il numero
function columns(rows, aria) {
  const max = Math.max(1, ...rows.map(r => r.value)), top = rows.findIndex(r => r.value === max && r.value > 0);
  return `<div class="cols" role="img" aria-label="${esc(aria)}">${rows.map((r, i) => `<div class="colm" style="--i:${i}">
    <span class="cb"><i style="--h:${r.value / max}" ${tipAttr(r.tip)}>${i === top ? `<b>${r.value}</b>` : ''}</i></span><span class="cl">${esc(r.label)}</span></div>`).join('')}</div>`;
}

function renderStats(uid) {
  const its = items.filter(x => x.user_id === uid);
  if (!its.length) return empty('inbox', 'Ancora nessun dato', 'Quando ci saranno dei titoli, qui compariranno i grafici.');

  // per tipo
  const byKind = Object.entries(KINDS).map(([k, l]) => ({ label: l, value: its.filter(x => x.kind === k).length }))
    .sort((a, b) => b.value - a.value).map(r => ({ ...r, tip: `${r.label}: ${r.value} titoli` }));

  // per stato (etichette valide sia per letture che per visioni)
  const SL = ['Da fare', 'In corso', 'Completati', 'Droppati'];
  const byStatus = ST.map((s, i) => ({ label: SL[i], value: its.filter(x => x.status === s).length, cls: 'st' + i }));

  // voti 1–10
  const scored = its.filter(x => x.score != null), avg = scored.length ? scored.reduce((s, x) => s + +x.score, 0) / scored.length : null;
  const hist = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: 0 }));
  scored.forEach(x => hist[Math.min(10, Math.max(1, Math.round(x.score))) - 1].value++);
  hist.forEach(r => r.tip = `Voto ${r.label}: ${r.value} titoli`);

  // aggiunti negli ultimi 12 mesi
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, value: 0,
      label: d.toLocaleDateString('it-IT', { month: 'short' }).replace('.', ''), long: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) });
  }
  its.forEach(x => { const m = months.find(m => m.key === (x.created_at || '').slice(0, 7)); if (m) m.value++; });
  months.forEach(m => m.tip = `${m.long}: ${m.value} aggiunti`);

  // collezione: serie con totale noto e almeno un volume posseduto
  const col = its.filter(x => x.kind !== 'anime' && x.total && x.owned && x.status !== 'dropped').map(x => ({ x, miss: missingVols(x) }));
  const totVols = col.reduce((s, r) => s + r.x.total, 0), haveVols = col.reduce((s, r) => s + r.x.total - r.miss.length, 0);
  const incomplete = col.filter(r => r.miss.length).sort((a, b) => b.miss.length - a.miss.length || a.x.title.localeCompare(b.x.title));
  const collBody = !col.length ? '<p class="pempty">Indica i volumi posseduti e il totale di una serie per vedere qui cosa ti manca.</p>'
    : `<div class="meter" role="img" aria-label="${haveVols} volumi su ${totVols}"><i style="--k:${haveVols / totVols}"></i></div>
       <div class="mline"><span><b>${haveVols}</b> / ${totVols} volumi posseduti</span><span>${col.length - incomplete.length} serie complete su ${col.length}</span></div>
       ${incomplete.length ? `<ul class="rows">${incomplete.slice(0, 8).map(r => `<li><button class="rowb" data-open="${r.x.id}">
          <span class="thumb">${cover(r.x)}</span><span class="t"><b>${esc(r.x.title)}</b><small>Mancano: ${esc(ranges(r.miss))}</small></span>
          <span class="rt">${r.miss.length} vol.</span></button></li>`).join('')}</ul>
          ${incomplete.length > 8 ? `<p class="psub" style="margin:0">…e altre ${incomplete.length - 8} serie.</p>` : ''}` : '<p class="pempty">Nessun volume mancante: collezione completa.</p>'}`;

  // migliori voti
  const best = [...scored].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 5);

  return `<div class="stg">
    ${panel('Titoli per tipo', `${its.length} titoli in totale`, barsH(byKind), byKind.map(r => [r.label, r.value]))}
    ${panel('Stato delle opere', 'Come si dividono tutti i titoli', segBar(byStatus), byStatus.map(r => [r.label, r.value]))}
    ${panel('Distribuzione dei voti', avg == null ? 'Nessun titolo votato' : `Media ${avg.toFixed(1)} su ${scored.length} titoli votati`,
      scored.length ? columns(hist, `Voti da 1 a 10, media ${avg.toFixed(1)}`) : '<p class="pempty">Dai un voto a qualche titolo per vedere la distribuzione.</p>', scored.length ? hist.map(r => [`Voto ${r.label}`, r.value]) : null)}
    ${panel('Aggiunti negli ultimi 12 mesi', 'Quanti titoli hai inserito mese per mese', columns(months, 'Titoli aggiunti per mese'), months.map(m => [m.long, m.value]), 'wide')}
    ${panel('Collezione e volumi mancanti', 'Promemoria per le serie che stai collezionando', collBody, null, 'wide')}
    ${best.length ? panel('Più apprezzati', 'I cinque voti più alti', `<ul class="rows">${best.map(x => `<li><button class="rowb" data-open="${x.id}">
        <span class="thumb">${cover(x)}</span><span class="t"><b>${esc(x.title)}</b><small>${KINDS[x.kind]}</small></span>
        <span class="rt">${ic('star')}${x.score}</span></button></li>`).join('')}</ul>`, null, 'wide') : ''}
  </div>`;
}

// tooltip condiviso: al passaggio, al tocco e al focus da tastiera
const tipEl = document.getElementById('tip');
function showTip(el) {
  tipEl.textContent = el.dataset.tip; tipEl.classList.add('on');
  const r = el.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.max(8, Math.min(innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2)) + 'px';
  tipEl.style.top = Math.max(8, r.top - t.height - 8) + 'px';
}
const hideTip = () => tipEl.classList.remove('on');
document.addEventListener('pointerover', e => { const t = e.target.closest?.('[data-tip]'); t ? showTip(t) : hideTip(); });
document.addEventListener('focusin', e => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
document.addEventListener('focusout', hideTip);
addEventListener('scroll', hideTip, { passive: true });
