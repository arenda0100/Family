/* =========================================================
   FAMILY HOUSE — «Сутки в Ратичах» · script.js
   Зависимости (уже в index.html): GSAP, ScrollTrigger, Lenis, Three.js r128

   0. Утилиты       1. Декор мира (звёзды, светлячки, холмы)
   2. Прелоадер     3. Сплит текста и появление
   4. Фазы суток + шкала времени + часы
   5. WebGL (небо + частицы пара/углей)
   6. Параллакс     7. Курсор, магнит, tilt
   8. Lenis и якоря 9. Старт
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 0. УТИЛИТЫ И ОКРУЖЕНИЕ ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const pad = n => String(n).padStart(2, '0');
  const mq = q => window.matchMedia(q);
  const rng = seed => () => { // детерминированный random: холмы и звёзды не «прыгают» между загрузками
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  const root = document.documentElement;
  const body = document.body;
  const REDUCED = mq('(prefers-reduced-motion: reduce)').matches;
  const FINE = mq('(hover: hover) and (pointer: fine)').matches;
  const SMALL = mq('(max-width: 899.98px)').matches;
  const LOW = SMALL || !FINE || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const HAS_GSAP = !!(window.gsap && window.ScrollTrigger);

  // Смена системной настройки «уменьшить движение» — проще перезагрузить, чем переинициализировать всё
  const rmq = mq('(prefers-reduced-motion: reduce)');
  (rmq.addEventListener ? rmq.addEventListener.bind(rmq, 'change') : rmq.addListener.bind(rmq))(() => location.reload());

  let lenis = null;   // Lenis (если включён)
  let wgl = null;     // WebGL-фон (если поддерживается)
  let phases = null;  // логика фаз суток

  // Единая палитра суток — ДОЛЖНА совпадать с body[data-phase] в style.css (для WebGL-неба)
  const PAL = {
    predawn: { top: '#0b0d24', mid: '#2b2558', bot: '#c2607f', lp: [.22, .30], lc: '#ff8a7a', li: .35, ember: 0,   amt: .35 },
    morning: { top: '#9fcdf2', mid: '#f6c3cc', bot: '#ffdcb4', lp: [.30, .40], lc: '#ffd2a0', li: .90, ember: 0,   amt: .50 },
    day:     { top: '#2f9fe6', mid: '#5fcfe6', bot: '#c4f2e4', lp: [.62, .86], lc: '#fffbe0', li: .70, ember: 0,   amt: .10 },
    evening: { top: '#2a1252', mid: '#9c2459', bot: '#ff7d33', lp: [.78, .34], lc: '#ff6a1f', li: 1.0, ember: .95, amt: .85 },
    night:   { top: '#03040c', mid: '#0a0e2b', bot: '#241a55', lp: [.72, .80], lc: '#b9c8ff', li: .50, ember: .15, amt: .75 },
    dawn:    { top: '#7d92d6', mid: '#f3adbb', bot: '#ffdcb0', lp: [.30, .38], lc: '#ffcfa0', li: .80, ember: 0,   amt: .30 }
  };

  // Общий источник позиции мыши
  const ptr = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0 };
  const ptrSubs = [];
  addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.nx = e.clientX / innerWidth * 2 - 1;
    ptr.ny = -(e.clientY / innerHeight * 2 - 1);
    for (const f of ptrSubs) f(e);
  }, { passive: true });

  /* ---------- 1. ДЕКОР МИРА ---------- */
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      .art.is-paused .art__frame, .art.is-paused .art__frame::before, .art.is-paused .art__frame::after { animation-play-state: paused !important; }
      .marquee.is-paused .marquee__track { animation-play-state: paused; }
      @media (pointer: coarse) { .grain { animation: none; } }`;
    document.head.appendChild(s);
  }

  function buildStars() {
    const host = $('#stars'); if (!host) return;
    const r = rng(5), n = LOW ? 46 : 96, f = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'star';
      const size = r() < .12 ? 3 : r() < .4 ? 2 : 1.4;
      s.style.cssText = `left:${(r() * 100).toFixed(2)}%;top:${(r() * 75).toFixed(2)}%;--s:${size}px;--o:${(.35 + r() * .65).toFixed(2)};--d:${(3 + r() * 5).toFixed(1)}s;--dl:${(-r() * 6).toFixed(1)}s`;
      f.appendChild(s);
    }
    host.appendChild(f);
  }

  function buildFireflies() {
    const host = $('#fireflies'); if (!host) return;
    const r = rng(9), n = LOW ? 10 : 22, f = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span'); s.className = 'firefly';
      s.style.cssText = `left:${(r() * 100).toFixed(1)}%;top:${(45 + r() * 45).toFixed(1)}%;--dx:${(r() * 120 - 60).toFixed(0)}px;--dy:${(-30 - r() * 90).toFixed(0)}px;--dur:${(10 + r() * 10).toFixed(1)}s;--delay:${(-r() * 12).toFixed(1)}s;--blink:${(2.4 + r() * 3).toFixed(1)}s`;
      f.appendChild(s);
    }
    host.appendChild(f);
  }

  function buildLandscape() {
    const host = $('#landscape'); if (!host) return;
    const NS = 'http://www.w3.org/2000/svg', W = 1600, H = 400;
    const cfg = [
      { base: .32, a1: .14, a2: .05, f1: 1.3, f2: 3.1, trees: false },
      { base: .36, a1: .12, a2: .05, f1: 1.7, f2: 4.2, trees: false },
      { base: .34, a1: .10, a2: .04, f1: 2.1, f2: 5.0, trees: false },
      { base: .30, a1: .07, a2: .03, f1: 2.6, f2: 6.3, trees: true }
    ];
    cfg.forEach((c, i) => {
      const r = rng(11 + i * 7), p1 = r() * 6.28, p2 = r() * 6.28;
      const ridge = x => H * (c.base - c.a1 * Math.sin(x / W * 6.283 * c.f1 + p1) - c.a2 * Math.sin(x / W * 6.283 * c.f2 + p2) + .12);
      let x = 0, d = `M0 ${H} L0 ${ridge(0).toFixed(1)}`;
      while (x < W) {
        x = Math.min(W, x + (c.trees ? 14 + r() * 26 : 16));
        const y = ridge(x);
        if (c.trees && x < W - 10 && r() > .35) { // силуэт ели прямо в контуре холма
          const h = H * (.14 + r() * .16), w = 3 + r() * 4;
          d += ` L${(x - w).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x + w).toFixed(1)} ${y.toFixed(1)}`;
        } else d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      d += ` L${W} ${H} Z`;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', `land-layer land-layer--${i + 1}`);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d);
      svg.appendChild(path); host.appendChild(svg);
    });
  }

  // Ставим на паузу тяжёлые CSS-анимации, когда они вне экрана
  function pauseOffscreen() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-paused', !e.isIntersecting)), { rootMargin: '120px' });
    $$('.art, .marquee').forEach(el => io.observe(el));
  }

  /* ---------- 2. ПРЕЛОАДЕР ---------- */
  function runPreloader(prepare) {
    return new Promise(resolve => {
      const pre = $('#preloader'), fill = $('#preloaderFill'), num = $('#preloaderCount');
      const finish = () => {
        try { prepare && prepare(); } catch (e) { console.error(e); }
        body.classList.add('is-loaded');
        if (pre) { pre.classList.add('is-done'); setTimeout(() => pre.remove(), 1100); }
        resolve();
      };
      if (!pre || !fill) return finish();

      const t0 = performance.now(), MIN = REDUCED ? 250 : 1500;
      let loaded = false, p = 0;
      const pageReady = new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, { once: true }));
      const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      Promise.race([Promise.all([pageReady, fontsReady]), new Promise(r => setTimeout(r, 7000))]).then(() => { loaded = true; });

      (function tick(now) {
        const el = now - t0;
        p += (Math.min(loaded ? 1 : .9, el / MIN) - p) * .12;
        if (loaded && el >= MIN && p > .985) p = 1;
        fill.style.setProperty('--p', p.toFixed(3));
        if (num) num.textContent = Math.round(p * 100);
        p >= 1 ? finish() : requestAnimationFrame(tick);
      })(t0);
    });
  }

  /* ---------- 3. СПЛИТ ТЕКСТА И ПОЯВЛЕНИЕ ---------- */
  const pending = []; // функции, создающие ScrollTrigger после снятия прелоадера
  const trig = (el, fn, start = 'top 86%') => ScrollTrigger.create({ trigger: el, start, once: true, onEnter: fn });
  const normText = el => el.textContent.trim().replace(/\s+/g, ' ');

  function splitWords(el) {
    const words = normText(el).split(' ').map(w => {
      const s = document.createElement('span'); s.className = 'split-word'; s.textContent = w; return s;
    });
    el.textContent = '';
    words.forEach((w, i) => { if (i) el.append(' '); el.append(w); });
    return words;
  }

  function splitChars(el) {
    const chars = [], parts = normText(el).split(' ');
    el.textContent = '';
    parts.forEach((word, wi) => {
      const w = document.createElement('span'); w.className = 'split-word';
      for (const ch of word) { const c = document.createElement('span'); c.className = 'split-char'; c.textContent = ch; w.append(c); chars.push(c); }
      el.append(w); if (wi < parts.length - 1) el.append(' ');
    });
    return chars;
  }

  // Разбивка на строки: измеряем перенос слов и пересобираем строки в маски
  function buildLines(el) {
    const text = el.dataset.src || (el.dataset.src = normText(el));
    const parts = text.split(' ');
    el.textContent = '';
    const spans = parts.map(w => { const s = document.createElement('span'); s.style.display = 'inline-block'; s.textContent = w; return s; });
    spans.forEach((s, i) => { if (i) el.append(' '); el.append(s); });
    const lines = []; let top = null, cur = [];
    spans.forEach((s, i) => {
      const t = s.offsetTop;
      if (top === null || Math.abs(t - top) > 4) { if (cur.length) lines.push(cur); cur = []; top = t; }
      cur.push(parts[i]);
    });
    if (cur.length) lines.push(cur);
    el.textContent = '';
    lines.forEach(l => {
      const o = document.createElement('span'); o.className = 'split-line';
      const i = document.createElement('span'); i.className = 'split-line__inner';
      i.style.whiteSpace = 'nowrap'; i.textContent = l.join(' ');
      o.append(i); el.append(o);
    });
    return $$('.split-line__inner', el);
  }

  // Вызывается, пока прелоадер ещё закрывает экран: шрифты загружены, можно мерить
  function prepareText() {
    if (!HAS_GSAP || REDUCED) return;

    // Eyebrow (слова)
    $$('[data-split="words"]').forEach(el => {
      const w = splitWords(el), hero = !!el.closest('.section--hero');
      gsap.set(w, { opacity: 0, y: '.8em' });
      pending.push(() => trig(el, () => gsap.to(w, { opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .05, delay: hero ? .1 : 0 }), 'top 92%'));
    });

    // Заголовки (буквы вылетают из-под маски)
    $$('.hero__title, .section__title').forEach(h => {
      const groups = $$('[data-split="chars"]', h).map(splitChars);
      const base = h.classList.contains('hero__title') ? .2 : 0;
      gsap.set(groups.flat(), { yPercent: 115, rotate: 7, transformOrigin: '0% 100%' });
      pending.push(() => trig(h, () => groups.forEach((g, i) =>
        gsap.to(g, { yPercent: 0, rotate: 0, duration: 1.25, ease: 'expo.out', stagger: .03, delay: base + i * .16 })), 'top 88%'));
    });

    // Абзацы (построчно)
    const lineEls = $$('[data-split="lines"]');
    lineEls.forEach(el => {
      el._played = false;
      gsap.set(buildLines(el), { yPercent: 110 });
      const hero = !!el.closest('.section--hero');
      pending.push(() => trig(el, () => {
        el._played = true;
        gsap.to($$('.split-line__inner', el), { yPercent: 0, duration: 1.15, ease: 'power4.out', stagger: .11, delay: hero ? .65 : 0 });
      }, 'top 90%'));
    });
    // Перерасчёт строк при смене ширины (повороты, ресайз). Высота на мобилках игнорируется.
    let lastW = innerWidth, tmr;
    addEventListener('resize', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        if (innerWidth === lastW) return;
        lastW = innerWidth;
        lineEls.forEach(el => { const inner = buildLines(el); if (!el._played) gsap.set(inner, { yPercent: 110 }); });
        ScrollTrigger.refresh();
      }, 250);
    });

    // Обычные [data-reveal] — пачками, со стаггером
    const items = $$('[data-reveal]').filter(el => !el.hasAttribute('data-tilt'));
    gsap.set(items, { opacity: 0, y: 42 });
    pending.push(() => ScrollTrigger.batch(items, {
      start: 'top 90%', once: true,
      onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: .1, clearProps: 'transform', delay: b[0].closest('.section--hero') ? .9 : 0 })
    }));

    // Карточки цен: у них свой transform (tilt в CSS), поэтому появляются через свойство translate
    $$('[data-tilt]').forEach((el, i) => {
      const o = { y: 56, a: 0 };
      el.style.opacity = 0; el.style.translate = '0 56px';
      pending.push(() => trig(el, () => gsap.to(o, {
        y: 0, a: 1, duration: 1.1, ease: 'power3.out', delay: (i % 3) * .12,
        onUpdate() { el.style.translate = `0 ${o.y}px`; el.style.opacity = o.a; },
        onComplete() { el.style.translate = ''; el.style.opacity = ''; }
      }), 'top 92%'));
    });

    // Счётчики цен
    $$('[data-count]').forEach(el => {
      const end = +el.dataset.count, o = { v: 0 };
      el.textContent = '0';
      pending.push(() => trig(el, () => gsap.to(o, {
        v: end, duration: 1.8, ease: 'power2.out',
        onUpdate() { el.textContent = Math.round(o.v); },
        onComplete() { el.textContent = end; }
      }), 'top 92%'));
    });
  }

  /* ---------- 4. ФАЗЫ СУТОК, ШКАЛА ВРЕМЕНИ, ЧАСЫ ---------- */
  // Фаза переключается через body[data-phase] — в CSS на неё завязаны все цвета и @property-переходы.
  // Это быстрее, чем гонять переменные в :root на каждый кадр скролла.
  function initPhases() {
    const sections = $$('.section'); if (sections.length < 2) return null;
    const items = $$('.timeline__item'), rail = $('.timeline__rail');
    const clockT = $('#clockTime'), clockP = $('#clockPhase'), meta = $('meta[name="theme-color"]');
    const itemIdx = items.map(li => sections.findIndex(s => s.id === li.dataset.target));

    let prev = -1; // часы из data-time; «06:00» после «23:00» превращается в 30:00
    const hours = sections.map(s => {
      const [h, m] = (s.dataset.time || '0:0').split(':').map(Number);
      let v = h + (m || 0) / 60; while (v < prev) v += 24; prev = v; return v;
    });

    let tops = [], near = -1, lastClock = '';
    const measure = () => { tops = sections.map(s => s.getBoundingClientRect().top + window.scrollY); };

    const setNear = n => {
      near = n;
      const sec = sections[n];
      body.dataset.phase = sec.dataset.phase;
      if (clockP) clockP.textContent = sec.dataset.phaseLabel || '';
      items.forEach((li, k) => {
        li.classList.toggle('is-active', itemIdx[k] === n);
        li.classList.toggle('is-past', itemIdx[k] >= 0 && itemIdx[k] < n);
        const a = $('a', li); if (a) { itemIdx[k] === n ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'); }
      });
      if (meta && PAL[sec.dataset.phase]) meta.content = PAL[sec.dataset.phase].top;
    };

    // s — позиция скролла. idx — «непрерывный номер секции»: 0 = hero … n-1 = бронь
    const onScroll = s => {
      if (!tops.length) measure();
      const n = tops.length; let idx;
      if (s <= tops[0]) idx = 0;
      else if (s >= tops[n - 1]) idx = n - 1;
      else { let i = 0; while (i < n - 2 && s >= tops[i + 1]) i++; idx = i + (s - tops[i]) / (tops[i + 1] - tops[i]); }

      const r = Math.round(idx); if (r !== near) setNear(r);
      if (rail) rail.style.setProperty('--p', clamp((idx - 1) / (n - 2), 0, 1).toFixed(4)); // заполнение + «солнце»

      const i = Math.min(Math.floor(idx), n - 2);
      const hv = lerp(hours[i], hours[i + 1], idx - i) % 24;
      let H = Math.floor(hv), M = Math.round((hv - H) * 12) * 5;
      if (M === 60) { M = 0; H = (H + 1) % 24; }
      const txt = `${pad(H)}:${pad(M)}`;
      if (clockT && txt !== lastClock) { lastClock = txt; clockT.textContent = txt; }

      if (wgl) wgl.setTarget(idx);
    };

    return { sections, measure, onScroll };
  }

  /* ---------- 5. WEBGL: НЕБО + ЧАСТИЦЫ ---------- */
  function initWebGL(frameDefs) {
    const canvas = $('#webgl');
    if (!canvas || !window.THREE || !frameDefs.length) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: LOW ? 'default' : 'high-performance' });
    } catch (e) { return null; } // без WebGL остаётся CSS-градиент из .world

    const frames = frameDefs.map(d => ({
      top: new THREE.Color(d.top), mid: new THREE.Color(d.mid), bot: new THREE.Color(d.bot),
      lc: new THREE.Color(d.lc), lp: d.lp, li: d.li, ember: d.ember, amt: d.amt
    }));

    const scene = new THREE.Scene(), camera = new THREE.Camera();

    // — Небо (полноэкранный квад в clip-space) —
    const skyU = {
      uTime: { value: 0 }, uAspect: { value: 1 }, uLightI: { value: 0 },
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uLightCol: { value: new THREE.Color() }, uLightPos: { value: new THREE.Vector2() }
    };
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: skyU, depthTest: false, depthWrite: false, defines: { OCT: LOW ? 3 : 4 },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime, uAspect, uLightI;
        uniform vec3 uTop, uMid, uBot, uLightCol;
        uniform vec2 uLightPos;
        float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y);
        }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<OCT;i++){ v += a*noise(p); p = p*2.03 + vec2(17.1,3.7); a *= 0.5; } return v; }
        void main(){
          vec2 uv = vUv, asp = vec2(uAspect, 1.0);
          float t = 1.0 - uv.y;
          t += (fbm(vec2(uv.x*2.0 + uTime*0.010, uv.y*2.0 - uTime*0.008)) - 0.5) * 0.05; // живое «дыхание» градиента
          vec3 col = mix(uTop, uMid, smoothstep(0.0, 0.55, t));
          col = mix(col, uBot, smoothstep(0.55, 1.0, t));
          // солнце / луна
          float r = length((uv - uLightPos) * asp);
          float glow = exp(-r*3.2)*0.85 + exp(-r*10.0)*0.9;
          float core = smoothstep(0.045, 0.02, r);
          col += uLightCol * (glow*0.55 + core*0.8) * uLightI;
          // свечение у горизонта
          float hor = exp(-pow((uv.y - 0.28)*4.0, 2.0));
          col += uLightCol * hor * 0.12 * uLightI;
          // дымка / лёгкие облака
          float c = fbm(vec2(uv.x*uAspect*1.6 + uTime*0.015, uv.y*3.2 + 3.0));
          float cloud = smoothstep(0.5, 0.85, c) * smoothstep(0.2, 0.55, uv.y) * smoothstep(1.0, 0.6, uv.y);
          col += (uMid*0.5 + uLightCol*0.35*uLightI) * cloud * 0.22;
          col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0; // дизеринг против бандинга
          gl_FragColor = vec4(col, 1.0);
        }`
    }));
    sky.frustumCulled = false; sky.renderOrder = 0; scene.add(sky);

    // — Частицы: пар (мягкие, крупные) ↔ угли (мелкие, быстрые, тёплые). Всё считается в вершинном шейдере —
    const N = LOW ? 48 : 110, r = rng(77);
    const seed = new Float32Array(N * 4), rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) { seed.set([r(), r(), r(), r()], i * 4); rnd[i] = r(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    const pU = { uTime: { value: 0 }, uSize: { value: 800 }, uEmber: { value: 0 }, uAmount: { value: 0 }, uMouse: { value: new THREE.Vector2() } };
    const points = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: pU, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 aSeed; attribute float aRnd;
        uniform float uTime, uSize, uEmber, uAmount; uniform vec2 uMouse;
        varying float vAlpha; varying float vLife;
        void main(){
          float spd  = mix(0.045, 0.13, uEmber) * (0.55 + aSeed.z*0.9);
          float life = fract(aSeed.y + uTime*spd);
          float x = aSeed.x*2.2 - 1.1;
          x += sin(uTime*(0.35 + aSeed.z*0.8) + aSeed.y*30.0) * mix(0.07, 0.035, uEmber) * (0.25 + life);
          x += uMouse.x * 0.05 * (0.4 + aSeed.w);
          float y = mix(-0.55, 0.95, pow(life, mix(1.0, 0.8, uEmber))) + uMouse.y * 0.03;
          float fade = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.55, 1.0, life));
          vAlpha = fade * step(aRnd, uAmount);
          vLife = life;
          float base = mix(0.16, 0.022, uEmber) * (0.5 + aSeed.w) * (0.7 + life*mix(1.4, 0.2, uEmber));
          gl_PointSize = min(base * uSize, 300.0);
          gl_Position = vec4(x, y, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform float uEmber; varying float vAlpha; varying float vLife;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float s = smoothstep(1.0, 0.0, d);
          float a = mix(s*s, s*s*s, uEmber);
          vec3 steam = vec3(0.86, 0.93, 1.0);
          vec3 ember = mix(vec3(1.0, 0.78, 0.35), vec3(1.0, 0.28, 0.10), vLife);
          gl_FragColor = vec4(mix(steam, ember, uEmber), a * vAlpha * mix(0.07, 0.95, uEmber));
        }`
    }));
    points.frustumCulled = false; points.renderOrder = 1; scene.add(points);

    // — Размеры и качество —
    const maxDpr = LOW ? 1.25 : 1.5;
    let quality = 1, lastW = 0, lastH = 0, dirty = true;
    const size = new THREE.Vector2();
    const resize = force => {
      const w = innerWidth, h = innerHeight;
      if (!force && w === lastW && LOW && Math.abs(h - lastH) < 160) return; // не пересоздаём буфер из-за адресной строки
      lastW = w; lastH = h;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr) * quality);
      renderer.setSize(w, h, false);
      renderer.getDrawingBufferSize(size);
      skyU.uAspect.value = w / h; pU.uSize.value = size.y; dirty = true;
    };
    resize(true);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => resize(false), 120); });

    // — Состояние и цикл —
    let target = 0, cur = 0, time = 0, raf = 0, last = performance.now();
    let ema = 16.7, cnt = 0;
    const mouse = { x: 0, y: 0 };
    const nF = frames.length;

    const apply = () => {
      const c = clamp(cur, 0, nF - 1), i = Math.min(Math.floor(c), Math.max(nF - 2, 0));
      const A = frames[i], B = frames[Math.min(i + 1, nF - 1)], f = smooth(.12, .88, c - i); // «полки» на каждой фазе
      skyU.uTop.value.copy(A.top).lerp(B.top, f);
      skyU.uMid.value.copy(A.mid).lerp(B.mid, f);
      skyU.uBot.value.copy(A.bot).lerp(B.bot, f);
      skyU.uLightCol.value.copy(A.lc).lerp(B.lc, f);
      skyU.uLightI.value = lerp(A.li, B.li, f);
      skyU.uLightPos.value.set(lerp(A.lp[0], B.lp[0], f) + mouse.x * .012, lerp(A.lp[1], B.lp[1], f) + mouse.y * .008);
      pU.uEmber.value = lerp(A.ember, B.ember, f);
      pU.uAmount.value = REDUCED ? 0 : lerp(A.amt, B.amt, f) * quality;
      skyU.uTime.value = time; pU.uTime.value = time; pU.uMouse.value.set(mouse.x, mouse.y);
    };

    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dtRaw = now - last;
      if (LOW && dtRaw < 32) return; // на мобилках рендерим ~30 fps
      const dt = Math.min(dtRaw / 1000, .1); last = now;

      if (REDUCED) {
        if (!dirty && Math.abs(cur - target) < 1e-3) return; // статичная картинка, рендер только при изменении
        cur = target; dirty = false;
      } else {
        cur = lerp(cur, target, 1 - Math.exp(-dt * 3.2));
        const k = 1 - Math.exp(-dt * 4);
        mouse.x = lerp(mouse.x, ptr.nx, k); mouse.y = lerp(mouse.y, ptr.ny, k);
        time += dt;
        // адаптивное качество: если кадры затягиваются — снижаем разрешение
        ema = ema * .95 + dtRaw * .05;
        if (++cnt >= 120) {
          cnt = 0;
          if (ema > (LOW ? 51 : 26) && quality > .55) { quality -= .15; resize(true); ema = LOW ? 33 : 16.7; }
        }
      }
      apply();
      renderer.render(scene, camera);
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); };
    start();
    document.addEventListener('visibilitychange', () => document.hidden ? cancelAnimationFrame(raf) : start());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); cancelAnimationFrame(raf); canvas.style.visibility = 'hidden'; });
    canvas.addEventListener('webglcontextrestored', () => { canvas.style.visibility = ''; dirty = true; start(); });

    return { setTarget: v => { target = v; } };
  }

  /* ---------- 6. ПАРАЛЛАКС ---------- */
  function initParallax() {
    if (!HAS_GSAP || REDUCED) return;
    const mm = gsap.matchMedia();
    mm.add({ d: '(min-width: 900px)', m: '(max-width: 899.98px)' }, ctx => {
      const desk = ctx.conditions.d, k = desk ? 1 : .4;

      // Секции: арт и текст едут с разной скоростью
      $$('.section--morning, .section--day, .section--evening, .section--night').forEach(sec => {
        const art = $('.art__frame', sec), txt = $('.section__col--text', sec);
        const st = () => ({ trigger: sec, start: 'top bottom', end: 'bottom top', scrub: .8 });
        if (art) gsap.fromTo(art, { y: 90 * k }, { y: -90 * k, ease: 'none', scrollTrigger: st() });
        if (txt) gsap.fromTo(txt, { y: 34 * k }, { y: -34 * k, ease: 'none', scrollTrigger: st() });
      });

      // Холмы: слои смещаются по-разному за весь скролл страницы
      $$('.land-layer').forEach((l, i) => {
        const d = [.6, 1.2, 1.9, 2.6][i] * (desk ? 1 : .6);
        gsap.fromTo(l, { xPercent: -d, yPercent: 0 }, {
          xPercent: d, yPercent: [1.5, 3, 4.5, 6][i], ease: 'none',
          scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: .6 }
        });
      });
    });

    // Лёгкий параллакс холмов за мышью
    if (FINE) {
      const amp = [4, 9, 16, 26];
      const qs = $$('.land-layer').map(l => gsap.quickTo(l, 'x', { duration: 1.4, ease: 'power3' }));
      ptrSubs.push(() => qs.forEach((q, i) => q(-ptr.nx * amp[i])));
    }
  }

  /* ---------- 7. КУРСОР, МАГНИТ, TILT ---------- */
  function initCursor() {
    if (!FINE || REDUCED || !HAS_GSAP) return;
    const cur = $('#cursor'); if (!cur) return;
    const ring = $('.cursor__ring', cur), dot = $('.cursor__dot', cur), label = $('#cursorLabel');
    root.classList.add('has-cursor');

    // кольцо с инерцией, точка почти без задержки
    const rx = gsap.quickTo(ring, 'x', { duration: .6, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: .6, ease: 'power3' });
    const dx = gsap.quickTo(dot, 'x', { duration: .15, ease: 'power3' }), dy = gsap.quickTo(dot, 'y', { duration: .15, ease: 'power3' });

    const SEL = 'a, button, [data-cursor], [data-magnetic]';
    const mags = new WeakMap();
    const getMag = el => {
      let m = mags.get(el);
      if (!m) { m = { qx: gsap.quickTo(el, 'x', { duration: .8, ease: 'elastic.out(1,.45)' }), qy: gsap.quickTo(el, 'y', { duration: .8, ease: 'elastic.out(1,.45)' }) }; mags.set(el, m); }
      return m;
    };
    let shown = false, hovered = null, magnet = null;

    const endMagnet = () => { if (magnet) { magnet.m.qx(0); magnet.m.qy(0); magnet = null; } };
    const startMagnet = el => {
      const r = el.getBoundingClientRect();
      magnet = { el, m: getMag(el), cx: r.left + r.width / 2 - (gsap.getProperty(el, 'x') || 0), cy: r.top + r.height / 2 - (gsap.getProperty(el, 'y') || 0), sy: window.scrollY, w: r.width, h: r.height, l: r.left, t: r.top };
    };
    const setHover = t => {
      if (t === hovered) return;
      hovered = t;
      cur.classList.toggle('is-hover', !!t);
      const txt = t ? (t.dataset.cursor || '') : '';
      label.textContent = txt; cur.classList.toggle('has-label', !!txt);
      endMagnet();
      if (t && t.hasAttribute('data-magnetic')) startMagnet(t);
    };

    ptrSubs.push(e => {
      if (!shown) { shown = true; gsap.set([ring, dot], { x: e.clientX, y: e.clientY }); cur.classList.add('is-visible'); }
      dx(e.clientX); dy(e.clientY);
      if (magnet) {
        const cy = magnet.cy - (window.scrollY - magnet.sy);
        magnet.m.qx((e.clientX - magnet.cx) * .3); magnet.m.qy((e.clientY - cy) * .3);
        rx(lerp(e.clientX, magnet.cx, .3)); ry(lerp(e.clientY, cy, .3)); // кольцо «липнет» к кнопке
      } else { rx(e.clientX); ry(e.clientY); }
      if (hovered && hovered.classList.contains('btn')) { // подсветка кнопки следом за курсором
        const r = hovered.getBoundingClientRect();
        hovered.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        hovered.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }
    });
    document.addEventListener('mouseover', e => setHover(e.target.closest ? e.target.closest(SEL) : null));
    root.addEventListener('mouseleave', () => { cur.classList.remove('is-visible'); shown = false; setHover(null); });
    addEventListener('pointerdown', () => cur.classList.add('is-down'));
    addEventListener('pointerup', () => cur.classList.remove('is-down'));
  }

  function initTilt() {
    if (!FINE || REDUCED) return;
    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--ry', ((x - .5) * 8).toFixed(2) + 'deg');
        el.style.setProperty('--rx', ((.5 - y) * 8).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- 8. LENIS И ЯКОРЯ ---------- */
  function initScroll() {
    if (!HAS_GSAP) return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    if (REDUCED || !window.Lenis) return;
    lenis = new Lenis({ duration: 1.15, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: .95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // пока идёт прелоадер
  }

  const lockScroll = on => {
    if (lenis) on ? lenis.stop() : lenis.start();
    else root.style.overflow = on ? 'hidden' : '';
  };

  function initAnchors() {
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const id = a.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : body;
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(id ? target : 0, { duration: 1.7, easing: t => 1 - Math.pow(1 - t, 4) });
      else target.scrollIntoView({ behavior: 'auto' });
      if (id) { history.replaceState(null, '', '#' + id); target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    });
  }

  /* ---------- 9. СТАРТ ---------- */
  async function start() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!location.hash) window.scrollTo(0, 0);

    injectStyles(); buildStars(); buildFireflies(); buildLandscape(); pauseOffscreen();
    initScroll();
    lockScroll(true);

    phases = initPhases();
    if (phases) {
      wgl = initWebGL(phases.sections.map(s => PAL[s.dataset.phase] || PAL.predawn));
      phases.measure(); phases.onScroll(window.scrollY);
      if (HAS_GSAP) {
        ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => phases.onScroll(self.scroll()) });
        ScrollTrigger.addEventListener('refresh', () => { phases.measure(); phases.onScroll(window.scrollY); });
      } else {
        let tick = false;
        const upd = () => { tick = false; phases.onScroll(window.scrollY); };
        addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
        addEventListener('resize', () => { phases.measure(); upd(); });
      }
    }

    initCursor(); initTilt(); initAnchors();

    await runPreloader(prepareText);

    // Прелоадер ушёл: запускаем появление, параллакс и разблокируем скролл
    if (HAS_GSAP && !REDUCED) { pending.forEach(fn => fn()); initParallax(); }
    lockScroll(false);
    if (HAS_GSAP) { ScrollTrigger.refresh(); addEventListener('load', () => ScrollTrigger.refresh()); }
    if (location.hash) {
      const t = document.getElementById(location.hash.slice(1));
      if (t) lenis ? lenis.scrollTo(t, { immediate: true }) : t.scrollIntoView();
    }
  }

  start().catch(err => { // что бы ни случилось — сайт должен остаться читаемым
    console.error('[Family House]', err);
    const pre = $('#preloader'); if (pre) pre.remove();
    body.classList.add('is-loaded'); root.style.overflow = '';
  });
})();