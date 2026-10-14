// Shared renderer for the gloss2feats evaluation site (logs/www/feats/).
// Pages define `const DATA = {page: 'treebank' | 'index', ...}` before loading
// this file.
(function () {
'use strict';

// ---------------------------------------------------------------- utilities

const STAGES = ['unknown_label', 'gloss_unmappable', 'unknown_um', 'um_no_ud', 'conflict'];
const HAS_DATA = typeof DATA !== 'undefined';
const STAGE_DESC = (HAS_DATA && DATA.problems) || {};
// Tooltips for every status badge (problem stages plus the two non-problem statuses).
const STATUS_DESC = Object.assign({
  mapped: 'Gloss label mapped to a UD feature',
  mixed: 'Status differs between treebanks',
}, STAGE_DESC);

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pct(v) { return v == null ? '–' : (v * 100).toFixed(1) + '%'; }
function sum(obj) { return Object.values(obj || {}).reduce((a, b) => a + b, 0); }
function cnt(key, n, label) {
  return n ? '<span data-k="' + esc(key) + '" data-l="' + esc(label || key) + '">' + n + '</span>' : '0';
}
// Status badges get their description as tooltip unless one is given.
// Add the 'badge' class for badges outside tables (larger, sans-serif).
function chip(cls, text, title) {
  if (title === undefined) title = STATUS_DESC[cls.split(' ')[0]];
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
    cats.map(c => chip(c[0] + ' fchip badge', c[1] || c[0], c[2])).join('') + '</div>';
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
      const cat = Array.from(c.classList).find(x => !['chip', 'fchip', 'badge', 'off'].includes(x));
      c.classList.toggle('off');
      if (off.has(cat)) off.delete(cat); else off.add(cat);
      apply();
    }));
  });
}

// ---------------------------------------------------------------- tabs + hash routing

let TABS = [];
let gotoStage = null;   // set by the per-treebank page: open the Problems tab at one stage
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
// `conflicts`: feature names whose values came from two disagreeing labels;
// the whole Feat=v1,v2 group is outlined.
function renderFeats(s, other, cls, conflicts) {
  if (!s || s === '_') return '_';
  return s.split('|').map(kv => {
    const i = kv.indexOf('='), k = kv.slice(0, i);
    const group = kv.slice(i + 1).split(',').map(v => {
      const p = k + '=' + v;
      return other.has(p) ? esc(p) : '<span class="' + cls + '">' + esc(p) + '</span>';
    }).join(',');
    return conflicts && conflicts.includes(k)
      ? '<span class="fconflict" title="conflict: two gloss labels give different ' + esc(k) + ' values">' + group + '</span>'
      : group;
  }).join('|<wbr>');
}
// Allow long glosses to wrap after morpheme boundaries.
function breakable(s) { return esc(s).replace(/([-.=])/g, '$1<wbr>'); }
function labelChips(labels) {
  const notes = DATA.notes || {};
  return labels.map(([raw, label, problem]) => {
    const st = problem || 'mapped';
    const note = notes[st + '|' + label];
    return chip(st, raw === label ? label : raw + ' → ' + label, st + (note ? ': ' + note : ''));
  }).join('');
}
// Two rows per token, sharing the ID cell: the input on top (FORM, Gloss,
// gold FEATS) and what was derived from it below, tinted (UPOS + gloss UPOS,
// labels, pred FEATS). Separate rows keep the two halves aligned when a
// cell wraps.
function renderSent(sid, ids) {
  const sent = DATA.sents[sid];
  if (!sent) return '';
  const gold = DATA.report.meta_summary.has_gold_feats;
  let h = '<div class="ex"><div class="ex-id">' + esc(sid) + '</div>';
  if (sent.comments.length) h += '<div class="ex-cm">' + sent.comments.map(esc).join('<br>') + '</div>';
  h += '<table class="sent-tbl"><thead>' +
       '<tr class="g"><th rowspan="2" title="Token ID; highlighted rows match the clicked item">ID</th>' +
       '<th title="Word form">FORM</th>' +
       '<th title="Word-level gloss, as read from the gloss field">Gloss</th>' +
       '<th title="' + (gold ? 'Gold FEATS from the treebank. Amber: not predicted' : '') + '">' + (gold ? 'gold FEATS' : '') + '</th></tr>' +
       '<tr class="p"><th title="Gold UPOS · UPOS implied by a gloss label (e.g. CVB → VERB)">UPOS · gloss UPOS</th>' +
       '<th title="Gloss labels found, as written → resolved label. Colour shows how far mapping got; hover a chip for details">labels</th>' +
       '<th title="FEATS mapped from the labels.' + (gold ? ' Red: not in gold.' : '') + ' Dashed outline: two labels gave different values">pred FEATS</th></tr></thead>';
  for (const [id, form, upos, gupos, gloss, labels, g, p, conflicts] of sent.rows) {
    const gp = featPairs(g), pp = featPairs(p);
    const hl = ids.has(id) ? ' hl' : '';
    const pos = esc(upos) + (gupos ? ' · <span class="gupos" title="UPOS implied by a gloss label">' + esc(gupos) + '</span>' : '');
    h += '<tbody class="tok' + hl + '">' +
         '<tr class="g"><td class="id" rowspan="2">' + esc(id) + '</td><td>' + esc(form) + '</td><td class="brk">' + breakable(gloss) +
         '</td><td class="brk">' + (gold ? renderFeats(g, pp, 'fn') : '') + '</td></tr>' +
         '<tr class="p"><td>' + pos + '</td><td class="brk">' + labelChips(labels) + '</td><td class="brk">' +
         (gold ? renderFeats(p, gp, 'fp', conflicts) : renderFeats(p, new Set(), 'none', conflicts)) + '</td></tr></tbody>';
  }
  return h + '</table></div>';
}

// ================================================================= per-treebank page

function treebankPage() {
  const R = DATA.report, M = R.meta_summary, gold = M.has_gold_feats;
  const S = R.support || {};

  function overview() {
    let h = '<h2>Summary</h2><div class="tiles">' +
      tile(M.aligned_tokens, 'tokens (' + M.labelled_tokens + ' glossed)') +
      tile(pct(R.label_mapped), 'labels mapped (' + M.mapped_labels + ' / ' + M.labels + ')');
    if (gold) {
      h += tile(pct(R.precision), 'precision') + tile(pct(R.recall), 'recall') + tile(pct(R.f1), 'F1') +
           tile(pct(R.r_f1), 'F1, producible features only') + tile(pct(R.exact), 'exact FEATS match') +
           tile(pct(R.exact_labelled), 'exact match, glossed tokens');
    } else {
      h += tile('n/a – no gold FEATS', 'precision / recall / F1', ' na');
    }
    h += '</div><h2>Mapping problems</h2><div class="tiles">';
    for (const st of STAGES) {
      const e = (R.problems || {})[st] || {};
      h += '<div class="tile click" data-goto="problems" data-stage="' + st + '"><div class="v">' + sum(Object.fromEntries(
        Object.entries(e).map(([k, v]) => [k, v.count]))) + '</div><div class="k">' + chip(st + ' badge', st) + ' ' +
        Object.keys(e).length + ' distinct</div></div>';
    }
    h += '</div>';

    const fix = [];
    for (const st of ['unknown_label', 'unknown_um', 'gloss_unmappable']) {
      for (const [l, v] of Object.entries((R.problems || {})[st] || {})) fix.push([v.count, st, l, v]);
    }
    fix.sort((a, b) => b[0] - a[0]);
    h += '<h2>Most frequent unmapped labels</h2>' +
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
    const probs = R.problems || {};
    const total = st => Object.values(probs[st] || {}).reduce((a, v) => a + v.count, 0);
    let h = '<div class="stagetabs">' + STAGES.map(st =>
        '<button class="chip badge stagetab ' + st + '" data-stage="' + st + '" title="' + esc(STAGE_DESC[st] || '') + '"' +
        (probs[st] ? '' : ' disabled') + '>' + esc(st) + ' <b>' + total(st) + '</b></button>').join('') + '</div>';
    for (const st of STAGES) {
      const e = probs[st];
      if (!e) continue;
      const rows = Object.entries(e).map(([l, v]) =>
        '<tr><td class="mono">' + esc(l) + '</td><td class="num">' + cnt('problem|' + st + '|' + l, v.count, st + ': ' + l) +
        '</td><td class="num">' + (v.sentences != null ? v.sentences : '') + '</td><td class="mono note">' +
        rawForms(v.raw, l) + '</td><td class="note">' + esc(v.note) + '</td></tr>');
      h += '<div class="stage-pane" data-stage="' + st + '" hidden><p class="desc"><b>' + total(st) + '</b> occurrences, ' +
        Object.keys(e).length + ' distinct — ' + esc(STAGE_DESC[st] || '') + '</p>' +
        table([st === 'conflict' ? 'feature=values' : 'label', ['count', 'num'], ['sentences', 'num'],
               st === 'conflict' ? 'glosses' : 'as written (if different)', 'note'], rows) + '</div>';
    }
    return h;
  }
  function showStage(st) {
    const sec = document.getElementById('tab-problems');
    if (!sec.querySelector('.stage-pane[data-stage="' + st + '"]')) {
      const first = sec.querySelector('.stage-pane');
      if (!first) return;
      st = first.dataset.stage;
    }
    sec.querySelectorAll('.stagetab').forEach(b => b.classList.toggle('active', b.dataset.stage === st));
    sec.querySelectorAll('.stage-pane').forEach(p => { p.hidden = p.dataset.stage !== st; });
    const p = hashParams();
    p.set('stage', st);
    setHash(p);
  }
  function problemsAfter(sec) {
    sec.querySelectorAll('.stagetab').forEach(b => b.addEventListener('click', () => showStage(b.dataset.stage)));
    const p = hashParams(), m = (p.get('ex') || '').match(/^problem\|([^|]+)\|/);
    showStage(p.get('stage') || (m && m[1]) || STAGES[0]);
  }
  gotoStage = st => { showTab('problems'); showStage(st); };

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
    const heads = [
      ['label', '', 'Canonical gloss label (the key in the gloss-to-UM map, or the label as written if unknown)'],
      ['count', 'num', 'Occurrences; click for example sentences'],
      ['status', '', 'How far mapping got for this label'],
      ['as written', '', 'Spellings in the data that resolved to this label, with counts'],
      ['via', '', 'How the written form resolved: exact / upper (case-folded) / fused (3SG) / non (N- prefix) / classnum (LOC2) / udname (3Sing)'],
      ['UM tag', '', 'UniMorph tag from the gloss-to-UM map'],
      ['UD', '', 'UD features from the UM-to-UD map'],
      ['UPOS', '', 'UPOS implied by the label, if any'],
    ].concat(gold ? [['agree', 'num', 'Share of the Feat=Val pairs this label produced that appear in gold FEATS'],
                     ['layer', 'num', 'Share found in gold only on a layered feature, e.g. Person[psor]']] : [])
      .concat([['note', '', 'Note from the gloss-to-UM map, or the UM category for UM-to-UD problems']]);
    return       filterBar('labels-tbl', [['mapped']].concat(STAGES.filter(s => s !== 'conflict').map(s => [s])), 'filter labels, forms, UD…') +
      '<div id="labels-tbl">' + table(heads, rows) + '</div>';
  }

  function errors() {
    const KINDS = [['value_mismatch', 'value', 'fp', 'Predicted, but gold has another value for the feature'],
                   ['layer_mismatch', 'layer', 'fp', 'Predicted, but gold has the value on a layered feature (e.g. Person[psor])'],
                   ['overgeneration', 'overgeneration', 'fp', 'Predicted, but gold lacks the feature'],
                   ['producible', 'missed (producible)', 'miss', 'In gold but not predicted; the gloss-to-UM map can produce this feature'],
                   ['unproducible', 'missed (unproducible)', 'miss', 'In gold but not predicted; no row of the gloss-to-UM map produces this feature']];
    const rows = [];
    for (const [kind, name, src] of KINDS) {
      const e = (src === 'fp' ? R.disagreements : R.misses) || {};
      for (const [k, n] of Object.entries(e[kind] || {})) {
        rows.push('<tr data-c="' + kind + '"><td class="mono">' + esc(k) + '</td><td>' + esc(name) + '</td><td class="num">' +
          cnt(src + '|' + kind + '|' + k, n, name + ': ' + k) + '</td></tr>');
      }
    }
    const chips = KINDS.map(([kind, name, src, desc]) =>
      [kind, name + ' (' + sum(((src === 'fp' ? R.disagreements : R.misses) || {})[kind]) + ')', desc + '. Click to show/hide.']);
    return filterBar('err-tbl', chips, 'filter pairs…') +
      '<div id="err-tbl">' + table([
        ['pair', '', 'The Feat=Val pair: for value and layer errors, predicted pair and the gold one it clashes with'],
        ['kind', '', 'Kind of error (hover badges above for descriptions)'],
        ['count', 'num', 'Tokens with this error; click for example sentences'],
      ], rows) + '</div>';
  }
  function errorsAfter(sec) {
    sec.querySelector('#err-tbl thead th:nth-child(3)').click();   // count, descending
    // start with the missed-unproducible bucket off: it is large and not actionable here
    const c = sec.querySelector('.filters[data-for="err-tbl"] .fchip.unproducible');
    if (c) c.click();
  }

  buildTabs([
    { id: 'overview', label: 'Overview', render: overview },
    { id: 'problems', label: 'Problems', render: problems, after: problemsAfter },
    { id: 'labels', label: 'Labels', render: labels },
    { id: 'errors', label: 'Errors', render: errors, after: errorsAfter, hidden: !gold },
  ]);
}

// ================================================================= index (all treebanks)

function indexPage() {
  const RS = DATA.reports, names = Object.keys(RS).sort();
  const goldNames = names.filter(n => RS[n].meta_summary.has_gold_feats);
  const link = (n, params) => n + '.html#' + new URLSearchParams(params).toString();
  const NONCONF = STAGES.filter(s => s !== 'conflict');
  // small inline chips: Feat=Val with a share, or a treebank with a coloured agreement
  const fc = (text, title, style) => '<span class="fc"' + (style ? ' style="' + style + '"' : '') +
    (title ? ' title="' + esc(title) + '"' : '') + '>' + text + '</span>';
  // Top k entries as chips, the rest behind a hoverable "+N more" chip.
  const topList = (obj, total, k) => {
    const all = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return all.slice(0, k).map(([p, n]) => total
      ? fc(esc(p) + ' <b>' + pct(n / total) + '</b>', p + ': ' + n + ' of ' + total)
      : fc(esc(p) + ' ×' + n)).join('') + moreChip(all.slice(k), total);
  };
  const moreChip = (rest, total) => rest.length ? '<span class="fc more" data-tip="' + esc(rest.slice(0, 12)
    .map(([p, n]) => p + '  ' + n + (total ? ' (' + pct(n / total) + ')' : '')).join('\n') +
    (rest.length > 12 ? '\n… ' + (rest.length - 12) + ' more' : '')) + '">+' + rest.length + ' more</span>' : '';
  const where = (by, params) => {
    const e = Object.entries(by).sort((a, b) => b[1] - a[1]);
    return e.slice(0, 4).map(([n, c]) => '<a href="' + link(n, params) + '" title="' + esc(RS[n].meta_summary.treebank) + '">' + esc(n) + '</a> ' + c).join(' · ') +
      (e.length > 4 ? ' <span class="desc" title="' + esc(e.slice(4).map(([n, c]) => n + ' ' + c).join(', ')) + '">+' + (e.length - 4) + '</span>' : '');
  };

  // ---------- pooled data for the three issue views
  const unmapped = {};
  names.forEach(n => NONCONF.forEach(st => Object.entries(((RS[n].problems || {})[st]) || {}).forEach(([l, v]) => {
    const a = unmapped[st + '|' + l] = unmapped[st + '|' + l] || { st, l, by: {}, raw: {}, note: v.note, tokens: 0, unex: {} };
    a.by[n] = v.count;
    Object.entries(v.raw || {}).forEach(([r, c]) => { a.raw[r] = (a.raw[r] || 0) + c; });
    a.tokens += v.tokens || 0;
    Object.entries(v.gold_unexplained || {}).forEach(([p, c]) => { a.unex[p] = (a.unex[p] || 0) + c; });
  })));

  const mapped = {};
  goldNames.forEach(n => Object.entries(RS[n].labels || {}).forEach(([l, s]) => {
    if (s.problem || !s.pairs) return;
    const a = mapped[l] = mapped[l] || { l, ud: s.ud, pairs: 0, agree: 0, layer: 0, instead: {}, by: {} };
    a.pairs += s.pairs; a.agree += s.agree; a.layer += s.layer_agree;
    // keys are "pred pair → gold"; for single-feature labels the UD column already
    // shows the predicted pair, so keep only the gold side
    const single = !(s.ud || '').includes('|');
    a.where = a.where || {};
    Object.entries(s.gold_instead || {}).forEach(([p, c]) => {
      const k = single ? p.split(' → ').pop() : p;
      a.instead[k] = (a.instead[k] || 0) + c;
      (a.where[k] = a.where[k] || []).push([n, c, p]);   // treebank, count, key in that treebank
    });
    a.by[n] = s;
  }));
  const LOW = { pairs: 20, agree: 0.7 };
  const isLow = a => a.pairs >= LOW.pairs && a.agree / a.pairs < LOW.agree;

  const conflicts = {};
  names.forEach(n => Object.entries(((RS[n].problems || {}).conflict) || {}).forEach(([k, v]) => {
    const [f, vals] = k.split('=');
    const a = conflicts[k] = conflicts[k] || { k, f, vals, words: 0, by: {}, glosses: {}, layers: {} };
    a.words += v.count;
    a.by[n] = (a.by[n] || 0) + v.count;
    Object.entries(v.raw || {}).forEach(([g, c]) => { a.glosses[g] = (a.glosses[g] || 0) + c; });
    Object.entries(v.gold_layers || {}).forEach(([p, c]) => { a.layers[p] = (a.layers[p] || 0) + c; });
  }));

  // ---------- Overview
  function overview() {
    let toks = 0, labs = 0, mappedN = 0, tp = 0, fp = 0, fn = 0;
    names.forEach(n => {
      const m = RS[n].meta_summary;
      toks += m.aligned_tokens; labs += m.labels; mappedN += m.mapped_labels;
      if (m.has_gold_feats) { const s = RS[n].support.pairs; tp += s.tp; fp += s.fp; fn += s.fn; }
    });
    const p = tp + fp ? tp / (tp + fp) : null, r = tp + fn ? tp / (tp + fn) : null;
    const unN = Object.values(unmapped).reduce((x, a) => x + sum(a.by), 0);
    const lowN = Object.values(mapped).filter(isLow).length;
    const confN = Object.values(conflicts).reduce((x, a) => x + a.words, 0);
    let h = '<h2>Pooled</h2><div class="tiles">' + tile(names.length, 'treebanks (' + goldNames.length + ' with gold FEATS)') +
      tile(toks, 'tokens') + tile(pct(labs ? mappedN / labs : null), 'labels mapped (' + mappedN + ' / ' + labs + ')') +
      tile(pct(p), 'precision, gold treebanks') + tile(pct(r), 'recall, gold treebanks') +
      tile(pct(p && r ? 2 * p * r / (p + r) : null), 'F1, gold treebanks') + '</div>' +
      '<h2>Issues</h2><div class="tiles">' +
      '<div class="tile click" data-goto="unmapped"><div class="v">' + unN + '</div><div class="k">unmapped label occurrences (' + Object.keys(unmapped).length + ' distinct)</div></div>' +
      '<div class="tile click" data-goto="lowagree"><div class="v">' + lowN + '</div><div class="k">mapped labels that rarely agree with gold</div></div>' +
      '<div class="tile click" data-goto="conflicts"><div class="v">' + confN + '</div><div class="k">words with conflicting labels (' + Object.keys(conflicts).length + ' value combinations)</div></div></div>';

    const rows = names.map(n => {
      const R = RS[n], m = R.meta_summary, s = R.support, g = m.has_gold_feats;
      const parts = { mapped: m.mapped_labels };
      NONCONF.forEach(st => { parts[st] = Object.values((R.problems || {})[st] || {}).reduce((a, v) => a + v.count, 0); });
      const tot = sum(parts) || 1;
      const stack = '<div class="stack">' + Object.entries(parts).filter(([, v]) => v).map(([k, v]) =>
        '<span class="' + k + '" style="width:' + (100 * v / tot) + '%" title="' + esc(STATUS_DESC[k]) + ': ' + v + '"></span>').join('') + '</div>';
      const sc = k => '<td class="num">' + (g ? pct(R[k]) : 'n/a') + '</td>';
      return '<tr><td><a href="' + n + '.html">' + esc(n) + '</a></td><td>' + esc(m.treebank) + '</td>' +
        '<td class="num">' + m.aligned_sentences + '/' + m.total_sentences + '</td><td class="num">' + m.aligned_tokens + '</td>' +
        '<td class="num">' + pct(m.aligned_tokens ? m.labelled_tokens / m.aligned_tokens : null) + '</td>' +
        '<td class="num">' + pct(m.aligned_tokens && m.gold_feat_tokens != null ? m.gold_feat_tokens / m.aligned_tokens : null) + '</td>' +
        '<td class="num">' + pct(m.aligned_tokens && m.pred_feat_tokens != null ? m.pred_feat_tokens / m.aligned_tokens : null) + '</td>' +
        '<td style="min-width:180px">' + stack + '</td><td class="num">' + pct(R.label_mapped) + '</td>' + ['precision', 'recall', 'f1', 'r_f1', 'exact', 'exact_labelled'].map(sc).join('') + '</tr>';
    });
    // micro averages over gold treebanks
    const t = { tp: 0, fp: 0, fn: 0, rtp: 0, rfp: 0, rfn: 0, ex: 0, tok: 0, exl: 0, lab: 0 };
    goldNames.forEach(n => {
      const s = RS[n].support;
      ['tp', 'fp', 'fn'].forEach(k => { t[k] += s.pairs[k]; t['r' + k] += s.restricted[k]; });
      t.ex += s.exact.correct; t.tok += s.exact.total; t.exl += s.exact_labelled.correct; t.lab += s.exact_labelled.total;
    });
    const prf = (a, b, c) => { const P = a + b ? a / (a + b) : null, Rc = a + c ? a / (a + c) : null; return [P, Rc, P && Rc ? 2 * P * Rc / (P + Rc) : null]; };
    const [mp, mr, mf] = prf(t.tp, t.fp, t.fn), rf = prf(t.rtp, t.rfp, t.rfn)[2];
    const foot = '<tfoot><tr><td>micro avg</td><td class="note">scores: gold treebanks only</td><td></td><td class="num">' + toks +
      '</td><td class="num">' + pct(toks ? names.reduce((x, n) => x + RS[n].meta_summary.labelled_tokens, 0) / toks : null) + '</td>' + ['gold_feat_tokens', 'pred_feat_tokens'].map(k =>
        '<td class="num">' + pct(toks ? names.reduce((x, n) => x + (RS[n].meta_summary[k] || 0), 0) / toks : null) + '</td>').join('') +
      '<td></td><td class="num">' + pct(labs ? mappedN / labs : null) + '</td>' +
      [mp, mr, mf, rf, t.tok ? t.ex / t.tok : null, t.lab ? t.exl / t.lab : null].map(v => '<td class="num">' + pct(v) + '</td>').join('') + '</tr></tfoot>';
    const heads = [['name', '', 'Mapped corpus; links to its page'], ['treebank', '', 'Gold treebank'],
      ['sents', 'num', 'Evaluated sentences / total in gold'], ['tokens', 'num', 'Evaluated tokens'],
      ['glossed', 'num', 'Share of tokens with at least one gloss label'],
      ['gold feats', 'num', 'Share of tokens with any FEATS in gold'], ['pred feats', 'num', 'Share of tokens with any predicted FEATS'],
      ['label stages', '', 'How the treebank\'s gloss labels split across mapping stages'],
      ['mapped', 'num', 'Share of gloss labels that reached a UD feature'],
      ['P', 'num', 'Precision of Feat=Val pairs'], ['R', 'num', 'Recall of Feat=Val pairs'], ['F1', 'num', 'F1 of Feat=Val pairs'],
      ['rF1', 'num', 'F1 restricted to features the gloss-to-UM map can produce'],
      ['exact', 'num', 'Tokens whose FEATS match gold exactly'], ['exact (glossed)', 'num', 'Exact match among tokens with gloss labels']];
    return h + '<h2>Treebanks</h2>' + table(heads, rows).replace('</tbody></table>', '</tbody>' + foot + '</table>');
  }

  // ---------- Unmapped labels
  function unmappedTab() {
    const rows = Object.values(unmapped).sort((a, b) => sum(b.by) - sum(a.by)).map(a => {
      const label = a.st + ': ' + a.l;
      return '<tr data-c="' + a.st + '" data-f="' + esc((a.l + ' ' + Object.keys(a.raw).join(' ')).toLowerCase()) + '">' +
        '<td class="mono">' + esc(a.l) + '</td><td>' + chip(a.st, a.st) + '</td><td class="num">' + sum(a.by) + '</td>' +
        '<td class="num">' + Object.keys(a.by).length + '</td>' +
        '<td class="note">' + where(a.by, { tab: 'problems', stage: a.st, ex: 'problem|' + a.st + '|' + a.l }) + '</td>' +
        '<td>' + (a.tokens ? topList(a.unex, a.tokens, 3) : '<span class="desc">no gold</span>') + '</td>' +
        '<td class="mono note">' + rawForms(a.raw, a.l) + '</td><td class="note">' + esc(a.note || '') + '</td></tr>';
    });
    return filterBar('x-unmapped', NONCONF.map(s => [s]), 'filter labels, spellings…') +
      '<div id="x-unmapped">' + table([
        ['label', '', 'Gloss label (canonical, or as written if unknown)'],
        ['stage', '', 'Where mapping stopped'],
        ['occurrences', 'num', 'Occurrences, all treebanks'],
        ['treebanks', 'num', 'Number of treebanks it occurs in'],
        ['where', '', 'Most affected treebanks; links open the examples there'],
        ['candidate gold feats', '', 'Unpredicted gold pairs on words with this label, as share of those words'],
        ['as written', '', 'Spellings in the data that resolved to this label, pooled'],
        ['note', '', 'Note from the gloss-to-UM map'],
      ], rows) + '</div>';
  }

  // ---------- Low agreement
  function lowAgreeTab() {
    const lostOf = a => a.pairs - a.agree;
    const rows = Object.values(mapped).sort((x, y) => lostOf(y) - lostOf(x)).map(a => {
      const ag = a.agree / a.pairs, lost = lostOf(a);
      const tbs = Object.entries(a.by).sort((x, y) => y[1].pairs - x[1].pairs).map(([n, s]) => {
        const v = s.agree / s.pairs;
        return '<a href="' + link(n, { tab: 'labels', ex: 'label|' + a.l }) + '">' +
          fc(esc(n) + ' ' + pct(v), RS[n].meta_summary.treebank + ': ' + s.agree + ' of ' + s.pairs + ' pairs in gold', heat(v)) + '</a>';
      }).join('');
      return '<tr data-pairs="' + a.pairs + '" data-agree="' + ag + '" data-f="' + esc((a.l + ' ' + a.ud).toLowerCase()) + '">' +
        '<td class="mono">' + esc(a.l) + '</td><td class="mono">' + esc(a.ud) + '</td><td class="num">' + a.pairs + '</td>' +
        '<td data-v="' + ag + '">' + bar(ag) + '</td>' +
        '<td class="num">' + lost + '</td>' +
        '<td>' + insteadList(a, lost) + '</td><td>' + tbs + '</td></tr>';
    });
    return '<div class="filters thresholds" data-for="x-low"><input type="search" placeholder="filter labels, UD…">' +
      '<label>min. produced pairs <input type="number" min="1" value="' + LOW.pairs + '" data-th="pairs"></label>' +
      '<label>max. agreement % <input type="number" min="0" max="100" value="' + (LOW.agree * 100) + '" data-th="agree"></label>' +
      '<span class="desc" id="x-low-n"></span></div>' +
      '<div id="x-low">' + table([
        ['label', '', 'Mapped gloss label'],
        ['UD', '', 'UD features it maps to'],
        ['pairs', 'num', 'Feat=Val pairs it produced, gold treebanks'],
        ['agree', 'num', 'Share of produced pairs found in gold FEATS'],
        ['lost', 'num', 'Produced pairs not in gold (pairs × (1 − agree)): the most to gain at the top'],
        ['other gold labels', '', 'Gold counterpart of lost pairs: layered feature, other value, same value elsewhere, or other gold pairs on the word (∅ = none). Click for examples'],
        ['per treebank', '', 'Agreement per treebank; click for examples'],
      ], rows) + '</div>';
  }
  // Badges link to the examples in the treebank where the disagreement is most frequent.
  function insteadList(a, lost) {
    return Object.entries(a.instead).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, c]) => {
      const [n, , key] = a.where[k].sort((x, y) => y[1] - x[1])[0];
      return '<a href="' + link(n, { tab: 'labels', ex: 'instead|' + a.l + '|' + key }) + '">' +
        fc(esc(k) + ' <b>' + pct(lost ? c / lost : null) + '</b>') + '</a>';
    }).join('');
  }
  function lowAgreeAfter(sec) {
    const search = sec.querySelector('.thresholds input[type=search]');
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      const minP = +sec.querySelector('[data-th=pairs]').value || 0, maxA = (+sec.querySelector('[data-th=agree]').value) / 100;
      let n = 0;
      sec.querySelectorAll('#x-low tbody tr').forEach(r => {
        const show = +r.dataset.pairs >= minP && +r.dataset.agree < maxA && (!q || r.dataset.f.includes(q));
        r.classList.toggle('hidden', !show);
        n += show;
      });
      sec.querySelector('#x-low-n').textContent = n + ' labels';
    };
    sec.querySelectorAll('.thresholds input').forEach(i => i.addEventListener('input', apply));
    apply();
  }

  // ---------- Conflicts / layering
  function conflictsTab() {
    const rowsA = Object.values(conflicts).sort((a, b) => b.words - a.words).map(a => {
      const goldTotal = sum(a.layers);
      return '<tr><td class="mono">' + esc(a.f) + '</td><td class="mono">' + esc(a.vals) + '</td><td class="num">' + a.words + '</td>' +
        '<td class="num">' + Object.keys(a.by).length + '</td>' +
        '<td class="note">' + where(a.by, { tab: 'problems', stage: 'conflict', ex: 'problem|conflict|' + a.k }) + '</td>' +
        '<td>' + (goldTotal ? topList(a.layers, goldTotal, 3) : '<span class="desc">no gold</span>') + '</td>' +
        '<td>' + topList(a.glosses, 0, 2) + '</td></tr>';
    });
    const rowsB = goldNames.map(n => {
      const lm = (RS[n].disagreements || {}).layer_mismatch || {}, fp = RS[n].support.pairs.fp;
      const byLayer = {};
      Object.entries(lm).forEach(([k, c]) => { const g = (k.split('→ ')[1] || '').split('=')[0]; byLayer[g] = (byLayer[g] || 0) + c; });
      const total = sum(byLayer);
      if (!total) return '';
      return '<tr><td><a href="' + link(n, { tab: 'errors' }) + '">' + esc(n) + '</a></td><td class="num">' + fp + '</td><td class="num">' + total +
        '</td><td class="num">' + pct(fp ? total / fp : null) + '</td><td>' +
        Object.entries(byLayer).sort((x, y) => y[1] - x[1]).map(([g, c]) => fc(esc(g) + ' ' + c)).join('') + '</td></tr>';
    }).filter(Boolean);
    return '<h2>Conflicting labels</h2>' + table([
        ['feature', '', 'UD feature that labels on one word gave different values for'],
        ['values', '', 'The conflicting values'],
        ['words', 'num', 'Words with this combination, all treebanks'],
        ['treebanks', 'num', 'Number of treebanks with the conflict'],
        ['where', '', 'Most affected treebanks; links open their conflicts'],
        ['gold layers on those words', '', 'Gold features with this base name on the conflicting words'],
        ['typical glosses', '', 'Most frequent glosses with this combination'],
      ], rowsA) +
      '<h2>Layer mismatches</h2>' + table([
        ['treebank', '', 'Gold treebank; links to its Errors tab'],
        ['FP', 'num', 'Predicted pairs not in gold'],
        ['layer', 'num', 'Of those, pairs whose value gold has on a layered feature'],
        ['share of FP', 'num', 'Precision a layering rule could recover'],
        ['by layered feature', '', 'Gold layered features involved'],
      ], rowsB);
  }

  buildTabs([
    { id: 'overview', label: 'Overview', render: overview },
    { id: 'unmapped', label: 'Unmapped labels', render: unmappedTab },
    { id: 'lowagree', label: 'Low agreement', render: lowAgreeTab, after: lowAgreeAfter, hidden: !goldNames.length },
    { id: 'conflicts', label: 'Conflicts', render: conflictsTab },
  ]);
}

// ---------------------------------------------------------------- tooltips

// Custom tooltips for every element with a title: native title tooltips do not
// show reliably in all browsers. The title moves to data-tip on first hover so
// the native one is suppressed.
function initTooltips() {
  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  let cur = null;
  const place = ev => {
    const pad = 12, r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > window.innerWidth - 4) x = Math.max(4, ev.clientX - r.width - pad);
    if (y + r.height > window.innerHeight - 4) y = Math.max(4, ev.clientY - r.height - pad);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };
  document.addEventListener('mouseover', ev => {
    const el = ev.target.closest('[title], [data-tip]');
    if (el && el.hasAttribute('title')) {
      if (el.title) el.dataset.tip = el.title;
      el.removeAttribute('title');
    }
    cur = el && el.dataset.tip ? el : null;
    tip.hidden = !cur;
    if (cur) { tip.textContent = cur.dataset.tip; place(ev); }
  });
  document.addEventListener('mousemove', ev => { if (cur) place(ev); });
  document.addEventListener('mouseout', ev => {
    if (cur && !cur.contains(ev.relatedTarget)) { cur = null; tip.hidden = true; }
  });
  document.addEventListener('scroll', () => { tip.hidden = true; cur = null; }, true);
}

// ================================================================= boot

document.addEventListener('DOMContentLoaded', () => {
  makeSortable(document);
  initTooltips();
  if (!HAS_DATA) return;
  if (DATA.page === 'treebank') treebankPage(); else indexPage();

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-k]');
    if (el) { openPanel(el.dataset.k, el.dataset.l || el.dataset.k, el); return; }
    const t = ev.target.closest('[data-goto]');
    if (t) {
      if (t.dataset.stage && gotoStage) gotoStage(t.dataset.stage); else showTab(t.dataset.goto);
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
    const label = el ? el.dataset.l : ex.replace(/^[a-z]+\|/, '').replace('|', ': ');
    openPanel(ex, label, el);
  }
});
})();
