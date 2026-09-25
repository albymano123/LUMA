import { useState } from "react";
import { ArrowUpDown, Bike, Car, Footprints, LocateFixed, Search } from "lucide-react";

import { reverseGeocode } from "../services/api";
import { Button, IconButton, SegmentedControl, useToast } from "../ui";
import PlaceSearch from "./PlaceSearch";

const MODES = [
  { value: "walking", label: "Walk", icon: <Footprints size={17} aria-hidden="true" /> },
  { value: "cycling", label: "Cycle", icon: <Bike size={17} aria-hidden="true" /> },
  { value: "driving", label: "Drive", icon: <Car size={17} aria-hidden="true" /> },
];

const GEOLOCATION_ERRORS = {
  1: "Location permission was denied. Allow location access in your browser to use this.",
  2: "Your location is unavailable right now.",
  3: "Finding your location took too long. Please try again.",
};

export default function RouteForm({
  source, setSource, destination, setDestination, onSwap, mode, setMode, onSubmit, loading,
}) {
  const { notify } = useToast();
  const [locating, setLocating] = useState(false);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      notify("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        let description = "";

        try {
          const place = await reverseGeocode(latitude, longitude);
          description = [place.name, place.description].filter(Boolean).join(", ");
        } catch {
          // The coordinates are what matter; a missing address is fine.
        }

        setSource({
          id: `current-${latitude.toFixed(5)},${longitude.toFixed(5)}`,
          name: "Your location",
          description,
          lat: latitude,
          lon: longitude,
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        notify(GEOLOCATION_ERRORS[error.code] || "Unable to get your location.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  };

  const canSubmit = Boolean(source && destination) && !loading;

  return (
    <form
      className="rf"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="rf__fields">
        {/* the dotted connector between the two dots */}
        <div className="rf__rail" aria-hidden="true">
          <span className="rf__dot rf__dot--start" />
          <span className="rf__line" />
          <span className="rf__dot rf__dot--end" />
        </div>

        <div className="rf__inputs">
          <PlaceSearch label="Start" value={source} onChange={setSource} near={destination} autoFocus />
          <PlaceSearch label="Destination" value={destination} onChange={setDestination} near={source} />
        </div>

        <div className="rf__side">
          <IconButton label="Use my current location" variant="outline" onClick={useCurrentLocation} disabled={locating}>
            {locating ? <span className="lp-btn__spinner" aria-hidden="true" /> : <LocateFixed size={18} aria-hidden="true" />}
          </IconButton>
          <IconButton label="Swap start and destination" variant="outline" onClick={onSwap} disabled={!source && !destination}>
            <ArrowUpDown size={18} aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="rf__actions">
        <SegmentedControl label="Travel mode" options={MODES} value={mode} onChange={setMode} inline />

        <Button type="submit" loading={loading} disabled={!canSubmit && !loading} icon={<Search size={16} aria-hidden="true" />}>
          {loading ? "Analysing…" : "Find routes"}
        </Button>
      </div>
    </form>
  );
}
