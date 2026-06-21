const MEDIA_CHANGED_EVENT = "media_changed";

export async function broadcastWeddingMediaChange(realtimeTopic?: string | null) {
  if (!realtimeTopic) {
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const topic = `wedding:${realtimeTopic}`;
  const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          topic,
          event: MEDIA_CHANGED_EVENT,
          payload: { updatedAt: new Date().toISOString() },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`Realtime broadcast failed: ${response.status} ${body}`);
  }
}
