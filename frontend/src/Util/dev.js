export const isMaintaining = false;
export const isDev = process.env.NODE_ENV !== "production";

export const url_base =
  process.env.NODE_ENV === "production"
    ? ""
    : process.env.REACT_APP_HOST || "http://127.0.0.1:8000";
export const api_url = (url) => {
  return url_base + url;
};

// In-app link. Absolute paths break when the site is served from a subpath
// (e.g. GitHub Pages at /nctucourse), so prefix them with the public url.
export const app_url = (path) => (process.env.PUBLIC_URL || "") + path;
