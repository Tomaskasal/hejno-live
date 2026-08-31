// HEJNO — klient (projekce i telefon v jednom souboru; režim podle ?mode=telefon)
(() => {
  const MODE = new URLSearchParams(location.search).get('mode') === 'telefon' ? 'phone' : 'proj';
  const SPECIES = [
    { name: 'Racek', icon: 'M2 10 Q14 20 26 15 Q38 20 50 10 Q37 17 26 11 Q15 17 2 10 Z' },
    { name: 'Vlaštovka', icon: 'M4 5 Q16 15 26 11 Q36 15 48 5 Q36 17 29 12 L31 22 L26 16 L21 22 L23 12 Q16 17 4 5 Z' },
    { name: 'Rorýs', icon: 'M6 3 Q16 17 26 13 Q36 17 46 3 Q36 21 26 16 Q16 21 6 3 Z' },
    { name: 'Špaček', icon: 'M10 7 Q19 15 26 12 Q33 15 42 7 Q33 18 28 13 L26 22 L24 13 Q19 18 10 7 Z' }
  ];
  const SP_SIZE = [1.28, 1, 0.78, 0.95];
  const AMBIENT = 180;        // ptáci "pozadí", ať plátno nikdy není prázdné
  const IDLE_MS = 20000;      // po jaké neaktivitě hráč zmizí
  const SHOUT_MS = 4200;      // jak dlouho svítí zvýraznění po zmáčknutí "Ukaž mě"
  const uid = sessionStorage.getItem('hejno-uid') || ('p' + Math.random().toString(36).slice(2, 9));
  sessionStorage.setItem('hejno-uid', uid);

  // ---------- websocket ----------
  let ws = null, wsOpen = false;
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => {
      wsOpen = true;
      document.getElementById('connDot')?.classList.add('on');
      send({ t: 'hello', role: MODE });
      // po reconnectu se hráč sám přihlásí zpět
      if (MODE === 'phone' && flying) sendJoin();
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    ws.onclose = () => {
      wsOpen = false;
      document.getElementById('connDot')?.classList.remove('on');
      setTimeout(connect, 2000);
    };
    ws.onerror = () => ws.close();
  }
  function send(m) { if (wsOpen) ws.send(JSON.stringify(m)); }
  connect();

  // ==================================================================
  //  PROJEKCE — simulace hejna
  // ==================================================================
  if (MODE === 'proj') {
    document.getElementById('proj').classList.remove('hidden');
    document.getElementById('qrImg').src =
      'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=1&data=' +
      encodeURIComponent(location.origin + location.pathname + '?mode=telefon');

    const cv = document.getElementById('projCanvas');
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
    }
    addEventListener('resize', resize); resize();

    const birds = [];
    const players = new Map(); // id -> {name, sp, dir, last}
    function addBird(o) {
      const a = Math.random() * 6.28;
      birds.push(Object.assign({
        x: Math.random() * W, y: Math.random() * H,
        vx: Math.cos(a), vy: Math.sin(a),
        z: 0.55 + Math.random() * 0.9,
        flap: Math.random() * 6.28, fs: 5.5 + Math.random() * 3,
        sp: Math.floor(Math.random() * 4), owner: null, lead: false
      }, o));
    }
    for (let i = 0; i < AMBIENT; i++) addBird({});

    function onMsg(m) {
      if (m.t === 'join') {
        if (players.has(m.id)) { players.get(m.id).last = performance.now(); return; }
        players.set(m.id, { name: m.name || '', sp: m.sp, dir: { x: 1, y: 0 }, last: performance.now() });
        const px = 80 + Math.random() * (W - 160), py = 80 + Math.random() * (H - 160);
        for (let i = 0; i < 5; i++) addBird({
          x: px + (Math.random() - 0.5) * 60, y: py + (Math.random() - 0.5) * 60,
          z: 0.8 + Math.random() * 0.5, sp: m.sp, owner: m.id, lead: i === 0
        });
      } else if (m.t === 'dir') {
        const p = players.get(m.id); if (p) { p.dir = { x: m.x, y: m.y }; p.last = performance.now(); }
      } else if (m.t === 'ping') {
        const p = players.get(m.id); if (p) p.last = performance.now();
      } else if (m.t === 'shout') {
        const p = players.get(m.id);
        if (p) {
          p.last = performance.now();
          // dokud jedno zvýraznění běží, další zmáčknutí ho neresetuje
          if (!p.shout || performance.now() - p.shout > SHOUT_MS) p.shout = performance.now();
        }
      } else if (m.t === 'leave') {
        removePlayer(m.id);
      }
    }
    window.onMsgProj = onMsg;
    function removePlayer(id) {
      players.delete(id);
      for (let i = birds.length - 1; i >= 0; i--) if (birds[i].owner === id) birds.splice(i, 1);
    }

    let sync = 0.72;
    setInterval(() => {
      send({ t: 'state', sync: Math.round(sync * 100), count: players.size, ids: [...players.keys()] });
      const now = performance.now();
      for (const [id, p] of players) if (now - p.last > IDLE_MS) removePlayer(id);
      document.getElementById('playersCount').textContent = players.size;
      document.getElementById('syncVal').textContent = Math.round(sync * 100);
      document.getElementById('syncBar').style.width = Math.round(sync * 100) + '%';
    }, 600);

    function drawShape(c, sp, s, w) {
      c.beginPath();
      if (sp === 0) {
        const ty = s * (0.28 + 0.5 * w), by = s * 0.2 * w;
        c.moveTo(-1.15 * s, ty);
        c.quadraticCurveTo(-0.4 * s, by - 0.18 * s, 0, -0.14 * s);
        c.quadraticCurveTo(0.4 * s, by - 0.18 * s, 1.15 * s, ty);
        c.quadraticCurveTo(0.38 * s, by + 0.06 * s, 0, 0.14 * s);
        c.quadraticCurveTo(-0.38 * s, by + 0.06 * s, -1.15 * s, ty);
      } else if (sp === 1) {
        const ty = s * (0.5 + 0.38 * w), by = s * 0.15 * w;
        c.moveTo(-0.95 * s, ty);
        c.quadraticCurveTo(-0.35 * s, by - 0.22 * s, 0, -0.2 * s);
        c.quadraticCurveTo(0.35 * s, by - 0.22 * s, 0.95 * s, ty);
        c.quadraticCurveTo(0.3 * s, by + 0.02 * s, 0, 0.1 * s);
        c.quadraticCurveTo(-0.3 * s, by + 0.02 * s, -0.95 * s, ty);
        c.moveTo(-0.03 * s, 0.05 * s); c.lineTo(-0.17 * s, 0.58 * s); c.lineTo(0, 0.3 * s); c.lineTo(0.17 * s, 0.58 * s); c.lineTo(0.03 * s, 0.05 * s);
      } else if (sp === 2) {
        const ty = s * (0.72 + 0.3 * w), by = s * 0.1 * w;
        c.moveTo(-0.85 * s, ty);
        c.quadraticCurveTo(-0.3 * s, by - 0.28 * s, 0, -0.18 * s);
        c.quadraticCurveTo(0.3 * s, by - 0.28 * s, 0.85 * s, ty);
        c.quadraticCurveTo(0.32 * s, by - 0.02 * s, 0, 0.08 * s);
        c.quadraticCurveTo(-0.32 * s, by - 0.02 * s, -0.85 * s, ty);
      } else {
        const ty = s * (0.3 + 0.35 * w), by = s * 0.18 * w;
        c.moveTo(-0.72 * s, ty);
        c.quadraticCurveTo(-0.32 * s, by - 0.3 * s, 0, -0.3 * s);
        c.quadraticCurveTo(0.32 * s, by - 0.3 * s, 0.72 * s, ty);
        c.quadraticCurveTo(0.28 * s, by + 0.14 * s, 0, 0.2 * s);
        c.quadraticCurveTo(-0.28 * s, by + 0.14 * s, -0.72 * s, ty);
        c.moveTo(-0.09 * s, 0.08 * s); c.lineTo(0, 0.45 * s); c.lineTo(0.09 * s, 0.08 * s);
      }
      c.closePath(); c.fill();
    }

    let last = performance.now(), frame = 0;
    const t0 = last;
    function step(now) {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const t = (now - t0) / 1000;
      const N = birds.length;
      const speed = 66, R2 = 64 * 64, sep2 = 19 * 19;
      const gx = Math.cos(t * 0.07) * 0.6 + Math.cos(t * 0.023 + 1.7) * 0.4;
      const gy = Math.sin(t * 0.052 + 0.6) * 0.45;
      let avx0 = 0, avy0 = 0;
      for (let i = 0; i < N; i++) {
        const b = birds[i];
        let avx = 0, avy = 0, cx = 0, cy = 0, sxx = 0, syy = 0, cnt = 0;
        for (let k = 0; k < 24; k++) {
          const j = (i * 31 + k * 37 + frame) % N;
          if (j === i) continue;
          const o = birds[j], dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 > R2 || d2 === 0) continue;
          avx += o.vx; avy += o.vy; cx += dx; cy += dy; cnt++;
          if (d2 < sep2) { sxx -= dx / d2 * 14; syy -= dy / d2 * 14; }
        }
        let fx = gx * 0.35, fy = gy * 0.35;
        if (cnt) {
          fx += (avx / cnt) * 1.1 + (cx / cnt) * 0.012 + sxx;
          fy += (avy / cnt) * 1.1 + (cy / cnt) * 0.012 + syy;
        }
        if (b.owner) {
          const p = players.get(b.owner);
          if (p) { fx += p.dir.x * 2.6; fy += p.dir.y * 2.6; }
        }
        b.vx += fx * dt * 2.2; b.vy += fy * dt * 2.2;
        const m = 70;
        if (b.x < m) b.vx += (m - b.x) * 0.02 * dt * 60;
        if (b.x > W - m) b.vx -= (b.x - (W - m)) * 0.02 * dt * 60;
        if (b.y < m) b.vy += (m - b.y) * 0.02 * dt * 60;
        if (b.y > H - m) b.vy -= (b.y - (H - m)) * 0.02 * dt * 60;
        const v = Math.hypot(b.vx, b.vy) || 1;
        b.vx /= v; b.vy /= v;
        b.x += b.vx * speed * b.z * dt;
        b.y += b.vy * speed * b.z * dt;
        b.flap += dt * b.fs * (0.8 + 0.4 * b.z);
        avx0 += b.vx; avy0 += b.vy;
      }
      sync += (Math.hypot(avx0 / N, avy0 / N) - sync) * 0.02;
      frame++;
      draw(t);
      requestAnimationFrame(step);
    }

    function pill(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath(); c.fill();
    }

    // 1 = zvýraznění právě naskočilo, 0 = dohaslo
    function shoutK(id, nowMs) {
      const p = players.get(id);
      if (!p || !p.shout) return 0;
      const a = nowMs - p.shout;
      return a > SHOUT_MS ? 0 : 1 - a / SHOUT_MS;
    }

    function draw(t) {
      const nowMs = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#fdf1fa'); g.addColorStop(0.5, '#f0ecfd'); g.addColorStop(1, '#e9f1fe');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const bl = [
        { x: W * (0.25 + 0.1 * Math.cos(t * 0.05)), y: H * (0.3 + 0.12 * Math.sin(t * 0.05)), c: '236,170,225' },
        { x: W * (0.75 + 0.09 * Math.cos(t * 0.037 + 2)), y: H * (0.6 + 0.1 * Math.sin(t * 0.037 + 2)), c: '176,170,245' },
        { x: W * (0.5 + 0.12 * Math.sin(t * 0.028 + 4)), y: H * (0.8 + 0.08 * Math.cos(t * 0.028)), c: '168,200,248' }
      ];
      for (const s of bl) {
        const rg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, W * 0.4);
        rg.addColorStop(0, `rgba(${s.c},0.35)`); rg.addColorStop(1, `rgba(${s.c},0)`);
        ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      }
      for (const b of birds) {
        const k = b.owner ? shoutK(b.owner, nowMs) : 0;
        const s = b.z * (b.owner ? 6.5 : 5.5) * SP_SIZE[b.sp] * (1 + 0.55 * k);
        const ang = Math.atan2(b.vy, b.vx);
        const w = Math.sin(b.flap);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(ang + Math.PI / 2);
        ctx.globalAlpha = Math.min(1, (b.owner ? 0.55 : 0.4) + b.z * 0.4 + 0.35 * k);
        ctx.fillStyle = '#26262e';
        drawShape(ctx, b.sp, s, w);
        ctx.restore();
        if (b.lead && b.owner && k <= 0) {
          const p = players.get(b.owner);
          if (p && p.name) {
            const ly = b.y - s * 2.6 - 6;
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#26262e'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(b.x - 13, ly); ctx.lineTo(b.x + 13, ly); ctx.stroke();
            ctx.fillStyle = '#26262e';
            ctx.font = '600 10px Montserrat, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(p.name.toUpperCase(), b.x, ly - 3);
            ctx.restore();
          }
        }
      }

      // ---- „Ukaž mě": vlnky + velká jmenovka nad vedoucím ptákem ----
      for (const b of birds) {
        if (!b.lead || !b.owner) continue;
        const k = shoutK(b.owner, nowMs);
        if (k <= 0) continue;
        const p = players.get(b.owner);
        const age = nowMs - p.shout;
        const fade = Math.min(1, k * 3);   // poslední třetinu doby plynule zhasne
        // na velkém plátně musí být jmenovka i kruhy poměrově stejně velké
        const sc = Math.max(1, Math.min(2.2, W / 960));
        ctx.save();

        // rozbíhavé kruhy
        for (let wv = 0; wv < 3; wv++) {
          const a = age - wv * 430;
          if (a < 0 || a > 1500) continue;
          const kk = a / 1500;
          ctx.globalAlpha = (1 - kk) * 0.6 * fade;
          ctx.strokeStyle = '#16161b';
          ctx.lineWidth = (3 * (1 - kk) + 0.6) * sc;
          ctx.beginPath(); ctx.arc(b.x, b.y, (24 + kk * 90) * sc, 0, 6.2832); ctx.stroke();
        }

        // jmenovka
        const label = (p.name || SPECIES[p.sp] && SPECIES[p.sp].name || 'Hráč').toUpperCase();
        const py = b.y - 64 * sc + Math.sin(age / 1000 * 6) * 4 * sc;
        ctx.font = '800 ' + Math.round(24 * sc) + 'px Montserrat, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#16161b';
        pill(ctx, b.x - tw / 2 - 16 * sc, py - 20 * sc, tw + 32 * sc, 40 * sc, 20 * sc);
        ctx.beginPath();
        ctx.moveTo(b.x - 8 * sc, py + 19 * sc); ctx.lineTo(b.x + 8 * sc, py + 19 * sc); ctx.lineTo(b.x, py + 30 * sc);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, b.x, py);
        ctx.restore();
      }
    }
    requestAnimationFrame(step);
  }

  // ==================================================================
  //  TELEFON — ovladač
  // ==================================================================
  let flying = false, chosenSp = 0;
  // Projekce hlasi stav ~5x za 3 s. Jedna zprava, ve ktere chybime, jeste
  // neznamena odpojeni (typicky kdyz bezi projekce ve vice oknech), proto se
  // tlacitko nabizi az po delsim tichu a mezitim se zkousime vratit sami.
  const RETRY_AFTER_MS = 4000;    // po jake dobe ticha zkusit tiche prihlaseni
  const RETRY_EVERY_MS = 4000;    // jak casto ten pokus opakovat
  const LOST_GRACE_MS  = 12000;   // az po teto dobe ukazat rucni tlacitko
  let lastSeenMs = 0, lastRetryMs = 0;

  function sendJoin(quiet) {
    if (!quiet) { lastSeenMs = performance.now(); lastRetryMs = 0; }
    send({ t: 'join', id: uid, name: document.getElementById('nameInput').value.trim(), sp: chosenSp });
  }
  function onMsg(m) {
    if (MODE === 'proj') { window.onMsgProj && window.onMsgProj(m); return; }
    if (m.t !== 'state') return;
    document.getElementById('syncValPhone').textContent = m.sync;
    const box = document.getElementById('lostBox');
    if (!flying) { box.classList.add('hidden'); return; }

    const now = performance.now();
    if (m.ids && m.ids.includes(uid)) {   // projekce nas vidi -> vse v poradku
      lastSeenMs = now;
      box.classList.add('hidden');
      return;
    }
    if (!lastSeenMs) { lastSeenMs = now; return; }   // prvni stav po prihlaseni

    const ticho = now - lastSeenMs;
    if (ticho > RETRY_AFTER_MS && now - lastRetryMs > RETRY_EVERY_MS) {
      lastRetryMs = now;
      sendJoin(true);                                // tichy pokus o navrat
    }
    box.classList.toggle('hidden', ticho <= LOST_GRACE_MS);
  }

  if (MODE === 'phone') {
    document.getElementById('phone').classList.remove('hidden');
    const grid = document.getElementById('speciesGrid');
    SPECIES.forEach((sp, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      el.innerHTML = `<svg width="56" height="28" viewBox="0 0 52 26"><path d="${sp.icon}" fill="#26262e"></path></svg><span>${sp.name}</span>`;
      el.onclick = () => {
        chosenSp = i; flying = true;
        document.getElementById('flyIcon').setAttribute('d', sp.icon);
        document.getElementById('flyName').textContent =
          (document.getElementById('nameInput').value.trim() || sp.name).toUpperCase();
        document.getElementById('pickPage').classList.add('hidden');
        document.getElementById('flyPage').classList.remove('hidden');
        sendJoin();
      };
      grid.appendChild(el);
    });
    document.getElementById('changeBtn').onclick = () => {
      flying = false;
      send({ t: 'leave', id: uid });
      document.getElementById('flyPage').classList.add('hidden');
      document.getElementById('pickPage').classList.remove('hidden');
    };
    document.getElementById('rejoinBtn').onclick = () => {
      sendJoin();
      document.getElementById('lostBox').classList.add('hidden');
    };
    const shoutBtn = document.getElementById('shoutBtn');
    const SHOUT_LABEL = shoutBtn.textContent;
    const SHOUT_COOLDOWN = 6;
    shoutBtn.onclick = () => {
      if (!flying) return;
      send({ t: 'shout', id: uid });
      shoutBtn.classList.add('cooling');
      let left = SHOUT_COOLDOWN;
      shoutBtn.textContent = 'Koukni na plátno!';
      const iv = setInterval(() => {
        left--;
        if (left <= 0) {
          clearInterval(iv);
          shoutBtn.classList.remove('cooling');
          shoutBtn.textContent = SHOUT_LABEL;
        } else if (left <= 3) {
          shoutBtn.textContent = 'Znovu za ' + left + ' s';
        }
      }, 1000);
    };

    // po odemceni displeje nebo navratu z jine aplikace se rovnou prihlasime zpet
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && flying) sendJoin(true);
    });

    setInterval(() => { if (flying) send({ t: 'ping', id: uid }); }, 3000);

    // ---------- pad ----------
    const pad = document.getElementById('pad');
    const pctx = pad.getContext('2d');
    let dir = { x: 1, y: -0.2 }, pts = [], down = false, lastSent = 0;
    const toXY = (e) => {
      const r = pad.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) / r.width * 440, y: (p.clientY - r.top) / r.height * 440 };
    };
    const move = (e) => {
      if (!down) return;
      e.preventDefault();
      const p = toXY(e);
      pts.push({ x: p.x, y: p.y, t: performance.now() });
      const dx = p.x - 220, dy = p.y - 220, m = Math.hypot(dx, dy);
      if (m > 12) {
        dir = { x: dx / m, y: dy / m };
        const now = performance.now();
        if (now - lastSent > 100) { lastSent = now; send({ t: 'dir', id: uid, x: dir.x, y: dir.y }); }
      }
    };
    pad.addEventListener('pointerdown', (e) => { down = true; pad.setPointerCapture(e.pointerId); move(e); });
    pad.addEventListener('pointermove', move);
    pad.addEventListener('pointerup', () => { down = false; });

    function drawPad() {
      pctx.clearRect(0, 0, 440, 440);
      pctx.strokeStyle = 'rgba(26,26,31,0.14)'; pctx.lineWidth = 2.5;
      pctx.beginPath(); pctx.arc(220, 220, 200, 0, 6.28); pctx.stroke();
      pctx.strokeStyle = 'rgba(26,26,31,0.06)';
      pctx.beginPath(); pctx.arc(220, 220, 120, 0, 6.28); pctx.stroke();
      const now = performance.now();
      while (pts.length && now - pts[0].t > 900) pts.shift();
      if (pts.length > 1) {
        for (let i = 1; i < pts.length; i++) {
          const a = (now - pts[i].t) / 900;
          pctx.strokeStyle = '#26262e'; pctx.globalAlpha = (1 - a) * 0.7;
          pctx.lineWidth = 5 * (1 - a) + 1.5; pctx.lineCap = 'round';
          pctx.beginPath(); pctx.moveTo(pts[i - 1].x, pts[i - 1].y); pctx.lineTo(pts[i].x, pts[i].y); pctx.stroke();
        }
        pctx.globalAlpha = 1;
      }
      const bx = 220 + dir.x * 150, by = 220 + dir.y * 150;
      pctx.fillStyle = '#26262e'; pctx.globalAlpha = 0.9;
      pctx.beginPath(); pctx.arc(bx, by, 9, 0, 6.28); pctx.fill();
      pctx.globalAlpha = 0.2;
      pctx.beginPath(); pctx.arc(bx, by, 20, 0, 6.28); pctx.fill();
      pctx.globalAlpha = 1;
      requestAnimationFrame(drawPad);
    }
    requestAnimationFrame(drawPad);
  }
})();
