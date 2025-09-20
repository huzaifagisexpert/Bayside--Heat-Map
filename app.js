// Initialize the map
const map = L.map('map').setView([39.8283, -98.5795], 4);

// --- Basemaps ---
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OSM'
});

const cartoLight = L.tileLayer(
  'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '© OSM & CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }
).addTo(map); // default

const stamenToner = L.tileLayer(
  'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '© OSM & CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }
);

const baseMaps = {
  "OpenStreetMap": osm,
  "Carto Light": cartoLight,
  "Stamen Toner": stamenToner
};


// --- Clusters & Heatmap Data ---
// Global storage
// Create the shared cluster group
// Create a single cluster group that will hold all student markers (both Stripe + Enrollware)
const sharedClusterGroup = L.markerClusterGroup();

// Separate layer groups for toggling visibility (hold the same markers as sharedClusterGroup)
const stripeLayer = L.layerGroup();
const enrollwareLayer = L.layerGroup();
const officeLayer = L.layerGroup();

let stripeHeatData = [];
let enrollwareHeatData = [];
let allHeatData = [];

// Unified heatmap (Stripe + Enrollware combined)
const combinedHeatmap = L.heatLayer([], {
    radius: 35,
    blur: 20,
    maxZoom: 17,
    max: 1.0,
    gradient: {
        0.2: 'green',
        0.4: 'green',
        0.6: 'lime',
        0.8: 'orange',
        1.0: 'red'
    }
});

// Custom office icon
const officeIcon = L.icon({
    iconUrl: 'pin.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Custom colored icons for Stripe and Enrollware markers
const blueIcon = L.divIcon({
    className: 'custom-marker',
    html: '<div style="width:12px; height:12px; background-color:blue; border-radius:50%; border:1px solid #333;"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const greenIcon = L.divIcon({
    className: 'custom-marker',
    html: '<div style="width:12px; height:12px; background-color:green; border-radius:50%; border:1px solid #333;"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

// --- Load Google Sheet as CSV ---
async function loadGoogleSheet(sheetId, type) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const response = await fetch(csvUrl);
    const csvText = await response.text();

    // Parse CSV → JSON
    const data = Papa.parse(csvText, { header: true }).data;

    data.forEach(row => {
        const lat = parseFloat(row.Latitude);
        const lon = parseFloat(row.Longitude);

        if (!isNaN(lat) && !isNaN(lon)) {
            if (type === "stripe") {
                const marker = L.marker([lat, lon], { icon: blueIcon }).bindPopup(`
                    <div class="popup-content">
                        <div class="popup-title"><b>Stripe Student</b></div>
                        <div><b>Address:</b> ${row["Full Address"] || "No address"}</div>
                    </div>
                `);

                sharedClusterGroup.addLayer(marker);
                stripeLayer.addLayer(marker);
                stripeHeatData.push([lat, lon, 1]);

            } else if (type === "enrollware") {
                const marker = L.marker([lat, lon], { icon: greenIcon }).bindPopup(`
                    <div class="popup-content">
                        <div class="popup-title"><b>Enrollware Student</b></div>
                        <div><b>Address:</b> ${row["Full Address"] || "No address"}</div>
                    </div>
                `);

                sharedClusterGroup.addLayer(marker);
                enrollwareLayer.addLayer(marker);
                enrollwareHeatData.push([lat, lon, 1]);

            } else if (type === "office") {
                const marker = L.marker([lat, lon], { icon: officeIcon }).bindPopup(`
                    <div class="popup-content">
                        <div class="popup-title">Office</div>
                        <div><b>Address:</b> ${row["Address"] || "No address"}</div>
                        <div><b>City:</b> ${row["City"] || "Unknown"}</div>
                        <div><b>Phone:</b> ${row["Phone Number"] || "Unknown"}</div>
                    </div>
                `);
                officeLayer.addLayer(marker);
            }
        }
    });

    // 🔹 Rebuild combined heatmap
    allHeatData = [...stripeHeatData, ...enrollwareHeatData];
    combinedHeatmap.setLatLngs(allHeatData);
}

// Add the shared cluster group to the map initially
map.addLayer(sharedClusterGroup);

// Overlays for control with separate toggles for stripe and enrollware markers (via their layerGroups),
// plus the sharedClusterGroup for clustering all markers visually.
// We toggle visibility of marker layers separately but clustering is managed globally.
const overlays = {
    "Stripe Students": stripeLayer,
    "Enrollware Students": enrollwareLayer,
    "All Students (Clusters)": sharedClusterGroup,
    "All Students (Heatmap)": combinedHeatmap,
    "Offices": officeLayer
};

L.control.layers(baseMaps, overlays).addTo(map);

// Load Google Sheets data (replace IDs with yours)
loadGoogleSheet("108nlOCTbbCDhZxO53zF-B13VGaDXOdJbrjIgpygz1ys", "office");
loadGoogleSheet("176DPR5eamz3K4dN5xLy9CYYEscxc0I7N49ZtlTRke5o", "stripe");
loadGoogleSheet("1NUYtyLyPppreqoFPRfinCphl8u_6Fv6t95s--6LMT0Y", "enrollware");





const bufferLayer = L.layerGroup().addTo(map);
let bufferMode = false;
let bufferRadiusMiles = 20; // default radius in miles

const BufferControl = L.Control.extend({
  options: { position: 'topright' },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar buffer-control');

    container.innerHTML = `
      <button id="buffer-btn">➕ Filter Mode</button>
      <div id="buffer-input-box" style="display:none;">
        <label for="buffer-radius">Radius (mi):</label>
        <input type="number" id="buffer-radius" min="0.1" step="0.1" value="${bufferRadiusMiles}" />
        <small>Click map to create buffer</small>
      </div>
    `;

    L.DomEvent.disableClickPropagation(container);
    return container;
  }
});

map.addControl(new BufferControl());

// Button toggle
document.getElementById("buffer-btn").onclick = function () {
  bufferMode = !bufferMode;
  this.classList.toggle("active");

  const inputBox = document.getElementById("buffer-input-box");

  if (bufferMode) {
    this.innerText = "✔ Filter ON";
    inputBox.style.display = "block";
  } else {
    this.innerText = "➕ Filter Mode";
    inputBox.style.display = "none";
  }
};

// Update radius value from input
document.addEventListener("input", function (e) {
  if (e.target && e.target.id === "buffer-radius") {
    bufferRadiusMiles = parseFloat(e.target.value);
  }
});

// Map click event
// ===============================
// GLOBAL EXPORT CONTROL
// ===============================
let studentsInsideBuffer = []; // store last buffer results

const ExportControl = L.Control.extend({
  options: { position: 'topright' },

  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar export-control');
    container.innerHTML = `
      <button id="export-btn" style="display:none;">⬇ Export CSV</button>
      <div id="message-box" style="padding:5px; font-size:12px; max-width:150px;"></div>
    `;
    L.DomEvent.disableClickPropagation(container);
    return container;
  }
});
map.addControl(new ExportControl());

// --- Helper functions ---
function isMarkerInsideBuffer(marker, circle) {
  const markerLatLng = marker.getLatLng();
  return markerLatLng.distanceTo(circle.getLatLng()) <= circle.getRadius();
}

function exportToCSV(data, filename = "students_in_buffer.csv") {
  if (data.length === 0) {
    alert("No students found in buffer.");
    return;
  }

  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${row[h] || ""}"`).join(","));
  const csvContent = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Attach export button event
setTimeout(() => {
  const exportBtn = document.getElementById("export-btn");
  const messageBox = document.getElementById("message-box");

  exportBtn.addEventListener("click", () => {
    if (studentsInsideBuffer.length === 0) {
      alert("No students in buffer to export.");
      return;
    }
    exportToCSV(studentsInsideBuffer);
  });

  // function to update UI
  window.updateExportUI = function () {
    if (studentsInsideBuffer.length > 0) {
      exportBtn.style.display = "block";
      messageBox.style.display = "none";
    } else {
      exportBtn.style.display = "none";
      messageBox.style.display = "block";
      messageBox.innerText = "No students found in current radius. Click again on the map.";
    }
  };
}, 200);

// ===============================
// MAP CLICK EVENT (Buffer logic)
// ===============================
map.on("click", function (e) {
  if (!bufferMode) return;

  const radiusMeters = bufferRadiusMiles * 1609.34; // miles → meters
  bufferLayer.clearLayers();

  const bufferCircle = L.circle(e.latlng, {
    radius: radiusMeters,
    color: "#ff5722",
    weight: 2,
    fillColor: "#ff9800",
    fillOpacity: 0.3,
    interactive: false
  }).addTo(bufferLayer);

  map.fitBounds(bufferCircle.getBounds());

  // --- Find students inside buffer ---
  studentsInsideBuffer = [];

  // 🔹 Only check clusters that are currently visible on the map
  if (map.hasLayer(stripeCluster)) {
    stripeCluster.eachLayer(marker => {
      if (isMarkerInsideBuffer(marker, bufferCircle)) {
        studentsInsideBuffer.push(marker.options.data);
      }
    });
  }

  if (map.hasLayer(enrollwareCluster)) {
    enrollwareCluster.eachLayer(marker => {
      if (isMarkerInsideBuffer(marker, bufferCircle)) {
        studentsInsideBuffer.push(marker.options.data);
      }
    });
  }

  // update button & message
  updateExportUI();
});

// ===============================
// LAYERS
// ===============================
map.addLayer(stripeCluster);
map.addLayer(enrollwareCluster);
map.addLayer(officeLayer);





