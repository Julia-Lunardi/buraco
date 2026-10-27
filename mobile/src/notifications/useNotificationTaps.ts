import { useEffect } from 'react';

import { navigationRef } from '../navigation/ref';
import { notifications } from './push';

/** Tapping "Sua vez na mesa K7Q2MX" opens that table, whether the app was running or the
 * tap launched it. Every push from the backend carries `data.table_id`. */
export function useNotificationTaps(signedIn: boolean): void {
  useEffect(() => {
    if (!notifications || !signedIn) return;
    const open = (data: unknown) => {
      const tableId = (data as { table_id?: unknown })?.table_id;
      if (typeof tableId !== 'string') return;
      const go = () => navigationRef.navigate('Table', { tableId });
      if (navigationRef.isReady()) go();
      else setTimeout(go, 300); // cold start: let the navigator mount first
    };
    notifications.getLastNotificationResponseAsync()
      .then((response) => response && open(response.notification.request.content.data))
      .catch(() => {});
    const sub = notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification.request.content.data));
    return () => sub.remove();
  }, [signedIn]);
}
