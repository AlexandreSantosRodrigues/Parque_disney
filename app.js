const CONFIG = {
  initialCenter: [-22.9068, -43.1729], // fallback: Rio de Janeiro
  initialZoom: 13,
  followZoom: 18,
  reverseMinDistanceMeters: 250,
  reverseMinIntervalMs: 60_000,
  reverseEndpoint: 'https://nominatim.openstreetmap.org/reverse'
};

const map = L.map('map', {
  zoomControl: false,
  preferCanvas: true
}).setView(CONFIG.initialCenter, CONFIG.initialZoom);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const placeName = document.getElementById('placeName');
const gpsState = document.getElementById('gpsState');
const accuracyText = document.getElementById('accuracyText');
const speedText = document.getElementById('speedText');
const permissionPanel = document.getElementById('permissionPanel');
const retryBtn = document.getElementById('retryBtn');
const followBtn = document.getElementById('followBtn');
const locateBtn = document.getElementById('locateBtn');

let watchId = null;
let userMarker = null;
let accuracyCircle = null;
let latestPosition = null;
let followUser = true;
let hasCenteredOnce = false;
let lastReverse = { lat: null, lon: null, time: 0 };
let reverseInFlight = false;

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

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    placeName.textContent = buildPlaceLabel(data.address, data.display_name);
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

  if (followUser) {
    if (!hasCenteredOnce) {
      map.setView([lat, lon], CONFIG.followZoom, { animate: false });
      hasCenteredOnce = true;
    } else {
      map.panTo([lat, lon], { animate: true, duration: 0.6, easeLinearity: 0.25 });
    }
  }

  maybeReverseGeocode(lat, lon);
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
  console.warn('Erro de geolocalização:', error);
}

function startWatching() {
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
  if (followUser && latestPosition) {
    map.flyTo([latestPosition.lat, latestPosition.lon], Math.max(map.getZoom(), 17), { duration: 0.7 });
  }
});

locateBtn.addEventListener('click', () => {
  setFollow(true);
  if (latestPosition) {
    map.flyTo([latestPosition.lat, latestPosition.lon], CONFIG.followZoom, { duration: 0.7 });
  } else {
    startWatching();
  }
});

retryBtn.addEventListener('click', startWatching);

map.on('dragstart', () => setFollow(false));

startWatching();


/* ParkPath v3 — rotas a pé e teste no Magic Kingdom */
const routeUI = Object.fromEntries(["demoBtn","mapHint","routeCard","routeTitle","clearRouteBtn","routeMetrics","walkTime","walkDistance","routeMessage","routeBtn"].map(id=>[id,document.getElementById(id)]));
const disneyOrigin={lat:28.41885,lon:-81.58115};
let disneyTesting=false, walkingDestination=null, walkingMarker=null, walkingLine=null, routeOrigin=null, currentRouteController=null, routeRequestId=0;
const destinationIcon=L.divIcon({className:"path-destination-icon",html:'<div class="path-pin"></div>',iconSize:[28,28],iconAnchor:[14,28]});
function walkingDistance(a,b){return metersBetween(a.lat,a.lon,b.lat,b.lon);}
function clearWalkingRoute(){
  routeRequestId++;
  if(currentRouteController) currentRouteController.abort();
  currentRouteController=null;
  if(walkingLine)map.removeLayer(walkingLine);
  if(walkingMarker)map.removeLayer(walkingMarker);
  walkingLine=null;walkingMarker=null;walkingDestination=null;routeOrigin=null;
  routeUI.routeCard.classList.add("hidden");
  routeUI.routeMetrics.classList.add("hidden");
  routeUI.routeBtn.disabled=false;
  routeUI.routeBtn.textContent="Calcular caminhada";
  routeUI.mapHint.textContent="Toque no mapa para escolher seu destino";
}
function selectWalkingDestination(lat,lon,title="Destino selecionado"){
  clearWalkingRoute();
  walkingDestination={lat,lon};
  walkingMarker=L.marker([lat,lon],{icon:destinationIcon}).addTo(map);
  routeUI.routeTitle.textContent=title;
  routeUI.routeCard.classList.remove("hidden");
  routeUI.routeMessage.textContent=disneyTesting?"Origem simulada no Magic Kingdom. Não representa seu GPS.":"Rota a partir da sua localização GPS.";
  routeUI.mapHint.textContent="Destino selecionado";
}
function formatWalkDistance(m){return m<1000?`${Math.round(m/10)*10} m`:`${(m/1000).toFixed(2).replace(".",",")} km`;}
function formatWalkTime(m){let min=Math.max(1,Math.ceil(m/75));return min<60?`~${min} min`:`~${Math.floor(min/60)}h ${min%60}min`;}
async function calculateWalk(){
  if(!walkingDestination)return;
  const origin=disneyTesting?disneyOrigin:latestPosition;
  if(!origin){routeUI.routeMessage.textContent="GPS não disponível. Ative a localização ou use Teste Disney.";return;}
  const straight=walkingDistance(origin,walkingDestination);
  if(straight>25000){routeUI.routeMessage.textContent="Destino muito distante para uma caminhada. Escolha um ponto próximo.";return;}
  if(straight<2){routeUI.routeMessage.textContent="Você já está perto do destino.";return;}
  const requestId=++routeRequestId;
  if(currentRouteController)currentRouteController.abort();
  currentRouteController=new AbortController();
  routeUI.routeBtn.disabled=true;
  routeUI.routeBtn.textContent="Calculando...";
  routeUI.routeMessage.textContent="Buscando caminhos para pedestres...";
  routeUI.routeMetrics.classList.add("hidden");
  if(walkingLine){map.removeLayer(walkingLine);walkingLine=null;}
  const timeout=setTimeout(()=>currentRouteController?.abort(),14000);
  try{
    const url=`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${origin.lon},${origin.lat};${walkingDestination.lon},${walkingDestination.lat}?overview=full&geometries=geojson&steps=false`;
    const response=await fetch(url,{signal:currentRouteController.signal,headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("Routing HTTP "+response.status);
    const data=await response.json();
    if(requestId!==routeRequestId)return;
    const route=data?.routes?.[0];
    if(data.code!=="Ok"||!Number.isFinite(route?.distance)||!route.geometry?.coordinates?.length)throw new Error("Sem caminho");
    walkingLine=L.polyline(route.geometry.coordinates.map(([lon,lat])=>[lat,lon]),{color:"#1868de",weight:6,opacity:.9}).addTo(map);
    routeOrigin={lat:origin.lat,lon:origin.lon};
    routeUI.walkTime.textContent=formatWalkTime(route.distance);
    routeUI.walkDistance.textContent=formatWalkDistance(route.distance);
    routeUI.routeMetrics.classList.remove("hidden");
    routeUI.routeMessage.textContent="Tempo estimado a 4,5 km/h, sem paradas. O trajeto deve ser conferido no local.";
    routeUI.routeBtn.textContent="Atualizar caminhada";
    setFollow(false);
    map.fitBounds(walkingLine.getBounds(),{paddingTopLeft:[20,80],paddingBottomRight:[20,240],maxZoom:18});
  }catch(error){
    if(requestId!==routeRequestId)return;
    routeUI.routeMessage.textContent="Não foi possível confirmar a rota a pé. Tente novamente. Nenhuma linha reta será mostrada como caminho válido.";
    routeUI.routeBtn.textContent="Tentar novamente";
    console.warn("Rota a pé indisponível",error);
  }finally{
    clearTimeout(timeout);
    if(requestId===routeRequestId){currentRouteController=null;routeUI.routeBtn.disabled=false;}
  }
}
routeUI.routeBtn.addEventListener("click",calculateWalk);
routeUI.clearRouteBtn.addEventListener("click",clearWalkingRoute);
map.on("click",ev=>selectWalkingDestination(ev.latlng.lat,ev.latlng.lng));
routeUI.demoBtn.addEventListener("click",()=>{
  if(disneyTesting){
    disneyTesting=false;routeUI.demoBtn.textContent="Teste Disney";clearWalkingRoute();placeName.textContent="Localização atual";setFollow(true);
    if(latestPosition)map.flyTo([latestPosition.lat,latestPosition.lon],CONFIG.followZoom);
    return;
  }
  disneyTesting=true;setFollow(false);routeUI.demoBtn.textContent="Sair do teste";placeName.textContent="Magic Kingdom · Simulação";
  map.flyTo([28.4195,-81.5808],17);
  selectWalkingDestination(28.42045,-81.58070,"Seven Dwarfs Mine Train (aprox.)");
});
