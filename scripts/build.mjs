import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { widgetSource } from "../lib/widgets.mjs";
import { configureBot } from "../lib/setup.mjs";

const root = new URL("../", import.meta.url);
const mock = await readFile(
  new URL("../preview/bridge.js", import.meta.url),
  "utf8",
);
const palette =
  "<style>:root{--tg-theme-bg-color:#fff;--tg-theme-text-color:#191919;--tg-theme-hint-color:#777e89;--tg-theme-link-color:#0040dc;--tg-theme-secondary-bg-color:#f1f3f7;--tg-theme-destructive-text-color:#c53030;--tg-text-font-size:15px}html,body{height:auto}</style>";
await rm(new URL("dist/", root), { recursive: true, force: true });
await mkdir(new URL("dist/", root), { recursive: true });
await mkdir(new URL("artifacts/", root), { recursive: true });
await cp(new URL("preview/", root), new URL("dist/", root), {
  recursive: true,
});
await cp(new URL("reference/logo.svg", root), new URL("dist/logo.svg", root));
for (const kind of ["home", "brief"]) {
  const html = widgetSource(kind);
  await writeFile(new URL(`artifacts/${kind}.html`, root), html);
  await writeFile(
    new URL(`dist/${kind}.html`, root),
    `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KAIZEN — ${kind}</title>${palette}<script>${mock}</script>${html}</html>`,
  );
  console.log(
    `${kind}: ${Buffer.byteLength(html)} UTF-8 bytes; ${deflateSync(html, { level: 9 }).length}/4096 zlib bytes.`,
  );
}
console.log(
  "Standalone HTML bot built. The browser preview never sends leads.",
);
if (
  process.env.CONFIGURE_HTML_BOT === "1" &&
  process.env.VERCEL_ENV === "production"
) {
  try {
    await configureBot();
    console.log("New HTML bot configured.");
  } catch {
    console.error(
      "HTML bot setup failed. Check the NEW bot's HTML_* settings and webhook. No credentials logged.",
    );
    process.exitCode = 1;
  }
}
