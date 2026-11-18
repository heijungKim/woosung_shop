/* OneScape 관리자 — GitHub 저장소의 사이트 데이터를 직접 편집·게시합니다. */
(() => {
'use strict';

/* ---------- 작은 도우미 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = n => Number(n || 0).toLocaleString('ko-KR');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function toast(msg, type = '') {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + type;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', type === 'error' ? 6000 : 3200);
}
function b64FromText(text) {
  const bytes = new TextEncoder().encode(text); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function textFromB64(b64) {
  const bin = atob(b64.replace(/\s/g, '')); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function b64FromBuffer(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ---------- 설정 ---------- */
const store = {
  get(k) { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
  set(k, v, persist) { try { sessionStorage.setItem(k, v); if (persist) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} }
};
function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (m) { const seg = location.pathname.split('/').filter(Boolean)[0]; return { owner: m[1], repo: seg && seg !== 'admin' ? seg : m[1] + '.github.io' }; }
  return { owner: 'heijungKim', repo: 'woosung_shop' };
}
const cfg = (() => {
  let saved = {}; try { saved = JSON.parse(store.get('os-admin-cfg') || '{}'); } catch {}
  const g = guessRepo();
  return { owner: saved.owner || g.owner, repo: saved.repo || g.repo, branch: saved.branch || 'main', api: saved.api || 'https://api.github.com', token: store.get('os-admin-token') || '' };
})();
function saveCfg(persistToken) {
  try { localStorage.setItem('os-admin-cfg', JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, api: cfg.api })); } catch {}
  if (cfg.token) store.set('os-admin-token', cfg.token, persistToken); else store.del('os-admin-token');
}

/* ---------- GitHub API ---------- */
const gh = {
  async req(method, path, body) {
    const res = await fetch(cfg.api.replace(/\/$/, '') + path, {
      method, cache: 'no-store',
      headers: Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try { const j = await res.json(); if (j.message) msg = res.status + ' ' + j.message; } catch {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.status === 204 ? null : res.json();
  },
  repoPath(p = '') { return `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${p}`; },
  async head() {
    const ref = await this.req('GET', this.repoPath(`/git/ref/heads/${encodeURIComponent(cfg.branch)}`));
    const commit = await this.req('GET', this.repoPath(`/git/commits/${ref.object.sha}`));
    return { sha: ref.object.sha, tree: commit.tree.sha };
  },
  async tree(sha) {
    const t = await this.req('GET', this.repoPath(`/git/trees/${sha}?recursive=1`));
    const map = new Map(); for (const e of t.tree) if (e.type === 'blob') map.set(e.path, e.sha);
    return map;
  },
  async blob(sha) { const b = await this.req('GET', this.repoPath(`/git/blobs/${sha}`)); return b.content; },
  async commit(changes, message) {
    // changes: [{path, base64}] ; returns new commit sha
    const head = await this.head();
    const entries = [];
    for (const c of changes) {
      const blob = await this.req('POST', this.repoPath('/git/blobs'), { content: c.base64, encoding: 'base64' });
      entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await this.req('POST', this.repoPath('/git/trees'), { base_tree: head.tree, tree: entries });
    const commit = await this.req('POST', this.repoPath('/git/commits'), { message, tree: tree.sha, parents: [head.sha] });
    await this.req('PATCH', this.repoPath(`/git/refs/heads/${encodeURIComponent(cfg.branch)}`), { sha: commit.sha });
    return { sha: commit.sha, previousHead: head.sha };
  }
};

/* ---------- 데이터 저장소 (불러온 파일 + 변경 추적) ---------- */
const SITE = '../'; // 관리자 페이지는 /admin/ 에 위치
const db = {
  files: new Map(),      // path -> {text, data, sha, json}
  dirty: new Set(),      // 변경된 path
  uploads: new Map(),    // path -> {base64, url}
  head: null, tree: null, connected: false,
  async connect() {
    if (!cfg.token) { this.connected = false; return false; }
    this.head = await gh.head(); this.tree = await gh.tree(this.head.tree); this.connected = true; return true;
  },
  async load(path, { json = true } = {}) {
    if (this.files.has(path)) return this.files.get(path);
    let text, sha = null;
    if (this.connected) {
      sha = this.tree.get(path);
      if (!sha) throw new Error(`저장소에 ${path} 파일이 없습니다.`);
      text = textFromB64(await gh.blob(sha));
    } else {
      const res = await fetch(SITE + path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${path}을(를) 불러오지 못했습니다 (${res.status}).`);
      text = await res.text();
    }
    const f = { text, sha, json, data: json ? JSON.parse(text) : text };
    this.files.set(path, f); return f;
  },
  data(path) { return this.files.get(path).data; },
  serialize(path) {
    const f = this.files.get(path);
    if (!f.json) return f.data;
    const pretty = /\n/.test(f.text.trim());
    return JSON.stringify(f.data, null, pretty ? 2 : 0) + (f.text.endsWith('\n') ? '\n' : '');
  },
  touch(path) {
    if (this.serialize(path) === this.files.get(path).text) this.dirty.delete(path); else this.dirty.add(path);
    updateBar();
  },
  setText(path, text) { this.files.get(path).data = text; this.touch(path); },
  discard() {
    for (const p of this.dirty) { const f = this.files.get(p); f.data = f.json ? JSON.parse(f.text) : f.text; }
    this.dirty.clear(); this.uploads.clear(); updateBar();
  },
  imgUrl(path) { if (!path) return ''; if (/^(https?:|data:|blob:)/.test(path)) return path; return this.uploads.get(path)?.url || SITE + path; }
};

const LABELS = {
  'data/portfolio-public.json': '시공실적', 'data/portfolio-summary.json': '총 프로젝트 수', 'data/public-counts.json': '공개 카운트',
  'data/mas-products.json': '제품', 'data/intellectual-property.json': '지식재산권', 'data/ip-gallery-policy-v26.json': '디자인 갤러리 노출',
  'data/comment-styles.json': '메인 문구', 'data/hero-slide-groups-v47.json': '메인 배경 이미지', 'data/locations.json': '오시는 길'
};
function updateBar() {
  const n = db.dirty.size + db.uploads.size;
  $('#publish-bar').hidden = n === 0;
  $('#pending-count').textContent = n;
  const pages = [...db.dirty].filter(p => p.endsWith('.html')).length;
  const names = [...new Set([...db.dirty].filter(p => !p.endsWith('.html')).map(p => LABELS[p] || p.replace(/^.*\//, '')))];
  if (pages) names.push(`페이지 문구 ${pages}개`);
  if (db.uploads.size) names.push(`새 이미지 ${db.uploads.size}개`);
  $('#pending-list').textContent = names.join(' · ');
}
window.addEventListener('beforeunload', e => { if (db.dirty.size || db.uploads.size) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- 이미지 업로드 (WebP 변환) ---------- */
async function pickImage() {
  return new Promise(resolve => {
    const inp = el('input', { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', () => resolve(inp.files[0] || null), { once: true });
    inp.click();
  });
}
async function encodeImage(file, maxSide = 2400, quality = 0.86) {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return { blob: file, ext: file.type === 'image/gif' ? 'gif' : 'svg', width: 0, height: 0 };
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = el('canvas', { width: w, height: h }); c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return { blob, ext: 'webp', width: w, height: h };
  const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
  return { blob: jpg, ext: 'jpg', width: w, height: h };
}
async function addUpload(file, { folder = 'uploads', maxSide = 2400, suffix = '' } = {}) {
  const { blob, ext, width, height } = await encodeImage(file, maxSide);
  const d = new Date(); const ym = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0');
  const path = `assets/${folder}/${ym}/${hex(8)}${suffix}.${ext}`;
  const base64 = b64FromBuffer(await blob.arrayBuffer());
  db.uploads.set(path, { base64, url: URL.createObjectURL(blob), size: blob.size });
  updateBar();
  return { path, width, height };
}

/* ---------- 게시 ---------- */
async function publish() {
  if (!db.connected) { toast('게시하려면 먼저 [설정]에서 GitHub 토큰을 연결하세요.', 'error'); location.hash = '#settings'; return; }
  const n = db.dirty.size + db.uploads.size; if (!n) return;
  const btn = $('#publish'); btn.disabled = true; btn.textContent = '게시 중…';
  try {
    // 다른 곳에서 같은 파일이 먼저 바뀌었는지 확인
    const head = await gh.head();
    if (head.sha !== db.head.sha) {
      const latest = await gh.tree(head.tree);
      const conflicts = [...db.dirty].filter(p => db.files.get(p).sha && latest.get(p) !== db.files.get(p).sha);
      if (conflicts.length && !confirm(`다음 파일이 그사이 다른 곳에서 수정되었습니다:\n${conflicts.join('\n')}\n\n지금 내용으로 덮어쓸까요?`)) throw new Error('게시를 취소했습니다.');
    }
    const changes = [];
    for (const [path, u] of db.uploads) changes.push({ path, base64: u.base64 });
    for (const path of db.dirty) changes.push({ path, base64: b64FromText(db.serialize(path)) });
    // 열려 있는 사이트 페이지가 자동으로 새로고침되도록 리비전 갱신
    const rev = { schemaVersion: 1, revision: hex(32), checkedAt: new Date().toISOString() };
    changes.push({ path: 'data/publication-version.json', base64: b64FromText(JSON.stringify(rev, null, 2) + '\n') });
    const pages = [...db.dirty].filter(p => p.endsWith('.html')).length;
    const names = [...new Set([...db.dirty].filter(p => !p.endsWith('.html')).map(p => LABELS[p] || p))];
    if (pages) names.push(`페이지 문구 ${pages}개`);
    if (db.uploads.size) names.push(`이미지 ${db.uploads.size}개`);
    const msg = `관리자: ${names.join(', ')} 수정`;
    await gh.commit(changes, msg);
    // 게시 완료 → 로컬 기준점 갱신
    for (const p of db.dirty) { const f = db.files.get(p); f.text = db.serialize(p); }
    db.dirty.clear(); db.uploads.clear();
    db.head = await gh.head(); db.tree = await gh.tree(db.head.tree);
    for (const [p, f] of db.files) if (db.tree.has(p)) f.sha = db.tree.get(p);
    updateBar();
    toast('게시했습니다. 1~2분 후 사이트에 반영됩니다.', 'ok');
    if (current === 'dashboard') route();
  } catch (e) {
    toast('게시 실패: ' + e.message, 'error');
  } finally { btn.disabled = false; btn.textContent = '게시하기'; }
}

/* ---------- 모달 ---------- */
function openModal({ title, body, actions }) {
  const m = $('#modal'); $('#modal-title').textContent = title;
  const b = $('#modal-body'); b.replaceChildren(body);
  const f = $('#modal-foot'); f.replaceChildren(...actions.filter(Boolean));
  m.showModal(); return m;
}
const closeModal = () => $('#modal').close();
$('#modal-form').addEventListener('submit', e => { if (e.submitter?.value !== 'cancel') e.preventDefault(); });

/* ---------- 폼 필드 ---------- */
const getPath = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const setPath = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { a[k] ??= {}; a = a[k]; }); a[ks.at(-1)] = v; };

function fieldInput(f, item) {
  const v = f.get ? f.get(item) : getPath(item, f.key);
  const id = 'f-' + f.key.replace(/\W/g, '-');
  const wrap = el('div', { class: 'field' + (f.full ? ' full' : '') });
  let read;
  if (f.type === 'checkbox') {
    const inp = el('input', { type: 'checkbox', id }); inp.checked = !!v;
    wrap.append(el('label', { class: 'check', for: id }, inp, f.label)); read = () => inp.checked;
  } else if (f.type === 'image') {
    let cur = v || '';
    const prev = el('div', { class: 'preview' }); const pathEl = el('span', { class: 'path' });
    const paint = () => { prev.replaceChildren(cur ? el('img', { src: db.imgUrl(cur), alt: '' }) : '이미지 없음'); pathEl.textContent = cur || ''; };
    paint();
    const up = el('button', { type: 'button', class: 'btn sm', onclick: async () => {
      const file = await pickImage(); if (!file) return;
      up.disabled = true; up.textContent = '변환 중…';
      try { cur = (await addUpload(file, { folder: f.folder || 'uploads', maxSide: f.maxSide || 2400 })).path; paint(); f.onUpload?.(cur); }
      catch (e) { toast('이미지 처리 실패: ' + e.message, 'error'); }
      finally { up.disabled = false; up.textContent = '이미지 선택'; }
    } }, '이미지 선택');
    const rm = el('button', { type: 'button', class: 'btn sm ghost', onclick: () => { cur = ''; paint(); } }, '비우기');
    wrap.append(el('span', { class: 'label' }, f.label), el('div', { class: 'img-field' }, prev, el('div', { class: 'img-actions' }, el('div', {}, up, ' ', f.required ? null : rm), pathEl)));
    read = () => cur || null;
  } else if (f.type === 'select') {
    const opts = typeof f.options === 'function' ? f.options(item) : f.options;
    const sel = el('select', { id }, opts.map(o => el('option', { value: o.value }, o.label)));
    sel.value = v ?? opts[0]?.value ?? '';
    wrap.append(el('label', { for: id }, f.label), sel); read = () => sel.value;
  } else if (f.type === 'multi') {
    let vals = clone(v || []);
    const chips = el('div', { class: 'chips' });
    const opts = typeof f.options === 'function' ? f.options() : f.options;
    const sel = el('select', {}, el('option', { value: '' }, '+ 추가…'), opts.map(o => el('option', { value: o.value }, o.label)));
    const paint = () => chips.replaceChildren(...vals.map((x, i) => el('span', { class: 'chip' }, f.chipLabel ? f.chipLabel(x) : x, el('button', { type: 'button', 'aria-label': '삭제', onclick: () => { vals.splice(i, 1); paint(); } }, '×'))));
    sel.addEventListener('change', () => { if (!sel.value) return; const o = opts.find(o => o.value === sel.value); const item = f.toValue ? f.toValue(o) : o.value; if (!vals.some(x => JSON.stringify(x) === JSON.stringify(item))) vals.push(item); sel.value = ''; paint(); });
    paint();
    wrap.append(el('span', { class: 'label' }, f.label), chips, sel); read = () => vals;
  } else {
    const tag = f.type === 'textarea' ? 'textarea' : 'input';
    const inp = el(tag, { id, type: tag === 'input' ? (f.type || 'text') : null, placeholder: f.placeholder, required: f.required, step: f.step });
    inp.value = v ?? '';
    wrap.append(el('label', { for: id }, f.label, f.required ? ' *' : ''), inp);
    read = () => f.type === 'number' ? (inp.value === '' ? null : Number(inp.value)) : inp.value.trim();
  }
  if (f.help) wrap.append(el('span', { class: 'help' }, f.help));
  return { node: wrap, read, f };
}
function buildForm(fields, item) {
  const inputs = fields.map(f => fieldInput(f, item));
  return {
    node: el('div', { class: 'form' }, inputs.map(i => i.node)),
    apply(target) {
      for (const { read, f } of inputs) {
        const val = read();
        if (f.required && (val == null || val === '')) throw new Error(`'${f.label}' 항목을 입력하세요.`);
        if (f.set) f.set(target, val); else setPath(target, f.key, val);
      }
    }
  };
}

/* ---------- 목록 + 편집 (공통) ---------- */
function collectionView(c) {
  return async view => {
    await Promise.all(c.files.map(p => db.load(p)));
    const data = db.data(c.files[0]);
    const state = { q: '', filter: '', page: 0 };
    const per = 30;
    const head = el('div', { class: 'page-head' },
      el('div', {}, el('h1', {}, c.title), el('p', {}, c.desc)),
      el('div', { class: 'head-actions' }, c.headExtra?.(), el('button', { class: 'btn primary', onclick: () => edit(null) }, '+ 새로 추가')));
    const search = el('input', { type: 'search', placeholder: c.searchHint || '검색' });
    const filterSel = c.filters ? el('select', { class: 'filter' }, el('option', { value: '' }, '전체'), c.filters(data).map(o => el('option', { value: o.value }, o.label))) : null;
    const note = el('span', { class: 'count-note' });
    const list = el('div'); const pager = el('div', { class: 'pager' });
    view.replaceChildren(head, c.top?.(data) || '', el('div', { class: 'toolbar' }, el('div', { class: 'search' }, search), filterSel, note), list, pager);
    search.addEventListener('input', () => { state.q = search.value.trim().toLowerCase(); state.page = 0; paint(); });
    filterSel?.addEventListener('change', () => { state.filter = filterSel.value; state.page = 0; paint(); });

    function rows() {
      let items = c.items(data).map((it, i) => ({ it, i }));
      if (state.filter) items = items.filter(({ it }) => c.filterFn(it, state.filter));
      if (state.q) items = items.filter(({ it }) => c.searchText(it).toLowerCase().includes(state.q));
      if (c.sort) items.sort((a, b) => c.sort(a.it, b.it));
      return items;
    }
    function paint() {
      const all = rows(); const pages = Math.max(1, Math.ceil(all.length / per));
      state.page = Math.min(state.page, pages - 1);
      const slice = all.slice(state.page * per, state.page * per + per);
      note.textContent = `${fmt(all.length)}건`;
      if (!slice.length) { list.replaceChildren(el('div', { class: 'card empty' }, '항목이 없습니다.')); pager.replaceChildren(); return; }
      list.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
        el('thead', {}, el('tr', {}, c.columns.map(col => el('th', { class: col.cls }, col.label)))),
        el('tbody', {}, slice.map(({ it }) => el('tr', { onclick: () => edit(it) }, c.columns.map(col => el('td', { class: col.cls }, col.render(it)))))))));
      pager.replaceChildren();
      if (pages > 1) for (let p = 0; p < pages; p++) pager.append(el('button', { class: 'btn sm' + (p === state.page ? ' primary' : ''), onclick: () => { state.page = p; paint(); scrollTo(0, 0); } }, p + 1));
    }
    function edit(item) {
      const isNew = !item; const draft = isNew ? c.blank(data) : clone(item);
      const form = buildForm(c.fields, draft);
      const body = el('div', {}, c.editNote?.(draft) || '', form.node);
      const actions = [
        !isNew && el('button', { type: 'button', class: 'btn danger', onclick: () => {
          if (!confirm(`'${c.label(item)}' 항목을 삭제할까요?`)) return;
          const arr = c.items(data); arr.splice(arr.indexOf(item), 1);
          c.afterChange?.(data, { removed: item }); c.files.forEach(p => db.touch(p)); closeModal(); paint(); toast('삭제했습니다. [게시하기]를 눌러야 사이트에 반영됩니다.');
        } }, '삭제'),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn', onclick: closeModal }, '취소'),
        el('button', { type: 'button', class: 'btn primary', onclick: () => {
          try { form.apply(draft); c.validate?.(draft, data, item); } catch (e) { toast(e.message, 'error'); return; }
          c.normalize?.(draft, data);
          const arr = c.items(data);
          if (isNew) { if (c.insertTop) arr.unshift(draft); else arr.push(draft); }
          else arr[arr.indexOf(item)] = draft;
          c.afterChange?.(data, { saved: draft, previous: item });
          c.files.forEach(p => db.touch(p)); closeModal(); paint();
          toast('저장했습니다. [게시하기]를 눌러야 사이트에 반영됩니다.');
        } }, isNew ? '추가' : '저장')
      ];
      openModal({ title: isNew ? `${c.title} 추가` : c.label(item), body, actions });
    }
    paint();
  };
}

/* ---------- 시공실적 ---------- */
const PF = 'data/portfolio-public.json';
const dateKey = s => { const m = String(s || '').match(/^(\d{2,4})\.(\d{1,2})/); if (!m) return 0; const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]); return y * 100 + Number(m[2]); };
const portfolioView = collectionView({
  title: '시공실적', desc: '시공실적 목록·상세 페이지와 메인 프로젝트 월에 표시되는 프로젝트입니다.',
  files: [PF, 'data/portfolio-summary.json', 'data/public-counts.json'],
  items: d => d.items, label: it => it.name, searchHint: '프로젝트명, 지역 검색',
  searchText: it => [it.name, it.location, it.date, ...(it.categories || []).map(c => c.name)].join(' '),
  sort: (a, b) => dateKey(b.date) - dateKey(a.date) || (Number(b.id) || 0) - (Number(a.id) || 0), insertTop: true,
  filters: d => [...new Set(d.items.map(i => i.region_major).filter(Boolean))].sort().map(v => ({ value: v, label: v })),
  filterFn: (it, v) => it.region_major === v,
  columns: [
    { label: '', render: it => el('img', { class: 'thumb', src: db.imgUrl(it.image), alt: '', loading: 'lazy' }) },
    { label: '프로젝트', render: it => el('div', {}, el('div', { class: 'title' }, it.name), el('div', { class: 'meta' }, `#${it.id}`)) },
    { label: '시기', cls: 'num', render: it => it.date || '-' },
    { label: '지역', cls: 'hide-m', render: it => it.location || '-' },
    { label: '분류', cls: 'hide-m', render: it => (it.categories || []).slice(0, 2).map(c => el('span', { class: 'tag' }, c.name.split('→').pop().trim())) },
    { label: '상세', cls: 'hide-m', render: it => it.materialType === 'content' ? el('span', { class: 'tag ok' }, '콘텐츠') : it.detail ? el('span', { class: 'tag' }, '상세 이미지') : el('span', { class: 'tag gray' }, '썸네일만') }
  ],
  top: () => {
    const s = db.data('data/portfolio-summary.json');
    const inp = el('input', { type: 'number', min: 0, value: s.total, style: 'width:120px' });
    return el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('h2', {}, '메인 화면 "총 프로젝트" 숫자'),
      el('p', { class: 'sub' }, '메인 첫 화면과 시공실적 섹션의 "358건"처럼 보이는 숫자입니다. 비공개 프로젝트까지 포함한 전체 실적 수를 직접 입력합니다.'),
      el('div', { class: 'toolbar', style: 'margin:0' }, inp, el('span', {}, '건'),
        el('button', { class: 'btn', onclick: () => {
          const n = Number(inp.value); if (!Number.isSafeInteger(n) || n < 0) return toast('0 이상의 정수를 입력하세요.', 'error');
          s.total = n; s.generatedAt = new Date().toISOString(); db.touch('data/portfolio-summary.json'); toast('반영 대기 중입니다. [게시하기]를 누르세요.');
        } }, '적용'),
        el('span', { class: 'count-note' }, `공개 등록된 프로젝트: ${fmt(db.data(PF).items.length)}건`)));
  },
  editNote: it => it.materialType === 'content' ? el('div', { class: 'notice' }, '이 프로젝트는 섹션형 상세 콘텐츠(사업개요·콘셉트·도면·시공과정 등)를 가지고 있습니다. 여기서는 기본 정보와 대표 이미지만 수정되며, 상세 콘텐츠는 그대로 유지됩니다.') : null,
  blank: d => ({ id: Math.max(0, ...d.items.map(i => i.id).filter(Number.isInteger)) + 1, portfolioId: uuid(), legacyId: null, materialType: 'image', name: '', date: '', location: '', region_major: '', region_local: '', categories: [], image: null, detail: null, hasDetail: false, source: '', contentVersion: null, projectIds: [], content: null, wallImage: null }),
  fields: [
    { key: 'name', label: '프로젝트명', required: true, full: true },
    { key: 'date', label: '시기', placeholder: '2026.11', help: 'YYYY.MM 형식 (예: 2026.11)' },
    { key: 'location', label: '표시 지역', placeholder: '경기 성남시', help: '목록에 표시되는 짧은 지역명' },
    { key: 'region_major', label: '광역시·도', type: 'select', options: () => [{ value: '', label: '선택 안 함' }, ...[...new Set(db.data(PF).items.map(i => i.region_major).filter(Boolean))].sort().map(v => ({ value: v, label: v }))] },
    { key: 'region_local', label: '시·군·구', placeholder: '성남시' },
    { key: 'categories', label: '분류', type: 'multi', full: true,
      options: () => { const m = new Map(); db.data(PF).items.forEach(i => (i.categories || []).forEach(c => m.set(c.id, c.name))); return [...m].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([id, name]) => ({ value: id, label: name })); },
      toValue: o => ({ id: o.value, name: o.label }), chipLabel: c => c.name.split('→').slice(-2).join('→').trim() },
    { key: 'image', label: '대표 이미지 (목록 썸네일)', type: 'image', full: true, folder: 'portfolio-uploads', maxSide: 1600, required: true },
    { key: 'wallImage', label: '메인 프로젝트 월 이미지', type: 'image', full: true, folder: 'portfolio-uploads', maxSide: 900, help: '비워두면 대표 이미지를 사용합니다.' },
    { key: 'detail', label: '상세 이미지 (세로로 긴 소개 이미지)', type: 'image', full: true, folder: 'portfolio-uploads', maxSide: 2400, help: '프로젝트 상세 페이지에 크게 표시됩니다. 없으면 대표 이미지만 표시됩니다.' }
  ],
  validate: (it) => { if (it.date && !/^\d{2,4}\.\d{1,2}$/.test(it.date)) throw new Error('시기는 2026.11 형식으로 입력하세요.'); if (!it.image) throw new Error('대표 이미지를 선택하세요.'); },
  normalize: it => {
    it.wallImage = it.wallImage || it.image;
    if (it.materialType !== 'content') it.hasDetail = !!it.detail;
    if (it.legacyId == null) it.legacyId = it.id;
  },
  afterChange: d => {
    d.counts = d.counts || {};
    d.counts.total = d.items.length;
    d.counts.image = d.items.filter(i => i.materialType === 'image').length;
    d.counts.content = d.items.filter(i => i.materialType === 'content').length;
    d.counts.thumbnailOnly = d.items.filter(i => i.materialType === 'image' && !i.detail).length;
    d.syncedAt = new Date().toISOString();
    const pc = db.data('data/public-counts.json'); pc.projects = d.items.length; pc.generatedAt = new Date().toISOString();
  }
});

/* ---------- 제품 ---------- */
const MAS = 'data/mas-products.json';
const extraCats = new Map(); // 아직 제품이 없는 새 분류 (게시 전 임시)
const productCats = () => { const m = new Map(); db.data(MAS).items.forEach(i => m.set(i.category.code, i.category.name)); for (const [k, v] of extraCats) if (!m.has(k)) m.set(k, v); return m; };
const productsView = collectionView({
  title: '제품 (MAS 등록제품)', desc: '제품 페이지와 메인 "MAS 등록제품" 섹션에 표시됩니다.',
  files: [MAS], items: d => d.items, label: it => it.code, searchHint: '모델명, 식별번호, 규격 검색',
  searchText: it => [it.code, it.itemNumber, it.specification, it.category?.name].join(' '),
  filters: () => [...productCats()].map(([code, name]) => ({ value: code, label: `${name} (${code})` })),
  filterFn: (it, v) => it.category?.code === v,
  columns: [
    { label: '', render: it => el('img', { class: 'thumb', src: db.imgUrl(it.thumbnail), alt: '', loading: 'lazy', style: 'object-fit:contain' }) },
    { label: '모델명', render: it => el('div', {}, el('div', { class: 'title' }, it.code), el('div', { class: 'meta' }, it.specification || '')) },
    { label: '분류', render: it => el('span', { class: 'tag' }, it.category?.name || '-') },
    { label: '식별번호', cls: 'num hide-m', render: it => it.itemNumber || '-' },
    { label: '가격', cls: 'num', render: it => it.price ? '₩' + fmt(it.price) : '-' }
  ],
  blank: d => { const c = d.items[0]?.category || { code: '', name: '' }; return { id: uuid(), code: '', category: clone(c), specification: '', itemNumber: '', price: '', currency: 'KRW', vatIncluded: true, procurementUrl: '', thumbnail: null }; },
  fields: [
    { key: 'code', label: '모델명', required: true, placeholder: 'OSBE-3017' },
    { key: 'category', label: '분류', type: 'select', get: it => it.category?.code,
      options: () => [...productCats()].map(([code, name]) => ({ value: code, label: `${name} (${code})` })),
      set: (it, v) => { it.category = { code: v, name: productCats().get(v) || v }; } },
    { key: 'specification', label: '규격', full: true, placeholder: 'L 2,100mm x W 500mm x H 1,050mm' },
    { key: 'itemNumber', label: '물품식별번호', placeholder: '25265795' },
    { key: 'price', label: '가격 (원)', type: 'number', get: it => it.price === '' ? '' : Number(it.price), set: (it, v) => { it.price = v == null ? '' : String(Math.round(v)); } },
    { key: 'vatIncluded', label: '부가세 포함 가격', type: 'checkbox' },
    { key: 'procurementUrl', label: '나라장터 상품 링크', type: 'url', full: true, placeholder: 'https://shop.g2b.go.kr/...' },
    { key: 'thumbnail', label: '제품 이미지', type: 'image', full: true, folder: 'mas-uploads', maxSide: 1200, required: true, help: '배경이 없는(흰색/투명) 제품 이미지를 권장합니다.' }
  ],
  validate: (it, d, prev) => {
    if (!it.thumbnail) throw new Error('제품 이미지를 선택하세요.');
    if (d.items.some(x => x !== prev && x.code === it.code)) throw new Error('같은 모델명이 이미 있습니다.');
  },
  headExtra: () => el('button', { class: 'btn', onclick: addProductCategory }, '분류 추가'),
  afterChange: (d, { saved }) => {
    d.count = d.items.length; d.syncedAt = new Date().toISOString();
    if (saved?.thumbnail) for (const k of ['backgroundImages', 'backgroundUniqueImages']) if (Array.isArray(d[k]) && !d[k].includes(saved.thumbnail)) d[k].push(saved.thumbnail);
  }
});
function addProductCategory() {
  const code = prompt('새 분류 코드 (영문 대문자, 예: OSPL)'); if (!code) return;
  const name = prompt('분류 이름 (예: 플랜터)'); if (!name) return;
  const C = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(C)) return toast('코드는 영문 대문자·숫자 2~10자로 입력하세요.', 'error');
  if (productCats().has(C)) return toast('이미 있는 코드입니다.', 'error');
  extraCats.set(C, name.trim());
  toast(`'${name.trim()}' 분류를 만들었습니다. [+ 새로 추가]에서 이 분류로 제품을 등록하세요.`);
  route();
}

/* ---------- 지식재산권 ---------- */
const IP = 'data/intellectual-property.json', IPG = 'data/ip-gallery-policy-v26.json';
const KIND = { patent: '특허', design: '디자인', trademark: '상표' };
const ipView = collectionView({
  title: '지식재산권', desc: '메인 "지식재산권" 섹션의 특허증·디자인 등록 이미지와 개수입니다.',
  files: [IP, IPG, 'data/public-counts.json'], items: d => d.items, label: it => `${KIND[it.kind] || it.kind} · ${it.title}`,
  searchHint: '명칭, 등록번호 검색', searchText: it => [it.title, it.number, it.registrationNumber, it.applicationNumber].join(' '),
  sort: (a, b) => String(b.registrationDate || b.applicationDate || '').localeCompare(String(a.registrationDate || a.applicationDate || '')),
  filters: () => Object.entries(KIND).map(([v, l]) => ({ value: v, label: l })), filterFn: (it, v) => it.kind === v,
  top: d => el('div', { class: 'notice' }, `현재 표시 개수 — 특허 ${d.counts.patent}개 · 디자인 등록 ${d.counts.designRegistration}개 (항목을 추가·삭제하면 자동으로 다시 계산됩니다)`),
  columns: [
    { label: '', render: it => (it.thumbnail || it.image) ? el('img', { class: 'thumb', src: db.imgUrl(it.thumbnail || it.image), alt: '', loading: 'lazy', style: 'object-fit:contain' }) : el('div', { class: 'thumb' }) },
    { label: '명칭', render: it => el('div', {}, el('div', { class: 'title' }, it.title), el('div', { class: 'meta' }, it.registrationNumber || it.number || it.applicationNumber || '')) },
    { label: '구분', render: it => el('span', { class: 'tag' }, KIND[it.kind] || it.kind) },
    { label: '상태', render: it => el('span', { class: 'tag ' + (it.statusLabel === '등록' ? 'ok' : 'gray') }, it.statusLabel || '-') },
    { label: '등록일', cls: 'num hide-m', render: it => it.registrationDate || '-' },
    { label: '노출', cls: 'hide-m', render: it => it.published ? (it.kind === 'design' && db.data(IPG).approvedDesignIds.includes(it.id) ? el('span', { class: 'tag ok' }, '갤러리') : el('span', { class: 'tag' }, '공개')) : el('span', { class: 'tag gray' }, '비공개') }
  ],
  blank: () => { const id = uuid(); return { id, managerId: id, kind: 'patent', rightType: 'PATENT', title: '', number: '', applicationNumber: '', applicationDate: '', registrationNumber: '', registrationDate: '', status: 'unknown', statusLabel: '등록', image: null, url: 'https://www.kipris.or.kr/', verifiedAt: new Date().toISOString(), publicationEvidence: { kind: 'official_gazette', number: null, date: null }, published: true, linkedProducts: [], thumbnail: null }; },
  fields: [
    { key: 'kind', label: '구분', type: 'select', options: Object.entries(KIND).map(([v, l]) => ({ value: v, label: l })) },
    { key: 'statusLabel', label: '상태', type: 'select', options: ['등록', '출원', '소멸', '거절'].map(v => ({ value: v, label: v })) },
    { key: 'title', label: '명칭', required: true, full: true },
    { key: 'applicationNumber', label: '출원번호' },
    { key: 'applicationDate', label: '출원일', type: 'date' },
    { key: 'registrationNumber', label: '등록번호' },
    { key: 'registrationDate', label: '등록일', type: 'date' },
    { key: 'url', label: '확인 링크 (키프리스 등)', type: 'url', full: true },
    { key: 'image', label: '특허증·등록증 이미지', type: 'image', folder: 'ip-uploads', maxSide: 1600, full: true, help: '특허는 이 이미지가 메인 특허증 레인에 표시됩니다.' },
    { key: 'thumbnail', label: '디자인 이미지 (갤러리용)', type: 'image', folder: 'ip-uploads', maxSide: 900, full: true, help: '디자인은 이 이미지가 메인 디자인 갤러리에 표시됩니다.' },
    { key: 'published', label: '사이트에 공개', type: 'checkbox' },
    { key: '__gallery', label: '디자인 갤러리에 노출 (디자인 + 이미지 필요)', type: 'checkbox', get: it => db.data(IPG).approvedDesignIds.includes(it.id), set: (it, v) => { it.__gallery = v; } }
  ],
  validate: it => { if (it.kind === 'design' && it.__gallery && !it.thumbnail) throw new Error('갤러리에 노출하려면 디자인 이미지가 필요합니다.'); },
  normalize: it => {
    it.rightType = (it.kind || '').toUpperCase(); it.number = it.registrationNumber || it.applicationNumber || '';
    const g = db.data(IPG).approvedDesignIds; const want = it.kind === 'design' && it.__gallery;
    const i = g.indexOf(it.id); if (want && i < 0) g.push(it.id); if (!want && i >= 0) g.splice(i, 1);
    delete it.__gallery;
  },
  afterChange: (d, { removed }) => {
    if (removed) { const g = db.data(IPG).approvedDesignIds; const i = g.indexOf(removed.id); if (i >= 0) g.splice(i, 1); }
    const pub = d.items;
    d.counts.patent = pub.filter(i => i.kind === 'patent').length;
    d.counts.designRegistration = pub.filter(i => i.kind === 'design').length;
    d.counts.designPublished = pub.filter(i => i.kind === 'design' && i.published).length;
    d.counts.total = pub.length; d.syncedAt = new Date().toISOString();
    const pc = db.data('data/public-counts.json'); pc.patents = d.counts.patent; pc.designRegistrations = d.counts.designRegistration;
  }
});

/* ---------- 메인 문구 ---------- */
const CS = 'data/comment-styles.json';
async function copyView(view) {
  await db.load(CS); const d = db.data(CS);
  view.replaceChildren(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, '메인 문구'), el('p', {}, '메인 화면 각 장면의 문구와 글자 스타일입니다. 줄바꿈은 입력한 그대로 표시됩니다.'))),
    ...d.scenes.map(scene => el('div', { class: 'card scene' },
      el('div', { class: 'scene-head' }, scene.background ? el('img', { src: db.imgUrl(scene.background), alt: '' }) : null, el('div', {}, el('h2', {}, scene.label), el('p', { class: 'sub', style: 'margin:0' }, `문구 ${scene.blocks.length}개`))),
      scene.blocks.map(b => blockEditor(b))
    ))
  );
  function blockEditor(b) {
    const ta = el('textarea', { rows: Math.max(2, (b.text.match(/\n/g) || []).length + 1) }); ta.value = b.text;
    ta.addEventListener('input', () => { b.text = ta.value; db.touch(CS); });
    const parts = [el('div', { class: 'block-head' }, el('strong', {}, b.label), el('span', { class: 'tag gray' }, { type: '타이핑', rise: '떠오름', 'multi-type': '연속 타이핑' }[b.animation?.mode] || '정적'))];
    parts.push(el('div', { class: 'field' }, el('span', { class: 'label' }, '모바일·기본 문구'), ta));
    if ('desktopText' in b) {
      const tb = el('textarea', { rows: Math.max(2, (b.desktopText.match(/\n/g) || []).length + 1) }); tb.value = b.desktopText;
      tb.addEventListener('input', () => { b.desktopText = tb.value; db.touch(CS); });
      parts.push(el('div', { class: 'field', style: 'margin-top:8px' }, el('span', { class: 'label' }, 'PC 화면 문구'), tb));
    }
    const s = b.style || (b.style = {});
    const color = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ffffff' });
    color.addEventListener('input', () => { s.color = color.value; db.touch(CS); });
    const num = (k, label, min, max, step = 1) => { const i = el('input', { type: 'number', min, max, step, value: s[k] }); i.addEventListener('input', () => { if (i.value !== '') { s[k] = Number(i.value); db.touch(CS); } }); return el('div', { class: 'field' }, el('label', {}, label), i); };
    const weight = el('select', {}, [300, 400, 500, 600, 700].map(w => el('option', { value: w }, { 300: '가늘게', 400: '보통', 500: '중간', 600: '굵게', 700: '아주 굵게' }[w])));
    weight.value = s.weight; weight.addEventListener('change', () => { s.weight = Number(weight.value); db.touch(CS); });
    parts.push(el('div', { class: 'style-row' }, el('div', { class: 'field', style: 'width:auto' }, el('label', {}, '색상'), color),
      num('desktopSize', 'PC 크기(px)', 10, 120), num('mobileSize', '모바일 크기(px)', 10, 80), num('lineHeight', '줄 간격', 1, 3, .05),
      el('div', { class: 'field' }, el('label', {}, '굵기'), weight)));
    return el('div', { class: 'block' }, parts);
  }
}

/* ---------- 메인 배경 이미지 ---------- */
const HS = 'data/hero-slide-groups-v47.json';
const SCENE_NAMES = { home: '01 · 첫 화면', about: '02 · 우리가 만드는 공간', approach: '03 · 공공디자인', awning: '04 · 스케이프어닝' };
async function heroView(view) {
  await db.load(HS); const d = db.data(HS);
  const byGroup = Object.fromEntries(Object.entries(d.assignment || {}).map(([scene, g]) => [g, scene]));
  const paint = () => view.replaceChildren(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, '메인 배경 이미지'), el('p', {}, '메인 화면 각 장면에서 번갈아 보이는 배경 사진입니다. 가로 사진(16:10 이상, 2,400px 이상)을 권장합니다. 모바일용은 자동으로 만들어집니다.'))),
    ...Object.entries(d.groups).map(([g, list]) => el('div', { class: 'card' },
      el('h2', {}, SCENE_NAMES[byGroup[g]] || `그룹 ${g}`), el('p', { class: 'sub' }, `${list.length}장 · 순서대로가 아니라 무작위로 교차 표시됩니다.`),
      el('div', { class: 'hero-grid' },
        list.map((img, i) => el('div', { class: 'hero-item' }, el('img', { src: db.imgUrl(img.image), alt: '', loading: 'lazy' }),
          el('div', { class: 'row' }, el('span', { class: 'meta count-note' }, img.width ? `${img.width}×${img.height}` : ''),
            el('span', {}, el('button', { class: 'btn sm', onclick: () => replace(g, i) }, '교체'), ' ',
              el('button', { class: 'btn sm danger', disabled: list.length <= 1, onclick: () => { if (confirm('이 배경 이미지를 뺄까요?')) { list.splice(i, 1); db.touch(HS); paint(); } } }, '삭제'))))),
        el('button', { class: 'hero-add', onclick: () => replace(g, -1) }, '+ 이미지 추가'))
    ))
  );
  async function replace(g, i) {
    const file = await pickImage(); if (!file) return;
    toast('이미지를 변환하는 중입니다…');
    try {
      const desk = await addUpload(file, { folder: 'hero-uploads', maxSide: 2880, suffix: '-desktop' });
      const mob = await addUpload(file, { folder: 'hero-uploads', maxSide: 1400, suffix: '-mobile' });
      const entry = { image: desk.path, mobile: mob.path, source: file.name, width: desk.width, height: desk.height, sha256: hex(32) };
      if (i < 0) d.groups[g].push(entry); else d.groups[g][i] = entry;
      // 메인 문구의 장면 배경(첫 장)도 맞춰 둠
      db.touch(HS); paint(); toast('추가했습니다. [게시하기]를 눌러야 반영됩니다.');
    } catch (e) { toast('이미지 처리 실패: ' + e.message, 'error'); }
  }
  paint();
}

/* ---------- 회사 정보 · 문구 찾아 바꾸기 ---------- */
const HTML_PAGES = ['index.html', 'products.html', 'portfolio-projects.html', 'portfolio-categories.html', 'portfolio-years.html', 'project.html', 'public-design-detail.html', 'scape-awning-detail.html', 'fountain-detail.html'];
async function companyView(view) {
  await Promise.all([...HTML_PAGES.map(p => db.load(p, { json: false })), db.load('data/locations.json')]);
  const idx = db.data('index.html');
  const pick = re => (idx.match(re) || [])[1]?.trim() || '';
  const info = [
    { key: 'ceo', label: '대표', value: pick(/대표 : ([^<]+)</) , wrap: v => `대표 : ${v}<` },
    { key: 'hq', label: '본사 주소 (하단)', value: pick(/본사 : ([^<]+)</), wrap: v => `본사 : ${v}<` },
    { key: 'factory', label: '공장 주소 (하단)', value: pick(/공장 : ([^<]+)</), wrap: v => `공장 : ${v}<` },
    { key: 'tel', label: '대표 전화', value: pick(/전화 : <a[^>]*>([^<]+)</), phone: true },
    { key: 'fax', label: '팩스', value: pick(/팩스 : ([^<]+)</), wrap: v => `팩스 : ${v}<` },
    { key: 'biz', label: '사업자 등록번호', value: pick(/사업자 등록번호 : ([^<]+)</), wrap: v => `사업자 등록번호 : ${v}<` },
    { key: 'email', label: '이메일', value: pick(/mailto:([^"]+)"/), email: true }
  ];
  const inputs = info.map(f => { const i = el('input', { type: 'text', value: f.value }); return { f, i }; });
  const locs = db.data('data/locations.json');
  const locInputs = locs.map(l => ({ l, i: el('input', { type: 'text', value: l.address }) }));

  const findIn = el('input', { type: 'text', placeholder: '찾을 문구' }), repIn = el('input', { type: 'text', placeholder: '바꿀 문구' });
  const results = el('div', { class: 'replace-results' });

  view.replaceChildren(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, '회사 정보 · 문구 바꾸기'), el('p', {}, '사이트 모든 페이지 하단과 문의 섹션에 들어가는 회사 정보입니다.'))),
    el('div', { class: 'card' }, el('h2', {}, '회사 정보'), el('p', { class: 'sub' }, '바꾼 값은 모든 페이지에서 같은 문구를 찾아 한꺼번에 바뀝니다.'),
      el('div', { class: 'form' }, inputs.map(({ f, i }) => el('div', { class: 'field' + (f.key === 'hq' || f.key === 'factory' ? ' full' : '') }, el('label', {}, f.label), i))),
      el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn primary', onclick: applyInfo }, '회사 정보 적용'))),
    el('div', { class: 'card' }, el('h2', {}, '오시는 길 (지도 아래 주소)'), el('p', { class: 'sub' }, '문의 섹션의 사무실·공장 주소 표시입니다.'),
      el('div', { class: 'form' }, locInputs.map(({ l, i }) => el('div', { class: 'field full' }, el('label', {}, l.name), i))),
      el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn primary', onclick: applyLoc }, '주소 적용'))),
    el('div', { class: 'card' }, el('h2', {}, '사이트 전체 문구 찾아 바꾸기'), el('p', { class: 'sub' }, '페이지에 직접 쓰여 있는 문구(소개글, 사업분야 설명 등)를 모든 HTML 페이지에서 찾아 바꿉니다. 먼저 [찾기]로 몇 군데인지 확인하세요.'),
      el('div', { class: 'form' }, el('div', { class: 'field' }, el('label', {}, '찾을 문구'), findIn), el('div', { class: 'field' }, el('label', {}, '바꿀 문구'), repIn)),
      el('div', { class: 'toolbar', style: 'margin:14px 0 0' }, el('button', { class: 'btn', onclick: () => doFind(false) }, '찾기'), el('button', { class: 'btn primary', onclick: () => doFind(true) }, '모두 바꾸기')),
      results)
  );

  function replaceAll(from, to) {
    if (!from || from === to) return 0; let total = 0; const re = new RegExp(escapeRe(from), 'g');
    for (const p of HTML_PAGES) { const t = db.data(p); const n = (t.match(re) || []).length; if (n) { db.setText(p, t.replace(re, to)); total += n; } }
    return total;
  }
  function applyInfo() {
    let n = 0;
    for (const { f, i } of inputs) {
      const v = i.value.trim(); if (!v || v === f.value) continue;
      if (f.phone) {
        const digits = s => s.replace(/\D/g, '');
        n += replaceAll('tel:' + digits(f.value), 'tel:' + digits(v));
        n += replaceAll(f.value, v);
        n += replaceAll(f.value.replace(/-/g, '–'), v.replace(/-/g, '–'));
      } else if (f.email) { n += replaceAll(f.value, v); }
      else { n += replaceAll(f.wrap(f.value), f.wrap(v)); }
      f.value = v;
    }
    toast(n ? `${n}곳을 바꿨습니다. [게시하기]를 누르세요.` : '바뀐 내용이 없습니다.');
  }
  function applyLoc() {
    let n = 0;
    for (const { l, i } of locInputs) {
      const v = i.value.trim(); if (!v || v === l.address) continue;
      n += replaceAll(l.address, v); l.address = v; n++;
    }
    db.touch('data/locations.json');
    toast(n ? '주소를 바꿨습니다. [게시하기]를 누르세요.' : '바뀐 내용이 없습니다.');
  }
  function doFind(apply) {
    const from = findIn.value; if (!from) return toast('찾을 문구를 입력하세요.', 'error');
    const re = new RegExp(escapeRe(from), 'g');
    const hits = HTML_PAGES.map(p => [p, (db.data(p).match(re) || []).length]).filter(x => x[1]);
    if (!hits.length) { results.replaceChildren(el('p', { class: 'count-note' }, '찾은 곳이 없습니다. 줄바꿈(<br>)이 있는 문구는 한 줄씩 나눠서 찾아보세요.')); return; }
    if (apply) {
      const n = replaceAll(from, repIn.value);
      results.replaceChildren(el('p', {}, `${n}곳을 바꿨습니다. [게시하기]를 눌러야 반영됩니다.`));
    } else results.replaceChildren(el('ul', {}, hits.map(([p, n]) => el('li', {}, `${p} — ${n}곳`))));
  }
}

/* ---------- 대시보드 ---------- */
async function dashboardView(view) {
  const files = [PF, MAS, IP, 'data/portfolio-summary.json'];
  await Promise.all(files.map(p => db.load(p)));
  const pf = db.data(PF), mas = db.data(MAS), ip = db.data(IP), sum = db.data('data/portfolio-summary.json');
  const stat = (label, value, hint, href) => el('a', { class: 'stat', href }, el('div', { class: 'label' }, label), el('div', { class: 'value' }, value), el('div', { class: 'hint' }, hint));
  const history = el('ul', { class: 'history' }, el('li', {}, el('span', { class: 'count-note' }, db.connected ? '불러오는 중…' : 'GitHub에 연결하면 게시 이력이 보입니다.')));
  const siteUrl = new URL('../', location.href).href;
  view.replaceChildren(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, '대시보드'), el('p', {}, '원스케이프 사이트 콘텐츠 현황입니다.')),
      el('div', { class: 'head-actions' }, el('a', { class: 'btn', href: siteUrl, target: '_blank', rel: 'noopener' }, '사이트 열기 ↗'))),
    !db.connected ? el('div', { class: 'notice warn' }, '지금은 읽기 전용입니다. 수정 내용을 사이트에 게시하려면 ', el('a', { href: '#settings' }, '설정'), '에서 GitHub 토큰을 연결하세요.') : '',
    el('div', { class: 'grid-stats' },
      stat('총 프로젝트 (메인 표시)', fmt(sum.total), `공개 등록 ${fmt(pf.items.length)}건`, '#portfolio'),
      stat('MAS 등록제품', fmt(mas.items.length), `${new Set(mas.items.map(i => i.category.code)).size}개 분류`, '#products'),
      stat('특허', fmt(ip.counts.patent), '메인 지식재산권', '#ip'),
      stat('디자인 등록', fmt(ip.counts.designRegistration), '소멸 포함', '#ip')),
    el('div', { class: 'two' },
      el('div', { class: 'card' }, el('h2', {}, '최근 게시 이력'), el('p', { class: 'sub' }, `${cfg.owner}/${cfg.repo} · ${cfg.branch}`), history),
      el('div', { class: 'card' }, el('h2', {}, '사용 방법'),
        el('ol', { style: 'margin:0;padding-left:18px;color:var(--muted)' },
          el('li', {}, '왼쪽 메뉴에서 바꿀 항목을 고르고 수정합니다.'),
          el('li', {}, '수정한 내용은 아래 검은 막대에 모입니다. 여러 개를 한꺼번에 고쳐도 됩니다.'),
          el('li', {}, '[게시하기]를 누르면 GitHub에 저장되고, 1~2분 뒤 사이트에 반영됩니다.'),
          el('li', {}, '사이트를 열어 둔 방문자 화면도 반영되면 자동으로 새로고침됩니다.'))))
  );
  if (db.connected) {
    try {
      const commits = await gh.req('GET', gh.repoPath(`/commits?sha=${encodeURIComponent(cfg.branch)}&per_page=8`));
      history.replaceChildren(...commits.map(c => el('li', {}, el('span', {}, c.commit.message.split('\n')[0]), el('span', { class: 'when' }, new Date(c.commit.author.date).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })))));
    } catch (e) { history.replaceChildren(el('li', {}, el('span', { class: 'count-note' }, '이력을 불러오지 못했습니다: ' + e.message))); }
  }
}

/* ---------- 설정 ---------- */
async function settingsView(view) {
  const owner = el('input', { type: 'text', value: cfg.owner }), repo = el('input', { type: 'text', value: cfg.repo }), branch = el('input', { type: 'text', value: cfg.branch });
  const token = el('input', { type: 'password', value: cfg.token, placeholder: 'github_pat_…', autocomplete: 'off' });
  const api = el('input', { type: 'url', value: cfg.api });
  const persist = el('input', { type: 'checkbox', id: 'persist' }); try { persist.checked = !!localStorage.getItem('os-admin-token'); } catch {}
  const status = el('div');
  const tokenUrl = 'https://github.com/settings/personal-access-tokens/new';
  view.replaceChildren(
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, '설정'), el('p', {}, '관리자 페이지는 GitHub 저장소에 직접 저장합니다. 저장소에 쓸 수 있는 토큰이 필요합니다.'))),
    el('div', { class: 'card' }, el('h2', {}, 'GitHub 연결'),
      el('div', { class: 'notice' }, el('strong', {}, '토큰 만드는 법'),
        el('ol', {},
          el('li', {}, el('a', { href: tokenUrl, target: '_blank', rel: 'noopener' }, 'GitHub → Fine-grained token 만들기'), ' 를 엽니다.'),
          el('li', {}, 'Repository access → ', el('b', {}, 'Only select repositories'), ' → ', el('b', {}, `${cfg.repo}`), ' 선택'),
          el('li', {}, 'Permissions → Repository permissions → ', el('b', {}, 'Contents: Read and write'), ' (Metadata는 자동으로 Read)'),
          el('li', {}, '만든 토큰(github_pat_…)을 아래에 붙여넣고 [연결]을 누릅니다.'))),
      el('div', { class: 'form' },
        el('div', { class: 'field' }, el('label', {}, '저장소 소유자'), owner),
        el('div', { class: 'field' }, el('label', {}, '저장소 이름'), repo),
        el('div', { class: 'field' }, el('label', {}, '브랜치'), branch),
        el('div', { class: 'field' }, el('label', {}, 'API 주소'), api, el('span', { class: 'help' }, '보통 바꿀 필요 없습니다.')),
        el('div', { class: 'field full' }, el('label', {}, '액세스 토큰'), token, el('span', { class: 'help' }, '토큰은 이 브라우저에만 저장되고 GitHub 외 다른 곳으로 전송되지 않습니다.')),
        el('div', { class: 'field full' }, el('label', { class: 'check', for: 'persist' }, persist, '이 기기에서 로그인 유지 (공용 PC에서는 끄세요)'))),
      el('div', { class: 'toolbar', style: 'margin:16px 0 0' },
        el('button', { class: 'btn primary', onclick: connect }, '연결'),
        el('button', { class: 'btn', onclick: () => { cfg.token = ''; token.value = ''; saveCfg(false); db.connected = false; db.files.clear(); setConn(); status.replaceChildren(el('div', { class: 'notice' }, '연결을 해제했습니다.')); } }, '연결 해제')),
      status)
  );
  if (db.connected) status.replaceChildren(el('div', { class: 'notice', style: 'margin:14px 0 0' }, `연결됨 — ${cfg.owner}/${cfg.repo} (${cfg.branch})`));
  async function connect() {
    if (db.dirty.size || db.uploads.size) { if (!confirm('게시하지 않은 변경사항이 사라집니다. 계속할까요?')) return; db.discard(); }
    Object.assign(cfg, { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || 'main', api: api.value.trim() || 'https://api.github.com', token: token.value.trim() });
    saveCfg(persist.checked);
    status.replaceChildren(el('div', { class: 'loading', style: 'padding:16px' }, el('span', { class: 'spinner' }), '연결 확인 중…'));
    try {
      const r = await gh.req('GET', gh.repoPath());
      if (r.permissions && !r.permissions.push) throw new Error('이 토큰은 저장소에 쓸 권한이 없습니다. Contents: Read and write 권한을 주세요.');
      db.files.clear(); await db.connect(); setConn();
      status.replaceChildren(el('div', { class: 'notice', style: 'margin:14px 0 0' }, `연결됨 — ${r.full_name} (${cfg.branch}). 이제 수정 후 게시할 수 있습니다.`));
      toast('GitHub에 연결했습니다.', 'ok');
    } catch (e) {
      db.connected = false; setConn();
      const hint = e.status === 401 ? '토큰이 올바르지 않거나 만료되었습니다.' : e.status === 404 ? '저장소를 찾을 수 없습니다. 이름과 토큰의 저장소 권한을 확인하세요.' : e.message;
      status.replaceChildren(el('div', { class: 'notice err', style: 'margin:14px 0 0' }, '연결 실패: ' + hint));
    }
  }
}
function setConn() { const c = $('#conn'); c.className = 'conn' + (db.connected ? ' on' : ''); c.textContent = db.connected ? `${cfg.repo} 연결됨` : '읽기 전용'; }

/* ---------- 라우터 ---------- */
const VIEWS = { dashboard: dashboardView, copy: copyView, hero: heroView, portfolio: portfolioView, products: productsView, ip: ipView, company: companyView, settings: settingsView };
let current = '';
async function route() {
  const name = (location.hash.slice(1) || 'dashboard');
  current = VIEWS[name] ? name : 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === current));
  const view = $('#view'); view.replaceChildren(el('div', { class: 'loading' }, el('span', { class: 'spinner' }), '불러오는 중…'));
  try { await VIEWS[current](view); }
  catch (e) { view.replaceChildren(el('div', { class: 'notice err' }, '불러오기 실패: ' + e.message)); }
}
window.addEventListener('hashchange', route);
$('#publish').addEventListener('click', publish);
$('#discard').addEventListener('click', () => { if (confirm('게시하지 않은 변경사항을 모두 되돌릴까요?')) { db.discard(); route(); toast('되돌렸습니다.'); } });

(async () => {
  setConn();
  if (cfg.token) {
    try { await db.connect(); } catch (e) { toast('GitHub 연결 실패: ' + e.message + ' — 설정을 확인하세요.', 'error'); }
    setConn();
  }
  route();
})();
})();
