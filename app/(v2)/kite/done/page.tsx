import { KiteDone } from './kite-done';

/**
 * Where the Zerodha callback lands when the login was started from the v2
 * app: hands `?kite=connected|error&reason=` to the tab that opened the
 * pop-up (BroadcastChannel) and closes itself; opened as a full page
 * instead, it carries the result on to /chat.
 */
export const dynamic = 'force-dynamic';

export default function KiteDonePage() {
  return <KiteDone />;
}
