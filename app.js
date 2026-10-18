const PARKS = [{"key":"magic","name":"Magic Kingdom","lat":28.418783,"lon":-81.581228,"zoom":16,"official":"https://disneyworld.disney.go.com/pt-br/destinations/magic-kingdom/","resort":"disney"},{"key":"epcot","name":"EPCOT","lat":28.371841,"lon":-81.54945,"zoom":15,"official":"https://disneyworld.disney.go.com/pt-br/destinations/epcot/","resort":"disney"},{"key":"hollywood","name":"Hollywood Studios","lat":28.357373,"lon":-81.560117,"zoom":16,"official":"https://disneyworld.disney.go.com/pt-br/destinations/hollywood-studios/","resort":"disney"},{"key":"animal","name":"Animal Kingdom","lat":28.360317,"lon":-81.591293,"zoom":15,"official":"https://disneyworld.disney.go.com/pt-br/destinations/animal-kingdom/","resort":"disney"},{"key":"universal-studios","name":"Universal Studios Florida","resort":"universal","lat":28.47724,"lon":-81.46924,"zoom":16,"official":"https://www.universalorlando.com/web/en/us/theme-parks/universal-studios-florida"},{"key":"islands","name":"Islands of Adventure","resort":"universal","lat":28.47114,"lon":-81.47157,"zoom":16,"official":"https://www.universalorlando.com/web/en/us/theme-parks/islands-of-adventure"},{"key":"epic","name":"Epic Universe","resort":"universal","lat":28.4435,"lon":-81.44774,"zoom":16,"official":"https://www.universalorlando.com/web/en/us/theme-parks/epic-universe"}];
let currentPark = PARKS[0];
const CONFIG = {
  parkCenter: [28.4195, -81.5812],
  parkZoom: 16,
  followZoom: 18,
  reverseMinDistanceMeters: 350,
  reverseMinIntervalMs: 120_000,
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
const parkSelect = document.getElementById('parkSelect');
const officialParkLink = document.getElementById('officialParkLink');
const attractionSearchBox = document.querySelector('.search-box');
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
  window.dispatchEvent(new CustomEvent('parkpath:attraction', {detail: {name:attraction.name}}));
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

const magicAttractionLayer = L.layerGroup().addTo(map);
ATTRACTIONS.forEach((item, index) => {
  const marker = L.marker([item.lat, item.lon], { icon: attractionIcon(index + 1), title: item.name, alt: item.name })
    .addTo(magicAttractionLayer).on('click', () => selectAttraction(item));
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
  const selectedDistance = metersBetween(lat, lon, currentPark.lat, currentPark.lon);
  parkState.textContent = selectedDistance < 1500
    ? 'Região de ' + currentPark.name + ' · limite aproximado'
    : 'Mapa de ' + currentPark.name + ' · GPS real fora do parque';
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
      if (metersBetween(map.getCenter().lat, map.getCenter().lng, lat, lon) >= 5) map.panTo([lat, lon], { animate: true, duration: 0.6, easeLinearity: 0.25 });
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
  map.flyTo([currentPark.lat,currentPark.lon], currentPark.zoom, { duration: 0.8 });
}

parkBtn.addEventListener('click', showPark);
exploreBtn.addEventListener('click', showPark);

retryBtn.addEventListener('click', startWatching);

map.on('dragstart', () => {
  selectedView = 'manual';
  setFollow(false);
});

startWatching();

// Walt Disney World: mapas independentes; atrações cadastradas apenas no Magic Kingdom.
function setPark(key, {moveMap=true} = {}) {
  const next = PARKS.find(p=>p.key===key) || PARKS[0];
  currentPark = next;
  parkSelect.value = next.key;
  if (typeof syncParkQuickButtons === 'function') syncParkQuickButtons();
  officialParkLink.href = next.official;
  if (next.key === "magic") {
    if (!map.hasLayer(magicAttractionLayer)) magicAttractionLayer.addTo(map);
    attractionSearchBox.hidden = false;
  } else {
    if (map.hasLayer(magicAttractionLayer)) map.removeLayer(magicAttractionLayer);
    attractionSearchBox.hidden = true;
    searchResults.classList.remove('visible');
  }
  // Fecha somente o cartão da atração anterior, sem mexer na navegação A-B.
  if (selectedAttraction) closeAttraction.click();
  parkState.textContent = "Mapa de " + next.name;
  if (moveMap) {
    selectedView = "park";
    setFollow(false);
    map.flyTo([next.lat,next.lon],next.zoom,{duration:0.7});
  }
  window.dispatchEvent(new CustomEvent('parkpath:park', {detail: {key:next.key,resort:next.resort}}));
  // A localização no topo continua representando a localização GPS, não o parque selecionado.
}
parkSelect.addEventListener('change', ()=>setPark(parkSelect.value));
const parkQuickButtons=[...document.querySelectorAll('.park-quick-actions button[data-park]')];
const resortTabs=[...document.querySelectorAll('.resort-tabs button[data-resort]')];
let visibleResort='disney';
function showResort(resort){
  visibleResort=resort;
  resortTabs.forEach(button=>{
    const active=button.dataset.resort===resort;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',String(active));
  });
  parkQuickButtons.forEach(button=>{button.hidden=button.dataset.resort!==resort;});
}
parkQuickButtons.forEach(button=>button.addEventListener('click',()=>setPark(button.dataset.park)));
resortTabs.forEach(button=>button.addEventListener('click',()=>showResort(button.dataset.resort)));
function syncParkQuickButtons(){
  showResort(currentPark.resort);
  parkQuickButtons.forEach(button=>{
    const active=button.dataset.park===currentPark.key;
    button.classList.toggle('selected',active);
    button.setAttribute('aria-pressed',String(active));
  });
}

setPark('magic',{moveMap:false});

/* ParkPath v4: planejador independente de país/parque, A → B, GPS opcional. */
(function initGlobalWalkingPlanner(){
  const ids=[
    "plannerOpenBtn","routePlannerPanel","plannerCloseBtn","plannerMessage",
    "plannerOriginLabel","plannerDestinationLabel","pickOriginBtn",
    "pickDestinationBtn","useGpsOriginBtn","plannerSearch",
    "plannerSearchBtn","plannerMetrics","plannerWalkMinutes",
    "plannerWalkDistance","plannerCalculateBtn","plannerResetBtn",
    "planAttractionBtn"
  ];
  const ui=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
  if(ids.some(id=>!ui[id])){console.error("Interface de rotas incompleta.");return;}
  let origin=null,destination=null,picking=null,routeLayer=null;
  let aMarker=null,bMarker=null,requestController=null,requestSequence=0;
  let lastSearchAt=0;
  const WALK_METERS_PER_MINUTE=75; // 4,5 km/h
  const nameCoords=(p)=>p?.source==="gps"?"Minha localização (GPS)":p?.label||"Ponto escolhido no mapa";

  function message(value,error=false){
    ui.plannerMessage.textContent=value;
    ui.plannerMessage.style.color=error?"#ad3434":"#446084";
  }
  function showPlanner(){
    document.body.classList.add("planner-open");
    ui.routePlannerPanel.classList.remove("hidden");
    permissionPanel.classList.add("hidden");
    pickingTestOrigin=false;
    selectedView="manual";
    setFollow(false);
  }
  function hidePlanner(){
    picking=null;
    ui.routePlannerPanel.classList.remove("is-picking");
    document.body.classList.remove("planner-open");
    ui.routePlannerPanel.classList.add("hidden");
  }
  function forgetLine(){
    requestSequence++;
    if(requestController){requestController.abort();requestController=null;}
    if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}
    ui.plannerMetrics.classList.add("hidden");
    ui.plannerCalculateBtn.disabled=false;
    ui.plannerCalculateBtn.textContent="Calcular caminhada";
  }
  function makePin(p,letter,kind){
    return L.marker([p.lat,p.lon],{
      icon:L.divIcon({
        className:"planner-map-pin",
        html:'<div class="planner-pin '+kind+'">'+letter+'</div>',
        iconSize:[36,36],iconAnchor:[18,18]
      }),
      title:letter==="A"?"Partida":"Destino"
    }).addTo(map);
  }
  function refreshPoints(){
    ui.plannerOriginLabel.textContent=origin?nameCoords(origin):"Não selecionada";
    ui.plannerDestinationLabel.textContent=destination?nameCoords(destination):"Não selecionado";
    if(aMarker){map.removeLayer(aMarker);aMarker=null;}
    if(bMarker){map.removeLayer(bMarker);bMarker=null;}
    const src=origin?.source==="gps"&&latestPosition
      ? {...origin,lat:latestPosition.lat,lon:latestPosition.lon}:origin;
    if(src)aMarker=makePin(src,"A","origin");
    if(destination)bMarker=makePin(destination,"B","destination");
  }
  function selectPoint(which,point){
    forgetLine();
    if(which==="origin"){origin=point;}else{destination=point;}
    refreshPoints();
  }
  function startPicking(which){
    showPlanner();
    picking=which;
    ui.routePlannerPanel.classList.add("is-picking");
    message(which==="origin"
      ?"Toque no mapa para marcar A (partida). Depois marque B (destino)."
      :"Toque no mapa para marcar B (destino).");
  }
  function reset(){
    picking=null;
    ui.routePlannerPanel.classList.remove("is-picking");
    forgetLine();
    origin=null;destination=null;
    refreshPoints();
    message("Escolha A e B em qualquer lugar do mundo. O GPS é opcional.");
  }
  function useGpsOrigin(){
    showPlanner();
    picking=null;
    ui.routePlannerPanel.classList.remove("is-picking");
    if(!("geolocation" in navigator)){
      message("O navegador não disponibiliza GPS. Marque A diretamente no mapa.",true);
      return;
    }
    message("Obtendo sua localização real…");
    const accept=(position)=>{
      latestPosition={
        lat:position.coords.latitude,lon:position.coords.longitude,
        accuracy:position.coords.accuracy,speed:position.coords.speed,
        heading:position.coords.heading,timestamp:position.timestamp
      };
      selectPoint("origin",{lat:latestPosition.lat,lon:latestPosition.lon,source:"gps"});
      message("Partida definida pelo GPS. Agora marque B no mapa.");
      map.flyTo([latestPosition.lat,latestPosition.lon],Math.max(map.getZoom(),15),{duration:.5});
    };
    navigator.geolocation.getCurrentPosition(
      accept,
      err=>message("Não foi possível acessar o GPS. Permita localização ou marque A no mapa.",true),
      {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    );
  }
  function numericDistance(m){
    if(m<1000)return Math.round(m/10)*10+" m";
    return (m/1000).toFixed(2).replace(".",",")+" km";
  }
  function walkingDuration(m){
    const mins=Math.max(1,Math.ceil(m/WALK_METERS_PER_MINUTE));
    return mins<60?"~"+mins+" min":"~"+Math.floor(mins/60)+" h "+(mins%60)+" min";
  }
  async function calculate(){
    if(!origin||!destination){
      message("Escolha os dois pontos: A (partida) e B (destino).",true);return;
    }
    let from=origin;
    if(origin.source==="gps"){
      if(!latestPosition || Date.now()-latestPosition.timestamp>120000){
        message("GPS desatualizado. Toque em “Usar meu GPS” para atualizar.",true);return;
      }
      from={...origin,lat:latestPosition.lat,lon:latestPosition.lon};
      refreshPoints();
    }
    const kmDirect=metersBetween(from.lat,from.lon,destination.lat,destination.lon)/1000;
    if(kmDirect<.005){message("A partida e o destino estão praticamente no mesmo ponto.");return;}
    if(kmDirect>25){message("Essa distância é grande demais para o teste de caminhada (limite de 25 km em linha reta).",true);return;}
    forgetLine();
    const controller=new AbortController();
    requestController=controller;
    const seq=++requestSequence;
    const timer=setTimeout(()=>controller.abort(),18000);
    ui.plannerCalculateBtn.disabled=true;
    ui.plannerCalculateBtn.textContent="Calculando…";
    message("Buscando caminhos para pedestres na região selecionada…");
    try{
      const coordinates=[from,destination].map(p=>p.lon+","+p.lat).join(";");
      const url="https://routing.openstreetmap.de/routed-foot/route/v1/driving/"+
        coordinates+"?overview=full&geometries=geojson&steps=false";
      const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("HTTP "+response.status);
      const data=await response.json();
      if(seq!==requestSequence)return;
      const route=data?.routes?.[0];
      const points=route?.geometry?.coordinates;
      const waypoints=data?.waypoints||[];
      if(data?.code!=="Ok"||!Number.isFinite(route?.distance)||
        route.distance<2||!Array.isArray(points)||points.length<2||
        points.some(c=>!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1]))||
        waypoints.some(w=>w.distance>150)){
        throw new Error("Nenhum caminho a pé confiável");
      }
      routeLayer=L.polyline(points.map(([lon,lat])=>[lat,lon]),{
        color:"#1677ff",weight:7,opacity:.91,lineCap:"round",lineJoin:"round"
      }).addTo(map);
      ui.plannerWalkMinutes.textContent=walkingDuration(route.distance);
      ui.plannerWalkDistance.textContent=numericDistance(route.distance);
      ui.plannerMetrics.classList.remove("hidden");
      ui.plannerCalculateBtn.textContent="Atualizar caminhada";
      message("Rota estimada pela rede de caminhos. Confirme o acesso e possíveis bloqueios antes de caminhar.");
      const lower=window.innerWidth<=600?Math.min(420,ui.routePlannerPanel.offsetHeight+25):80;
      map.fitBounds(routeLayer.getBounds(),{
        paddingTopLeft:[30,90],paddingBottomRight:[30,lower],maxZoom:18,animate:true
      });
    }catch(error){
      if(seq!==requestSequence)return;
      message(error.name==="AbortError"
        ?"O serviço de rotas demorou a responder. Tente novamente."
        :"Não foi possível confirmar um caminho a pé entre os pontos. Selecione outros pontos em ruas ou caminhos mapeados.",true);
      ui.plannerCalculateBtn.textContent="Tentar novamente";
      console.warn("Rota ParkPath:",error);
    }finally{
      clearTimeout(timer);
      if(seq===requestSequence){
        requestController=null;
        ui.plannerCalculateBtn.disabled=false;
      }
    }
  }
  async function searchPlace(){
    const q=ui.plannerSearch.value.trim();
    if(q.length<3){message("Digite um bairro, cidade ou endereço para buscar.",true);return;}
    if(Date.now()-lastSearchAt<1500){message("Aguarde um instante antes de outra busca.",true);return;}
    lastSearchAt=Date.now();
    ui.plannerSearchBtn.disabled=true;
    message("Procurando endereço no OpenStreetMap…");
    try{
      const url=new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q",q);
      url.searchParams.set("format","jsonv2");
      url.searchParams.set("limit","1");
      url.searchParams.set("accept-language","pt-BR");
      const res=await fetch(url,{headers:{Accept:"application/json"}});
      if(!res.ok)throw Error("Busca temporariamente indisponível");
      const items=await res.json();
      const place=items?.[0];
      if(!place)throw Error("Nenhum lugar encontrado");
      showPlanner();
      map.flyTo([Number(place.lat),Number(place.lon)],16,{duration:.9});
      message("Local encontrado. Toque em “Marcar A” ou “Marcar B” e depois no ponto desejado no mapa.");
    }catch(error){
      message("Não foi possível localizar esse endereço. Você ainda pode navegar pelo mapa manualmente.",true);
    }finally{ui.plannerSearchBtn.disabled=false;}
  }
  ui.plannerOpenBtn.addEventListener("click",()=>{
    showPlanner();
    message("Marque A e B no mapa ou use seu GPS para a partida.");
  });
  ui.plannerCloseBtn.addEventListener("click",hidePlanner);
  ui.pickOriginBtn.addEventListener("click",()=>startPicking("origin"));
  ui.pickDestinationBtn.addEventListener("click",()=>startPicking("destination"));
  ui.useGpsOriginBtn.addEventListener("click",useGpsOrigin);
  ui.plannerCalculateBtn.addEventListener("click",calculate);
  ui.plannerResetBtn.addEventListener("click",reset);
  ui.plannerSearchBtn.addEventListener("click",searchPlace);
  ui.plannerSearch.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();searchPlace();}
  });
  ui.planAttractionBtn.addEventListener("click",()=>{
    if(!selectedAttraction)return;
    showPlanner();
    selectPoint("destination",{
      lat:selectedAttraction.lat,lon:selectedAttraction.lon,
      label:selectedAttraction.name+" · ponto aproximado",source:"manual"
    });
    message("Destino definido pela atração. Marque a partida A no mapa ou use seu GPS.");
  });
  map.on("click",event=>{
    if(!picking||ui.routePlannerPanel.classList.contains("hidden"))return;
    const which=picking;
    const p={lat:event.latlng.lat,lon:event.latlng.lng,
      label:"Ponto no mapa · "+event.latlng.lat.toFixed(5)+", "+event.latlng.lng.toFixed(5),
      source:"manual"};
    selectPoint(which,p);
    if(which==="origin"&&!destination){
      picking="destination";
      message("Partida A definida! Agora toque no mapa para marcar o destino B.");
    }else{
      picking=null;
      ui.routePlannerPanel.classList.remove("is-picking");
      message(origin&&destination
        ?"Pontos A e B definidos. Toque em “Calcular caminhada”."
        :"Ponto selecionado. Defina o outro ponto.");
    }
  });
})();
