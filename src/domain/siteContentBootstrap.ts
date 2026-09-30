import type { SiteContent, SiteContentBundle } from '../context/AppContext';

export function isUsableSiteContent(value: unknown): value is SiteContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = value as any;
  
  try {
    if (!obj.brand || typeof obj.brand.name !== 'string') return false;
    if (!obj.footer || typeof obj.footer.email !== 'string') return false;
    if (!obj.hero || typeof obj.hero.title !== 'string' || typeof obj.hero.image !== 'string') return false;
    if (!obj.hero.badge1 || typeof obj.hero.badge1.value !== 'string') return false;
    if (!obj.hero.badge2 || typeof obj.hero.badge2.value !== 'string') return false;
    if (!Array.isArray(obj.stats)) return false;
    if (!obj.about || typeof obj.about.title !== 'string') return false;
    if (!obj.boardPreview || typeof obj.boardPreview.title !== 'string') return false;
    return true;
  } catch {
    return false;
  }
}

export function resolveInitialSiteContent(
  legacyCacheRaw: string | null,
  bundledCache: SiteContentBundle | null,
  fallback: SiteContent
): SiteContent {
  if (legacyCacheRaw) {
    try {
      const parsedLegacy = JSON.parse(legacyCacheRaw);
      if (isUsableSiteContent(parsedLegacy)) {
        return parsedLegacy;
      }
    } catch {
      // Ignore JSON parse errors and proceed to bundle
    }
  }

  if (bundledCache && isUsableSiteContent(bundledCache.siteContent)) {
    return bundledCache.siteContent;
  }

  return fallback;
}
