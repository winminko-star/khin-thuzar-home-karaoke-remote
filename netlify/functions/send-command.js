import { getStore } from "@netlify/blobs";

const STORE_NAME = "karaoke-command-relay";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

export default async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    const store = getStore(STORE_NAME);

    if (request.method === "POST") {
      const body = await request.json();
      const roomId = String(body?.roomId || "").trim();

      if (!roomId) {
        return jsonResponse({ error: "roomId is required" }, 400);
      }

      const command = {
        roomId,
        type: body?.type || "",
        payload: body?.payload || {},
        sentAt: body?.sentAt || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        commandId: crypto.randomUUID()
      };

      await store.set(`room:${roomId}`, JSON.stringify(command));

      return jsonResponse({ ok: true, command });
    }

    if (request.method === "GET") {
      const url = new URL(request.url);
      const roomId = String(
        url.searchParams.get("roomId") || ""
      ).trim();

      if (!roomId) {
        return jsonResponse({ error: "roomId is required" }, 400);
      }

      const command = await store.get(`room:${roomId}`, {
        type: "json",
        consistency: "strong"
      });

      return jsonResponse({ command: command || null });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("send-command error:", error);

    return jsonResponse(
      { error: error?.message || "Unknown error" },
      500
    );
  }
};
