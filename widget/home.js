(() => {
  const W = window.TelegramWidget, $ = (id) => document.getElementById(id);
  const options = /*OPTIONS*/;
  let page = 'home', index = 0, processIndex = 0, busy = false;
  const cases = [
    ['Geltek Skin Assistant', 'AI · BEAUTY', 'AI-сервис анализирует кожу по фотографии и помогает подобрать уход.', 'ai'],
    ['MyWatch', 'WEB · E-COMMERCE', 'Онлайн-аукцион для швейцарского аукционного дома: лоты, KYC, аналитика и чаты.', 'website'],
    ['Яндекс Еда', 'WEB · EVENT', 'Интерактивный сервис для вовлечения посетителей ивента.', 'website']
  ];
  const steps = ['Знакомство — цели и ограничения.', 'Аналитика — определяем главное.', 'Проектирование — архитектура и план.', 'Разработка — код, тесты и запуск.', 'Развитие — поддержка и рост.'];
  const button = (label, action, cls = '') => `<button class="${cls}" data-action="${action}">${label}</button>`;
  function render() {
    $('status').textContent = '';
    let html = page === 'home' ? `<div class="hero"><small class="eyebrow">Lean startup подход</small><h2>Ваша идея.<br>Наша команда.</h2><p>Разрабатываем AI-решения<br>и веб-приложения.</p>${button('Обсудить проект →', 'project:unsure', 'primary')}</div><div class="row">${button('Услуги', 'services')}${button('Кейсы', 'cases')}${button('Подход', 'process')}</div><p><small>Создаём то, что нужно бизнесу. Без лишнего.</small></p>` : button('← На главную', 'home', 'back');
    if (page === 'services') html += '<h2>От задачи —<br>к решению.</h2><div class="list">' + Object.entries(options.services).map(([key, label]) => button(label + ' →', 'project:' + key)).join('') + '</div>';
    if (page === 'cases') {
      const c = cases[index];
      html += `<h2>Из проектов<br>команды.</h2><div class="card"><small class="eyebrow">${c[1]}</small><div class="number">0${index + 1}</div><h3>${c[0]}</h3><p>${c[2]}</p></div><div class="row">${button('←', 'prev')}${button((index + 1) + ' / 3', 'cases')}${button('→', 'next')}</div>${button('Обсудить похожую задачу', 'project:' + c[3], 'primary')}`;
    }
    if (page === 'process') html += `<h2>Меньше лишнего.<br>Больше пользы.</h2><div class="card"><small class="eyebrow">ЭТАП ${processIndex + 1} ИЗ 5</small><div class="number">0${processIndex + 1}</div><p>${steps[processIndex]}</p>${button('Следующий этап →', 'step')}</div><small>Начать можно с идеи. Готовое ТЗ не обязательно.</small>${button('Рассказать об идее →', 'project:unsure', 'primary')}`;
    $('view').innerHTML = html;
    document.querySelectorAll('[data-action]').forEach((b) => { b.disabled = busy; b.onclick = () => act(b.dataset.action); });
  }
  function act(action) {
    if (busy) return;
    if (action.startsWith('project:')) {
      if (!W || W.isPreview || W.isForward) { $('status').textContent = 'Откройте личный чат с ботом.'; return; }
      busy = true; render(); $('status').textContent = 'Открываем бриф…';
      try {
        W.request(action).then((a) => { $('status').textContent = JSON.parse(a.result || '{}').message || 'Бриф появился ниже в чате.'; }, fail).finally(() => { busy = false; document.querySelectorAll('button').forEach((b) => { b.disabled = false; }); });
      } catch (e) { busy = false; render(); fail(e); }
      return;
    }
    if (action === 'step') processIndex = (processIndex + 1) % 5;
    else if (action === 'next' || action === 'prev') index = (index + (action === 'next' ? 1 : 2)) % 3;
    else page = action;
    render();
  }
  function fail(e) { $('status').textContent = e.code === 'RATE_LIMITED' ? 'Подождите несколько секунд и повторите.' : 'Не удалось открыть бриф. Повторите или отправьте /project.'; }
  render(); if (W) W.ready();
})();
