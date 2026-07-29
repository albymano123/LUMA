import { searchLocation } from "../services/geocodingService";
import "./RouteForm.css";

function RouteForm({
  source,
  setSource,
  destination,
  setDestination,
  setSourceCoords,
  setDestinationCoords,
}) {
  const handleFindRoute = async () => {
    if (!source || !destination) {
      alert("Please enter both source and destination.");
      return;
    }

    try {
      const sourceResult = await searchLocation(source);
      const destinationResult = await searchLocation(destination);
console.log("Source Result:", sourceResult);
console.log("Destination Result:", destinationResult);
      if (sourceResult.length > 0) {
        setSourceCoords([
          parseFloat(sourceResult[0].lat),
          parseFloat(sourceResult[0].lon),
        ]);
      }

      if (destinationResult.length > 0) {
        setDestinationCoords([
          parseFloat(destinationResult[0].lat),
          parseFloat(destinationResult[0].lon),
        ]);
      }

      console.log("Source:", sourceResult);
      console.log("Destination:", destinationResult);
    } catch (error) {
      console.error(error);
      alert("Unable to fetch locations.");
    }
  };

  return (
    <div className="route-form">
      <h2>Find Safe Route</h2>

      <input
        type="text"
        placeholder="Enter Source"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />

      <input
        type="text"
        placeholder="Enter Destination"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
      />

      <button onClick={handleFindRoute}>
        Find Safe Route
      </button>
    </div>
  );
}

export default RouteForm;