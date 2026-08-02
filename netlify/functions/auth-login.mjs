import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "kth_remote_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ message: "Method not allowed" }, 405, { Allow: "POST" });
  }

  const expectedPassword = process.env.REMOTE_PASSWORD;
  const sessionSecret = process.env.REMOTE_SESSION_SECRET;

  if (!expectedPassword || !sessionSecret) {
    return json({ message: "Server password settings မပြည့်စုံပါ။" }, 500);
  }

  let submittedPassword = "";

  try {
    submittedPassword = (await request.json())?.password || "";
  } catch {
    return json({ message: "Request မမှန်ပါ။" }, 400);
  }

  if (!safeEqual(submittedPassword, expectedPassword)) {
    return json({ authenticated: false, message: "Password မမှန်ပါ။" }, 401);
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ exp: expiresAt, scope: "remote-control" })
  ).toString("base64url");
  const token = `${payload}.${sign(payload, sessionSecret)}`;

  return json(
    { authenticated: true },
    200,
    {
      "Set-Cookie": [
        `${COOKIE_NAME}=${token}`,
        "Path=/",
        `Max-Age=${SESSION_SECONDS}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict"
      ].join("; ")
    }
  );
}

export const config = { path: "/api/auth/login" };
