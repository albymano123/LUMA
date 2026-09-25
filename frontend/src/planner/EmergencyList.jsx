import { useState } from "react";
import { Clock, Crosshair, Flame, Hospital, Phone, Shield } from "lucide-react";

import { formatHours, formatMetres } from "../lib/format";
import { Badge, IconButton, SegmentedControl } from "../ui";

const KIND = {
  hospital: { label: "Hospital", tone: "#e11d48", Icon: Hospital },
  clinic: { label: "Clinic", tone: "#f43f5e", Icon: Hospital },
  police: { label: "Police station", tone: "#1d4ed8", Icon: Shield },
  fire_station: { label: "Fire station", tone: "#ea580c", Icon: Flame },
};

const TABS = [
  { value: "medical", label: "Medical", kinds: ["hospital", "clinic"] },
  { value: "police", label: "Police", kinds: ["police"] },
  { value: "fire", label: "Fire", kinds: ["fire_station"] },
];

const PAGE = 4;

/**
 * Emergency services the backend found near the selected route. Only what
 * OpenStreetMap contains is shown: hours and phone appear when mapped, and
 * are otherwise left out (never invented).
 */
export default function EmergencyList({ services, available, radiusKm, onFocus }) {
  const [tab, setTab] = useState("medical");
  const [expanded, setExpanded] = useState(false);

  if (!available) {
    return (
      <p className="muted-text">
        Emergency-service data could not be loaded right now, so nearby hospitals and police stations are
        not shown. This does not mean there are none.
      </p>
    );
  }

  const options = TABS.map((item) => ({
    ...item,
    label: `${item.label} (${services.filter((service) => item.kinds.includes(service.kind)).length})`,
  }));

  const current = TABS.find((item) => item.value === tab);
  const list = services.filter((service) => current.kinds.includes(service.kind));
  const visible = expanded ? list : list.slice(0, PAGE);

  return (
    <div className="el">
      <SegmentedControl label="Type of service" options={options} value={tab} onChange={(value) => { setTab(value); setExpanded(false); }} />

      {list.length === 0 ? (
        <p className="muted-text">
          None mapped within {radiusKm} km of this route. Call 112 in an emergency.
        </p>
      ) : (
        <ul className="el__list" role="list">
          {visible.map((service) => {
            const info = KIND[service.kind];
            const Icon = info.Icon;
            const hours = formatHours(service.opening_hours);
            const phone = service.phone?.split(/[;,]/)[0].trim();

            return (
              <li key={service.id} className="el__item">
                <span className="el__icon" style={{ background: info.tone }} aria-hidden="true"><Icon size={16} /></span>

                <div className="el__body">
                  <div className="el__name">{service.name || `Unnamed ${info.label.toLowerCase()}`}</div>
                  <div className="el__meta">
                    {info.label} · {formatMetres(service.distance_m)} from route
                  </div>

                  <div className="el__tags">
                    {service.emergency_ward && <Badge tone="danger">Emergency department</Badge>}
                    {hours && <Badge outline icon={<Clock size={11} aria-hidden="true" />}>{hours}</Badge>}
                  </div>
                </div>

                <div className="el__actions">
                  {phone && (
                    <IconButton as="a" label={`Call ${service.name || info.label}`} size="sm" variant="outline" href={`tel:${phone}`}>
                      <Phone size={15} aria-hidden="true" />
                    </IconButton>
                  )}
                  <IconButton label={`Show ${service.name || info.label} on the map`} size="sm" variant="outline" onClick={() => onFocus(service)}>
                    <Crosshair size={15} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > PAGE && (
        <button type="button" className="link-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}
