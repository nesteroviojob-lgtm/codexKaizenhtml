export async function telegramCall(
  token,
  method,
  payload,
  { fetchImpl = fetch, timeout = 10000 } = {},
) {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.ok) {
    // URLs/fetch errors may contain the token: never expose those to logs.
    const error = new Error("telegram-request-failed");
    error.code = data.error_code;
    error.unsupportedWidget =
      data.error_code === 404 ||
      /METHOD_INVALID|method not found/i.test(data.description || "");
    throw error;
  }
  return data.result;
}
