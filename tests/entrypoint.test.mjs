import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import handler, { createRequestHandler } from "../server.mjs";

async function serve(t, requestHandler) {
  const server = createServer(requestHandler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}

test("Vercel can import the default Node handler and invoke health without starting a second server", async (t) => {
  assert.equal(typeof handler, "function");
  const base = await serve(t, handler);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.product, "kaizen-html-bot");
});

test("the root server entrypoint handles authenticated Telegram updates as well as API files", async (t) => {
  const sent = [];
  const secret = "test-only-webhook-secret-32-characters";
  const base = await serve(
    t,
    createRequestHandler({
      env: {
        HTML_BOT_TOKEN: "9000:test-only-token",
        HTML_WEBHOOK_SECRET: secret,
      },
      call: async (method, payload) => {
        sent.push({ method, payload });
        return true;
      },
    }),
  );
  const response = await fetch(`${base}/api/telegram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 1,
        text: "/start",
        from: { id: 111 },
        chat: { type: "private", id: 111 },
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "sendWidget");
  assert.match(sent[0].payload.html, /Geltek Skin Assistant/);
});
