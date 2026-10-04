import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../ui";
import AnalysisProgress from "./AnalysisProgress";
import BottomSheet from "./BottomSheet";
import EmergencyList from "./EmergencyList";
import { EnvironmentPanel, MlStatus } from "./EnvironmentPanel";
import PlaceSearch from "./PlaceSearch";
import RouteDetails from "./RouteDetails";
import RouteList from "./RouteList";
import WeatherCard from "./WeatherCard";
import { makeResponse, makeRoute } from "../test/fixtures";

vi.mock("../services/api", () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}));

import { searchPlaces } from "../services/api";


// ==================== route list ====================

function renderList({ data = makeResponse(), selectedId = "route-2", preference = null } = {}) {
  const onSelectRoute = vi.fn();
  const onSelectPreference = vi.fn();

  render(
    <RouteList
      data={data}
      selectedId={selectedId}
      preference={preference}
      onSelectRoute={onSelectRoute}
      onSelectPreference={onSelectPreference}
    />
  );

  return { onSelectRoute, onSelectPreference };
}

const card = (name) => screen.getByRole("button", { name: new RegExp(name) });

describe("RouteList", () => {
  it("shows every route with its real score, time and distance", () => {
    renderList();

    expect(card("Route A")).toHaveTextContent("Safety score 61 out of 100");
    expect(card("Route B")).toHaveTextContent("Safety score 84 out of 100");
    expect(card("Route B")).toHaveTextContent("58 min");
    expect(card("Route B")).toHaveTextContent("4.6 km");
  });

  it("labels only the recommended route as Recommended, and only the chosen one as Selected", () => {
    renderList({ selectedId: "route-1" });

    expect(within(card("Route B")).getByText("Recommended")).toBeInTheDocument();
    expect(within(card("Route B")).queryByText("Selected")).not.toBeInTheDocument();
    expect(within(card("Route A")).getByText("Selected")).toBeInTheDocument();
    expect(within(card("Route A")).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("never says Recommended when the backend cannot defend a safest route", () => {
    renderList({ data: makeResponse({ state: "unavailable" }), selectedId: "route-1" });

    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("uses the backend's wording for a single route", () => {
    const single = makeResponse({ state: "single", routes: [makeRoute({ id: "route-1", categories: ["fastest", "safest"] })] });
    single.recommendation.route_id = "route-1";

    renderList({ data: single, selectedId: "route-1" });

    expect(screen.getByText("Only route found")).toBeInTheDocument();
  });

  it("shows the risk in words on every card, not by colour alone", () => {
    renderList();

    expect(card("Route A")).toHaveTextContent("Moderate risk");
    expect(card("Route B")).toHaveTextContent("Lower risk");
  });

  it("shows the strongest available factors and never an unavailable one", () => {
    renderList();

    const selected = card("Route B");

    expect(selected).toHaveTextContent("Emergency");
    expect(selected).toHaveTextContent("Weather");
    // Lighting has no data in the fixture, so it cannot appear as a chip.
    expect(selected).not.toHaveTextContent("Lighting");
  });

  it("selects a route when its card is clicked", async () => {
    const { onSelectRoute } = renderList();

    await userEvent.click(card("Route C"));

    expect(onSelectRoute).toHaveBeenCalledWith("route-3");
  });

  it("asks for a preference when its button is clicked", async () => {
    const { onSelectPreference } = renderList();

    await userEvent.click(screen.getByRole("button", { name: "Time-efficient" }));

    expect(onSelectPreference).toHaveBeenCalledWith("fastest");
  });

  it("keeps the chosen preference active when one route holds several tags", () => {
    const both = makeResponse({
      routes: [
        makeRoute({ id: "route-1", duration_min: 40, safety_score: 90, categories: ["fastest", "safest", "balanced"] }),
        makeRoute({ id: "route-2", duration_min: 55, safety_score: 70 }),
      ],
    });

    renderList({ data: both, selectedId: "route-1", preference: "fastest" });

    expect(screen.getByRole("button", { name: "Time-efficient" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Safest" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables a preference that no route holds", () => {
    const noSafest = makeResponse({
      state: "unavailable",
      routes: [makeRoute({ id: "route-1", safety_score: null, risk_level: "Insufficient data", data_confidence: "low", categories: ["fastest"] })],
    });

    renderList({ data: noSafest, selectedId: "route-1" });

    expect(screen.getByRole("button", { name: "Safest" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Balanced" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Time-efficient" })).toBeEnabled();
  });

  it("shows a dash, not a made-up number, when a route has no score", () => {
    const unscored = makeResponse({
      state: "unavailable",
      routes: [makeRoute({ id: "route-1", safety_score: null, risk_level: "Insufficient data", data_confidence: "low", categories: ["fastest"] })],
    });

    renderList({ data: unscored, selectedId: "route-1" });

    expect(card("Route A")).toHaveTextContent("No safety score");
    expect(card("Route A")).toHaveTextContent("Insufficient data");
    expect(card("Route A")).not.toHaveTextContent(/confidence/);
  });

  it("explains what the active preference means", () => {
    renderList({ preference: "safest" });

    expect(screen.getByText(/Scores within 2 points count as equal/)).toBeInTheDocument();
  });
});


// ==================== route details ====================

function renderDetails({ state = "recommended", selected = "route-2", preference = null, mutate, onStartNavigation } = {}) {
  const data = makeResponse({ state });
  mutate?.(data);
  const route = data.routes.find((item) => item.id === selected);

  render(
    <RouteDetails
      route={route}
      recommendation={data.recommendation}
      preference={preference}
      routes={data.routes}
      dataSources={data.data_sources}
      geoSource={data.geo_source}
      disclaimer={data.disclaimer}
      onFocusService={() => {}}
      onStartNavigation={onStartNavigation}
    />
  );
}

describe("RouteDetails", () => {
  it("explains why the recommended route is recommended", () => {
    renderDetails();

    expect(screen.getByText("Safest recommendation")).toBeInTheDocument();
    expect(screen.getByText(/12 points ahead/)).toBeInTheDocument();
    expect(screen.queryByTestId("not-recommended-note")).not.toBeInTheDocument();
  });

  it("points to the recommended route when another route is selected", () => {
    renderDetails({ selected: "route-1", preference: "fastest" });

    const note = screen.getByTestId("not-recommended-note");

    expect(note).toHaveTextContent("You chose Time-efficient");
    expect(note).toHaveTextContent("Route B");
    expect(note).toHaveTextContent("84/100");
    expect(note).toHaveTextContent("61/100");
    expect(screen.queryByText("Safest recommendation")).not.toBeInTheDocument();
  });

  it("does not mention a recommendation when none can be defended", () => {
    renderDetails({ state: "unavailable", selected: "route-1" });

    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("Safest recommendation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("not-recommended-note")).not.toBeInTheDocument();
  });

  it("shows the backend's score and reasons unchanged", () => {
    renderDetails();

    expect(screen.getByRole("img", { name: "Safety score 84 out of 100" })).toBeInTheDocument();
    expect(screen.getByText(/Good mapped availability of hospitals/)).toBeInTheDocument();
    expect(screen.getByText(/not mapped for most of this route/)).toBeInTheDocument();
  });

  it("offers Start navigation only when a handler is given (a source and destination are set)", async () => {
    const user = userEvent.setup();
    const onStartNavigation = vi.fn();
    renderDetails({ onStartNavigation });

    const button = screen.getByRole("button", { name: /start navigation/i });
    await user.click(button);

    expect(onStartNavigation).toHaveBeenCalledTimes(1);
  });

  it("hides Start navigation when there is nowhere to navigate to yet", () => {
    renderDetails();

    expect(screen.queryByRole("button", { name: /start navigation/i })).not.toBeInTheDocument();
  });

  it("lists every factor, and says which have no data", () => {
    renderDetails();

    expect(screen.getByRole("progressbar", { name: "Emergency access: 80/100" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Street lighting: Data unavailable" })).toBeInTheDocument();
  });

  it("shows the confidence and what it means", () => {
    renderDetails();

    expect(screen.getByText("High confidence")).toBeInTheDocument();
  });

  it("says plainly when a route has no score", () => {
    renderDetails({
      state: "unavailable",
      selected: "route-1",
      mutate: (data) => {
        Object.assign(data.routes[0], { safety_score: null, risk_level: "Insufficient data", data_confidence: "low" });
      },
    });

    expect(screen.getByText("No safety score for this route")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "No safety score" })).toBeInTheDocument();
  });

  it("never claims a route is guaranteed safe", () => {
    renderDetails();

    expect(document.body.textContent.toLowerCase()).not.toMatch(/guaranteed safe|100% safe|completely safe/);
    expect(screen.getByText(/not a guarantee of safety/)).toBeInTheDocument();
  });

  it("credits the map data source", () => {
    renderDetails();

    expect(screen.getByText(/OpenStreetMap extract \(Kerala, India\), extract dated 2026-09-23/)).toBeInTheDocument();
  });

  it("shows no counts when emergency data could not be loaded", () => {
    renderDetails({ mutate: (data) => { data.data_sources.emergency_services = false; } });

    expect(screen.getAllByText("No data").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/could not be loaded right now/)).toBeInTheDocument();
  });
});


// ==================== emergency list ====================

describe("EmergencyList", () => {
  const services = makeRoute().emergency_services;

  it("shows hours, phone and emergency department only where they were mapped", () => {
    render(<EmergencyList services={services} available radiusKm={2} onFocus={() => {}} />);

    const list = screen.getByRole("list");

    expect(within(list).getByText("Test Hospital")).toBeInTheDocument();
    expect(within(list).getByText("Open 24 hours")).toBeInTheDocument();
    expect(within(list).getByText("Emergency department")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Call Test Hospital" })).toHaveAttribute("href", "tel:+91 480 2700001");
  });

  it("offers no call link and no hours for a service without them", async () => {
    render(<EmergencyList services={services} available radiusKm={2} onFocus={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Police/ }));

    const list = screen.getByRole("list");

    expect(within(list).getByText("Test Police Station")).toBeInTheDocument();
    expect(within(list).queryByRole("link")).not.toBeInTheDocument();
    expect(within(list).queryByText(/Open|hours/i)).not.toBeInTheDocument();
  });

  it("focuses the service on the map", async () => {
    const onFocus = vi.fn();
    render(<EmergencyList services={services} available radiusKm={2} onFocus={onFocus} />);

    await userEvent.click(screen.getByRole("button", { name: "Show Test Hospital on the map" }));

    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ id: "node-1" }));
  });

  it("says nothing was found instead of implying safety, and points to 112", async () => {
    render(<EmergencyList services={services} available radiusKm={2} onFocus={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /Fire/ }));

    expect(screen.getByText(/None mapped within 2 km/)).toBeInTheDocument();
    expect(screen.getByText(/112/)).toBeInTheDocument();
  });

  it("does not present unavailable data as 'none nearby'", () => {
    render(<EmergencyList services={[]} available={false} radiusKm={2} onFocus={() => {}} />);

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean there are none/)).toBeInTheDocument();
  });

  it("collapses long lists", async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({ ...services[0], id: `h-${index}`, name: `Hospital ${index}` }));
    render(<EmergencyList services={many} available radiusKm={2} onFocus={() => {}} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    await userEvent.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });
});


// ==================== weather, environment, ML ====================

describe("WeatherCard", () => {
  it("shows the readings the backend used", () => {
    render(<WeatherCard weather={makeRoute().weather} />);

    expect(screen.getByText("29°")).toBeInTheDocument();
    expect(screen.getByText("Partly cloudy")).toBeInTheDocument();
    expect(screen.getByText("8 km/h")).toBeInTheDocument();
    expect(screen.getByText("20 km")).toBeInTheDocument();
  });

  it("says weather is unavailable instead of showing a default", () => {
    render(<WeatherCard weather={null} />);

    expect(screen.getByText(/Weather data is unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/°/)).not.toBeInTheDocument();
  });

  it("names conditions from the weather code and the time of day", () => {
    const { rerender } = render(<WeatherCard weather={{ ...makeRoute().weather, weather_code: 0, is_day: false }} />);
    expect(screen.getByText("Clear night")).toBeInTheDocument();

    rerender(<WeatherCard weather={{ ...makeRoute().weather, weather_code: 95 }} />);
    expect(screen.getByText("Thunderstorm")).toBeInTheDocument();

    rerender(<WeatherCard weather={{ ...makeRoute().weather, weather_code: 63 }} />);
    expect(document.querySelector(".wc__label")).toHaveTextContent("Rain");
  });
});

describe("EnvironmentPanel and ML status", () => {
  const rowValue = (label) => screen.getByText(label).nextSibling;

  it("shows mapped values", () => {
    render(<EnvironmentPanel route={makeRoute()} />);

    expect(rowValue("Main roads")).toHaveTextContent("30%");
    expect(rowValue("Buildings close to the route")).toHaveTextContent("70%");
    expect(rowValue("Junctions")).toHaveTextContent("30 (7.1 per km)");
  });

  it("shows Not mapped, never zero, when too little of the route is tagged", () => {
    render(<EnvironmentPanel route={makeRoute()} />);

    expect(rowValue("Street lighting mapped as lit")).toHaveTextContent("Not mapped");
    expect(rowValue("Speed limit (average)")).toHaveTextContent("Not mapped");
    // 10% of the few tagged sidewalks is not a trustworthy figure.
    expect(rowValue("Streets with sidewalks")).toHaveTextContent("Not mapped");
  });

  it("explains missing road details without inventing any", () => {
    const route = makeRoute();
    route.route_features.road_network = { available: false };

    render(<EnvironmentPanel route={route} />);

    expect(screen.getByText(/Road details could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Junctions")).not.toBeInTheDocument();
  });

  it("says the experimental ML estimate is unavailable until real data exists", () => {
    render(<MlStatus estimate={makeRoute().ml_estimate} />);

    expect(screen.getByText(/Not available: No model has been trained/)).toBeInTheDocument();
    expect(screen.getByText(/never ranks or recommends routes/)).toBeInTheDocument();
  });

  it("shows a validated ML estimate only when the backend provides one", () => {
    render(
      <MlStatus
        estimate={{ status: "ready", expected_incidents_per_km: 1.4, relative_to_area_average: 1.2, trained_on: { area: "Test area" } }}
      />
    );

    expect(screen.getByText(/About 1.4 recorded incidents per km/)).toBeInTheDocument();
  });
});


// ==================== analysis progress (real, never assumed) ====================

describe("AnalysisProgress", () => {
  const stateOf = (title) => screen.getByText(title).closest("li").dataset.state;

  it("ticks nothing before the backend has reported anything", () => {
    render(<AnalysisProgress progress={{}} />);

    expect(stateOf("Finding routes")).toBe("active");
    expect(stateOf("Checking the weather")).toBe("pending");
    expect(stateOf("Loading roads, buildings and emergency services")).toBe("pending");
    expect(stateOf("Scoring and comparing routes")).toBe("pending");
    expect(screen.getByText("0 of 4 steps done")).toBeInTheDocument();
  });

  it("ticks a step only when its event has arrived", () => {
    render(<AnalysisProgress progress={{ routes: { event: "routes", count: 5 } }} />);

    expect(stateOf("Finding routes")).toBe("done");
    expect(screen.getByText("5 routes found")).toBeInTheDocument();
    // The next unfinished step is the one in progress.
    expect(stateOf("Checking the weather")).toBe("active");
    expect(stateOf("Loading roads, buildings and emergency services")).toBe("pending");
  });

  it("marks a finished step that came back without data as a warning, not a success", () => {
    render(
      <AnalysisProgress
        progress={{
          routes: { count: 3 },
          weather: { available: false },
          map_data: { source: "local", emergency_services: false, road_network: true },
        }}
      />
    );

    expect(stateOf("Checking the weather")).toBe("warn");
    expect(screen.getByText(/Weather is unavailable/)).toBeInTheDocument();
    expect(stateOf("Loading roads, buildings and emergency services")).toBe("warn");
    expect(screen.getByText("Some map data is unavailable")).toBeInTheDocument();
  });

  it("never marks the final scoring step done (its end is the end of loading)", () => {
    render(
      <AnalysisProgress
        progress={{
          routes: { count: 3 },
          weather: { available: true },
          map_data: { source: "local", emergency_services: true, road_network: true },
        }}
      />
    );

    expect(stateOf("Scoring and comparing routes")).toBe("active");
    expect(screen.getByText("3 of 4 steps done")).toBeInTheDocument();
    expect(screen.getByText("From the local map database")).toBeInTheDocument();
  });

  it("names live map servers when the local database was not used", () => {
    render(<AnalysisProgress progress={{ routes: { count: 1 }, weather: { available: true }, map_data: { source: "overpass", emergency_services: true, road_network: true } }} />);

    expect(screen.getByText("From live map servers")).toBeInTheDocument();
  });

  it("is announced politely to screen readers", () => {
    render(<AnalysisProgress progress={{}} />);

    const status = screen.getByRole("status", { name: "Analysing your trip" });

    expect(status).toHaveAttribute("aria-live", "polite");
  });
});


// ==================== place search ====================

const CHALAKUDY = { id: "N1", name: "Chalakudy", description: "Thrissur, Kerala", lat: 10.3, lon: 76.3 };

function renderSearch(props = {}) {
  const onChange = vi.fn();

  render(
    <ToastProvider>
      <PlaceSearch label="Start" value={null} onChange={onChange} {...props} />
    </ToastProvider>
  );

  return { onChange, input: screen.getByRole("combobox", { name: "Start" }) };
}

describe("PlaceSearch", () => {
  beforeEach(() => {
    searchPlaces.mockReset();
  });

  it("does not search until three characters are typed", async () => {
    const { input } = renderSearch();

    await userEvent.type(input, "ch");

    expect(searchPlaces).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("suggests places while typing and selects one with a click", async () => {
    searchPlaces.mockResolvedValue([CHALAKUDY]);
    const { input, onChange } = renderSearch();

    await userEvent.type(input, "Chalak");

    const option = await screen.findByRole("option", { name: /Chalakudy/ });
    expect(input).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(CHALAKUDY);
    expect(input).toHaveValue("Chalakudy");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be operated from the keyboard", async () => {
    searchPlaces.mockResolvedValue([CHALAKUDY, { ...CHALAKUDY, id: "N2", name: "Chalakudi" }]);
    const { input, onChange } = renderSearch();

    await userEvent.type(input, "Chalak");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "N2" }));
  });

  it("closes on Escape without choosing", async () => {
    searchPlaces.mockResolvedValue([CHALAKUDY]);
    const { input, onChange } = renderSearch();

    await userEvent.type(input, "Chalak");
    await screen.findByRole("option");
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says when nothing was found", async () => {
    searchPlaces.mockResolvedValue([]);
    const { input } = renderSearch();

    await userEvent.type(input, "Zzzzz");

    expect(await screen.findByText("No places found")).toBeInTheDocument();
  });

  it("says when search itself is unavailable, instead of pretending nothing exists", async () => {
    searchPlaces.mockRejectedValue(new Error("down"));
    const { input } = renderSearch();

    await userEvent.type(input, "Yyyyy");

    expect(await screen.findByText("Search is unavailable right now", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText("No places found")).not.toBeInTheDocument();
  });

  it("clears the place with the clear button", async () => {
    const { onChange } = renderSearch({ value: CHALAKUDY });

    await userEvent.click(screen.getByRole("button", { name: "Clear start" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows a place chosen elsewhere (swap, current location)", () => {
    const { rerender } = render(<PlaceSearch label="Start" value={null} onChange={() => {}} />);
    rerender(<PlaceSearch label="Start" value={CHALAKUDY} onChange={() => {}} />);

    expect(screen.getByRole("combobox", { name: "Start" })).toHaveValue("Chalakudy");
  });

  it("biases the search towards the other end of the trip", async () => {
    searchPlaces.mockResolvedValue([]);
    const near = { lat: 10.4, lon: 76.4 };
    const { input } = renderSearch({ near });

    await userEvent.type(input, "Kodak");
    await waitFor(() => expect(searchPlaces).toHaveBeenCalled());

    expect(searchPlaces.mock.calls[0][1]).toEqual(near);
  });
});


// ==================== bottom sheet ====================

describe("BottomSheet", () => {
  it("expands and collapses from the keyboard-accessible button", async () => {
    const onSnapChange = vi.fn();
    const { rerender } = render(<BottomSheet snap="peek" onSnapChange={onSnapChange} header={<b>Header</b>}>Body</BottomSheet>);

    const button = screen.getByRole("button", { name: "Expand results" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    // Keyboard activation is a synthetic click (detail 0).
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSnapChange).toHaveBeenLastCalledWith("half");

    rerender(<BottomSheet snap="full" onSnapChange={onSnapChange} header={<b>Header</b>}>Body</BottomSheet>);
    expect(screen.getByRole("button", { name: "Collapse results" })).toHaveAttribute("aria-expanded", "true");
  });

  it("is a labelled region and exposes its snap point", () => {
    render(<BottomSheet snap="half" onSnapChange={() => {}} header={null} label="Route results">Body</BottomSheet>);

    expect(screen.getByRole("region", { name: "Route results" })).toHaveAttribute("data-snap", "half");
  });

  it("keeps its content out of reach while only peeking", () => {
    render(<BottomSheet snap="peek" onSnapChange={() => {}} header={null}>Body</BottomSheet>);

    expect(screen.getByText("Body").style.overflowY).toBe("hidden");
  });
});
