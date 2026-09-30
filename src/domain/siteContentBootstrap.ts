import type { SiteContent, SiteContentBundle } from '../context/AppContext';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isUsableSiteContent(value: unknown): value is SiteContent {
  if (!isRecord(value)) return false;

  const brand = value.brand;
  if (!isRecord(brand) || !isString(brand.name) || !isString(brand.nameTr) || !isString(brand.logoIcon)) return false;

  const footer = value.footer;
  if (!isRecord(footer) || !isString(footer.phone) || !isString(footer.email) || !isString(footer.address) || !isString(footer.copyright)) return false;
  
  const social = footer.social;
  if (!isRecord(social) || !isString(social.facebook) || !isString(social.twitter) || !isString(social.instagram) || !isString(social.youtube)) return false;

  const hero = value.hero;
  if (!isRecord(hero) || !isString(hero.badge) || !isString(hero.title) || !isString(hero.subtitle) || !isString(hero.description)) return false;
  if (!isString(hero.primaryBtn) || !isString(hero.secondaryBtn) || !isString(hero.tertiaryBtn) || !isString(hero.image)) return false;

  const badge1 = hero.badge1;
  if (!isRecord(badge1) || !isString(badge1.value) || !isString(badge1.label) || !isString(badge1.icon)) return false;

  const badge2 = hero.badge2;
  if (!isRecord(badge2) || !isString(badge2.value) || !isString(badge2.label) || !isString(badge2.icon)) return false;

  const stats = value.stats;
  if (!Array.isArray(stats)) return false;
  for (const item of stats) {
    if (!isRecord(item) || typeof item.value !== 'number' || !isString(item.label) || !isString(item.icon)) return false;
  }

  const about = value.about;
  if (!isRecord(about) || !isString(about.badge) || !isString(about.title) || !isString(about.description) || !isString(about.image)) return false;

  const imageBadge = about.imageBadge;
  if (!isRecord(imageBadge) || !isString(imageBadge.value) || !isString(imageBadge.label)) return false;

  const features = about.features;
  if (!Array.isArray(features)) return false;
  for (const feature of features) {
    if (!isRecord(feature) || !isString(feature.icon) || !isString(feature.title) || !isString(feature.desc)) return false;
  }

  const boardPreview = value.boardPreview;
  if (!isRecord(boardPreview) || !isString(boardPreview.title) || !isString(boardPreview.subtitle) || !isString(boardPreview.description)) return false;
  if (!isStringArray(boardPreview.memberIds)) return false;

  return true;
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
