/**
 * The candidate's device, read in the browser (no data leaves it except the
 * short summary logged at join: "Phone · Chrome"). Everything is feature-
 * detected so nothing breaks on iPhone, where fullscreen and the wake lock
 * may be missing.
 */

export type DeviceKind = "phone" | "tablet" | "laptop";
export type DeviceInfo = { kind: DeviceKind; browser: string; inApp: boolean; media: boolean; fullscreen: boolean; ios: boolean };

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void };
type FsElement = { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void> | void };

export function readDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports itself as a Mac
  const ios = /iPhone|iPad|iPod/.test(ua) || touchMac;
  const tablet = /iPad|Tablet/i.test(ua) || touchMac || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const phone = !tablet && /Mobi|iPhone|iPod|Android/i.test(ua);
  // In-app browsers (WhatsApp, Instagram, Facebook, …) often cannot use the camera and microphone.
  const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|WhatsApp|Snapchat|Line\/|LinkedInApp|Twitter|MicroMessenger|; wv\)/i.test(ua);
  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  const d = document as FsDocument;
  const el = document.documentElement as unknown as FsElement;
  const fullscreen = Boolean((el.requestFullscreen && d.fullscreenEnabled !== false) || (el.webkitRequestFullscreen && d.webkitFullscreenEnabled !== false));
  return { kind: phone ? "phone" : tablet ? "tablet" : "laptop", browser, inApp, media: Boolean(navigator.mediaDevices?.getUserMedia), fullscreen, ios };
}

export const DEVICE_LABEL: Record<DeviceKind, string> = { phone: "Phone", tablet: "Tablet", laptop: "Laptop" };

export function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export async function enterFullscreen(el: HTMLElement | null): Promise<boolean> {
  if (!el) return false;
  const f = el as unknown as FsElement;
  try {
    if (f.requestFullscreen) await f.requestFullscreen();
    else if (f.webkitRequestFullscreen) await f.webkitRequestFullscreen();
    else return false;
    return true;
  } catch {
    return false;
  }
}

export function exitFullscreen() {
  const d = document as FsDocument;
  try {
    if (d.fullscreenElement && d.exitFullscreen) void d.exitFullscreen().catch(() => {});
    else if (d.webkitFullscreenElement && d.webkitExitFullscreen) void d.webkitExitFullscreen();
  } catch {}
}

/** Listens to fullscreen changes, with the Safari (webkit) event too. */
export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
}
