import { supabase } from '../lib/supabase.ts';
import {
  createSectionContentRepository,
  type SectionContentClient,
} from '../domain/sectionContentRepository.ts';

export type {
  CmsPublication,
  FaqContent,
  RepositoryError,
  RepositoryResult,
  StudentGuideContent,
} from '../domain/sectionContentRepository.ts';

const repository = createSectionContentRepository(supabase as unknown as SectionContentClient);

export const loadStudentGuideContent = () => repository.loadGuide();
export const loadFaqContent = () => repository.loadFaq();
export const publishCmsTarget = (target: string, payload: unknown, expectedVersion: number) => (
  repository.publish(target, payload, expectedVersion)
);
export const createPublishedEvent = (event: unknown, expectedVersion: number) => (
  repository.createEvent(event, expectedVersion)
);
export const publishOwnCommittee = (committeeId: string, snapshot: unknown, expectedVersion: number) => (
  repository.publishOwnCommittee(committeeId, snapshot, expectedVersion)
);
export const publishOwnCommitteeFields = (
  committeeId: string,
  fields: { vision?: string; goals?: string },
  expectedVersion: number,
) => (
  repository.publishOwnCommitteeFields(committeeId, fields, expectedVersion)
);
export const updateOwnedEvent = (eventId: string, eventPatch: unknown, expectedVersion: number) => (
  repository.updateOwnedEvent(eventId, eventPatch, expectedVersion)
);
export const createGalleryAlbum = (album: unknown, expectedVersion: number) => (
  repository.createGalleryAlbum(album, expectedVersion)
);
export const updateOwnedGalleryAlbum = (albumId: string, albumPatch: unknown, expectedVersion: number) => (
  repository.updateOwnedGalleryAlbum(albumId, albumPatch, expectedVersion)
);
export const appendOwnedGalleryMedia = (albumId: string, media: unknown, expectedVersion: number) => (
  repository.appendOwnedGalleryMedia(albumId, media, expectedVersion)
);
export const listOwnEventIds = () => repository.listOwnEventIds();
export const listOwnAlbumIds = () => repository.listOwnAlbumIds();
