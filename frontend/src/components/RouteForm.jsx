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
  // Current Location
  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        console.log("Latitude:", latitude);
        console.log("Longitude:", longitude);
        console.log("Accuracy:", accuracy, "meters");

        // Update map source marker
        setSourceCoords([latitude, longitude]);

        // Update source input field
        setSource("Current Location");
      },

      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert("Location permission denied.");
            break;

          case error.POSITION_UNAVAILABLE:
            alert("Location information is unavailable.");
            break;

          case error.TIMEOUT:
            alert("Location request timed out.");
            break;

          default:
            alert("An unknown error occurred.");
        }

        console.error(error);
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  // Find Route
  const handleFindRoute = async () => {
    if (!source || !destination) {
      alert("Please enter both source and destination.");
      return;
    }

    try {
      // If source is typed manually, geocode it
      if (source !== "Current Location") {
        const sourceResult = await searchLocation(source);

        if (sourceResult.length > 0) {
          setSourceCoords([
            parseFloat(sourceResult[0].lat),
            parseFloat(sourceResult[0].lon),
          ]);
        } else {
          alert("Source location not found.");
          return;
        }
      }

      // Always geocode destination
      const destinationResult = await searchLocation(destination);

      if (destinationResult.length > 0) {
        setDestinationCoords([
          parseFloat(destinationResult[0].lat),
          parseFloat(destinationResult[0].lon),
        ]);
      } else {
        alert("Destination location not found.");
      }
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

      <button onClick={handleCurrentLocation}>
        📍 Use My Current Location
      </button>

      <button onClick={handleFindRoute}>
        Find Safe Route
      </button>
    </div>
  );
}

export default RouteForm;