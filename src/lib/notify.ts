export async function enableDeskPush() {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted" && "serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sloi-sw.js");
    } catch {
      /* page notifications still work */
    }
  }
  return perm;
}

export async function deskToast(title: string, body: string, opts?: { tag?: string; url?: string }) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const tag = opts?.tag ?? "sloi";
  const data = { url: opts?.url ?? "/dispatch" };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        tag,
        data,
        icon: "/__grok/icon-180.png",
        badge: "/brand/sloi-24.svg",
        requireInteraction: true,
        silent: false,
      });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: "/__grok/icon-180.png",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* blocked */
  }
}