import { Box, Container, Paper, Stack, Typography } from "@mui/material";
import AltRouteIcon from "@mui/icons-material/AltRoute";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import LocalHospitalOutlinedIcon from "@mui/icons-material/LocalHospitalOutlined";
import NightlightOutlinedIcon from "@mui/icons-material/NightlightOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import HomeWorkOutlinedIcon from "@mui/icons-material/HomeWorkOutlined";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import WbCloudyOutlinedIcon from "@mui/icons-material/WbCloudyOutlined";

const FEATURES = [
  {
    icon: <AltRouteIcon />,
    title: "Up to five routes",
    text: "See the safest, a balanced and the quickest option side by side, for walking, cycling or driving.",
  },
  {
    icon: <FactCheckOutlinedIcon />,
    title: "Scores you can check",
    text: "Every score comes with plain-English reasons and a confidence level, so you know what it's based on.",
  },
  {
    icon: <LocalHospitalOutlinedIcon />,
    title: "Emergency services",
    text: "Hospitals, clinics, police and fire stations near your route, with distances and phone numbers where mapped.",
  },
];

const FACTORS = [
  { icon: <LocalHospitalOutlinedIcon fontSize="small" />, title: "Emergency access", text: "How close the route stays to hospitals and police." },
  { icon: <StorefrontOutlinedIcon fontSize="small" />, title: "Street activity", text: "Shops, cafés and transit stops along the way." },
  { icon: <HomeWorkOutlinedIcon fontSize="small" />, title: "Built-up surroundings", text: "Buildings nearby, and the longest empty stretch." },
  { icon: <NightlightOutlinedIcon fontSize="small" />, title: "Street lighting", text: "Roads mapped as lit, where the map has that detail." },
  { icon: <AltRouteOutlinedIcon fontSize="small" />, title: "Road exposure", text: "Fast main roads, sidewalks and speed limits." },
  { icon: <WbCloudyOutlinedIcon fontSize="small" />, title: "Weather", text: "Live rain, wind, storms and visibility." },
];

function Features() {
  return (
    <Box component="section" sx={{ py: { xs: 8, md: 11 } }}>
      <Container maxWidth="lg">
        <Typography variant="h3" sx={{ fontSize: { xs: 28, md: 36 }, mb: 1.5, textAlign: "center" }}>
          Navigation that explains itself
        </Typography>

        <Typography color="text.secondary" sx={{ textAlign: "center", maxWidth: 640, mx: "auto", mb: 6 }}>
          Built for students, tourists, young people, women travelling alone,
          older travellers and anyone unfamiliar with an area.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
            gap: 2.5,
          }}
        >
          {FEATURES.map((feature) => (
            <Paper key={feature.title} variant="outlined" sx={{ p: 3 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "#dbeafe",
                  color: "primary.main",
                  mb: 2,
                }}
              >
                {feature.icon}
              </Box>

              <Typography variant="h6" sx={{ mb: 1 }}>
                {feature.title}
              </Typography>

              <Typography color="text.secondary" variant="body2" sx={{ lineHeight: 1.65 }}>
                {feature.text}
              </Typography>
            </Paper>
          ))}
        </Box>

        <Paper variant="outlined" sx={{ mt: 2.5, p: { xs: 3, md: 4 }, bgcolor: "#f1f5f9", borderColor: "#e2e8f0" }}>
          <Typography variant="h6" sx={{ mb: 2.5 }}>
            What goes into a safety score
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
              gap: 2.5,
            }}
          >
            {FACTORS.map((factor) => (
              <Stack key={factor.title} spacing={0.75}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "primary.main" }}>
                  {factor.icon}
                  <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{factor.title}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {factor.text}
                </Typography>
              </Stack>
            ))}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default Features;
