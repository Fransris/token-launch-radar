// Token Launch Radar — the page. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail view with the
// model's own arithmetic and the protocol's farm plan, the trading comps the fit was read from, and
// the method. No network: every byte it shows is in data.js.
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  if (!D) { app.textContent = 'No data: data.js is missing beside the page.'; return; }

  var fit = D.fit, chk = fit.check, rows = D.rows, live = D.live;
  var maxImp = rows.length ? rows[0].implied_value_usd : 1;
  var state = { tab: 'board', q: '', cat: 'all', chain: 'all', watch: false, sort: 'implied', dir: -1, sel: null };

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
      ['chg', '7d'], ['age', 'No token for'], ['mult', 'Fitted multiple'], ['implied', 'Implied value']
    ];
    return h.map(function (c) {
      var on = state.sort === c[0] ? ' style="color:#e9eff7"' : '';
      return '<th class="' + (c[0] === 'tvl' || c[0] === 'chg' || c[0] === 'implied' ? 'num' : '') + '" data-sort="' + c[0] + '"' + on + '>' + c[1] + (state.sort === c[0] ? (state.dir < 0 ? ' ↓' : ' ↑') : '') + '</th>';
    }).join('');
  }

  function boardView() {
    var list = visible();
    var html = '' +
      '<h1>Every protocol that records <span>no token</span>, priced by what the market already pays.</h1>' +
      '<p class="lede">The board is read off the sealed snapshot of <b>' + D.protocols_total + ' protocols</b> DefiLlama tracks. ' +
      '<b>' + D.pre_token_total + '</b> record no token at all; <b>' + D.board_size + '</b> of them are protocols rather than a wrapped, staked or bridged product of one that trades, and each is priced ' +
      'from the market cap per dollar of TVL that <b>' + fit.prior_comps + ' trading protocols</b> in the same snapshot already carry, at the protocol\'s own size and in its own category. ' +
      'The house watchlist of <b>' + D.watchlist_size + '</b> is the floor of this board, not its ceiling: ' + D.below_floor + ' rows sit below it.</p>' +
      '<div class="stats">' +
        '<div class="stat amber"><div class="k">Implied value on the board</div><div class="v">' + usd(D.implied_total_usd) + '</div><div class="s">sum of all ' + D.board_size + ' priced protocols</div></div>' +
        '<div class="stat cyan"><div class="k">Comps the fit reads</div><div class="v">' + fit.prior_comps + '</div><div class="s">trading protocols with a market cap, prior ' + x(fit.prior_multiple) + '</div></div>' +
        '<div class="stat green"><div class="k">Leave-one-out miss</div><div class="v">' + x(chk.model_median_miss) + '</div><div class="s">median, vs ' + x(chk.blanket_median_miss) + ' for one blanket multiple</div></div>' +
        '<div class="stat violet"><div class="k">Priced within 2×</div><div class="v">' + Math.round(chk.within_2x * 100) + '%</div><div class="s">of ' + chk.scored + ' trading protocols, rank IC ' + chk.rank_ic.toFixed(2) + '</div></div>' +
      '</div>' +
      '<div class="controls">' +
        '<input id="q" type="search" placeholder="Search protocol, slug or category" value="' + esc(state.q) + '">' +
        '<select id="cat"><option value="all">Every category</option>' + catList.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + ' (' + cats[c] + ')</option>'; }).join('') + '</select>' +
        '<select id="chain"><option value="all">Every chain</option>' + chainList.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + ' (' + chains[c] + ')</option>'; }).join('') + '</select>' +
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

  function detailHtml(r) {
    var m = r.model;
    var band = Math.exp(Math.log(chk.model_median_miss));
    var comps = fit.categories.filter(function (c) { return c.category === (r.category || 'unclassified'); })[0];
    return '' +
      '<h2 class="dh">' + esc(r.name) + '</h2>' +
      '<div class="dsub">' + esc(r.slug) + ' · ' + esc(r.category || 'unclassified') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || 'chain n/a') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) + ' more' : '') + ' · tracked ' + age(r.age_days) + ' without a token</div>' +
      '<div class="big">' + usd(r.implied_value_usd) + '</div>' +
      '<div class="bigsub">implied value at rank ' + r.rank + ' of ' + D.board_size + ' · a miss band of ×' + (1 / band).toFixed(2) + ' to ×' + band.toFixed(2) + ', the fit\'s median leave-one-out error</div>' +
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
      '<div class="note">' + (comps
        ? 'The <b>' + esc(comps.category) + '</b> category carries <b>' + comps.comps + ' trading comps</b> with a median of <b>' + x(comps.median_multiple) + '</b> market cap per dollar of TVL. ' +
          'Across the whole market the fit pays <b>' + x(comps.multiple_at_100m) + '</b> at $100M of TVL; this protocol is ' + usd(r.tvl_usd) + ', so the size curve puts it at <b>' + x(r.multiple) + '</b>.'
        : 'This protocol records no DefiLlama category, so it takes the market-wide size curve alone: <b>' + x(r.multiple) + '</b>.') +
        ' Nothing here is special-cased by name: every row runs the same function.</div>' +
      '<h3>Farm it before the launch</h3>' +
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
        '<div class="card"><h2>The model</h2>' +
        '<pre><em>y</em> = ln(mcap / tvl), winsorized to [0.01, 20]\n<em>x</em> = log10(tvl)\n\n<em>y</em> = a + b·<em>x</em> + offset(category)      <i># fitted on the comps</i>\n\noffset(c) = n·median(residual) / (n + 6)   <i># shrunk to the market</i>\n\nmultiple(p) = exp(a + b·log10(tvl) + offset(cat))\n\nimplied = tvl · multiple\n          · (1 + clamp(7d, -60, +150)/100 · 0.30)\n          · (0.85 + min(age, 1825)/1825 · 0.15)</pre>' +
        '<p>The three inputs are the snapshot\'s own: <b>TVL</b> sets the size, the <b>seven-day change</b> tilts the multiple, and <b>how long the protocol has run with no token</b> tilts it again — a franchise that has survived five years without issuing one is worth more than one that appeared last month.</p>' +
        '<dl class="kv"><dt>a, intercept</dt><dd>' + fit.intercept.toFixed(4) + '</dd>' +
        '<dt>b, size slope</dt><dd>' + fit.slope.toFixed(4) + ' per decade of TVL</dd>' +
        '<dt>prior multiple</dt><dd>' + x(fit.prior_multiple) + ' (median across ' + fit.prior_comps + ' comps)</dd>' +
        '<dt>shrinkage k</dt><dd>' + fit.model.shrink_k + ' comps</dd>' +
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
