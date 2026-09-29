export const DEFAULT_FAVICON_HREF = '/favicon.png';

export function synchronizeFavicon(documentRef: Document, logoUrl?: string): HTMLLinkElement {
  let iconLink = documentRef.querySelector<HTMLLinkElement>('link[rel~="icon"]');

  if (!iconLink) {
    iconLink = documentRef.createElement('link');
    iconLink.rel = 'icon';
    documentRef.head.appendChild(iconLink);
  }

  iconLink.href = logoUrl?.trim() || DEFAULT_FAVICON_HREF;
  return iconLink;
}
