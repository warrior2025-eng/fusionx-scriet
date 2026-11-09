"use client";

import { useEffect } from "react";

/** Registers the service worker (phone notifications and "Install"), once the page is idle. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if ("requestIdleCallback" in window) requestIdleCallback(register);
    else setTimeout(register, 3000);
  }, []);
  return null;
}
