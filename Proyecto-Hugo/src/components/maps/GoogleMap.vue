<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import { getGoogleMaps, defaultCenter } from '@/utils/maps';

// Props received from parent component
const props = defineProps({
  posts: {
    type: Array,
    required: true,
    default: () => []
  },
  height: {
    type: String,
    default: '500px'
  },
  zoom: {
    type: Number,
    default: 6
  },
  clickable: {
    type: Boolean,
    default: false
  },
  onLocationSelected: {
    type: Function,
    default: null
  },
  title: {
    type: String,
    default: ''
  },
  showActions: {
    type: Boolean,
    default: true
  },
  showClearButton: {
    type: Boolean,
    default: true
  }
});

// Reactive references
const mapContainer = ref(null);
const center = ref(defaultCenter);
const loading = ref(true);
const error = ref('');
const showLegend = ref(false);
let map = null;
let markers = [];
let infoWindow = null;

// Toggle map legend visibility
function toggleLegend() {
  showLegend.value = !showLegend.value;
}

// Initialize map
async function initMap() {
  if (!mapContainer.value) return;
  
  loading.value = true;
  error.value = '';
  
  try {
    const google = await getGoogleMaps();
    
    // Initialize the map
    map = new google.maps.Map(mapContainer.value, {
      center: center.value,
      zoom: props.zoom,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      mapTypeControl: true,
      streetViewControl: true,
      zoomControl: true,
      fullscreenControl: true,
      styles: [
        {
          "featureType": "landscape",
          "elementType": "all",
          "stylers": [{ "color": "#f5e9dc" }]
        },
        {
          "featureType": "poi",
          "elementType": "labels.text",
          "stylers": [{ "visibility": "off" }]
        },
        {
          "featureType": "water",
          "elementType": "all",
          "stylers": [{ "color": "#a5becc" }]
        }
      ]
    });

    // Create a shared info window
    infoWindow = new google.maps.InfoWindow({
      maxWidth: 300
    });
    
    // Add markers for all posts with location data
    addMarkers();
    
    // Add click listener if the map is clickable (for location selection)
    if (props.clickable && props.onLocationSelected) {
      map.addListener('click', (event) => {
        const location = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        
        // Call the callback with the selected location
        props.onLocationSelected(location);
        
        // Add a marker at the clicked location
        addTempMarker(location);
      });
    }
    
    loading.value = false;
  } catch (error) {
    console.error('Error initializing Google Maps:', error);
    error.value = 'No se pudo cargar el mapa. Por favor intente nuevamente.';
    loading.value = false;
  }
}

// Add a temporary marker for location selection
async function addTempMarker(location) {
  try {
    const google = await getGoogleMaps();
    
    // Clear existing temporary markers
    clearMarkers();
    
    // Create marker
    const marker = new google.maps.Marker({
      position: location,
      map: map,
      animation: google.maps.Animation.DROP,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: '#4285F4',
        fillOpacity: 0.6,
        strokeWeight: 2,
        strokeColor: '#ffffff',
        scale: 10
      }
    });
    
    // Store marker in array
    markers.push(marker);
    
    // Center map on the marker
    map.setCenter(location);
  } catch (error) {
    console.error('Error adding temporary marker:', error);
  }
}

// Add markers for posts with location data
async function addMarkers() {
  if (!map) return;
  
  try {
    const google = await getGoogleMaps();
    
    // Clear existing markers
    clearMarkers();
    
    // Add new markers for each post
    props.posts.forEach(post => {
      if (post.location && post.location.lat && post.location.lng) {
        // Determine marker style based on post content
        let markerIcon = {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: post.completed ? '#4CAF50' : '#8b4513',
          fillOpacity: 0.7,
          strokeWeight: 1.5,
          strokeColor: '#ffffff',
          scale: 12
        };
        
        // Use different icon styles for posts with special features
        if (post.imageUrl) {
          markerIcon.fillColor = '#673AB7'; // Purple for posts with images
        }
        
        if (post.body && post.body.length > 280) {
          markerIcon.scale = 14; // Larger icon for posts with long text
        }
        
        // Create marker with custom icon
        const marker = new google.maps.Marker({
          position: post.location,
          map: map,
          title: post.title,
          animation: google.maps.Animation.DROP,
          icon: markerIcon
        });
        
        // Enhanced content for info window with Material Design styling
        const contentString = `
          <div class="info-window md-info-window">
            <div class="info-window-header" style="background-color: ${post.completed ? '#4CAF50' : '#8b4513'};">
              <h3>${post.title || 'Sin título'} ${post.completed ? '✅' : ''}</h3>
            </div>
            <div class="info-window-body">
              ${post.imageUrl ? `<div class="info-window-image">
                <img src="${post.imageUrl}" alt="Imagen del post" loading="lazy" />
              </div>` : ''}
              <p>${post.body?.substring(0, 120) || 'No hay contenido'}${post.body?.length > 120 ? '...' : ''}</p>
              <div class="info-window-footer">
                <div class="info-window-author">
                  <img src="${post.avatar || 'default-avatar.png'}" class="author-avatar" alt="${post.author}" />
                  <span>${post.author || 'Anónimo'}</span>
                </div>
                ${post.likes ? `<div class="info-window-likes">
                  <span class="material-icons">favorite</span>
                  <span>${post.likes}</span>
                </div>` : ''}
              </div>
            </div>
          </div>
        `;
        
        // Add click listener to show info window with animation
        marker.addListener("click", () => {
          if (infoWindow.getMap()) {
            infoWindow.close();
          }
          
          setTimeout(() => {
            infoWindow.setContent(contentString);
            infoWindow.open({
              anchor: marker,
              map,
              shouldFocus: false
            });
            
            // Add bounce animation to the marker
            marker.setAnimation(google.maps.Animation.BOUNCE);
            setTimeout(() => marker.setAnimation(null), 750);
          }, 150);
        });
        
        // Store marker in array
        markers.push(marker);
      }
    });
    
    // Use marker clustering if there are many markers
    if (markers.length > 10) {
      // This would normally use MarkerClusterer, but we'll just set a better viewing boundary
      const bounds = new google.maps.LatLngBounds();
      markers.forEach(marker => {
        bounds.extend(marker.getPosition());
      });
      map.fitBounds(bounds);
    } 
    // Center map on first marker if available
    else if (markers.length > 0) {
      map.setCenter(markers[0].getPosition());
    }
  } catch (error) {
    console.error('Error adding markers:', error);
  }
}

// Clear all markers from the map
function clearMarkers() {
  for (let marker of markers) {
    marker.setMap(null);
  }
  markers = [];
  
  if (infoWindow) {
    infoWindow.close();
  }
}

// Function to recenter the map
function recenterMap() {
  if (!map) return;
  
  if (markers.length > 0) {
    map.setCenter(markers[0].getPosition());
    map.setZoom(props.zoom);
  } else {
    map.setCenter(center.value);
    map.setZoom(props.zoom);
  }
}

// Watch for changes in posts
watch(() => props.posts, () => {
  if (map) {
    addMarkers();
  }
}, { deep: true });

onMounted(async () => {
  await initMap();
});

onUnmounted(() => {
  // Clean up markers when component is unmounted
  clearMarkers();
});
</script>

<template>
  <v-card class="map-card" flat>
    <v-card-title v-if="title" class="text-h5">
      <v-icon start color="primary" class="mr-2">mdi-map-marker</v-icon>
      {{ title }}
    </v-card-title>
    
    <v-sheet rounded="lg" class="map-container" :style="{ height: height }">
      <div ref="mapContainer" style="width: 100%; height: 100%"></div>
      
      <!-- Map legend -->
      <div class="map-legend" v-if="markers.length > 0 && showLegend">
        <div class="legend-title">Tipos de marcadores</div>
        <div class="legend-item">
          <div class="legend-marker" style="background-color: #8b4513;"></div>
          <div class="legend-text">Post estándar</div>
        </div>
        <div class="legend-item">
          <div class="legend-marker" style="background-color: #4CAF50;"></div>
          <div class="legend-text">Post completado</div>
        </div>
        <div class="legend-item">
          <div class="legend-marker" style="background-color: #673AB7;"></div>
          <div class="legend-text">Post con imagen</div>
        </div>
        <div class="legend-item">
          <div class="legend-marker" style="background-color: #8b4513; transform: scale(1.2);"></div>
          <div class="legend-text">Post con texto largo</div>
        </div>
      </div>
      
      <!-- Loading overlay -->
      <div v-if="loading" class="map-loading-overlay">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
      </div>
      
      <!-- Error message -->
      <v-alert v-if="error" type="error" variant="tonal" class="map-error">
        {{ error }}
      </v-alert>
      
      <!-- Material Design FAB buttons for map controls -->
      <v-btn
        v-if="showActions && !loading"
        color="primary"
        class="map-fab-btn recenter-btn"
        icon="mdi-crosshairs-gps"
        size="large"
        @click="recenterMap"
      >
        <v-tooltip activator="parent" location="left">Centrar mapa</v-tooltip>
      </v-btn>
      
      <v-btn
        v-if="showClearButton && !loading && markers.length > 0"
        color="error"
        class="map-fab-btn clear-btn"
        icon="mdi-map-marker-off"
        size="large"
        @click="clearMarkers"
      >
        <v-tooltip activator="parent" location="left">Borrar marcadores</v-tooltip>
      </v-btn>
      
      <v-btn
        v-if="!loading && markers.length > 0"
        color="amber-darken-2"
        class="map-fab-btn legend-btn"
        icon="mdi-information-outline"
        size="large"
        @click="toggleLegend"
      >
        <v-tooltip activator="parent" location="left">Mostrar leyenda</v-tooltip>
      </v-btn>
    </v-sheet>
  </v-card>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap');

.map-card {
  margin: 16px 0;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.map-container {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.map-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.map-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80%;
  z-index: 1;
}

/* Material Design FAB buttons */
.map-fab-btn {
  position: absolute;
  z-index: 1;
  box-shadow: 0 3px 5px -1px rgba(0,0,0,.2), 0 6px 10px 0 rgba(0,0,0,.14), 0 1px 18px 0 rgba(0,0,0,.12);
}

.recenter-btn {
  bottom: 16px;
  right: 16px;
}

.clear-btn {
  bottom: 16px;
  right: 80px;
}

.legend-btn {
  bottom: 16px;
  right: 144px;
}

/* Map Legend */
.map-legend {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: white;
  border-radius: 4px;
  padding: 8px 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  font-family: 'Cinzel', serif;
  max-width: 200px;
  z-index: 1;
}

.legend-title {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 8px;
  color: #4a2c2a;
  text-align: center;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.legend-marker {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.5);
}

.legend-text {
  font-size: 12px;
  color: #333;
}

/* Info Window Styles (existing) */
:deep(.info-window) {
  padding: 12px;
  max-width: 280px;
  font-family: 'MedievalSharp', cursive;
}

:deep(.info-window h3) {
  margin-top: 0;
  color: #4a2c2a;
  font-family: 'MedievalSharp', cursive;
  font-size: 18px;
}

:deep(.info-window p) {
  margin: 8px 0;
  color: #333;
  font-size: 14px;
}

:deep(.info-window .author) {
  font-style: italic;
  margin-bottom: 0;
  color: #666;
  font-size: 12px;
}

/* Material Design Info Window Styles */
:deep(.md-info-window) {
  padding: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 320px;
  font-family: 'Cinzel', serif;
}

:deep(.info-window-header) {
  padding: 12px 16px;
  color: white;
  border-radius: 8px 8px 0 0;
}

:deep(.info-window-header h3) {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: white;
  font-family: 'MedievalSharp', cursive;
}

:deep(.info-window-body) {
  padding: 16px;
  background-color: #fff;
}

:deep(.info-window-image) {
  margin: -16px -16px 12px -16px;
  border-bottom: 1px solid #e0e0e0;
  max-height: 150px;
  overflow: hidden;
}

:deep(.info-window-image img) {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}

:deep(.info-window-body p) {
  margin: 0 0 16px 0;
  color: rgba(0, 0, 0, 0.87);
  font-size: 14px;
  line-height: 1.4;
}

:deep(.info-window-footer) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

:deep(.info-window-author) {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}

:deep(.author-avatar) {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-right: 8px;
  object-fit: cover;
}

:deep(.info-window-likes) {
  display: flex;
  align-items: center;
  color: #F44336;
  font-size: 12px;
}

:deep(.info-window-likes span) {
  margin-left: 4px;
}

:deep(.material-icons) {
  font-family: 'Material Icons';
  font-size: 18px;
}
</style>