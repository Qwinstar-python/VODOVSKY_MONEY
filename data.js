/* ============================================================
   VODOVSKY MONEY · data.js v3.0
   Слой данных Supabase: авторизация, профиль, операции,
   цели, выплаты, приватные фото, понятные ошибки.
   ============================================================ */

(function () {
  'use strict';

  var CFG = window.VODOVSKY_CONFIG || {};
  var SB = CFG.supabase || {};
  var DEFAULTS = CFG.defaults || {};
  var BUCKET = (CFG.storage && CFG.storage.goalPhotos) || 'goal-photos';

  var client = null;
  var authSub = null;

  /* ---------- УТИЛИТЫ ---------- */

  function num(v) {
    var n = Number(String(v == null ? 0 : v).replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function monthKey(d) {
    var x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0');
  }

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function (k) {
      if (obj[k] !== undefined) out[k] = obj[k];
    });
    return out;
  }

  function jwtRole(token) {
    try {
      var part = String(token).split('.')[1];
      if (!part) return '';
      var s = part.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var json = JSON.parse(decodeURIComponent(escape(atob(s))));
      return json.role || '';
    } catch (e) {
      return '';
    }
  }

  function hardFail(message, code) {
    var e = new Error(message);
    e.code = code || 'CONFIG';
    e.fatal = true;
    throw e;
  }

  /* Понятные сообщения об ошибках вместо технических */
  function norm(err) {
    if (!err) return new Error('Неизвестная ошибка');
    if (err.fatal) return err;

    var msg = err.message || String(err);
    var code = err.code || '';
    var out = '';

    if (/Invalid login credentials/i.test(msg)) {
      out = 'Неверный email или пароль.';
    } else if (/Email not confirmed/i.test(msg)) {
      out = 'Email не подтверждён. Открой письмо или отключи Confirm email в Supabase → Authentication → Email.';
    } else if (/already registered|already been registered|User already exists/i.test(msg)) {
      out = 'Этот email уже зарегистрирован. Войди или восстанови пароль.';
    } else if (/Password should be at least/i.test(msg)) {
      out = 'Пароль слишком короткий — минимум 6 символов.';
    } else if (/unable to validate email|invalid email|Email address .* is invalid/i.test(msg)) {
      out = 'Проверь адрес email — он выглядит неправильно.';
    } else if (/rate limit|too many requests|security purposes/i.test(msg)) {
      out = 'Слишком много попыток. Подожди минуту и попробуй снова.';
    } else if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) {
      out = 'Нет связи с Supabase. Проверь интернет или разбуди проект в дашборде.';
    } else if (code === '42P01' || /relation .* does not exist/i.test(msg)) {
      out = 'Таблицы не созданы. Выполни supabase.sql в Supabase → SQL Editor.';
    } else if (code === '42703' || /column .* does not exist/i.test(msg)) {
      out = 'В таблице не хватает колонки. Выполни обновляющий SQL. Подробность: ' + msg;
    } else if (code === 'PGRST204' || /schema cache/i.test(msg)) {
      out = 'Supabase ещё не видит новую колонку. Подожди минуту и обнови страницу.';
    } else if (code === '23505') {
      out = 'Такая запись уже существует.';
    } else if (code === '23503') {
      out = 'Запись связана с другими данными и не может быть изменена.';
    } else if (code === '23514') {
      out = 'Значение не прошло проверку базы. Проверь сумму, дату и день месяца.';
    } else if (code === '22P02') {
      out = 'Неверный формат числа или даты.';
    } else if (/invalid API key|Invalid API key|JWT|jwt expired/i.test(msg)) {
      out = 'Ключ Supabase отклонён. Проверь anonKey в config.js.';
    } else if (/row-level security|violates row-level/i.test(msg)) {
      out = 'Нет доступа к записи. Убедись, что ты вошёл в свой аккаунт.';
    } else if (/Bucket not found/i.test(msg)) {
      out = 'Хранилище фото не создано. Выполни supabase.sql целиком.';
    } else if (/Payload too large|413/i.test(msg)) {
      out = 'Файл слишком большой. Выбери фото поменьше.';
    } else {
      out = msg;
    }

    var e = new Error(out);
    e.code = code;
    e.raw = err;
    return e;
  }

  /* ---------- КОНФИГ И КЛИЕНТ ---------- */

  function configError() {
    var url = String(SB.url || '').trim();
    var key = String(SB.anonKey || '').trim();

    if (!url || !key) return 'Не заполнены url и anonKey в файле config.js';
    if (!/^https:\/\//i.test(url)) return 'url в config.js должен начинаться с https://';
    if (/\s/.test(url)) return 'В url есть пробелы — скопируй адрес заново';
    if (/\s/.test(key)) return 'В ключе есть пробелы — скопируй ключ заново';
    if (key.indexOf('sb_secret_') === 0) {
      return 'В config.js вставлен СЕКРЕТНЫЙ ключ. Замени его на publishable или anon public.';
    }
    if (jwtRole(key) === 'service_role') {
      return 'В config.js вставлен service_role ключ. Замени его на anon public.';
    }
    return '';
  }

  function isConfigured() {
    return configError() === '';
  }

  function init() {
    var err = configError();
    if (err) hardFail(err, 'CONFIG');

    if (!window.supabase || !window.supabase.createClient) {
      hardFail('Библиотека Supabase не загрузилась. Проверь интернет и обнови страницу.', 'SDK');
    }
    if (client) return client;

    client = window.supabase.createClient(
      String(SB.url).trim(),
      String(SB.anonKey).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'vodovsky-money-auth'
        }
      }
    );
    return client;
  }

  function db() {
    if (!client) init();
    return client;
  }

  function redirectUrl() {
    if (CFG.auth && CFG.auth.redirectTo) return CFG.auth.redirectTo;
    if (window.location.protocol === 'file:') return undefined;
    return window.location.origin + window.location.pathname;
  }

  /* ---------- АВТОРИЗАЦИЯ ---------- */

  async function signUp(email, password, name) {
    var c = db();
    var cleanEmail = String(email || '').trim().toLowerCase();
    var displayName = String(name || '').trim() || cleanEmail.split('@')[0] || 'Пользователь';
    var options = { data: { display_name: displayName } };
    var redirect = redirectUrl();
    if (redirect) options.emailRedirectTo = redirect;

    var res = await c.auth.signUp({
      email: cleanEmail,
      password: String(password || ''),
      options: options
    });
    if (res.error) throw norm(res.error);
    return res.data;
  }

  async function signIn(email, password) {
    var c = db();
    var res = await c.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: String(password || '')
    });
    if (res.error) throw norm(res.error);
    return res.data;
  }

  /* Выход работает даже без интернета — локальная сессия чистится всегда */
  async function signOut() {
    var c = db();
    var res = await c.auth.signOut();
    if (res.error) {
      try { await c.auth.signOut({ scope: 'local' }); } catch (e) {}
    }
    return true;
  }

  async function getSession() {
    var c = db();
    var res = await c.auth.getSession();
    if (res.error) throw norm(res.error);
    return res.data ? res.data.session : null;
  }

  function onAuthChange(callback) {
    var c = db();
    if (authSub) {
      try { authSub.data.subscription.unsubscribe(); } catch (e) {}
      authSub = null;
    }
    var res = c.auth.onAuthStateChange(function (event, session) {
      callback(event, session);
    });
    authSub = res;
    return function () {
      try { res.data.subscription.unsubscribe(); } catch (e) {}
      authSub = null;
    };
  }

  async function resetPassword(email) {
    var c = db();
    var options = {};
    var redirect = redirectUrl();
    if (redirect) options.redirectTo = redirect;
    var res = await c.auth.resetPasswordForEmail(
      String(email || '').trim().toLowerCase(),
      options
    );
    if (res.error) throw norm(res.error);
    return true;
  }

  async function updatePassword(newPassword) {
    var c = db();
    var res = await c.auth.updateUser({ password: String(newPassword || '') });
    if (res.error) throw norm(res.error);
    return res.data;
  }

  /* ---------- ПРОФИЛЬ ---------- */

  async function loadProfile(user) {
    var c = db();
    var res = await c.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (res.error) throw norm(res.error);
    if (res.data) return res.data;

    var meta = user.user_metadata || {};
    var ins = await c.from('profiles').insert({
      id: user.id,
      email: user.email,
      display_name: meta.display_name || String(user.email || '').split('@')[0] || 'Пользователь',
      currency: DEFAULTS.currency || 'RUB',
      theme: DEFAULTS.theme || 'dark'
    }).select().single();
    if (ins.error) throw norm(ins.error);
    return ins.data;
  }

  async function saveProfile(userId, patch) {
    var c = db();
    var allowed = pick(patch, ['display_name', 'avatar_url', 'currency', 'theme']);
    var res = await c.from('profiles').update(allowed).eq('id', userId).select().single();
    if (res.error) throw norm(res.error);
    return res.data;
  }

  /* ---------- МАППЕРЫ ---------- */

  function mapTx(r) {
    return {
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      amount: num(r.amount),
      category: r.category || 'other',
      note: r.note || '',
      date: r.date,
      sort_order: num(r.sort_order),
      created_at: r.created_at
    };
  }

  function mapGoal(r) {
    return {
      id: r.id,
      user_id: r.user_id,
      title: r.title,
      target: num(r.target),
      saved: num(r.saved),
      photo_path: r.photo_path || '',
      photo_url: '',
      deadline: r.deadline || '',
      created_at: r.created_at
    };
  }

  function mapPay(r) {
    return {
      id: r.id,
      user_id: r.user_id,
      title: r.title,
      amount: num(r.amount),
      day: num(r.day),
      category: r.category || 'other',
      active: !!r.active,
      last_paid_month: r.last_paid_month || '',
      created_at: r.created_at
    };
  }

  /* ---------- ЗАГРУЗКА ВСЕХ ДАННЫХ ---------- */

  async function loadAll(userId) {
    var c = db();
    var results = await Promise.all([
      c.from('transactions').select('*').eq('user_id', userId)
        .order('sort_order', { ascending: false })
        .order('date', { ascending: false })
        .limit(2000),
      c.from('goals').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }),
      c.from('payments').select('*').eq('user_id', userId)
        .order('day', { ascending: true })
    ]);

    if (results[0].error) throw norm(results[0].error);
    if (results[1].error) throw norm(results[1].error);
    if (results[2].error) throw norm(results[2].error);

    return {
      transactions: (results[0].data || []).map(mapTx),
      goals: (results[1].data || []).map(mapGoal),
      payments: (results[2].data || []).map(mapPay)
    };
  }

  /* ---------- ОПЕРАЦИИ ---------- */

  async function createTransaction(userId, tx) {
    var c = db();
    var row = {
      user_id: userId,
      type: tx.type === 'income' ? 'income' : 'expense',
      amount: num(tx.amount),
      category: tx.category || 'other',
      note: tx.note || '',
      date: tx.date || today(),
      sort_order: tx.sort_order != null ? num(tx.sort_order) : Date.now()
    };
    var res = await c.from('transactions').insert(row).select().single();
    if (res.error) throw norm(res.error);
    return mapTx(res.data);
  }

  async function updateTransaction(userId, id, patch) {
    var c = db();
    var allowed = pick(patch, ['type', 'amount', 'category', 'note', 'date', 'sort_order']);
    if (allowed.amount !== undefined) allowed.amount = num(allowed.amount);
    if (allowed.sort_order !== undefined) allowed.sort_order = num(allowed.sort_order);
    var res = await c.from('transactions').update(allowed)
      .eq('id', id).eq('user_id', userId).select().single();
    if (res.error) throw norm(res.error);
    return mapTx(res.data);
  }

  async function deleteTransactions(userId, ids) {
    if (!ids || !ids.length) return true;
    var c = db();
    var res = await c.from('transactions').delete()
      .eq('user_id', userId).in('id', ids);
    if (res.error) throw norm(res.error);
    return true;
  }

  async function restoreTransactions(userId, rows) {
    if (!rows || !rows.length) return [];
    var c = db();
    var payload = rows.map(function (r) {
      return {
        id: r.id,
        user_id: userId,
        type: r.type,
        amount: num(r.amount),
        category: r.category || 'other',
        note: r.note || '',
        date: r.date || today(),
        sort_order: r.sort_order != null ? num(r.sort_order) : Date.now(),
        created_at: r.created_at || new Date().toISOString()
      };
    });
    var res = await c.from('transactions').insert(payload).select();
    if (res.error) throw norm(res.error);
    return (res.data || []).map(mapTx);
  }

  /* Ручной порядок: обновляем только изменённые строки, пачками */
  async function reorderTransactions(userId, items) {
    var c = db();
    var list = (items || []).filter(function (i) {
      return i && i.id && i.sort_order != null;
    });
    for (var i = 0; i < list.length; i += 8) {
      var chunk = list.slice(i, i + 8);
      var res = await Promise.all(chunk.map(function (it) {
        return c.from('transactions').update({ sort_order: num(it.sort_order) })
          .eq('id', it.id).eq('user_id', userId);
      }));
      for (var j = 0; j < res.length; j++) {
        if (res[j].error) throw norm(res[j].error);
      }
    }
    return true;
  }

  /* ---------- ЦЕЛИ ---------- */

  async function createGoal(userId, goal) {
    var c = db();
    var row = {
      user_id: userId,
      title: String(goal.title || '').trim(),
      target: num(goal.target),
      saved: num(goal.saved),
      photo_path: goal.photo_path || null,
      deadline: goal.deadline || null
    };
    var res = await c.from('goals').insert(row).select().single();
    if (res.error) throw norm(res.error);
    return mapGoal(res.data);
  }

  async function updateGoal(userId, id, patch) {
    var c = db();
    var allowed = pick(patch, ['title', 'target', 'saved', 'photo_path', 'deadline']);
    if (allowed.target !== undefined) allowed.target = num(allowed.target);
    if (allowed.saved !== undefined) allowed.saved = num(allowed.saved);
    if (allowed.deadline === '') allowed.deadline = null;
    if (allowed.photo_path === '') allowed.photo_path = null;
    var res = await c.from('goals').update(allowed)
      .eq('id', id).eq('user_id', userId).select().single();
    if (res.error) throw norm(res.error);
    return mapGoal(res.data);
  }

  /* Фото не удаляем сразу — иначе не сработает «Отменить» */
  async function deleteGoal(userId, id) {
    var c = db();
    var res = await c.from('goals').delete().eq('id', id).eq('user_id', userId);
    if (res.error) throw norm(res.error);
    return true;
  }

  async function restoreGoal(userId, goal) {
    var c = db();
    var res = await c.from('goals').insert({
      id: goal.id,
      user_id: userId,
      title: goal.title,
      target: num(goal.target),
      saved: num(goal.saved),
      photo_path: goal.photo_path || null,
      deadline: goal.deadline || null,
      created_at: goal.created_at || new Date().toISOString()
    }).select().single();
    if (res.error) throw norm(res.error);
    return mapGoal(res.data);
  }

  /* ---------- ФОТО ЦЕЛЕЙ ---------- */

  async function uploadPhoto(userId, goalId, blob) {
    var c = db();
    var path = userId + '/' + goalId + '/' + Date.now() + '.jpg';
    var res = await c.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false
    });
    if (res.error) throw norm(res.error);
    return path;
  }

  async function deletePhoto(path) {
    if (!path) return true;
    var c = db();
    var res = await c.storage.from(BUCKET).remove([path]);
    if (res.error) throw norm(res.error);
    return true;
  }

  /* Если фото не открылось — интерфейс всё равно работает */
  async function photoUrl(path) {
    if (!path) return '';
    try {
      var c = db();
      var res = await c.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (res.error) return '';
      return (res.data && res.data.signedUrl) || '';
    } catch (e) {
      return '';
    }
  }

  async function attachPhotos(goals) {
    var list = goals || [];
    var urls = await Promise.all(list.map(function (g) {
      return g.photo_path ? photoUrl(g.photo_path) : Promise.resolve('');
    }));
    return list.map(function (g, i) {
      var copy = {};
      for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) copy[k] = g[k];
      copy.photo_url = urls[i] || '';
      return copy;
    });
  }

  /* ---------- ВЫПЛАТЫ ---------- */

  async function createPayment(userId, p) {
    var c = db();
    var res = await c.from('payments').insert({
      user_id: userId,
      title: String(p.title || '').trim(),
      amount: num(p.amount),
      day: Math.round(num(p.day)),
      category: p.category || 'other',
      active: p.active !== false,
      last_paid_month: p.last_paid_month || null
    }).select().single();
    if (res.error) throw norm(res.error);
    return mapPay(res.data);
  }

  async function updatePayment(userId, id, patch) {
    var c = db();
    var allowed = pick(patch, ['title', 'amount', 'day', 'category', 'active', 'last_paid_month']);
    if (allowed.amount !== undefined) allowed.amount = num(allowed.amount);
    if (allowed.day !== undefined) allowed.day = Math.round(num(allowed.day));
    if (allowed.last_paid_month === '') allowed.last_paid_month = null;
    var res = await c.from('payments').update(allowed)
      .eq('id', id).eq('user_id', userId).select().single();
    if (res.error) throw norm(res.error);
    return mapPay(res.data);
  }

  async function deletePayment(userId, id) {
    var c = db();
    var res = await c.from('payments').delete().eq('id', id).eq('user_id', userId);
    if (res.error) throw norm(res.error);
    return true;
  }

  async function restorePayment(userId, p) {
    var c = db();
    var res = await c.from('payments').insert({
      id: p.id,
      user_id: userId,
      title: p.title,
      amount: num(p.amount),
      day: Math.round(num(p.day)),
      category: p.category || 'other',
      active: p.active !== false,
      last_paid_month: p.last_paid_month || null,
      created_at: p.created_at || new Date().toISOString()
    }).select().single();
    if (res.error) throw norm(res.error);
    return mapPay(res.data);
  }

  /* Оплата создаёт расход и отмечает месяц. При сбое — откат. */
  async function payPayment(userId, payment, month) {
    var c = db();
    var ins = await c.from('transactions').insert({
      user_id: userId,
      type: 'expense',
      amount: num(payment.amount),
      category: payment.category || 'other',
      note: payment.title,
      date: today(),
      sort_order: Date.now()
    }).select().single();
    if (ins.error) throw norm(ins.error);

    var upd = await c.from('payments').update({ last_paid_month: month })
      .eq('id', payment.id).eq('user_id', userId).select().single();
    if (upd.error) {
      await c.from('transactions').delete().eq('id', ins.data.id).eq('user_id', userId);
      throw norm(upd.error);
    }
    return { transaction: mapTx(ins.data), payment: mapPay(upd.data) };
  }

  async function undoPayment(userId, transactionId, paymentId, prevMonth) {
    var c = db();
    if (transactionId) {
      var del = await c.from('transactions').delete()
        .eq('id', transactionId).eq('user_id', userId);
      if (del.error) throw norm(del.error);
    }
    var res = await c.from('payments').update({ last_paid_month: prevMonth || null })
      .eq('id', paymentId).eq('user_id', userId).select().single();
    if (res.error) throw norm(res.error);
    return mapPay(res.data);
  }

  /* ---------- ОБСЛУЖИВАНИЕ ---------- */

  async function sweepPhotos(userId) {
    var c = db();
    try {
      var root = await c.storage.from(BUCKET).list(userId, { limit: 1000 });
      if (root.error || !root.data) return;
      var paths = [];
      for (var i = 0; i < root.data.length; i++) {
        var item = root.data[i];
        if (item.id) {
          paths.push(userId + '/' + item.name);
        } else {
          var folder = item.name;
          var sub = await c.storage.from(BUCKET).list(userId + '/' + folder, { limit: 1000 });
          if (sub.data) {
            sub.data.forEach(function (f) {
              if (f.id) paths.push(userId + '/' + folder + '/' + f.name);
            });
          }
        }
      }
      if (paths.length) await c.storage.from(BUCKET).remove(paths);
    } catch (e) { /* чистка фото не должна ломать основное действие */ }
  }

  async function clearAll(userId) {
    var c = db();
    await sweepPhotos(userId);
    var res = await Promise.all([
      c.from('transactions').delete().eq('user_id', userId),
      c.from('goals').delete().eq('user_id', userId),
      c.from('payments').delete().eq('user_id', userId)
    ]);
    res.forEach(function (r) { if (r.error) throw norm(r.error); });
    return true;
  }

  /* Диагностика: какие таблицы недоступны */
  async function checkSchema() {
    var c = db();
    var tables = ['profiles', 'transactions', 'goals', 'payments'];
    var problems = [];
    for (var i = 0; i < tables.length; i++) {
      var r = await c.from(tables[i]).select('*').limit(1);
      if (r.error) {
        problems.push({
          table: tables[i],
          code: r.error.code || '',
          message: norm(r.error).message
        });
      }
    }
    return problems;
  }

  /* ---------- ЭКСПОРТ ---------- */

  function buildExport(profile, data) {
    return {
      app: (CFG.app && CFG.app.name) || 'VODOVSKY MONEY',
      version: (CFG.app && CFG.app.version) || '3.0.0',
      exported_at: new Date().toISOString(),
      profile: profile || null,
      transactions: data.transactions || [],
      goals: (data.goals || []).map(function (g) {
        var copy = {};
        for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) copy[k] = g[k];
        delete copy.photo_url;
        return copy;
      }),
      payments: data.payments || []
    };
  }

  /* ---------- ПУБЛИЧНЫЙ ИНТЕРФЕЙС ---------- */

  window.VData = {
    bucket: BUCKET,
    configError: configError,
    isConfigured: isConfigured,
    init: init,
    getClient: function () { return client; },
    errorMessage: function (err) { return norm(err).message; },

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    onAuthChange: onAuthChange,
    resetPassword: resetPassword,
    updatePassword: updatePassword,

    loadProfile: loadProfile,
    saveProfile: saveProfile,
    loadAll: loadAll,

    createTransaction: createTransaction,
    updateTransaction: updateTransaction,
    deleteTransactions: deleteTransactions,
    restoreTransactions: restoreTransactions,
    reorderTransactions: reorderTransactions,

    createGoal: createGoal,
    updateGoal: updateGoal,
    deleteGoal: deleteGoal,
    restoreGoal: restoreGoal,

    uploadPhoto: uploadPhoto,
    deletePhoto: deletePhoto,
    photoUrl: photoUrl,
    attachPhotos: attachPhotos,

    createPayment: createPayment,
    updatePayment: updatePayment,
    deletePayment: deletePayment,
    restorePayment: restorePayment,
    payPayment: payPayment,
    undoPayment: undoPayment,

    clearAll: clearAll,
    checkSchema: checkSchema,
    buildExport: buildExport,

    today: today,
    monthKey: monthKey
  };

})();
