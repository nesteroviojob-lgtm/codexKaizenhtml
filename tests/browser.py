import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
base = os.environ.get('BASE_URL', 'http://127.0.0.1:3101')
out = root / 'artifacts'
out.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    errors, external = [], []
    page = browser.new_page(viewport={'width': 1440, 'height': 1060})
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: external.append(r.url) if not r.url.startswith(base) and r.url.startswith('http') else None)

    def fits(label):
        size = page.evaluate('({width:document.documentElement.scrollWidth, height:Math.ceil(document.body.getBoundingClientRect().height), viewport:innerWidth})')
        assert size['width'] <= size['viewport'] + 1, (label, size)
        assert size['height'] <= 600, (label, size)

    # The exact HTML rendered by the widget, with only the documented browser stand-in.
    for width in [200, 260, 320, 390, 430, 600]:
        for dark in [False, True]:
            page.set_viewport_size({'width': width, 'height': 800})
            page.goto(base + '/home.html')
            page.evaluate('(dark) => postMessage({type:"kaizen-theme",dark},location.origin)', dark)
            fits(('home', width, dark))
            page.get_by_role('button', name='Услуги', exact=True).click()
            fits(('services', width, dark))
            page.get_by_role('button', name='← На главную', exact=True).click()
            page.get_by_role('button', name='Кейсы', exact=True).click()
            for _ in range(3):
                fits(('case', width, dark))
                page.get_by_role('button', name='→', exact=True).click()
            page.get_by_role('button', name='← На главную', exact=True).click()
            page.get_by_role('button', name='Подход', exact=True).click()
            fits(('process', width, dark))
            page.goto(base + '/brief.html?service=ai')
            page.evaluate('(dark) => postMessage({type:"kaizen-theme",dark},location.origin)', dark)
            for step in range(5):
                fits(('brief', step, width, dark))
                if step < 4:
                    page.get_by_role('button', name='Далее →', exact=True).click()
            for _ in range(2): page.get_by_role('button', name='← Назад', exact=True).click()
            page.get_by_role('button', name='Как можно скорее', exact=True).click()
            page.get_by_role('button', name='Далее →', exact=True).click()
            expect(page.locator('.card')).to_contain_text('Как можно скорее')
    print('PASS: both widgets and all pages fit 200–600 px bubbles, light and dark.')

    # User-selected values, the exact request contract, errors and retry.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto(base + '/brief.html?service=ai')
    page.get_by_role('button', name='Запуск MVP', exact=True).click()
    page.get_by_role('button', name='Далее →', exact=True).click()
    page.get_by_role('button', name='300 000–700 000 ₽', exact=True).click()
    page.get_by_role('button', name='Далее →', exact=True).click()
    page.get_by_role('button', name='Как можно скорее', exact=True).click()
    page.get_by_role('button', name='Далее →', exact=True).click()
    page.get_by_role('button', name='Далее →', exact=True).click()
    page.evaluate('window.demoFailure = "TIMEOUT"')
    page.get_by_role('button', name='Согласен, продолжить →', exact=True).click()
    expect(page.locator('#status')).to_contain_text('Не удалось продолжить')
    expect(page.get_by_role('button', name='Согласен, продолжить →', exact=True)).to_be_enabled()
    page.evaluate('() => {window.demoFailure = null; window.requests = []; TelegramWidget.request = d => {requests.push(d); return Promise.resolve({result:JSON.stringify({message:"Ответьте ниже"})})}}')
    page.get_by_role('button', name='Согласен, продолжить →', exact=True).click()
    expect(page.locator('#status')).to_contain_text('Ответьте ниже')
    assert page.evaluate('requests') == ['brief:product:300-700:asap:yes']
    print('PASS: draft selection, exact request, timeout and retry.')

    # Complete browser preview; this must never send any form or Bot API request.
    page.set_viewport_size({'width': 1440, 'height': 1060})
    page.goto(base)
    page.screenshot(path=str(out / 'preview-desktop.png'), full_page=True)
    home = page.frame_locator('iframe').first
    home.get_by_role('button', name='Обсудить проект →', exact=True).click()
    expect(page.locator('iframe')).to_have_count(2)
    brief = page.frame_locator('iframe').nth(1)
    for _ in range(4): brief.get_by_role('button', name='Далее →', exact=True).click()
    brief.get_by_role('button', name='Согласен, продолжить →', exact=True).click()
    expect(page.locator('#composer')).to_be_visible()
    page.locator('#description').fill('Хотим создать сервис для клиентов и автоматизировать работу.')
    page.get_by_role('button', name='Проверить описание').click()
    expect(page.locator('.text-message').last).to_contain_text('никуда не отправлена')
    expect(page.locator('#composer')).to_be_hidden()
    page.get_by_role('button', name='Сменить тему').click()
    expect(page.locator('body')).to_have_class('dark')
    page.screenshot(path=str(out / 'preview-flow-dark.png'), full_page=True)
    page.goto(base)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(out / 'preview-mobile.png'), full_page=True)
    assert not errors, errors
    assert not external, external
    print('PASS: complete unsent demo, theme switching, no external requests or JavaScript errors.')
    browser.close()
