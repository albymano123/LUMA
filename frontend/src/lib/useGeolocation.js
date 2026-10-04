import { useEffect, useRef, useState } from "react";

const IDLE = { position: null, accuracy: null, heading: null, speed: null, status: "idle", error: null };

/**
 * Wraps navigator.geolocation.watchPosition - never getCurrentPosition on
 * a timer, so position updates arrive as the browser's own GPS/network
 * provider reports movement, not on an artificial poll. Starts only while
 * `active` is true, and always clears the watch when it becomes false or
 * this hook unmounts: a live location watch should never outlive the
 * feature that asked for it (battery, privacy).
 *
 * Returns { position: {lat, lon} | null, accuracy, heading, speed, status, error }.
 *   status: idle | requesting | active | denied | unavailable | unsupported
 *
 * `onPosition(position, coords)` / `onError(error)`, if given, fire from
 * the browser's own native callback each time it reports - the right
 * place for a caller (useNavigation) to react to a real fix with more
 * state updates of its own, rather than adding a second effect that
 * watches this hook's returned state (which would just be reacting to a
 * render instead of the real event, one hop later).
 */
export function useGeolocation(active, { onPosition, onError } = {}) {
  const [state, setState] = useState(IDLE);
  const watchId = useRef(null);
  const onPositionRef = useRef(onPosition);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onPositionRef.current = onPosition;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!active) {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(IDLE);

      return undefined;
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ ...IDLE, status: "unsupported", error: "This browser does not support location." });
      return undefined;
    }

    setState((current) => ({ ...current, status: "requesting", error: null }));

    const handlePosition = (raw) => {
      const next = {
        position: { lat: raw.coords.latitude, lon: raw.coords.longitude },
        accuracy: raw.coords.accuracy,
        heading: Number.isFinite(raw.coords.heading) ? raw.coords.heading : null,
        speed: Number.isFinite(raw.coords.speed) ? raw.coords.speed : null,
        status: "active",
        error: null,
      };

      setState(next);
      onPositionRef.current?.(next, raw.coords);
    };

    const handleError = (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        setState((current) => ({ ...current, status: "denied", error: "Location access was denied. Allow location access to start navigation." }));
      } else {
        // A transient timeout/unavailable while a fix is already in hand is
        // not worth alarming the user over; only surface it as an error
        // state when there has never been a position to show.
        setState((current) => current.position
          ? current
          : { ...current, status: "unavailable", error: error.code === error.TIMEOUT
              ? "Getting your location is taking longer than usual."
              : "Your location is temporarily unavailable." });
      }

      onErrorRef.current?.(error);
    };

    watchId.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    });

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [active]);

  return state;
}
