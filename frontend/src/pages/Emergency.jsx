import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import PhoneIcon from "@mui/icons-material/Phone";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import EmergencySOS from "../components/EmergencySOS";

// National helplines in India.
const HELPLINES = [
  { number: "112", name: "Emergency Response", text: "Police, fire and ambulance – works from any phone." },
  { number: "100", name: "Police", text: "Direct line to the police." },
  { number: "108", name: "Ambulance", text: "Medical emergencies and ambulance." },
  { number: "101", name: "Fire", text: "Fire and rescue services." },
  { number: "1091", name: "Women Helpline", text: "For women in distress." },
  { number: "1098", name: "Childline", text: "For children in need of care and protection." },
  { number: "14567", name: "Elderline", text: "Support for senior citizens." },
];

const TIPS = [
  "Share your route and expected arrival time with someone you trust.",
  "Prefer busy, well-lit streets after dark, even if they take a little longer.",
  "Keep your phone charged and know the nearest hospital or police station on your route.",
  "If something feels wrong, move towards open shops or crowded places and call 112.",
];

function Emergency() {
  return (
    <Box sx={{ bgcolor: "background.default" }}>
      <Navbar />

      <Container maxWidth="md" sx={{ py: { xs: 6, md: 9 } }}>
        <Typography variant="h3" sx={{ fontSize: { xs: 30, md: 40 }, mb: 1.5 }}>
          Emergency help
        </Typography>

        <Typography color="text.secondary" sx={{ mb: 4 }}>
          National helpline numbers for India. Tap a number to call.
        </Typography>

        <EmergencySOS />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
            gap: 1.5,
            mt: 3,
          }}
        >
          {HELPLINES.map((line) => (
            <Paper key={line.number} variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 700 }}>{line.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {line.text}
                  </Typography>
                </Box>

                <Button
                  href={`tel:${line.number}`}
                  variant="outlined"
                  startIcon={<PhoneIcon />}
                  aria-label={`Call ${line.name} on ${line.number}`}
                >
                  {line.number}
                </Button>
              </Stack>
            </Paper>
          ))}
        </Box>

        <Typography variant="h5" sx={{ mt: 6, mb: 2 }}>
          Travelling somewhere unfamiliar
        </Typography>

        <Stack component="ul" spacing={1} sx={{ pl: 2.5, m: 0 }}>
          {TIPS.map((tip) => (
            <Typography component="li" key={tip} color="text.secondary">
              {tip}
            </Typography>
          ))}
        </Stack>
      </Container>

      <Footer />
    </Box>
  );
}

export default Emergency;
