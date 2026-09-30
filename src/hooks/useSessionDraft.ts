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
  openTarget: (targetKey: string | null) => void;
  ui: SessionDraftUiState;
  setUi: React.Dispatch<React.SetStateAction<SessionDraftUiState>>;
  dirty: boolean;
  isDecisionOpen: boolean;
  restoredFromStorage: boolean;
  requestClose: () => void;
  continueEditing: () => void;
  keepDraftAndClose: () => void;
  discardDraftAndClose: () => void;
  clearDraft: () => void;
}

export function useSessionDraft<T>(options: UseSessionDraftOptions<T>): UseSessionDraftResult<T> {
  const machineRef = useRef<SessionDraftStateMachine<T> | null>(null);

  // Lazy initialization for first render
  if (machineRef.current === null) {
    const envelope = options.key ? loadSessionDraft<T>(options.key) : null;
    machineRef.current = new SessionDraftStateMachine(options, envelope);
  }

  const [state, setState] = useState(() => machineRef.current!.getState());
  const pendingOpenKeyRef = useRef<string | null>(null);

  const syncState = useCallback(() => {
    setState(machineRef.current!.getState());
  }, []);

  let currentState = state;

  const prevKeyRef = useRef(options.key);
  const prevUserIdRef = useRef(options.userId);

  if (prevKeyRef.current !== options.key || prevUserIdRef.current !== options.userId) {
    if (machineRef.current) {
      machineRef.current.flush();
    }
    prevKeyRef.current = options.key;
    prevUserIdRef.current = options.userId;
    const envelope = options.key ? loadSessionDraft<T>(options.key) : null;
    machineRef.current = new SessionDraftStateMachine(options, envelope);
    
    if (pendingOpenKeyRef.current === options.key) {
      machineRef.current.setOpen(true);
    }
    pendingOpenKeyRef.current = null;
    currentState = machineRef.current.getState();
    setState(currentState);
  }

  // Sync config options (including validation) with machine.
  // Each option field is listed individually to avoid re-running when the
  // caller passes a freshly-created options object on every render (which
  // would cause an infinite update loop if the whole object were a dep).

  useEffect(() => {
    if (machineRef.current) {
      if (machineRef.current.updateConfig(options)) {
        setState(machineRef.current.getState());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.key,
    options.userId,
    options.defaultData,
    options.defaultOpen,
    options.initialUi,
    options.validation,
    options.baselineFingerprint,
    options.isDirty
  ]);

  // Lifecycle flush — intentionally runs once; machineRef is always current.
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

  const openTarget = useCallback((targetKey: string | null) => {
    pendingOpenKeyRef.current = targetKey;
  }, []);

  const clearDraft = useCallback(() => {
    machineRef.current!.clearDraft();
    syncState();
  }, [syncState]);

  return {
    data: currentState.data,
    setData,
    open: currentState.open,
    setOpen,
    openTarget,
    ui: currentState.ui,
    setUi,
    dirty: currentState.dirty,
    isDecisionOpen: currentState.isDecisionOpen,
    restoredFromStorage: currentState.restoredFromStorage,
    requestClose,
    continueEditing,
    keepDraftAndClose,
    discardDraftAndClose,
    clearDraft,
  };
}
