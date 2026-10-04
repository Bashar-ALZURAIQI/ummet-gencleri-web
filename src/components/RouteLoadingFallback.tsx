import React from 'react';
import { useTranslation } from 'react-i18next';

export default function RouteLoadingFallback() {
  const { t } = useTranslation('common');

  return (
    <div
      role="status"
      className="flex items-center justify-center min-h-[300px] w-full text-slate-500"
    >
      <span className="text-sm font-medium animate-pulse">
        {t('loadingPage')}
      </span>
    </div>
  );
}
