import { supabase } from '../lib/supabase.ts';
import {
  createPushSubscriptionGateway,
  type PushSubscriptionClient,
} from '../domain/pushSubscriptionGateway.ts';

const gateway = createPushSubscriptionGateway(supabase as unknown as PushSubscriptionClient);

export const registerPushSubscription = gateway.register;
export const registerPresidentPushSubscription = gateway.registerPresident;
export const disablePushSubscription = gateway.disable;
