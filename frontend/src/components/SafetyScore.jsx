import {
  Box,
  Chip,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";

import { riskStyle } from "../theme";
import {
  CONFIDENCE_HELP,
  CONFIDENCE_LABELS,
  formatRiskLevel,
} from "../lib/format";

// Displays the backend's safety assessment. The backend is the single
// source of truth: nothing here calculates or adjusts a score.

export function ScoreRing({ score, level, size = 84 }) {
  const colors = riskStyle(level);
  const value = score ?? 0;

  return (
    <Box
      sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      role="img"
      aria-label={score == null ? "No safety score" : `Safety score ${score} out of 100`}
    >
      <Box
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          background:
            score == null
              ? "#e2e8f0"
              : `conic-gradient(${colors.main} ${value * 3.6}deg, #e2e8f0 0deg)`,
        }}
      />

      <Box
        sx={{
          position: "absolute",
          inset: size * 0.1,
          borderRadius: "50%",
          bgcolor: "background.paper",
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <Box>
          <Typography
            sx={{ fontWeight: 800, fontSize: size * 0.3, lineHeight: 1, color: colors.main }}
          >
            {score ?? "–"}
          </Typography>

          <Typography sx={{ fontSize: size * 0.13, color: "text.secondary" }}>
            / 100
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export function RiskChip({ level, size = "small" }) {
  const colors = riskStyle(level);

  return (
    <Chip
      size={size}
      label={formatRiskLevel(level)}
      sx={{ bgcolor: colors.bg, color: colors.main }}
    />
  );
}

export function ConfidenceChip({ confidence }) {
  return (
    <Tooltip title={CONFIDENCE_HELP[confidence] || ""}>
      <Chip
        size="small"
        variant="outlined"
        icon={<InfoOutlinedIcon />}
        label={CONFIDENCE_LABELS[confidence] || "Unknown confidence"}
      />
    </Tooltip>
  );
}

function FactorBar({ factor }) {
  let status = null;

  if (!factor.applicable) {
    status = "Not scored for this travel mode";
  } else if (!factor.available) {
    status = "No data – not scored";
  }

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {factor.label}
        </Typography>

        <Typography variant="body2" color="text.secondary">
          {status ?? `${factor.score}/100`}
        </Typography>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={status ? 0 : factor.score}
        aria-label={`${factor.label} ${status ?? `${factor.score} out of 100`}`}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: "#e2e8f0",
          opacity: status ? 0.5 : 1,
          "& .MuiLinearProgress-bar": {
            borderRadius: 3,
            bgcolor:
              factor.score >= 75 ? "#16a34a" : factor.score >= 55 ? "#d97706" : "#dc2626",
          },
        }}
      />
    </Box>
  );
}

const IMPACT_ICONS = {
  positive: <AddCircleOutlineIcon fontSize="small" sx={{ color: "#16a34a" }} />,
  negative: <RemoveCircleOutlineIcon fontSize="small" sx={{ color: "#dc2626" }} />,
  neutral: <InfoOutlinedIcon fontSize="small" sx={{ color: "#64748b" }} />,
};

export function ScoreReasons({ explanations }) {
  if (!explanations?.length) {
    return null;
  }

  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: "none", p: 0, m: 0 }}>
      {explanations.map((note) => (
        <Stack
          component="li"
          key={note.text}
          direction="row"
          spacing={1}
          sx={{ alignItems: "flex-start" }}
        >
          <Box sx={{ mt: "1px" }}>{IMPACT_ICONS[note.impact]}</Box>
          <Typography variant="body2">{note.text}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function SafetyScore({ route }) {
  if (!route) {
    return null;
  }

  // Factors with weight 0 don't apply to this mode (e.g. street
  // activity when driving); list them last.
  const factors = [...route.factors].sort(
    (a, b) => Number(b.applicable) - Number(a.applicable)
  );

  return (
    <Box>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <ScoreRing score={route.safety_score} level={route.risk_level} />

        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            Safety score
          </Typography>

          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mt: 0.5 }}>
            <RiskChip level={route.risk_level} />
            <ConfidenceChip confidence={route.data_confidence} />
          </Stack>

          {route.safety_score == null && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Not enough safety data is available right now to score this
              route. Try again in a moment.
            </Typography>
          )}
        </Box>
      </Stack>

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1.5 }}>
        Why this score
      </Typography>

      <ScoreReasons explanations={route.explanations} />

      <Typography variant="subtitle2" sx={{ mt: 3, mb: 1.5 }}>
        Score breakdown
      </Typography>

      <Stack spacing={1.5}>
        {factors.map((factor) => (
          <FactorBar key={factor.key} factor={factor} />
        ))}
      </Stack>
    </Box>
  );
}

export default SafetyScore;
