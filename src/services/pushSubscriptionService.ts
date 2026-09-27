import { supabase } from '../lib/supabase.ts';
import {
  createPushSubscriptionGateway,
  type PushSubscriptionClient,
} from '../domain/pushSubscriptionGateway.ts';

import type { SerializedPushSubscription } from '../domain/webPushClient.ts';

const gateway = createPushSubscriptionGateway(supabase as unknown as PushSubscriptionClient);

export const registerPushSubscription = gateway.register;
export const disablePushSubscription = gateway.disable;

export const registerExecutivePushSubscription = async (
  subscription: SerializedPushSubscription,
  userAgent: string,
  isPresident: boolean,
) => {
  if (isPresident) {
    return gateway.registerPresident(subscription, userAgent);
  }
  return gateway.register(subscription, userAgent);
};
