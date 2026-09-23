import { useCallback, useEffect, useReducer } from 'react';
import {
  detectPushCapability,
  serializePushSubscription,
  urlBase64ToUint8Array,
  type PushCapability,
} from '../domain/webPushClient.ts';
import {
  initialAcceptedStudentPushState,
  reduceAcceptedStudentPushState,
} from '../domain/acceptedStudentPushState.ts';
import { registerPresidentPushSubscription, disablePushSubscription } from '../services/pushSubscriptionService.ts';

const currentCapability = (): PushCapability => {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return detectPushCapability({
    isSecureContext: window.isSecureContext,
    hasNotification: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : 'default',
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: window.matchMedia('(display-mode: standalone)').matches
      || standaloneNavigator.standalone === true,
  });
};

const registerWorker = () => navigator.serviceWorker.register('/push-sw.js', { scope: '/' });

export function usePresidentPush(eligible: boolean) {
  const [state, dispatch] = useReducer(
    reduceAcceptedStudentPushState,
    eligible
      ? { kind: 'checking' as const }
      : initialAcceptedStudentPushState('pending', { kind: 'ready', permission: 'default' }, false),
  );

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? '';

  useEffect(() => {
    let active = true;
    if (!eligible) return () => { active = false; };

    const synchronize = async () => {
      dispatch({ type: 'CHECKING' });
      const capability = currentCapability();
      if (capability.kind !== 'ready') {
        if (active) dispatch({ type: 'CAPABILITY_RESOLVED', capability, hasSubscription: false });
        return;
      }
      if (!vapidPublicKey) {
        if (active) dispatch({ type: 'FAILED', message: 'لم يتم إعداد مفتاح إشعارات الموقع بعد.' });
        return;
      }
      try {
        urlBase64ToUint8Array(vapidPublicKey);
        const registration = await registerWorker();
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (!subscription) {
          dispatch({ type: 'CAPABILITY_RESOLVED', capability, hasSubscription: false });
          return;
        }
        const saved = await registerPresidentPushSubscription(
          serializePushSubscription(subscription),
          navigator.userAgent,
        );
        if (!active) return;
        if (saved.ok) {
          dispatch({ type: 'CAPABILITY_RESOLVED', capability, hasSubscription: true });
        } else {
          dispatch({ type: 'FAILED', message: saved.error.message });
        }
      } catch (error) {
        console.error('Push subscription synchronization failed.', error);
        if (active) dispatch({ type: 'FAILED', message: 'تعذر التحقق من اشتراك الإشعارات. حاول مرة أخرى.' });
      }
    };

    void synchronize();
    return () => { active = false; };
  }, [eligible, vapidPublicKey]);

  const enable = useCallback(async () => {
    if (!eligible) return;
    dispatch({ type: 'ENABLE_STARTED' });
    try {
      const capability = currentCapability();
      if (capability.kind !== 'ready') {
        dispatch({ type: 'CAPABILITY_RESOLVED', capability, hasSubscription: false });
        return;
      }
      if (!vapidPublicKey) throw new Error('VAPID_PUBLIC_KEY_MISSING');

      const permission = capability.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        dispatch({
          type: 'PERMISSION_DENIED',
          message: 'لم يتم السماح بالإشعارات. يمكنك تفعيلها لاحقاً من إعدادات الموقع في المتصفح.',
        });
        return;
      }

      const registration = await registerWorker();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const saved = await registerPresidentPushSubscription(
        serializePushSubscription(subscription),
        navigator.userAgent,
      );
      if (!saved.ok) {
        dispatch({ type: 'FAILED', message: saved.error.message });
        return;
      }
      dispatch({ type: 'ENABLE_SUCCEEDED' });
    } catch (error) {
      console.error('Push notification enable failed.', error);
      dispatch({ type: 'FAILED', message: 'تعذر تفعيل الإشعارات على هذا الجهاز. حاول مرة أخرى.' });
    }
  }, [eligible, vapidPublicKey]);

  const disable = useCallback(async () => {
    dispatch({ type: 'DISABLE_STARTED' });
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        dispatch({ type: 'DISABLE_SUCCEEDED' });
        return;
      }
      const disabled = await disablePushSubscription(subscription.endpoint);
      if (!disabled.ok) {
        dispatch({ type: 'FAILED', message: disabled.error.message });
        return;
      }
      await subscription.unsubscribe();
      dispatch({ type: 'DISABLE_SUCCEEDED' });
    } catch (error) {
      console.error('Push notification disable failed.', error);
      dispatch({ type: 'FAILED', message: 'تعذر إيقاف الإشعارات على هذا الجهاز. حاول مرة أخرى.' });
    }
  }, []);

  return { state, enable, disable };
}
