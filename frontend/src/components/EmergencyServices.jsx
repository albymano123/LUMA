import { useState } from "react";

import {
  Box,
  Button,
  Link,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import LocalPoliceIcon from "@mui/icons-material/LocalPolice";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import PhoneIcon from "@mui/icons-material/Phone";

import { formatMetres } from "../lib/format";

const KIND = {
  hospital: { label: "Hospital", icon: <LocalHospitalIcon fontSize="small" sx={{ color: "#e11d48" }} /> },
  clinic: { label: "Clinic", icon: <LocalHospitalIcon fontSize="small" sx={{ color: "#f43f5e" }} /> },
  police: { label: "Police station", icon: <LocalPoliceIcon fontSize="small" sx={{ color: "#1d4ed8" }} /> },
  fire_station: { label: "Fire station", icon: <LocalFireDepartmentIcon fontSize="small" sx={{ color: "#ea580c" }} /> },
};

const TABS = [
  { value: "medical", label: "Medical", kinds: ["hospital", "clinic"] },
  { value: "police", label: "Police", kinds: ["police"] },
  { value: "fire", label: "Fire", kinds: ["fire_station"] },
];

const PAGE_SIZE = 5;

// Emergency services the backend found near the selected route.
function EmergencyServices({ services, available, onFocus }) {
  const [tab, setTab] = useState("medical");
  const [expanded, setExpanded] = useState(false);

  if (!available) {
    return (
      <Typography variant="body2" color="text.secondary">
        Emergency-service data could not be loaded right now, so nearby
        hospitals and police stations are not shown. This does not mean
        there are none.
      </Typography>
    );
  }

  const current = TABS.find((t) => t.value === tab);
  const list = services.filter((s) => current.kinds.includes(s.kind));
  const visible = expanded ? list : list.slice(0, PAGE_SIZE);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, value) => {
          setTab(value);
          setExpanded(false);
        }}
        variant="fullWidth"
        sx={{ minHeight: 36, mb: 1, "& .MuiTab-root": { minHeight: 36, py: 0.5 } }}
      >
        {TABS.map((t) => (
          <Tab
            key={t.value}
            value={t.value}
            label={`${t.label} (${services.filter((s) => t.kinds.includes(s.kind)).length})`}
          />
        ))}
      </Tabs>

      {list.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          None mapped close to this route in OpenStreetMap.
        </Typography>
      )}

      <Stack spacing={0.5}>
        {visible.map((service) => (
          <Stack
            key={service.id}
            direction="row"
            spacing={1.25}
            sx={{
              alignItems: "flex-start",
              p: 1,
              borderRadius: 2,
              cursor: onFocus ? "pointer" : "default",
              "&:hover": onFocus ? { bgcolor: "action.hover" } : undefined,
            }}
            onClick={() => onFocus?.(service)}
          >
            <Box sx={{ mt: "2px" }}>{KIND[service.kind]?.icon}</Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {service.name || `Unnamed ${KIND[service.kind]?.label.toLowerCase()}`}
              </Typography>

              <Typography variant="caption" color="text.secondary" component="p">
                {formatMetres(service.distance_m)} from route · about{" "}
                {service.along_route_km} km along
                {service.emergency_ward ? " · Emergency department" : ""}
              </Typography>
            </Box>

            {service.phone && (
              <Link
                href={`tel:${service.phone.split(/[;,]/)[0].trim()}`}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Call ${service.name || "this service"}`}
                sx={{ display: "flex", alignItems: "center", mt: "2px" }}
              >
                <PhoneIcon fontSize="small" />
              </Link>
            )}
          </Stack>
        ))}
      </Stack>

      {expanded && list.length >= 15 && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ px: 1 }}>
          Showing the 15 closest to the route.
        </Typography>
      )}

      {list.length > PAGE_SIZE && (
        <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ mt: 0.5 }}>
          {expanded ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </Box>
  );
}

export default EmergencyServices;
