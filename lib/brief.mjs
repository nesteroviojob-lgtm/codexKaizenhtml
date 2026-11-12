export const services = {
  ai: "AI-агенты и корпоративный GPT",
  website: "Веб-приложение",
  product: "Запуск MVP",
  support: "Поддержка и развитие",
  unsure: "Помощь с выбором",
};
export const budgets = {
  discuss: "Обсудим вместе",
  under300: "До 300 000 ₽",
  "300-700": "300 000–700 000 ₽",
  "700plus": "От 700 000 ₽",
};
export const timelines = {
  flexible: "Сроки гибкие",
  asap: "Как можно скорее",
  "1-3months": "Через 1–3 месяца",
};

export function privacyConfig(env) {
  const operator = env.HTML_PRIVACY_OPERATOR?.trim() || "";
  const contact = env.HTML_PRIVACY_CONTACT?.trim() || "";
  const valid =
    operator.length > 1 &&
    operator.length <= 100 &&
    contact.length >= 5 &&
    contact.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(operator + contact);
  return valid ? { operator, contact } : null;
}

export function leadsReady(env) {
  return Boolean(
    env.HTML_BOT_TOKEN &&
      /^-?[1-9]\d{0,15}$/.test(env.HTML_LEADS_CHAT_ID || "") &&
      privacyConfig(env),
  );
}

export function parseBriefRequest(data) {
  if (typeof data !== "string" || Buffer.byteLength(data) > 64) return null;
  const [action, service, budget, timeline, consent, extra] = data.split(":");
  if (
    action !== "brief" ||
    consent !== "yes" ||
    extra !== undefined ||
    !Object.hasOwn(services, service) ||
    !Object.hasOwn(budgets, budget) ||
    !Object.hasOwn(timelines, timeline)
  )
    return null;
  return { service, budget, timeline };
}

export function briefPrompt(selection, privacy) {
  return `KAIZEN · Заявка на разработку\nНаправление: ${services[selection.service]}\nБюджет: ${budgets[selection.budget]}\nСроки: ${timelines[selection.timeline]}\n\nОпишите задачу ответом на это сообщение (10–1600 символов). Если у вас нет @username, добавьте телефон или email для связи.\n\nОтправляя ответ, вы соглашаетесь передать команде описание задачи, имя и Telegram-контакт для обсуждения проекта. Оператор: ${privacy.operator}. Контакт по данным: ${privacy.contact}.\n\nДля отмены — /cancel.`;
}

// Telegram supplies the original bot-authored reply. Its readable choices carry
// the draft across serverless restarts without a database or client-supplied IDs.
export function readPrompt(message, env, now = Date.now()) {
  const prompt = message?.reply_to_message;
  const botId = Number(env.HTML_BOT_TOKEN?.split(":")[0]);
  if (
    !Number.isSafeInteger(botId) ||
    !prompt?.from?.is_bot ||
    prompt.from.id !== botId ||
    prompt.chat?.id !== message.chat?.id ||
    prompt.forward_origin ||
    !Number.isSafeInteger(prompt.date) ||
    Math.abs(now / 1000 - prompt.date) > 3600 ||
    typeof prompt.text !== "string"
  )
    return null;
  const privacy = privacyConfig(env);
  if (!privacy) return null;
  const lines = prompt.text.split("\n");
  const reverse = (values, text) =>
    Object.keys(values).find((key) => values[key] === text);
  const selection = {
    service: reverse(services, lines[1]?.replace(/^Направление: /, "")),
    budget: reverse(budgets, lines[2]?.replace(/^Бюджет: /, "")),
    timeline: reverse(timelines, lines[3]?.replace(/^Сроки: /, "")),
  };
  if (
    !selection.service ||
    !selection.budget ||
    !selection.timeline ||
    briefPrompt(selection, privacy) !== prompt.text
  )
    return null;
  return selection;
}

export function validDescription(text) {
  return (
    typeof text === "string" &&
    text.trim().length >= 10 &&
    text.trim().length <= 1600 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  );
}

export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function leadMessage(selection, message) {
  const user = message.from;
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Клиент";
  const username = /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(user.username || "")
    ? `@${user.username}`
    : "без username — контакт в описании";
  const reference = `HTML-${message.chat.id}-${message.message_id}`;
  return {
    reference,
    text: `<b>Новая заявка KAIZEN</b>\nНомер: ${reference}\n\nНаправление: ${escapeHtml(services[selection.service])}\nБюджет: ${escapeHtml(budgets[selection.budget])}\nСроки: ${escapeHtml(timelines[selection.timeline])}\n\n${escapeHtml(message.text.trim())}\n\nКлиент: <a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>\nКонтакт: ${escapeHtml(username)}\nTelegram ID: ${user.id}\nСогласие: кнопка в брифе и ответ на сообщение от ${new Date(message.reply_to_message.date * 1000).toISOString()}.`,
  };
}
