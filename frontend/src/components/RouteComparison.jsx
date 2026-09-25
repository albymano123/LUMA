import {
  Box,
  Card,
  CardActionArea,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BalanceIcon from "@mui/icons-material/Balance";
import BoltIcon from "@mui/icons-material/Bolt";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

import { riskStyle, routeColors } from "../theme";
import {
  CATEGORY_LABELS,
  RECOMMENDATION_LABELS,
  formatDistance,
  formatDuration,
  formatRiskLevel,
} from "../lib/format";

const PREFERENCES = [
  { value: "safest", label: "Safest", icon: <ShieldOutlinedIcon fontSize="small" /> },
  { value: "balanced", label: "Balanced", icon: <BalanceIcon fontSize="small" /> },
  { value: "fastest", label: "Time-efficient", icon: <BoltIcon fontSize="small" /> },
];

function RouteCard({ route, selected, recommendationLabel, onSelect }) {
  const risk = riskStyle(route.risk_level);

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: selected ? routeColors.selected : "divider",
        borderWidth: selected ? 2 : 1,
        boxShadow: selected ? "0 4px 14px rgba(37, 99, 235, 0.15)" : "none",
        transition: "box-shadow .15s, border-color .15s",
      }}
    >
      <CardActionArea
        onClick={() => onSelect(route.id)}
        aria-pressed={selected}
        sx={{ p: 1.75 }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          {/* Score */}
          <Box
            sx={{
              width: 54,
              height: 54,
              borderRadius: 2.5,
              bgcolor: risk.bg,
              color: risk.main,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
            aria-label={
              route.safety_score == null
                ? "No safety score"
                : `Safety score ${route.safety_score} out of 100`
            }
          >
            <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1 }}>
              {route.safety_score ?? "–"}
            </Typography>
          </Box>

          {/* Summary */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
              <Typography sx={{ fontWeight: 700 }}>{route.name}</Typography>

              {recommendationLabel && (
                <Chip
                  size="small"
                  icon={<StarRoundedIcon />}
                  label={recommendationLabel}
                  color="success"
                  sx={{ height: 22 }}
                />
              )}

              {route.categories
                .filter((category) => !(recommendationLabel && category === "safest"))
                .map((category) => (
                  <Chip
                    key={category}
                    size="small"
                    variant="outlined"
                    label={CATEGORY_LABELS[category]}
                    sx={{ height: 22 }}
                  />
                ))}
            </Stack>

            <Typography variant="body2" sx={{ mt: 0.25 }}>
              <strong>{formatDuration(route.duration_min)}</strong>
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" · "}
                {formatDistance(route.distance_km)}
                {" · "}
                <Box component="span" sx={{ color: risk.main, fontWeight: 600 }}>
                  {formatRiskLevel(route.risk_level)}
                </Box>
              </Box>
            </Typography>

            {route.via_roads?.length > 0 && (
              <Typography variant="caption" color="text.secondary" noWrap component="p">
                via {route.via_roads.join(", ")}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

// Preference switch (Safest / Balanced / Time-efficient) plus a card
// for every route. Picking a preference selects the route the backend
// tagged with that category. "Selected" (what the map and details show)
// and "Recommended" (the backend's safest pick, when it can defend one)
// are separate ideas and are shown separately.
function RouteComparison({
  safeRouteData,
  selectedRoute,
  preference,
  onSelectRoute,
  onSelectPreference,
}) {
  if (!safeRouteData?.routes?.length) {
    return null;
  }

  const { routes, recommendation } = safeRouteData;

  const routeFor = (category) =>
    routes.find((route) => route.categories.includes(category));

  const recommendationLabel = (route) =>
    route.id === recommendation?.route_id
      ? RECOMMENDATION_LABELS[recommendation.state] ?? null
      : null;

  return (
    <Box>
      <ToggleButtonGroup
        value={preference}
        exclusive
        fullWidth
        size="small"
        onChange={(_, value) => value && onSelectPreference(value)}
        aria-label="Route preference"
        sx={{ mb: 1.5 }}
      >
        {PREFERENCES.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            disabled={!routeFor(option.value)}
            sx={{ gap: 0.75, textTransform: "none", fontWeight: 600 }}
          >
            {option.icon}
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack spacing={1.25}>
        {routes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            selected={route.id === selectedRoute}
            recommendationLabel={recommendationLabel(route)}
            onSelect={onSelectRoute}
          />
        ))}
      </Stack>
    </Box>
  );
}

export default RouteComparison;
