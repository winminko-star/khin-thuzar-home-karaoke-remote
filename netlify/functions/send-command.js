import { getStore } from "@netlify/blobs";

const STORE_NAME = "karaoke-command-relay";

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

      const commands =
        Array.isArray(current?.commands)
          ? current.commands
          : [];

      const command = {
        roomId,
        type: String(body?.type || ""),
        payload: body?.payload || {},
        sentAt:
          body?.sentAt ||
          new Date().toISOString(),
        receivedAt:
          new Date().toISOString(),
        commandId:
          crypto.randomUUID()
      };

      const next = [
        ...commands,
        command
      ].slice(-50);

      await store.set(
        key,
        JSON.stringify({
          commands: next
        })
      );

      return reply({
        ok: true,
        command
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

      const commands =
        Array.isArray(saved?.commands)
          ? saved.commands
          : [];

      return reply({
        command:
          commands.at(-1) || null,

        commands:
          url.searchParams.get("all") === "1"
            ? commands
            : undefined
      });
    }

    return reply(
      { error: "Method not allowed" },
      405
    );
  } catch (error) {
    console.error(
      "send-command error:",
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
