import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";

import { searchPlaces } from "../services/api";

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/**
 * Place search with suggestions while typing (ARIA combobox pattern:
 * arrow keys move through the list, Enter selects, Escape closes).
 * Suggestions come from the backend geocoder, biased towards the other end
 * of the trip through `near`.
 */
export default function PlaceSearch({ label, value, onChange, near, icon, autoFocus = false }) {
  const id = useId();
  const listId = `${id}-list`;

  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const nearRef = useRef(near);
  const query = text.trim();

  useEffect(() => {
    nearRef.current = near;
  });

  // The selected place changed from outside (swap, current location, clear).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(value?.name ?? "");
    setOpen(false);
  }, [value]);

  const typing = open && query.length >= MIN_CHARS && query !== value?.name;

  useEffect(() => {
    if (!typing) return undefined;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);

      try {
        const results = await searchPlaces(query, nearRef.current, controller.signal);
        setOptions(results);
        setHighlight(0);
      } catch (error) {
        if (error?.name !== "AbortError") {
          setOptions([]);
          setFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, typing]);

  const choose = (place) => {
    setText(place.name);
    setOpen(false);
    onChange(place);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.max(0, Math.min(options.length - 1, current + 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && open && options[highlight]) {
      event.preventDefault();
      choose(options[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  let hint = null;

  if (typing) {
    if (query.length < MIN_CHARS) hint = `Type at least ${MIN_CHARS} characters`;
    else if (failed) hint = "Search is unavailable right now";
    else if (!loading && options.length === 0) hint = "No places found";
  }

  const showList = typing && (options.length > 0 || hint || loading);

  return (
    <div className="ps">
      <label className="ps__label" htmlFor={id}>{label}</label>

      <div className="ps__field">
        <span className="ps__icon" aria-hidden="true">{icon ?? <MapPin size={16} />}</span>

        <input
          id={id}
          className="ps__input"
          type="text"
          role="combobox"
          aria-expanded={Boolean(showList)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[highlight] ? `${id}-opt-${highlight}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={label === "Start" ? "Starting point in Kerala or India" : "Destination in Kerala or India"}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => event.target.select()}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />

        {loading && <Loader2 size={16} className="ps__spinner" aria-hidden="true" />}

        {text && !loading && (
          <button
            type="button"
            className="ps__clear"
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setText("");
              setOptions([]);
              onChange(null);
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {showList && (
        <div className="ps__popup">
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className="ps__list">
            {options.map((place, index) => (
              <li
                key={place.id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === highlight}
                className="ps__option"
                data-highlighted={index === highlight}
                // mousedown, not click: the input's blur would close the list first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(place);
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                <MapPin size={16} aria-hidden="true" />
                <span className="ps__option-text">
                  <strong>{place.name}</strong>
                  {place.description && <small>{place.description}</small>}
                </span>
              </li>
            ))}
          </ul>

          {hint && <p className="ps__hint" role="status">{hint}</p>}
          {loading && options.length === 0 && <p className="ps__hint" role="status">Searching…</p>}
        </div>
      )}
    </div>
  );
}
