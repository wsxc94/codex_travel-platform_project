'use strict';
/**
 * public/app.js를 브라우저 없이 실행해 보는 최소 DOM 흉내(테스트 전용, 외부 패키지 없음).
 *
 * 목적: "첫 화면을 열기만 해도 유료 API를 부르지 않는가"를 실제 부팅 코드로 확인한다.
 *  - index.html의 요소(id·class·value·select 옵션)를 평평한 목록으로 만든다.
 *  - fetch는 기록만 하고 준비된 가짜 응답을 준다(네트워크 없음).
 *  - setTimeout/setInterval은 가상 시계로 돌린다(최대 horizonMs까지).
 *  - element.click()은 등록된 click 리스너와 document 위임 리스너를 실제로 부른다
 *    → 부팅 코드가 버튼을 자동으로 누르면 그 결과 fetch까지 잡힌다.
 * 완전한 DOM이 아니므로 결과는 "부팅 경로가 무엇을 호출하는가"에만 쓴다.
 */
const vm = require('vm');
const nodeCrypto = require('crypto');

function camelCase(s) {
  return String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseAttrs(text) {
  const attrs = {};
  const re = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(text))) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

// "a.b#c[d=e]" 같은 단순 선택자 하나(조합자 없음)를 해석한다.
function parseCompound(sel) {
  const out = { tag: '', id: '', classes: [], attrs: [] };
  const s = String(sel || '').trim();
  const re = /(^[a-zA-Z][a-zA-Z0-9-]*)|#([A-Za-z0-9_-]+)|\.([A-Za-z0-9_-]+)|\[([^\]=~|^$*]+)(?:[~|^$*]?=\s*["']?([^"'\]]*)["']?)?\]|(:[a-z-]+(?:\([^)]*\))?)/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(s))) {
    if (m.index !== consumed) return null;
    consumed = re.lastIndex;
    if (m[1]) out.tag = m[1].toUpperCase();
    else if (m[2]) out.id = m[2];
    else if (m[3]) out.classes.push(m[3]);
    else if (m[4]) out.attrs.push({ name: m[4].trim().toLowerCase(), value: m[5] });
    // 가상 클래스(:checked 등)는 무시
  }
  if (consumed !== s.length) return null;
  return out;
}

function matchesCompound(el, c) {
  if (!c) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    const v = el.getAttribute(a.name);
    if (v === null || v === undefined) return false;
    if (a.value !== undefined && String(v) !== a.value) return false;
  }
  return true;
}

// 쉼표 목록 지원, 자손 선택자는 마지막 단순 선택자만 본다(평평한 DOM이므로).
function matchesSelector(el, selector) {
  return String(selector || '').split(',').some((part) => {
    const pieces = part.trim().split(/\s*[\s>+~]\s*/).filter(Boolean);
    if (pieces.length === 0) return false;
    return matchesCompound(el, parseCompound(pieces[pieces.length - 1]));
  });
}

class FakeClassList {
  constructor(owner) { this._owner = owner; this._set = new Set(); }
  add(...c) { c.forEach((x) => x && this._set.add(String(x))); }
  remove(...c) { c.forEach((x) => this._set.delete(String(x))); }
  toggle(c, force) {
    const on = force === undefined ? !this._set.has(c) : Boolean(force);
    if (on) this._set.add(c); else this._set.delete(c);
    return on;
  }
  contains(c) { return this._set.has(String(c)); }
  replace(a, b) { if (this._set.delete(a)) { this._set.add(b); return true; } return false; }
  item(i) { return [...this._set][i] || null; }
  get length() { return this._set.size; }
  forEach(fn) { [...this._set].forEach(fn); }
  toString() { return [...this._set].join(' '); }
  [Symbol.iterator]() { return this._set.values(); }
}

function makeStyle() {
  const store = {};
  const api = {
    setProperty(k, v) { store[k] = String(v); },
    removeProperty(k) { const v = store[k]; delete store[k]; return v || ''; },
    getPropertyValue(k) { return store[k] || ''; }
  };
  return new Proxy(store, {
    get(target, prop) {
      if (prop in api) return api[prop];
      if (typeof prop === 'symbol') return undefined;
      return prop in target ? target[prop] : '';
    },
    set(target, prop, value) { target[prop] = String(value); return true; }
  });
}

function createBrowser({ html = '', fetchRoutes = {}, location = 'http://localhost:13581/', horizonMs = 15000 } = {}) {
  const env = {
    fetchCalls: [],
    scriptSrcs: [],
    clicks: [],
    errors: [],
    dialogs: [],
    elements: [],
    byId: new Map(),
    docListeners: {},
    winListeners: {},
    timers: [],
    timerSeq: 1,
    now: 0
  };

  class FakeElement {
    constructor(tag, attrs = {}) {
      this.tagName = String(tag || 'div').toUpperCase();
      this.nodeName = this.tagName;
      this.nodeType = 1;
      this._attrs = {};
      this._listeners = {};
      this.classList = new FakeClassList(this);
      this.style = makeStyle();
      this.dataset = {};
      this.children = [];
      this.childNodes = [];
      this.options = [];
      this.selectedIndex = 0;
      this.parentNode = null;
      this.parentElement = null;
      this._id = '';
      this._value = '';
      this._innerHTML = '';
      this.textContent = '';
      this.innerText = '';
      this.checked = false;
      this.disabled = false;
      this.hidden = false;
      this.files = [];
      this.isConnected = true;
      this.offsetWidth = 0; this.offsetHeight = 0; this.clientWidth = 0; this.clientHeight = 0;
      this.scrollWidth = 0; this.scrollHeight = 0; this.scrollTop = 0; this.scrollLeft = 0;
      this.onload = null; this.onerror = null; this.onclick = null;
      for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
    }
    get id() { return this._id; }
    set id(v) { this._id = String(v || ''); this._attrs.id = this._id; if (this._id) env.byId.set(this._id, this); }
    get className() { return this.classList.toString(); }
    set className(v) { this.classList = new FakeClassList(this); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
    get value() {
      if (this.tagName === 'SELECT' && !this._valueSet && this.options.length) {
        const sel = this.options.find((o) => o.selected) || this.options[0];
        return sel ? sel.value : '';
      }
      return this._value;
    }
    set value(v) { this._value = v === null || v === undefined ? '' : String(v); this._valueSet = true; }
    get innerHTML() { return this._innerHTML; }
    set innerHTML(v) {
      this._innerHTML = String(v === null || v === undefined ? '' : v);
      // 예전 자식은 문서에서 떨어진 것으로 본다(선택자 검색에서 빠짐).
      const dropAll = (n) => {
        for (const c of n.children || []) {
          c.isConnected = false;
          if (c.id && env.byId.get(c.id) === c) env.byId.delete(c.id);
          dropAll(c);
        }
      };
      dropAll(this);
      this.children = [];
      this.childNodes = [];
      // 새 내용 안의 id 있는 요소를 등록한다(부팅 코드가 innerHTML로 만든 뒤 getElementById로 찾는 경우).
      const re = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
      let m;
      while ((m = re.exec(this._innerHTML))) {
        const attrs = parseAttrs(m[2]);
        const child = new FakeElement(m[1], attrs);
        child.parentNode = this;
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
        env.elements.push(child);
      }
    }
    get outerHTML() { return `<${this.tagName.toLowerCase()}>${this._innerHTML}</${this.tagName.toLowerCase()}>`; }
    get src() { return this._attrs.src || ''; }
    set src(v) { this._attrs.src = String(v); if (this.tagName === 'SCRIPT') env.scriptSrcs.push(String(v)); }
    get href() { return this._attrs.href || ''; }
    set href(v) { this._attrs.href = String(v); }
    get type() { return this._attrs.type || ''; }
    set type(v) { this._attrs.type = String(v); }
    get name() { return this._attrs.name || ''; }
    set name(v) { this._attrs.name = String(v); }
    get title() { return this._attrs.title || ''; }
    set title(v) { this._attrs.title = String(v); }
    get placeholder() { return this._attrs.placeholder || ''; }
    set placeholder(v) { this._attrs.placeholder = String(v); }
    get alt() { return this._attrs.alt || ''; }
    set alt(v) { this._attrs.alt = String(v); }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get childElementCount() { return this.children.length; }
    get nextSibling() { return null; }
    get previousSibling() { return null; }
    get nextElementSibling() { return null; }
    get previousElementSibling() { return null; }
    get ownerDocument() { return env.document; }
    get selectedOptions() { return this.options.filter((o) => o.selected); }
    setAttribute(name, value) {
      const n = String(name).toLowerCase();
      const v = String(value === undefined ? '' : value);
      if (n === 'id') { this.id = v; return; }
      if (n === 'class') { this.className = v; this._attrs.class = v; return; }
      this._attrs[n] = v;
      if (n.startsWith('data-')) this.dataset[camelCase(n.slice(5))] = v;
      if (n === 'value') this._value = v;
      if (n === 'checked') this.checked = true;
      if (n === 'disabled') this.disabled = true;
      if (n === 'hidden') this.hidden = true;
      if (n === 'src' && this.tagName === 'SCRIPT') env.scriptSrcs.push(v);
    }
    getAttribute(name) {
      const n = String(name).toLowerCase();
      if (n === 'class') return this.className || (this._attrs.class ?? null);
      return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null;
    }
    removeAttribute(name) { delete this._attrs[String(name).toLowerCase()]; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this._attrs, String(name).toLowerCase()); }
    toggleAttribute(name, force) {
      const has = this.hasAttribute(name);
      const on = force === undefined ? !has : Boolean(force);
      if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
      return on;
    }
    addEventListener(type, fn) { if (typeof fn === 'function') (this._listeners[type] ||= []).push(fn); }
    removeEventListener(type, fn) { const l = this._listeners[type]; if (l) this._listeners[type] = l.filter((x) => x !== fn); }
    dispatchEvent(evt) {
      const e = evt && typeof evt === 'object' ? evt : makeEvent(String(evt));
      if (!e.target) e.target = this;
      e.currentTarget = this;
      for (const fn of [...(this._listeners[e.type] || [])]) safeCall(fn, this, e);
      const handler = this['on' + e.type];
      if (typeof handler === 'function') safeCall(handler, this, e);
      if (e.bubbles && !e._stopped) dispatchDocument(e);
      return !e.defaultPrevented;
    }
    click() {
      env.clicks.push(this.id || this.className || this.tagName);
      this.dispatchEvent(makeEvent('click', { bubbles: true, target: this }));
    }
    focus() {} blur() {} select() {} scrollIntoView() {} scrollTo() {} scrollBy() {}
    showModal() {} show() {} close() {} requestFullscreen() {} setSelectionRange() {} reset() {} submit() {}
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
    getClientRects() { return []; }
    appendChild(child) {
      if (child && typeof child === 'object') {
        if (child.nodeType === 11) { (child.childNodes || []).forEach((c) => this.appendChild(c)); return child; }
        child.parentNode = this;
        child.parentElement = this;
        this.childNodes.push(child);
        if (child.nodeType === 1) {
          this.children.push(child);
          if (child.tagName === 'OPTION' && this.tagName === 'SELECT') this.options.push(child);
        }
      }
      return child;
    }
    append(...nodes) { nodes.forEach((n) => { if (n && typeof n === 'object') this.appendChild(n); else if (n !== undefined) this.textContent += String(n); }); }
    prepend(...nodes) { this.append(...nodes); }
    insertBefore(child) { return this.appendChild(child); }
    replaceChildren(...nodes) { this.children = []; this.childNodes = []; this.append(...nodes); }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      this.childNodes = this.childNodes.filter((c) => c !== child);
      return child;
    }
    replaceChild(newChild, oldChild) { this.removeChild(oldChild); this.appendChild(newChild); return oldChild; }
    replaceWith() {}
    insertAdjacentHTML() {}
    insertAdjacentElement(pos, elem) { return elem; }
    insertAdjacentText() {}
    before() {} after() {}
    remove() { if (this.parentNode && this.parentNode.removeChild) this.parentNode.removeChild(this); this.isConnected = false; }
    cloneNode() { const c = new FakeElement(this.tagName, { ...this._attrs, id: '' }); c._innerHTML = this._innerHTML; return c; }
    contains(other) { let n = other; while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    matches(sel) { return matchesSelector(this, sel); }
    closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matchesSelector(n, sel)) return n; n = n.parentNode; } return null; }
    querySelector(sel) { return queryAll(sel, this)[0] || null; }
    querySelectorAll(sel) { return queryAll(sel, this); }
    getElementsByTagName(tag) { return queryAll(String(tag), this); }
    getElementsByClassName(cls) { return queryAll('.' + String(cls).trim().split(/\s+/).join('.'), this); }
    animate() { return { finished: Promise.resolve(), cancel() {}, finish() {}, onfinish: null }; }
    getContext() { return null; }
    attachShadow() { return new FakeElement('shadow-root'); }
  }

  function makeEvent(type, props = {}) {
    return {
      type,
      bubbles: false,
      cancelable: true,
      defaultPrevented: false,
      target: null,
      currentTarget: null,
      key: '',
      code: '',
      detail: null,
      dataTransfer: null,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this._stopped = true; },
      stopImmediatePropagation() { this._stopped = true; },
      composedPath() { return [this.target].filter(Boolean); },
      ...props
    };
  }

  function safeCall(fn, thisArg, arg) {
    try {
      const r = fn.call(thisArg, arg);
      if (r && typeof r.then === 'function') r.then(null, (err) => env.errors.push(`async handler: ${err && err.stack || err}`));
    } catch (err) {
      env.errors.push(`handler: ${err && err.stack || err}`);
    }
  }

  function dispatchDocument(e) {
    for (const fn of [...(env.docListeners[e.type] || [])]) {
      if (e._stopped) break;
      e.currentTarget = env.document;
      safeCall(fn, env.document, e);
    }
  }

  function queryAll(selector, root) {
    const sel = String(selector || '').trim();
    if (!sel) return [];
    const idOnly = /^#([A-Za-z0-9_-]+)$/.exec(sel);
    if (idOnly) { const hit = env.byId.get(idOnly[1]); return hit ? [hit] : []; }
    const pool = root && root !== env.document && root !== env.documentElement ? descendants(root) : env.elements;
    return pool.filter((el) => el.isConnected !== false && matchesSelector(el, sel));
  }

  function descendants(root) {
    const out = [];
    const walk = (n) => { for (const c of n.children || []) { out.push(c); walk(c); } };
    walk(root);
    // 평평하게 만든 index.html 요소는 부모 관계가 없으므로, 루트가 HTML 요소면 전체 목록으로 대신 찾는다.
    return out.length ? out : env.elements;
  }

  // ── index.html → 평평한 요소 목록 ──
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  const selectStack = [];
  const htmlNoScripts = String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (s) => s.replace(/>[\s\S]*<\/script>$/i, '></script>'));
  while ((m = tagRe.exec(htmlNoScripts))) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    const elm = new FakeElement(tag, attrs);
    env.elements.push(elm);
    if (tag === 'select') selectStack.push(elm);
    if (tag === 'option' && selectStack.length) {
      const sel = selectStack[selectStack.length - 1];
      const rest = htmlNoScripts.slice(tagRe.lastIndex);
      const text = (/^([^<]*)/.exec(rest) || ['', ''])[1].trim();
      elm.textContent = text;
      if (!Object.prototype.hasOwnProperty.call(attrs, 'value')) elm._value = text;
      elm.selected = Object.prototype.hasOwnProperty.call(attrs, 'selected');
      sel.options.push(elm);
    }
    if (tag === 'textarea') {
      const rest = htmlNoScripts.slice(tagRe.lastIndex);
      elm._value = (/^([\s\S]*?)<\/textarea>/i.exec(rest) || ['', ''])[1];
    }
  }
  // </select> 추적은 단순화: 옵션은 가장 최근 select에 붙인다(중첩 select는 없음).

  // ── document ──
  const documentElement = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  env.documentElement = documentElement;
  env.elements.push(head, body);
  const storage = () => {
    const map = new Map();
    return {
      getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
      setItem(k, v) { map.set(String(k), String(v)); },
      removeItem(k) { map.delete(String(k)); },
      clear() { map.clear(); },
      key(i) { return [...map.keys()][i] ?? null; },
      get length() { return map.size; }
    };
  };

  const document = {
    nodeType: 9,
    readyState: 'loading',
    title: '',
    cookie: '',
    referrer: '',
    hidden: false,
    visibilityState: 'visible',
    documentElement,
    head,
    body,
    fonts: { ready: Promise.resolve() },
    get activeElement() { return body; },
    getElementById(id) { return env.byId.get(String(id)) || null; },
    querySelector(sel) { return queryAll(sel, document)[0] || null; },
    querySelectorAll(sel) { return queryAll(sel, document); },
    getElementsByTagName(tag) { return queryAll(String(tag), document); },
    getElementsByClassName(cls) { return queryAll('.' + String(cls).trim().split(/\s+/).join('.'), document); },
    getElementsByName(name) { return env.elements.filter((e) => e.getAttribute('name') === String(name)); },
    createElement(tag) { const e = new FakeElement(tag); env.elements.push(e); return e; },
    createElementNS(ns, tag) { return document.createElement(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: String(text), data: String(text), remove() {} }; },
    createDocumentFragment() { const f = new FakeElement('#fragment'); f.nodeType = 11; return f; },
    createComment() { return { nodeType: 8, remove() {} }; },
    createEvent() { return makeEvent(''); },
    addEventListener(type, fn) { if (typeof fn === 'function') (env.docListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { const l = env.docListeners[type]; if (l) env.docListeners[type] = l.filter((x) => x !== fn); },
    dispatchEvent(evt) { dispatchDocument(evt); return true; },
    write() {}, writeln() {}, open() {}, close() {},
    execCommand() { return false; },
    elementFromPoint() { return null; },
    hasFocus() { return true; }
  };
  env.document = document;

  // ── fetch (기록 + 가짜 응답) ──
  let ctx = null;
  let innerJSON = null; // 샌드박스 안의 JSON(응답 객체를 샌드박스 쪽 Object/Array로 만든다)
  const parseInside = (text) => {
    if (!innerJSON) innerJSON = vm.runInContext('JSON', ctx);
    return innerJSON.parse(text);
  };
  function routeFor(pathname) {
    if (Object.prototype.hasOwnProperty.call(fetchRoutes, pathname)) return fetchRoutes[pathname];
    return { status: 200, body: {} };
  }
  function fakeFetch(input, init = {}) {
    const raw = typeof input === 'string' ? input : String(input && input.url || input);
    const u = new URL(raw, location);
    env.fetchCalls.push({ url: u.href, path: u.pathname, search: u.search, method: String(init.method || 'GET').toUpperCase(), sameOrigin: u.origin === new URL(location).origin });
    const route = u.origin === new URL(location).origin ? routeFor(u.pathname) : { status: 200, body: {} };
    const status = route.status || 200;
    const text = JSON.stringify(route.body === undefined ? {} : route.body);
    const response = {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      url: u.href,
      redirected: false,
      headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : null; }, has() { return false; } },
      json() { return Promise.resolve(parseInside(text)); },
      text() { return Promise.resolve(text); },
      blob() { return Promise.resolve(new Blob([text])); },
      arrayBuffer() { return Promise.resolve(Buffer.from(text)); },
      clone() { return response; }
    };
    return Promise.resolve(response);
  }

  // ── 가상 타이머 ──
  function addTimer(fn, delay, args, repeat) {
    const id = env.timerSeq++;
    env.timers.push({ id, fn, args, due: env.now + Math.max(0, Number(delay) || 0), delay: Math.max(1, Number(delay) || 0), repeat, runs: 0 });
    return id;
  }
  function clearTimer(id) { env.timers = env.timers.filter((t) => t.id !== id); }

  class Observer { constructor() {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  class FakeEvent { constructor(type, init = {}) { Object.assign(this, makeEvent(type, init)); } }

  const window = {
    document,
    navigator: {
      userAgent: 'Mozilla/5.0 (test-sandbox)',
      language: 'ko-KR',
      languages: ['ko-KR', 'ko'],
      onLine: true,
      platform: 'test',
      clipboard: { writeText() { return Promise.resolve(); }, readText() { return Promise.resolve(''); } },
      geolocation: { getCurrentPosition() {}, watchPosition() { return 0; }, clearWatch() {} },
      serviceWorker: undefined,
      sendBeacon() { return true; }
    },
    location: (() => {
      const u = new URL(location);
      return { href: u.href, origin: u.origin, protocol: u.protocol, host: u.host, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, reload() {}, assign() {}, replace() {}, toString() { return u.href; } };
    })(),
    history: { length: 1, state: null, pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} },
    localStorage: storage(),
    sessionStorage: storage(),
    innerWidth: 1280,
    innerHeight: 800,
    outerWidth: 1280,
    outerHeight: 800,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    screen: { width: 1280, height: 800, availWidth: 1280, availHeight: 800 },
    fetch: fakeFetch,
    setTimeout(fn, delay, ...args) { return typeof fn === 'function' ? addTimer(fn, delay, args, false) : 0; },
    clearTimeout: clearTimer,
    setInterval(fn, delay, ...args) { return typeof fn === 'function' ? addTimer(fn, delay, args, true) : 0; },
    clearInterval: clearTimer,
    requestAnimationFrame(fn) { return addTimer(() => fn(env.now), 16, [], false); },
    cancelAnimationFrame: clearTimer,
    requestIdleCallback(fn) { return addTimer(() => fn({ didTimeout: false, timeRemaining: () => 10 }), 1, [], false); },
    cancelIdleCallback: clearTimer,
    queueMicrotask: (fn) => queueMicrotask(fn),
    structuredClone: (v) => structuredClone(v),
    matchMedia(q) { return { matches: false, media: String(q), onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; },
    getComputedStyle() { return makeStyle(); },
    getSelection() { return { removeAllRanges() {}, addRange() {}, toString() { return ''; } }; },
    alert(msg) { env.dialogs.push(['alert', String(msg)]); },
    confirm(msg) { env.dialogs.push(['confirm', String(msg)]); return false; },
    prompt(msg) { env.dialogs.push(['prompt', String(msg)]); return null; },
    open() { return null; },
    print() {},
    focus() {},
    blur() {},
    scrollTo() {},
    scrollBy() {},
    postMessage() {},
    addEventListener(type, fn) { if (typeof fn === 'function') (env.winListeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { const l = env.winListeners[type]; if (l) env.winListeners[type] = l.filter((x) => x !== fn); },
    dispatchEvent(evt) { for (const fn of [...(env.winListeners[evt.type] || [])]) safeCall(fn, window, evt); return true; },
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    KeyboardEvent: FakeEvent,
    MouseEvent: FakeEvent,
    DragEvent: FakeEvent,
    IntersectionObserver: Observer,
    MutationObserver: Observer,
    ResizeObserver: Observer,
    PerformanceObserver: Observer,
    Image: class extends FakeElement { constructor() { super('img'); } },
    Option: class extends FakeElement { constructor(text, value) { super('option'); this.textContent = String(text || ''); this.value = value === undefined ? String(text || '') : String(value); } },
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
    HTMLImageElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLSelectElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLAnchorElement: FakeElement,
    DOMParser: class { parseFromString() { return document; } },
    FileReader: class { readAsText() {} readAsDataURL() {} addEventListener() {} },
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    TextEncoder,
    TextDecoder,
    Blob,
    FormData,
    Headers,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    crypto: nodeCrypto.webcrypto,
    performance: { now: () => env.now, mark() {}, measure() {}, getEntriesByName() { return []; } },
    console: {
      log() {}, info() {}, debug() {},
      warn(...a) { env.errors.push(`console.warn: ${a.map(String).join(' ')}`); },
      error(...a) { env.errors.push(`console.error: ${a.map(String).join(' ')}`); }
    }
  };
  window.window = window;
  window.self = window;
  window.top = window;
  window.parent = window;
  window.globalThis = window;
  window.frames = window;

  ctx = vm.createContext(window);

  async function drainMicrotasks(rounds = 5) {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  }

  // 가상 시계를 지금부터 windowMs만큼 진행하며 그 안에 예정된 타이머를 순서대로 실행한다.
  async function runTimers(windowMs = horizonMs) {
    const limit = env.now + windowMs;
    let guard = 0;
    while (guard++ < 5000) {
      await drainMicrotasks(3);
      const pending = env.timers.filter((t) => t.due <= limit).sort((a, b) => a.due - b.due || a.id - b.id);
      if (pending.length === 0) break;
      const t = pending[0];
      env.now = Math.max(env.now, t.due);
      t.runs += 1;
      if (t.repeat && t.runs < 3) t.due = env.now + t.delay;
      else clearTimer(t.id);
      try {
        const r = t.fn(...(t.args || []));
        if (r && typeof r.then === 'function') r.then(null, (err) => env.errors.push(`timer async: ${err && err.stack || err}`));
      } catch (err) {
        env.errors.push(`timer: ${err && err.stack || err}`);
      }
    }
    await drainMicrotasks(5);
  }

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason && reason.stack || reason));

  return {
    env,
    context: ctx,
    unhandled,
    /** app.js를 실행하고 DOMContentLoaded·load·타이머까지 돌린다. 동기 예외는 그대로 던진다. */
    async boot(code, filename = 'app.js') {
      process.on('unhandledRejection', onUnhandled);
      try {
        vm.runInContext(code, ctx, { filename });
        document.readyState = 'interactive';
        dispatchDocument(makeEvent('DOMContentLoaded'));
        document.readyState = 'complete';
        window.dispatchEvent(makeEvent('load'));
        await runTimers();
      } finally {
        await drainMicrotasks(3);
        process.removeListener('unhandledRejection', onUnhandled);
      }
    },
    run(code) { return vm.runInContext(code, ctx); },
    /** 사용자 동작(클릭 등)을 흉내 낸 뒤 비동기 작업·타이머가 끝날 때까지 돌린다. */
    async settle(windowMs) {
      process.on('unhandledRejection', onUnhandled);
      try { await runTimers(windowMs); } finally { process.removeListener('unhandledRejection', onUnhandled); }
    },
    runTimers,
    element(id) { return env.byId.get(id) || null; }
  };
}

module.exports = { createBrowser, matchesSelector };
