import { useState, useRef, useEffect, useCallback } from 'react';
import { SessionDraftStateMachine } from '../domain/sessionDraftState.ts';
import type { DraftEntityValidation } from '../domain/sessionDraftState.ts';
import { loadSessionDraft } from '../domain/sessionDraft.ts';
import type { SessionDraftUiState } from '../domain/sessionDraft.ts';

export interface UseSessionDraftOptions<T> {
  key: string | null;
  userId: string | null;
  defaultData: T;
  defaultOpen?: boolean;
  initialUi?: SessionDraftUiState;
  validation?: DraftEntityValidation;
  baselineFingerprint?: string;
  isDirty: (value: T) => boolean;
}

export interface UseSessionDraftResult<T> {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  open: boolean;
  setOpen: (open: boolean) => void;
  ui: SessionDraftUiState;
  setUi: React.Dispatch<React.SetStateAction<SessionDraftUiState>>;
  dirty: boolean;
  isDecisionOpen: boolean;
  requestClose: () => void;
  continueEditing: () => void;
  keepDraftAndClose: () => void;
  discardDraftAndClose: () => void;
  clearDraft: () => void;
}

export function useSessionDraft<T>(options: UseSessionDraftOptions<T>): UseSessionDraftResult<T> {
  const machineRef = useRef<SessionDraftStateMachine<T> | null>(null);

  // Lazy initialization
  if (machineRef.current === null) {
    const envelope = options.key ? loadSessionDraft<T>(options.key) : null;
    machineRef.current = new SessionDraftStateMachine(options, envelope);
  }

  const [state, setState] = useState(() => machineRef.current!.getState());

  const syncState = useCallback(() => {
    setState(machineRef.current!.getState());
  }, []);

  // Watch for validation changing to invalid
  useEffect(() => {
    if (options.validation === 'invalid') {
      machineRef.current?.clearDraft();
      // Ensure it stays closed if invalid
      machineRef.current?.setOpen(false);
      syncState();
    }
  }, [options.validation, syncState]);

  // Lifecycle flush
  useEffect(() => {
    const handlePageHide = () => {
      machineRef.current?.flush();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        machineRef.current?.flush();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const setData = useCallback((action: React.SetStateAction<T>) => {
    const nextData = typeof action === 'function' 
      ? (action as (prev: T) => T)(machineRef.current!.getState().data)
      : action;
    machineRef.current!.updateData(nextData);
    syncState();
  }, [syncState]);

  const setUi = useCallback((action: React.SetStateAction<SessionDraftUiState>) => {
    const nextUi = typeof action === 'function'
      ? (action as (prev: SessionDraftUiState) => SessionDraftUiState)(machineRef.current!.getState().ui)
      : action;
    machineRef.current!.updateUi(nextUi);
    syncState();
  }, [syncState]);

  const setOpen = useCallback((open: boolean) => {
    machineRef.current!.setOpen(open);
    syncState();
  }, [syncState]);

  const requestClose = useCallback(() => {
    machineRef.current!.requestClose();
    syncState();
  }, [syncState]);

  const continueEditing = useCallback(() => {
    machineRef.current!.continueEditing();
    syncState();
  }, [syncState]);

  const keepDraftAndClose = useCallback(() => {
    machineRef.current!.keepDraftAndClose();
    syncState();
  }, [syncState]);

  const discardDraftAndClose = useCallback(() => {
    machineRef.current!.discardDraftAndClose();
    syncState();
  }, [syncState]);

  const clearDraft = useCallback(() => {
    machineRef.current!.clearDraft();
    syncState();
  }, [syncState]);

  return {
    data: state.data,
    setData,
    open: state.open,
    setOpen,
    ui: state.ui,
    setUi,
    dirty: state.dirty,
    isDecisionOpen: state.isDecisionOpen,
    requestClose,
    continueEditing,
    keepDraftAndClose,
    discardDraftAndClose,
    clearDraft
  };
}
