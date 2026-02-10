const channelName = 'cloud-drive-session';

export function publishSessionChange() {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage('changed');
    channel.close();
  } else {
    try {
      localStorage.setItem(channelName, String(Date.now()));
    } catch { /* Storage can be unavailable in private browsing. */ }
  }
}

export function subscribeToSessionChanges(listener: () => void) {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(channelName);
    channel.addEventListener('message', listener);
    return () => channel.close();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === channelName) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
