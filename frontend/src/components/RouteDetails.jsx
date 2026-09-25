import {
  Alert,
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

import EmergencyServices from "./EmergencyServices";
import RouteEnvironment from "./RouteEnvironment";
import RouteInfo from "./RouteInfo";
import SafetyScore from "./SafetyScore";
import WeatherInfo from "./WeatherInfo";
import { CATEGORY_LABELS } from "../lib/format";

function Section({ title, children }) {
  return (
    <Box sx={{ py: 2.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

// Everything about the selected route, as analysed by the backend.
function RouteDetails({
  route,
  isRecommended,
  recommendationReason,
  dataSources,
  disclaimer,
  onFocusService,
}) {
  if (!route) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
        <Typography variant="h6">{route.name}</Typography>

        {isRecommended && (
          <Chip size="small" color="success" icon={<StarRoundedIcon />} label="Recommended" />
        )}

        {route.categories.map((category) => (
          <Chip key={category} size="small" variant="outlined" label={CATEGORY_LABELS[category]} />
        ))}
      </Stack>

      {route.via_roads?.length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          via {route.via_roads.join(", ")}
        </Typography>
      )}

      {isRecommended && recommendationReason && (
        <Alert severity="success" icon={<StarRoundedIcon />} sx={{ mt: 2 }}>
          {recommendationReason}
        </Alert>
      )}

      <Box sx={{ mt: 2.5 }}>
        <RouteInfo
          route={route}
          emergencyDataAvailable={dataSources?.emergency_services !== false}
        />
      </Box>

      <Divider sx={{ mt: 2.5 }} />

      <Section title="Safety assessment">
        <SafetyScore route={route} />
      </Section>

      <Divider />

      <Section title="Nearby emergency services">
        <EmergencyServices
          services={route.emergency_services}
          available={dataSources?.emergency_services !== false}
          onFocus={onFocusService}
        />
      </Section>

      <Divider />

      <Section title="Weather">
        <WeatherInfo weather={route.weather} />
      </Section>

      <Divider />

      <RouteEnvironment route={route} />

      {disclaimer && (
        <Typography
          variant="caption"
          color="text.secondary"
          component="p"
          sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, pb: 1.5 }}
        >
          {disclaimer}
        </Typography>
      )}
    </Paper>
  );
}

export default RouteDetails;
