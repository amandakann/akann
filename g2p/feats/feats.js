// Shared renderer for the gloss2feats evaluation site (logs/www/feats/).
// Pages define `const DATA = {page: 'treebank' | 'all', ...}` before loading this
// file; pages without DATA (index.html) only get sortable tables.
(function () {
'use strict';

// ---------------------------------------------------------------- utilities

const STAGES = ['unknown_label', 'gloss_unmappable', 'unknown_um', 'um_no_ud', 'conflict'];
const HAS_DATA = typeof DATA !== 'undefined';
const STAGE_DESC = (HAS_DATA && DATA.problems) || {};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pct(v) { return v == null ? '–' : (v * 100).toFixed(1) + '%'; }
function sum(obj) { return Object.values(obj || {}).reduce((a, b) => a + b, 0); }
function cnt(key, n, label) {
  return n ? '<span data-k="' + esc(key) + '" data-l="' + esc(label || key) + '">' + n + '</span>' : '0';
}
function chip(cls, text, title) {
  return '<span class="chip ' + esc(cls) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(text) + '</span>';
}
function tile(v, k, extra) {
  return '<div class="tile' + (extra || '') + '"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div></div>';
}
function bar(v) {
  if (v == null) return '–';
  return '<span class="bar"><span style="width:' + Math.round(v * 100) + '%"></span></span>' + pct(v);
}
function heat(v) {  // red -> green background for a 0..1 score
  return v == null ? '' : 'background:hsl(' + Math.round(v * 120) + ',65%,86%)';
}
function table(headers, rows, cls) {
  return '<div class="wrap"><table class="' + (cls || 'sortable') + '"><thead><tr>' +
    headers.map(h => Array.isArray(h) ? '<th class="' + h[1] + '" title="' + esc(h[2] || '') + '">' + esc(h[0]) + '</th>'
                                       : '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
}
function rawForms(raw, label) {
  return Object.entries(raw || {}).filter(([k]) => k !== label).slice(0, 8)
    .map(([k, n]) => esc(k) + (n > 1 ? '×' + n : '')).join(', ');
}

function makeSortable(root) {
  root.querySelectorAll('table.sortable').forEach(tbl => {
    if (tbl.dataset.sortInit) return;
    tbl.dataset.sortInit = '1';
    const tbody = tbl.tBodies[0];
    const headers = Array.from(tbl.tHead.rows[0].cells);
    let col = -1, dir = 1;
    headers.forEach((th, i) => th.addEventListener('click', () => {
      dir = col === i ? -dir : (th.classList.contains('num') ? -1 : 1);
      col = i;
      const val = r => r.cells[i].dataset.v !== undefined ? r.cells[i].dataset.v : r.cells[i].textContent.trim();
      Array.from(tbody.rows).sort((a, b) => {
        const at = val(a), bt = val(b), an = parseFloat(at), bn = parseFloat(bt);
        const aNa = isNaN(an), bNa = isNaN(bn);
        if (!aNa && !bNa) return (an - bn) * dir;
        if (aNa !== bNa) return aNa ? 1 : -1;   // blanks/n.a. last
        return at.localeCompare(bt) * dir;
      }).forEach(r => tbody.appendChild(r));
      headers.forEach(h => h.removeAttribute('data-sort'));
      th.setAttribute('data-sort', dir > 0 ? 'asc' : 'desc');
    }));
  });
}

// Text filter + chip toggles over rows carrying data-f (search text) / data-c (category).
function filterBar(id, cats, placeholder) {
  return '<div class="filters" data-for="' + id + '">' +
    '<input type="search" placeholder="' + esc(placeholder || 'filter…') + '">' +
    cats.map(c => chip(c[0] + ' fchip', c[1] || c[0], c[2])).join('') + '</div>';
}
function wireFilter(root) {
  root.querySelectorAll('.filters[data-for]').forEach(bar => {
    const target = document.getElementById(bar.dataset.for);
    const input = bar.querySelector('input');
    const off = new Set();
    const apply = () => {
      const q = input.value.trim().toLowerCase();
      target.querySelectorAll('tbody tr').forEach(r => {
        const hit = (!q || (r.dataset.f || r.textContent).toLowerCase().includes(q)) && !off.has(r.dataset.c);
        r.classList.toggle('hidden', !hit);
      });
    };
    input.addEventListener('input', apply);
    bar.querySelectorAll('.fchip').forEach(c => c.addEventListener('click', () => {
      const cat = Array.from(c.classList).find(x => x !== 'chip' && x !== 'fchip' && x !== 'off');
      c.classList.toggle('off');
      if (off.has(cat)) off.delete(cat); else off.add(cat);
      apply();
    }));
  });
}

// ---------------------------------------------------------------- tabs + hash routing

let TABS = [];
const rendered = new Set();
function hashParams() { return new URLSearchParams(location.hash.slice(1)); }
function setHash(params) {
  const s = params.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname);
}
function showTab(id) {
  const tab = TABS.find(t => t.id === id) || TABS[0];
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab.id));
  document.querySelectorAll('.tab').forEach(s => { s.hidden = s.id !== 'tab-' + tab.id; });
  const sec = document.getElementById('tab-' + tab.id);
  if (!rendered.has(tab.id)) {
    sec.innerHTML = tab.render();
    makeSortable(sec);
    wireFilter(sec);
    if (tab.after) tab.after(sec);
    rendered.add(tab.id);
  }
  const p = hashParams();
  p.set('tab', tab.id);
  setHash(p);
}
function buildTabs(tabs) {
  TABS = tabs.filter(t => !t.hidden);
  document.getElementById('tabs').innerHTML = TABS.map(t =>
    '<button data-tab="' + t.id + '">' + esc(t.label) + '</button>').join('');
  document.getElementById('main').innerHTML = TABS.map(t =>
    '<section class="tab" id="tab-' + t.id + '" hidden></section>').join('');
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
}

// ---------------------------------------------------------------- examples panel

let selEl = null;
function openPanel(key, label, el) {
  const panel = document.getElementById('panel');
  if (!panel || !DATA.ex) return;
  if (selEl) selEl.classList.remove('sel');
  if (el) { el.classList.add('sel'); selEl = el; }
  const entries = DATA.ex[key] || [];
  document.getElementById('panel-title').textContent =
    label + ' — ' + entries.length + ' sentence' + (entries.length === 1 ? '' : 's') + ' shown';
  document.getElementById('panel-body').innerHTML = entries.length
    ? entries.map(([sid, tids]) => renderSent(sid, new Set(tids))).join('')
    : '<p class="desc">No stored examples for this item.</p>';
  panel.hidden = false;
  document.body.classList.add('panel-open');
  const p = hashParams();
  p.set('ex', key);
  setHash(p);
}
function closePanel() {
  document.getElementById('panel').hidden = true;
  document.body.classList.remove('panel-open');
  if (selEl) selEl.classList.remove('sel');
  const p = hashParams();
  p.delete('ex');
  setHash(p);
}
function featPairs(s) {
  const out = new Set();
  if (!s || s === '_') return out;
  for (const kv of s.split('|')) {
    const i = kv.indexOf('=');
    for (const v of kv.slice(i + 1).split(',')) out.add(kv.slice(0, i) + '=' + v);
  }
  return out;
}
function renderFeats(s, other, cls) {
  if (!s || s === '_') return '_';
  return s.split('|').map(kv => {
    const i = kv.indexOf('='), k = kv.slice(0, i);
    return kv.slice(i + 1).split(',').map(v => {
      const p = k + '=' + v;
      return other.has(p) ? esc(p) : '<span class="' + cls + '">' + esc(p) + '</span>';
    }).join(',');
  }).join('|');
}
function labelChips(labels) {
  const notes = DATA.notes || {};
  return labels.map(([raw, label, problem]) => {
    const st = problem || 'mapped';
    const note = notes[st + '|' + label];
    return chip(st, raw === label ? label : raw + ' → ' + label, st + (note ? ': ' + note : ''));
  }).join('');
}
function renderSent(sid, ids) {
  const sent = DATA.sents[sid];
  if (!sent) return '';
  const gold = DATA.report.meta_summary.has_gold_feats;
  let h = '<div class="ex"><div class="ex-id">' + esc(sid) + '</div>';
  if (sent.comments.length) h += '<div class="ex-cm">' + sent.comments.map(esc).join('<br>') + '</div>';
  h += '<div class="wrap"><table class="sent-tbl"><thead><tr><th>ID</th><th>FORM</th><th>UPOS</th><th>GlossUPOS</th><th>Gloss</th><th>Labels</th>' +
       (gold ? '<th>gold FEATS</th>' : '') + '<th class="pred">pred FEATS</th></tr></thead><tbody>';
  for (const [id, form, upos, gupos, gloss, labels, g, p] of sent.rows) {
    const gp = featPairs(g), pp = featPairs(p);
    h += '<tr' + (ids.has(id) ? ' class="hl"' : '') + '><td>' + esc(id) + '</td><td>' + esc(form) + '</td><td>' + esc(upos) +
         '</td><td>' + esc(gupos) + '</td><td>' + esc(gloss) + '</td><td>' + labelChips(labels) + '</td>' +
         (gold ? '<td>' + renderFeats(g, pp, 'fn') + '</td><td class="pred">' + renderFeats(p, gp, 'fp') + '</td>'
               : '<td class="pred">' + esc(p) + '</td>') + '</tr>';
  }
  return h + '</tbody></table></div></div>';
}

// ================================================================= per-treebank page

function treebankPage() {
  const R = DATA.report, M = R.meta_summary, gold = M.has_gold_feats;
  const S = R.support || {};

  function overview() {
    let h = '<h2>Summary</h2><div class="tiles">' +
      tile(M.aligned_tokens, 'tokens (' + M.labelled_tokens + ' with labels)') +
      tile(pct(R.label_mapped), 'labels mapped (' + M.mapped_labels + ' / ' + M.labels + ')');
    if (gold) {
      h += tile(pct(R.precision), 'precision') + tile(pct(R.recall), 'recall') + tile(pct(R.f1), 'F1') +
           tile(pct(R.r_f1), 'F1, producible features only') + tile(pct(R.exact), 'exact FEATS match') +
           tile(pct(R.exact_labelled), 'exact match, labelled tokens');
    } else {
      h += tile('n/a – no gold FEATS', 'precision / recall / F1', ' na');
    }
    h += '</div><h2>Mapping problems</h2><div class="tiles">';
    for (const st of STAGES) {
      const e = (R.problems || {})[st] || {};
      h += '<div class="tile click" data-goto="problems" data-stage="' + st + '"><div class="v">' + sum(Object.fromEntries(
        Object.entries(e).map(([k, v]) => [k, v.count]))) + '</div><div class="k">' + chip(st, st) + ' ' +
        Object.keys(e).length + ' distinct</div></div>';
    }
    h += '</div>';

    const fix = [];
    for (const st of ['unknown_label', 'unknown_um', 'gloss_unmappable']) {
      for (const [l, v] of Object.entries((R.problems || {})[st] || {})) fix.push([v.count, st, l, v]);
    }
    fix.sort((a, b) => b[0] - a[0]);
    h += '<h2>Most frequent unmapped labels</h2><p class="desc">Adding or fixing rows in g2um_map.csv for these gains the most labels.</p>' +
      table(['label', 'stage', ['count', 'num'], 'note'], fix.slice(0, 8).map(([n, st, l, v]) =>
        '<tr><td class="mono">' + esc(l) + '</td><td>' + chip(st, st) + '</td><td class="num">' +
        cnt('problem|' + st + '|' + l, n, st + ': ' + l) + '</td><td class="note">' + esc(v.note) + '</td></tr>'), 'plain');

    if (gold) {
      const low = Object.entries(R.labels).filter(([, s]) => s.pairs >= 5 && s.agree != null)
        .map(([l, s]) => [l, s, s.agree / s.pairs]).filter(x => x[2] < 0.5).sort((a, b) => a[2] - b[2]).slice(0, 8);
      h += '<h2>Mapped labels that rarely agree with gold</h2><p class="desc">At least 5 produced pairs and under 50% found in gold FEATS: likely a wrong map row or a language-specific use.</p>' +
        (low.length ? table(['label', 'UD', ['count', 'num'], ['agree', 'num'], ['layer', 'num']], low.map(([l, s, a]) =>
          '<tr><td class="mono">' + esc(l) + '</td><td class="mono">' + esc(s.ud) + '</td><td class="num">' +
          cnt('label|' + l, s.count, 'label ' + l) + '</td><td class="num">' + pct(a) + '</td><td class="num">' +
          pct(s.layer_agree / s.pairs) + '</td></tr>'), 'plain') : '<p class="desc">None.</p>');
    }
    return h;
  }

  function problems() {
    let h = '<p class="desc">Gloss labels that did not reach a UD feature, by the stage where mapping stopped, plus words where two labels give different values for one feature. Click a count for example sentences.</p>' +
      '<div class="filters">' + STAGES.map(st => chip(st + ' stagechip', st, STAGE_DESC[st])).join('') + '</div>';
    for (const st of STAGES) {
      const e = (R.problems || {})[st];
      if (!e) continue;
      const total = Object.values(e).reduce((a, v) => a + v.count, 0);
      const rows = Object.entries(e).map(([l, v]) =>
        '<tr><td class="mono">' + esc(l) + '</td><td class="num">' + cnt('problem|' + st + '|' + l, v.count, st + ': ' + l) +
        '</td><td class="num">' + (v.sentences != null ? v.sentences : '') + '</td><td class="mono note">' +
        rawForms(v.raw, l) + '</td><td class="note">' + esc(v.note) + '</td></tr>');
      h += '<details class="stage" open data-stage="' + st + '"><summary>' + chip(st, st) + ' <b>' + total + '</b> occurrences, ' +
        Object.keys(e).length + ' distinct — ' + esc(STAGE_DESC[st] || '') + '</summary>' +
        table([st === 'conflict' ? 'feature=values' : 'label', ['count', 'num'], ['sentences', 'num'],
               st === 'conflict' ? 'glosses' : 'as written (if different)', 'note'], rows) + '</details>';
    }
    return h;
  }
  function problemsAfter(sec) {
    sec.querySelectorAll('.stagechip').forEach(c => c.addEventListener('click', () => {
      c.classList.toggle('off');
      const st = Array.from(c.classList).find(x => STAGES.includes(x));
      const d = sec.querySelector('details[data-stage="' + st + '"]');
      if (d) d.hidden = c.classList.contains('off');
    }));
  }

  function labels() {
    const rows = Object.entries(R.labels).map(([l, s]) => {
      const st = s.problem || 'mapped';
      const agree = gold && s.pairs ? s.agree / s.pairs : null;
      const layer = gold && s.pairs ? s.layer_agree / s.pairs : null;
      return '<tr data-c="' + st + '" data-f="' + esc((l + ' ' + Object.keys(s.raw).join(' ') + ' ' + (s.ud || '') + ' ' + (s.um_tag || '')).toLowerCase()) + '">' +
        '<td class="mono">' + esc(l) + '</td><td class="num">' + cnt('label|' + l, s.count, 'label ' + l) + '</td>' +
        '<td>' + chip(st, st) + '</td><td class="mono note">' + rawForms(s.raw, l) + '</td><td>' + esc(Object.keys(s.via).join(', ')) + '</td>' +
        '<td class="mono">' + esc(s.um_tag || '') + '</td><td class="mono">' + esc(s.ud) + '</td><td>' + esc(s.upos || '') + '</td>' +
        (gold ? '<td data-v="' + (agree == null ? '' : agree) + '">' + bar(agree) + '</td><td class="num" data-v="' + (layer == null ? '' : layer) + '">' + pct(layer) + '</td>' : '') +
        '<td class="note">' + esc(s.note) + '</td></tr>';
    });
    const heads = ['label', ['count', 'num'], 'status', 'as written', 'via', 'UM tag', 'UD', 'UPOS']
      .concat(gold ? [['agree', 'num', 'Share of produced Feat=Val pairs found in gold FEATS'],
                      ['layer', 'num', 'Share found in gold only on a layered feature, e.g. Person[psor]']] : [])
      .concat(['note']);
    return '<p class="desc">Every label found and how it resolved. <i>Via</i>: exact / upper (case-folded) / fused (3SG) / non (N- prefix) / classnum (LOC2) / udname (3Sing).' +
      (gold ? ' <i>Agree</i>: share of the UD pairs it produced that appear in gold.' : '') + '</p>' +
      filterBar('labels-tbl', [['mapped']].concat(STAGES.filter(s => s !== 'conflict').map(s => [s])), 'filter labels, forms, UD…') +
      '<div id="labels-tbl">' + table(heads, rows) + '</div>';
  }

  function errors() {
    const pf = Object.entries(R.per_feature || {});
    const prod = pf.filter(([, c]) => c.producible), unprod = pf.filter(([, c]) => !c.producible);
    let h = '<h2>Per feature (producible)</h2><p class="desc">Atomic Feat=Val pairs against gold FEATS, for features some row of the gloss→UniMorph map can produce. Click a feature for its value matrix.</p>' +
      table(['feature', ['TP', 'num'], ['FP', 'num'], ['FN', 'num'], ['P', 'num'], ['R', 'num'], ['F1', 'num']], prod.map(([f, c]) =>
        '<tr><td class="mono"><a href="#" data-mx="' + esc(f) + '">' + esc(f) + '</a></td><td class="num">' + (c.tp || 0) + '</td><td class="num">' +
        (c.fp || 0) + '</td><td class="num">' + (c.fn || 0) + '</td><td class="num">' + pct(c.precision) + '</td><td class="num">' +
        pct(c.recall) + '</td><td class="num" style="' + heat(c.f1) + '">' + pct(c.f1) + '</td></tr>'));
    if (unprod.length) {
      h += '<details><summary class="desc">' + unprod.length + ' gold features the map cannot produce (' +
        unprod.reduce((a, [, c]) => a + (c.fn || 0), 0) + ' missed pairs): ' + esc(unprod.map(x => x[0]).join(', ')) + '</summary>' +
        table(['feature', ['FN', 'num']], unprod.map(([f, c]) => '<tr><td class="mono">' + esc(f) + '</td><td class="num">' + (c.fn || 0) + '</td></tr>')) +
        '</details>';
    }
    const KINDS = [['value_mismatch', 'value', 'fp', 'Predicted value differs from gold value'],
                   ['layer_mismatch', 'layer', 'fp', 'Gold has the value on a layered feature'],
                   ['overgeneration', 'overgeneration', 'fp', 'Gold lacks the feature'],
                   ['producible', 'missed (producible)', 'miss', 'In gold, map could produce it'],
                   ['unproducible', 'missed (unproducible)', 'miss', 'In gold, map cannot produce it']];
    const rows = [];
    for (const [kind, name, src] of KINDS) {
      const e = (src === 'fp' ? R.disagreements : R.misses) || {};
      for (const [k, n] of Object.entries(e[kind] || {})) {
        rows.push('<tr data-c="' + kind + '"><td class="mono">' + esc(k) + '</td><td>' + esc(name) + '</td><td class="num">' +
          cnt(src + '|' + kind + '|' + k, n, name + ': ' + k) + '</td></tr>');
      }
    }
    const totals = KINDS.map(([kind, name, src]) => [kind, name + ' (' + sum(((src === 'fp' ? R.disagreements : R.misses) || {})[kind]) + ')']);
    h += '<h2>Pair-level errors</h2><p class="desc"><b>value</b> / <b>layer</b> / <b>overgeneration</b>: predicted but not in gold. <b>missed</b>: in gold but not predicted. Toggle kinds with the chips.</p>' +
      filterBar('err-tbl', totals.map(([k, n]) => [k, n]), 'filter pairs…') +
      '<div id="err-tbl">' + table(['pair', 'kind', ['count', 'num']], rows) + '</div>';
    return h;
  }
  function errorsAfter(sec) {
    sec.querySelectorAll('[data-mx]').forEach(a => a.addEventListener('click', ev => {
      ev.preventDefault();
      showTab('matrix');
      drawMatrix(a.dataset.mx, false);
    }));
    // start with the missed-unproducible bucket off: it is large and not actionable here
    const c = sec.querySelector('.filters[data-for="err-tbl"] .fchip.unproducible');
    if (c) c.click();
  }

  let mxMerged = false;
  function matrix() {
    return '<p class="desc">Rows: gold value, columns: predicted value, per token (∅ = feature absent). ' +
      '<i>Merge layers</i> folds layered gold features (Person[p], Number[psor]…) into the base feature before comparing. Click an off-diagonal cell for examples.</p>' +
      '<div class="filters"><select id="mx-feat"></select><label><input type="checkbox" id="mx-merge"> merge layers</label></div>' +
      '<div class="wrap"><table id="mx"></table></div>';
  }
  function drawMatrix(f, merged) {
    if (merged != null) mxMerged = merged;
    const VC = mxMerged ? R.value_confusion_merged : R.value_confusion;
    const sel = document.getElementById('mx-feat');
    const feats = Object.keys(VC || {}).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = feats.map(x => '<option>' + esc(x) + '</option>').join('');
    if (!feats.includes(f)) f = feats.includes(f && f.replace(/\[.*\]$/, '')) ? f.replace(/\[.*\]$/, '') : feats[0];
    sel.value = f;
    document.getElementById('mx-merge').checked = mxMerged;
    const M = VC[f] || {}, NONE = DATA.none;
    const colSet = new Set();
    Object.values(M).forEach(r => Object.keys(r).forEach(p => colSet.add(p)));
    const order = (a, b) => (a === NONE) - (b === NONE) || a.localeCompare(b);
    const rows = Object.keys(M).sort(order), cols = Array.from(colSet).sort(order);
    let maxV = 1;
    rows.forEach(g => cols.forEach(p => { if (g !== p && M[g][p]) maxV = Math.max(maxV, M[g][p]); }));
    const prefix = mxMerged ? 'vcm|' : 'vc|';
    let h = '<thead><tr><th class="rh">gold \\ pred</th>' + cols.map(p => '<th class="col">' + esc(p) + '</th>').join('') + '</tr></thead><tbody>';
    for (const g of rows) {
      h += '<tr><th class="rh">' + esc(g) + '</th>';
      for (const p of cols) {
        const n = M[g][p] || 0;
        if (!n) { h += '<td></td>'; continue; }
        if (g === p) { h += '<td class="diag" title="' + n + ' correct">' + n + '</td>'; continue; }
        const ch = Math.round(255 * (1 - n / maxV * 0.8));
        h += '<td style="background:rgb(255,' + ch + ',' + ch + ')" title="' + esc(f + ': gold ' + g + ' → pred ' + p) + '">' +
          cnt(prefix + f + '|' + g + '|' + p, n, f + ': gold ' + g + ' → pred ' + p) + '</td>';
      }
      h += '</tr>';
    }
    document.getElementById('mx').innerHTML = h + '</tbody>';
  }
  function matrixAfter() {
    document.getElementById('mx-feat').addEventListener('change', e => drawMatrix(e.target.value));
    document.getElementById('mx-merge').addEventListener('change', e => drawMatrix(document.getElementById('mx-feat').value, e.target.checked));
    const ex = hashParams().get('ex') || '';
    const m = ex.match(/^(vcm?)\|([^|]+)\|/);
    drawMatrix(m ? m[2] : 'Person', m ? m[1] === 'vcm' : false);
  }

  buildTabs([
    { id: 'overview', label: 'Overview', render: overview },
    { id: 'problems', label: 'Problems', render: problems, after: problemsAfter },
    { id: 'labels', label: 'Labels', render: labels },
    { id: 'errors', label: 'Errors', render: errors, after: errorsAfter, hidden: !gold },
    { id: 'matrix', label: 'Matrix', render: matrix, after: matrixAfter, hidden: !gold },
  ]);
}

// ================================================================= cross-treebank page

function allPage() {
  const RS = DATA.reports, names = Object.keys(RS).sort();
  const goldNames = names.filter(n => RS[n].meta_summary.has_gold_feats);
  const link = (n, tab, key) => n + '.html#' + new URLSearchParams(key ? { tab, ex: key } : { tab }).toString();

  function overview() {
    let toks = 0, labs = 0, mapped = 0, tp = 0, fp = 0, fn = 0;
    names.forEach(n => {
      const m = RS[n].meta_summary;
      toks += m.aligned_tokens; labs += m.labels; mapped += m.mapped_labels;
      if (m.has_gold_feats) { const s = RS[n].support.pairs; tp += s.tp; fp += s.fp; fn += s.fn; }
    });
    const p = tp + fp ? tp / (tp + fp) : null, r = tp + fn ? tp / (tp + fn) : null;
    let h = '<h2>Pooled</h2><div class="tiles">' + tile(names.length, 'treebanks (' + goldNames.length + ' with gold FEATS)') +
      tile(toks, 'tokens') + tile(pct(labs ? mapped / labs : null), 'labels mapped (' + mapped + ' / ' + labs + ')') +
      tile(pct(p), 'precision, gold treebanks') + tile(pct(r), 'recall, gold treebanks') +
      tile(pct(p && r ? 2 * p * r / (p + r) : null), 'F1, gold treebanks') + '</div>';
    h += '<h2>Treebanks</h2><p class="desc">Bars: how each treebank\'s gloss labels split across mapping stages. ' +
      ['mapped'].concat(STAGES.filter(s => s !== 'conflict')).map(s => chip(s, s)).join(' ') + '</p>';
    const rows = names.map(n => {
      const R = RS[n], m = R.meta_summary;
      const parts = { mapped: m.mapped_labels };
      for (const st of STAGES) if (st !== 'conflict') parts[st] = Object.values((R.problems || {})[st] || {}).reduce((a, v) => a + v.count, 0);
      const tot = sum(parts) || 1;
      const stack = '<div class="stack">' + Object.entries(parts).filter(([, v]) => v).map(([k, v]) =>
        '<span class="' + k + '" style="width:' + (100 * v / tot) + '%" title="' + k + ': ' + v + '"></span>').join('') + '</div>';
      return '<tr><td><a href="' + n + '.html">' + esc(n) + '</a></td><td>' + esc(m.treebank) + '</td><td class="num">' + m.aligned_tokens +
        '</td><td class="num">' + m.labels + '</td><td class="num">' + pct(R.label_mapped) + '</td><td style="min-width:220px">' + stack +
        '</td><td class="num">' + (m.has_gold_feats ? pct(R.f1) : 'n/a') + '</td><td class="num">' + (m.has_gold_feats ? pct(R.r_f1) : 'n/a') + '</td></tr>';
    });
    return h + table(['name', 'treebank', ['tokens', 'num'], ['labels', 'num'], ['mapped', 'num'], 'label stages', ['F1', 'num'], ['rF1', 'num']], rows);
  }

  function labels() {
    const all = {};
    names.forEach(n => Object.entries(RS[n].labels || {}).forEach(([l, s]) => {
      (all[l] = all[l] || {}).by = all[l].by || {};
      all[l].by[n] = s;
      all[l].status = all[l].status && all[l].status !== (s.problem || 'mapped') ? 'mixed' : (s.problem || 'mapped');
      all[l].ud = all[l].ud || s.ud;
    }));
    const rows = Object.entries(all).map(([l, a]) => {
      const total = Object.values(a.by).reduce((x, s) => x + s.count, 0);
      const ag = goldNames.filter(n => a.by[n] && a.by[n].pairs && a.by[n].agree != null).map(n => a.by[n].agree / a.by[n].pairs);
      const spread = ag.length > 1 ? Math.max(...ag) - Math.min(...ag) : null;
      const cells = names.map(n => {
        const s = a.by[n];
        if (!s) return '<td class="grey"></td>';
        const v = s.pairs && s.agree != null ? s.agree / s.pairs : null;
        return '<td class="heat" data-v="' + s.count + '" style="' + heat(v) + '" title="' + esc(n + ': ' + s.count + '×' + (v != null ? ', agree ' + pct(v) : '')) + '">' +
          '<a href="' + link(n, 'labels', 'label|' + l) + '">' + s.count + '</a>' + (v != null ? ' · ' + pct(v) : '') + '</td>';
      }).join('');
      return '<tr data-c="' + a.status + '" data-f="' + esc((l + ' ' + (a.ud || '')).toLowerCase()) + '"><td class="mono">' + esc(l) + '</td><td>' +
        chip(a.status, a.status) + '</td><td class="mono">' + esc(a.ud || '') + '</td><td class="num">' + total + '</td><td class="num">' +
        Object.keys(a.by).length + '</td>' + cells + '<td class="num" data-v="' + (spread == null ? '' : spread) + '">' + pct(spread) + '</td></tr>';
    });
    return '<p class="desc">Each gloss label across treebanks: count · agreement with gold (share of produced Feat=Val pairs found in gold FEATS; coloured red→green). ' +
      '<i>Spread</i> is the max−min agreement across gold treebanks; a wide spread suggests the label is used differently by different languages. Counts link to that treebank\'s examples.</p>' +
      filterBar('x-labels', [['mapped'], ['mixed']].concat(STAGES.filter(s => s !== 'conflict').map(s => [s])), 'filter labels, UD…') +
      '<div id="x-labels">' + table(['label', 'status', 'UD', ['total', 'num'], ['treebanks', 'num']].concat(names.map(n => [n, 'num']))
        .concat([['spread', 'num', 'max − min agreement across gold treebanks']]), rows) + '</div>';
  }

  function problems() {
    const all = {};
    names.forEach(n => STAGES.filter(s => s !== 'conflict').forEach(st =>
      Object.entries(((RS[n].problems || {})[st]) || {}).forEach(([l, v]) => {
        const k = st + '|' + l;
        const a = all[k] = all[k] || { st, l, by: {}, raw: {}, note: v.note };
        a.by[n] = v.count;
        Object.entries(v.raw || {}).forEach(([r, c]) => { a.raw[r] = (a.raw[r] || 0) + c; });
      })));
    const rows = Object.values(all).map(a => {
      const total = sum(a.by);
      return '<tr data-c="' + a.st + '" data-f="' + esc(a.l.toLowerCase() + ' ' + Object.keys(a.raw).join(' ').toLowerCase()) + '"><td class="mono">' + esc(a.l) + '</td><td>' + chip(a.st, a.st) +
        '</td><td class="num">' + total + '</td><td class="num">' + Object.keys(a.by).length + '</td>' +
        names.map(n => a.by[n] ? '<td class="num"><a href="' + link(n, 'problems', 'problem|' + a.st + '|' + a.l) + '">' + a.by[n] + '</a></td>' : '<td class="grey"></td>').join('') +
        '<td class="mono note">' + rawForms(a.raw, a.l) + '</td><td class="note">' + esc(a.note) + '</td></tr>';
    });
    let h = '<h2>To-do list for g2um_map.csv</h2><p class="desc">Labels that did not reach a UD feature, pooled over treebanks. Sorted by total count; unknown labels are candidates for new map rows, unmappable ones for a decision (new UM tag, layered feature, or leave out).</p>' +
      filterBar('x-probs', STAGES.filter(s => s !== 'conflict').map(s => [s]), 'filter labels…') +
      '<div id="x-probs">' + table(['label', 'stage', ['total', 'num'], ['treebanks', 'num']].concat(names.map(n => [n, 'num'])).concat(['as written', 'note']), rows) + '</div>';

    const conf = {};
    names.forEach(n => Object.entries(((RS[n].problems || {}).conflict) || {}).forEach(([k, v]) => {
      const f = k.split('=')[0];
      (conf[f] = conf[f] || {})[n] = ((conf[f] || {})[n] || 0) + v.count;
    }));
    h += '<h2>Conflicts by feature</h2><p class="desc">Words where two labels gave different values for one feature (typically agreement with more than one argument; UD would need layered features).</p>' +
      table(['feature', ['words', 'num'], ['treebanks', 'num']].concat(names.map(n => [n, 'num'])), Object.entries(conf).map(([f, by]) =>
        '<tr><td class="mono">' + esc(f) + '</td><td class="num">' + sum(by) + '</td><td class="num">' + Object.keys(by).length + '</td>' +
        names.map(n => '<td class="num">' + (by[n] ? '<a href="' + link(n, 'problems') + '">' + by[n] + '</a>' : '') + '</td>').join('') + '</tr>'));
    return h;
  }
  function problemsAfter(sec) {
    const th = sec.querySelector('#x-probs thead th:nth-child(3)');
    if (th) th.click();
  }

  function features() {
    if (!goldNames.length) return '<p class="desc">No treebank with gold FEATS.</p>';
    const feats = new Set(), prod = new Set();
    goldNames.forEach(n => Object.entries(RS[n].per_feature || {}).forEach(([f, c]) => { feats.add(f); if (c.producible) prod.add(f); }));
    const row = f => '<tr><td class="mono">' + esc(f) + '</td><td>' + (prod.has(f) ? 'yes' : '') + '</td>' +
      goldNames.map(n => {
        const c = (RS[n].per_feature || {})[f];
        if (!c) return '<td class="grey"></td>';
        return '<td class="heat" data-v="' + (c.f1 == null ? '' : c.f1) + '" style="' + heat(c.f1) + '" title="' +
          esc(n + ' ' + f + ': TP ' + (c.tp || 0) + ' FP ' + (c.fp || 0) + ' FN ' + (c.fn || 0)) + '">' +
          '<a href="' + link(n, 'errors') + '">' + pct(c.f1) + '</a></td>';
      }).join('') + '</tr>';
    const sorted = Array.from(feats).sort((a, b) => a.localeCompare(b));
    const unprod = sorted.filter(f => !prod.has(f));
    const heads = ['feature', 'producible'].concat(goldNames.map(n => [n, 'num']));
    let h = '<h2>F1 per feature</h2><p class="desc">Gold treebanks only; grey = feature absent from that treebank. Hover for TP/FP/FN.</p>' +
      table(heads, sorted.filter(f => prod.has(f)).map(row));
    if (unprod.length) {
      h += '<details><summary class="desc">' + unprod.length + ' gold features the map cannot produce: ' + esc(unprod.join(', ')) +
        '</summary>' + table(heads, unprod.map(row)) + '</details>';
    }
    const KINDS = [['value_mismatch', 'disagreements'], ['layer_mismatch', 'disagreements'], ['overgeneration', 'disagreements'],
                   ['producible', 'misses'], ['unproducible', 'misses']];
    h += '<h2>Error kinds</h2><p class="desc">Pair counts per kind; the layer column shows how much precision would be recovered by producing layered features.</p>' +
      table(['treebank', ['TP', 'num']].concat(KINDS.map(([k, src]) => [(src === 'misses' ? 'missed ' : '') + k.replace('_mismatch', ''), 'num'])),
        goldNames.map(n => '<tr><td><a href="' + link(n, 'errors') + '">' + esc(n) + '</a></td><td class="num">' + RS[n].support.pairs.tp + '</td>' +
          KINDS.map(([k, src]) => '<td class="num">' + sum(((RS[n][src] || {})[k])) + '</td>').join('') + '</tr>'));
    return h;
  }

  buildTabs([
    { id: 'overview', label: 'Overview', render: overview },
    { id: 'labels', label: 'Labels', render: labels, after: sec => { const th = sec.querySelector('#x-labels thead th:nth-child(4)'); if (th) th.click(); } },
    { id: 'problems', label: 'Problems', render: problems, after: problemsAfter },
    { id: 'features', label: 'Features', render: features },
  ]);
}

// ================================================================= boot

document.addEventListener('DOMContentLoaded', () => {
  makeSortable(document);
  if (!HAS_DATA) return;
  if (DATA.page === 'treebank') treebankPage(); else allPage();

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-k]');
    if (el) { openPanel(el.dataset.k, el.dataset.l || el.dataset.k, el); return; }
    const t = ev.target.closest('[data-goto]');
    if (t) {
      showTab(t.dataset.goto);
      const d = document.querySelector('details[data-stage="' + t.dataset.stage + '"]');
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth' }); }
    }
  });
  const close = document.getElementById('panel-close');
  if (close) close.addEventListener('click', closePanel);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.getElementById('panel')) closePanel(); });

  const p = hashParams();
  showTab(p.get('tab') || 'overview');
  const ex = p.get('ex');
  if (ex && DATA.ex) {
    const el = Array.from(document.querySelectorAll('[data-k]')).find(e => e.dataset.k === ex);
    const label = el ? el.dataset.l : ex.replace(/^(vcm?)\|([^|]+)\|([^|]+)\|(.*)$/, '$2: gold $3 → pred $4').replace(/^[a-z]+\|/, '');
    openPanel(ex, label, el);
  }
});
})();
