import { Link as RouterLink } from "react-router-dom";

import { Box, Container, Link, Stack, Typography } from "@mui/material";

import { brand } from "../theme";
import { Logo } from "./Navbar";

function Footer() {
  return (
    <Box
      component="footer"
      sx={{ bgcolor: brand.navy, color: "rgba(255,255,255,0.75)", py: 5 }}
    >
      <Container maxWidth="lg">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={3}
          sx={{ justifyContent: "space-between" }}
        >
          <Box sx={{ maxWidth: 420, color: "#fff" }}>
            <Logo />

            <Typography
              variant="body2"
              sx={{ mt: 1.5, color: "rgba(255,255,255,0.7)" }}
            >
              Safer routes, smarter journeys. Safety scores are estimates
              from open data and never a guarantee of safety.
            </Typography>
          </Box>

          <Stack direction="row" spacing={3} sx={{ alignItems: "flex-start" }}>
            <Link component={RouterLink} to="/map" underline="hover" color="inherit">
              Plan a route
            </Link>
            <Link component={RouterLink} to="/about" underline="hover" color="inherit">
              How it works
            </Link>
            <Link component={RouterLink} to="/emergency" underline="hover" color="inherit">
              Emergency
            </Link>
          </Stack>
        </Stack>

        <Typography
          variant="caption"
          component="p"
          sx={{ mt: 4, color: "rgba(255,255,255,0.5)" }}
        >
          © 2026 LumaPath · Map data © OpenStreetMap contributors · Weather
          by Open-Meteo
        </Typography>
      </Container>
    </Box>
  );
}

export default Footer;
