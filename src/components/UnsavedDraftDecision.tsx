import React from 'react';
import { useTranslation } from 'react-i18next';

export interface UnsavedDraftDecisionProps {
  onContinue: () => void;
  onKeep: () => void;
  onDiscard: () => void;
}

export function UnsavedDraftDecision({
  onContinue,
  onKeep,
  onDiscard,
}: UnsavedDraftDecisionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="text-xl font-bold text-gray-900 mb-2">
        {t('drafts.unsavedTitle')}
      </h3>
      <p className="text-gray-600 mb-8 max-w-md">
        {t('drafts.unsavedDescription')}
      </p>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <button
          type="button"
          onClick={onContinue}
          autoFocus
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          {t('drafts.continueEditing')}
        </button>

        <button
          type="button"
          onClick={onKeep}
          className="w-full px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors font-medium border border-gray-200"
        >
          {t('drafts.keepDraft')}
        </button>

        <button
          type="button"
          onClick={onDiscard}
          className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors font-medium border border-red-100 mt-2"
        >
          {t('drafts.discardDraft')}
        </button>
      </div>
    </div>
  );
}
