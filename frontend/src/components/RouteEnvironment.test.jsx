import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RouteEnvironment from "./RouteEnvironment";
import { makeRoute } from "../test/fixtures";

function rowValue(label) {
  return screen.getByText(label).nextSibling;
}

describe("RouteEnvironment", () => {
  it("shows mapped values", () => {
    render(<RouteEnvironment route={makeRoute()} />);

    expect(rowValue("Main roads")).toHaveTextContent("30%");
    expect(rowValue("Buildings close to the route")).toHaveTextContent("70%");
    expect(rowValue("Junctions")).toHaveTextContent("30 (7.1 per km)");
  });

  it("shows Not mapped, never zero, when too little of the route is tagged", () => {
    render(<RouteEnvironment route={makeRoute()} />);

    expect(rowValue("Street lighting mapped as lit")).toHaveTextContent("Not mapped");
    expect(rowValue("Speed limit (average)")).toHaveTextContent("Not mapped");
    // 10% of the few tagged sidewalks is not a trustworthy figure.
    expect(rowValue("Streets with sidewalks")).toHaveTextContent("Not mapped");
  });

  it("says the experimental ML estimate is unavailable until real data exists", () => {
    render(<RouteEnvironment route={makeRoute()} />);

    expect(screen.getByText(/Not available: No model has been trained/)).toBeInTheDocument();
    expect(screen.getByText(/never ranks or\s+recommends routes/)).toBeInTheDocument();
  });

  it("explains missing road details without inventing any", () => {
    const route = makeRoute();
    route.route_features.road_network = { available: false };

    render(<RouteEnvironment route={route} />);

    expect(screen.getByText(/Road details could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Junctions")).not.toBeInTheDocument();
  });

  it("shows a validated ML estimate only when the backend provides one", () => {
    const route = makeRoute({
      ml_estimate: {
        status: "ready",
        message: "",
        expected_incidents_per_km: 1.4,
        relative_to_area_average: 1.2,
        trained_on: { area: "Test area" },
      },
    });

    render(<RouteEnvironment route={route} />);

    expect(screen.getByText(/About 1.4 recorded incidents per km/)).toBeInTheDocument();
  });
});
