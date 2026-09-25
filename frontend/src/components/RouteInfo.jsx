import { Box, Stack, Typography } from "@mui/material";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import LocalPoliceOutlinedIcon from "@mui/icons-material/LocalPoliceOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import StraightenIcon from "@mui/icons-material/Straighten";

import { formatDistance, formatDuration } from "../lib/format";

function Stat({ icon, label, value }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
      <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="p">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

// Distance, time and emergency-service counts for one analysed route.
function RouteInfo({ route, emergencyDataAvailable = true }) {
  if (!route) return null;

  const count = (value) => (emergencyDataAvailable ? value : "No data");

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 2,
      }}
    >
      <Stat
        icon={<ScheduleIcon fontSize="small" />}
        label="Estimated time"
        value={formatDuration(route.duration_min)}
      />
      <Stat
        icon={<StraightenIcon fontSize="small" />}
        label="Distance"
        value={formatDistance(route.distance_km)}
      />
      <Stat
        icon={<LocalHospitalOutlinedIcon fontSize="small" />}
        label="Hospitals & clinics nearby"
        value={count(route.hospital_count)}
      />
      <Stat
        icon={<LocalPoliceOutlinedIcon fontSize="small" />}
        label="Police stations nearby"
        value={count(route.police_station_count)}
      />
    </Box>
  );
}

export default RouteInfo;
