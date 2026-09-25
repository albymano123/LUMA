import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Menu, Phone, X } from "lucide-react";

import { useIndicator } from "../lib/hooks";
import { Logo } from "./Logo";
import "./layout.css";

const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/map", label: "Plan a route" },
  { to: "/about", label: "How it works" },
  { to: "/emergency", label: "Emergency", urgent: true },
];

function activeKey(pathname) {
  const match = LINKS.find((link) => (link.end ? pathname === link.to : pathname.startsWith(link.to)));
  return match?.to ?? "";
}

export default function Navbar({ solid = false }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [listRef, indicatorStyle] = useIndicator(activeKey(pathname));
  const menuButton = useRef(null);

  // Close the menu when the page changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // A soft background appears once the page scrolls under the bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu and returns focus to its button.
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`lp-nav on-dark ${solid || scrolled || open ? "lp-nav--solid" : ""}`}>
      <div className="lp-nav__bar">
        <Link to="/" className="lp-nav__brand" aria-label="LumaPath home">
          <Logo />
        </Link>

        <nav className="lp-nav__desktop" aria-label="Main">
          <ul ref={listRef} className="lp-nav__list" style={indicatorStyle} role="list">
            <span className="lp-nav__indicator" aria-hidden="true" />

            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `lp-nav__link ${isActive ? "is-active" : ""}`}
                  data-active={activeKey(pathname) === link.to}
                >
                  {link.urgent && <span className="lp-nav__dot" aria-hidden="true" />}
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <a href="tel:112" className="lp-nav__sos" aria-label="Call emergency number 112">
          <Phone size={15} aria-hidden="true" />
          <span>112</span>
        </a>

        <button
          ref={menuButton}
          type="button"
          className="lp-nav__toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="lp-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <m.nav
            id="lp-mobile-menu"
            className="lp-nav__mobile"
            aria-label="Main"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ul role="list">
              {LINKS.map((link, index) => (
                <m.li
                  key={link.to}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * index, duration: 0.25 }}
                >
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => `lp-nav__mlink ${isActive ? "is-active" : ""}`}
                  >
                    {link.urgent && <span className="lp-nav__dot" aria-hidden="true" />}
                    {link.label}
                  </NavLink>
                </m.li>
              ))}
            </ul>
          </m.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
