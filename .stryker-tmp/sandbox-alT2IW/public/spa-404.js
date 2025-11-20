// @ts-nocheck
const STORAGE_KEY = "tooltician:spa:redirect";

(function rememberAndResetPath() {
  try {
    const preservedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sessionStorage.setItem(STORAGE_KEY, preservedPath);
    if (window.location.pathname !== "/") {
      window.history.replaceState(null, document.title, "/");
    }
  } catch (error) {
    console.warn("Failed to preserve SPA path", error);
  }
})();
