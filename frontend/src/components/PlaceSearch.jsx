import { useEffect, useState } from "react";

import {
  Autocomplete,
  Box,
  CircularProgress,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";

import { searchPlaces } from "../services/api";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

// Place search with suggestions while typing. Suggestions come from
// the backend (/geocode/search), which proxies an OSM geocoder built
// for autocomplete and caches results.
function PlaceSearch({
  label,
  value,
  onChange,
  near,
  startIcon,
  autoFocus = false,
}) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const query = inputValue.trim();
  const typedEnough = query.length >= MIN_CHARS;

  // Showing the selected place's own name is not a new search.
  const isSelectedLabel = value && inputValue === value.name;

  useEffect(() => {
    if (!typedEnough || isSelectedLabel) {
      return undefined;
    }

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchFailed(false);

      try {
        const results = await searchPlaces(query, near, controller.signal);
        setOptions(results);
      } catch {
        if (!controller.signal.aborted) {
          setOptions([]);
          setSearchFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `near` only biases results; re-searching when the other end of
    // the trip changes would be surprising, so it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typedEnough, isSelectedLabel]);

  let noOptionsText = "No places found";

  if (!typedEnough) {
    noOptionsText = `Type at least ${MIN_CHARS} characters`;
  } else if (searchFailed) {
    noOptionsText = "Search is unavailable right now";
  }

  return (
    <Autocomplete
      value={value}
      onChange={(_, place) => onChange(place)}
      inputValue={inputValue}
      onInputChange={(_, text) => setInputValue(text)}
      options={value && !options.includes(value) ? [value, ...options] : options}
      // Results are already filtered by the geocoder.
      filterOptions={(items) => items}
      getOptionLabel={(place) => place?.name ?? ""}
      // Different places can share a name ("Ernakulam South").
      getOptionKey={(place) => place.id}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      loading={loading}
      noOptionsText={noOptionsText}
      loadingText="Searching…"
      autoHighlight
      fullWidth
      renderOption={(props, place) => {
        const { key, ...optionProps } = props;

        return (
          <Box
            component="li"
            key={key}
            {...optionProps}
            sx={{ display: "flex", gap: 1.5, alignItems: "flex-start !important" }}
          >
            <PlaceOutlinedIcon
              fontSize="small"
              sx={{ color: "text.secondary", mt: 0.25 }}
            />

            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {place.name}
              </Typography>

              {place.description && (
                <Typography variant="caption" color="text.secondary" noWrap component="p">
                  {place.description}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          autoFocus={autoFocus}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  {loading ? <CircularProgress size={16} /> : startIcon}
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
  );
}

export default PlaceSearch;
