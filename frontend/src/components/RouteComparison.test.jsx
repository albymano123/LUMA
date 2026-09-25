import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RouteComparison from "./RouteComparison";
import { makeResponse, makeRoute } from "../test/fixtures";

function setup({ data = makeResponse(), selectedRoute = "route-2", preference = null } = {}) {
  const onSelectRoute = vi.fn();
  const onSelectPreference = vi.fn();

  render(
    <RouteComparison
      safeRouteData={data}
      selectedRoute={selectedRoute}
      preference={preference}
      onSelectRoute={onSelectRoute}
      onSelectPreference={onSelectPreference}
    />
  );

  return { onSelectRoute, onSelectPreference };
}

const card = (name) => screen.getByRole("button", { name: new RegExp(name) });

describe("RouteComparison", () => {
  it("shows every route with its real score, time and distance", () => {
    setup();

    expect(card("Route A")).toHaveTextContent("61");
    expect(card("Route B")).toHaveTextContent("84");
    expect(card("Route B")).toHaveTextContent("58 min");
    expect(card("Route B")).toHaveTextContent("4.6 km");
  });

  it("labels only the recommended route as Recommended", () => {
    setup();

    expect(within(card("Route B")).getByText("Recommended")).toBeInTheDocument();
    expect(within(card("Route A")).queryByText("Recommended")).not.toBeInTheDocument();
    expect(within(card("Route C")).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("never says Recommended when the backend cannot defend a safest route", () => {
    setup({ data: makeResponse({ state: "unavailable" }), selectedRoute: "route-1" });

    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("marks the selected card without implying it is recommended", () => {
    setup({ selectedRoute: "route-1" });

    expect(card("Route A")).toHaveAttribute("aria-pressed", "true");
    expect(card("Route B")).toHaveAttribute("aria-pressed", "false");
    expect(within(card("Route A")).queryByText("Recommended")).not.toBeInTheDocument();
  });

  it("selects a route when its card is clicked", async () => {
    const { onSelectRoute } = setup();

    await userEvent.click(card("Route C"));

    expect(onSelectRoute).toHaveBeenCalledWith("route-3");
  });

  it("asks for the Time-efficient preference when that button is clicked", async () => {
    const { onSelectPreference } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Time-efficient" }));

    expect(onSelectPreference).toHaveBeenCalledWith("fastest");
  });

  it("keeps Time-efficient active even when the fastest route is also the safest", () => {
    const both = makeResponse({
      routes: [
        makeRoute({ id: "route-1", duration_min: 40, safety_score: 90, categories: ["fastest", "safest", "balanced"] }),
        makeRoute({ id: "route-2", duration_min: 55, safety_score: 70 }),
      ],
    });

    setup({ data: both, selectedRoute: "route-1", preference: "fastest" });

    expect(screen.getByRole("button", { name: "Time-efficient" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Safest" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables a preference that no route holds", () => {
    const noSafest = makeResponse({
      state: "unavailable",
      routes: [
        makeRoute({ id: "route-1", safety_score: null, risk_level: "Insufficient data", data_confidence: "low", categories: ["fastest"] }),
      ],
    });

    setup({ data: noSafest, selectedRoute: "route-1" });

    expect(screen.getByRole("button", { name: "Safest" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Balanced" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Time-efficient" })).toBeEnabled();
  });

  it("shows a dash, not a made-up number, when a route has no score", () => {
    const unscored = makeResponse({
      state: "unavailable",
      routes: [
        makeRoute({ id: "route-1", safety_score: null, risk_level: "Insufficient data", data_confidence: "low", categories: ["fastest"] }),
      ],
    });

    setup({ data: unscored, selectedRoute: "route-1" });

    expect(card("Route A")).toHaveTextContent("–");
    expect(card("Route A")).toHaveTextContent("Insufficient data");
  });
});
