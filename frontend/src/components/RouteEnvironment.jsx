import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";

const percent = (share) => (share == null ? null : `${Math.round(share * 100)}%`);

// Missing map data is shown as "Not mapped", never as zero.
const NOT_MAPPED = "Not mapped";

function distance(metres) {
  if (metres == null) return null;
  return metres < 1000 ? `${Math.round(metres / 50) * 50} m` : `${(metres / 1000).toFixed(1)} km`;
}

function buildRows(features) {
  const shape = features.route_shape ?? {};
  const road = features.road_network ?? {};
  const emergency = features.emergency ?? {};
  const rows = [];

  if (road.available) {
    rows.push(
      ["Main roads", percent(road.major_road_share) ?? NOT_MAPPED],
      ["Local streets", percent(road.local_road_share) ?? NOT_MAPPED],
      ["Footpaths and cycle paths", percent(road.pedestrian_cycle_road_share) ?? NOT_MAPPED],
      [
        "Streets with sidewalks",
        road.sidewalk_share == null
          ? NOT_MAPPED
          : `${percent(road.sidewalk_share)} of ${road.sidewalk_tagged_segments} mapped segments`,
      ],
      [
        "Speed limit (average)",
        road.maxspeed_mean_kmh == null ? NOT_MAPPED : `${Math.round(road.maxspeed_mean_kmh)} km/h`,
      ],
      ["Paved surface", road.paved_share == null ? NOT_MAPPED : percent(road.paved_share)],
      ["Junctions", `${road.junctions} (${road.junctions_per_km} per km)`],
      ["Dead-end streets nearby", `${road.dead_ends} (${road.dead_ends_per_km} per km)`],
    );
  }

  if (shape.turns_per_km != null) {
    rows.push(
      ["Sharp turns", `${shape.sharp_turns} (${shape.turns_per_km} per km)`],
      ["Directness", `${Math.round(shape.directness * 100)}% of a straight line`],
    );
  }

  if (emergency.hospital_median_m != null) {
    rows.push(["Typical distance to a hospital or clinic", distance(emergency.hospital_median_m)]);
  }

  if (emergency.police_median_m != null) {
    rows.push(["Typical distance to a police station", distance(emergency.police_median_m)]);
  }

  return { rows, roadAvailable: Boolean(road.available) };
}

// Facts about the route's surroundings, plus the status of the
// experimental ML component. None of this changes the safety score.
function RouteEnvironment({ route }) {
  const features = route.route_features;
  const estimate = route.ml_estimate;

  if (!features) {
    return null;
  }

  const { rows, roadAvailable } = buildRows(features);

  return (
    <>
      <Box sx={{ py: 2.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          Route environment
        </Typography>

        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1.5 }}>
          What OpenStreetMap says about the roads on this route. These are map
          facts, not crime or incident data.
        </Typography>

        {!roadAvailable && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Road details could not be loaded for this route right now.
          </Typography>
        )}

        <Stack spacing={0.75}>
          {rows.map(([label, value]) => (
            <Stack
              key={label}
              direction="row"
              sx={{ justifyContent: "space-between", gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, textAlign: "right", opacity: value === NOT_MAPPED ? 0.6 : 1 }}
              >
                {value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Accordion
        disableGutters
        elevation={0}
        sx={{ bgcolor: "transparent", "&::before": { display: "none" }, borderTop: 1, borderColor: "divider" }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <ScienceOutlinedIcon fontSize="small" color="action" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Experimental ML estimate
            </Typography>
          </Stack>
        </AccordionSummary>

        <AccordionDetails sx={{ px: 0, pt: 0 }}>
          {estimate?.status === "ready" ? (
            <Typography variant="body2" sx={{ mb: 1 }}>
              About {estimate.expected_incidents_per_km} recorded incidents per km
              {estimate.relative_to_area_average != null &&
                ` (${estimate.relative_to_area_average}× the ${estimate.trained_on?.area || "training area"} average)`}
              .
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ mb: 1 }}>
              Not available: {estimate?.message ?? "no model is trained."}
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary" component="p">
            An experiment, shown for comparison only. It never ranks or
            recommends routes; the safety assessment above is the rule-based score.
            It can only be trained on real historical incident records.
          </Typography>
        </AccordionDetails>
      </Accordion>
    </>
  );
}

export default RouteEnvironment;
