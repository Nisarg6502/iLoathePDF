export function installRequestCounter(onChange: (count: number) => void): () => void {
  let count = 0;
  const originalFetch = window.fetch;
  const wrappedFetch: typeof window.fetch = (...args) => {
    count += 1;
    onChange(count);
    return originalFetch(...args);
  };
  window.fetch = wrappedFetch;

  const OriginalXHR = window.XMLHttpRequest;
  class CountingXHR extends OriginalXHR {
    open(...args: Parameters<XMLHttpRequest["open"]>) {
      count += 1;
      onChange(count);
      // @ts-expect-error -- forwarding the exact arguments XHR.open received
      return super.open(...args);
    }
  }
  window.XMLHttpRequest = CountingXHR;

  return () => {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXHR;
  };
}
