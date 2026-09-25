import { Box, Paper, Stack, Typography } from "@mui/material";

import { routeColors } from "../theme";

function Line({ color, dashed = false }) {
  return (
    <Box
      sx={{
        width: 22,
        height: 0,
        borderTop: `4px ${dashed ? "dashed" : "solid"} ${color}`,
        borderRadius: 2,
      }}
    />
  );
}

function Dot({ color }) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: "50%",
        bgcolor: color,
        border: "2px solid #fff",
        boxShadow: "0 0 0 1px rgba(15,23,42,.2)",
      }}
    />
  );
}

const ITEMS = [
  { key: "selected", marker: <Line color={routeColors.selected} />, label: "Selected route" },
  { key: "recommended", marker: <Line color={routeColors.recommended} dashed />, label: "Recommended (safest)" },
  { key: "alternative", marker: <Line color={routeColors.alternative} />, label: "Alternative – tap to select" },
  { key: "hospital", marker: <Dot color="#e11d48" />, label: "Hospital / clinic" },
  { key: "police", marker: <Dot color="#1d4ed8" />, label: "Police station" },
  { key: "fire", marker: <Dot color="#ea580c" />, label: "Fire station" },
];

// Overlay on the map. `hideRecommended` drops the recommended entry
// when the recommended route is the one selected.
function MapLegend({ hideRecommended = false }) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: "absolute",
        left: 12,
        bottom: 24,
        zIndex: 500,
        px: 1.5,
        py: 1.25,
        borderRadius: 2.5,
        display: { xs: "none", sm: "block" },
      }}
    >
      <Stack spacing={0.75}>
        {ITEMS.filter((item) => !(hideRecommended && item.key === "recommended")).map(
          (item) => (
            <Stack key={item.key} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box sx={{ width: 22, display: "flex", justifyContent: "center" }}>
                {item.marker}
              </Box>
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                {item.label}
              </Typography>
            </Stack>
          )
        )}
      </Stack>
    </Paper>
  );
}

export default MapLegend;
