import type { CommitteeId, UserRole } from '../data/mockData.ts';

export interface ConfirmedAuthOwner {
  epoch: number;
  userId: string;
  loginEmail: string;
  role: UserRole;
  committee?: CommitteeId;
}

export class ConfirmedAuthOwnerStore {
  private owner: ConfirmedAuthOwner | null = null;

  clear(): void {
    this.owner = null;
  }

  publish(
    owner: ConfirmedAuthOwner,
    isAuthEpochCurrent: (epoch: number) => boolean,
  ): boolean {
    if (!isAuthEpochCurrent(owner.epoch)) return false;
    this.owner = { ...owner };
    return true;
  }

  capture(isAuthEpochCurrent: (epoch: number) => boolean): ConfirmedAuthOwner | null {
    if (!this.owner || !isAuthEpochCurrent(this.owner.epoch)) return null;
    return { ...this.owner };
  }
}

export function isSameAuthOwner(a: ConfirmedAuthOwner | null | undefined, b: ConfirmedAuthOwner | null | undefined): boolean {
  if (!a || !b) return false;
  return a.userId === b.userId && a.epoch === b.epoch;
}
