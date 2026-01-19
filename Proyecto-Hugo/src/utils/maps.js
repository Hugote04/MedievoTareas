import { Loader } from "@googlemaps/js-api-loader";

let googleInstance = null;

const loader = new Loader({
    apiKey: "AIzaSyBdCjzSpmYr2Y16zJqzOKP4sJhgvcfb50A",
    version: "weekly",
    libraries: ["places", "marker"],
});

export async function getGoogleMaps() {
    if (googleInstance) {
        return googleInstance;
    }

    try {
        googleInstance = await loader.load();
        return googleInstance;
    } catch (error) {
        console.error("Error loading Google Maps:", error);
        throw error;
    }
}

export const defaultCenter = { lat: 40.416775, lng: -3.703790 }; // Madrid, Spain