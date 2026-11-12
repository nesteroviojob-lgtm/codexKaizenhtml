import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  services,
  budgets,
  timelines,
  privacyConfig,
  leadsReady,
} from "./brief.mjs";

export function widgetSource(kind) {
  if (kind !== "home" && kind !== "brief") throw new Error("unknown-widget");
  const read = (file) =>
    readFileSync(new URL(`../widget/${file}`, import.meta.url), "utf8");
  const css = read("style.css");
  const script = read(`${kind}.js`).replace("/*OPTIONS*/", () =>
    JSON.stringify({ services, budgets, timelines }),
  );
  const markup = read(`${kind}.html`).replace("<!--MARK-->", () =>
    read("mark.svg"),
  );
  const html = `${markup}<style>${css}</style><script>${script}</script>`;
  if (
    Buffer.byteLength(html) > 32768 ||
    deflateSync(html, { level: 9 }).length > 4000 ||
    html.includes("\0")
  )
    throw new Error(`widget-size-limit:${kind}`);
  return html;
}

export function widgetPayload(kind, chatId, env, service = "unsure") {
  return {
    chat_id: chatId,
    html: widgetSource(kind),
    allow_queries: true,
    public_data: JSON.stringify({
      privacy: privacyConfig(env),
      enabled: leadsReady(env),
    }),
    chat_data: JSON.stringify({
      service: Object.hasOwn(services, service) ? service : "unsure",
    }),
    caption:
      kind === "home"
        ? "KAIZEN — AI-решения, веб-приложения и MVP. Услуги, кейсы и заявка — в сообщении. Если виджет не отображается, обновите Telegram. Команда /project открывает бриф."
        : "KAIZEN — короткий бриф: направление, бюджет и сроки. Описание задачи — ответом в чат после согласия. Для нового брифа отправьте /project, для отмены — /cancel.",
  };
}
