// VITE_API_URL points at the API when it is hosted separately. Set it to an
// empty string when the API also serves this app (same origin); when it is
// not set at all, the local development API is used.
const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// Route analysis waits on several services; the backend caps each of them,
// so this only guards against a hung server.
const TIMEOUT_MS = 90_000;


// ==================================================
// ERRORS
// ==================================================

export class ApiError extends Error {
  constructor(message, { status = 0, requestId = null, kind = "server" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.kind = kind; // server | network | timeout
  }
}

/**
 * Turns any failure into { title, message } a user can act on, or null
 * when the request was simply cancelled (a newer one replaced it).
 * Raw server or Python errors are never shown.
 */
export function describeApiError(error) {
  if (error?.name === "AbortError") {
    return null;
  }

  if (error instanceof ApiError) {
    if (error.kind === "timeout") {
      return { title: "This is taking too long", message: "The analysis took too long. Please try again." };
    }

    if (error.kind === "network") {
      return { title: "Can't reach LumaPath", message: "Can't reach the LumaPath server. Check your connection and try again." };
    }

    if (error.status === 429) {
      return { title: "Please slow down a little", message: error.message || "Too many requests. Please wait a moment and try again." };
    }

    if (error.status === 404) {
      return { title: "No route found", message: error.message };
    }

    if (error.status === 400 || error.status === 422) {
      return { title: "Check your locations", message: error.message };
    }

    return { title: "Routes couldn't be generated", message: error.message };
  }

  return {
    title: "Routes couldn't be generated",
    message: "Something went wrong while analysing routes. Please try again.",
  };
}


// ==================================================
// TRANSPORT
// ==================================================

// An AbortSignal that fires when the caller aborts OR the timeout passes.
function withTimeout(signal, ms) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  return {
    signal: controller.signal,
    wasTimeout: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function failureFrom(response) {
  let message = "";
  let requestId = response.headers.get("X-Request-ID");

  try {
    const body = await response.json();
    message = body?.detail?.message ?? "";
    requestId = body?.detail?.request_id ?? requestId;
  } catch {
    // Not JSON: fall back to the generic message.
  }

  return new ApiError(message || "Something went wrong while analysing routes. Please try again.", {
    status: response.status,
    requestId,
  });
}

async function request(path, { method = "GET", body, signal, timeout = TIMEOUT_MS } = {}) {
  const guard = withTimeout(signal, timeout);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: guard.signal,
    });

    if (!response.ok) {
      throw await failureFrom(response);
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error?.name === "AbortError") {
      if (guard.wasTimeout()) throw new ApiError("The analysis took too long.", { kind: "timeout" });
      throw error;
    }

    throw new ApiError("Network error", { kind: "network" });
  } finally {
    guard.done();
  }
}


// ==================================================
// SAFE ROUTE
// ==================================================

const routeBody = (source, destination, mode) => ({
  source_lat: source.lat,
  source_lon: source.lon,
  destination_lat: destination.lat,
  destination_lon: destination.lon,
  mode,
});

/**
 * Analyses a trip. The backend streams what it has really finished
 * (routes found, weather checked, map data loaded), reported through
 * onProgress({event, ...}); the promise resolves with the full result.
 * Falls back to the plain endpoint if streaming is unavailable.
 */
export async function getSafeRoute(source, destination, mode, { signal, onProgress } = {}) {
  const body = routeBody(source, destination, mode);
  const guard = withTimeout(signal, TIMEOUT_MS);

  try {
    let response;

    try {
      response = await fetch(`${API_URL}/safe-route/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: guard.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new ApiError("Network error", { kind: "network" });
    }

    // An older backend without streaming: use the plain endpoint.
    if (response.status === 404 || response.status === 405 || !response.body?.getReader) {
      const plain = await request("/safe-route", { method: "POST", body, signal: guard.signal });
      return await plain.json();
    }

    if (!response.ok) {
      throw await failureFrom(response);
    }

    return await readEvents(response, onProgress);
  } catch (error) {
    if (error?.name === "AbortError" && guard.wasTimeout()) {
      throw new ApiError("The analysis took too long.", { kind: "timeout" });
    }

    throw error;
  } finally {
    guard.done();
  }
}

async function readEvents(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let result = null;

  const handle = (line) => {
    if (!line.trim()) return;

    const event = JSON.parse(line);

    if (event.event === "result") {
      result = event.data;
    } else if (event.event === "error") {
      throw new ApiError(event.message, { status: event.status, requestId: event.request_id });
    } else {
      onProgress?.(event);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    buffered += decoder.decode(value, { stream: true });

    const lines = buffered.split("\n");
    buffered = lines.pop();
    lines.forEach(handle);
  }

  handle(buffered);

  if (!result) {
    throw new ApiError("The analysis ended unexpectedly.", { status: 502 });
  }

  return result;
}


// ==================================================
// PLACE SEARCH
// ==================================================

// The backend tries Photon first (two calls run together, each capped at
// 8s), then falls back to Nominatim (another 8s) if Photon fails - so a
// legitimately slow-but-successful search can take close to 16s. This has
// to clear that with margin, or a real, correctly Kerala-first result gets
// thrown away client-side and shown as "search unavailable".
export const searchPlaces = async (query, near, signal) => {
  const params = new URLSearchParams({ q: query });

  if (near?.lat != null) {
    params.set("lat", near.lat);
    params.set("lon", near.lon);
  }

  const response = await request(`/geocode/search?${params}`, { signal, timeout: 20_000 });

  return (await response.json()).results;
};

export const reverseGeocode = async (lat, lon) => {
  const response = await request(`/geocode/reverse?lat=${lat}&lon=${lon}`, { timeout: 12_000 });

  return response.json();
};

// Small, cached description of the map data (for the landing page).
let healthPromise;

export function getHealth() {
  healthPromise ??= request("/health", { timeout: 8_000 }).then((response) => response.json());

  return healthPromise.catch((error) => {
    healthPromise = undefined;
    throw error;
  });
}
