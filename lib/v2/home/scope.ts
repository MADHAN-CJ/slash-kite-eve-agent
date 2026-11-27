/** Dispose the prototype's canvas frames, timers and window listeners on route changes. */
export function homeScope() {
  const listeners = new AbortController();
  const timers = new Set<number>();
  const intervals = new Set<number>();
  const frames = new Set<number>();
  const observers = new Set<IntersectionObserver>();
  return {
    setTimeout(callback: () => void, delay: number) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        callback();
      }, delay);
      timers.add(id);
      return id;
    },
    clearTimeout(id: number) {
      window.clearTimeout(id);
      timers.delete(id);
    },
    setInterval(callback: () => void, delay: number) {
      const id = window.setInterval(callback, delay);
      intervals.add(id);
      return id;
    },
    clearInterval(id: number) {
      window.clearInterval(id);
      intervals.delete(id);
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = window.requestAnimationFrame((time) => {
        frames.delete(id);
        callback(time);
      });
      frames.add(id);
      return id;
    },
    addEventListener(type: string, listener: EventListener) {
      window.addEventListener(type, listener, { signal: listeners.signal });
    },
    observeIntersection(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      const observer = new IntersectionObserver(callback, options);
      observers.add(observer);
      return observer;
    },
    whenFontsReady(callback: () => void) {
      void document.fonts.ready.then(() => {
        if (!listeners.signal.aborted) callback();
      });
    },
    dispose() {
      listeners.abort();
      timers.forEach((id) => window.clearTimeout(id));
      intervals.forEach((id) => window.clearInterval(id));
      frames.forEach((id) => window.cancelAnimationFrame(id));
      observers.forEach((observer) => observer.disconnect());
    },
  };
}
