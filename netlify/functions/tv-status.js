import { getStore } from "@netlify/blobs";

const STORE_NAME = "karaoke-tv-status-relay";

function reply(data, status = 200) {
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
      return reply({}, 204);
    }

    const store = getStore(STORE_NAME);

    if (request.method === "POST") {
      const body = await request.json();

      const roomId = String(
        body?.roomId || ""
      ).trim();

      if (!roomId) {
        return reply(
          { error: "roomId is required" },
          400
        );
      }

      const key = `room:${roomId}`;

      const current = await store.get(
        key,
        {
          type: "json",
          consistency: "strong"
        }
      );

      const events =
        Array.isArray(current?.events)
          ? current.events
          : [];

      const event = {
        roomId,
        payload: body?.payload || {},
        sentAt:
          body?.sentAt ||
          new Date().toISOString(),
        receivedAt:
          new Date().toISOString(),
        eventId:
          crypto.randomUUID()
      };

      const next = [
        ...events,
        event
      ].slice(-120);

      await store.set(
        key,
        JSON.stringify({
          events: next
        })
      );

      return reply({
        ok: true,
        event
      });
    }

    if (request.method === "GET") {
      const url = new URL(
        request.url
      );

      const roomId = String(
        url.searchParams.get("roomId") || ""
      ).trim();

      if (!roomId) {
        return reply(
          { error: "roomId is required" },
          400
        );
      }

      const saved = await store.get(
        `room:${roomId}`,
        {
          type: "json",
          consistency: "strong"
        }
      );

      const events =
        Array.isArray(saved?.events)
          ? saved.events
          : [];

      return reply({
        event:
          events.at(-1) || null,

        events:
          url.searchParams.get("all") === "1"
            ? events
            : undefined
      });
    }

    return reply(
      { error: "Method not allowed" },
      405
    );
  } catch (error) {
    console.error(
      "tv-status error:",
      error
    );

    return reply(
      {
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
};
