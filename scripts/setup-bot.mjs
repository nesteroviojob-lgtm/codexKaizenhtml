import { configureBot } from "../lib/setup.mjs";
import { formatSetupError } from "../lib/setup-errors.mjs";
try {
  await configureBot();
  console.log("New HTML bot webhook configured.");
} catch (error) {
  console.error(
    "Настройка HTML-бота не завершена.\n" + formatSetupError(error),
  );
  process.exitCode = 1;
}
