/* =====================================================
   REWYMINE · app.js
   1. Cấu hình (sửa ở đây để thêm nguồn tin, liên kết)
   2. Tiện ích + điều hướng + sao lưu
   3. Nhạc   4. Phim   5. Game   6. Tin tức   7. Công cụ
   ===================================================== */

/* ===== 1. CẤU HÌNH ===== */
const FEEDS = { // thể loại -> { tên nguồn: địa chỉ RSS }
  'Tổng hợp': {'VnExpress':'https://vnexpress.net/rss/tin-moi-nhat.rss','Tuổi Trẻ':'https://tuoitre.vn/rss/tin-moi-nhat.rss','Thanh Niên':'https://thanhnien.vn/rss/home.rss','Dân trí':'https://dantri.com.vn/rss/home.rss'},
  'Âm nhạc': {'VnExpress Giải trí':'https://vnexpress.net/rss/giai-tri.rss','Billboard':'https://www.billboard.com/feed/','Pitchfork':'https://pitchfork.com/feed/feed-news/rss'},
  'Anime': {'Anime News Network':'https://www.animenewsnetwork.com/all/rss.xml'},
  'Game': {'PC Gamer':'https://www.pcgamer.com/rss/','Polygon':'https://www.polygon.com/rss/index.xml'},
  'Công nghệ': {'VnExpress Số hóa':'https://vnexpress.net/rss/so-hoa.rss','The Verge':'https://www.theverge.com/rss/index.xml'}
};
const MODES = { // danh mục phim: [đường dẫn TMDB, tham số thêm]
  'Thịnh hành tuần này': ['/trending/all/week', {}],
  'Phim đang chiếu': ['/movie/now_playing', {}],
  'Series nổi bật': ['/tv/popular', {}],
  'Anime': ['/discover/tv', {with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc'}]
};
const GAME_LINKS = {
  lol: [['OP.GG','https://www.op.gg/'],['Lolalytics','https://lolalytics.com/'],['Trang chủ LoL','https://www.leagueoflegends.com/vi-vn/']],
  tft: [['MetaTFT','https://www.metatft.com/'],['Tactics.tools','https://tactics.tools/'],['Trang chủ TFT','https://teamfighttactics.leagueoflegends.com/vi-vn/']]
};

/* ===== 2. TIỆN ÍCH, ĐIỀU HƯỚNG, SAO LƯU ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = { // mọi dữ liệu lưu trong máy với khoá bắt đầu bằng "rwm:"
  get(k, d) { try { const v = localStorage.getItem('rwm:' + k); return v ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem('rwm:' + k, JSON.stringify(v)) } catch {} }
};
const bindChips = (box, fn) => box.addEventListener('click', e => { // nhóm nút chọn 1
  const b = e.target.closest('button'); if (!b) return;
  [...box.children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.k);
});

function go(t) {
  document.querySelectorAll('.tab').forEach(e => e.classList.toggle('on', e.id === 't-' + t));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  history.replaceState(null, '', '#' + t); window.scrollTo(0, 0);
  if (t === 'home') stats();
  if (t === 'news' && !$('#nl').innerHTML) loadNews();
}
document.querySelector('nav').onclick = e => { const t = e.target.dataset.t; if (t) go(t) };

function stats() { $('#stats').textContent = `${tracks.length} bài nhạc · ${wl.length} phim/series · ${comps.length} đội hình TFT · ${todos.length} việc cần làm` }
$('#exp').onclick = () => {
  const o = {};
  Object.keys(localStorage).filter(k => k.startsWith('rwm:') && k !== 'rwm:tmdbKey' && !k.startsWith('rwm:news')).forEach(k => o[k] = localStorage[k]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], {type: 'application/json'}));
  a.download = 'rewymine-backup.json'; a.click();
};
$('#impb').onclick = () => $('#imp').click();
$('#imp').onchange = async e => {
  try { const o = JSON.parse(await e.target.files[0].text());
    Object.keys(o).filter(k => k.startsWith('rwm:')).forEach(k => localStorage.setItem(k, o[k])); location.reload();
  } catch { alert('File sao lưu không hợp lệ') }
};

/* ===== 3. NHẠC (YouTube IFrame API + thẻ audio, tự phát bài kế tiếp) ===== */
// Bài cũ lưu bằng link nhúng -> đổi sang dạng {vid} hoặc {list}
const fixTrack = t => { if (t.kind !== 'yt' || t.vid || t.list) return t;
  const l = ((t.url || '').match(/[?&]list=([\w-]+)/) || [])[1];
  return l ? {...t, list: l} : {...t, vid: ((t.url || '').match(/embed\/([\w-]{11})/) || [])[1]} };
let tracks = store.get('tracks', []).map(fixTrack).filter(t => t.kind !== 'yt' || t.vid || t.list);
const ytId = u => (u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1];
const ytUrl = t => t.vid ? `https://www.youtube.com/watch?v=${t.vid}` : `https://www.youtube.com/playlist?list=${t.list}`;
let cur = -1, yt = null, ytOk = false, pend = null, apiP = null;

function drawMusic() {
  $('#tl').innerHTML = tracks.map((t, i) => `<div class="row${i === cur ? ' now' : ''}"><button class="lnk" data-p="${i}" style="flex:1">${i === cur ? '♪' : '▶'} ${esc(t.title)}</button>`
    + (t.kind === 'audio' ? `<a class="x lk" href="${esc(t.url)}" download target="_blank" rel="noopener" aria-label="Tải về" title="Tải file về">⬇</a>`
                          : `<a class="x lk" href="${ytUrl(t)}" target="_blank" rel="noopener" aria-label="Mở trên YouTube" title="Mở trên YouTube">↗</a>`)
    + `<button class="x" data-d="${i}" aria-label="Xoá">✕</button></div>`).join('') || '<p class="mute">Chưa có bài nào.</p>';
}
const loadAPI = () => apiP || (apiP = new Promise(res => {
  if (window.YT && YT.Player) return res();
  window.onYouTubeIframeAPIReady = res;
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
  s.onerror = () => { apiP = null; alert('Không tải được trình phát YouTube. Kiểm tra mạng rồi thử lại.') };
  document.head.appendChild(s);
}));
const startYT = t => t.vid ? yt.loadVideoById(t.vid) : yt.loadPlaylist({listType: 'playlist', list: t.list});

async function play(i) {
  const t = tracks[i]; if (!t) return;
  cur = i; drawMusic(); $('#pctl').hidden = false; $('#pnow').textContent = t.title;
  const au = $('#au');
  if (t.kind === 'audio') {
    if (ytOk) yt.pauseVideo(); const f = $('#ytp'); if (f) f.style.display = 'none';
    au.hidden = false; au.src = t.url; au.play().catch(() => {}); return;
  }
  au.pause(); au.hidden = true;
  await loadAPI();
  const f = $('#ytp'); if (f) f.style.display = '';
  if (!yt) { pend = t;
    yt = new YT.Player('ytp', {width: '100%', playerVars: {playsinline: 1}, events: {
      onReady: () => { ytOk = true; startYT(pend) },
      onStateChange: e => { if (e.data === 0) onEnd() } }});
  } else if (ytOk) startYT(t); else pend = t;
}
function onEnd() { // hết video: nếu là playlist thì chờ phát hết playlist rồi mới sang bài kế
  const t = tracks[cur];
  if (t && t.list && yt.getPlaylist) { const l = yt.getPlaylist() || []; if (yt.getPlaylistIndex() < l.length - 1) return }
  next(1);
}
function next(d) {
  if (!tracks.length) return; let n = cur + d;
  if (n >= tracks.length || n < 0) { if (d > 0 && !$('#mloop').checked) return; n = (n + tracks.length) % tracks.length }
  play(n);
}
$('#au').onended = () => next(1);
$('#mprev').onclick = () => next(-1); $('#mnext').onclick = () => next(1);
$('#mloop').checked = store.get('loop', false); $('#mloop').onchange = e => store.set('loop', e.target.checked);

$('#tl').onclick = e => {
  const p = e.target.dataset.p, d = e.target.dataset.d;
  if (p !== undefined) play(+p);
  if (d !== undefined) { tracks.splice(d, 1); if (+d <= cur) cur--; store.set('tracks', tracks); drawMusic() }
};
$('#madd').onclick = async () => {
  const u = $('#mu').value.trim(); if (!u) return;
  const id = ytId(u), pl = (u.match(/[?&]list=([\w-]+)/) || [])[1]; let t;
  if (id) { t = {kind: 'yt', title: 'Video ' + id, vid: id};
    try { t.title = (await (await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u))).json()).title } catch {} }
  else if (pl) t = {kind: 'yt', title: 'Playlist ' + pl.slice(0, 8), list: pl};
  else if (/^https?:\/\/.+\.(mp3|m4a|ogg|wav)(\?|$)/i.test(u)) t = {kind: 'audio', title: decodeURIComponent(u.split('/').pop().split('?')[0]), url: u};
  else return alert('Link chưa hỗ trợ. Dùng link YouTube hoặc link trực tiếp tới file .mp3');
  tracks.push(t); store.set('tracks', tracks); $('#mu').value = ''; drawMusic();
};

/* ===== 4. PHIM (TMDB API + Internet Archive) ===== */
let wl = store.get('movies', []), view = [];
const jw = m => `https://www.justwatch.com/vn/search?q=${encodeURIComponent(m.title)}`;
async function tmdb(path, params = {}) {
  const q = new URLSearchParams({api_key: store.get('tmdbKey', ''), language: 'vi-VN', ...params});
  const r = await fetch('https://api.themoviedb.org/3' + path + '?' + q); if (!r.ok) throw 0; return r.json();
}
const norm = (r, dt) => { const t = r.media_type || dt;
  return {id: t + r.id, tmdb: r.id, type: t, title: r.title || r.name, year: (r.release_date || r.first_air_date || '').slice(0, 4), poster: r.poster_path || '', overview: (r.overview || '').slice(0, 400), status: 'Muốn xem'} };
const card = (m, i, extra) => `<div class="poster"><button class="pimg" data-o="${i}" aria-label="Chi tiết ${esc(m.title)}"><img loading="lazy" alt="" src="${m.poster ? 'https://image.tmdb.org/t/p/w342' + esc(m.poster) : ''}"></button><div><b>${esc(m.title)}</b> <span class="mute">${esc(m.year)}</span>${extra}</div></div>`;
$('#mmode').innerHTML = Object.keys(MODES).map(n => `<option>${esc(n)}</option>`).join('');

function keyBox() {
  const k = store.get('tmdbKey', '');
  $('#kbox').innerHTML = k ? '<span class="mute">Đã lưu khoá TMDB trong máy này.</span> <button class="b ghost" id="kdel">Xoá khoá</button>'
    : '<b>Cần khoá TMDB (miễn phí)</b><p class="mute" style="margin:4px 0 10px">Tạo tài khoản tại themoviedb.org → Settings → API → dán “API Key (v3)” vào đây. Khoá chỉ lưu trong trình duyệt của bạn.</p><div class="bar"><input id="kin" placeholder="API Key (v3)"><button class="b" id="ksv">Lưu</button></div>';
  if (k) $('#kdel').onclick = () => { store.set('tmdbKey', ''); keyBox() };
  else $('#ksv').onclick = () => { const v = $('#kin').value.trim(); if (v) { store.set('tmdbKey', v); keyBox(); browse() } };
}
function showView(items) {
  view = items;
  $('#mres').innerHTML = items.map((m, i) => card(m, i, `<button class="b" data-a="${i}" style="width:100%;padding:6px;margin-top:6px">+ Thêm</button>`)).join('') || '<p class="mute">Không thấy kết quả.</p>';
}
async function browse() {
  if (!store.get('tmdbKey', '')) return;
  const [p, x] = MODES[$('#mmode').value], dt = p.includes('/tv') ? 'tv' : 'movie';
  try { const j = await tmdb(p, x); showView(j.results.filter(r => r.media_type !== 'person').slice(0, 18).map(r => norm(r, dt))) }
  catch { $('#mres').innerHTML = '<p class="mute">Lỗi tải danh sách. Kiểm tra khoá TMDB hoặc mạng.</p>' }
}
$('#mmode').onchange = browse;
$('#msr').onclick = async () => {
  const q = $('#mq').value.trim(); if (!q || !store.get('tmdbKey', '')) return;
  try { const j = await tmdb('/search/multi', {query: q}); showView(j.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 18).map(r => norm(r, 'movie'))) }
  catch { $('#mres').innerHTML = '<p class="mute">Lỗi tìm kiếm. Kiểm tra khoá TMDB hoặc mạng.</p>' }
};
function addWL(m) { if (!wl.some(x => x.id === m.id)) { wl.push(m); store.set('movies', wl); drawWL() } }
function drawWL() {
  $('#mlist').innerHTML = wl.map((m, i) => card(m, i, `<select data-s="${i}" aria-label="Trạng thái">${['Muốn xem', 'Đang xem', 'Đã xem'].map(s => `<option${s === m.status ? ' selected' : ''}>${s}</option>`).join('')}</select><a href="${jw(m)}" target="_blank" rel="noopener">Nơi xem hợp pháp ↗</a> · <button class="x" data-r="${i}" style="padding:0">Xoá</button>`)).join('') || '<p class="mute">Chưa có phim nào.</p>';
}
async function openMovie(m) { // bảng chi tiết + trailer YouTube
  const box = $('#mdet'); box.innerHTML = '<div class="card mute">Đang tải…</div>'; let vid = '';
  try { const j = await tmdb(`/${m.type}/${m.tmdb}/videos`, {language: 'en-US'});
    const v = j.results.find(x => x.site === 'YouTube' && x.type === 'Trailer') || j.results.find(x => x.site === 'YouTube'); vid = v ? v.key : '' } catch {}
  box.innerHTML = `<div class="card">${/^[\w-]{11}$/.test(vid) ? `<iframe class="v" src="https://www.youtube-nocookie.com/embed/${vid}" allowfullscreen title="Trailer"></iframe>` : ''}<h2 style="margin-top:0">${esc(m.title)} <span class="mute">${esc(m.year)}</span></h2><p style="margin-bottom:12px">${esc(m.overview) || 'Chưa có mô tả.'}</p><div class="bar"><button class="b" id="dadd">+ Thêm vào danh sách</button><a class="b ghost lk" href="${jw(m)}" target="_blank" rel="noopener">Nơi xem hợp pháp ↗</a><button class="b ghost" id="dcl">Đóng</button></div></div>`;
  $('#dadd').onclick = () => addWL(m); $('#dcl').onclick = () => box.innerHTML = '';
  box.scrollIntoView({behavior: 'smooth', block: 'nearest'});
}
$('#mres').onclick = e => { const a = e.target.dataset.a, o = e.target.closest('[data-o]'); if (a !== undefined) addWL(view[a]); else if (o) openMovie(view[o.dataset.o]) };
$('#mlist').onclick = e => { const r = e.target.dataset.r, o = e.target.closest('[data-o]');
  if (r !== undefined) { wl.splice(r, 1); store.set('movies', wl); drawWL() } else if (o) openMovie(wl[o.dataset.o]) };
$('#mlist').onchange = e => { const s = e.target.dataset.s; if (s !== undefined) { wl[s].status = e.target.value; store.set('movies', wl) } };

$('#iabtn').onclick = async () => { // phim phạm vi công cộng, nhúng trình phát của Internet Archive
  const box = $('#ialist'); box.hidden = false; box.innerHTML = '<span class="mute">Đang tải…</span>';
  try { const q = encodeURIComponent('collection:feature_films AND mediatype:movies');
    const j = await (await fetch(`https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&sort[]=downloads+desc&rows=15&output=json`)).json();
    box.innerHTML = j.response.docs.filter(d => /^[\w.-]+$/.test(d.identifier)).map(d => `<div class="row"><button class="lnk" data-i="${esc(d.identifier)}">▶ ${esc(d.title)}</button></div>`).join('');
  } catch { box.innerHTML = '<span class="mute">Không tải được danh sách. Thử lại sau.</span>' }
};
$('#ialist').onclick = e => { const i = e.target.dataset.i;
  if (i) { $('#iaplayer').innerHTML = `<iframe class="v" src="https://archive.org/embed/${esc(i)}" allowfullscreen title="Phim"></iframe>`; $('#iaplayer').scrollIntoView({behavior: 'smooth', block: 'nearest'}) } };

/* ===== 5. GAME ===== */
const panes = {play: $('#g-play'), lol: $('#g-lol'), tft: $('#g-tft')};
bindChips($('#gchips'), k => { Object.entries(panes).forEach(([n, p]) => p.classList.toggle('on', n === k)); if (k === 'lol') loadLoL() });
const linkBtns = l => l.map(([n, u]) => `<a class="b ghost lk" href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('');
$('#llinks').innerHTML = linkBtns(GAME_LINKS.lol); $('#tlinks').innerHTML = linkBtns(GAME_LINKS.tft);

// 5a. Rắn săn mồi (chạy trực tiếp)
(function () {
  const c = $('#sn'), g = c.getContext('2d'), N = 18, S = c.width / N; let b, d, q, f, sc, tm;
  const food = () => { do { f = {x: Math.random() * N | 0, y: Math.random() * N | 0} } while (b.some(p => p.x === f.x && p.y === f.y)) };
  const label = () => $('#sc').textContent = `Điểm ${sc || 0} · Kỷ lục ${store.get('snakeBest', 0)}`;
  function draw() { g.fillStyle = '#0f0f14'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ff6b81'; g.fillRect(f.x * S + 3, f.y * S + 3, S - 6, S - 6);
    g.fillStyle = '#8b7cff'; b.forEach(p => g.fillRect(p.x * S + 1, p.y * S + 1, S - 2, S - 2)) }
  function tick() { d = q; const h = {x: (b[0].x + d.x + N) % N, y: (b[0].y + d.y + N) % N};
    if (b.some(p => p.x === h.x && p.y === h.y)) { clearInterval(tm); $('#sbtn').textContent = 'Chơi lại';
      if (sc > store.get('snakeBest', 0)) store.set('snakeBest', sc); label(); return }
    b.unshift(h); if (h.x === f.x && h.y === f.y) { sc++; food() } else b.pop(); label(); draw() }
  function start() { b = [{x: 9, y: 9}]; d = q = {x: 1, y: 0}; sc = 0; food(); clearInterval(tm); tm = setInterval(tick, 120); draw() }
  const turn = (x, y) => { if (x !== -d.x || y !== -d.y) q = {x, y} };
  $('#sbtn').onclick = start;
  addEventListener('keydown', e => { if (!panes.play.classList.contains('on') || !$('#t-game').classList.contains('on') || !b) return;
    const m = {ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0]}[e.key];
    if (m) { e.preventDefault(); turn(...m) } });
  let sx, sy; c.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }, {passive: true});
  c.addEventListener('touchend', e => { if (!b) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy)) });
  b = [{x: 9, y: 9}]; d = q = {x: 1, y: 0}; food(); draw(); label();
})();

// 5b. LoL: danh sách tướng từ Data Dragon của Riot (dữ liệu tĩnh, không cần khoá)
let lol;
async function loadLoL() {
  if (lol) return; $('#lgrid').innerHTML = '<p class="mute">Đang tải…</p>';
  try { const v = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0];
    const j = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/vi_VN/champion.json`)).json();
    lol = {v, list: Object.values(j.data)}; drawLoL();
  } catch { $('#lgrid').innerHTML = '<p class="mute">Không tải được dữ liệu LoL. Thử lại sau.</p>' }
}
function drawLoL() {
  if (!lol) return; const q = $('#lq').value.toLowerCase(), r = $('#lr').value, fav = store.get('lolFav', []);
  $('#lgrid').innerHTML = lol.list.filter(c => c.name.toLowerCase().includes(q) && (!r || c.tags.includes(r)))
    .sort((a, b) => fav.includes(b.id) - fav.includes(a.id) || a.name.localeCompare(b.name, 'vi'))
    .map(c => `<button class="champ" data-c="${esc(c.id)}" title="${esc(c.title)}"><img loading="lazy" alt="" src="https://ddragon.leagueoflegends.com/cdn/${esc(lol.v)}/img/champion/${esc(c.image.full)}"><span>${fav.includes(c.id) ? '★ ' : ''}${esc(c.name)}</span></button>`).join('');
}
$('#lq').oninput = drawLoL; $('#lr').onchange = drawLoL;
$('#lgrid').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return;
  let f = store.get('lolFav', []); f = f.includes(b.dataset.c) ? f.filter(x => x !== b.dataset.c) : [...f, b.dataset.c]; store.set('lolFav', f); drawLoL() };

// 5c. TFT: sổ đội hình tự ghi (dữ liệu tướng TFT chưa có nguồn tĩnh chính thức nên nhập tay ở bước này)
let comps = store.get('tftComps', []);
function drawTFT() {
  $('#tfl').innerHTML = comps.map((c, i) => `<div class="card"><b>${esc(c.n)}</b> <button class="x" data-d="${i}" aria-label="Xoá">✕</button><div>${c.u.split(',').filter(s => s.trim()).map(s => `<span class="tag">${esc(s.trim())}</span>`).join('')}</div><p class="mute" style="margin-top:8px">${esc(c.note)}</p></div>`).join('') || '<p class="mute" style="margin-bottom:12px">Chưa có đội hình nào.</p>';
}
$('#tadd').onclick = () => { const n = $('#tn').value.trim(); if (!n) return;
  comps.unshift({n, u: $('#tu').value, note: $('#tnote').value}); store.set('tftComps', comps); ['#tn', '#tu', '#tnote'].forEach(s => $(s).value = ''); drawTFT() };
$('#tfl').onclick = e => { const d = e.target.dataset.d; if (d !== undefined) { comps.splice(d, 1); store.set('tftComps', comps); drawTFT() } };

/* ===== 6. TIN TỨC (RSS -> JSON qua rss2json, đệm 15 phút) ===== */
const allFeeds = () => { const my = store.get('myfeeds', {}); return Object.keys(my).length ? {...FEEDS, 'Của tôi': my} : FEEDS };
let cat = 'Tổng hợp';
function drawCats() {
  $('#ncat').innerHTML = Object.keys(allFeeds()).map(c => `<button data-k="${esc(c)}"${c === cat ? ' class="on"' : ''}>${esc(c)}</button>`).join('');
  $('#ns').innerHTML = Object.entries(allFeeds()[cat]).map(([n, u]) => `<option value="${esc(u)}">${esc(n)}</option>`).join('');
}
async function loadNews(force) {
  const src = $('#ns').value, ck = 'news:' + src, c = store.get(ck); let items;
  if (!force && c && Date.now() - c.t < 9e5) items = c.items;
  else { $('#nl').innerHTML = '<p class="mute">Đang tải…</p>';
    try { const j = await (await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(src))).json();
      if (j.status !== 'ok') throw 0;
      items = j.items.filter(i => /^https?:/.test(i.link)).slice(0, 20).map(i => ({t: i.title, l: i.link, d: i.pubDate})); store.set(ck, {t: Date.now(), items});
    } catch { $('#nl').innerHTML = '<p class="mute">Không tải được nguồn này (địa chỉ RSS có thể đã đổi, hoặc dịch vụ miễn phí đang giới hạn). Thử nguồn khác hoặc tải lại sau.</p>'; return } }
  $('#nl').innerHTML = items.map(i => `<a class="news" href="${esc(i.l)}" target="_blank" rel="noopener"><span>${esc(i.t)}</span><small>${esc((i.d || '').slice(0, 16))}</small></a>`).join('');
}
bindChips($('#ncat'), k => { cat = k; drawCats(); loadNews() });
$('#ns').onchange = () => loadNews(); $('#nrf').onclick = () => loadNews(true);
$('#nfa').onclick = () => { const n = $('#nfn').value.trim(), u = $('#nfu').value.trim();
  if (!n || !/^https?:\/\//.test(u)) return alert('Nhập tên và địa chỉ RSS bắt đầu bằng https://');
  const my = store.get('myfeeds', {}); my[n] = u; store.set('myfeeds', my); cat = 'Của tôi'; drawCats(); $('#ns').value = u; loadNews(); $('#nfn').value = $('#nfu').value = '' };

/* ===== 7. CÔNG CỤ ===== */
// Lối tắt
let links = store.get('links', []);
function drawLinks() { $('#lkl').innerHTML = links.map((l, i) => `<div class="row"><a href="${esc(l.u)}" target="_blank" rel="noopener" style="padding:8px 0">${esc(l.n)} ↗</a><button class="x" data-d="${i}" aria-label="Xoá">✕</button></div>`).join('') || '<p class="mute">Chưa có lối tắt.</p>' }
$('#lka').onclick = () => { const n = $('#lkn').value.trim(), u = $('#lku').value.trim(); if (!n || !/^https?:\/\//.test(u)) return alert('Nhập tên và link bắt đầu bằng https://');
  links.push({n, u}); store.set('links', links); $('#lkn').value = $('#lku').value = ''; drawLinks() };
$('#lkl').onclick = e => { const d = e.target.dataset.d; if (d !== undefined) { links.splice(d, 1); store.set('links', links); drawLinks() } };
// Việc cần làm
let todos = store.get('todos', []);
function drawTodos() { $('#tdl').innerHTML = todos.map((t, i) => `<div class="row"><label class="td"><input type="checkbox" data-c="${i}"${t.done ? ' checked' : ''}><span class="${t.done ? 'done' : ''}">${esc(t.t)}</span></label><button class="x" data-d="${i}" aria-label="Xoá">✕</button></div>`).join('') || '<p class="mute">Trống. Tuyệt!</p>' }
$('#tda').onclick = () => { const t = $('#tdi').value.trim(); if (!t) return; todos.push({t, done: false}); store.set('todos', todos); $('#tdi').value = ''; drawTodos() };
$('#tdl').onclick = e => { const d = e.target.dataset.d, c = e.target.dataset.c;
  if (d !== undefined) todos.splice(d, 1); else if (c !== undefined) todos[c].done = e.target.checked; else return; store.set('todos', todos); drawTodos() };
// Ghi chú
$('#note').value = store.get('note', ''); $('#note').oninput = e => store.set('note', e.target.value);
// Pomodoro
const PM = {w: 25 * 60, b: 5 * 60}; let pmode = 'w', pleft = PM.w, ptimer = 0;
function pshow() { $('#pt').textContent = String(pleft / 60 | 0).padStart(2, '0') + ':' + String(pleft % 60).padStart(2, '0'); $('#pmd').textContent = pmode === 'w' ? 'Tập trung' : 'Nghỉ' }
$('#pgo').onclick = () => {
  if (ptimer) { clearInterval(ptimer); ptimer = 0; $('#pgo').textContent = 'Tiếp tục'; return }
  $('#pgo').textContent = 'Tạm dừng';
  ptimer = setInterval(() => { if (--pleft <= 0) { pmode = pmode === 'w' ? 'b' : 'w'; pleft = PM[pmode]; navigator.vibrate && navigator.vibrate(300) } pshow() }, 1000);
};
$('#prs').onclick = () => { clearInterval(ptimer); ptimer = 0; pmode = 'w'; pleft = PM.w; $('#pgo').textContent = 'Bắt đầu'; pshow() };
// Mật khẩu ngẫu nhiên (dùng bộ sinh ngẫu nhiên an toàn của trình duyệt)
$('#pw').onclick = () => { const n = Math.min(64, Math.max(8, +$('#pl').value || 16)), cs = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  $('#po').value = [...crypto.getRandomValues(new Uint32Array(n))].map(x => cs[x % cs.length]).join('') };
$('#pc').onclick = () => { if ($('#po').value && navigator.clipboard) navigator.clipboard.writeText($('#po').value) };

/* ===== KHỞI ĐỘNG ===== */
drawMusic(); keyBox(); drawWL(); drawTFT(); drawCats(); drawLinks(); drawTodos(); pshow(); browse();
const h = location.hash.slice(1); go(h && $('#t-' + h) ? h : 'home');
