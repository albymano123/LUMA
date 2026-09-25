import { useState } from "react";
import { Link as RouterLink, NavLink } from "react-router-dom";

import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";

import { brand } from "../theme";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/map", label: "Plan a route" },
  { to: "/about", label: "How it works" },
  { to: "/emergency", label: "Emergency" },
];

export function Logo({ compact = false }) {
  return (
    <Box
      component={RouterLink}
      to="/"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: "9px",
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(135deg, ${brand.sky}, #2563eb)`,
        }}
      >
        <ShieldOutlinedIcon sx={{ fontSize: 19, color: "#fff" }} />
      </Box>

      {!compact && (
        <Typography
          sx={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em" }}
        >
          LumaPath
        </Typography>
      )}
    </Box>
  );
}

function Navbar({ dense = false }) {
  const [open, setOpen] = useState(false);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: brand.navy,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <Toolbar
        variant={dense ? "dense" : "regular"}
        sx={{ gap: 2, minHeight: dense ? 56 : 64 }}
      >
        <Logo />

        <Box sx={{ flex: 1 }} />

        <Box
          component="nav"
          sx={{ display: { xs: "none", md: "flex" }, gap: 0.5 }}
        >
          {LINKS.map((link) => (
            <Button
              key={link.to}
              component={NavLink}
              to={link.to}
              end
              sx={{
                color: "rgba(255,255,255,0.78)",
                px: 1.5,
                "&.active": {
                  color: "#fff",
                  bgcolor: "rgba(255,255,255,0.08)",
                },
                "&:hover": {
                  color: "#fff",
                  bgcolor: "rgba(255,255,255,0.06)",
                },
              }}
            >
              {link.label}
            </Button>
          ))}
        </Box>

        <IconButton
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          sx={{ display: { md: "none" }, color: "#fff" }}
        >
          <MenuIcon />
        </IconButton>
      </Toolbar>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <List sx={{ width: 240, pt: 2 }}>
          {LINKS.map((link) => (
            <ListItemButton
              key={link.to}
              component={NavLink}
              to={link.to}
              end
              onClick={() => setOpen(false)}
              sx={{ "&.active": { color: "primary.main", fontWeight: 700 } }}
            >
              <ListItemText primary={link.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
    </AppBar>
  );
}

export default Navbar;
