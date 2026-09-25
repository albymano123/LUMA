# How the safety score works

Implemented in `backend/safety.py`. This is the only place scores are computed; the frontend
displays them and never recalculates.

## Principles

1. **Only real data.** Every factor comes from a measurement of the actual route.
2. **Missing data is not zero.** An unavailable factor is left out, the remaining weights are
   rescaled, and confidence drops. If too little remains, no score is published.
3. **Shares, not counts.** Factors are fractions of the route's length, so a longer route does not
   look safer because it passes more buildings or hospitals.
4. **Explainable.** Every score comes with positive, neutral and negative reasons in plain English.
5. **No guarantees.** The wording is "safety score", "lower / moderate / higher risk" and
   "confidence". Never "safe", "guaranteed" or "100%".

## Factors (each 0 to 100)

| Factor | Measured as | Data |
|---|---|---|
| Emergency access | Distance from route samples (every 100 m) to the nearest hospital/clinic and police station. Full marks within 500 m (walking), 1 km (cycling), 1.5 km (driving); zero at 2 / 3 / 5 km | OSM |
| Street activity | Share of the route within 100 m of a shop, food place, bank, transit stop, school... and the longest stretch without one | OSM |
| Built-up surroundings | Share of the route (sampled every 50 m) with at least 3 mapped buildings in the ~150 m block around it; 85% counts as fully built up. A penalty of 10 points per km of unbroken empty stretch beyond 0.5 km (max 30) | OSM buildings |
| Street lighting | Share of the route's streets mapped as lit | OSM `lit=*` |
| Road and traffic exposure (walking, cycling) | Average of: share of route *off* fast main roads; sidewalk share (walking); speed limit (30 km/h or less = 100, 80 or more = 0) | OSM |
| Weather | Starts at 100; heavy rain -55, moderate -35, light -15; strong wind -35, windy -15; thunderstorm -40; fog/low visibility -25 | Open-Meteo |

**Tag coverage rule.** OpenStreetMap tagging is uneven (in Kerala only ~0.5% of roads have a
lighting tag, ~2% a sidewalk tag, ~3% a speed limit). A tag-based factor is used only when at least
**30% of the route's streets carry the tag**; otherwise it is reported as "not mapped for most of
this route" (unmapped does not mean unlit) and excluded.

## Weights

Each row sums to 1. At night lighting, activity and surroundings count for more.

| Mode / time | Emergency | Activity | Surroundings | Lighting | Road | Weather |
|---|---|---|---|---|---|---|
| Walking, day | 0.25 | 0.15 | 0.20 | 0.05 | 0.10 | 0.25 |
| Walking, night | 0.20 | 0.20 | 0.20 | 0.20 | 0.10 | 0.10 |
| Cycling, day | 0.25 | 0.10 | 0.15 | 0.05 | 0.20 | 0.25 |
| Cycling, night | 0.20 | 0.10 | 0.15 | 0.20 | 0.20 | 0.15 |
| Driving, day | 0.40 | 0 | 0.10 | 0.10 | 0 | 0.40 |
| Driving, night | 0.35 | 0 | 0.10 | 0.25 | 0 | 0.30 |

A weight of 0 means the factor does not apply to that mode (shown as "not scored for this travel
mode", which is different from "missing data").

## Score, risk and confidence

- **Score** = weighted average of the available factors.
- **Risk level**: 75 or more lower risk; 55 to 74 moderate; below 55 higher.
- **Confidence** = share of the total weight that had data: 85% or more high, 55% or more medium,
  otherwise low.
- **No score** when less than 40% of the weight is available, or when only weather is available.

## Recommendation (deterministic)

- **Fastest**: quickest route (ties: higher score).
- **Safest**: quickest route among those within **2 points** of the highest score (a 2-point gap is
  smaller than the noise in open data, and stops a 1-point difference choosing a much slower route).
- **Balanced**: highest of `0.5 x safety + 0.3 x time score + 0.2 x distance score`.
- **Recommended** = the safest route, but only if defensible. The state is one of:
  - `recommended`: 5 or more points ahead
  - `close`: ahead, but by less than 5 points
  - `tie`: several routes within 2 points; the quickest is recommended
  - `single`: only one distinct route
  - `unavailable`: no scores, or the best score rests on low-confidence data. **No route is labelled
    recommended**; the quickest is only the default selection.

"Selected" (what the map and details show) and "recommended" are separate: choosing
Time-efficient selects the fastest route without calling it the safest.

## What the score is not

- It is not based on crime or incident records (none exist in the project).
- It does not know about anything that is not in OpenStreetMap or the weather service.
- Mapping completeness varies by area; sparsely mapped areas look quieter than they are.
- The factor weights are engineering judgements documented above, not learned from data.
