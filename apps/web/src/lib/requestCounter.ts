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
    open(
      method: string,
      url: string | URL,
      async = true,
      username?: string | null,
      password?: string | null,
    ) {
      count += 1;
      onChange(count);
      return super.open(method, url, async, username, password);
    }
  }
  window.XMLHttpRequest = CountingXHR;

  return () => {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXHR;
  };
}
