import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import LocalPoliceIcon from "@mui/icons-material/LocalPolice";
import SosIcon from "@mui/icons-material/Sos";

// Quick-dial emergency numbers (India).
function EmergencySOS() {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 3, md: 4 },
        borderColor: "#fecaca",
        bgcolor: "#fff5f5",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={3}
        sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              bgcolor: "#dc2626",
              color: "#fff",
              flexShrink: 0,
            }}
          >
            <SosIcon />
          </Box>

          <Box>
            <Typography variant="h6">In danger? Call for help now.</Typography>
            <Typography variant="body2" color="text.secondary">
              112 is India's single emergency number for police, fire and
              ambulance.
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <Button
            href="tel:112"
            variant="contained"
            color="error"
            size="large"
            startIcon={<LocalPoliceIcon />}
          >
            Call 112
          </Button>

          <Button
            href="tel:108"
            variant="outlined"
            color="error"
            size="large"
            startIcon={<LocalHospitalIcon />}
            sx={{ bgcolor: "#fff" }}
          >
            Ambulance 108
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export default EmergencySOS;
