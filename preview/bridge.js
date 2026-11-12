(() => {
  // Browser-only simulator. This script is never included in the sent widget.
  const listeners = {};
  const store = {};
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => {
        store[k] = v;
      },
    },
  });
  const params = new URLSearchParams(location.search);
  window.TelegramWidget = {
    profile: 1,
    colorScheme: "light",
    isPreview: false,
    isForward: false,
    chatType: "private",
    viewer: { id: 1, first_name: "Клиент" },
    publicData: JSON.stringify({
      enabled: true,
      privacy: {
        operator: "Демо KAIZEN",
        contact: "Демонстрация без отправки",
      },
    }),
    chatData: JSON.stringify({ service: params.get("service") || "unsure" }),
    ready() {},
    onEvent: (name, fn) => {
      (listeners[name] ||= []).push(fn);
    },
    request(data) {
      if (window.demoFailure)
        return Promise.reject({ code: window.demoFailure });
      parent.postMessage(
        { type: "kaizen-demo", action: data },
        location.origin,
      );
      return Promise.resolve({
        result: JSON.stringify({
          message: data.startsWith("project:")
            ? "Бриф появился ниже в чате."
            : "Ответьте на сообщение ниже: опишите вашу задачу.",
        }),
      });
    },
  };
  addEventListener("message", (event) => {
    if (
      event.source !== parent ||
      event.origin !== location.origin ||
      event.data?.type !== "kaizen-theme"
    )
      return;
    const dark = event.data.dark;
    const palette = dark
      ? ["#232936", "#e9ecf2", "#9aa5b5", "#729cff", "#303949", "#ff8888"]
      : ["#fff", "#191919", "#777e89", "#0040dc", "#f1f3f7", "#c53030"];
    [
      "bg-color",
      "text-color",
      "hint-color",
      "link-color",
      "secondary-bg-color",
      "destructive-text-color",
    ].forEach((key, i) =>
      document.documentElement.style.setProperty(
        "--tg-theme-" + key,
        palette[i],
      ),
    );
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    TelegramWidget.colorScheme = dark ? "dark" : "light";
    (listeners.themeChanged || []).forEach((fn) => fn());
  });
  addEventListener("DOMContentLoaded", () => {
    const resize = () =>
      parent.postMessage(
        {
          type: "kaizen-height",
          height: Math.ceil(document.body.getBoundingClientRect().height),
        },
        location.origin,
      );
    new ResizeObserver(resize).observe(document.body);
    resize();
  });
})();
