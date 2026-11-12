const chat = document.getElementById("chat");
let dark = false;
const services = {
  ai: "AI-агенты и корпоративный GPT",
  website: "Веб-приложение",
  product: "Запуск MVP",
  support: "Поддержка и развитие",
  unsure: "Помощь с выбором",
};
function scrollChat() {
  chat.scrollTop = chat.scrollHeight;
}
function bubbleText(text, sent = false) {
  const div = document.createElement("div");
  div.className = sent ? "sent" : "bubble text-message";
  div.textContent = text;
  chat.append(div);
  scrollChat();
}
function applyTheme(frame) {
  frame.contentWindow.postMessage(
    { type: "kaizen-theme", dark },
    location.origin,
  );
}
function watchFrame(frame) {
  frame.addEventListener("load", () => applyTheme(frame));
}
document.querySelectorAll("iframe").forEach(watchFrame);
addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  const frame = [...document.querySelectorAll("iframe")].find(
    (f) => f.contentWindow === event.source,
  );
  if (!frame) return;
  if (event.data?.type === "kaizen-height") {
    const height = Number(event.data.height);
    if (Number.isFinite(height))
      frame.style.height = Math.max(50, Math.min(height, 600)) + "px";
    return;
  }
  if (
    event.data?.type !== "kaizen-demo" ||
    typeof event.data.action !== "string"
  )
    return;
  const parts = event.data.action.split(":");
  if (parts[0] === "project" && Object.hasOwn(services, parts[1])) {
    const div = document.createElement("div");
    div.className = "bubble";
    const next = document.createElement("iframe");
    next.title = "Короткий бриф KAIZEN";
    next.src = "/brief.html?service=" + encodeURIComponent(parts[1]);
    watchFrame(next);
    div.append(next);
    const caption = document.createElement("p");
    caption.className = "caption";
    caption.textContent =
      "Короткий бриф · выберите направление, бюджет и сроки.";
    div.append(caption);
    chat.append(div);
    next.addEventListener("load", scrollChat);
  }
  if (
    parts[0] === "brief" &&
    parts[4] === "yes" &&
    Object.hasOwn(services, parts[1])
  ) {
    bubbleText(
      "Демонстрация · " +
        services[parts[1]] +
        "\n\nОпишите задачу ответом в чат. В настоящем боте это обычное сообщение с клавиатурой Telegram.",
    );
    document.getElementById("composer").hidden = false;
  }
});
document.getElementById("theme").onclick = () => {
  dark = !dark;
  document.body.classList.toggle("dark", dark);
  document.querySelectorAll("iframe").forEach(applyTheme);
};
document.getElementById("restart").onclick = () => {
  location.reload();
};
document.getElementById("composer").onsubmit = (event) => {
  event.preventDefault();
  const field = document.getElementById("description");
  if (field.value.trim().length < 10) return;
  bubbleText(field.value.trim(), true);
  bubbleText("Бриф собран. Это демонстрация — заявка никуда не отправлена.");
  field.value = "";
  document.getElementById("composer").hidden = true;
};
