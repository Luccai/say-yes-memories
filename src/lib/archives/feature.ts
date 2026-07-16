export function archiveFeatureIsEnabled() {
  return process.env.ENABLE_ARCHIVE_DOWNLOADS === "true";
}

export function archiveDisabledResponse() {
  return Response.json(
    { message: "Archive download is not available." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
