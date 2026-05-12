"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Browser autocomplete for Google Places.
//
// Strategy:
//   1. Inject Google's official inline bootstrap loader via direct DOM
//      append (no next/script). This defines `google.maps.importLibrary`
//      synchronously and lets the actual Maps JS bundle stream in only
//      when a library is requested.
//   2. Defensively remove the old next/script-injected `<Script
//      id="google-maps-js">` tag if it's still present (HMR survivor).
//   3. Use a fresh script id so the bootstrap loader is not deduped
//      against any previous Maps tag.
//   4. Call `google.maps.importLibrary('places')` to pick whichever
//      autocomplete API is enabled — `PlaceAutocompleteElement` (Places
//      API New) preferred, legacy `Autocomplete` fallback.
//   5. Surface a distinct, actionable error message for each failure
//      mode (missing key, bootstrap injection failed, importLibrary
//      never appeared, library import threw, no autocomplete
//      constructor exposed, selection event missing place id).
// ---------------------------------------------------------------------------

export type SelectedPlace = {
  placeId: string;
  formattedAddress: string;
};

type Props = {
  onSelect: (place: SelectedPlace) => void;
  onSelectError?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  countryCodes?: string[];
};

const BOOTSTRAP_ID = "google-maps-bootstrap-v2";
const LEGACY_SCRIPT_ID = "google-maps-js"; // pre-fix id, removed if present

type BootstrapStatus =
  | { kind: "pending" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

type LibraryStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "new" }
  | { kind: "legacy" }
  | { kind: "error"; message: string };

type PlaceLike = {
  id?: string;
  placeId?: string;
  formattedAddress?: string;
  displayName?: string | { text?: string };
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
};

type PlacePredictionLike = {
  toPlace: () => PlaceLike;
};

type PlaceAutocompleteCtor = new (
  opts: Record<string, unknown>,
) => HTMLElement;

type LegacyAutocompleteCtor = new (
  input: HTMLInputElement,
  opts: Record<string, unknown>,
) => {
  addListener: (
    eventName: string,
    handler: () => void,
  ) => google.maps.MapsEventListener;
  getPlace: () => { place_id?: string; formatted_address?: string };
};

type PlacesLibrary = {
  PlaceAutocompleteElement?: PlaceAutocompleteCtor;
  Autocomplete?: LegacyAutocompleteCtor;
};

function getGoogle(): typeof google | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { google?: typeof google }).google ?? null;
}

function importLibraryReady(): boolean {
  return typeof getGoogle()?.maps?.importLibrary === "function";
}

// Google's official inline bootstrap loader, parameterized with the
// provided API key. Single-quoted outer string so the inner template
// literal (a.src=`https://maps.${c}apis.com/...`) survives unchanged.
// Source: developers.google.com/maps/documentation/javascript/load-maps-js-api
function buildBootstrapSource(apiKey: string): string {
  const params = JSON.stringify({ key: apiKey, v: "weekly" });
  // prettier-ignore
  return '(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})(' + params + ');';
}

export function GoogleAutocomplete({
  onSelect,
  onSelectError,
  placeholder = "Start typing an address…",
  disabled = false,
  countryCodes = ["us"],
}: Props) {
  const newContainerRef = useRef<HTMLDivElement>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);

  const [bootstrap, setBootstrap] = useState<BootstrapStatus>({
    kind: "pending",
  });
  const [library, setLibrary] = useState<LibraryStatus>({ kind: "idle" });
  const [selectError, setSelectError] = useState<string | null>(null);

  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

  // -------------------------------------------------------------------
  // Inject the inline bootstrap loader exactly once per page.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!browserKey || browserKey.trim().length === 0) {
      setBootstrap({
        kind: "error",
        message:
          "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is missing or empty. Add it to .env.local and restart the dev server.",
      });
      return;
    }

    // Defensively remove the pre-fix Maps script tag if a previous build
    // injected it via next/script. Without removing it, the cached
    // libraries=places URL would otherwise live alongside ours.
    const legacy = document.getElementById(LEGACY_SCRIPT_ID);
    if (legacy && legacy.parentNode) {
      legacy.parentNode.removeChild(legacy);
    }

    // Already bootstrapped (remount on the same page).
    if (importLibraryReady()) {
      setBootstrap({ kind: "ready" });
      return;
    }

    // Inject the bootstrap loader if it isn't on the page yet.
    if (!document.getElementById(BOOTSTRAP_ID)) {
      try {
        const script = document.createElement("script");
        script.id = BOOTSTRAP_ID;
        script.textContent = buildBootstrapSource(browserKey);
        document.head.appendChild(script);
      } catch (err) {
        setBootstrap({
          kind: "error",
          message:
            err instanceof Error
              ? `Failed to inject the Maps JS bootstrap loader: ${err.message}`
              : "Failed to inject the Maps JS bootstrap loader.",
        });
        return;
      }
    }

    // The inline bootstrap defines google.maps.importLibrary
    // synchronously during append, so this is normally true on the next
    // line. Poll briefly to be safe (e.g. odd CSP / extension cases).
    if (importLibraryReady()) {
      setBootstrap({ kind: "ready" });
      return;
    }

    const start = Date.now();
    const interval = window.setInterval(() => {
      if (importLibraryReady()) {
        window.clearInterval(interval);
        setBootstrap({ kind: "ready" });
      } else if (Date.now() - start > 5000) {
        window.clearInterval(interval);
        setBootstrap({
          kind: "error",
          message:
            "google.maps.importLibrary did not appear within 5 seconds after the bootstrap loader was injected.\n" +
            "Common causes:\n" +
            "  • Browser API key is invalid or restricted incorrectly (referrer / API restrictions)\n" +
            "  • Maps JavaScript API is not enabled on the Google Cloud project\n" +
            "  • Billing is not enabled on the Google Cloud project\n" +
            "  • A Content Security Policy is blocking script execution",
        });
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, [browserKey]);

  // -------------------------------------------------------------------
  // After bootstrap is ready, import the places library and detect API.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (bootstrap.kind !== "ready") return;
    let cancelled = false;

    setLibrary({ kind: "loading" });

    (async () => {
      const g = getGoogle();
      const importLib = g?.maps?.importLibrary;
      if (!importLib) {
        if (!cancelled) {
          setLibrary({
            kind: "error",
            message:
              "google.maps.importLibrary disappeared after the bootstrap reported ready.",
          });
        }
        return;
      }

      try {
        const lib = (await importLib("places")) as PlacesLibrary;
        if (cancelled) return;
        if (typeof lib.PlaceAutocompleteElement === "function") {
          setLibrary({ kind: "new" });
        } else if (typeof lib.Autocomplete === "function") {
          setLibrary({ kind: "legacy" });
        } else {
          setLibrary({
            kind: "error",
            message:
              "Places library loaded but exposed no autocomplete API. " +
              "Enable Places API (New) on the Google Cloud project.",
          });
        }
      } catch (err) {
        if (cancelled) return;
        const reason = err instanceof Error ? err.message : String(err);
        setLibrary({
          kind: "error",
          message:
            `Failed to load the Google Places library.\n` +
            `Reason: ${reason}\n` +
            `Common causes:\n` +
            `  • Browser API key restricted incorrectly\n` +
            `  • Places API (New) is not enabled in Google Cloud\n` +
            `  • Browser-key HTTP-referrer restriction excludes this host\n` +
            `  • Billing is not enabled on the Google Cloud project`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrap.kind]);

  // -------------------------------------------------------------------
  // Mount PlaceAutocompleteElement (Places API — New)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (library.kind !== "new" || !newContainerRef.current) return;

    const g = getGoogle();
    const placesNs = (g?.maps?.places ?? {}) as PlacesLibrary;
    const Ctor = placesNs.PlaceAutocompleteElement;
    if (!Ctor) return;

    const element = new Ctor({ includedRegionCodes: countryCodes });
    element.style.width = "100%";

    const container = newContainerRef.current;
    container.replaceChildren(element);

    const handler = async (event: Event) => {
      const e = event as Event & {
        placePrediction?: PlacePredictionLike;
      };
      const prediction = e.placePrediction;
      if (!prediction || typeof prediction.toPlace !== "function") {
        const msg = "Place prediction missing in the selection event.";
        setSelectError(msg);
        onSelectError?.(msg);
        return;
      }
      const place = prediction.toPlace();
      try {
        await place.fetchFields({
          fields: ["id", "formattedAddress", "displayName"],
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        setSelectError(`fetchFields failed: ${reason}`);
        onSelectError?.(reason);
        return;
      }
      const placeId = place.id ?? place.placeId;
      const display =
        place.formattedAddress ??
        (typeof place.displayName === "string"
          ? place.displayName
          : place.displayName?.text) ??
        "";
      if (!placeId) {
        const msg = "Selection returned no place id.";
        setSelectError(msg);
        onSelectError?.(msg);
        return;
      }
      setSelectError(null);
      onSelect({ placeId, formattedAddress: display });
    };

    element.addEventListener("gmp-select", handler);

    return () => {
      element.removeEventListener("gmp-select", handler);
      element.remove();
    };
  }, [library.kind, countryCodes, onSelect, onSelectError]);

  // -------------------------------------------------------------------
  // Mount legacy Autocomplete widget (Places API — Legacy fallback)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (library.kind !== "legacy" || !legacyInputRef.current) return;
    const g = getGoogle();
    const placesNs = (g?.maps?.places ?? {}) as PlacesLibrary;
    const Ctor = placesNs.Autocomplete;
    if (!Ctor) return;

    const ac = new Ctor(legacyInputRef.current, {
      types: ["address"],
      fields: ["place_id", "formatted_address"],
      componentRestrictions: { country: countryCodes },
    });

    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const placeId = place?.place_id;
      const formattedAddress = place?.formatted_address;
      if (!placeId || !formattedAddress) {
        const msg = "Please pick an address from the dropdown.";
        setSelectError(msg);
        onSelectError?.(msg);
        return;
      }
      setSelectError(null);
      onSelect({ placeId, formattedAddress });
    });

    return () => {
      const ev = getGoogle()?.maps?.event;
      if (ev) ev.removeListener(listener);
    };
  }, [library.kind, countryCodes, onSelect, onSelectError]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  if (bootstrap.kind === "error") {
    return (
      <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
        {bootstrap.message}
      </pre>
    );
  }

  return (
    <div className="space-y-1">
      {library.kind === "new" && (
        <div ref={newContainerRef} className="w-full" />
      )}

      {library.kind === "legacy" && (
        <input
          ref={legacyInputRef}
          type="text"
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/10 disabled:bg-gray-50 disabled:text-gray-500"
          autoComplete="off"
        />
      )}

      {(library.kind === "idle" || library.kind === "loading") && (
        <input
          type="text"
          placeholder="Loading address suggestions…"
          disabled
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-500"
        />
      )}

      {library.kind === "error" && (
        <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap">
          {library.message}
        </pre>
      )}

      {selectError && <p className="text-xs text-red-600">{selectError}</p>}
    </div>
  );
}
