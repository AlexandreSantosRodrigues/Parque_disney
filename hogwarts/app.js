/* Estou em Hogwarts — site independente, dados por ThemeParks.wiki.
   Apenas experiências oficiais de Harry Potter. Nenhuma coordenada nem fila inventada. */
(function(){
"use strict";
const API="https://api.themeparks.wiki/v1/entity/";
const TTL=300000,MAX_AGE=720000,RETRY=60000;
const WORLDS={
 hogsmeade:{title:"Rumo a Hogwarts",caption:"HOGSMEADE · ISLANDS OF ADVENTURE",lat:28.47114,lon:-81.47157,zoom:16,parkId:"267615cc-8943-4c2a-ae2c-5da728ca591f"},
 diagon:{title:"Descubra o Beco Diagonal",caption:"BECO DIAGONAL · UNIVERSAL STUDIOS",lat:28.47724,lon:-81.46924,zoom:16,parkId:"eb3f4560-2383-4a36-9152-6b3e5ed6bc57"},
 ministry:{title:"Entre no Ministério",caption:"MINISTÉRIO DA MAGIA · EPIC UNIVERSE",lat:28.4435,lon:-81.44774,zoom:16,parkId:"12dbb85b-265f-44e6-bccf-f1faa17211fc"}
};
// A lista abaixo representa experiências comprovadas pelos materiais oficiais Universal.
// Caso a API não retorne um item ou posição, ele permanece na lista sem pino nem fila.
const GUIDE={
 hogsmeade:[
  {key:"hagrid",name:"Hagrid's Magical Creatures Motorbike Adventure",aliases:["hagrid"],icon:"🎢",type:"Montanha-russa",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/hagrids-magical-creatures-motorbike-adventure"},
  {key:"forbidden",name:"Harry Potter and the Forbidden Journey",aliases:["forbidden journey"],icon:"🚀",type:"Atração simulada",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/harry-potter-and-the-forbidden-journey"},
  {key:"hippogriff",name:"Flight of the Hippogriff",aliases:["flight of the hippogriff","hippogriff"],icon:"🎢",type:"Montanha-russa familiar",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/flight-of-the-hippogriff"},
  {key:"expressH",name:"Hogwarts Express · Estação Hogsmeade",aliases:["hogwarts express"],icon:"🚂",type:"Trem · ingresso Park-to-Park",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/hogwarts-express-hogsmeade-station"}
 ],
 diagon:[
  {key:"gringotts",name:"Harry Potter and the Escape from Gringotts",aliases:["escape from gringotts","gringotts"],icon:"🏦",type:"Atração temática 3-D",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/harry-potter-and-the-escape-from-gringotts"},
  {key:"expressK",name:"Hogwarts Express · Estação King's Cross",aliases:["hogwarts express"],icon:"🚂",type:"Trem · ingresso Park-to-Park",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/hogwarts-express-kings-cross-station"},
  {key:"ollivanders",name:"Ollivanders · Experiência de varinhas",aliases:["ollivanders"],icon:"🪄",type:"Experiência temática",url:"https://www.universalorlando.com/web/en/us/theme-parks/universal-studios-florida/the-wizarding-world-of-harry-potter-diagon-alley"}
 ],
 ministry:[
  {key:"battle",name:"Harry Potter and the Battle at the Ministry",aliases:["battle at the ministry"],icon:"🚀",type:"Atração simulada",url:"https://www.universalorlando.com/web/en/us/things-to-do/rides-attractions/harry-potter-and-the-battle-at-the-ministry"},
  {key:"cirque",name:"Le Cirque Arcanus",aliases:["le cirque arcanus","cirque arcanus"],icon:"🎭",type:"Espetáculo",url:"https://www.universalorlando.com/web/en/us/epic-universe/worlds/the-wizarding-world-of-harry-potter-ministry-of-magic"},
  {key:"wands",name:"Experiências interativas com varinhas",aliases:["interactive wand experience"],icon:"🪄",type:"Experiência interativa",url:"https://www.universalorlando.com/web/en/us/epic-universe/worlds/the-wizarding-world-of-harry-potter-ministry-of-magic"}
 ]
};
const byId=id=>document.getElementById(id);
const el=Object.fromEntries(["worldEyebrow","worldHeading","mapMessage","fetchStatus","search","sort","rideList","centerBtn","gpsBtn","routeBtn","selectedPanel","selectedName","selectedMeta","selectedOfficial"].map(id=>[id,byId(id)]));
let world="hogsmeade",selected=null,userPosition=null,accuracy=null,routeLayer=null,loadingCount=0;
const datasets=new Map(Object.keys(WORLDS).map(key=>[key,{catalog:[],live:[],catalogLoaded:false,liveLoaded:false,catalogAt:0,liveAt:0,catalogAttempt:0,liveAttempt:0,catalogError:"",liveError:"",pendingCatalog:null,pendingLive:null}]));
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([WORLDS[world].lat,WORLDS[world].lon],WORLDS[world].zoom);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
const rideLayer=L.layerGroup().addTo(map),gpsLayer=L.layerGroup().addTo(map);
function age(ts){const v=Date.parse(ts||"");return Number.isFinite(v)?Date.now()-v:Infinity;}
function waitOf(ride){
 if(!ride.live)return {minutes:null,label:ride.type==="Espetáculo"?"Consulte horários":"Fila não informada",status:"UNKNOWN"};
 const d=age(ride.live.lastUpdated),status=String(ride.live.status||"UNKNOWN").toUpperCase();
 if(!Number.isFinite(d)||d>MAX_AGE||d< -120000)return {minutes:null,label:"Dados antigos",status:"STALE"};
 if(status==="CLOSED")return {minutes:null,label:"Fechada",status};
 if(status==="DOWN")return {minutes:null,label:"Parada temporária",status};
 if(status==="REFURBISHMENT")return {minutes:null,label:"Em manutenção",status};
 if(status!=="OPERATING")return {minutes:null,label:"Sem situação atual",status};
 const v=ride.live.queue?.STANDBY?.waitTime;
 if(typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=360)return {minutes:Math.round(v),label:Math.round(v)+" min",status};
 return {minutes:null,label:ride.type==="Espetáculo"?"Consulte horários":"Fila não informada",status};
}
function distance(a,b){
 const rad=Math.PI/180,R=6371000,dy=(a.lat-b.lat)*rad,dx=(a.lon-b.lon)*rad;
 const z=Math.sin(dy/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dx/2)**2;
 return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z));
}
function coord(record,key){
 if(!record?.location||record.location.latitude==null||record.location.longitude==null)return null;
 const lat=Number(record.location.latitude),lon=Number(record.location.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return null;
 const park=WORLDS[key];
 if(distance({lat,lon},{lat:park.lat,lon:park.lon})>7500)return null;
 return {lat,lon};
}
function ridesFor(key){
 const data=datasets.get(key);
 return GUIDE[key].map(guide=>{
  const found=data.catalog.find(item=>guide.aliases.some(alias=>normalize(item.name).includes(normalize(alias))));
  const live=data.live.find(item=>(found?.id&&item.id===found.id)||
   (!found&&guide.aliases.some(alias=>normalize(item.name).includes(normalize(alias)))));
  return {...guide,coords:found?.coords||null,providerId:found?.id||null,live:live||null};
 });
}
function rows(){return ridesFor(world);}
function clearRoute(){if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}}
function select(ride){
 selected=ride.key;clearRoute();
 el.selectedPanel.hidden=false;
 el.selectedName.textContent=ride.name;
 const w=waitOf(ride);
 el.selectedMeta.textContent=ride.type+" · "+w.label+(ride.coords?" · posição aproximada no mapa":" · sem coordenadas verificadas");
 el.selectedOfficial.href=ride.url;
 el.routeBtn.disabled=!ride.coords;
 if(ride.coords)map.flyTo([ride.coords.lat,ride.coords.lon],18,{duration:.6});
 renderList();
}
function renderPins(){
 rideLayer.clearLayers();
 for(const r of rows()){
  if(!r.coords)continue;
  const w=waitOf(r);
  const code=w.minutes===null?"—":w.minutes+"m";
  const kind=w.minutes!==null?"":" "+((w.status==="CLOSED"||w.status==="DOWN")?"closed":"unknown");
  const icon=L.divIcon({className:"hp-pin",html:'<div class="hp-pin-inner'+kind+'"><i>'+r.icon+'</i><span>'+code+'</span></div>',iconSize:[60,46],iconAnchor:[30,42]});
  L.marker([r.coords.lat,r.coords.lon],{icon,title:r.name,alt:r.name}).addTo(rideLayer).on("click",()=>select(r));
 }
}
function appendText(parent,tag,className,text){
 const node=document.createElement(tag);if(className)node.className=className;node.textContent=text;parent.append(node);return node;
}
function renderList(){
 const needle=normalize(el.search.value),sort=el.sort.value;
 const data=rows().filter(r=>normalize(r.name).includes(needle));
 if(sort==="short"||sort==="long")data.sort((a,b)=>{
  const x=waitOf(a).minutes,y=waitOf(b).minutes;
  if(x===null&&y===null)return a.name.localeCompare(b.name);
  if(x===null)return 1;if(y===null)return -1;
  return (sort==="short"?x-y:y-x);
 });
 el.rideList.replaceChildren();
 for(const r of data){
  const w=waitOf(r);
  const item=document.createElement("button");item.type="button";
  item.className="ride-card"+(selected===r.key?" active":"");
  const symbol=appendText(item,"span","ride-symbol",r.icon);
  const info=appendText(item,"span","ride-info","");
  appendText(info,"strong","",r.name);
  appendText(info,"span","",r.type+(r.coords?" · ver no mapa":" · sem ponto mapeado"));
  appendText(item,"span","ride-wait"+(w.minutes===null?" offline":""),w.label);
  item.addEventListener("click",()=>select(r));el.rideList.append(item);
 }
 if(!data.length)appendText(el.rideList,"p","", "Nenhuma experiência corresponde à busca.");
 const s=datasets.get(world);
 let catalogMapped=rows().filter(r=>r.coords).length, waits=rows().filter(r=>waitOf(r).minutes!==null).length;
 let message=GUIDE[world].length+" experiências do guia · "+catalogMapped+" com posição verificada · "+waits+" filas informadas";
 if(s.catalogError)message+=" · catálogo indisponível";
 if(s.liveError)message+=" · filas indisponíveis";
 el.fetchStatus.textContent=message;
 if(selected){
  const item=rows().find(r=>r.key===selected);
  if(item){
   const w=waitOf(item);
   el.selectedMeta.textContent=item.type+" · "+w.label+(item.coords?" · ponto aproximado":" · sem coordenadas verificadas");
   el.routeBtn.disabled=!item.coords;
  }
 }
}
function update(){
 renderPins();renderList();
}
async function api(url){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timer);}
}
async function loadCatalog(key){
 const s=datasets.get(key),now=Date.now();
 if(s.pendingCatalog)return s.pendingCatalog;
 if(s.catalogLoaded&&now-s.catalogAt<21600000)return;
 if(now-s.catalogAttempt<RETRY)return;
 s.catalogAttempt=now;
 const pending=(async()=>{
  try{
   const json=await api(API+WORLDS[key].parkId+"/children");
   if(!Array.isArray(json?.children))throw Error("Formato inesperado");
   s.catalog=json.children.filter(x=>x&&["ATTRACTION","SHOW"].includes(x.entityType)&&typeof x.id==="string"&&typeof x.name==="string")
    .map(x=>({...x,coords:coord(x,key)}));
   s.catalogAt=Date.now();s.catalogLoaded=true;s.catalogError="";
  }catch(error){s.catalogError="Catálogo não disponível";console.warn("Hogwarts catálogo",key,error);}
  finally{if(world===key)update();s.pendingCatalog=null;}
 })();
 s.pendingCatalog=pending;return pending;
}
async function loadLive(key){
 const s=datasets.get(key),now=Date.now();
 if(s.pendingLive)return s.pendingLive;
 if(s.liveLoaded&&now-s.liveAt<TTL)return;
 if(now-s.liveAttempt<TTL)return;
 s.liveAttempt=now;
 const pending=(async()=>{
  try{
   const json=await api(API+WORLDS[key].parkId+"/live");
   if(!Array.isArray(json?.liveData))throw Error("Formato inesperado");
   s.live=json.liveData.filter(x=>x&&["ATTRACTION","SHOW"].includes(x.entityType)&&typeof x.id==="string"&&typeof x.name==="string");
   s.liveAt=Date.now();s.liveLoaded=true;s.liveError="";
  }catch(error){s.liveError="Filas não disponíveis";console.warn("Hogwarts filas",key,error);}
  finally{if(world===key)update();s.pendingLive=null;}
 })();
 s.pendingLive=pending;return pending;
}
function setWorld(key){
 if(!WORLDS[key])return;
 world=key;selected=null;clearRoute();el.selectedPanel.hidden=true;el.routeBtn.disabled=true;
 document.querySelectorAll(".world-nav button[data-world]").forEach(b=>{
  const active=b.dataset.world===key;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));
 });
 const p=WORLDS[key];
 el.worldEyebrow.textContent=p.caption;el.worldHeading.textContent=p.title;
 el.search.value="";rideLayer.clearLayers();map.flyTo([p.lat,p.lon],p.zoom,{duration:.7});
 el.mapMessage.textContent="Atrações com coordenadas publicadas aparecem no mapa. Fila estimada, não previsão futura.";
 update();loadCatalog(key);loadLive(key);
}
document.querySelectorAll(".world-nav button[data-world]").forEach(btn=>btn.addEventListener("click",()=>setWorld(btn.dataset.world)));
el.search.addEventListener("input",renderList);
el.sort.addEventListener("change",renderList);
el.centerBtn.addEventListener("click",()=>{const p=WORLDS[world];map.flyTo([p.lat,p.lon],p.zoom,{duration:.5});});
el.gpsBtn.addEventListener("click",()=>{
 if(!navigator.geolocation){el.mapMessage.textContent="GPS não disponível neste dispositivo.";return;}
 el.mapMessage.textContent="Solicitando permissão de localização…";
 navigator.geolocation.getCurrentPosition(position=>{
  const lat=position.coords.latitude,lon=position.coords.longitude;
  userPosition={lat,lon,at:Date.now()};
  gpsLayer.clearLayers();accuracy=position.coords.accuracy;
  L.circle([lat,lon],{radius:accuracy,color:"#226e9b",weight:1,fillOpacity:.07}).addTo(gpsLayer);
  L.circleMarker([lat,lon],{radius:8,color:"#fff",weight:3,fillColor:"#237cc5",fillOpacity:1}).addTo(gpsLayer);
  map.flyTo([lat,lon],Math.max(16,map.getZoom()),{duration:.6});
  el.mapMessage.textContent="GPS atualizado · precisão ±"+Math.round(accuracy)+" m.";
 },()=>{el.mapMessage.textContent="Não foi possível acessar seu GPS. Verifique a permissão de localização.";},{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
});
el.routeBtn.addEventListener("click",async()=>{
 const point=rows().find(x=>x.key===selected);
 if(!point?.coords){el.mapMessage.textContent="Atração sem coordenadas verificadas.";return;}
 if(!userPosition||Date.now()-userPosition.at>120000){
  el.mapMessage.textContent="Primeiro toque em “Meu GPS” para atualizar a origem.";return;
 }
 clearRoute();el.routeBtn.disabled=true;el.mapMessage.textContent="Buscando caminho a pé no OpenStreetMap…";
 const from=userPosition,to=point.coords;
 const url="https://routing.openstreetmap.de/routed-foot/route/v1/driving/"+from.lon+","+from.lat+";"+to.lon+","+to.lat+"?overview=full&geometries=geojson&steps=false";
 try{
  const payload=await api(url);
  const line=payload?.routes?.[0];const coords=line?.geometry?.coordinates;
  if(payload?.code!=="Ok"||!Array.isArray(coords)||coords.length<2||!Number.isFinite(line?.distance))throw Error("Sem rota");
  routeLayer=L.polyline(coords.map(c=>[c[1],c[0]]),{color:"#215aab",weight:6,opacity:.88}).addTo(map);
  map.fitBounds(routeLayer.getBounds(),{padding:[30,30],maxZoom:17});
  const km=(line.distance/1000).toFixed(2).replace(".",",");
  el.mapMessage.textContent="Caminho estimado: "+km+" km · ~"+Math.ceil(line.distance/75)+" min a pé, sem paradas. Confirme acessos internos.";
 }catch(error){
  el.mapMessage.textContent="Não foi possível calcular uma rota confiável. Caminhos internos podem estar indisponíveis.";
 }finally{el.routeBtn.disabled=false;}
});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){loadCatalog(world);loadLive(world);}});
setInterval(()=>{if(!document.hidden){update();loadLive(world);}},60000);
// Testes locais podem inspecionar a coleção oficial, sem fazer consultas extras.
window.HogwartsApp={worlds:Object.keys(WORLDS),guide:GUIDE,normalize,waitOf};
setWorld("hogsmeade");
})();
