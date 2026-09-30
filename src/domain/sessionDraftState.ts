import { saveSessionDraft, removeSessionDraft } from './sessionDraft.ts';
import type { SessionDraftUiState, SessionDraftEnvelope } from './sessionDraft.ts';

export type DraftEntityValidation = 'unknown' | 'valid' | 'invalid';

export interface SessionDraftState<T> {
  data: T;
  open: boolean;
  ui: SessionDraftUiState;
  dirty: boolean;
  isDecisionOpen: boolean;
  restoredFromStorage: boolean;
}

export interface SessionDraftConfig<T> {
  key: string | null;
  userId: string | null;
  defaultData: T;
  defaultOpen?: boolean;
  initialUi?: SessionDraftUiState;
  validation?: DraftEntityValidation;
  baselineFingerprint?: string;
  isDirty: (value: T) => boolean;
}

export class SessionDraftStateMachine<T> {
  private state: SessionDraftState<T>;
  private config: SessionDraftConfig<T>;
  /**
   * Set to true by clearDraft() to prevent subsequent persist() calls from
   * recreating the draft that was just removed. Reset to false when the user
   * performs a new meaningful editing action (setOpen, updateData, updateUi
   * with non-trivial content).
   */
  private _cleared = false;

  constructor(config: SessionDraftConfig<T>, restoredEnvelope: SessionDraftEnvelope<T> | null) {
    this.config = config;

    let initialData = config.defaultData;
    let initialOpen = config.defaultOpen ?? false;
    let initialUi = config.initialUi ?? {};
    const isDecisionOpen = false;

    let restoredFromStorage = false;

    if (restoredEnvelope && config.validation !== 'invalid') {
      initialData = restoredEnvelope.value;
      initialOpen = restoredEnvelope.open;
      restoredFromStorage = true;
      if (restoredEnvelope.ui) {
        initialUi = restoredEnvelope.ui;
      }
    }

    if (config.validation === 'invalid') {
      initialOpen = false;
      if (config.key) {
        removeSessionDraft(config.key);
      }
    }

    this.state = {
      data: initialData,
      open: initialOpen,
      ui: initialUi,
      dirty: config.isDirty(initialData),
      isDecisionOpen,
      restoredFromStorage
    };
  }

  public getState(): SessionDraftState<T> {
    return { ...this.state };
  }

  /** Returns true if clearDraft() has been called and no new user action has reactivated persistence. */
  public isCleared(): boolean {
    return this._cleared;
  }

  public updateConfig(newConfig: SessionDraftConfig<T>): boolean {
    let stateChanged = false;
    this.config = newConfig;
    if (this.config.validation === 'invalid') {
      if (this.config.key) {
        removeSessionDraft(this.config.key);
      }
      if (this.state.open || this.state.isDecisionOpen || this.state.dirty || JSON.stringify(this.state.data) !== JSON.stringify(this.config.defaultData)) {
        this.state.open = false;
        this.state.isDecisionOpen = false;
        this.state.data = this.config.defaultData;
        this.state.dirty = false;
        stateChanged = true;
      }
    } else {
      if (!this.state.dirty && JSON.stringify(this.state.data) !== JSON.stringify(this.config.defaultData)) {
        this.state.data = this.config.defaultData;
        stateChanged = true;
      }
      const newDirty = this.config.isDirty(this.state.data);
      if (newDirty !== this.state.dirty) {
        this.state.dirty = newDirty;
        stateChanged = true;
      }
    }
    return stateChanged;
  }

  public updateData(newData: T): void {
    this._cleared = false; // new user data — resume persistence
    this.state.data = newData;
    this.state.dirty = this.config.isDirty(newData);
    this.persist();
  }

  public updateUi(newUi: SessionDraftUiState): void {
    this._cleared = false; // new user ui action — resume persistence
    this.state.ui = newUi;
    this.persist();
  }

  public setOpen(open: boolean): void {
    if (open) {
      this._cleared = false; // opening a draft is a new user intent — resume persistence
    }
    this.state.open = open;
    this.persist();
  }

  public requestClose(): void {
    if (this.state.isDecisionOpen) {
      this.state.isDecisionOpen = false;
      this.state.open = true;
      this.persist();
    } else if (this.state.dirty) {
      this.state.isDecisionOpen = true;
    } else {
      this.state.open = false;
      this.state.isDecisionOpen = false;
      this.persist();
    }
  }

  public continueEditing(): void {
    this.state.isDecisionOpen = false;
    // editor remains open
  }

  public keepDraftAndClose(): void {
    this.state.open = false;
    this.state.isDecisionOpen = false;
    this.persist();
  }

  public discardDraftAndClose(): void {
    this.state.open = false;
    this.state.isDecisionOpen = false;
    this.state.data = this.config.defaultData;
    this.state.dirty = false;
    if (this.config.initialUi) {
      this.state.ui = this.config.initialUi;
    } else {
      this.state.ui = {};
    }
    if (this.config.key) {
      removeSessionDraft(this.config.key);
    }
  }

  /**
   * Called on successful submit. Fully resets in-memory state AND removes the
   * storage key. Suspends persistence so that subsequent calls such as
   * setOpen(false) or setUi(...) from the caller's success path do NOT
   * recreate the draft that was just cleared.
   *
   * Persistence resumes automatically when a new meaningful user action
   * occurs: setOpen(true), updateData(...), or updateUi(...).
   */
  public clearDraft(): void {
    this._cleared = true; // suspend persistence BEFORE touching state
    this.state.data = this.config.defaultData;
    this.state.ui = this.config.initialUi ?? {};
    this.state.open = false;
    this.state.dirty = false;
    this.state.isDecisionOpen = false;
    this.state.restoredFromStorage = false;
    if (this.config.key) {
      removeSessionDraft(this.config.key);
    }
    // Do NOT call persist() — the key must remain absent.
  }

  public flush(): void {
    this.persist();
  }

  private persist(): void {
    // Guard: do not recreate a draft that was explicitly cleared.
    if (this._cleared) return;
    if (!this.config.key || !this.config.userId || this.config.validation === 'invalid') return;

    const envelope: SessionDraftEnvelope<T> = {
      version: 1,
      userId: this.config.userId,
      key: this.config.key,
      updatedAt: new Date().toISOString(),
      open: this.state.open,
      dirty: this.state.dirty,
      value: this.state.data,
      ui: this.state.ui,
      baselineFingerprint: this.config.baselineFingerprint
    };
    saveSessionDraft(this.config.key, envelope);
  }
}
