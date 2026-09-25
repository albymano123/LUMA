import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RouteDetails from "./RouteDetails";
import { makeResponse } from "../test/fixtures";

function setup({ state = "recommended", selected = "route-2", preference = null } = {}) {
  const data = makeResponse({ state });
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
    />
  );
}

describe("RouteDetails", () => {
  it("explains why the recommended route is recommended", () => {
    setup();

    expect(screen.getByText(/12 points ahead/)).toBeInTheDocument();
    expect(screen.queryByTestId("not-recommended-note")).not.toBeInTheDocument();
  });

  it("points to the recommended route when another route is selected", () => {
    setup({ selected: "route-1", preference: "fastest" });

    const note = screen.getByTestId("not-recommended-note");

    expect(note).toHaveTextContent("You chose Time-efficient");
    expect(note).toHaveTextContent("Route B");
    expect(note).toHaveTextContent("84/100");
    expect(note).toHaveTextContent("61/100");
  });

  it("does not mention a recommendation when none can be defended", () => {
    setup({ state: "unavailable", selected: "route-1" });

    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByTestId("not-recommended-note")).not.toBeInTheDocument();
  });

  it("shows the backend's score and reasons unchanged", () => {
    setup();

    expect(screen.getByLabelText("Safety score 84 out of 100")).toBeInTheDocument();
    expect(screen.getByText(/Good mapped availability of hospitals/)).toBeInTheDocument();
    expect(screen.getByText(/not mapped for most of this route/)).toBeInTheDocument();
  });

  it("says a factor without data was not scored, instead of showing a number", () => {
    setup();

    expect(screen.getByText("No data – not scored")).toBeInTheDocument();
  });

  it("never claims a route is guaranteed safe", () => {
    setup();

    expect(document.body.textContent.toLowerCase()).not.toMatch(/guaranteed safe|100% safe|completely safe/);
    expect(screen.getByText(/not a guarantee of safety/)).toBeInTheDocument();
  });

  it("credits the map data source", () => {
    setup();

    expect(screen.getByText(/OpenStreetMap extract \(Kerala, India\), extract dated 2026-09-23/)).toBeInTheDocument();
  });
});
