export class BodyError extends Error {
  constructor(status) {
    super("invalid-body");
    this.status = status;
  }
}
export async function readJson(req, limit = 64000) {
  if (req.body !== undefined) {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = body.toString("utf8");
    const size = Buffer.byteLength(
      typeof body === "string" ? body : JSON.stringify(body),
    );
    if (size > limit) throw new BodyError(413);
    try {
      return typeof body === "string" ? JSON.parse(body) : body;
    } catch {
      throw new BodyError(400);
    }
  }
  if (Number(req.headers["content-length"]) > limit) throw new BodyError(413);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new BodyError(413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError(400);
  }
}
export function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
