/* ============================================================
   VODOVSKY MONEY · pwa.js v3.0.1
   Установка на телефон, иконки, индикатор сети, обновления.

   Не вмешивается в авторизацию и данные Supabase.
   Работает даже если service worker недоступен.
   ============================================================ */

(function () {
  'use strict';

  var VERSION = '3.0.1';
  var KEY_DISMISS = 'vodovsky.pwa.dismissedUntil';
  var KEY_SHOWN = 'vodovsky.pwa.autoShown';

  var st = {
    deferred: null,
    reg: null,
    waiting: null,
    standalone: false,
    ios: false,
    online: navigator.onLine !== false,
    reloading: false,
    lastCheck: 0,
    sheetOpen: false
  };

  /* ---------- УТИЛИТЫ ---------- */

  function $(s) { return document.querySelector(s); }

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  function detect() {
    var ua = navigator.userAgent || '';
    st.ios = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    st.standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches) ||
      navigator.standalone === true ||
      document.referrer.indexOf('android-app://') === 0;
  }

  function notify(msg, icon) {
    var box = $('#toasts');
    if (!box) { chip(msg, 'ok', 3200); return; }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      '<span class="ti">' + (icon || '✓') + '</span>' +
      '<span class="tmsg"></span>' +
      '<button class="tx" type="button" aria-label="Закрыть">✕</button>';
    el.querySelector('.tmsg').textContent = msg;
    el.querySelector('.tx').addEventListener('click', function () { el.remove(); });
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, 3600);
  }

  /* ---------- СТИЛИ (самодостаточные) ---------- */

  function injectStyles() {
    if ($('#vpwa-styles')) return;
    var css = '' +
      '.loader-inline{display:inline-block;width:14px;height:14px;border:2px solid rgba(22,21,16,.28);' +
      'border-top-color:#161510;border-radius:50%;animation:vSpin .7s linear infinite;vertical-align:-2px;margin-right:7px}' +
      '@keyframes vSpin{to{transform:rotate(360deg)}}' +

      '.vpwa-tray{position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--top,74px) + 12px);' +
      'z-index:128;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:calc(100vw - 24px);pointer-events:none}' +
      '.vpwa-chip{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:20px;' +
      "font:800 11.5px/1 'Manrope',-apple-system,'Segoe UI',Roboto,sans-serif;letter-spacing:.02em;" +
      'background:var(--s3,#1D2430);border:1px solid var(--ln2,rgba(255,255,255,.16));color:var(--tx,#EEF2F8);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.34);cursor:pointer;animation:vChip .35s cubic-bezier(.22,.9,.24,1);transition:.2s}' +
      '.vpwa-chip:hover{transform:translateY(-2px)}' +
      '.vpwa-chip i{width:7px;height:7px;border-radius:50%;flex:none;background:currentColor}' +
      '.vpwa-chip.off{background:rgba(255,92,122,.16);border-color:rgba(255,92,122,.45);color:#FF5C7A}' +
      '.vpwa-chip.upd{background:rgba(255,221,45,.16);border-color:rgba(255,221,45,.5);color:#FFDD2D}' +
      '.vpwa-chip.ok{background:rgba(47,230,167,.15);border-color:rgba(47,230,167,.45);color:#2FE6A7}' +
      '.vpwa-chip.ins{background:linear-gradient(135deg,#FFDD2D,#FFB020);border-color:transparent;color:#161510}' +
      '@keyframes vChip{from{opacity:0;transform:translateY(-10px)}}' +

      '.vpwa-scrim{position:fixed;inset:0;z-index:169;background:rgba(4,6,10,.72);backdrop-filter:blur(9px);animation:vFade .25s}' +
      '@keyframes vFade{from{opacity:0}}' +
      '.vpwa-sheet{position:fixed;z-index:170;left:50%;top:50%;transform:translate(-50%,-50%);' +
      'width:min(452px,calc(100vw - 28px));max-height:min(88vh,760px);overflow-y:auto;' +
      'background:var(--s1,#10141C);border:1px solid var(--ln2,rgba(255,255,255,.16));border-radius:26px;' +
      'padding:26px;box-shadow:0 26px 70px rgba(0,0,0,.6);animation:vPop .32s cubic-bezier(.22,.9,.24,1);' +
      "font-family:'Manrope',-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--tx,#EEF2F8)}" +
      '@keyframes vPop{from{opacity:0;transform:translate(-50%,-46%) scale(.95)}}' +
      '.vpwa-sheet::-webkit-scrollbar{width:10px}' +
      '.vpwa-sheet::-webkit-scrollbar-track{background:transparent}' +
      '.vpwa-sheet::-webkit-scrollbar-thumb{background:rgba(255,221,45,.34);border-radius:9px;border:3px solid var(--s1,#10141C)}' +
      '.vpwa-sheet::-webkit-scrollbar-thumb:hover{background:rgba(255,221,45,.64)}' +
      '.vpwa-sheet{scrollbar-width:thin;scrollbar-color:rgba(255,221,45,.34) transparent}' +

      '.vpwa-head{display:flex;align-items:center;gap:14px;margin-bottom:18px}' +
      '.vpwa-head img{width:56px;height:56px;border-radius:17px;flex:none;box-shadow:0 8px 22px rgba(255,170,20,.32)}' +
      '.vpwa-head b{display:block;font-size:16.5px;font-weight:800;line-height:1.3}' +
      '.vpwa-head span{display:block;font-size:11.5px;font-weight:600;color:var(--mu,#8E99B0);margin-top:3px}' +
      '.vpwa-x{margin-left:auto;width:34px;height:34px;flex:none;border-radius:11px;display:grid;place-items:center;' +
      'border:1px solid var(--ln,rgba(255,255,255,.08));background:var(--s2,#161B25);color:var(--mu,#8E99B0);cursor:pointer;font-size:14px}' +
      '.vpwa-x:hover{color:var(--tx,#EEF2F8);border-color:#FFDD2D}' +

      '.vpwa-sec{border-top:1px solid var(--ln,rgba(255,255,255,.08));padding-top:16px;margin-top:16px}' +
      '.vpwa-sec:first-of-type{border-top:none;padding-top:0;margin-top:0}' +
      '.vpwa-sec h4{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--mu,#8E99B0);margin-bottom:11px}' +

      '.vpwa-benef{display:flex;flex-direction:column;gap:9px;margin-bottom:16px}' +
      '.vpwa-benef div{display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:600;color:var(--mu,#8E99B0)}' +
      '.vpwa-benef i{width:22px;height:22px;flex:none;border-radius:7px;display:grid;place-items:center;font-style:normal;' +
      'font-size:11px;font-weight:800;background:rgba(47,230,167,.14);color:#2FE6A7}' +

      '.vpwa-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px;border-radius:15px;' +
      "font:800 13.5px/1 'Manrope',sans-serif;cursor:pointer;border:none;transition:.2s;margin-bottom:9px}" +
      '.vpwa-btn.pri{background:linear-gradient(135deg,#FFDD2D,#FFB020);color:#161510;box-shadow:0 8px 22px rgba(255,190,20,.28)}' +
      '.vpwa-btn.pri:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(255,190,20,.42)}' +
      '.vpwa-btn.gho{background:var(--s2,#161B25);border:1px solid var(--ln2,rgba(255,255,255,.16));color:var(--tx,#EEF2F8)}' +
      '.vpwa-btn.gho:hover{border-color:#FFDD2D;background:rgba(255,221,45,.1)}' +
      '.vpwa-btn:last-child{margin-bottom:0}' +
      '.vpwa-btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important}' +

      '.vpwa-steps{display:flex;flex-direction:column;gap:11px}' +
      '.vpwa-step{display:flex;gap:12px;align-items:flex-start;padding:13px 14px;border-radius:15px;' +
      'background:var(--s2,#161B25);border:1px solid var(--ln,rgba(255,255,255,.08))}' +
      '.vpwa-step em{width:26px;height:26px;flex:none;border-radius:9px;display:grid;place-items:center;font-style:normal;' +
      'font-size:12px;font-weight:800;background:rgba(255,221,45,.14);color:#FFDD2D}' +
      '.vpwa-step b{display:block;font-size:12.5px;font-weight:700;margin-bottom:2px}' +
      '.vpwa-step span{display:block;font-size:11.5px;font-weight:600;color:var(--mu,#8E99B0);line-height:1.5}' +
      '.vpwa-step svg{width:15px;height:15px;vertical-align:-3px;display:inline-block;margin:0 2px}' +

      '.vpwa-kv{display:flex;flex-direction:column;border:1px solid var(--ln,rgba(255,255,255,.08));border-radius:15px;overflow:hidden;margin-bottom:14px}' +
      '.vpwa-kv div{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;background:var(--s2,#161B25);font-size:12.5px}' +
      '.vpwa-kv div+div{border-top:1px solid var(--ln,rgba(255,255,255,.08))}' +
      '.vpwa-kv span{color:var(--mu,#8E99B0);font-weight:600}' +
      '.vpwa-kv b{font-weight:800}' +
      '.vpwa-note{font-size:11px;font-weight:600;color:var(--fa,#5B6478);line-height:1.55;margin-top:12px;text-align:center}' +

      '@media(max-width:860px){' +
      '.vpwa-tray{top:calc(var(--top,64px) + 8px)}' +
      '.vpwa-sheet{left:0;right:0;bottom:0;top:auto;transform:none;width:100%;max-width:none;' +
      'border-radius:26px 26px 0 0;max-height:90vh;padding:22px 18px calc(22px + env(safe-area-inset-bottom))}' +
      '@keyframes vPop{from{opacity:0;transform:translateY(40px)}}' +
      '}' +
      '@media(prefers-reduced-motion:reduce){.vpwa-chip,.vpwa-sheet,.vpwa-scrim,.loader-inline{animation-duration:.01ms!important}}';

    var el = document.createElement('style');
    el.id = 'vpwa-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  /* ---------- ИКОНКИ ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function makeIcon(size) {
    try {
      var c = document.createElement('canvas');
      c.width = size; c.height = size;
      var x = c.getContext('2d');
      if (!x) return '';

      var g = x.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, '#FFDD2D');
      g.addColorStop(0.55, '#FFB020');
      g.addColorStop(1, '#FF8A3C');
      roundRect(x, 0, 0, size, size, size * 0.22);
      x.fillStyle = g;
      x.fill();

      var rg = x.createRadialGradient(size * 0.78, size * 0.18, 0, size * 0.78, size * 0.18, size * 0.72);
      rg.addColorStop(0, 'rgba(255,255,255,0.38)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      roundRect(x, 0, 0, size, size, size * 0.22);
      x.fillStyle = rg;
      x.fill();

      x.save();
      x.translate(size / 8, size / 8);
      x.scale(size / 32, size / 32);
      var pts = [[4, 4], [12, 20], [20, 4], [15.8, 4], [12, 12.6], [8.2, 4]];
      x.beginPath();
      pts.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); });
      x.closePath();
      x.fillStyle = '#161510';
      x.fill();
      x.restore();

      return c.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  function link(rel, href, sizes, type) {
    var l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    if (sizes) l.sizes = sizes;
    if (type) l.type = type;
    document.head.appendChild(l);
  }

  function meta(name, content) {
    if (document.querySelector('meta[name="' + name + '"]')) return;
    var m = document.createElement('meta');
    m.name = name;
    m.content = content;
    document.head.appendChild(m);
  }

  var ICON_180 = '';

  function injectIcons() {
    if (!document.querySelector('link[rel="manifest"]')) {
      link('manifest', './manifest.webmanifest');
    }
    if (!document.querySelector('link[rel~="icon"]')) {
      link('icon', './icon.svg', 'any', 'image/svg+xml');
    }

    ICON_180 = makeIcon(180);
    var i32 = makeIcon(32);
    var i16 = makeIcon(16);

    if (i32) link('icon', i32, '32x32', 'image/png');
    if (i16) link('icon', i16, '16x16', 'image/png');
    if (ICON_180) {
      link('apple-touch-icon', ICON_180, '180x180');
      link('apple-touch-icon-precomposed', ICON_180, '180x180');
    }

    meta('apple-mobile-web-app-capable', 'yes');
    meta('mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    meta('apple-mobile-web-app-title', 'V MONEY');
    meta('application-name', 'VODOVSKY MONEY');
    meta('msapplication-TileColor', '#080B10');
  }

  /* ---------- TRAY / ЧИПЫ ---------- */

  function tray() {
    var t = $('#vpwa-tray');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vpwa-tray';
      t.className = 'vpwa-tray';
      document.body.appendChild(t);
    }
    return t;
  }

  function chip(text, kind, ttl, onClick) {
    var t = tray();
    var el = document.createElement(onClick ? 'button' : 'div');
    el.className = 'vpwa-chip ' + (kind || '');
    el.innerHTML = '<i></i><span></span>';
    el.querySelector('span').textContent = text;
    if (onClick) el.addEventListener('click', onClick);
    t.appendChild(el);
    if (ttl) {
      setTimeout(function () {
        el.style.transition = 'opacity .3s, transform .3s';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        setTimeout(function () { el.remove(); }, 320);
      }, ttl);
    }
    return el;
  }

  var offlineChip = null, updateChip = null, installChip = null;

  function renderChips() {
    if (!st.online && !offlineChip) {
      offlineChip = chip('Нет сети — данные не синхронизируются', 'off');
    }
    if (st.online && offlineChip) { offlineChip.remove(); offlineChip = null; }

    if (st.waiting && !updateChip) {
      updateChip = chip('Доступно обновление', 'upd', 0, applyUpdate);
    }
    if (!st.waiting && updateChip) { updateChip.remove(); updateChip = null; }

    var canInstall = !st.standalone && (st.deferred || st.ios);
    var dismissedUntil = Number(lsGet(KEY_DISMISS) || 0);
    var allowed = Date.now() > dismissedUntil;

    if (canInstall && allowed && !installChip) {
      installChip = chip('Установить приложение', 'ins', 0, openSheet);
    }
    if ((!canInstall || !allowed) && installChip) { installChip.remove(); installChip = null; }
  }

  /* ---------- ЛИСТ УСТАНОВКИ ---------- */

  function closeSheet() {
    st.sheetOpen = false;
    var s = $('#vpwa-sheet'), sc = $('#vpwa-scrim');
    if (s) s.remove();
    if (sc) sc.remove();
  }

  function dismissSheet(days) {
    lsSet(KEY_DISMISS, String(Date.now() + (days || 7) * 864e5));
    closeSheet();
    renderChips();
  }

  function installBlock() {
    if (st.standalone) {
      return '<div class="vpwa-sec"><h4>Установка</h4>' +
        '<div class="vpwa-step"><em>✓</em><div><b>Приложение уже установлено</b>' +
        '<span>Ты открыл VODOVSKY MONEY как приложение. Ярлык доступен на рабочем столе.</span></div></div></div>';
    }

    var benefits =
      '<div class="vpwa-benef">' +
      '<div><i>✓</i><span>Иконка VODOVSKY на рабочем столе</span></div>' +
      '<div><i>✓</i><span>Запуск в полном экране, без адресной строки</span></div>' +
      '<div><i>✓</i><span>Быстрые действия: новая операция, цели, кабинет</span></div>' +
      '<div><i>✓</i><span>Оболочка открывается даже при слабой сети</span></div>' +
      '</div>';

    if (st.deferred) {
      return '<div class="vpwa-sec"><h4>Установка</h4>' + benefits +
        '<button class="vpwa-btn pri" type="button" data-v="install">Установить приложение</button>' +
        '<button class="vpwa-btn gho" type="button" data-v="later">Не сейчас</button></div>';
    }

    if (st.ios) {
      var share =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
      var plus =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>';
      return '<div class="vpwa-sec"><h4>Установка на iPhone</h4>' + benefits +
        '<div class="vpwa-steps">' +
        '<div class="vpwa-step"><em>1</em><div><b>Открой сайт в Safari</b>' +
        '<span>Установка на iOS работает только через Safari, не через Chrome.</span></div></div>' +
        '<div class="vpwa-step"><em>2</em><div><b>Нажми «Поделиться» ' + share + '</b>' +
        '<span>Кнопка внизу экрана Safari — квадрат со стрелкой вверх.</span></div></div>' +
        '<div class="vpwa-step"><em>3</em><div><b>Выбери «На экран Домой» ' + plus + '</b>' +
        '<span>Прокрути список вниз, затем нажми «Добавить». Иконка появится на рабочем столе.</span></div></div>' +
        '</div>' +
        '<button class="vpwa-btn gho" type="button" data-v="later" style="margin-top:14px">Понятно</button></div>';
    }

    return '<div class="vpwa-sec"><h4>Установка</h4>' + benefits +
      '<div class="vpwa-step"><em>i</em><div><b>Через меню браузера</b>' +
      '<span>Открой меню браузера (⋮ или ⋯) и выбери «Установить приложение» либо «Добавить на главный экран». ' +
      'Если пункта нет — браузер уже предложил установку автоматически или сайт ещё не прогрет кэшем.</span></div></div>' +
      '<button class="vpwa-btn gho" type="button" data-v="later" style="margin-top:14px">Закрыть</button></div>';
  }

  function appBlock() {
    var mode = st.standalone ? 'Приложение' : 'Браузер';
    var net = st.online ? 'В сети' : 'Нет сети';
    var sw = st.reg ? 'Активен' : 'Недоступен';
    return '<div class="vpwa-sec"><h4>Приложение</h4>' +
      '<div class="vpwa-kv">' +
      '<div><span>Версия</span><b>' + VERSION + '</b></div>' +
      '<div><span>Режим</span><b>' + mode + '</b></div>' +
      '<div><span>Соединение</span><b>' + net + '</b></div>' +
      '<div><span>Офлайн-оболочка</span><b>' + sw + '</b></div>' +
      '</div>' +
      '<button class="vpwa-btn gho" type="button" data-v="check">Проверить обновления</button>' +
      '<button class="vpwa-btn gho" type="button" data-v="clear">Сбросить кэш и перезагрузить</button>' +
      '<p class="vpwa-note">Данные аккаунта и Supabase не затрагиваются. Сбрасывается только кэш файлов сайта.</p></div>';
  }

  function openSheet() {
    if (st.sheetOpen) return;
    st.sheetOpen = true;
    lsSet(KEY_SHOWN, '1');

    var sc = document.createElement('div');
    sc.id = 'vpwa-scrim';
    sc.className = 'vpwa-scrim';
    sc.addEventListener('click', closeSheet);
    document.body.appendChild(sc);

    var s = document.createElement('div');
    s.id = 'vpwa-sheet';
    s.className = 'vpwa-sheet';
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    s.innerHTML =
      '<div class="vpwa-head">' +
      (ICON_180 ? '<img src="' + ICON_180 + '" alt="VODOVSKY MONEY">' : '') +
      '<div><b>VODOVSKY MONEY</b><span>Приложение на телефоне · v' + VERSION + '</span></div>' +
      '<button class="vpwa-x" type="button" data-v="close" aria-label="Закрыть">✕</button>' +
      '</div>' + installBlock() + appBlock();

    s.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      var a = b.dataset.v;
      if (a === 'close') closeSheet();
      else if (a === 'later') dismissSheet(7);
      else if (a === 'install') doInstall(b);
      else if (a === 'check') checkUpdate(true);
      else if (a === 'clear') clearCache();
    });

    document.body.appendChild(s);
  }

  async function doInstall(btn) {
    if (!st.deferred) { openSheet(); return; }
    btn.disabled = true;
    btn.textContent = 'Открываем установщик…';
    try {
      st.deferred.prompt();
      var choice = await st.deferred.userChoice;
      st.deferred = null;
      if (choice && choice.outcome === 'accepted') {
        closeSheet();
        notify('Приложение устанавливается', '📲');
      } else {
        btn.disabled = false;
        btn.textContent = 'Установить приложение';
        dismissSheet(3);
      }
      renderChips();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Установить приложение';
      notify('Установщик недоступен. Используй меню браузера.', 'ℹ️');
    }
  }

  /* ---------- SERVICE WORKER ---------- */

  function applyUpdate() {
    if (st.waiting) {
      notify('Обновляем приложение…', '🔄');
      st.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      checkUpdate(true);
    }
  }

  function clearCache() {
    if (!st.reg || !st.reg.active) {
      location.reload();
      return;
    }
    notify('Сбрасываем кэш…', '🧹');
    st.reg.active.postMessage({ type: 'CLEAR_CACHE' });
    setTimeout(function () { location.reload(); }, 700);
  }

  function checkUpdate(manual) {
    if (!st.reg) {
      if (manual) notify('Офлайн-оболочка недоступна', 'ℹ️');
      return;
    }
    st.lastCheck = Date.now();
    st.reg.update().then(function () {
      if (manual && !st.waiting) notify('Установлена последняя версия', '✓');
    }).catch(function () {
      if (manual) notify('Не удалось проверить обновление', '⚠️');
    });
  }

  function watchWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        st.waiting = worker;
        renderChips();
      }
    });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;

    navigator.serviceWorker.register('sw.js', { scope: './' }).then(function (reg) {
      st.reg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) {
        st.waiting = reg.waiting;
        renderChips();
      }
      watchWorker(reg.installing);
      reg.addEventListener('updatefound', function () {
        watchWorker(reg.installing);
      });
      st.lastCheck = Date.now();
      renderChips();
    }).catch(function () {
      /* Нет sw.js или нет прав — приложение продолжает работать как сайт. */
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (st.reloading) return;
      st.reloading = true;
      location.reload();
    });

    setInterval(function () { checkUpdate(false); }, 30 * 60 * 1000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Date.now() - st.lastCheck > 60000) checkUpdate(false);
    });
  }

  /* ---------- ЯРЛЫКИ ИЗ МАНИФЕСТА ---------- */

  function applyShortcut() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    var view = params.get('view');
    var action = params.get('action');
    if (!view && !action) return;

    var valid = ['dashboard', 'transactions', 'goals', 'payments', 'account'];
    var tries = 0;

    function clean() {
      try {
        var url = new URL(location.href);
        url.searchParams.delete('view');
        url.searchParams.delete('action');
        history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
      } catch (e) {}
    }

    var timer = setInterval(function () {
      tries++;
      var shell = $('#appShell');
      var ready = shell && !shell.hidden;
      if (!ready) {
        if (tries > 225) clearInterval(timer);
        return;
      }
      if (view && valid.indexOf(view) >= 0) {
        var nav = document.querySelector('.nav-btn[data-route="' + view + '"]');
        if (nav) nav.click();
      }
      if (action === 'new-tx') {
        setTimeout(function () {
          var add = document.querySelector('[data-action="new-tx"]');
          if (add) add.click();
        }, 420);
      }
      clean();
      clearInterval(timer);
    }, 400);
  }

  /* ---------- ПУНКТ В ЛИЧНОМ КАБИНЕТЕ ---------- */

  function augmentAccount() {
    var view = $('#view');
    if (!view) return;
    var acc = view.querySelector('.account');
    if (!acc) return;

    var target = null;
    acc.querySelectorAll('.card').forEach(function (c) {
      if (c.querySelector('[data-change="theme-select"]')) target = c;
    });
    if (!target || target.querySelector('[data-vpwa-row]')) return;

    var row = document.createElement('div');
    row.className = 'setting-row';
    row.setAttribute('data-vpwa-row', '1');
    row.innerHTML =
      '<div class="info"><b>Приложение на телефоне</b>' +
      '<span>Установка, версия и обновление</span></div>' +
      '<button class="btn gho sm" type="button">Открыть</button>';
    row.querySelector('button').addEventListener('click', openSheet);
    target.appendChild(row);
  }

  function watchAccount() {
    var view = $('#view');
    if (!view || !window.MutationObserver) return;
    var h = null;
    var mo = new MutationObserver(function () {
      clearTimeout(h);
      h = setTimeout(augmentAccount, 140);
    });
    mo.observe(view, { childList: true, subtree: true });
    augmentAccount();
  }

  /* ---------- СЕТЬ ---------- */

  function bindNetwork() {
    window.addEventListener('online', function () {
      st.online = true;
      renderChips();
      notify('Снова в сети', '🌐');
      checkUpdate(false);
    });
    window.addEventListener('offline', function () {
      st.online = false;
      renderChips();
    });
  }

  /* ---------- АВТОПОКАЗ ---------- */

  function autoPrompt() {
    if (st.standalone) return;
    if (lsGet(KEY_SHOWN) === '1') return;
    if (Date.now() < Number(lsGet(KEY_DISMISS) || 0)) return;
    if (!st.deferred && !st.ios) return;

    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var shell = $('#appShell');
      var ready = shell && !shell.hidden;
      var blocked = $('#modalRoot') && $('#modalRoot').innerHTML;
      var drawer = $('#drawerRoot') && $('#drawerRoot').innerHTML;

      if (ready && !blocked && !drawer && tries > 6) {
        clearInterval(timer);
        openSheet();
      }
      if (tries > 150) clearInterval(timer);
    }, 500);
  }

  /* ---------- СОБЫТИЯ УСТАНОВКИ ---------- */

  function bindInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      st.deferred = e;
      renderChips();
      autoPrompt();
    });

    window.addEventListener('appinstalled', function () {
      st.deferred = null;
      st.standalone = true;
      closeSheet();
      renderChips();
      notify('VODOVSKY MONEY установлен', '🎉');
    });

    if (window.matchMedia) {
      var mq = window.matchMedia('(display-mode: standalone)');
      var handler = function () { detect(); renderChips(); };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  }

  /* ---------- КЛАВИАТУРА ---------- */

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && st.sheetOpen) {
        e.stopPropagation();
        closeSheet();
      }
    }, true);
  }

  /* ---------- СТАРТ ---------- */

  function start() {
    detect();
    injectStyles();
    injectIcons();
    tray();
    bindNetwork();
    bindInstall();
    bindKeys();
    registerSW();
    applyShortcut();
    watchAccount();
    renderChips();
    autoPrompt();

    if (st.standalone) {
      document.documentElement.setAttribute('data-vpwa-mode', 'standalone');
    }

    window.VPWA = {
      version: VERSION,
      open: openSheet,
      close: closeSheet,
      update: function () { checkUpdate(true); },
      applyUpdate: applyUpdate,
      clearCache: clearCache,
      isStandalone: function () { return st.standalone; },
      isOnline: function () { return st.online; }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
