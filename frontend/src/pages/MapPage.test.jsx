import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MissingDataNotice, NoRecommendationNotice } from "./MapPage";

// Weather is the one data source allowed to be unavailable without the
// page-level warning (safety.py treats it as non-blocking for
// confidence too; see RouteDetails's WeatherGapNote for its own, small,
// non-blocking status instead).

describe("MissingDataNotice", () => {
  it("shows nothing when every source loaded", () => {
    const { container } = render(
      <MissingDataNotice dataSources={{ emergency_services: true, road_network: true, weather: true }} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent when weather is the only source that failed to load", () => {
    const { container } = render(
      <MissingDataNotice dataSources={{ emergency_services: true, road_network: true, buildings: true, weather: false }} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("still warns about a genuinely critical missing source, and does not also mention weather", () => {
    render(
      <MissingDataNotice dataSources={{ emergency_services: false, road_network: true, weather: false }} />
    );

    expect(screen.getByText("Some safety data is temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load:/)).toHaveTextContent("emergency services");
    expect(screen.getByText(/Couldn't load:/)).not.toHaveTextContent("weather");
  });
});

describe("NoRecommendationNotice", () => {
  it("stays silent once a recommendation exists (e.g. thanks to the weather-confidence fix)", () => {
    const { container } = render(
      <NoRecommendationNotice recommendation={{ state: "recommended", reason: "Highest safety score." }} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("still appears when the backend genuinely cannot defend a recommendation", () => {
    render(
      <NoRecommendationNotice recommendation={{ state: "unavailable", reason: "Too much safety data was unavailable." }} />
    );

    expect(screen.getByText("No route is recommended")).toBeInTheDocument();
  });
});
