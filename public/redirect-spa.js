const STORAGE_KEY = "tooltician:spa:redirect";

(function bootstrapSpaRedirect() {
  try {
    const pending = sessionStorage.getItem(STORAGE_KEY);
    if (pending) {
      sessionStorage.removeItem(STORAGE_KEY);
      const targetUrl = new URL(pending, window.location.origin);
      const nextPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath !== currentPath) {
        window.history.replaceState(null, document.title, nextPath);
      }
    }
  } catch (error) {
    console.warn("SPA redirect bootstrap failed", error);
  }
})();
