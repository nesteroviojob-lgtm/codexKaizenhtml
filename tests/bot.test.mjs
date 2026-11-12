import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { widgetSource, widgetPayload } from "../lib/widgets.mjs";
import { deflateSync } from "node:zlib";
import { createBotHandler } from "../lib/bot.mjs";
import { createWebhookHandler } from "../lib/webhook.mjs";
import { briefPrompt, parseBriefRequest } from "../lib/brief.mjs";
import { configureBot } from "../lib/setup.mjs";
import { readJson } from "../lib/http.mjs";
import { telegramCall } from "../lib/telegram.mjs";

const env = {
  HTML_BOT_TOKEN: "9000:test-only-token",
  HTML_BOT_USERNAME: "KaizenHtmlTestBot",
  HTML_WEBHOOK_SECRET: "test-only-secret-with-32-characters",
  HTML_PUBLIC_URL: "https://html.example.test",
  HTML_LEADS_CHAT_ID: "-222",
  HTML_PRIVACY_OPERATOR: "KAIZEN demo operator",
  HTML_PRIVACY_CONTACT: "privacy@example.test",
};
const user = { id: 111, first_name: "Иван <test>", username: "ivan_test" };
const selection = { service: "ai", budget: "300-700", timeline: "flexible" };
const privacy = {
  operator: env.HTML_PRIVACY_OPERATOR,
  contact: env.HTML_PRIVACY_CONTACT,
};
const promptMessage = () => ({
  message_id: 10,
  from: { id: 9000, is_bot: true },
  chat: { id: 111, type: "private" },
  date: Math.floor(Date.now() / 1000),
  text: briefPrompt(selection, privacy),
});
const message = (id = 1, text = "/start") => ({
  update_id: id,
  message: {
    message_id: id,
    from: user,
    chat: { type: "private", id: 111 },
    text,
  },
});
const query = (id = 2, data = "project:ai") => ({
  update_id: id,
  widget_query: {
    id: `query-${id}`,
    from: user,
    chat: { type: "private", id: 111 },
    message_id: 5,
    type: { type: "data" },
    data,
  },
});
const lead = (id = 4) => {
  const update = message(
    id,
    "Нужен <script> новый AI-сервис для клиентов & бизнеса.",
  );
  update.message.reply_to_message = promptMessage();
  return update;
};
function recorder() {
  const sent = [];
  return {
    sent,
    call: async (method, payload) => {
      sent.push({ method, payload });
      return { message_id: 20 };
    },
  };
}

test("HTML widgets fit Telegram limits and contain no network code or text controls", () => {
  for (const kind of ["home", "brief"]) {
    const html = widgetSource(kind);
    assert.ok(Buffer.byteLength(html) < 32768);
    assert.ok(deflateSync(html, { level: 9 }).length < 4000);
    assert.doesNotMatch(
      html,
      /<input|<textarea|<select|<script[^>]+src=|@font-face|fetch\(|XMLHttpRequest|telegram-web-app|kaizen-demo/,
    );
    const payload = widgetPayload(kind, 111, env);
    assert.equal(payload.allow_queries, true);
    assert.ok(payload.caption.length < 1024);
    assert.ok(Buffer.byteLength(payload.public_data) <= 1024);
    assert.ok(JSON.parse(payload.public_data).enabled);
  }
});

test("start sends a genuine widget, project opens a separate brief; duplicate updates collapse", async () => {
  const r = recorder(),
    handle = createBotHandler({ env, call: r.call });
  await Promise.all([handle(message()), handle(message())]);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].method, "sendWidget");
  assert.match(r.sent[0].payload.html, /Geltek Skin Assistant/);
  assert.equal(r.sent[0].payload.reply_markup, undefined);
  await handle(message(2, "/project"));
  assert.match(r.sent[1].payload.html, /Согласен, продолжить/);
});

test("widget taps preserve the chosen service and receive the documented answer shape", async () => {
  const r = recorder();
  await createBotHandler({ env, call: r.call })(query());
  assert.equal(r.sent[0].method, "sendWidget");
  assert.equal(JSON.parse(r.sent[0].payload.chat_data).service, "ai");
  assert.equal(r.sent[1].method, "answerWidgetQuery");
  assert.equal(r.sent[1].payload.widget_query_id, "query-2");
  assert.match(JSON.parse(r.sent[1].payload.data).message, /Бриф появился/);
});

test("consented brief creates a ForceReply prompt without sending a lead", async () => {
  const r = recorder();
  await createBotHandler({ env, call: r.call })(
    query(3, "brief:ai:300-700:flexible:yes"),
  );
  assert.equal(r.sent[0].method, "sendMessage");
  assert.equal(r.sent[0].payload.chat_id, 111);
  assert.equal(r.sent[0].payload.reply_markup.force_reply, true);
  assert.equal(r.sent[0].payload.text, briefPrompt(selection, privacy));
  assert.equal(
    r.sent.filter((s) => s.payload.chat_id === env.HTML_LEADS_CHAT_ID).length,
    0,
  );
});

test("invalid choices, missing consent, groups and foreign actors cannot create a brief", async () => {
  assert.equal(parseBriefRequest("brief:ai:300-700:flexible:no"), null);
  assert.equal(parseBriefRequest("brief:__proto__:300-700:flexible:yes"), null);
  assert.equal(parseBriefRequest("brief:ai:300-700:flexible:yes:extra"), null);
  const r = recorder(),
    handle = createBotHandler({ env, call: r.call });
  for (const [i, data] of [
    "brief:ai:unknown:flexible:yes",
    "brief:ai:300-700:flexible:no",
    "project:constructor",
  ].entries())
    await handle(query(10 + i, data));
  const foreign = query(15);
  foreign.widget_query.from = { ...user, id: 999 };
  await handle(foreign);
  const group = message(16);
  group.message.chat.type = "group";
  await handle(group);
  assert.ok(r.sent.every((s) => s.method === "answerWidgetQuery"));
});

test("valid description delivers escaped content before confirming; duplicates send once", async () => {
  const r = recorder(),
    handle = createBotHandler({ env, call: r.call });
  await Promise.all([handle(lead()), handle(lead())]);
  assert.equal(r.sent.length, 2);
  assert.equal(r.sent[0].payload.chat_id, env.HTML_LEADS_CHAT_ID);
  assert.equal(r.sent[0].payload.parse_mode, "HTML");
  assert.match(r.sent[0].payload.text, /&lt;script&gt;/);
  assert.match(r.sent[0].payload.text, /Иван &lt;test&gt;/);
  assert.match(r.sent[0].payload.text, /tg:\/\/user\?id=111/);
  assert.match(r.sent[1].payload.text, /Заявка передана/);
});

test("unconfirmed delivery never produces success and can be retried", async () => {
  const r = recorder();
  let failed = false;
  const handle = createBotHandler({
    env,
    call: async (method, payload) => {
      if (payload.chat_id === env.HTML_LEADS_CHAT_ID && !failed) {
        failed = true;
        throw new Error("offline");
      }
      return r.call(method, payload);
    },
  });
  await assert.rejects(handle(lead()));
  assert.equal(r.sent.length, 0);
  await handle(lead());
  assert.equal(r.sent.length, 2);
});

test("partial retry after the fifth lead does not resend it or lose its confirmation", async () => {
  const r = recorder();
  let fail = true;
  const handle = createBotHandler({
    env,
    call: async (method, payload) => {
      if (
        payload.chat_id === 111 &&
        /HTML-111-9\b/.test(payload.text || "") &&
        fail
      ) {
        fail = false;
        throw new Error("confirmation offline");
      }
      return r.call(method, payload);
    },
  });
  for (let id = 5; id < 9; id++) await handle(lead(id));
  await assert.rejects(handle(lead(9)));
  await handle(lead(9));
  assert.equal(
    r.sent.filter((s) => s.payload.chat_id === env.HTML_LEADS_CHAT_ID).length,
    5,
  );
  assert.equal(
    r.sent.filter((s) => /Заявка передана/.test(s.payload.text)).length,
    5,
  );
  await handle(lead(10));
  assert.match(r.sent.at(-1).payload.text, /Слишком много/);
});

test("a fresh handler recovers a draft from Telegram; forged, expired and edited prompts fail", async () => {
  const r = recorder();
  await createBotHandler({ env, call: r.call })(lead());
  assert.equal(r.sent[0].payload.chat_id, env.HTML_LEADS_CHAT_ID);
  const bad = [lead(20), lead(21), lead(22), lead(23)];
  bad[0].message.reply_to_message.from.id = 999;
  bad[1].message.reply_to_message.date -= 3601;
  bad[2].message.reply_to_message.text += "modified";
  bad[3].message.reply_to_message.chat.id = 999;
  const r2 = recorder(),
    handle = createBotHandler({ env, call: r2.call });
  for (const u of bad) await handle(u);
  assert.ok(r2.sent.every((s) => s.payload.chat_id === 111));
});

test("missing username requires a contact; invalid descriptions return a usable prompt", async () => {
  const r = recorder(),
    handle = createBotHandler({ env, call: r.call });
  const u = lead();
  u.message.from = { id: 111, first_name: "Анна" };
  await handle(u);
  assert.equal(r.sent.at(-1).payload.text, briefPrompt(selection, privacy));
  assert.ok(r.sent.every((s) => s.payload.chat_id === 111));
  const withContact = lead(30);
  withContact.message.from = u.message.from;
  withContact.message.text =
    "Нужна платформа для клиентов. Email anna@example.test";
  await handle(withContact);
  assert.ok(r.sent.some((s) => s.payload.chat_id === env.HTML_LEADS_CHAT_ID));
});

test("old Mini App variables alone cannot enable the new bot or lead collection", async () => {
  const oldEnv = {
    TELEGRAM_BOT_TOKEN: "old",
    TELEGRAM_CHAT_ID: "123",
    PUBLIC_APP_URL: "https://old.example.test",
  };
  assert.equal(
    JSON.parse(widgetPayload("brief", 111, oldEnv).public_data).enabled,
    false,
  );
  const r = recorder();
  await createBotHandler({ env: oldEnv, call: r.call })(
    query(3, "brief:ai:300-700:flexible:yes"),
  );
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].method, "answerWidgetQuery");
  assert.match(JSON.parse(r.sent[0].payload.data).message, /не подключён/);
});

test("an unsupported Bot API method is explained; network failures remain retryable", async () => {
  const r = recorder();
  const handle = createBotHandler({
    env,
    call: async (method, payload) => {
      if (method === "sendWidget")
        throw Object.assign(new Error("not found"), {
          unsupportedWidget: true,
        });
      return r.call(method, payload);
    },
  });
  await handle(query());
  assert.match(r.sent[0].payload.text, /не поддерживает/);
  assert.doesNotMatch(r.sent[1].payload.data, /Бриф появился/);
});

test("setup verifies identity and refuses a foreign webhook before any settings are changed", async () => {
  const calls = [];
  await assert.rejects(
    configureBot({
      env,
      call: async (method) => {
        calls.push(method);
        return { is_bot: true, username: "WrongBot" };
      },
    }),
  );
  assert.deepEqual(calls, ["getMe"]);
  calls.length = 0;
  await assert.rejects(
    configureBot({
      env,
      call: async (method) => {
        calls.push(method);
        return method === "getMe"
          ? { is_bot: true, username: env.HTML_BOT_USERNAME }
          : { url: "https://old.example.test/api/telegram" };
      },
    }),
  );
  assert.deepEqual(calls, ["getMe", "getWebhookInfo"]);
});

test("setup enables widget queries and the command menu without a Web App link", async () => {
  const calls = [];
  await configureBot({
    env,
    call: async (method, payload) => {
      calls.push({ method, payload });
      return method === "getMe"
        ? { is_bot: true, username: env.HTML_BOT_USERNAME }
        : method === "getWebhookInfo"
          ? { url: "" }
          : true;
    },
  });
  const hook = calls.find((c) => c.method === "setWebhook").payload;
  assert.deepEqual(hook.allowed_updates, ["message", "widget_query"]);
  assert.equal(hook.drop_pending_updates, false);
  assert.equal(hook.url, env.HTML_PUBLIC_URL + "/api/telegram");
  assert.deepEqual(
    calls.find((c) => c.method === "setChatMenuButton").payload.menu_button,
    { type: "commands" },
  );
});

test("webhook authenticates Telegram, validates payloads, rejects old environment variables", async (t) => {
  const r = recorder();
  const handler = createWebhookHandler({ env, call: r.call });
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (data, secret = env.HTML_WEBHOOK_SECRET) =>
    fetch(base, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": secret,
      },
      body: JSON.stringify(data),
    });
  assert.equal((await post(message(), "wrong")).status, 403);
  assert.equal((await fetch(base)).status, 405);
  assert.equal(r.sent.length, 0);
  assert.equal((await post(message())).status, 200);
  assert.equal(r.sent[0].method, "sendWidget");
  assert.equal((await post({ update_id: "bad" })).status, 400);
  assert.equal(
    (await post({ ...message(2), filler: "я".repeat(40000) })).status,
    413,
  );
});

test("Vercel pre-parsed bodies have the same byte limits; transport errors do not expose tokens", async () => {
  assert.deepEqual(await readJson({ body: Buffer.from('{"a":1}') }), { a: 1 });
  await assert.rejects(
    readJson({ body: { big: "я".repeat(100) } }, 100),
    (e) => e.status === 413,
  );
  await assert.rejects(
    telegramCall(
      "sensitive-token",
      "sendWidget",
      {},
      {
        fetchImpl: async () => ({
          ok: false,
          json: async () => ({
            ok: false,
            error_code: 404,
            description: "method not found",
          }),
        }),
      },
    ),
    (e) => e.unsupportedWidget && !e.message.includes("sensitive-token"),
  );
});
