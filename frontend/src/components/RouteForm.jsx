import { useState } from "react";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import DirectionsBikeIcon from "@mui/icons-material/DirectionsBike";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import DirectionsWalkIcon from "@mui/icons-material/DirectionsWalk";
import FlagIcon from "@mui/icons-material/Flag";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import SearchIcon from "@mui/icons-material/Search";

import PlaceSearch from "./PlaceSearch";
import { reverseGeocode } from "../services/api";

const TRAVEL_MODES = [
  { value: "walking", label: "Walk", icon: <DirectionsWalkIcon fontSize="small" /> },
  { value: "cycling", label: "Cycle", icon: <DirectionsBikeIcon fontSize="small" /> },
  { value: "driving", label: "Drive", icon: <DirectionsCarIcon fontSize="small" /> },
];

const GEOLOCATION_ERRORS = {
  1: "Location permission was denied. Allow location access in your browser to use this.",
  2: "Your location is unavailable right now.",
  3: "Finding your location took too long. Please try again.",
};

function RouteForm({
  source,
  setSource,
  destination,
  setDestination,
  onSwap,
  mode,
  setMode,
  onSubmit,
  loading,
  onError,
}) {
  const [locating, setLocating] = useState(false);

  // Current Location
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      onError("Geolocation is not supported by your browser.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        let description = "";

        try {
          const place = await reverseGeocode(latitude, longitude);
          description = [place.name, place.description]
            .filter(Boolean)
            .join(", ");
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
        onError(GEOLOCATION_ERRORS[error.code] || "Unable to get your location.");
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const canSubmit = Boolean(source && destination) && !loading;

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) {
          onSubmit();
        }
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <PlaceSearch
              label="Start"
              value={source}
              onChange={setSource}
              near={destination}
              autoFocus
              startIcon={
                <RadioButtonCheckedIcon sx={{ fontSize: 18, color: "#16a34a" }} />
              }
            />

            <Tooltip title="Use my current location">
              <span>
                <IconButton
                  aria-label="Use my current location"
                  onClick={handleCurrentLocation}
                  disabled={locating}
                  size="small"
                  color="primary"
                >
                  {locating ? <CircularProgress size={18} /> : <MyLocationIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <PlaceSearch
              label="Destination"
              value={destination}
              onChange={setDestination}
              near={source}
              startIcon={<FlagIcon sx={{ fontSize: 18, color: "#dc2626" }} />}
            />

            <Tooltip title="Swap start and destination">
              <span>
                <IconButton
                  aria-label="Swap start and destination"
                  onClick={onSwap}
                  disabled={!source && !destination}
                  size="small"
                >
                  <SwapVertIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 1.5, alignItems: "center", justifyContent: "space-between" }}
      >
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_, value) => value && setMode(value)}
          aria-label="Travel mode"
        >
          {TRAVEL_MODES.map((option) => (
            <ToggleButton
              key={option.value}
              value={option.value}
              aria-label={option.label}
              sx={{ px: 1.25, gap: 0.5, textTransform: "none" }}
            >
              {option.icon}
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {option.label}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Button
          type="submit"
          variant="contained"
          disabled={!canSubmit}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
        >
          {loading ? "Analysing…" : "Find routes"}
        </Button>
      </Stack>
    </Box>
  );
}

export default RouteForm;
