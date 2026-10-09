/**
 * Cloudflare Pages Function — Cloud Sync API
 * Bound KV namespace name: SYNC_KV
 *
 * GET  /api/sync?code=XXXX  → load data
 * PUT  /api/sync            → save data  { code, data }
 */

const CODE_RE = /^[a-zA-Z0-9_-]{8,64}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequestOptions() {
  return json({});
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) {
    return json({ error: "SYNC_KV not bound. Add a KV namespace binding named SYNC_KV in Pages settings." }, 500);
  }

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim();

  if (!CODE_RE.test(code)) {
    return json({ error: "Invalid sync code. Use 8–64 letters, numbers, _ or -." }, 400);
  }

  const raw = await env.SYNC_KV.get(`sync:${code}`);
  if (!raw) {
    return json({ error: "No data found for this code." }, 404);
  }

  try {
    const data = JSON.parse(raw);
    return json({ ok: true, data });
  } catch {
    return json({ error: "Stored data is corrupted." }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (!env.SYNC_KV) {
    return json({ error: "SYNC_KV not bound. Add a KV namespace binding named SYNC_KV in Pages settings." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const code = (body.code || "").trim();
  if (!CODE_RE.test(code)) {
    return json({ error: "Invalid sync code. Use 8–64 letters, numbers, _ or -." }, 400);
  }
  if (!body.data || typeof body.data !== "object") {
    return json({ error: "Missing data object." }, 400);
  }

  // Limit size (~100 KB is plenty for this dashboard)
  const payload = JSON.stringify(body.data);
  if (payload.length > 100_000) {
    return json({ error: "Data too large." }, 413);
  }

  await env.SYNC_KV.put(`sync:${code}`, payload, {
    expirationTtl: 60 * 60 * 24 * 365 * 2, // keep 2 years; touch on every save
  });

  return json({ ok: true, savedAt: new Date().toISOString() });
}
