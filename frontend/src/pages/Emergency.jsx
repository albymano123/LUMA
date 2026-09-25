import { useState } from "react";
import { Ambulance, Baby, Copy, Flame, HeartHandshake, MapPinned, Phone, Share2, ShieldAlert, Siren, UserRound } from "lucide-react";

import { HELPLINES, SAFETY_TIPS } from "../config/emergency";
import Footer from "../layout/Footer";
import Navbar from "../layout/Navbar";
import { Button, Notice, Reveal, useToast } from "../ui";
import "./pages.css";

const ICONS = {
  100: <ShieldAlert size={22} aria-hidden="true" />,
  108: <Ambulance size={22} aria-hidden="true" />,
  101: <Flame size={22} aria-hidden="true" />,
  1091: <HeartHandshake size={22} aria-hidden="true" />,
  1098: <Baby size={22} aria-hidden="true" />,
  14567: <UserRound size={22} aria-hidden="true" />,
};

// Builds a message with a map link to where the user is right now. Nothing
// is sent anywhere by LumaPath: the user chooses who receives it.
function ShareLocation() {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const locate = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Location is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve(coords),
        (error) => reject(new Error(error.code === 1 ? "Location permission was denied. Allow it in your browser to share where you are." : "Your location is unavailable right now.")),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
      );
    });

  const share = async () => {
    setBusy(true);

    try {
      const { latitude, longitude } = await locate();
      const link = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=17/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
      const text = `I need help. My location: ${link}`;

      setMessage(text);

      if (navigator.share) {
        await navigator.share({ text }).catch(() => {});
      }
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      notify("Message copied.");
    } catch {
      notify("Couldn't copy. Select the message and copy it manually.");
    }
  };

  return (
    <div className="share">
      <div className="share__head">
        <span className="icon-tile"><MapPinned size={22} aria-hidden="true" /></span>
        <div>
          <h3>Share where you are</h3>
          <p>Get a message with a map link to your current location, ready to send to someone you trust.</p>
        </div>
      </div>

      <Button variant="secondary" loading={busy} onClick={share} icon={<Share2 size={16} aria-hidden="true" />}>
        Share my location
      </Button>

      {message && (
        <div className="share__result">
          <p className="share__text" data-testid="share-message">{message}</p>
          <div className="share__actions">
            <Button size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true" />} onClick={copy}>Copy</Button>
            <Button as="a" size="sm" variant="secondary" href={`sms:?&body=${encodeURIComponent(message)}`}>Send by SMS</Button>
          </div>
        </div>
      )}

      <p className="share__note">LumaPath doesn't store or send your location. It is used once, in your browser, to build this message.</p>
    </div>
  );
}

export default function Emergency() {
  const featured = HELPLINES.find((line) => line.featured);
  const others = HELPLINES.filter((line) => !line.featured);

  return (
    <div className="lp-page">
      <Navbar />

      <main id="main">
        <section className="page-hero page-hero--danger on-dark">
          <div className="container">
            <Reveal className="page-hero__inner">
              <span className="eyebrow" style={{ color: "var(--red-400)" }}><Siren size={14} aria-hidden="true" /> Emergency help</span>
              <h1>In danger? Call for help now.</h1>
              <p className="lead">
                {featured.number} is India's single emergency number for police, fire and ambulance. It works from any phone.
              </p>

              <a className="sos" href={`tel:${featured.number}`} aria-label={`Call emergency number ${featured.number}`}>
                <span className="sos__pulse" aria-hidden="true" />
                <Phone size={26} aria-hidden="true" />
                <span className="sos__text">
                  <strong>Emergency SOS</strong>
                  <span>Tap to call {featured.number}</span>
                </span>
                <span className="sos__number">{featured.number}</span>
              </a>
            </Reveal>
          </div>
        </section>

        <section className="section section--white">
          <div className="container">
            <Reveal>
              <h2 className="h-section">Helplines</h2>
              <p className="lead" style={{ marginTop: 8 }}>National numbers for India. Tap a number to call.</p>
            </Reveal>

            <div className="helplines">
              {others.map((line, index) => (
                <Reveal key={line.number} delay={index * 0.05}>
                  <a className="helpline" href={`tel:${line.number}`}>
                    <span className="helpline__icon">{ICONS[line.number]}</span>
                    <span className="helpline__text">
                      <strong>{line.name}</strong>
                      <span>{line.text}</span>
                    </span>
                    <span className="helpline__number">
                      <Phone size={15} aria-hidden="true" />
                      {line.number}
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section section--tint">
          <div className="container emergency-grid">
            <Reveal>
              <ShareLocation />
            </Reveal>

            <Reveal delay={0.08}>
              <div className="tips">
                <h2 className="h-section" style={{ fontSize: "var(--fs-h3)" }}>Staying safe in an unfamiliar area</h2>
                <ul role="list">
                  {SAFETY_TIPS.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
                <Notice tone="warning" title="LumaPath is not an emergency service">
                  It helps you choose a route. It cannot call for help or track you. In an emergency, call 112.
                </Notice>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
