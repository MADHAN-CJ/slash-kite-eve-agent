/** Run the action of the official Publisher button without replacing the
 * prototype's form or sending order fields to our backend. Publisher owns
 * the basket POST, login and order review. The temporary window.open wrapper
 * observes ONLY that synchronous SDK click, then is restored immediately. */
export interface PublisherWindow {
  popup: Window | null;
  inline: boolean;
  blocked: boolean;
}

export function publisherAction(
  apiKey: string,
  entry: KitePublisherEntry,
  onFinished: () => void,
): PublisherWindow {
  const SDK = window.KiteConnect;
  if (!SDK) throw new Error('The Kite button is still loading.');
  const host = document.createElement('div');
  host.hidden = true;
  host.id = `publisher-${crypto.randomUUID()}`;
  document.body.appendChild(host);
  const kite = new SDK(apiKey);
  kite.add(entry);
  kite.finished(() => onFinished());
  let popup: Window | null = null;
  let attempted = false;
  const originalOpen = window.open;
  try {
    kite.renderButton(`#${host.id}`);
    window.open = function (...args: Parameters<typeof window.open>) {
      attempted = true;
      popup = originalOpen.apply(window, args);
      return popup;
    };
    const button = host.querySelector('button');
    if (!button) throw new Error('Could not load the Kite button. Try again.');
    button.click();
  } finally {
    window.open = originalOpen;
    host.remove();
  }
  const inline = !attempted && Boolean(document.getElementById('kite-modal-wrap'));
  return { popup, inline, blocked: attempted ? !popup : !inline };
}
