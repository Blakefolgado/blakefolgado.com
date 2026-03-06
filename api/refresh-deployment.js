export async function GET(request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json(
      {
        ok: false,
        error: "unauthorized"
      },
      { status: 401 }
    );
  }

  if (!process.env.VERCEL_DEPLOY_HOOK_URL) {
    return Response.json(
      {
        ok: false,
        error: "missing_deploy_hook"
      },
      { status: 500 }
    );
  }

  const deployResponse = await fetch(process.env.VERCEL_DEPLOY_HOOK_URL, {
    method: "POST"
  });

  if (!deployResponse.ok) {
    const errorText = await deployResponse.text();
    return Response.json(
      {
        ok: false,
        error: "deploy_hook_failed",
        status: deployResponse.status,
        body: errorText.slice(0, 500)
      },
      { status: 502 }
    );
  }

  let payload = null;

  try {
    payload = await deployResponse.json();
  } catch {
    payload = null;
  }

  return Response.json({
    ok: true,
    triggeredAt: new Date().toISOString(),
    deployHookJob: payload?.job ?? null
  });
}
