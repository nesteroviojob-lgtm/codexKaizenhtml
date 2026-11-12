(() => {
  const W = window.TelegramWidget, $ = (id) => document.getElementById(id);
  const options = /*OPTIONS*/;
  let config = {}, initial = {};
  try { config = JSON.parse(W && W.publicData || '{}'); initial = JSON.parse(W && W.chatData || '{}'); } catch (e) {}
  const keys = ['service', 'budget', 'timeline'], maps = [options.services, options.budgets, options.timelines];
  const titles = ['Что хотите создать?', 'Какой бюджет?', 'Когда хотите запустить?', 'Проверим выбор.'];
  let step = 0, busy = false, draft = { service: initial.service || 'unsure', budget: 'discuss', timeline: 'flexible' };
  try { const saved = JSON.parse(localStorage.getItem('brief') || 'null'); if (saved && keys.every((k, i) => Object.hasOwn(maps[i], saved[k]))) draft = saved; } catch (e) {}
  const btn = (text, action, cls = '') => `<button class="${cls}" data-action="${action}">${text}</button>`;
  function render() {
    let html = `<small>ШАГ ${step + 1} ИЗ 5</small><div class="progress">${[0,1,2,3,4].map((n) => '<span class="' + (n <= step ? 'done' : '') + '"></span>').join('')}</div><h2>${titles[step] || 'Ваши данные.'}</h2>`;
    if (step < 3) html += '<div class="list">' + Object.entries(maps[step]).map(([k,v]) => btn(v, 'pick:' + k, draft[keys[step]] === k ? 'selected' : '')).join('') + '</div>' + (step === 1 ? '<small>Это ваше пожелание, а не стоимость разработки.</small>' : '') + btn('Далее →', 'next', 'primary');
    else if (step === 3) html += `<div class="card"><p>${options.services[draft.service]}</p><small>${options.budgets[draft.budget]} · ${options.timelines[draft.timeline]}</small></div><p class="muted">После подтверждения опишите идею обычным сообщением в чат.</p>` + btn('Далее →', 'next', 'primary');
    else html += '<p class="privacy">Нажимая «Согласен, продолжить», вы соглашаетесь передать команде имя, Telegram-контакт и описание задачи для обсуждения проекта.</p><p id="operator" class="privacy muted"></p>' + btn('Согласен, продолжить →', 'submit', 'primary');
    if (step) html += '<p>' + btn('← Назад', 'back', 'back') + '</p>';
    $('view').innerHTML = html;
    if ($('operator')) $('operator').textContent = config.privacy ? 'Оператор: ' + config.privacy.operator + '. По данным: ' + config.privacy.contact : 'Приём заявок пока не подключён.';
    document.querySelectorAll('[data-action]').forEach((b) => { b.disabled = busy || (b.dataset.action === 'submit' && !config.enabled); b.onclick = () => act(b.dataset.action); });
  }
  function act(action) {
    if (busy) return;
    $('status').textContent = '';
    if (action === 'submit') {
      if (!config.enabled || !W || W.isPreview || W.isForward) { $('status').textContent = 'Откройте личный чат с ботом.'; return; }
      busy = true; render(); $('status').textContent = 'Готовим сообщение…';
      try {
        W.request('brief:' + keys.map((k) => draft[k]).join(':') + ':yes').then((a) => {
          const result = JSON.parse(a.result || '{}');
          $('status').textContent = result.message || 'Ответьте на сообщение ниже в чате.';
        }, fail).finally(() => { busy = false; document.querySelectorAll('button').forEach((b) => { b.disabled = false; }); });
      } catch (e) { busy = false; render(); fail(e); }
      return;
    }
    if (action.startsWith('pick:')) draft[keys[step]] = action.slice(5);
    if (action === 'next') step = Math.min(4, step + 1);
    if (action === 'back') step = Math.max(0, step - 1);
    try { localStorage.setItem('brief', JSON.stringify(draft)); } catch (e) {}
    render();
  }
  function fail(e) { $('status').textContent = e.code === 'RATE_LIMITED' ? 'Подождите несколько секунд и повторите.' : 'Не удалось продолжить. Повторите или отправьте /project.'; }
  render(); if (W) W.ready();
})();
