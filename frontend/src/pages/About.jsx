import { Link as RouterLink } from "react-router-dom";

import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { riskStyle } from "../theme";

const FACTORS = [
  {
    title: "Emergency access",
    text: "How close the route stays to a hospital or clinic, and to a police station, measured every 100 m along the route. Walking routes score best within about 500 m; the distance allowed grows for cycling and driving.",
  },
  {
    title: "Street activity",
    text: "How much of the route passes shops, cafés, banks, transit stops and similar places, as a rough sign that other people are around. Not scored for driving.",
  },
  {
    title: "Street lighting",
    text: "The share of mapped streets along the route tagged as lit in OpenStreetMap. Only scored when enough streets carry lighting information.",
  },
  {
    title: "Weather",
    text: "Current rain, wind, thunderstorms and visibility along the route, from Open-Meteo.",
  },
];

const LEVELS = [
  { level: "Lower risk", range: "75 – 100" },
  { level: "Moderate risk", range: "55 – 74" },
  { level: "Higher risk", range: "0 – 54" },
];

function About() {
  return (
    <Box sx={{ bgcolor: "background.default" }}>
      <Navbar />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 9 } }}>
        <Typography variant="h3" sx={{ fontSize: { xs: 30, md: 40 }, mb: 2 }}>
          How LumaPath scores routes
        </Typography>

        <Typography color="text.secondary" sx={{ fontSize: 18, mb: 5, lineHeight: 1.7 }}>
          Most navigation apps optimise for the shortest or quickest trip.
          LumaPath also looks at the surroundings of each route and gives a
          safety score from 0 to 100, with the reasons behind it.
        </Typography>

        <Typography variant="h5" sx={{ mb: 2 }}>
          The four factors
        </Typography>

        <Stack spacing={1.5} sx={{ mb: 5 }}>
          {FACTORS.map((factor) => (
            <Paper key={factor.title} variant="outlined" sx={{ p: 2.5 }}>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{factor.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                {factor.text}
              </Typography>
            </Paper>
          ))}
        </Stack>

        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Day and night
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          After dark, lighting and street activity count for more and weather
          for less. Factors are measured along the length of the route, so a
          longer route doesn't score higher just because it passes more
          places.
        </Typography>

        <Typography variant="h5" sx={{ mb: 2 }}>
          Risk levels
        </Typography>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 5 }}>
          {LEVELS.map(({ level, range }) => {
            const colors = riskStyle(level);

            return (
              <Paper
                key={level}
                elevation={0}
                sx={{ flex: 1, p: 2, bgcolor: colors.bg, color: colors.main }}
              >
                <Typography sx={{ fontWeight: 800 }}>{level.replace("risk", "Risk")}</Typography>
                <Typography variant="body2">Score {range}</Typography>
              </Paper>
            );
          })}
        </Stack>

        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Confidence and missing data
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          The data comes from free public services that are sometimes busy.
          If a data source doesn't respond, that factor is left out instead
          of being counted as zero, and the route shows lower confidence. If
          too little data is available, no score is shown at all.
        </Typography>

        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Route options
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          <strong>Safest</strong> is the route with the highest safety score
          and is always the one recommended. <strong>Balanced</strong> weighs
          safety against time and distance. <strong>Time-efficient</strong>{" "}
          is the quickest route, still with its safety information shown.
        </Typography>

        <Alert severity="warning" sx={{ mb: 5 }}>
          A safety score is an estimate based on available open data. It is
          not a guarantee that a route is safe. Map data can be incomplete or
          out of date, and conditions change. Stay aware of your
          surroundings and call 112 in an emergency.
        </Alert>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Data sources: OpenStreetMap contributors (roads, places, lighting),
          OSRM (routing), Photon (place search), Open-Meteo (weather). An
          experimental machine-learning estimate is shown for comparison but
          is not used to rank routes.
        </Typography>

        <Button component={RouterLink} to="/map" variant="contained" size="large">
          Plan a route
        </Button>
      </Container>

      <Footer />
    </Box>
  );
}

export default About;
