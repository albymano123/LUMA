import L from "./leaflet";
import { formatHours, formatMetres } from "../lib/format";

// Small inline icons (the same shapes as the Lucide set the app uses),
// written out so markers need no React rendering.
const SVG = (paths) =>
  `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  hospital: SVG('<path d="M12 6v12M6 12h12"/>'),
  clinic: SVG('<path d="M12 7v10M7 12h10"/>'),
  police: SVG('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
  fire_station: SVG('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
};

export const SERVICE_LABELS = {
  hospital: "Hospital",
  clinic: "Clinic",
  police: "Police station",
  fire_station: "Fire station",
};

export function pinIcon(kind, content = "", size = 34, delay = 0) {
  return L.divIcon({
    className: `lp-pin lp-pin--${kind}`,
    html: `<span class="lp-pin__pulse"></span><span class="lp-pin__body" style="animation-delay:${delay}ms">${content}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 + 4],
  });
}

export const endpointIcons = {
  start: pinIcon("start", "A", 34),
  end: pinIcon("end", "B", 34),
};

// The live-navigation position "puck": a heading cone (when the device
// reports one) over a solid dot, distinct from the A/B place pins above
// so it reads immediately as "this is you, moving" rather than a place.
export function liveLocationIcon(heading) {
  const cone = Number.isFinite(heading)
    ? `<span class="lp-puck__cone" style="transform:translate(-50%,-100%) rotate(${heading}deg)"></span>`
    : "";

  return L.divIcon({
    className: "lp-puck",
    html: `${cone}<span class="lp-puck__dot"></span><span class="lp-puck__ring"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export const serviceIcon = (kind, index) =>
  pinIcon(kind, ICONS[kind] ?? ICONS.hospital, 30, Math.min(index * 35, 500));

export function clusterIcon(cluster) {
  const count = cluster.getChildCount();

  return L.divIcon({
    className: "lp-cluster",
    html: `<span>${count}</span>`,
    iconSize: [38, 38],
  });
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

/**
 * Popup for an emergency service. Only information the backend supplied is
 * shown: hours and phone appear when they were mapped, never otherwise.
 */
export function servicePopup(service, routeName) {
  const label = SERVICE_LABELS[service.kind] ?? "Service";
  const name = service.name || `Unnamed ${label.toLowerCase()}`;
  const hours = formatHours(service.opening_hours);
  const phone = service.phone?.split(/[;,]/)[0].trim();

  const rows = [`<div class="lp-popup__meta">${escapeHtml(label)} &middot; ${escapeHtml(formatMetres(service.distance_m))} from ${escapeHtml(routeName)}</div>`];

  if (service.emergency_ward) rows.push('<div class="lp-popup__tag">Emergency department</div>');
  if (hours) rows.push(`<div class="lp-popup__row">Hours: ${escapeHtml(hours)}</div>`);
  if (phone) rows.push(`<a class="lp-popup__call" href="tel:${escapeHtml(phone)}">Call ${escapeHtml(phone)}</a>`);

  return `<div class="lp-popup"><strong class="lp-popup__title">${escapeHtml(name)}</strong>${rows.join("")}</div>`;
}
