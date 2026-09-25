import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Badge, Button, Disclosure, FactorBar, Notice, ScoreRing, SegmentedControl } from "./index";

describe("ScoreRing", () => {
  it("announces the score it was given, and nothing else", () => {
    render(<ScoreRing score={84} level="Lower risk" />);

    expect(screen.getByRole("img", { name: "Safety score 84 out of 100" })).toBeInTheDocument();
  });

  it("shows a dash and says there is no score when the backend sent none", () => {
    render(<ScoreRing score={null} level="Insufficient data" />);

    const ring = screen.getByRole("img", { name: "No safety score" });

    expect(ring).toHaveTextContent("–");
    expect(ring).not.toHaveTextContent(/\d/);
  });

  it("can be purely decorative (the score is stated in text elsewhere)", () => {
    render(<ScoreRing score={73} level="Moderate risk" decorative />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("takes its tone from the risk level the backend decided", () => {
    const { container, rerender } = render(<ScoreRing score={80} level="Lower risk" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "positive");

    rerender(<ScoreRing score={60} level="Moderate risk" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "warning");

    rerender(<ScoreRing score={40} level="Higher risk" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "danger");

    rerender(<ScoreRing score={null} level="Insufficient data" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "neutral");
  });
});

describe("FactorBar", () => {
  const factor = { key: "emergency", label: "Emergency access", score: 80, weight: 0.25, available: true, applicable: true };

  it("shows the value with a labelled progress bar", () => {
    render(<FactorBar factor={factor} />);

    const bar = screen.getByRole("progressbar", { name: "Emergency access: 80/100" });

    expect(bar).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByText("80/100")).toBeInTheDocument();
  });

  it("says 'Data unavailable' instead of inventing a value", () => {
    render(<FactorBar factor={{ ...factor, score: null, available: false }} />);

    expect(screen.getByText("Data unavailable")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument();
  });

  it("distinguishes 'does not apply to this mode' from missing data", () => {
    render(<FactorBar factor={{ ...factor, score: null, weight: 0, available: false, applicable: false }} />);

    expect(screen.getByText("Not used for this mode")).toBeInTheDocument();
    expect(screen.queryByText("Data unavailable")).not.toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "a", label: "Safest" },
    { value: "b", label: "Balanced" },
    { value: "c", label: "Time-efficient", disabled: true },
  ];

  it("is a labelled group of toggle buttons that shows the selection in words and state", () => {
    render(<SegmentedControl label="Route preference" options={options} value="b" onChange={() => {}} />);

    const group = screen.getByRole("group", { name: "Route preference" });

    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Safest" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the chosen value and refuses disabled options", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="Route preference" options={options} value="a" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Balanced" }));
    await userEvent.click(screen.getByRole("button", { name: "Time-efficient" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("works with no selection at all", () => {
    render(<SegmentedControl label="Preference" options={options} value={null} onChange={() => {}} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });
});

describe("Disclosure", () => {
  it("expands and collapses, and exposes its state", async () => {
    render(<Disclosure title="Why this route?">Because.</Disclosure>);

    const button = screen.getByRole("button", { name: /Why this route/ });

    expect(button).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("aria-controls");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("can start open", () => {
    render(<Disclosure title="Weather" defaultOpen>Sunny.</Disclosure>);

    expect(screen.getByRole("button", { name: /Weather/ })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Button", () => {
  it("ignores clicks and reports busy while loading, but keeps its label", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Analysing…</Button>);

    const button = screen.getByRole("button", { name: "Analysing…" });

    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick normally", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Find routes</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Find routes" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a link and blocks navigation while disabled", () => {
    const handler = vi.fn();
    render(<Button as="a" href="/map" disabled onClick={handler}>Plan</Button>);

    const link = screen.getByRole("link", { name: "Plan" });
    const notPrevented = fireEvent.click(link);

    expect(notPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("Badge and Notice", () => {
  it("badges carry their tone for styling and their text for meaning", () => {
    render(<Badge tone="positive">Recommended</Badge>);

    expect(screen.getByText("Recommended")).toHaveAttribute("data-tone", "positive");
  });

  it("a notice shows its title and body, and is an alert only when asked to be", () => {
    const { rerender } = render(<Notice tone="warning" title="Some data unavailable">Weather.</Notice>);

    expect(screen.getByText("Some data unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    rerender(<Notice tone="danger" role="alert" title="Failed">Try again.</Notice>);
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
  });
});

it("the score ring animates without ever showing a different final number", async () => {
  vi.useFakeTimers();

  render(<ScoreRing score={73} level="Moderate risk" />);

  await act(async () => {
    vi.advanceTimersByTime(1500);
  });

  expect(screen.getByRole("img")).toHaveTextContent("73");

  vi.useRealTimers();
});
