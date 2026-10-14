const CONFIG = {
  parkCenter: [28.4195, -81.5812],
  parkZoom: 16,
  followZoom: 18,
  reverseMinDistanceMeters: 250,
  reverseMinIntervalMs: 60_000,
  reverseEndpoint: 'https://nominatim.openstreetmap.org/reverse'
};

// Coordenadas aproximadas das atrações (OSM via Queue Times), não das entradas.
// https://queue-times.com/parks/6/rides/{id}
const ATTRACTIONS = [
  { id: 138, name: 'Space Mountain', area: 'Tomorrowland', lat: 28.4191, lon: -81.5772 },
  { id: 140, name: 'Haunted Mansion', area: 'Liberty Square', lat: 28.4209, lon: -81.5829 },
  { id: 130, name: 'Big Thunder Mountain Railroad', area: 'Frontierland', lat: 28.4202, lon: -81.5844 },
  { id: 129, name: 'Seven Dwarfs Mine Train', area: 'Fantasyland', lat: 28.4206, lon: -81.5800 },
  { id: 137, name: 'Pirates of the Caribbean', area: 'Adventureland', lat: 28.4177, lon: -81.5848 }
];

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
const attractionSearch = document.getElementById('attractionSearch');
const searchResults = document.getElementById('searchResults');
const attractionCard = document.getElementById('attractionCard');
const attractionName = document.getElementById('attractionName');
const attractionArea = document.getElementById('attractionArea');
const attractionDistance = document.getElementById('attractionDistance');
const attractionSource = document.getElementById('attractionSource');
const closeAttraction = document.getElementById('closeAttraction');
const testOriginBtn = document.getElementById('testOriginBtn');
const useGpsBtn = document.getElementById('useGpsBtn');
const routeBtn = document.getElementById('routeBtn');
const routeStatus = document.getElementById('routeStatus');
const routeSummary = document.getElementById('routeSummary');

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
let selectedAttraction = null;
const attractionMarkers = new Map();
let testOrigin = null;
let testOriginMarker = null;
let pickingTestOrigin = false;
let routeLine = null;
let routeRequest = null;
let lastRouteRequestAt = 0;

function updateCardClearance() {
  if (!attractionCard.classList.contains('hidden')) {
    document.body.style.setProperty('--card-clearance', `${attractionCard.offsetHeight + 12}px`);
  }
}
if ('ResizeObserver' in window) new ResizeObserver(updateCardClearance).observe(attractionCard);

function setRouteStatus(message, isError = false) {
  routeStatus.textContent = message;
  routeStatus.classList.toggle('error', isError);
  requestAnimationFrame(updateCardClearance);
}

function clearRoute() {
  routeRequest?.abort();
  routeRequest = null;
  if (routeLine) map.removeLayer(routeLine);
  routeLine = null;
  routeSummary.classList.add('hidden');
  routeSummary.textContent = '';
  routeBtn.disabled = false;
}

function availableOrigin() {
  if (testOrigin) return { ...testOrigin, type: 'test' };
  if (!latestPosition || latestPosition.accuracy > 100 ||
      metersBetween(latestPosition.lat, latestPosition.lon, ...CONFIG.parkCenter) > 1500) return null;
  return { lat: latestPosition.lat, lon: latestPosition.lon, type: 'gps' };
}

function setTestOrigin(lat, lon) {
  testOrigin = { lat, lon };
  if (!testOriginMarker) {
    testOriginMarker = L.marker([lat, lon], {
      icon: L.divIcon({ className: 'attraction-icon', html: '<div class="test-origin-pin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      title: 'Origem de teste (não é o GPS)'
    }).addTo(map);
  } else testOriginMarker.setLatLng([lat, lon]);
  useGpsBtn.classList.remove('hidden');
  pickingTestOrigin = false;
  testOriginBtn.textContent = 'Mudar origem de teste';
  clearRoute();
  setRouteStatus('Origem simulada no mapa. Toque em “Prévia da rota a pé”.');
}

testOriginBtn.addEventListener('click', () => {
  pickingTestOrigin = true;
  setRouteStatus('Toque em um caminho dentro do Magic Kingdom para marcar a origem de teste.');
});
useGpsBtn.addEventListener('click', () => {
  testOrigin = null;
  pickingTestOrigin = false;
  if (testOriginMarker) map.removeLayer(testOriginMarker);
  testOriginMarker = null;
  useGpsBtn.classList.add('hidden');
  testOriginBtn.textContent = 'Escolher origem de teste';
  clearRoute();
  setRouteStatus(availableOrigin()
    ? 'GPS real selecionado. Toque em “Prévia da rota a pé”.'
    : 'GPS fora do parque ou impreciso. Escolha uma origem de teste no mapa.');
});
map.on('click', event => {
  if (!pickingTestOrigin || !selectedAttraction) return;
  const { lat, lng: lon } = event.latlng;
  if (metersBetween(lat, lon, ...CONFIG.parkCenter) > 1500) {
    setRouteStatus('Escolha uma origem dentro da região do Magic Kingdom.', true);
    return;
  }
  setTestOrigin(lat, lon);
});

routeBtn.addEventListener('click', async () => {
  if (!selectedAttraction) return;
  const origin = availableOrigin();
  if (!origin) {
    setRouteStatus('Para testar do Brasil, toque em “Escolher origem de teste” e depois em um caminho do parque.', true);
    return;
  }
  if (Date.now() - lastRouteRequestAt < 1500) {
    setRouteStatus('Aguarde um instante antes de consultar outra rota.');
    return;
  }
  clearRoute();
  const destination = selectedAttraction;
  const controller = new AbortController();
  routeRequest = controller;
  lastRouteRequestAt = Date.now();
  routeBtn.disabled = true;
  setRouteStatus('Consultando caminhos para pedestres…');
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const points = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${points}?overview=full&geometries=geojson&steps=false`;
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (routeRequest !== controller) return;
    const route = data.routes?.[0];
    const pointsOnRoute = route?.geometry?.coordinates;
    if (data.code !== 'Ok' || !Array.isArray(pointsOnRoute) || pointsOnRoute.length < 2 ||
        !Number.isFinite(route.distance) || route.distance < 25 || route.distance > 6000 ||
        !pointsOnRoute.every(point => Array.isArray(point) && point.length >= 2 &&
          Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
          metersBetween(point[1], point[0], ...CONFIG.parkCenter) < 1800) ||
        (data.waypoints?.[0]?.distance ?? Infinity) > 100 ||
        (data.waypoints?.[1]?.distance ?? Infinity) > 150) {
      throw new Error('Rota não passou nas verificações de proximidade e perímetro');
    }
    const latLngs = pointsOnRoute.map(([lon, lat]) => [lat, lon]);
    routeLine = L.polyline(latLngs, { color: '#e07431', weight: 6, opacity: .9 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { paddingTopLeft: [25, 135], paddingBottomRight: [35, attractionCard.offsetHeight + 35], maxZoom: 18 });
    routeSummary.textContent = `${(route.distance / 1000).toFixed(2).replace('.', ',')} km pela malha OSM · origem ${origin.type === 'test' ? 'de teste' : 'GPS real'}. A entrada e possíveis bloqueios ainda não foram verificados.`;
    routeSummary.classList.remove('hidden');
    setRouteStatus('Prévia experimental de trajeto a pé. Confira as placas e o aplicativo oficial no parque.');
  } catch (error) {
    if (routeRequest !== controller) return;
    setRouteStatus(error.name === 'AbortError'
      ? 'A consulta demorou demais. Tente novamente.'
      : 'Não foi possível obter uma rota a pé válida para esses pontos. Tente outra origem.', true);
  } finally {
    clearTimeout(timeout);
    if (routeRequest === controller) { routeRequest = null; routeBtn.disabled = false; }
  }
});

function attractionIcon(number, selected = false) {
  return L.divIcon({
    className: 'attraction-icon',
    html: `<div class="attraction-pin${selected ? ' selected' : ''}">${number}</div>`,
    iconSize: [25, 25], iconAnchor: [12, 12]
  });
}

function updateAttractionDistance() {
  if (!selectedAttraction) return;
  const parkDistance = latestPosition
    ? metersBetween(latestPosition.lat, latestPosition.lon, ...CONFIG.parkCenter)
    : Infinity;
  if (parkDistance >= 1500 || latestPosition.accuracy > 150) {
    attractionDistance.textContent = 'Distância disponível quando o GPS estiver preciso na região do parque.';
    return;
  }
  const distance = metersBetween(latestPosition.lat, latestPosition.lon,
    selectedAttraction.lat, selectedAttraction.lon);
  attractionDistance.textContent = `${Math.round(distance)} m em linha reta da sua posição · não é distância a pé`;
}

function selectAttraction(attraction) {
  clearRoute();
  pickingTestOrigin = false;
  selectedAttraction = attraction;
  selectedView = 'attraction';
  setFollow(false);
  attractionName.textContent = attraction.name;
  attractionArea.textContent = attraction.area;
  attractionSource.href = `https://queue-times.com/parks/6/rides/${attraction.id}`;
  attractionCard.classList.remove('hidden');
  document.body.classList.add('has-selection');
  updateAttractionDistance();
  setRouteStatus(testOrigin
    ? 'Origem de teste selecionada. Toque em “Prévia da rota a pé”.'
    : 'Escolha uma origem de teste no parque ou use o GPS real quando estiver lá.');
  requestAnimationFrame(updateCardClearance);
  for (const [id, marker] of attractionMarkers) {
    marker.setIcon(attractionIcon(ATTRACTIONS.findIndex(item => item.id === id) + 1, id === attraction.id));
  }
  map.flyTo([attraction.lat, attraction.lon], 18, { duration: 0.7 });
  attractionSearch.value = '';
  searchResults.classList.remove('visible');
}

function renderSearch(query) {
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const matches = ATTRACTIONS.filter(item =>
    !normalized || `${item.name} ${item.area}`.toLocaleLowerCase('pt-BR').includes(normalized));
  searchResults.replaceChildren();
  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-result';
    empty.textContent = 'Nenhuma atração encontrada nesta versão.';
    searchResults.append(empty);
  }
  for (const item of matches) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    const name = document.createElement('strong');
    name.textContent = item.name;
    const area = document.createElement('small');
    area.textContent = item.area;
    button.append(name, area);
    button.addEventListener('click', () => { selectAttraction(item); attractionSearch.blur(); });
    searchResults.append(button);
  }
  searchResults.classList.add('visible');
}

ATTRACTIONS.forEach((item, index) => {
  const marker = L.marker([item.lat, item.lon], { icon: attractionIcon(index + 1), title: item.name, alt: item.name })
    .addTo(map).on('click', () => selectAttraction(item));
  attractionMarkers.set(item.id, marker);
});

attractionSearch.addEventListener('focus', () => renderSearch(attractionSearch.value));
attractionSearch.addEventListener('input', () => renderSearch(attractionSearch.value));
attractionSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') { searchResults.classList.remove('visible'); attractionSearch.blur(); }
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.search-box')) searchResults.classList.remove('visible');
});
closeAttraction.addEventListener('click', () => {
  clearRoute();
  pickingTestOrigin = false;
  selectedAttraction = null;
  attractionCard.classList.add('hidden');
  document.body.classList.remove('has-selection');
  for (const [id, marker] of attractionMarkers) {
    marker.setIcon(attractionIcon(ATTRACTIONS.findIndex(item => item.id === id) + 1));
  }
});

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
  updateAttractionDistance();
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
