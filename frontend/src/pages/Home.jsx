import { Box, Container } from "@mui/material";

import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import Features from "../components/Features";
import EmergencySOS from "../components/EmergencySOS";
import Footer from "../components/Footer";

// Landing page. Route planning lives on /map (MapPage).
function Home() {
  return (
    <Box sx={{ bgcolor: "background.default" }}>
      <Navbar />

      <Hero />

      <Features />

      <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 11 } }}>
        <EmergencySOS />
      </Container>

      <Footer />
    </Box>
  );
}

export default Home;
