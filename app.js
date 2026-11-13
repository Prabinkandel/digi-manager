'use strict';
/* Digi Manager — Digi Nepal. Data lives in localStorage on this device and,
   when signed in, syncs to the user's own Supabase cloud database. */
var LS_KEY = 'digiManagerV1';

/* ---------- cloud config ---------- */
var SUPABASE_URL = 'https://ysbeddnvxsunkvibiggu.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzYmVkZG52eHN1bmt2aWJpZ2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1MzE4ODUsImV4cCI6MjExMDEwNzg4NX0.My8n9lCrsWNR1rQ2mdDOyDVZcASXYU-d9_X1g1VOw2E';
var sb = null, cloudUser = null, pushTimer = null, lastPullAt = 0;
try {
  if (window.supabase && SUPABASE_URL.indexOf('YOUR-PROJECT') === -1) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) { sb = null; }

var SERVICES = [
  { name: 'Netflix 4K', price: 350 },
  { name: 'Prime Video', price: 99 },
  { name: 'CapCut Pro (1 Device)', price: 250 },
  { name: 'CapCut Pro (2 Devices PC)', price: 375 },
  { name: 'Gemini AI Pro', price: 350 },
  { name: 'ChatGPT Plus', price: 0 },
  { name: 'Spotify Premium', price: 0 },
  { name: 'Canva Pro', price: 400 },
  { name: 'YouTube Premium', price: 0 },
  { name: 'Disney+', price: 0 },
  { name: 'Other', price: 0 }
];
var PAYMENTS = ['eSewa', 'Khalti', 'Bank', 'Cash', 'Other'];
var USED_FOR = ['Gemini', 'ChatGPT', 'Netflix', 'OTP', 'Business', 'Personal', 'Other'];
var SPEND_CATS = ['Account Purchase', 'Renewal', 'Ads', 'Other'];
var PLANS = ['1 Month', '3 Months', '6 Months', '1 Year', '1 Device', '2 Devices'];

/* ---------- storage ---------- */
function blankData() { return { pinHash: '', accounts: [], emails: [], customers: [], sales: [], spends: [] }; }
function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return blankData();
    var d = JSON.parse(raw);
    var b = blankData();
    b.pinHash = d.pinHash || '';
    ['accounts', 'emails', 'customers', 'sales', 'spends'].forEach(function (k) { if (Array.isArray(d[k])) b[k] = d[k]; });
    return b;
  } catch (e) { return blankData(); }
}
var DB = load();
function save() { localStorage.setItem(LS_KEY, JSON.stringify(DB)); schedulePush(); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function hashPin(pin) { var h = 5381; for (var i = 0; i < pin.length; i++) { h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0; } return 'h' + h.toString(36); }

/* ---------- helpers ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(n) { n = parseFloat(n) || 0; return 'Rs ' + n.toLocaleString('en-IN'); }
function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function parseDate(s) { if (!s) return null; var p = s.split('-'); if (p.length !== 3) return null; var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setHours(0, 0, 0, 0); return isNaN(d.getTime()) ? null : d; }
function daysLeft(s) { var d = parseDate(s); if (!d) return null; return Math.round((d - today()) / 86400000); }
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function plusDays(s, n) { var d = parseDate(s) || today(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(s) { var d = parseDate(s); if (!d) return '—'; return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
function inMonth(s) { var d = parseDate(s); if (!d) return false; var t = new Date(); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth(); }
function inWeek(s) { var d = parseDate(s); if (!d) return false; var diff = Math.round((today() - d) / 86400000); return diff >= 0 && diff < 7; }
function inToday(s) { return s === todayStr(); }

function badge(days) {
  if (days === null) return '<span class="badge ok">No date</span>';
  if (days < 0) return '<span class="badge bad">Expired</span>';
  if (days === 0) return '<span class="badge bad">Ends today</span>';
  if (days === 1) return '<span class="badge bad">1 day left</span>';
  if (days <= 3) return '<span class="badge urgent">' + days + ' days left</span>';
  if (days <= 7) return '<span class="badge warn">' + days + ' days left</span>';
  return '<span class="badge ok">' + days + ' days left</span>';
}
function leftClass(days) {
  if (days === null) return '';
  if (days <= 1) return 'left-red';
  if (days <= 3) return 'left-orange';
  if (days <= 7) return 'left-yellow';
  return 'left-green';
}
var toastTimer = null;
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2200);
}
var revealed = {};
function pwHtml(kind, id, pw) {
  if (!pw) return '<span class="sub">No password saved</span>';
  if (revealed[kind + id]) return '<span class="pw">' + esc(pw) + '</span> <button type="button" class="reveal" data-reveal="' + kind + ':' + id + '">Hide</button>';
  return '<span class="pw">••••••••</span> <button type="button" class="reveal" data-reveal="' + kind + ':' + id + '">Show</button>';
}
function accountLabel(a) { return a.service + ' — ' + a.login + (a.profile ? ' (' + a.profile + ')' : ''); }
function assignedCount(accountId) { return DB.customers.filter(function (c) { return c.accountId === accountId; }).length; }
function profilesOf(accountId) {
   var seen = {}, out = [];
   DB.customers.forEach(function (c) {
      if (c.accountId !=== accountId) return;
      var p = (c.profile || '').trim();
      if (!p) return;
      var k = p.toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(p); }
   });
   return out;
}
function renderSlots() {
   var el = $('slots-board'); if (!el) return;
   if (!DB.accounts.length) { el.innerHTML = '<div class="empty">No accounts yet.</div>'; return; }
   el.innerHTML = DB.accounts.map(function (a) {
      var total = parseInt(a.slots, 10) || 0;
      var profs = profilesOf(a.id);
      var used = profs.length, free = Math.max(0, total - used);
      var status = total === 0 ? '' : (free === 0 ? '<b style="color:var(--red)">FULLY PACKED</b>' : '<b style="color:var(--green)">' + free + ' remaining</b>');
      var boxes = '';
      for (var i = 0; i < total; i++) {
         boxes += i < used ? '<span class="slot filled">' + esc(profs[i]) + '</span>' : '<span class="slot free">Free</span>';
      }
      for (var j = total; j < used; j++) boxes += '<span class="slot filled">' + esc(profs[j]) + '</span>';
      return '<div class="card"><div class="top"><div><div class="svc">' + esc(a.service) + '</div><div class="sub">' + esc(a.login) + '</div></div><div>' + status + '</div></div>' +
           '<div class="slots">' + boxes + '</div>' +
         '<div class="meta">Profiles: <b>' + used + ' used</b> of ' + total + '</div></div>';
   }).join('');
}

/* ---------- PIN lock ---------- */
var pinBuf = '', pinStage = 'enter', pinFirst = '';
function pinMsg(t) { $('lock-msg').textContent = t; }
function drawDots() {
  var dots = $('pin-dots').children;
  for (var i = 0; i < dots.length; i++) dots[i].className = i < pinBuf.length ? 'fill' : '';
}
function shake() { var b = document.querySelector('.lock-box'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
function initLock() {
  if (!DB.pinHash) { pinStage = 'set1'; pinMsg('Set your 4-digit PIN'); }
  else { pinStage = 'enter'; pinMsg('Enter your PIN'); }
  pinBuf = ''; pinFirst = ''; drawDots();
}
function unlock() { $('lock').classList.add('hidden'); $('app').classList.remove('hidden'); renderAll(); afterUnlock(); }
function pinDone(pin) {
  if (pinStage === 'set1') { pinFirst = pin; pinStage = 'set2'; pinMsg('Enter the PIN again to confirm'); }
  else if (pinStage === 'set2') {
    if (pin === pinFirst) { DB.pinHash = hashPin(pin); save(); toast('PIN set ✓'); unlock(); }
    else { shake(); pinStage = 'set1'; pinFirst = ''; pinMsg('PINs did not match — set your PIN again'); }
  } else if (pinStage === 'enter') {
    if (hashPin(pin) === DB.pinHash) unlock();
    else { shake(); pinMsg('Wrong PIN — try again'); }
  } else if (pinStage === 'chg-verify') {
    if (hashPin(pin) === DB.pinHash) { pinStage = 'chg-new'; pinMsg('Enter your NEW 4-digit PIN'); }
    else { shake(); pinMsg('Wrong current PIN — try again'); }
  } else if (pinStage === 'chg-new') { pinFirst = pin; pinStage = 'chg-confirm'; pinMsg('Enter the NEW PIN again'); }
  else if (pinStage === 'chg-confirm') {
    if (pin === pinFirst) { DB.pinHash = hashPin(pin); save(); $('lock').classList.add('hidden'); toast('PIN changed ✓'); }
    else { shake(); pinStage = 'chg-new'; pinFirst = ''; pinMsg('PINs did not match — enter NEW PIN again'); }
  }
  pinBuf = ''; drawDots();
}
$('pin-pad').addEventListener('click', function (e) {
  var btn = e.target.closest('button'); if (!btn) return;
  var k = btn.getAttribute('data-k');
  if (k === 'c') pinBuf = '';
  else if (k === 'b') pinBuf = pinBuf.slice(0, -1);
  else if (pinBuf.length < 4) pinBuf += k;
  drawDots();
  if (pinBuf.length === 4) setTimeout(function () { pinDone(pinBuf); }, 120);
});

/* ---------- navigation ---------- */
var currentTab = 'home';
function show(tab) {
  currentTab = tab;
  ['home', 'accounts', 'emails', 'customers', 'money', 'settings'].forEach(function (v) {
    $('view-' + v).classList.toggle('hidden', v !== tab);
  });
  var btns = $('tabbar').querySelectorAll('button');
  btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
  window.scrollTo(0, 0);
}
$('tabbar').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  show(b.getAttribute('data-tab'));
});
$('btn-settings').addEventListener('click', function () { show('settings'); });
$('btn-back').addEventListener('click', function () { show('home'); });

/* ---------- rendering: home ---------- */
function renderHome() {
  var items = [];
  DB.customers.forEach(function (c) {
    var dl = daysLeft(c.end);
    if (dl !== null && dl <= 7) items.push({ kind: 'Customer', name: c.name, svc: c.service, end: c.end, dl: dl, wa: c.whatsapp, plan: c.plan });
  });
  DB.accounts.forEach(function (a) {
    var dl = daysLeft(a.expiry);
    if (dl !== null && dl <= 7) items.push({ kind: 'Account', name: a.service, svc: a.login, end: a.expiry, dl: dl, wa: '', plan: '' });
  });
  items.sort(function (x, y) { return x.dl - y.dl; });
  if (!items.length) {
    $('expiring-list').innerHTML = '<div class="empty">✅ Nothing expiring in the next 7 days</div>';
  } else {
    $('expiring-list').innerHTML = items.map(function (it) {
      var waBtn = '';
      if (it.kind === 'Customer' && it.wa) {
        var msg = encodeURIComponent('Namaste ' + it.name + ', your ' + it.svc + (it.plan ? ' (' + it.plan + ')' : '') + ' from Digi Nepal expires on ' + fmtDate(it.end) + '. Please renew in time so your service does not stop. Thank you! — Digi Nepal');
        waBtn = '<div class="actions"><a class="mini-btn wa" style="text-decoration:none;color:#fff" href="https://wa.me/' + waNum(it.wa) + '?text=' + msg + '" target="_blank" rel="noopener">💬 WhatsApp Renewal</a></div>';
      }
      return '<div class="card ' + leftClass(it.dl) + '"><div class="top"><div><div class="svc">' + esc(it.name) + '</div><div class="sub">' + it.kind + ' · ' + esc(it.svc) + '</div></div>' + badge(it.dl) + '</div><div class="meta">Ends: <b>' + fmtDate(it.end) + '</b></div>' + waBtn + '</div>';
    }).join('');
  }
  var active = DB.customers.filter(function (c) { var d = daysLeft(c.end); return d !== null && d >= 0; }).length;
  var expired = DB.customers.filter(function (c) { var d = daysLeft(c.end); return d !== null && d < 0; }).length;
  var freeSlots = DB.accounts.reduce(function (sum, a) { return sum + Math.max(0, (parseInt(a.slots, 10) || 0) - assignedCount(a.id)); }, 0);
  var incomeM = DB.sales.filter(function (s) { return inMonth(s.date); }).reduce(function (s, x) { return s + (parseFloat(x.amount) || 0); }, 0);
  var spendM = DB.spends.filter(function (s) { return inMonth(s.date); }).reduce(function (s, x) { return s + (parseFloat(x.amount) || 0); }, 0);
  var stats = [
    { n: active, l: 'Active Customers', c: 'green' },
    { n: items.length, l: 'Expiring This Week', c: 'yellow' },
    { n: expired, l: 'Expired', c: 'red' },
    { n: freeSlots, l: 'Free Slots', c: '' },
    { n: num(incomeM), l: 'Income This Month', c: 'green' },
    { n: num(incomeM - spendM), l: 'Profit This Month', c: incomeM - spendM >= 0 ? 'green' : 'red' }
  ];
  $('stats').innerHTML = stats.map(function (s) { return '<div class="stat"><div class="num ' + s.c + '">' + s.n + '</div><div class="lbl">' + s.l + '</div></div>'; }).join('');
   renderSlots();
}
function waNum(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && d.charAt(0) === '9') d = '977' + d;
  return d;
}

/* ---------- rendering: accounts ---------- */
function renderAccounts() {
  var q = ($('search-accounts').value || '').toLowerCase();
  var list = DB.accounts.filter(function (a) {
    return !q || (a.service + ' ' + a.login + ' ' + a.supplier + ' ' + (a.profile || '')).toLowerCase().indexOf(q) >= 0;
  });
  if (!list.length) { $('accounts-list').innerHTML = '<div class="empty">' + (DB.accounts.length ? 'No match found.' : 'No accounts yet.<br>Tap + Add to save the first account you bought.') + '</div>'; return; }
  $('accounts-list').innerHTML = list.map(function (a) {
    var dl = daysLeft(a.expiry);
    var used = profilesOf(a.id).length, total = parseInt(a.slots, 10) || 0;
    return '<div class="card ' + leftClass(dl) + '"><div class="top"><div><div class="svc">' + esc(a.service) + '</div><div class="sub">' + esc(a.login) + '</div></div>' + badge(dl) + '</div>' +
      '<div class="meta">Password: ' + pwHtml('a', a.id, a.password) + '<br>' +
      (a.profile ? 'Profile / PIN: <b>' + esc(a.profile) + '</b><br>' : '') +
      'Bought: <b>' + fmtDate(a.purchase) + '</b> · Expires: <b>' + fmtDate(a.expiry) + '</b><br>' +
      'Cost: <b>' + num(a.cost) + '</b>' + (a.supplier ? ' · Supplier: <b>' + esc(a.supplier) + '</b>' : '') + '<br>' +
      'Profiles: <b>' + used + ' used / ' + Math.max(0, total - used) + ' free</b> of ' + total + '</div>' +
      '<div class="actions"><button class="mini-btn" data-edit="account:' + a.id + '">✏️ Edit</button><button class="mini-btn del" data-del="account:' + a.id + '">Delete</button></div></div>';
  }).join('');
}

/* ---------- rendering: emails ---------- */
var emailFilter = 'All';
$('email-filter').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  emailFilter = b.getAttribute('data-f');
  $('email-filter').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c === b); });
  renderEmails();
});
function renderEmails() {
  var q = ($('search-emails').value || '').toLowerCase();
  var list = DB.emails.filter(function (em) {
    var okF = emailFilter === 'All' || em.type === emailFilter;
    var okQ = !q || (em.email + ' ' + em.usedFor + ' ' + (em.note || '')).toLowerCase().indexOf(q) >= 0;
    return okF && okQ;
  });
  if (!list.length) { $('emails-list').innerHTML = '<div class="empty">' + (DB.emails.length ? 'No match found.' : 'No emails yet.<br>Tap + Add to save a Gmail or Outlook.') + '</div>'; return; }
  $('emails-list').innerHTML = list.map(function (em) {
    return '<div class="card"><div class="top"><div><div class="svc">' + esc(em.email) + '</div><div class="sub">' + esc(em.type) + ' · For: ' + esc(em.usedFor) + '</div></div></div>' +
      '<div class="meta">Password: ' + pwHtml('e', em.id, em.password) +
      (em.note ? '<br>Note: ' + esc(em.note) : '') + '</div>' +
      '<div class="actions"><button class="mini-btn" data-edit="email:' + em.id + '">✏️ Edit</button><button class="mini-btn del" data-del="email:' + em.id + '">Delete</button></div></div>';
  }).join('');
}

/* ---------- rendering: customers ---------- */
function renderCustomers() {
  var q = ($('search-customers').value || '').toLowerCase();
  var list = DB.customers.slice().sort(function (a, b) {
    var da = daysLeft(a.end), db = daysLeft(b.end);
    return (da === null ? 9999 : da) - (db === null ? 9999 : db);
  }).filter(function (c) {
    return !q || (c.name + ' ' + c.service + ' ' + (c.whatsapp || '') + ' ' + (c.plan || '')).toLowerCase().indexOf(q) >= 0;
  });
  if (!list.length) { $('customers-list').innerHTML = '<div class="empty">' + (DB.customers.length ? 'No match found.' : 'No customers yet.<br>Tap + Add when you sell a subscription.') + '</div>'; return; }
  $('customers-list').innerHTML = list.map(function (c) {
    var dl = daysLeft(c.end);
    var acct = DB.accounts.find(function (a) { return a.id === c.accountId; });
    var acctTxt = acct ? accountLabel(acct) : (c.profile || '');
    var waBtn = '';
    if (c.whatsapp) {
      var msg = encodeURIComponent('Namaste ' + c.name + ', your ' + c.service + (c.plan ? ' (' + c.plan + ')' : '') + ' from Digi Nepal expires on ' + fmtDate(c.end) + '. Please renew in time so your service does not stop. Thank you! — Digi Nepal');
      waBtn = '<a class="mini-btn wa" style="text-decoration:none;color:#fff" href="https://wa.me/' + waNum(c.whatsapp) + '?text=' + msg + '" target="_blank" rel="noopener">💬 Renewal</a>';
    }
    return '<div class="card ' + leftClass(dl) + '"><div class="top"><div><div class="svc">' + esc(c.name) + '</div><div class="sub">' + esc(c.service) + (c.plan ? ' · ' + esc(c.plan) : '') + '</div></div>' + badge(dl) + '</div>' +
      '<div class="meta">' +
      (c.whatsapp ? 'WhatsApp: <b>' + esc(c.whatsapp) + '</b><br>' : '') +
      (acctTxt ? 'Account: <b>' + esc(acctTxt) + '</b><br>' : '') +
      (c.profile && acct ? 'Profile: <b>' + esc(c.profile) + '</b><br>' : '') +
      'Start: <b>' + fmtDate(c.start) + '</b> · End: <b>' + fmtDate(c.end) + '</b><br>' +
      'Paid: <b>' + num(c.amount) + '</b>' + (c.payment ? ' · ' + esc(c.payment) : '') + '</div>' +
      '<div class="actions">' + waBtn + '<button class="mini-btn" data-edit="customer:' + c.id + '">✏️ Edit</button><button class="mini-btn del" data-del="customer:' + c.id + '">Delete</button></div></div>';
  }).join('');
}

/* ---------- rendering: money ---------- */
function sumWhere(arr, fn) { return arr.filter(fn).reduce(function (s, x) { return s + (parseFloat(x.amount) || 0); }, 0); }
function renderMoney() {
  var sT = sumWhere(DB.sales, function (s) { return inToday(s.date); });
  var sW = sumWhere(DB.sales, function (s) { return inWeek(s.date); });
  var sM = sumWhere(DB.sales, function (s) { return inMonth(s.date); });
  var xT = sumWhere(DB.spends, function (s) { return inToday(s.date); });
  var xM = sumWhere(DB.spends, function (s) { return inMonth(s.date); });
  var stats = [
    { n: num(sT), l: 'Sales Today', c: 'green' },
    { n: num(sW), l: 'Sales This Week', c: 'green' },
    { n: num(sM), l: 'Sales This Month', c: 'green' },
    { n: num(xT), l: 'Spends Today', c: 'red' },
    { n: num(xM), l: 'Spends This Month', c: 'red' },
    { n: num(sM - xM), l: 'Profit This Month', c: sM - xM >= 0 ? 'green' : 'red' }
  ];
  $('money-stats').innerHTML = stats.map(function (s) { return '<div class="stat"><div class="num ' + s.c + '">' + s.n + '</div><div class="lbl">' + s.l + '</div></div>'; }).join('');

  var sales = DB.sales.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  $('sales-list').innerHTML = sales.length ? sales.map(function (s) {
    return '<div class="card"><div class="money-row"><div><div class="svc">' + esc(s.product) + '</div><div class="sub">' + esc(s.customer || '') + (s.plan ? ' · ' + esc(s.plan) : '') + ' · ' + fmtDate(s.date) + (s.payment ? ' · ' + esc(s.payment) : '') + '</div></div><div class="amt-in">+' + num(s.amount) + '</div></div>' +
      '<div class="actions"><button class="mini-btn" data-edit="sale:' + s.id + '">✏️ Edit</button><button class="mini-btn del" data-del="sale:' + s.id + '">Delete</button></div></div>';
  }).join('') : '<div class="empty">No sales yet.</div>';

  var spends = DB.spends.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  $('spends-list').innerHTML = spends.length ? spends.map(function (s) {
    return '<div class="card"><div class="money-row"><div><div class="svc">' + esc(s.item) + '</div><div class="sub">' + esc(s.category || '') + (s.supplier ? ' · ' + esc(s.supplier) : '') + ' · ' + fmtDate(s.date) + '</div></div><div class="amt-out">−' + num(s.amount) + '</div></div>' +
      '<div class="actions"><button class="mini-btn" data-edit="spend:' + s.id + '">✏️ Edit</button><button class="mini-btn del" data-del="spend:' + s.id + '">Delete</button></div></div>';
  }).join('') : '<div class="empty">No spends yet.</div>';

  var byProd = {};
  DB.sales.filter(function (s) { return inMonth(s.date); }).forEach(function (s) {
    var k = s.product || 'Other'; byProd[k] = byProd[k] || { sales: 0, spends: 0 }; byProd[k].sales += parseFloat(s.amount) || 0;
  });
  DB.spends.filter(function (s) { return inMonth(s.date); }).forEach(function (s) {
    var k = s.product || 'Other spends'; byProd[k] = byProd[k] || { sales: 0, spends: 0 }; byProd[k].spends += parseFloat(s.amount) || 0;
  });
  var keys = Object.keys(byProd);
  $('profit-list').innerHTML = keys.length ? keys.map(function (k) {
    var p = byProd[k].sales - byProd[k].spends;
    return '<div class="card"><div class="money-row"><div><div class="svc">' + esc(k) + '</div><div class="sub">Sales ' + num(byProd[k].sales) + ' · Spends ' + num(byProd[k].spends) + '</div></div><div class="' + (p >= 0 ? 'amt-in' : 'amt-out') + '">' + num(p) + '</div></div></div>';
  }).join('') : '<div class="empty">No money activity this month yet.</div>';
}

function renderAll() { renderHome(); renderAccounts(); renderEmails(); renderCustomers(); renderMoney(); }

/* ---------- global click: reveal / edit / delete ---------- */
document.addEventListener('click', function (e) {
  var rv = e.target.closest('[data-reveal]');
  if (rv) { var key = rv.getAttribute('data-reveal'); revealed[key] = !revealed[key]; renderAll(); return; }
  var ed = e.target.closest('[data-edit]');
  if (ed) { var p1 = ed.getAttribute('data-edit').split(':'); openSheet(p1[0], p1[1]); return; }
  var del = e.target.closest('[data-del]');
  if (del) { var p2 = del.getAttribute('data-del').split(':'); deleteRecord(p2[0], p2[1]); return; }
  var add = e.target.closest('[data-add]');
  if (add) { openSheet(add.getAttribute('data-add'), null); return; }
});
['search-accounts', 'search-emails', 'search-customers'].forEach(function (id) {
  $(id).addEventListener('input', renderAll);
});

function deleteRecord(kind, id) {
  var map = { account: 'accounts', email: 'emails', customer: 'customers', sale: 'sales', spend: 'spends' };
  var arr = DB[map[kind]]; if (!arr) return;
  if (!confirm('Delete this record? This cannot be undone.')) return;
  DB[map[kind]] = arr.filter(function (x) { return x.id !== id; });
  if (kind === 'account') { /* keep auto spend as history */ }
  save(); renderAll(); toast('Deleted');
}

/* ---------- form sheet ---------- */
var sheetKind = null, sheetId = null;
function fieldHtml(f) {
  var v = f.value == null ? '' : f.value;
  var req = f.required ? ' required' : '';
  var inner = '';
  if (f.type === 'select') {
    inner = '<select name="' + f.name + '"' + req + '>' + f.options.map(function (o) {
      var ov = typeof o === 'string' ? o : o.value;
      var ol = typeof o === 'string' ? o : o.label;
      return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>';
    }).join('') + '</select>';
  } else if (f.type === 'service') {
    inner = '<input name="' + f.name + '" list="dl-services" value="' + esc(v) + '" placeholder="e.g. Netflix 4K" autocomplete="off"' + req + '>';
  } else if (f.type === 'plan') {
    inner = '<input name="' + f.name + '" list="dl-plans" value="' + esc(v) + '" placeholder="e.g. 1 Month" autocomplete="off">';
  } else if (f.type === 'textarea') {
    inner = '<textarea name="' + f.name + '" rows="2">' + esc(v) + '</textarea>';
  } else {
    inner = '<input name="' + f.name + '" type="' + f.type + '" value="' + esc(v) + '"' + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' autocomplete="off"' + req + '>';
  }
  return '<div' + (f.half ? ' class="half"' : '') + '><label>' + esc(f.label) + '</label>' + inner + '</div>';
}
function formHtml(fields) {
  var out = '<datalist id="dl-services">' + SERVICES.map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join('') + '</datalist>' +
    '<datalist id="dl-plans">' + PLANS.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>';
  var i = 0;
  while (i < fields.length) {
    if (fields[i].half && fields[i + 1] && fields[i + 1].half) { out += '<div class="two">' + fieldHtml(fields[i]) + fieldHtml(fields[i + 1]) + '</div>'; i += 2; }
    else { out += fieldHtml(fields[i]); i += 1; }
  }
  out += '<button type="submit" class="save">Save</button>';
  if (sheetId) out += '<button type="button" class="del" id="sheet-delete">Delete this record</button>';
  return out;
}
function getRec(kind, id) {
  var map = { account: DB.accounts, email: DB.emails, customer: DB.customers, sale: DB.sales, spend: DB.spends };
  return (map[kind] || []).find(function (x) { return x.id === id; }) || {};
}
function openSheet(kind, id) {
  sheetKind = kind; sheetId = id;
  var r = id ? getRec(kind, id) : {};
  var titles = { account: 'Account', email: 'Email', customer: 'Customer', sale: 'Sale', spend: 'Spend' };
  $('sheet-title').textContent = (id ? 'Edit ' : 'Add ') + titles[kind];
  var fields = [];
  if (kind === 'account') {
    fields = [
      { name: 'service', label: 'Service', type: 'service', value: r.service || 'Netflix 4K', required: true },
      { name: 'login', label: 'Login email / ID', type: 'text', value: r.login || '', required: true },
      { name: 'password', label: 'Password', type: 'text', value: r.password || '' },
      { name: 'profile', label: 'Profile / PIN (optional)', type: 'text', value: r.profile || '' },
      { name: 'purchase', label: 'Purchase date', type: 'date', value: r.purchase || todayStr(), half: true },
      { name: 'expiry', label: 'Expiry date', type: 'date', value: r.expiry || plusDays(todayStr(), 30), half: true },
      { name: 'cost', label: 'Cost (Rs)', type: 'number', value: r.cost != null ? r.cost : '', half: true },
      { name: 'slots', label: 'Total slots / profiles', type: 'number', value: r.slots != null ? r.slots : 4, half: true },
      { name: 'supplier', label: 'Supplier (bought from)', type: 'text', value: r.supplier || '' }
    ];
  } else if (kind === 'email') {
    fields = [
      { name: 'type', label: 'Type', type: 'select', options: ['Gmail', 'Outlook'], value: r.type || 'Gmail', half: true },
      { name: 'usedFor', label: 'Used for', type: 'select', options: USED_FOR, value: r.usedFor || 'OTP', half: true },
      { name: 'email', label: 'Email address', type: 'email', value: r.email || '', required: true },
      { name: 'password', label: 'Password', type: 'text', value: r.password || '' },
      { name: 'note', label: 'Note (optional)', type: 'textarea', value: r.note || '' }
    ];
  } else if (kind === 'customer') {
    var acctOpts = [{ value: '', label: '— No account linked —' }].concat(DB.accounts.map(function (a) { return { value: a.id, label: accountLabel(a) }; }));
    fields = [
      { name: 'name', label: 'Customer name', type: 'text', value: r.name || '', required: true },
      { name: 'whatsapp', label: 'WhatsApp number', type: 'tel', value: r.whatsapp || '', placeholder: '98XXXXXXXX' },
      { name: 'service', label: 'Service', type: 'service', value: r.service || 'Netflix 4K', required: true },
      { name: 'plan', label: 'Plan', type: 'plan', value: r.plan || '1 Month' },
      { name: 'accountId', label: 'Account given (from Accounts)', type: 'select', options: acctOpts, value: r.accountId || '' },
      { name: 'profile', label: 'Profile given (e.g. Profile 2 / PIN)', type: 'text', value: r.profile || '' },
      { name: 'start', label: 'Start date', type: 'date', value: r.start || todayStr(), half: true },
      { name: 'end', label: 'End date', type: 'date', value: r.end || plusDays(todayStr(), 30), half: true },
      { name: 'amount', label: 'Amount paid (Rs)', type: 'number', value: r.amount != null ? r.amount : 350, half: true },
      { name: 'payment', label: 'Payment', type: 'select', options: PAYMENTS, value: r.payment || 'eSewa', half: true }
    ];
  } else if (kind === 'sale') {
    fields = [
      { name: 'date', label: 'Date', type: 'date', value: r.date || todayStr() },
      { name: 'customer', label: 'Customer name', type: 'text', value: r.customer || '' },
      { name: 'product', label: 'Product', type: 'service', value: r.product || 'Netflix 4K', required: true },
      { name: 'plan', label: 'Plan', type: 'plan', value: r.plan || '1 Month' },
      { name: 'amount', label: 'Amount (Rs)', type: 'number', value: r.amount != null ? r.amount : 350, half: true },
      { name: 'payment', label: 'Payment', type: 'select', options: PAYMENTS, value: r.payment || 'eSewa', half: true }
    ];
  } else if (kind === 'spend') {
    fields = [
      { name: 'date', label: 'Date', type: 'date', value: r.date || todayStr() },
      { name: 'item', label: 'What did you buy?', type: 'text', value: r.item || '', required: true, placeholder: 'e.g. Netflix account renewal' },
      { name: 'product', label: 'Product (for profit report)', type: 'service', value: r.product || '' },
      { name: 'supplier', label: 'Supplier / paid to', type: 'text', value: r.supplier || '' },
      { name: 'amount', label: 'Amount (Rs)', type: 'number', value: r.amount != null ? r.amount : '', half: true },
      { name: 'category', label: 'Category', type: 'select', options: SPEND_CATS, value: r.category || 'Account Purchase', half: true }
    ];
  }
  $('sheet-form').innerHTML = formHtml(fields);
  // price prefill when service changes (only if amount untouched by user in this session)
  var form = $('sheet-form');
  var svcInput = form.querySelector('[name="service"],[name="product"]');
  var amtInput = form.querySelector('[name="amount"]');
  if (svcInput && amtInput && (kind === 'customer' || kind === 'sale')) {
    svcInput.addEventListener('change', function () {
      var s = SERVICES.find(function (x) { return x.name === svcInput.value; });
      if (s && s.price > 0) amtInput.value = s.price;
    });
  }
  var delBtn = $('sheet-delete');
  if (delBtn) delBtn.addEventListener('click', function () { closeSheet(); deleteRecord(sheetKind, sheetId); });
  $('sheet-wrap').classList.remove('hidden');
}
function closeSheet() { $('sheet-wrap').classList.add('hidden'); sheetKind = null; sheetId = null; }
$('sheet-close').addEventListener('click', closeSheet);
$('sheet-wrap').addEventListener('click', function (e) { if (e.target === $('sheet-wrap')) closeSheet(); });

$('sheet-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var fd = new FormData($('sheet-form'));
  function g(n) { var v = fd.get(n); return v == null ? '' : String(v).trim(); }
  function gn(n) { var v = parseFloat(g(n)); return isNaN(v) ? 0 : v; }
  var kind = sheetKind, id = sheetId;
  if (kind === 'account') {
    var recA = { id: id || uid(), service: g('service'), login: g('login'), password: g('password'), profile: g('profile'), purchase: g('purchase'), expiry: g('expiry'), cost: gn('cost'), supplier: g('supplier'), slots: parseInt(g('slots'), 10) || 0 };
    if (id) {
      DB.accounts = DB.accounts.map(function (x) { return x.id === id ? recA : x; });
      var sp = DB.spends.find(function (s) { return s.autoFrom === id; });
      if (sp && recA.cost > 0) { sp.amount = recA.cost; sp.date = recA.purchase || sp.date; sp.supplier = recA.supplier; }
    } else {
      DB.accounts.push(recA);
      if (recA.cost > 0) DB.spends.push({ id: uid(), date: recA.purchase || todayStr(), item: recA.service + ' account', product: recA.service, supplier: recA.supplier, amount: recA.cost, category: 'Account Purchase', autoFrom: recA.id });
    }
  } else if (kind === 'email') {
    var recE = { id: id || uid(), type: g('type'), usedFor: g('usedFor'), email: g('email'), password: g('password'), note: g('note') };
    if (id) DB.emails = DB.emails.map(function (x) { return x.id === id ? recE : x; }); else DB.emails.push(recE);
  } else if (kind === 'customer') {
    var recC = { id: id || uid(), name: g('name'), whatsapp: g('whatsapp'), service: g('service'), plan: g('plan'), accountId: g('accountId'), profile: g('profile'), start: g('start'), end: g('end'), amount: gn('amount'), payment: g('payment') };
    if (id) {
      DB.customers = DB.customers.map(function (x) { return x.id === id ? recC : x; });
      var sl = DB.sales.find(function (s) { return s.autoFrom === id; });
      if (sl) { sl.amount = recC.amount; sl.date = recC.start || sl.date; sl.customer = recC.name; sl.product = recC.service; sl.plan = recC.plan; sl.payment = recC.payment; }
    } else {
      DB.customers.push(recC);
      if (recC.amount > 0) DB.sales.push({ id: uid(), date: recC.start || todayStr(), customer: recC.name, product: recC.service, plan: recC.plan, amount: recC.amount, payment: recC.payment, autoFrom: recC.id });
    }
  } else if (kind === 'sale') {
    var recS = { id: id || uid(), date: g('date'), customer: g('customer'), product: g('product'), plan: g('plan'), amount: gn('amount'), payment: g('payment') };
    if (id) { var old = getRec('sale', id); if (old.autoFrom) recS.autoFrom = old.autoFrom; DB.sales = DB.sales.map(function (x) { return x.id === id ? recS : x; }); }
    else DB.sales.push(recS);
  } else if (kind === 'spend') {
    var recX = { id: id || uid(), date: g('date'), item: g('item'), product: g('product'), supplier: g('supplier'), amount: gn('amount'), category: g('category') };
    if (id) { var oldX = getRec('spend', id); if (oldX.autoFrom) recX.autoFrom = oldX.autoFrom; DB.spends = DB.spends.map(function (x) { return x.id === id ? recX : x; }); }
    else DB.spends.push(recX);
  }
  save(); closeSheet(); renderAll(); toast('Saved ✓');
});

/* ---------- cloud sync (Supabase) ---------- */
function setSyncStatus(msg) {
  var el = $('sync-status'); if (el) el.textContent = msg;
  var signed = !!cloudUser;
  var bSync = $('btn-sync-now'), bIn = $('btn-signin-settings'), bOut = $('btn-signout');
  if (bSync) bSync.classList.toggle('hidden', !signed);
  if (bOut) bOut.classList.toggle('hidden', !signed);
  if (bIn) bIn.classList.toggle('hidden', signed);
}
function cloudPayload() { var c = JSON.parse(JSON.stringify(DB)); delete c.pinHash; return c; }
function applyCloudData(d) {
  var pin = DB.pinHash;
  var b = blankData(); b.pinHash = pin;
  ['accounts', 'emails', 'customers', 'sales', 'spends'].forEach(function (k) { if (Array.isArray(d && d[k])) b[k] = d[k]; });
  DB = b;
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
  renderAll();
}
function pushCloud() {
  pushTimer = null;
  if (!sb || !cloudUser) return;
  sb.from('digi_data').upsert({ user_id: cloudUser.id, data: cloudPayload(), updated_at: new Date().toISOString() })
    .then(function (res) { setSyncStatus(res.error ? 'Sync error — will retry on next change.' : 'Signed in: ' + (cloudUser.email || '') + ' · Synced ✓'); })
    .catch(function () { setSyncStatus('Offline — changes saved on this phone, will sync later.'); });
}
function schedulePush() {
  if (!sb || !cloudUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushCloud, 900);
}
function pullCloud() {
  if (!sb || !cloudUser) return Promise.resolve(false);
  lastPullAt = Date.now();
  return sb.from('digi_data').select('data').eq('user_id', cloudUser.id).maybeSingle()
    .then(function (res) {
      if (res.error) { setSyncStatus('Sync error — showing this phone\u2019s data.'); return false; }
      if (!res.data) { pushCloud(); return false; } /* first sign-in: seed cloud with this phone's data */
      applyCloudData(res.data.data);
      setSyncStatus('Signed in: ' + (cloudUser.email || '') + ' · Synced ✓');
      return true;
    })
    .catch(function () { setSyncStatus('Offline — showing this phone\u2019s data.'); return false; });
}
function afterUnlock() {
  refreshSyncUIOnly();
  if (!sb) return;
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s && s.user) { cloudUser = s.user; setSyncStatus('Signed in: ' + (s.user.email || '') + ' · Syncing…'); pullCloud(); }
    else { setSyncStatus('Not signed in. Sign in to back up your records to your cloud database and let Muse add records for you directly.'); $('auth').classList.remove('hidden'); }
  }).catch(function () {});
}
function refreshSyncUIOnly() { setSyncStatus(cloudUser ? 'Signed in: ' + (cloudUser.email || '') : 'Not signed in. Sign in to back up your records to your cloud database and let Muse add records for you directly.'); }
function doAuth(signup) {
  if (!sb) { $('auth-msg').textContent = 'Cloud is not configured yet.'; return; }
  var email = $('auth-email').value.trim(), pw = $('auth-pass').value;
  if (!email || pw.length < 6) { $('auth-msg').textContent = 'Enter your email and a password of 6+ characters.'; return; }
  $('auth-msg').textContent = signup ? 'Creating your account…' : 'Signing in…';
  var p = signup ? sb.auth.signUp({ email: email, password: pw }) : sb.auth.signInWithPassword({ email: email, password: pw });
  p.then(function (r) {
    if (r.error) { $('auth-msg').textContent = r.error.message; return; }
    var user = r.data && (r.data.user || (r.data.session && r.data.session.user));
    if (user && r.data.session) {
      cloudUser = user;
      $('auth').classList.add('hidden');
      toast('Cloud sync on ✓');
      if (signup) { pushCloud(); setSyncStatus('Signed in: ' + email + ' · Synced ✓'); } else pullCloud();
    } else {
      $('auth-msg').textContent = 'Account created — please check your email, tap the confirm link, then Sign In here.';
    }
  }).catch(function () { $('auth-msg').textContent = 'Network error — try again.'; });
}
$('btn-signin').addEventListener('click', function () { doAuth(false); });
$('btn-signup').addEventListener('click', function () { doAuth(true); });
$('btn-auth-skip').addEventListener('click', function () { $('auth').classList.add('hidden'); toast('Phone-only for now — sign in anytime from Settings ⚙️'); });
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && sb && cloudUser && !pushTimer && Date.now() - lastPullAt > 30000) pullCloud();
});

/* ---------- settings ---------- */
$('btn-sync-now').addEventListener('click', function () { pullCloud().then(function () { toast('Synced ✓'); }); });
$('btn-signin-settings').addEventListener('click', function () { $('auth').classList.remove('hidden'); });
$('btn-signout').addEventListener('click', function () {
  if (!sb) return;
  sb.auth.signOut().then(function () { cloudUser = null; setSyncStatus('Signed out — your records stay on this phone.'); toast('Signed out'); });
});
$('btn-changepin').addEventListener('click', function () {
  pinStage = 'chg-verify'; pinBuf = ''; pinFirst = '';
  pinMsg('Enter your CURRENT PIN');
  drawDots();
  $('lock').classList.remove('hidden');
});
$('btn-export').addEventListener('click', function () {
  var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'digi-manager-backup-' + todayStr() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('Backup downloaded ✓');
});
$('file-import').addEventListener('change', function (e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var d = JSON.parse(reader.result);
      if (!d || typeof d !== 'object') throw new Error('bad');
      if (!confirm('Import this backup? It will REPLACE all current data on this phone.')) return;
      var b = blankData();
      b.pinHash = d.pinHash || DB.pinHash;
      ['accounts', 'emails', 'customers', 'sales', 'spends'].forEach(function (k) { if (Array.isArray(d[k])) b[k] = d[k]; });
      DB = b; save(); renderAll(); toast('Backup imported ✓');
    } catch (err) { alert('That file is not a valid Digi Manager backup.'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});
$('btn-erase').addEventListener('click', function () {
  if (!confirm('Erase ALL data and PIN from this phone?')) return;
  if (!confirm('Really erase everything? Export a backup first if unsure.')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
});

/* ---------- boot ---------- */
initLock();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
