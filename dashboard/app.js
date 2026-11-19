// Token Launch Radar — the page. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail view with the
// model's own arithmetic and the protocol's farm plan, the trading comps the fit was read from, and
// the method. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D) { app.textContent = 'No data: data.js is missing beside the page.'; return; }

  var fit = D.fit, chk = fit.check, ts = fit.time_split || {}, rows = D.rows, live = D.live;
  var maxImp = rows.length ? rows[0].implied_value_usd : 1;
  var state = { tab: 'board', q: '', cat: 'all', chain: 'all', watch: false, verdict: 'all', sort: 'implied', dir: -1, sel: null };

  // ---------- formatting ----------
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return '<span class="flat">—</span>';
    var c = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
    var sign = n > 0 ? '+' : '';
    return '<span class="' + c + '">' + sign + (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1)) + '%</span>';
  }
  function x(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n >= 10 ? n.toFixed(1) : n.toFixed(3)) + '×'; }
  function age(d) { return d === null || d === undefined ? 'n/a' : d >= 730 ? (d / 365).toFixed(1) + 'y' : d >= 60 ? Math.round(d / 30) + 'mo' : d + 'd'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // ---------- drawn graphics ----------
  var PALETTE = ['#ffb454', '#4fd1c5', '#a78bfa', '#6ee7a8', '#ff8fab', '#7dd3fc', '#f0a4ff', '#c9d67a'];
  function catColor(c) {
    var i = catList.indexOf(c);
    return i >= 0 && i < PALETTE.length ? PALETTE[i] : '#5f7488';
  }
  function median(v) {
    if (!v.length) return 0;
    var s = v.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** The value curve: every priced protocol as a dot on TVL against implied value, the median curve
   *  through them, and the top of the board called out. Drawn as SVG, no canvas and no network. */
  function chartSvg() {
    var W = 1360, H = 210, L = 62, R = 18, T = 12, B = 28;
    var xs = rows.map(function (r) { return Math.log10(r.tvl_usd); });
    var ys = rows.map(function (r) { return Math.log10(r.implied_value_usd); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var px = function (v) { return L + ((v - x0) / (x1 - x0)) * (W - L - R); };
    var py = function (v) { return H - B - ((v - y0) / (y1 - y0)) * (H - T - B); };
    var out = [];
    // median curve: bins of TVL with the median implied value in each
    var bins = 14, curve = [];
    for (var i = 0; i < bins; i++) {
      var lo = x0 + ((x1 - x0) * i) / bins, hi = x0 + ((x1 - x0) * (i + 1)) / bins;
      var inBin = rows.filter(function (r) { var l = Math.log10(r.tvl_usd); return l >= lo && l <= hi; });
      if (!inBin.length) continue;
      curve.push([px(lo + (hi - lo) / 2), py(Math.log10(median(inBin.map(function (r) { return r.implied_value_usd; }))))]);
    }
    var line = curve.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = line + ' L' + curve[curve.length - 1][0].toFixed(1) + ' ' + (H - B) + ' L' + curve[0][0].toFixed(1) + ' ' + (H - B) + ' Z';
    out.push('<svg class="viz" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Implied value against TVL for every priced protocol">');
    out.push('<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#4fd1c5" stop-opacity=".38"/><stop offset="60%" stop-color="#2b6cb0" stop-opacity=".13"/>' +
      '<stop offset="100%" stop-color="#0a0e13" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="glow" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ffb454"/>' +
      '<stop offset="100%" stop-color="#4fd1c5"/></linearGradient></defs>');
    // grid + labels
    var yTicks = [], xTicks = [];
    for (var d = Math.ceil(y0); d <= y1; d++) yTicks.push(d);
    [Math.log10(5e6), Math.log10(2e7), Math.log10(1e8), Math.log10(5e8), Math.log10(2e9), Math.log10(1e10)].forEach(function (v) {
      if (v >= x0 && v <= x1) xTicks.push(v);
    });
    yTicks.forEach(function (d) {
      var y = py(d);
      out.push('<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="#16202b" stroke-width="1"/>');
      out.push('<text x="' + (L - 9) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" class="ax">' + usd(Math.pow(10, d)) + '</text>');
    });
    xTicks.forEach(function (v) {
      var x = px(v);
      out.push('<line x1="' + x.toFixed(1) + '" y1="' + T + '" x2="' + x.toFixed(1) + '" y2="' + (H - B) + '" stroke="#16202b" stroke-width="1" stroke-dasharray="2 5"/>');
      out.push('<text x="' + x.toFixed(1) + '" y="' + (H - B + 18) + '" text-anchor="middle" class="ax">' + usd(Math.pow(10, v)) + '</text>');
    });
    out.push('<path d="' + area + '" fill="url(#fill)"/>');
    out.push('<path d="' + line + '" fill="none" stroke="url(#glow)" stroke-width="2.2" stroke-linejoin="round" opacity=".95"/>');
    rows.forEach(function (r) {
      var c = catColor(r.category || 'unclassified');
      out.push('<circle cx="' + px(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + py(Math.log10(r.implied_value_usd)).toFixed(1) +
        '" r="' + (r.rank <= 10 ? 5 : 3.2) + '" fill="' + c + '" fill-opacity="' + (r.rank <= 10 ? '.95' : '.55') + '" stroke="' + (r.rank <= 10 ? '#0a0e13' : 'none') + '" stroke-width="1.4"/>');
    });
    rows.slice(0, 3).forEach(function (r) {
      out.push('<text x="' + (px(Math.log10(r.tvl_usd)) + 9).toFixed(1) + '" y="' + (py(Math.log10(r.implied_value_usd)) + 4).toFixed(1) + '" class="lbl">' + esc(r.name) + '</text>');
    });
    out.push('<text x="' + L + '" y="' + (H - 4) + '" class="ax">TVL, log scale →</text>');
    out.push('<text x="' + (W - R) + '" y="' + (T + 10) + '" text-anchor="end" class="ax">implied value, log scale ↑</text>');
    out.push('</svg>');
    return out.join('');
  }

  /** The board's composition: a stacked strip of categories, widest first. */
  function heatStrip() {
    var total = rows.length, x = 0, parts = [], legend = [];
    catList.slice(0, 8).forEach(function (c, i) {
      var w = (cats[c] / total) * 100;
      parts.push('<i style="left:' + x.toFixed(2) + '%;width:' + w.toFixed(2) + '%;background:' + PALETTE[i] + '"></i>');
      legend.push('<span><b style="background:' + PALETTE[i] + '"></b>' + esc(c) + ' <em>' + cats[c] + '</em></span>');
      x += w;
    });
    parts.push('<i style="left:' + x.toFixed(2) + '%;width:' + (100 - x).toFixed(2) + '%;background:#5f7488"></i>');
    legend.push('<span><b style="background:#5f7488"></b>every other category <em>' + (total - catList.slice(0, 8).reduce(function (a, c) { return a + cats[c]; }, 0)) + '</em></span>');
    return '<div class="strip">' + parts.join('') + '</div><div class="legend">' + legend.join('') + '</div>';
  }

  // ---------- header ----------
  document.getElementById('ver').textContent = D.model_version;
  document.getElementById('meta').innerHTML =
    'snapshot ' + esc(D.as_of) + '<br>' + D.watchlist_size + ' above the $' + (D.floor_usd / 1e6) + 'M floor · ' + D.board_size + ' priced';

  var cats = {}, chains = {};
  rows.forEach(function (r) {
    cats[r.category || 'unclassified'] = (cats[r.category || 'unclassified'] || 0) + 1;
    r.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
  });
  var catList = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
  var chainList = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a]; }).slice(0, 26);

  // ---------- board ----------
  function visible() {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.verdict !== 'all' && r.farm_verdict !== state.verdict) return false;
      if (state.cat !== 'all' && (r.category || 'unclassified') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var k = state.sort, d = state.dir;
      var av = k === 'name' ? a.name : k === 'tvl' ? a.tvl_usd : k === 'chg' ? (a.change_7d === null ? -1e9 : a.change_7d) : k === 'age' ? (a.age_days === null ? -1 : a.age_days) : k === 'mult' ? a.multiple : k === 'rank' ? a.rank : a.implied_value_usd;
      var bv = k === 'name' ? b.name : k === 'tvl' ? b.tvl_usd : k === 'chg' ? (b.change_7d === null ? -1e9 : b.change_7d) : k === 'age' ? (b.age_days === null ? -1 : b.age_days) : k === 'mult' ? b.multiple : k === 'rank' ? b.rank : b.implied_value_usd;
      if (av === bv) return a.rank - b.rank;
      return (av > bv ? 1 : -1) * d;
    });
  }

  function boardHead() {
    var h = [
      ['rank', '#'], ['name', 'Protocol'], ['cat', 'Category'], ['chain', 'Chains'], ['tvl', 'TVL'],
      ['chg', '7d'], ['age', 'No token for'], ['mult', 'Fitted multiple'], ['verdict', 'Farm net'], ['implied', 'Implied value']
    ];
    return h.map(function (c) {
      var on = state.sort === c[0] ? ' style="color:#e9eff7"' : '';
      return '<th class="' + (c[0] === 'tvl' || c[0] === 'chg' || c[0] === 'implied' ? 'num' : '') + '" data-sort="' + c[0] + '"' + on + '>' + c[1] + (state.sort === c[0] ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
    }).join('');
  }

  /** The page checks itself against the artifact it was written from, and says what it checked. */
  function verificationStrip() {
    var ranks = rows.map(function (r) { return r.rank; }).sort(function (a, b) { return a - b; });
    var ranksOk = ranks.every(function (r, i) { return r === i + 1; });
    var monotone = true;
    for (var i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) monotone = false;
    var watchOnBoard = rows.filter(function (r) { return r.on_watchlist; }).length;
    var covered = watchOnBoard === D.watchlist_size;
    var stepsOk = rows.every(function (r) { return r.farm_steps.length >= 3 && r.farm_steps.length <= 12; });
    var chk = function (ok, label) { return '<span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓' : '✗') + ' ' + label + '</span>'; };
    return '<div class="verify">' +
      '<b>This page = board.json</b>' +
      chk(rows.length === D.board_size, rows.length + ' rows drawn = ' + D.board_size + ' written') +
      chk(ranksOk, 'ranks 1 to ' + rows.length + ', each once') +
      chk(monotone, 'implied value never rises down the board') +
      chk(covered, watchOnBoard + ' of ' + D.watchlist_size + ' watchlist protocols on the board') +
      chk(stepsOk, 'every row carries a farm plan') +
      '<span class="note-inline">checked in the page from the same data.js the program wrote</span></div>';
  }

  /** The band the fit's own measured miss puts around a point estimate. */
  function bandOf(implied) {
    var b = Math.exp(chk.model_median_miss);
    return { low: implied / b, high: implied * b, mult: b };
  }

  function verdictChip(v) {
    return '<span class="vchip ' + v + '">' + v + '</span>';
  }

  function boardView() {
    var list = visible();
    var html = '' +
      '<h1>Every protocol that records <span>no token</span>, priced by what the market already pays.</h1>' +
      '<p class="lede">Of the <b>' + D.protocols_total + ' protocols</b> in the sealed snapshot, <b>' + D.pre_token_total + '</b> record no token; ' +
      '<b>' + D.board_size + '</b> of those stand alone rather than being a wrapped or staked product of a token that trades, and each is priced off the <b>' + fit.prior_comps + ' trading protocols</b> ' +
      'in that same snapshot. The house watchlist of <b>' + D.watchlist_size + '</b> is this board\'s floor, not its ceiling: ' + D.below_floor + ' rows sit below it.</p>' +
      '<div class="stats five">' +
        '<div class="stat amber"><div class="k">Implied value on the board</div><div class="v">' + usd(D.implied_total_usd) + '</div><div class="s">sum of all ' + D.board_size + ' priced protocols</div></div>' +
        '<div class="stat cyan"><div class="k">Comps the fit reads</div><div class="v">' + fit.prior_comps + '</div><div class="s">trading protocols, prior ' + x(fit.prior_multiple) + '</div></div>' +
        '<div class="stat green"><div class="k">Leave-one-out miss</div><div class="v">' + x(chk.model_median_miss) + '</div><div class="s">vs ' + x(chk.blanket_median_miss) + ' for one blanket multiple</div></div>' +
        '<div class="stat violet"><div class="k">Time-split miss</div><div class="v">' + x(ts.combined_miss) + '</div><div class="s">' + ts.old_n + ' older comps price ' + ts.new_n + ' newer ones</div></div>' +
        '<div class="stat farmc"><div class="k">Farm verdicts</div><div class="v">' + D.farm_counts.farm + '<em>farm</em></div><div class="s">' + D.farm_counts.thin + ' thin · ' + D.farm_counts.skip + ' skip, net of gas and carry</div></div>' +
      '</div>' +
      verificationStrip() +
      '<div class="modelstrip"><span class="tag">' + D.model_version + '</span>' +
        '<code>implied = TVL × exp(' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + '·log10 TVL + offset(category)) × growth × patience</code>' +
        '<span>fitted on ' + fit.prior_comps + ' trading protocols · ' + fit.categories.length + ' categories · shrink k=' + fit.model.shrink_k + ' · miss ' + x(chk.model_median_miss) + '</span></div>' +
      '<div class="card vizcard" id="curve">' +
        '<div class="vizhead"><h2>The board as a curve</h2>' +
          '<span class="hint">a dot is a priced protocol, its colour its category; the line is the median implied value at that TVL, so the board\'s own shape is visible</span>' +
          '<span class="chip w">watchlist ' + D.watchlist_size + ' / ' + D.watchlist_size + ' covered</span></div>' +
        chartSvg() + heatStrip() +
      '</div>' +
      '<div class="controls">' +
        '<input id="q" type="search" placeholder="Search protocol, slug or category" value="' + esc(state.q) + '">' +
        '<select id="cat"><option value="all">Every category</option>' + catList.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + ' (' + cats[c] + ')</option>'; }).join('') + '</select>' +
        '<select id="chain"><option value="all">Every chain</option>' + chainList.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + ' (' + chains[c] + ')</option>'; }).join('') + '</select>' +
        '<select id="verdict">' +
          ['all', 'farm', 'thin', 'skip'].map(function (v) {
            var label = v === 'all' ? 'Any verdict' : v + ' (' + D.farm_counts[v] + ')';
            return '<option value="' + v + '"' + (state.verdict === v ? ' selected' : '') + '>' + label + '</option>';
          }).join('') + '</select>' +
        '<label class="chk"><input type="checkbox" id="watch"' + (state.watch ? ' checked' : '') + '> House watchlist only</label>' +
        '<span class="count"><b>' + list.length + '</b> of ' + rows.length + ' rows</span>' +
      '</div>' +
      '<table><thead><tr>' + boardHead() + '</tr></thead><tbody>' +
      list.map(function (r) {
        var w = Math.max(2, Math.round((r.implied_value_usd / maxImp) * 100));
        return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
          '<td class="rank">' + r.rank + '</td>' +
          '<td><div class="nm">' + esc(r.name) + (r.on_watchlist ? ' <span class="chip w">watchlist</span>' : '') + '</div><div class="slug">' + esc(r.slug) + '</div></td>' +
          '<td class="cat">' + esc(r.category || 'unclassified') + '</td>' +
          '<td class="cat">' + esc(r.chains.slice(0, 2).join(', ') || '—') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
          '<td class="num">' + usd(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + age(r.age_days) + '</td>' +
          '<td class="num">' + x(r.multiple) + '</td>' +
          '<td class="num barcell"><div class="barval">' + usd(r.implied_value_usd) + '</div><div class="bar"><i style="width:' + w + '%"></i></div></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="foot">Rows: ' + rows.length + ' pre-token protocols, ranked by implied value. Click any row for the arithmetic behind its number and its farm plan. ' +
      'Implied value is this board\'s own claim, derived from the snapshot, never a prediction that a token is issued.</div>';
    app.innerHTML = html;
  }

  // ---------- detail ----------
  function stepParts(s) {
    var m = s.match(/^(.*?) Cost: (.*)\. Time: (.*)\.$/);
    return m ? { text: m[1], cost: m[2], time: m[3] } : { text: s, cost: '', time: '' };
  }

  /** The trading protocols this row's multiple was read from: the category's comps, largest first. */
  function compsTable(r) {
    var cat = r.category || 'unclassified';
    var list = (D.comps || []).filter(function (c) { return (c.category || 'unclassified') === cat; }).slice(0, 6);
    if (!list.length) return '<div class="note">No trading protocol in the snapshot shares this category, so the multiple comes from the market-wide size curve alone.</div>';
    var med = median(list.map(function (c) { return c.multiple; }));
    return '<table class="mini"><thead><tr><th>Comp</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>' +
      list.map(function (c) {
        return '<tr><td class="cat">' + esc(c.name) + '</td><td class="num">' + usd(c.tvl_usd) + '</td><td class="num">' + usd(c.mcap_usd) + '</td>' +
          '<td class="num">' + (Math.abs(c.multiple - med) < 1e-9 ? '<b style="color:#ffb454">' + x(c.multiple) + '</b>' : x(c.multiple)) + '</td></tr>';
      }).join('') +
      '</tbody></table><p class="small">' + (list.length >= 3
        ? 'Median ' + x(med) + ' across these ' + list.length + '; the fit shrinks that toward the whole market and then applies the size curve at ' + usd(r.tvl_usd) + ', which lands on ' + x(r.multiple) + '.'
        : (list.length === 1 ? 'One comp is too few to move the fit' : 'These ' + list.length + ' are too few to move the fit') + ' — it needs three in a category — so the size curve alone lands on ' + x(r.multiple) + '.') + '</p>';
  }

  /** The farm economics as a ledger: what one wallet expects, what it costs, what is left. */
  function econTable(r) {
    var a = D.farm_assumptions;
    var rows2 = [
      ['expected at launch', usd(r.farm_expected_usd), 'implied value × ' + a.capture + ', one wallet\'s share'],
      ['gas, set-up and exit', '-$' + (a.gas_setup + a.gas_exit), 'one deposit and one withdrawal'],
      ['carry on the deposit', '-$' + r.farm_carry_usd.toFixed(2), '$' + r.farm_capital_usd + ' at ' + (a.carry_apr * 100) + '% for ' + r.farm_days + ' days'],
    ];
    return '<table class="mini econ"><thead><tr><th>Line</th><th class="num">USD</th><th>How it is computed</th></tr></thead><tbody>' +
      rows2.map(function (row) {
        return '<tr><td>' + row[0] + '</td><td class="num">' + row[1] + '</td><td class="small">' + row[2] + '</td></tr>';
      }).join('') +
      '<tr class="tot"><td>net for one wallet</td><td class="num">' + (r.farm_net_usd >= 0 ? '+' : '') + '$' + Math.round(r.farm_net_usd) + '</td>' +
      '<td>' + verdictChip(r.farm_verdict) + ' <span class="small">breaks even at an implied value of ' + usd(r.farm_breakeven_usd) + '</span></td></tr>' +
      '</tbody></table>';
  }

  /** The point estimate with the fit's measured miss drawn as a range, so the reader sees the width. */
  function bandBar(r) {
    var b = bandOf(r.implied_value_usd);
    return '<div class="bandbar"><div class="track"><i style="left:18%;width:64%"></i>' +
      '<b class="pt" style="left:50%"></b></div>' +
      '<div class="bandlab"><span>' + usd(b.low) + '</span><span class="mid">' + usd(r.implied_value_usd) + ' at the point estimate</span><span>' + usd(b.high) + '</span></div>' +
      '<p class="small">The range is ×' + (1 / b.mult).toFixed(2) + ' to ×' + b.mult.toFixed(2) + ' around the estimate — the median leave-one-out miss the fit actually measured on this snapshot. Read the rank as the claim and the dollar figure as its order of magnitude.</p></div>';
  }

  function detailHtml(r) {
    var m = r.model;
    var comps = fit.categories.filter(function (c) { return c.category === (r.category || 'unclassified'); })[0];
    return '' +
      '<h2 class="dh">' + esc(r.name) + '</h2>' +
      '<div class="dsub">' + esc(r.slug) + ' · ' + esc(r.category || 'unclassified') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || 'chain n/a') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) + ' more' : '') + ' · tracked ' + age(r.age_days) + ' without a token</div>' +
      '<div class="big">' + usd(r.implied_value_usd) + '</div>' +
      '<div class="bigsub">implied value at rank ' + r.rank + ' of ' + D.board_size + ' of ' + D.board_size + ' priced protocols</div>' +
      bandBar(r) +
      '<h3>The arithmetic</h3>' +
      '<div class="wf">' +
        '<div class="lab">TVL, from the snapshot</div><div class="val">' + usd(r.tvl_usd) + '</div>' +
        '<div class="lab">Fitted multiple at this size' + (comps ? ' (' + esc(comps.category) + ', ' + comps.comps + ' comps)' : '') + '</div><div class="val">' + x(r.multiple) + '</div>' +
        '<div class="lab">size slope ' + fit.slope.toFixed(3) + ' per decade × category offset ' + (m.category_offset >= 0 ? '+' : '') + m.category_offset.toFixed(3) + '</div><div class="val">' + x(Math.exp(fit.intercept + fit.slope * Math.log10(r.tvl_usd) + m.category_offset)) + ' raw</div>' +
        '<div class="lab">7-day growth ' + (m.growth_pct >= 0 ? '+' : '') + m.growth_pct.toFixed(1) + '% → growth multiplier</div><div class="val">' + x(m.growth_multiplier) + '</div>' +
        '<div class="lab">patience: ' + age(m.age_days) + ' with no token → multiplier</div><div class="val">' + x(m.patience_multiplier) + '</div>' +
        '<div class="lab tot">TVL × multiple × growth × patience</div><div class="val tot">' + usd(r.implied_value_usd) + '</div>' +
      '</div>' +
      '<h3>Why this multiple</h3>' +
      '<div class="note">' + (comps && comps.comps >= 3
        ? 'The <b>' + esc(comps.category) + '</b> category carries <b>' + comps.comps + ' trading comps</b> with a median of <b>' + x(comps.median_multiple) + '</b> market cap per dollar of TVL, so its offset moves the market curve by ' +
          ((comps.offset >= 0 ? '+' : '') + Math.round((Math.exp(comps.offset) - 1) * 100) + '%') + '. ' +
          'At $100M of TVL the fit pays <b>' + x(comps.multiple_at_100m) + '</b> here; this protocol is ' + usd(r.tvl_usd) + ', so the size curve puts it at <b>' + x(r.multiple) + '</b>.'
        : comps
        ? 'Only <b>' + comps.comps + ' trading protocol' + (comps.comps === 1 ? '' : 's') + '</b> in the snapshot shares the <b>' + esc(comps.category) + '</b> category (median ' + x(comps.median_multiple) + '), which is too thin to move a price: the fit needs three comps before a category may shift the curve, so this row takes the market-wide size curve alone at <b>' + x(r.multiple) + '</b>.'
        : 'This protocol records no DefiLlama category, so it takes the market-wide size curve alone: <b>' + x(r.multiple) + '</b>.') +
        ' Nothing here is special-cased by name: every row runs the same function.</div>' +
      '<h3>The comps behind this multiple</h3>' +
      compsTable(r) +
      '<h3>What the farm is worth, net</h3>' +
      econTable(r) +
      '<h3>Farm it before the launch</h3>' +
      '<div class="planstrip"><span><b>$' + r.farm_capital_usd + '</b> capital</span><span><b>' + r.farm_days + ' days</b> hold</span>' +
      '<span><b>~$2/wk</b> gas</span><span><b>' + r.farm_steps.length + '</b> steps</span></div>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) {
        var p = stepParts(s);
        return '<li>' + esc(p.text) + '<span class="cost">cost: ' + esc(p.cost) + ' · time: ' + esc(p.time) + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="note"><b>Budget:</b> about $' + r.farm_cost_usd + ' of capital and ' + r.farm_days + ' days of holding, with roughly $2 a week of gas. ' +
      '<b>Exit:</b> unwind in the order the plan lists, and keep the log so a second position can reuse the wallet\'s history.</div>';
  }

  function openDetail(slug) {
    var r = rows.filter(function (x2) { return x2.slug === slug; })[0];
    if (!r) return;
    state.sel = slug;
    document.getElementById('detail').innerHTML = detailHtml(r);
    var d = document.getElementById('drawer');
    d.hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr'), function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === slug);
    });
  }

  // ---------- trading comps ----------
  function compsView() {
    var q = state.q.toLowerCase();
    var list = live.filter(function (p) { return !q || (p.name + ' ' + p.slug + ' ' + (p.category || '')).toLowerCase().indexOf(q) >= 0; });
    var html = '<h1>The other side of the board: <span>' + D.live_size + '</span> protocols whose token already trades.</h1>' +
      '<p class="lede">These are the comps. The fit reads each one\'s market cap against its TVL, so a protocol still waiting on a token can be priced from what the market pays today. ' +
      'They are kept out of the ranked board on purpose: a token that exists is not a launch to farm. The last column is what the same function would say about them, as a check a reader can run by eye.</p>' +
      '<div class="controls"><input id="q" type="search" placeholder="Search the comps" value="' + esc(state.q) + '"><span class="count"><b>' + list.length + '</b> trading protocols</span></div>' +
      '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th><th class="num">Model would say</th><th class="num">Model ÷ market</th></tr></thead><tbody>' +
      list.map(function (p, i) {
        var ratio = p.model_value && p.mcap_usd ? p.model_value / p.mcap_usd : null;
        return '<tr><td class="rank">' + (i + 1) + '</td>' +
          '<td><div class="nm">' + esc(p.name) + '</div><div class="slug">' + esc(p.symbol || p.slug) + '</div></td>' +
          '<td class="cat">' + esc(p.category || 'unclassified') + '</td>' +
          '<td class="num">' + usd(p.tvl_usd) + '</td>' +
          '<td class="num">' + usd(p.mcap_usd) + '</td>' +
          '<td class="num">' + x(p.multiple) + '</td>' +
          '<td class="num">' + usd(p.model_value) + '</td>' +
          '<td class="num">' + (ratio === null ? 'n/a' : '<span class="' + (ratio >= 0.5 && ratio <= 2 ? 'up' : ratio > 2 ? 'down' : 'flat') + '">' + x(ratio) + '</span>') + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<div class="foot">Market cap is DefiLlama\'s own record, truncated to whole dollars. A model ÷ market figure near 1× is the fit agreeing with the market; the spread of that column is the honest uncertainty of every row on the board.</div>';
    app.innerHTML = html;
  }

  // ---------- method ----------
  function methodView() {
    var cats5 = fit.categories.slice(0, 8);
    var html = '<h1>How a protocol with no token is <span>priced</span>.</h1>' +
      '<p class="lede">No name on this board is special-cased and no multiple is hardcoded. The model is fitted to the snapshot itself: the ' + fit.prior_comps + ' protocols in it whose token already trades say what the market pays per dollar of TVL, at their size and in their category, and every pre-token protocol inherits that curve.</p>' +
      '<div class="method">' +
      '<div>' +
        '<div class="card"><h2>How a value is built</h2>' +
        '<ol class="ladder">' +
          '<li><b>Size curve.</b> <code>multiple = exp(' + fit.intercept.toFixed(2) + ' + ' + fit.slope.toFixed(2) + ' · log10 TVL)</code> — ' +
            (fit.slope < 0 ? 'a dollar of TVL is paid less as a protocol grows' : 'a dollar of TVL is paid more as a protocol grows') + ', ' +
            x(Math.exp(Math.abs(fit.slope))) + ' per decade of TVL, fitted on <b>' + fit.prior_comps + '</b> trading protocols.</li>' +
          '<li><b>Category tilt.</b> <code>× exp(offset)</code>, where <code>offset = n · median(residual) / (n + ' + fit.model.shrink_k + ')</code> ' +
            'and <code>offset = 0</code> when a category holds fewer than <b>' + fit.model.min_category_comps + '</b> comps — ' +
            fit.categories.filter(function (c) { return c.comps >= fit.model.min_category_comps; }).length + ' of ' + fit.categories.length + ' categories clear that bar.</li>' +
          '<li><b>Seven-day growth.</b> <code>× (1 + clamp(7d, ' + fit.model.growth_floor + ', +' + fit.model.growth_cap + ')/100 · ' + fit.model.growth_weight + ')</code> — a protocol filling up is worth more, one draining is worth less.</li>' +
          '<li><b>Patience.</b> <code>× (' + fit.model.patience_floor + ' + min(age, ' + fit.model.patience_days + ')/' + fit.model.patience_days + ' · ' + (1 - fit.model.patience_floor).toFixed(2) + ')</code> — ' +
            'how long it has run recording no token.</li>' +
          '<li><b>Implied value.</b> <code>TVL × multiple × growth × patience</code>. Every row runs this same function; no protocol is named anywhere in it.</li>' +
        '</ol>' +
        '<p>The three inputs are the snapshot\'s own: <b>TVL</b> sets the size, the <b>seven-day change</b> tilts the multiple, and <b>how long the protocol has run with no token</b> tilts it again — a franchise that has survived five years without issuing one is worth more than one that appeared last month.</p>' +
        '<dl class="kv"><dt>a, intercept</dt><dd>' + fit.intercept.toFixed(4) + '</dd>' +
        '<dt>b, size slope</dt><dd>' + fit.slope.toFixed(4) + ' per decade of TVL</dd>' +
        '<dt>prior multiple</dt><dd>' + x(fit.prior_multiple) + ' (median across ' + fit.prior_comps + ' comps)</dd>' +
        '<dt>shrinkage k</dt><dd>' + fit.model.shrink_k + ' comps</dd>' +
        '<dt>min comps</dt><dd>' + fit.model.min_category_comps + ' per category, else the size curve alone</dd>' +
        '<dt>winsor bounds</dt><dd>' + fit.model.multiple_floor + '× to ' + fit.model.multiple_cap + '×</dd></dl></div>' +
        '<div class="card" style="margin-top:16px"><h2>The screen</h2>' +
        '<p>A protocol is on the board when the snapshot records <b>no market cap, no CoinGecko id and no symbol</b> for it, when it is not a wrapped, staked or bridged product of a token that trades ' +
        '(no Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking or Restaked BTC category; no whole word wrapped, staked or staking; no exchange name at the front; no version marker), ' +
        'and when its TVL is at least $' + (fit.model.min_tvl / 1e6) + 'M. That is the same screen the house applied to its watchlist, run at every size rather than at $' + (D.floor_usd / 1e6) + 'M and up — which is why ' + D.below_floor + ' rows sit below the floor.</p>' +
        '<p>Wording matters: a protocol <b>records no token</b>. DefiLlama\'s record is not proof that none exists, so the board never claims a protocol has none.</p></div>' +
      '</div>' +
      '<div>' +
        '<div class="card"><h2>The check: leave one out</h2>' +
        '<p>Every trading protocol is re-priced from the comps of the others — never itself — and the miss is measured. The same test is run for a blanket single multiple, the naive alternative.</p>' +
        '<dl class="kv">' +
        '<dt>protocols scored</dt><dd>' + chk.scored + '</dd>' +
        '<dt>median miss, this model</dt><dd>' + x(chk.model_median_miss) + '</dd>' +
        '<dt>median miss, blanket</dt><dd>' + x(chk.blanket_median_miss) + '</dd>' +
        '<dt>within 2×, this model</dt><dd>' + Math.round(chk.within_2x * 100) + '%</dd>' +
        '<dt>within 2×, blanket</dt><dd>' + Math.round(chk.within_2x_blanket * 100) + '%</dd>' +
        '<dt>rank correlation</dt><dd>' + chk.rank_ic.toFixed(3) + '</dd>' +
        (chk.best ? '<dt>closest call</dt><dd>' + esc(chk.best.name) + ' at ' + usd(chk.best.actual) + ', priced ' + usd(chk.best.predicted) + '</dd>' : '') +
        (chk.worst ? '<dt>furthest</dt><dd>' + esc(chk.worst.name) + ' at ' + usd(chk.worst.actual) + ', priced ' + usd(chk.worst.predicted) + '</dd>' : '') +
        '</dl>' +
        '<p class="small" style="margin-top:10px">A ' + x(chk.model_median_miss) + ' median miss is the honest width of every number on the board: the rank order is the claim, not the dollar figure. Read a row as "roughly this size of launch", and read the plan as the part you control.</p></div>' +
        '<div class="card" style="margin-top:16px"><h2>The check in the direction time runs</h2>' +
        '<p>Leave-one-out hides the protocol it prices but keeps the period. So there is a second test: split the comps at <b>' + esc(ts.split_at || '') + '</b>, fit the ' + ts.old_n + ' tracked longer, and price the ' + ts.new_n + ' tracked since — protocols that did not exist when the first half was fitted.</p>' +
        '<dl class="kv">' +
        '<dt>older → newer</dt><dd>' + x(ts.old_to_new_miss) + ' median miss, ' + Math.round((ts.old_to_new_within_2x || 0) * 100) + '% within 2×</dd>' +
        '<dt>newer → older</dt><dd>' + x(ts.new_to_old_miss) + ' median miss, ' + Math.round((ts.new_to_old_within_2x || 0) * 100) + '% within 2×</dd>' +
        '<dt>combined</dt><dd>' + x(ts.combined_miss) + ', against ' + x(chk.model_median_miss) + ' leave-one-out</dd>' +
        '</dl>' +
        '<p class="small" style="margin-top:10px">Both directions are run so neither half of the history is privileged. The forward test is the honest one for a radar: it prices protocols from a curve that had never seen their period.</p></div>' +
        '<div class="card" style="margin-top:16px"><h2>What the farm economics assume</h2>' +
        '<p>A verdict is worth nothing if its assumptions are hidden, so they are on the page:</p>' +
        '<dl class="kv">' +
        '<dt>capture</dt><dd>' + D.farm_assumptions.capture + ' of the implied value, one farmed wallet\'s share</dd>' +
        '<dt>gas</dt><dd>$' + D.farm_assumptions.gas_setup + ' in, $' + D.farm_assumptions.gas_exit + ' out</dd>' +
        '<dt>carry</dt><dd>' + (D.farm_assumptions.carry_apr * 100) + '% a year on the deposit, the yield it gives up</dd>' +
        '<dt>farm</dt><dd>net of at least $' + D.farm_assumptions.min_net + ' for one wallet</dd>' +
        '<dt>thin</dt><dd>net between $0 and $' + D.farm_assumptions.min_net + '</dd>' +
        '<dt>skip</dt><dd>the plan costs more than it expects: ' + D.farm_counts.skip + ' of ' + D.board_size + ' rows</dd>' +
        '</dl>' +
        '<p class="small" style="margin-top:10px">Change the capture and the verdicts move; that is the point of stating it. A reader who thinks one wallet captures a tenth of this gets ' + D.farm_counts.farm + ' farm rows; one who thinks it captures ten times more gets more.</p></div>' +
        '<div class="card" style="margin-top:16px"><h2>What the fit pays by category</h2>' +
        '<table><thead><tr><th>Category</th><th class="num">Comps</th><th class="num">Median</th><th class="num">At $100M TVL</th></tr></thead><tbody>' +
        cats5.map(function (c) { return '<tr><td class="cat">' + esc(c.category) + '</td><td class="num">' + c.comps + '</td><td class="num">' + x(c.median_multiple) + '</td><td class="num">' + x(c.multiple_at_100m) + '</td></tr>'; }).join('') +
        '</tbody></table><p class="small" style="margin-top:10px">A category with four comps is weak evidence, so its offset is shrunk toward the market\'s: the fit leans on the size curve where the category has little to say.</p></div>' +
      '</div></div>' +
      '<div class="foot">Source: ' + esc(D.source) + '. Every figure on this page is computed from that one sealed snapshot by main.ts and written to data.js; the page itself fetches nothing.</div>';
    app.innerHTML = html;
  }

  // ---------- router ----------
  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === state.tab);
    });
    if (state.tab === 'board') boardView();
    else if (state.tab === 'comps') compsView();
    else methodView();
    var d = document.getElementById('drawer');
    if (state.sel) d.hidden = false;
    window.scrollTo(0, 0);
  }

  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.tab = b.getAttribute('data-tab');
    state.sel = null;
    document.getElementById('drawer').hidden = true;
    render();
  });

  app.addEventListener('click', function (e) {
    var th = e.target.closest('th');
    if (th && th.getAttribute('data-sort')) {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      boardView();
      return;
    }
    var tr = e.target.closest('tbody tr');
    if (tr && tr.getAttribute('data-slug')) openDetail(tr.getAttribute('data-slug'));
  });

  app.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'q') { state.q = e.target.value; var t = e.target; var pos = t.selectionStart; render(); var n = document.getElementById('q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
    else if (id === 'cat') { state.cat = e.target.value; boardView(); }
    else if (id === 'chain') { state.chain = e.target.value; boardView(); }
    else if (id === 'verdict') { state.verdict = e.target.value; boardView(); }
    else if (id === 'watch') { state.watch = e.target.checked; boardView(); }
  });

  document.getElementById('close').addEventListener('click', function () {
    document.getElementById('drawer').hidden = true;
    state.sel = null;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { document.getElementById('drawer').hidden = true; state.sel = null; }
  });

  render();
})();
