import { useState } from "react";

function RouteForm() {
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");

  const handleFindRoute = () => {
    alert(`Source: ${source}\nDestination: ${destination}`);
  };

  return (
    <div>
      <h2>Find the Safest Route</h2>

      <div>
        <label>Source</label>
        <br />
        <input
          type="text"
          placeholder="Enter source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </div>

      <br />

      <div>
        <label>Destination</label>
        <br />
        <input
          type="text"
          placeholder="Enter destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        />
      </div>

      <br />

      <button onClick={handleFindRoute}>
        Find Safe Route
      </button>
    </div>
  );
}

export default RouteForm;