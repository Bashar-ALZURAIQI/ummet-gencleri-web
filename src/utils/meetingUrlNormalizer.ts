export function normalizeMeetingUrl(rawUrl: string): string | null {
  const raw = rawUrl.trim();
  if (!raw) return null;

  let withProto = raw;
  if (!/^https?:\/\//i.test(raw)) {
    withProto = `https://${raw}`;
  }

  try {
    const url = new URL(withProto);
    if (url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();
    const isMeet = host === 'meet.google.com';
    const isZoom = host === 'zoom.us' || host.endsWith('.zoom.us');

    if (!isMeet && !isZoom) return null;

    return url.toString();
  } catch {
    return null;
  }
}
