# LumaPath ML component (experimental)

**Status: no model is trained.** The app's safety score is the
rule-based score in `safety.py`. The ML component never ranks or
recommends routes.

## What is real, and what is not

| Kind | Examples | Source |
|---|---|---|
| **Environment features** (inputs) | road class, sidewalks, speed limits, surface, junctions, dead ends, route twistiness, distance to hospitals/police | OpenStreetMap + routing geometry |
| **Safety labels** (ground truth) | recorded incidents/crimes at a location | **Not available yet.** Must be supplied. |

Environment features describe a road. They do not say it is safe or
unsafe. A model can only learn "safety" from real incident records, so
without them there is nothing valid to train on. The earlier 10-row
hand-made dataset and its model were removed for that reason.

## Training on real data

1. Put real incident records in a CSV (`incidents_template.csv` shows the format):

   | column | required | notes |
   |---|---|---|
   | `lat`, `lon` | yes | WGS84 degrees |
   | `timestamp` | no | ISO date; lets the rate be per year |
   | `category`, `severity` | no | kept in the file, not used yet |

2. Build the training table (real OSM roads, labelled with real incident counts):

   ```
   cd backend
   venv/Scripts/python -m ml.build_dataset --incidents incidents.csv --bbox S,W,N,E --area "Kochi" --mode walking
   ```

3. Train:

   ```
   venv/Scripts/python -m ml.train_model --data ml/training_windows.csv
   ```

Training refuses to run below 300 road windows / 200 incidents. The
model is marked `validated` only if it beats a plain average-rate
baseline on held-out **areas** (spatial cross-validation). Only a
validated model is ever shown, and its output is an expected incident
rate per km for the training area, not a personal safety prediction.

Restart the API after training so it picks up the model.
