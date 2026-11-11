/* ============================================================
   VODOVSKY GROUP · config.js
   Публичные настройки VODOVSKY MONEY.

   ВАЖНО:
   - сюда вставляется только anon public key из Supabase;
   - НИКОГДА не вставляй service_role key;
   - НИКОГДА не вставляй ключи ИИ/API сюда.
   ============================================================ */

window.VODOVSKY_CONFIG = {
  app: {
    name: 'VODOVSKY MONEY',
    company: 'VODOVSKY GROUP',
    version: '3.0.0'
  },

  supabase: {
    // Supabase Dashboard → Project Settings → API → Project URL
    url: 'https://gxeoamheotruzpletctu.supabase.co',

    // Supabase Dashboard → Project Settings → API → anon public key
    anonKey: 'sb_publishable_CL-rbV-FHbyhOyakCVDreA_lYXL6RIA'
  },

  storage: {
    // Приватный бакет для фото целей. Создаётся через supabase.sql.
    goalPhotos: 'goal-photos'
  },

  defaults: {
    theme: 'dark',
    currency: 'RUB'
  },

  auth: {
    // Оставь пустым — адрес возврата определится автоматически.
    redirectTo: ''
  }
};
