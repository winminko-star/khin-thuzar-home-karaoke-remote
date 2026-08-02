import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "kth_remote_session";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [
          decodeURIComponent(index >= 0 ? part.slice(0, index) : part),
          decodeURIComponent(index >= 0 ? part.slice(index + 1) : "")
        ];
      })
  );
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) {
    return false;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    return (
      decoded?.scope === "remote-control" &&
      Number(decoded?.exp) > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export default async function handler(request) {
  if (request.method !== "GET") {
    return json({ message: "Method not allowed" }, 405);
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const valid = verifyToken(
    cookies[COOKIE_NAME],
    process.env.REMOTE_SESSION_SECRET
  );

  return json({ authenticated: valid }, valid ? 200 : 401);
}

export const config = { path: "/api/auth/session" };
