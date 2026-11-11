/* 
 * VODOVSKY GROUP · config.js
 * Версия: 2.0.0 (для локального тестирования)
 * 
 * ВАЖНО ДЛЯ ТЕКУЩЕГО ПРОЕКТА:
 * Этот файл работает БЕЗ Supabase. Данные сохраняются в браузере (localStorage).
 * Твоя текущая авторизация на GitHub Pages + Supabase НЕ затронута.
 * Когда будем готовы подключать базу — добавим url и anonKey сюда.
 */

window.VODOVSKY_CONFIG = {
  app: {
    name: 'VODOVSKY MONEY',
    company: 'VODOVSKY GROUP',
    version: '2.0.0'
  },
  
  // Тема по умолчанию: 'dark' (тёмная) или 'light' (светлая)
  theme: 'dark',
  
  // Валюта (используется для красивого форматирования ₽)
  currency: 'RUB',
  
  // Генерировать ли демо-данные при первом запуске (true/false)
  demo: true,
  
  // Задел на будущее (сейчас не используется, ключи не вставлять!)
  supabase: {
    url: '',
    anonKey: '',
    sync: false
  }
};
