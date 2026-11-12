const diagnostics = {
  HTML_BOT_TOKEN_MISSING:
    "Добавьте HTML_BOT_TOKEN в Environment Variables для Production: токен нового бота от BotFather.",
  HTML_BOT_TOKEN_INVALID:
    "Проверьте HTML_BOT_TOKEN: нужен токен от BotFather, а не имя или ссылка на бота. Удалите внутренние пробелы.",
  HTML_BOT_USERNAME_MISSING:
    "Добавьте HTML_BOT_USERNAME в Environment Variables для Production. Для этого проекта: kaizen_html_bot.",
  HTML_BOT_USERNAME_INVALID:
    "В HTML_BOT_USERNAME нужно имя бота, например kaizen_html_bot, а не ссылка t.me или отображаемое название.",
  HTML_PUBLIC_URL_MISSING:
    "Добавьте HTML_PUBLIC_URL в Environment Variables для Production: https://codex-kaizen-html.vercel.app",
  HTML_PUBLIC_URL_INVALID:
    "HTML_PUBLIC_URL должен быть корневым HTTPS-адресом сайта, без /api/telegram, параметров, логина и пароля.",
  HTML_WEBHOOK_SECRET_MISSING:
    "Добавьте HTML_WEBHOOK_SECRET в Environment Variables для Production: отдельный случайный секрет из 32–256 латинских букв, цифр, _ или -.",
  HTML_WEBHOOK_SECRET_INVALID:
    "HTML_WEBHOOK_SECRET: допустимы только 32–256 символов A-Z, a-z, 0-9, _ и -. Пробелы и другие знаки не подходят.",
  BOT_IDENTITY_MISMATCH:
    "Токен принадлежит другому боту, чем HTML_BOT_USERNAME. Проверьте имя и токен нового бота. Настройки бота не изменены.",
  EXISTING_WEBHOOK:
    "У этого бота уже есть webhook по другому адресу. Настройки не изменены. Проверьте, что выбран новый HTML-бот, а не бот Mini App.",
  TELEGRAM_UNAUTHORIZED:
    "Telegram отклонил токен (401). Проверьте токен нового бота в HTML_BOT_TOKEN.",
  TELEGRAM_FORBIDDEN:
    "Telegram отказал в доступе (403). Проверьте, что новый бот доступен и его токен действителен.",
  TELEGRAM_NETWORK_ERROR:
    "Не удалось связаться с api.telegram.org. Повторите деплой; если ошибка повторится, проверьте доступ Vercel к Telegram.",
  TELEGRAM_BAD_WEBHOOK:
    "Telegram не принял webhook. Проверьте HTML_PUBLIC_URL: публичный HTTPS-адрес нового проекта Vercel.",
  TELEGRAM_UPDATES_UNSUPPORTED:
    "Сервер Bot API не принимает widget_query в allowed_updates. Нужен Bot API с поддержкой HTML-виджетов.",
  TELEGRAM_API_ERROR:
    "Telegram отклонил запрос настройки. Этап указан ниже; значения секретов не выводятся.",
  UNKNOWN_SETUP_ERROR:
    "Не удалось завершить настройку Telegram. Проверьте переменные HTML_* для Production. Значения секретов не выводятся.",
};
const operations = new Set([
  "getMe",
  "getWebhookInfo",
  "setMyCommands",
  "setChatMenuButton",
  "setWebhook",
]);

export class SetupError extends Error {
  constructor(codes, operation) {
    const known = (Array.isArray(codes) ? codes : [codes]).filter((code) =>
      Object.hasOwn(diagnostics, code),
    );
    super(known.join(",") || "UNKNOWN_SETUP_ERROR");
    this.name = "SetupError";
    this.codes = known;
    this.operation = operations.has(operation) ? operation : null;
  }
}

// Only fixed messages and allowlisted operation names may reach build logs.
// Never print an Error's message, stack, cause, URL or Telegram description.
export function formatSetupError(error) {
  const codes =
    error instanceof SetupError
      ? error.codes.filter((code) => Object.hasOwn(diagnostics, code))
      : [];
  const report = (codes.length ? codes : ["UNKNOWN_SETUP_ERROR"])
    .map((code) => `[${code}] ${diagnostics[code]}`)
    .join("\n");
  return error instanceof SetupError && operations.has(error.operation)
    ? `${report}\nЭтап Telegram API: ${error.operation}.`
    : report;
}

export function requestSetupError(error, operation) {
  const code =
    error?.code === 401
      ? "TELEGRAM_UNAUTHORIZED"
      : error?.code === 403
        ? "TELEGRAM_FORBIDDEN"
        : error?.reason === "bad-webhook"
          ? "TELEGRAM_BAD_WEBHOOK"
          : error?.reason === "unsupported-updates"
            ? "TELEGRAM_UPDATES_UNSUPPORTED"
            : Number.isInteger(error?.code)
              ? "TELEGRAM_API_ERROR"
              : "TELEGRAM_NETWORK_ERROR";
  return new SetupError(code, operation);
}
