(() => {
  "use strict";

  const cityCenter = [16.412, 120.596];
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const hasCoordinates = (store) => Array.isArray(store.coordinates)
    && store.coordinates.length === 2
    && store.coordinates.every(Number.isFinite)
    && Math.abs(store.coordinates[0]) <= 90
    && Math.abs(store.coordinates[1]) <= 180;

  function links(store) {
    const address = encodeURIComponent(store.mapLocation || store.location);
    return {
      map: `https://www.google.com/maps/search/?api=1&query=${address}`,
      directions: `https://www.google.com/maps/dir/?api=1&destination=${address}`,
      streetView: hasCoordinates(store)
        ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(store.coordinates.join(","))}`
        : null
    };
  }

  function create({ container, status, onSelect }) {
    const L = window.L;
    const unavailable = {
      available: false,
      setStores() {},
      selectStore() {},
      showStores() {}
    };

    if (!L) {
      container.classList.add("store-map-unavailable");
      container.textContent = "The interactive map could not load. You can still explore each store using its map, directions, and Street View links below.";
      status.textContent = "Check your internet connection and refresh to load the interactive map.";
      return unavailable;
    }

    const map = L.map(container, { scrollWheelZoom: false }).setView(cityCenter, 13);
    const markers = L.featureGroup().addTo(map);
    const markersById = new Map();
    const hint = "Drag to explore, use + / − to zoom, or select a store pin. Street View opens nearby imagery when available.";
    let visibleStores = [];
    let tileError = false;
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    function updateStatus() {
      status.textContent = tileError
        ? "Map imagery could not load. Check your connection or use a store's map and directions links below."
        : !visibleStores.length
          ? "No store locations match your search. Clear the search to explore all stores."
          : !markersById.size
            ? "These stores have no map coordinates yet. Use their map or directions links below."
            : hint;
    }

    tiles.on("loading", () => { tileError = false; });
    tiles.on("tileerror", () => { tileError = true; updateStatus(); });
    tiles.on("load", updateStatus);
    tiles.addTo(map);

    function showStores() {
      map.closePopup();
      if (markersById.size) {
        map.fitBounds(markers.getBounds(), { padding: [44, 44], maxZoom: 15, animate: false });
      } else {
        map.setView(cityCenter, 13, { animate: false });
      }
    }

    function setStores(stores) {
      visibleStores = stores;
      markers.clearLayers();
      markersById.clear();
      stores.filter(hasCoordinates).forEach((store) => {
        const urls = links(store);
        const marker = L.marker(store.coordinates, {
          title: `${store.name} — approximate area`,
          alt: `${store.name}, ${store.location}. Approximate location.`
        });
        marker.bindPopup(`
          <div class="store-map-popup">
            <strong>${escapeHtml(store.name)}</strong>
            <p>${escapeHtml(store.location)}</p>
            <small>Approximate area; confirm the shop address before visiting.</small>
            <a href="${escapeHtml(urls.map)}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>
            <a href="${escapeHtml(urls.directions)}" target="_blank" rel="noopener noreferrer">Directions to this area ↗</a>
            <a href="${escapeHtml(urls.streetView)}" target="_blank" rel="noopener noreferrer">Street View nearby ↗</a>
          </div>`, { maxWidth: 280 });
        marker.on("click", () => onSelect(store.id));
        marker.addTo(markers);
        markersById.set(store.id, marker);
      });
      showStores();
      updateStatus();
    }

    function selectStore(id) {
      const marker = markersById.get(id);
      if (!marker) return;
      map.setView(marker.getLatLng(), 16, { animate: false });
      marker.openPopup();
    }

    return { available: true, setStores, selectStore, showStores };
  }

  window.GUNPLA_STORE_MAP = { create, links, hasCoordinates };
})();
