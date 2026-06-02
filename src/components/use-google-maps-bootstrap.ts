"use client";

import { useEffect, useState } from "react";

// =========================================================================
// Shared Google Maps JS bootstrap hook.
//
// Mirrors the bootstrap strategy used by `google-autocomplete.tsx`:
// inject Google's official inline bootstrap loader once per page, then
// expose a status flag callers can switch on before calling
// `google.maps.importLibrary(...)`.
//
// Phase 8C extracts this so the new RouteMap client component can
// share the exact same bootstrap behavior — without touching the
// existing autocomplete (which keeps its own inline copy). Re-injecting
// the bootstrap is a no-op: Google's loader detects a prior call and
// `console.warn`s without crashing, so the two paths coexist safely.
//
// Strictly client-only. Returns a status; the caller decides what to
// render. No DB, no env access beyond the public Maps key.
// =========================================================================

export type GoogleMapsBootstrapStatus =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

const BOOTSTRAP_ID = "google-maps-bootstrap-v2";
const LEGACY_SCRIPT_ID = "google-maps-js";

function getGoogleNs(): typeof google | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { google?: typeof google }).google ?? null;
}

function importLibraryReady(): boolean {
  return typeof getGoogleNs()?.maps?.importLibrary === "function";
}

// Google's official inline bootstrap loader, parameterised with the
// provided key. Single-quoted outer string so the inner template
// literal survives the JSON.stringify.
function buildBootstrapSource(apiKey: string): string {
  const params = JSON.stringify({ key: apiKey, v: "weekly" });
  // prettier-ignore
  return '(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})(' + params + ');';
}

// Hook: returns the bootstrap status. Idempotent across mounts; safe
// to call from multiple components on the same page (Google's loader
// already guards against double-bootstrap).
export function useGoogleMapsBootstrap(): GoogleMapsBootstrapStatus {
  const [status, setStatus] = useState<GoogleMapsBootstrapStatus>({
    kind: "pending",
  });
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!browserKey || browserKey.trim().length === 0) {
      setStatus({
        kind: "error",
        message:
          "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is missing or empty. Add it to .env.local and restart the dev server.",
      });
      return;
    }

    // Remove any pre-fix Maps script tag that an older build injected.
    const legacy = document.getElementById(LEGACY_SCRIPT_ID);
    if (legacy && legacy.parentNode) {
      legacy.parentNode.removeChild(legacy);
    }

    if (importLibraryReady()) {
      setStatus({ kind: "ready" });
      return;
    }

    if (!document.getElementById(BOOTSTRAP_ID)) {
      try {
        const script = document.createElement("script");
        script.id = BOOTSTRAP_ID;
        script.textContent = buildBootstrapSource(browserKey);
        document.head.appendChild(script);
      } catch (err) {
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? `Failed to inject the Maps JS bootstrap loader: ${err.message}`
              : "Failed to inject the Maps JS bootstrap loader.",
        });
        return;
      }
    }

    if (importLibraryReady()) {
      setStatus({ kind: "ready" });
      return;
    }

    // Poll briefly — the inline bootstrap usually defines
    // `google.maps.importLibrary` synchronously, but odd CSP /
    // extension cases can delay it.
    const start = Date.now();
    const interval = window.setInterval(() => {
      if (importLibraryReady()) {
        window.clearInterval(interval);
        setStatus({ kind: "ready" });
      } else if (Date.now() - start > 5000) {
        window.clearInterval(interval);
        setStatus({
          kind: "error",
          message:
            "google.maps.importLibrary did not appear within 5 seconds after the bootstrap loader was injected.\n" +
            "Common causes:\n" +
            "  • Browser API key is invalid or restricted incorrectly\n" +
            "  • Maps JavaScript API is not enabled in Google Cloud\n" +
            "  • Billing is not enabled on the Google Cloud project\n" +
            "  • A Content Security Policy is blocking script execution",
        });
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, [browserKey]);

  return status;
}

// Re-exported convenience: the Google namespace, or null when not
// loaded. Callers should only access this after the bootstrap status
// is `ready`.
export function getGoogleNamespace(): typeof google | null {
  return getGoogleNs();
}
