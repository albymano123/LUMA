import { Link as RouterLink } from "react-router-dom";

import { Box, Button, Chip, Container, Paper, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

import { brand, riskStyle } from "../theme";

// Illustrative only: shows what the route comparison looks like.
const PREVIEW_ROUTES = [
  { name: "Route C", score: 92, level: "Lower risk", meta: "24 min · 1.9 km", recommended: true },
  { name: "Route A", score: 74, level: "Moderate risk", meta: "19 min · 1.5 km" },
  { name: "Route B", score: 51, level: "Higher risk", meta: "21 min · 1.7 km" },
];

function PreviewCard() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 4,
        bgcolor: "rgba(255,255,255,0.97)",
        boxShadow: "0 30px 60px rgba(2,6,23,0.45)",
        width: "100%",
        maxWidth: 380,
      }}
      aria-label="Example of a route comparison"
    >
      <Typography variant="overline" color="text.secondary">
        Example comparison
      </Typography>

      <Stack spacing={1.25} sx={{ mt: 0.5 }}>
        {PREVIEW_ROUTES.map((route) => {
          const colors = riskStyle(route.level);

          return (
            <Stack
              key={route.name}
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
                p: 1.25,
                borderRadius: 2.5,
                border: 1,
                borderColor: route.recommended ? "primary.main" : "divider",
                borderWidth: route.recommended ? 2 : 1,
              }}
            >
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  bgcolor: colors.bg,
                  color: colors.main,
                  fontWeight: 800,
                }}
              >
                {route.score}
              </Box>

              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {route.name}
                  </Typography>

                  {route.recommended && (
                    <Chip size="small" color="success" icon={<StarRoundedIcon />} label="Recommended" sx={{ height: 20 }} />
                  )}
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  {route.meta} ·{" "}
                  <Box component="span" sx={{ color: colors.main, fontWeight: 600 }}>
                    {route.level.replace("risk", "Risk")}
                  </Box>
                </Typography>
              </Box>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

function Hero() {
  return (
    <Box
      component="section"
      sx={{
        color: "#fff",
        background: `radial-gradient(1200px 500px at 85% -10%, rgba(56,189,248,0.35), transparent 60%), linear-gradient(135deg, ${brand.navy}, ${brand.deepBlue})`,
        py: { xs: 8, md: 12 },
      }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 6, md: 8 }}
          sx={{ alignItems: "center" }}
        >
          <Box sx={{ flex: 1 }}>
            <Chip
              label="Safety-aware navigation"
              sx={{ bgcolor: "rgba(56,189,248,0.15)", color: brand.sky, mb: 2.5 }}
            />

            <Typography
              variant="h1"
              sx={{ fontSize: { xs: 40, md: 58 }, lineHeight: 1.05, mb: 2.5 }}
            >
              Don't just take the fastest way.{" "}
              <Box component="span" sx={{ color: brand.sky }}>
                Take a lower-risk one.
              </Box>
            </Typography>

            <Typography
              sx={{ fontSize: { xs: 17, md: 19 }, color: "rgba(255,255,255,0.8)", maxWidth: 560, lineHeight: 1.6 }}
            >
              LumaPath compares routes using open data on nearby hospitals
              and police, street activity, lighting and live weather, and
              explains why each route scores the way it does. Made for
              anyone finding their way somewhere new.
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 4 }}>
              <Button
                component={RouterLink}
                to="/map"
                variant="contained"
                size="large"
                endIcon={<ArrowForwardIcon />}
                sx={{ bgcolor: brand.sky, color: brand.navy, "&:hover": { bgcolor: "#7dd3fc" }, px: 3 }}
              >
                Plan a route
              </Button>

              <Button
                component={RouterLink}
                to="/about"
                size="large"
                sx={{ color: "#fff", border: "1px solid rgba(255,255,255,0.3)", px: 3 }}
              >
                How scores work
              </Button>
            </Stack>
          </Box>

          <Box sx={{ flex: "0 0 auto", width: { xs: "100%", md: 380 }, display: "flex", justifyContent: "center" }}>
            <PreviewCard />
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

export default Hero;
