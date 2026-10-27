import { useEffect, useState } from 'react';

import { enablePush, markPushOffered, shouldOfferPush } from './push';

/** Offer notifications once, on the first table screen the player reaches. */
export function usePushOffer() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    shouldOfferPush().then((offer) => alive && setVisible(offer)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return {
    visible,
    async allow() {
      setVisible(false);
      await markPushOffered();
      await enablePush();
    },
    async later() {
      setVisible(false);
      await markPushOffered();
    },
  };
}
