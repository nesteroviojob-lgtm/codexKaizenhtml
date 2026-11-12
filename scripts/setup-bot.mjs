import { configureBot } from "../lib/setup.mjs";
try {
  await configureBot();
  console.log("New HTML bot webhook configured.");
} catch {
  console.error(
    "Настройка HTML-бота не завершена. Проверьте новые переменные HTML_*, имя бота, HTTPS-адрес и существующий webhook. Секреты не выводятся.",
  );
  process.exitCode = 1;
}
