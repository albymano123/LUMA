import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, describeApiError, getSafeRoute, searchPlaces } from "./api";

const SOURCE = { lat: 10.3, lon: 76.3 };
const DESTINATION = { lat: 10.4, lon: 76.4 };
const RESULT = { routes: [{ id: "route-1" }], recommendation: { state: "single" } };

// A streaming Response whose chunks arrive exactly as given.
function streamed(chunks, init = {}) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" }, ...init }
  );
}

const line = (event) => JSON.stringify(event) + "\n";

function mockFetch(handler) {
  const fetchMock = vi.fn(handler);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSafeRoute (streaming)", () => {
  it("reports each stage as it arrives, then resolves with the result", async () => {
    mockFetch(async () =>
      streamed([
        line({ event: "routes", count: 5 }),
        line({ event: "weather", available: true }),
        line({ event: "map_data", source: "local", emergency_services: true }),
        line({ event: "result", data: RESULT }),
      ])
    );

    const seen = [];
    const result = await getSafeRoute(SOURCE, DESTINATION, "walking", { onProgress: (event) => seen.push(event.event) });

    expect(seen).toEqual(["routes", "weather", "map_data"]);
    expect(result).toEqual(RESULT);
  });

  it("asks the streaming endpoint with the trip and mode", async () => {
    const fetchMock = mockFetch(async () => streamed([line({ event: "result", data: RESULT })]));

    await getSafeRoute(SOURCE, DESTINATION, "cycling");

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toMatch(/\/safe-route\/stream$/);
    expect(JSON.parse(options.body)).toEqual({
      source_lat: 10.3, source_lon: 76.3, destination_lat: 10.4, destination_lon: 76.4, mode: "cycling",
    });
  });

  it("copes with events split across network chunks", async () => {
    const whole = line({ event: "routes", count: 2 }) + line({ event: "result", data: RESULT });

    mockFetch(async () => streamed([whole.slice(0, 9), whole.slice(9, 40), whole.slice(40)]));

    const seen = [];
    const result = await getSafeRoute(SOURCE, DESTINATION, "walking", { onProgress: (event) => seen.push(event) });

    expect(seen).toEqual([{ event: "routes", count: 2 }]);
    expect(result).toEqual(RESULT);
  });

  it("turns an error event into an ApiError carrying the backend's friendly message", async () => {
    mockFetch(async () =>
      streamed([
        line({ event: "routes", count: 1 }),
        line({ event: "error", status: 502, message: "Route analysis took too long. Please try again.", request_id: "abc123" }),
      ])
    );

    await expect(getSafeRoute(SOURCE, DESTINATION, "walking")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Route analysis took too long. Please try again.",
      requestId: "abc123",
    });
  });

  it("reads the message from an HTTP error (rate limit, validation)", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ detail: { message: "Too many requests. Please wait a moment and try again." } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "X-Request-ID": "req9" },
      })
    );

    await expect(getSafeRoute(SOURCE, DESTINATION, "walking")).rejects.toMatchObject({
      status: 429,
      message: "Too many requests. Please wait a moment and try again.",
    });
  });

  it("never leaks a non-JSON error body", async () => {
    mockFetch(async () => new Response("<html>Traceback (most recent call last)</html>", { status: 500 }));

    const error = await getSafeRoute(SOURCE, DESTINATION, "walking").catch((failure) => failure);

    expect(error.message).not.toMatch(/Traceback|html/i);
    expect(describeApiError(error).message).not.toMatch(/Traceback|html/i);
  });

  it("fails clearly when the stream ends without a result", async () => {
    mockFetch(async () => streamed([line({ event: "routes", count: 3 })]));

    await expect(getSafeRoute(SOURCE, DESTINATION, "walking")).rejects.toMatchObject({ status: 502 });
  });

  it("reports an unreachable server as a network error", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await getSafeRoute(SOURCE, DESTINATION, "walking").catch((failure) => failure);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe("network");
  });

  it("falls back to the plain endpoint when streaming is not offered", async () => {
    const fetchMock = mockFetch(async (url) =>
      url.endsWith("/stream")
        ? new Response("not found", { status: 404 })
        : new Response(JSON.stringify(RESULT), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const result = await getSafeRoute(SOURCE, DESTINATION, "walking");

    expect(result).toEqual(RESULT);
    expect(fetchMock.mock.calls.map(([url]) => url.split("/safe-route")[1])).toEqual(["/stream", ""]);
  });

  it("stays silent when the request is cancelled by a newer one", async () => {
    const controller = new AbortController();

    mockFetch((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
    );

    const pending = getSafeRoute(SOURCE, DESTINATION, "walking", { signal: controller.signal });
    controller.abort();

    const error = await pending.catch((failure) => failure);

    expect(error.name).toBe("AbortError");
    expect(describeApiError(error)).toBeNull();
  });
});

describe("describeApiError", () => {
  it("gives every failure a title and a message a person can act on", () => {
    const cases = [
      [new ApiError("Too many requests. Please wait a moment and try again.", { status: 429 }), "Please slow down a little"],
      [new ApiError("No route could be found between these locations.", { status: 404 }), "No route found"],
      [new ApiError("Start and destination are the same place.", { status: 400 }), "Check your locations"],
      [new ApiError("Those locations could not be read.", { status: 422 }), "Check your locations"],
      [new ApiError("The routing service is unavailable right now.", { status: 502 }), "Routes couldn't be generated"],
      [new ApiError("x", { kind: "network" }), "Can't reach LumaPath"],
      [new ApiError("x", { kind: "timeout" }), "This is taking too long"],
      [new Error("anything unexpected"), "Routes couldn't be generated"],
    ];

    for (const [error, title] of cases) {
      const described = describeApiError(error);

      expect(described.title).toBe(title);
      expect(described.message).toBeTruthy();
      expect(described.message).not.toMatch(/anything unexpected|TypeError|undefined/);
    }
  });

  it("keeps the backend's own friendly message when it sent one", () => {
    const described = describeApiError(new ApiError("No route could be found between these locations.", { status: 404 }));

    expect(described.message).toBe("No route could be found between these locations.");
  });
});

describe("searchPlaces", () => {
  it("passes the query and the bias, and returns the results", async () => {
    const fetchMock = mockFetch(async () =>
      new Response(JSON.stringify({ results: [{ id: "N1", name: "Chalakudy" }] }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const results = await searchPlaces("Chalak", { lat: 10.3, lon: 76.3 });
    const url = new URL(fetchMock.mock.calls[0][0]);

    expect(results).toEqual([{ id: "N1", name: "Chalakudy" }]);
    expect(url.pathname).toBe("/geocode/search");
    expect(url.searchParams.get("q")).toBe("Chalak");
    expect(url.searchParams.get("lat")).toBe("10.3");
  });

  it("omits the bias when there is none", async () => {
    const fetchMock = mockFetch(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await searchPlaces("Chalak", null);

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has("lat")).toBe(false);
  });
});
