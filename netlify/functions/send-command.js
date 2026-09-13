let latestCommand = null;

export default async (request) => {
  try {
    if (request.method === "POST") {
      const body = await request.json();

      latestCommand = {
        ...body,
        receivedAt: new Date().toISOString()
      };

      return new Response(
        JSON.stringify({
          ok: true,
          command: latestCommand
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          command: latestCommand
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
