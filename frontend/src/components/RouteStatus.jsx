import { useEffect, useState } from "react";

import {
  Alert,
  AlertTitle,
  Box,
  Button,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import NightlightOutlinedIcon from "@mui/icons-material/NightlightOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import WbCloudyOutlinedIcon from "@mui/icons-material/WbCloudyOutlined";

// What the backend is doing, in order. These describe the work in
// progress; they are not tied to real progress events.
const LOADING_STEPS = [
  "Finding alternative routes…",
  "Checking hospitals and police stations nearby…",
  "Looking at street activity and lighting…",
  "Checking current weather…",
  "Scoring and comparing routes…",
];

function LoadingState() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, LOADING_STEPS.length - 1)),
      3500
    );

    return () => clearInterval(timer);
  }, []);

  return (
    <Box aria-live="polite">
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {LOADING_STEPS[step]}
      </Typography>

      <LinearProgress sx={{ borderRadius: 2, mb: 1 }} />

      <Typography variant="caption" color="text.secondary">
        This uses free public map services and can take up to half a minute.
      </Typography>

      <Stack spacing={1.5} sx={{ mt: 2.5 }}>
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} variant="rounded" height={92} />
        ))}
      </Stack>
    </Box>
  );
}

const FACTORS = [
  { icon: <LocalHospitalOutlinedIcon fontSize="small" />, text: "Hospitals & police nearby" },
  { icon: <StorefrontOutlinedIcon fontSize="small" />, text: "Busy, active streets" },
  { icon: <NightlightOutlinedIcon fontSize="small" />, text: "Street lighting" },
  { icon: <WbCloudyOutlinedIcon fontSize="small" />, text: "Current weather" },
];

function IdleState() {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Plan a safer journey
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Enter a start and destination. LumaPath compares up to five routes
        and explains how each one scores on:
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1,
        }}
      >
        {FACTORS.map((factor) => (
          <Stack
            key={factor.text}
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              p: 1.25,
              borderRadius: 2,
              bgcolor: "#f1f5f9",
              color: "text.secondary",
            }}
          >
            {factor.icon}
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.primary" }}>
              {factor.text}
            </Typography>
          </Stack>
        ))}
      </Box>
    </Box>
  );
}

// Idle / loading / error / empty states for the route panel.
function RouteStatus({ status, error, onRetry }) {
  if (status === "loading") {
    return <LoadingState />;
  }

  if (status === "error") {
    return (
      <Alert
        severity="error"
        action={
          onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          )
        }
      >
        <AlertTitle>Couldn't analyse routes</AlertTitle>
        {error}
      </Alert>
    );
  }

  if (status === "empty") {
    return (
      <Alert severity="info">
        <AlertTitle>No routes found</AlertTitle>
        No route could be found between these places for this travel mode.
        Try another mode, or pick a point on a nearby road.
      </Alert>
    );
  }

  return <IdleState />;
}

export default RouteStatus;
