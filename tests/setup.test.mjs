import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { configureBot } from "../lib/setup.mjs";
import { formatSetupError, SetupError } from "../lib/setup-errors.mjs";
import { telegramCall } from "../lib/telegram.mjs";

const env = {
  HTML_BOT_TOKEN: "9876:test-only-token",
  HTML_BOT_USERNAME: "kaizen_html_bot",
  HTML_PUBLIC_URL: "https://html.example.test",
  HTML_WEBHOOK_SECRET: "test-only-webhook-secret-with-32-characters",
};

test("all missing production settings are reported together before an API request", async () => {
  let calls = 0;
  await assert.rejects(
    configureBot({
      env: {},
      call: async () => {
        calls++;
      },
    }),
    (error) => {
      const report = formatSetupError(error);
      for (const name of [
        "HTML_BOT_TOKEN",
        "HTML_BOT_USERNAME",
        "HTML_PUBLIC_URL",
        "HTML_WEBHOOK_SECRET",
      ])
        assert.match(report, new RegExp(`\\[${name}_MISSING\\]`));
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("invalid settings identify the fields without displaying entered values", async () => {
  const secrets = [
    "token-value-do-not-print",
    "https://t.me/do-not-print-bot",
    "private-user",
    "private-password",
    "short-secret",
  ];
  await assert.rejects(
    configureBot({
      env: {
        HTML_BOT_TOKEN: secrets[0],
        HTML_BOT_USERNAME: secrets[1],
        HTML_PUBLIC_URL: `https://${secrets[2]}:${secrets[3]}@html.example.test/api/telegram`,
        HTML_WEBHOOK_SECRET: secrets[4],
      },
      call: async () => {
        assert.fail("must not contact Telegram");
      },
    }),
    (error) => {
      const report = formatSetupError(error);
      for (const name of [
        "HTML_BOT_TOKEN",
        "HTML_BOT_USERNAME",
        "HTML_PUBLIC_URL",
        "HTML_WEBHOOK_SECRET",
      ])
        assert.match(report, new RegExp(`\\[${name}_INVALID\\]`));
      for (const secret of secrets) assert.ok(!report.includes(secret));
      return true;
    },
  );
});

test("username with @ or pasted surrounding whitespace still verifies the same bot", async () => {
  const methods = [];
  await configureBot({
    env: {
      ...env,
      HTML_BOT_USERNAME: " @Kaizen_Html_Bot \n",
      HTML_BOT_TOKEN: ` ${env.HTML_BOT_TOKEN}\n`,
    },
    call: async (method) => {
      methods.push(method);
      return method === "getMe"
        ? { is_bot: true, username: "kaizen_html_bot" }
        : method === "getWebhookInfo"
          ? { url: "" }
          : true;
    },
  });
  assert.equal(methods.at(-1), "setWebhook");
});

test("an API authentication failure reports the stage without leaking URLs or the token", async () => {
  const errorText = `https://api.telegram.org/bot${env.HTML_BOT_TOKEN}/getMe`;
  await assert.rejects(
    configureBot({
      env,
      call: async () => {
        throw Object.assign(new Error(errorText), { code: 401 });
      },
    }),
    (error) => {
      const report = formatSetupError(error);
      assert.match(report, /\[TELEGRAM_UNAUTHORIZED\]/);
      assert.match(report, /getMe/);
      assert.ok(!report.includes(env.HTML_BOT_TOKEN));
      assert.ok(!report.includes(errorText));
      return true;
    },
  );
  assert.ok(!formatSetupError(new Error(errorText)).includes(errorText));
  assert.ok(
    !formatSetupError(new SetupError("TELEGRAM_API_ERROR", errorText)).includes(
      errorText,
    ),
  );
});

test("webhook rejections retain a fixed reason, never Telegram's raw response", async () => {
  const description = `Bad Request: bad webhook: https://secret-user:secret-password@example.test/`;
  await assert.rejects(
    configureBot({
      env,
      call: async (method, payload) => {
        if (method === "getMe")
          return { is_bot: true, username: "kaizen_html_bot" };
        if (method === "getWebhookInfo") return { url: "" };
        if (method !== "setWebhook") return true;
        return telegramCall(env.HTML_BOT_TOKEN, method, payload, {
          fetchImpl: async () => ({
            ok: false,
            json: async () => ({ ok: false, error_code: 400, description }),
          }),
        });
      },
    }),
    (error) => {
      const report = formatSetupError(error);
      assert.match(report, /\[TELEGRAM_BAD_WEBHOOK\]/);
      assert.match(report, /setWebhook/);
      assert.ok(!report.includes("secret-password"));
      return true;
    },
  );
});

test("a real production build still fails visibly on setup errors, with actionable safe logs", () => {
  const childEnv = {
    ...process.env,
    CONFIGURE_HTML_BOT: "1",
    VERCEL_ENV: "production",
  };
  for (const name of Object.keys(childEnv))
    if (name.startsWith("HTML_")) delete childEnv[name];
  childEnv.HTML_BOT_TOKEN = "9876:private-token-never-log";
  childEnv.HTML_BOT_USERNAME = "https://t.me/private-entered-value";
  childEnv.HTML_WEBHOOK_SECRET = "private-short-secret";
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("../", import.meta.url),
    env: childEnv,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Standalone HTML bot built/);
  assert.match(result.stderr, /\[HTML_BOT_USERNAME_INVALID\]/);
  assert.match(result.stderr, /\[HTML_PUBLIC_URL_MISSING\]/);
  assert.match(result.stderr, /\[HTML_WEBHOOK_SECRET_INVALID\]/);
  for (const secret of [
    childEnv.HTML_BOT_TOKEN,
    childEnv.HTML_BOT_USERNAME,
    childEnv.HTML_WEBHOOK_SECRET,
  ])
    assert.ok(!(result.stdout + result.stderr).includes(secret));
});
