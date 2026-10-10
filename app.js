const CONFIG = {
  parkCenter: [28.4195, -81.5812],
  parkZoom: 16,
  followZoom: 18,
  reverseMinDistanceMeters: 250,
  reverseMinIntervalMs: 60_000,
  reverseEndpoint: 'https://nominatim.openstreetmap.org/reverse'
};

const map = L.map('map', {
  zoomControl: false,
  preferCanvas: true
}).setView(CONFIG.parkCenter, CONFIG.parkZoom);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const placeName = document.getElementById('placeName');
const gpsState = document.getElementById('gpsState');
const parkState = document.getElementById('parkState');
const mapNotice = document.getElementById('mapNotice');
const accuracyText = document.getElementById('accuracyText');
const speedText = document.getElementById('speedText');
const permissionPanel = document.getElementById('permissionPanel');
const retryBtn = document.getElementById('retryBtn');
const followBtn = document.getElementById('followBtn');
const locateBtn = document.getElementById('locateBtn');
const parkBtn = document.getElementById('parkBtn');
const exploreBtn = document.getElementById('exploreBtn');

let watchId = null;
let userMarker = null;
let accuracyCircle = null;
let latestPosition = null;
let followUser = true;
let hasCenteredOnce = false;
let selectedView = 'user';
let lastReverse = { lat: null, lon: null, time: 0 };
let reverseInFlight = false;
let reverseController = null;

function updateParkState(lat, lon) {
  // Aproximação apenas para informar contexto; não delimita o perímetro oficial.
  const distance = metersBetween(lat, lon, ...CONFIG.parkCenter);
  parkState.textContent = distance < 1500
    ? 'Região do Magic Kingdom · limite aproximado'
    : 'Fora do Magic Kingdom · GPS real';
}

function parkLabel(lat, lon, accuracy) {
  return accuracy <= 100 && metersBetween(lat, lon, ...CONFIG.parkCenter) < 800
    ? 'Magic Kingdom (aprox.)' : null;
}

function metersBetween(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v == null)) return Infinity;
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp/2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function buildPlaceLabel(address = {}, displayName = '') {
  // Mantém o rótulo curto para funcionar bem no canto superior.
  const local = address.neighbourhood || address.suburb || address.quarter || address.city_district || address.town || address.city || address.municipality;
  const city = address.city || address.town || address.municipality || address.county;
  const state = address.state || '';
  const stateCode = address['ISO3166-2-lvl4']?.split('-').pop() || '';
  const region = stateCode || state;

  if (local && city && local !== city) return `${local}, ${region || city}`;
  if (city) return `${city}${region ? `, ${region}` : ''}`;
  if (displayName) return displayName.split(',').slice(0, 2).join(',');
  return 'Localização atual';
}

async function maybeReverseGeocode(lat, lon) {
  const moved = metersBetween(lastReverse.lat, lastReverse.lon, lat, lon);
  const elapsed = Date.now() - lastReverse.time;
  const shouldQuery = lastReverse.lat == null || (moved >= CONFIG.reverseMinDistanceMeters && elapsed >= CONFIG.reverseMinIntervalMs);
  if (!shouldQuery || reverseInFlight) return;

  reverseInFlight = true;
  lastReverse = { lat, lon, time: Date.now() };
  try {
    const url = new URL(CONFIG.reverseEndpoint);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lon);
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'pt-BR');

    reverseController = new AbortController();
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: reverseController.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // A resposta pode chegar depois de outra amostra de GPS: mantém o nome aproximado.
    placeName.textContent = parkLabel(lat, lon, latestPosition?.accuracy)
      || buildPlaceLabel(data.address, data.display_name);
  } catch (err) {
    console.warn('Falha ao converter coordenadas em nome:', err);
    // GPS continua funcionando normalmente mesmo se a geocodificação falhar.
    if (placeName.textContent === 'Localizando…') placeName.textContent = 'Localização atual';
  } finally {
    reverseInFlight = false;
  }
}

function createUserMarker(lat, lon, heading) {
  const icon = L.divIcon({
    className: 'user-location-icon',
    html: `<div class="user-dot-wrap"><div class="heading-cone" style="transform:rotate(${Number.isFinite(heading) ? heading : 0}deg); opacity:${Number.isFinite(heading) ? 1 : 0}"></div><div class="user-dot"></div></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
  return L.marker([lat, lon], { icon, interactive: false }).addTo(map);
}

function updateMarkerHeading(heading) {
  if (!userMarker) return;
  const el = userMarker.getElement();
  const cone = el?.querySelector('.heading-cone');
  if (!cone) return;
  if (Number.isFinite(heading)) {
    cone.style.opacity = '1';
    cone.style.transform = `rotate(${heading}deg)`;
  } else {
    cone.style.opacity = '0';
  }
}

function onPosition(position) {
  const { latitude: lat, longitude: lon, accuracy, speed, heading } = position.coords;
  latestPosition = { lat, lon, accuracy, speed, heading, timestamp: position.timestamp };
  updateParkState(lat, lon);
  const nearbyPark = parkLabel(lat, lon, accuracy);
  if (nearbyPark) placeName.textContent = nearbyPark;

  gpsState.textContent = 'GPS ativo';
  accuracyText.textContent = `Precisão: ±${Math.round(accuracy)} m`;
  speedText.textContent = Number.isFinite(speed) ? `Velocidade: ${(speed * 3.6).toFixed(1)} km/h` : 'Velocidade: —';
  permissionPanel.classList.add('hidden');

  if (!userMarker) {
    userMarker = createUserMarker(lat, lon, heading);
    accuracyCircle = L.circle([lat, lon], {
      radius: accuracy,
      weight: 1,
      opacity: 0.45,
      fillOpacity: 0.08
    }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lon]);
    accuracyCircle.setLatLng([lat, lon]).setRadius(accuracy);
    updateMarkerHeading(heading);
  }

  if (followUser && selectedView === 'user') {
    if (!hasCenteredOnce) {
      map.setView([lat, lon], CONFIG.followZoom, { animate: false });
      hasCenteredOnce = true;
    } else {
      map.panTo([lat, lon], { animate: true, duration: 0.6, easeLinearity: 0.25 });
    }
  }

  maybeReverseGeocode(lat, lon);
  mapNotice.classList.add('hidden');
}

function onPositionError(error) {
  const messages = {
    1: 'Permissão de localização necessária',
    2: 'GPS indisponível no momento',
    3: 'GPS demorou para responder'
  };
  gpsState.textContent = messages[error.code] || 'Não foi possível obter a localização';
  accuracyText.textContent = 'Precisão: —';
  speedText.textContent = 'Velocidade: —';
  permissionPanel.classList.remove('hidden');
  mapNotice.textContent = error.code === 1
    ? 'Localização bloqueada. Libere a permissão do site para testar o GPS.'
    : 'GPS indisponível. Você ainda pode explorar o Magic Kingdom.';
  mapNotice.classList.remove('hidden');
  console.warn('Erro de geolocalização:', error);
}

function startWatching() {
  if (!window.isSecureContext) {
    gpsState.textContent = 'GPS requer HTTPS';
    mapNotice.textContent = 'Abra por HTTPS, como em um site publicado, para usar sua localização.';
    mapNotice.classList.remove('hidden');
    permissionPanel.classList.remove('hidden');
    return;
  }
  if (!('geolocation' in navigator)) {
    gpsState.textContent = 'Seu navegador não oferece geolocalização';
    permissionPanel.classList.remove('hidden');
    return;
  }
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  gpsState.textContent = 'Buscando GPS…';
  watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000
  });
}

function setFollow(value) {
  followUser = value;
  followBtn.classList.toggle('active', value);
  followBtn.setAttribute('aria-pressed', String(value));
}

followBtn.addEventListener('click', () => {
  setFollow(!followUser);
  if (followUser) selectedView = 'user';
  if (followUser && latestPosition) {
    map.flyTo([latestPosition.lat, latestPosition.lon], Math.max(map.getZoom(), 17), { duration: 0.7 });
  }
});

locateBtn.addEventListener('click', () => {
  setFollow(true);
  selectedView = 'user';
  if (latestPosition) {
    map.flyTo([latestPosition.lat, latestPosition.lon], CONFIG.followZoom, { duration: 0.7 });
  } else {
    startWatching();
  }
});

function showPark() {
  selectedView = 'park';
  setFollow(false);
  permissionPanel.classList.add('hidden');
  map.flyTo(CONFIG.parkCenter, CONFIG.parkZoom, { duration: 0.8 });
}

parkBtn.addEventListener('click', showPark);
exploreBtn.addEventListener('click', showPark);

retryBtn.addEventListener('click', startWatching);

map.on('dragstart', () => {
  selectedView = 'manual';
  setFollow(false);
});

startWatching();
