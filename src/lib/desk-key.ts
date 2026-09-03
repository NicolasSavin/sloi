const STORE = "sloi-desk-key";

export function readDeskKey() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORE)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeDeskKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORE, key.trim());
}

export function clearDeskKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORE);
}
