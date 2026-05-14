"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // Cek update SW
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // Ada update SW baru — kirim pesan skip waiting
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // Register background sync jika tersedia
        if ("sync" in registration) {
          try {
            await (registration as ServiceWorkerRegistration & {
              sync: { register: (tag: string) => Promise<void> }
            }).sync.register("sunan-motor-sync");
          } catch { /* tidak support, abaikan */ }
        }

      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    // Daftarkan setelah halaman load
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    // Listen pesan dari SW
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "BACKGROUND_SYNC_TRIGGER") {
        // Dispatch custom event agar useOfflineSync bisa menangkap
        window.dispatchEvent(new CustomEvent("sw-sync-trigger"));
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
