/* ParkPath — catálogo geográfico + filas reais para três áreas do mundo de Harry Potter.
 * Fonte: ThemeParks.wiki /v1/entity/{parkId}/children e /live
 * Nunca inventa tempo nem coordenadas. Sem API key, sem backend.
 */
(function initParkPathQueues() {
  "use strict";

  const PARKS = {
    hogsmeade: {name:"Hogsmeade · Hogwarts", id:"267615cc-8943-4c2a-ae2c-5da728ca591f", lat:28.47114, lon:-81.47157},
    diagon: {name:"Beco Diagonal", id:"eb3f4560-2383-4a36-9152-6b3e5ed6bc57", lat:28.47724, lon:-81.46924},
    ministry: {name:"Ministério da Magia", id:"12dbb85b-265f-44e6-bccf-f1faa17211fc", lat:28.4435, lon:-81.44774}
  };
  // Guia editorial de 10 experiências do mundo bruxo, inclusive as que não
  // publicam coordenadas/fila. Nunca criar marcadores fictícios.
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
  const ROOT = "https://api.themeparks.wiki/v1/entity/";
  const LIVE_TTL = 5 * 60 * 1000;
  const CATALOG_TTL = 6 * 60 * 60 * 1000;
  const RETRY_DELAY = 30 * 1000;
  const STALE_AFTER = 12 * 60 * 1000;
  const MAX_WAIT = 360;
  const els = Object.fromEntries([
    "queueOpenBtn", "queueOpenHint", "queuePanel", "queueCloseBtn",
    "queueParkHeading", "queueStatus", "queueSearch", "queueSort",
    "queueList", "queueRefreshBtn", "attractionQueueInfo",
    "attractionName", "attractionCard"
  ].map(id => [id, document.getElementById(id)]));
  if (Object.values(els).some(x => !x) || typeof L === "undefined") {
    console.warn("ParkPath: módulo de atrações não inicializado — interface incompleta.");
    return;
  }

  const state = new Map();
  for (const key of Object.keys(PARKS)) state.set(key, {
    catalog:null, catalogAt:0, live:null, liveAt:0,
    catalogAttempt:0, liveAttempt:0, catalogError:"",
    liveError:"", inflightCatalog:null, inflightLive:null, etag:null
  });
  const markerLayer = L.layerGroup().addTo(map);
  const markers = new Map();
  let park = document.getElementById("parkSelect").value || "magic";
  let selectedId = null;
  let globalThrottleUntil = 0;
  let renderTicket = 0;

  const normalized = value => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  const minutesSince = age => Number.isFinite(age) && age >= 0
    ? age < 60000 ? "menos de 1 min" : Math.floor(age/60000) + " min"
    : "sem horário";
  const hourInOrlando = stamp => {
    const t = Date.parse(stamp || "");
    return Number.isFinite(t)
      ? new Intl.DateTimeFormat("pt-BR", {timeZone:"America/New_York",hour:"2-digit",minute:"2-digit"}).format(t) + " (Orlando)"
      : "horário indisponível";
  };
  const statusLabel = value => ({
    OPERATING:"Funcionando", DOWN:"Parada temporária",
    CLOSED:"Fechada", REFURBISHMENT:"Em manutenção"
  })[value] || "Situação não confirmada";

  function distanceMeters(latA, lonA, latB, lonB) {
    const d2r = Math.PI/180, R = 6371000;
    const dLat=(latB-latA)*d2r, dLon=(lonB-lonA)*d2r;
    const a=Math.sin(dLat/2)**2 +
      Math.cos(latA*d2r)*Math.cos(latB*d2r)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function coordinates(value, key) {
    const loc = value?.location;
    if (loc?.latitude == null || loc?.longitude == null) return null;
    const lat = Number(loc.latitude), lon = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat)>90 || Math.abs(lon)>180) return null;
    const center = PARKS[key];
    if (distanceMeters(lat,lon,center.lat,center.lon)>10000) return null;
    return {lat,lon};
  }
  function childAttractions(key) {
    const catalog=state.get(key)?.catalog;
    return catalog || [];
  }
  function compiled(key) {
    const dataset=state.get(key),guides=GUIDE[key]||[];
    if(!dataset)return [];
    const catalog=dataset.catalog||[],liveData=dataset.live||[];
    return guides.map(guide=>{
      const matchCatalog=catalog.find(entry=>guide.aliases.some(alias=>normalized(entry.name).includes(normalized(alias))));
      const matchLive=liveData.find(entry=>matchCatalog && entry.id===matchCatalog.id) ||
        liveData.find(entry=>guide.aliases.some(alias=>normalized(entry.name).includes(normalized(alias))));
      return {
        id:matchCatalog?.id||matchLive?.id||"guide:"+guide.key,
        name:guide.name,entityType:guide.type==="Espetáculo"?"SHOW":"ATTRACTION",
        area:guide.type,icon:guide.icon,url:guide.url,
        lat:matchCatalog?.lat??null,lon:matchCatalog?.lon??null,
        hasCoordinates:!!matchCatalog?.hasCoordinates,live:matchLive||null
      };
    });
  }
  function mappedAttractions(key) {
    return compiled(key).filter(x=>x.hasCoordinates).map(x=>({
      id:x.id,name:x.name,lat:x.lat,lon:x.lon,area:x.area||"Atração"
    }));
  }
  function hasMappedAttractions(key) {
    return mappedAttractions(key).length>0;
  }
  window.ParkPathQueues = {mappedAttractions,hasMappedAttractions};

  function waitInfo(live, now=Date.now()) {
    if(!live)return {wait:null,text:"Fila não informada",status:"UNKNOWN",age:Infinity,stale:false};
    const t=Date.parse(live.lastUpdated||"");
    const age=Number.isFinite(t)?now-t:Infinity;
    const status=String(live.status||"UNKNOWN").toUpperCase();
    if (!Number.isFinite(age) || age > STALE_AFTER || age < -120000)
      return {wait:null,text:"Informação desatualizada",status,age,stale:true};
    if (status!=="OPERATING")
      return {wait:null,text:statusLabel(status),status,age,stale:false};
    const raw=live.queue?.STANDBY?.waitTime;
    const wait=typeof raw==="number" && Number.isFinite(raw) &&
      raw>=0 && raw<=MAX_WAIT ? Math.round(raw):null;
    return {wait,text:wait===null?"Fila não informada":wait+" min",status,age,stale:false};
  }
  function waitTier(minutes) {
    if(minutes===null || !Number.isFinite(minutes))return "wait-unknown";
    if(minutes<=20)return "wait-low";
    if(minutes>=25 && minutes<=50)return "wait-medium";
    if(minutes>=60)return "wait-high";
    return "wait-between"; // 21-24 e 51-59 min: sem extrapolar faixas
  }
  function waitIcon(row) {
    const v=waitInfo(row.live);
    if(v.wait!==null)return {label:v.wait+"m",kind:"active"};
    if(v.status==="DOWN"&&!v.stale)return {label:"Pausa",kind:"closed"};
    if((v.status==="CLOSED"||v.status==="REFURBISHMENT")&&!v.stale)
      return {label:"Fech.",kind:"closed"};
    return {label:"—",kind:"unknown"};
  }
  // Auditoria: não classificar tudo como montanha-russa.
  // Tipos sem confirmação recebem marcador neutro, nunca um emoji enganoso.
  function categoryIcon(row) {
    if(row.icon)return row.icon;
    if(row.entityType==="SHOW")return "🎭";
    const name=normalized(row.name);
    const contains=fragments=>fragments.some(fragment=>name.includes(fragment));
    if(contains(["space mountain","big thunder mountain","seven dwarfs mine train",
      "tron lightcycle","guardians of the galaxy cosmic rewind","expedition everest",
      "slinky dog dash","rock n roller coaster"]))return "🎢";
    if(contains(["kali river rapids","tiana s bayou adventure","splash mountain"]))return "💦";
    if(contains(["kilimanjaro safaris","wildlife express train"]))return "🐘";
    if(contains(["haunted mansion","tower of terror"]))return "🏚️";
    if(contains(["pirates of the caribbean","jungle cruise","frozen ever after","living with the land"]))return "🛶";
    if(contains(["star tours","mission space","soarin","flight of passage",
      "smugglers run","rise of the resistance"]))return "🚀";
    if(contains(["walt disney world railroad","monorail","tomorrowland transit authority"]))return "🚂";
    return "🎟️";
  }
  function makeIcon(row) {
    const display=waitIcon(row);
    const selected=selectedId===row.id ? " selected" : "";
    const glyph=categoryIcon(row);
    return L.divIcon({
      className:"park-ride-marker",
      html:'<div class="park-ride-pin '+display.kind+selected+" "+waitTier(waitInfo(row.live).wait)+'"><span>'+glyph+'</span><b>'+display.label+'</b></div>',
      iconSize:[62,50],iconAnchor:[31,45]
    });
  }
  function renderMarkers() {
    const items=compiled(park).filter(item=>item.hasCoordinates);
    const keep=new Set();
    for(const item of items) {
      keep.add(item.id);
      const info=waitIcon(item);
      const code=info.kind+":"+info.label+":"+waitTier(waitInfo(item.live).wait)+":"+categoryIcon(item)+":"+(selectedId===item.id);
      const old=markers.get(item.id);
      if(old) {
        if(old.code!==code){old.marker.setIcon(makeIcon(item));old.code=code;}
      } else {
        const marker=L.marker([item.lat,item.lon],{
          icon:makeIcon(item),title:item.name,alt:item.name
        }).addTo(markerLayer);
        marker.on("click",()=>selectAttraction({
          id:item.id,name:item.name,lat:item.lat,lon:item.lon,area:item.area||"Atração",official:item.url
        }));
        markers.set(item.id,{marker,code});
      }
    }
    for(const [id,obj] of markers)if(!keep.has(id)){
      markerLayer.removeLayer(obj.marker);
      markers.delete(id);
    }
  }
  function getSelectedRow() {
    if(els.attractionCard.classList.contains("hidden"))return null;
    const item=selectedId&&compiled(park).find(x=>x.id===selectedId);
    if(item)return item;
    // Compatibilidade para seleção por nome quando a API ainda não respondeu.
    const name=normalized(els.attractionName.textContent);
    return compiled(park).find(x=>normalized(x.name)===name)||null;
  }
  function renderAttractionCard() {
    if(els.attractionCard.classList.contains("hidden"))return;
    const item=getSelectedRow();
    if(!item){
      els.attractionQueueInfo.textContent="Fila não disponível na fonte para esta atração.";
      return;
    }
    const w=waitInfo(item.live);
    els.attractionQueueInfo.classList.remove("wait-low","wait-medium","wait-high","wait-between","wait-unknown");
    els.attractionQueueInfo.classList.add(waitTier(w.wait));
    els.attractionQueueInfo.textContent="Fila comum: "+(item.entityType==="SHOW"&&w.wait===null?"Consulte horários":w.text)+
      (Number.isFinite(w.age)?" · atualizado há "+minutesSince(w.age):"")+
      " · ThemeParks.wiki";
  }
  function newText(tag,className,textValue) {
    const element=document.createElement(tag);
    if(className)element.className=className;
    element.textContent=textValue;
    return element;
  }
  function renderRows() {
    const key=park,rows=compiled(key),s=state.get(key),now=Date.now();
    els.queueParkHeading.textContent=PARKS[key].name;
    const needle=normalized(els.queueSearch.value);
    const filtered=rows.filter(item=>normalized(item.name).includes(needle));
    const sort=els.queueSort.value;
    filtered.sort((a,b)=>{
      if(sort==="name")return a.name.localeCompare(b.name);
      const x=waitInfo(a.live,now).wait, y=waitInfo(b.live,now).wait;
      if(x===null&&y===null)return a.name.localeCompare(b.name);
      if(x===null)return 1;
      if(y===null)return -1;
      return (sort==="short"?x-y:y-x)||a.name.localeCompare(b.name);
    });
    const fragment=document.createDocumentFragment();
    for(const item of filtered) {
      const w=waitInfo(item.live,now);
      const row=newText("div","queue-row "+waitTier(w.wait),"");
      const detail=newText("div","queue-details","");
      const title=newText("strong","",item.name);
      const extra=newText("small","",item.area+" · "+statusLabel(w.status)+
        (Number.isFinite(w.age)?" · há "+minutesSince(w.age):"")+
        (item.live?" · "+hourInOrlando(item.live.lastUpdated):" · sem leitura"));
      const right=newText("div","queue-actions","");
      const wait=newText("strong","queue-wait "+waitTier(w.wait)+(w.wait===null?" unavailable":""),item.entityType==="SHOW"&&w.wait===null?"Consulte horários":w.text);
      detail.append(title,extra);
      right.append(wait);
      if(item.hasCoordinates) {
        const view=newText("button","queue-to-map","Ver no mapa");
        view.type="button";
        view.addEventListener("click",()=>{
          closePanel();
          selectAttraction({id:item.id,name:item.name,lat:item.lat,lon:item.lon,area:item.area||"Atração",official:item.url});
        });
        right.append(view);
      } else {
        right.append(newText("small","queue-no-point","Sem coordenadas"));
      }
      row.append(detail,right);
      fragment.append(row);
    }
    if(!filtered.length) {
      fragment.append(newText("p","queue-empty",needle
        ?"Nenhuma atração corresponde à busca."
        :!s.catalog&&!s.live
          ?"Carregando atrações…"
          :"Nenhuma atração informada pela fonte para este parque."));
    }
    els.queueList.replaceChildren(fragment);
    const available=rows.filter(item=>waitInfo(item.live,now).wait!==null).length;
    const geolocated=rows.filter(item=>item.hasCoordinates).length;
    const outdated=rows.filter(item=>waitInfo(item.live,now).stale).length;
    els.queueOpenHint.textContent="· "+rows.length+" atrações";
    const parts=[rows.length+" experiências de Harry Potter",geolocated+" no mapa",available+" filas disponíveis"];
    if(outdated)parts.push(outdated+" informações antigas ocultadas");
    if(s.liveAt)parts.push("consultado há "+minutesSince(now-s.liveAt));
    if(s.catalogError)parts.push("cadastro: falha de atualização");
    if(s.liveError)parts.push("filas: fonte indisponível");
    els.queueStatus.textContent="ThemeParks.wiki · "+parts.join(" · ");
    renderAttractionCard();
  }
  function render() {
    if(!PARKS[park])return;
    renderMarkers();
    renderRows();
  }

  async function readJSON(url,signal,etag) {
    const headers={Accept:"application/json"};
    if(etag)headers["If-None-Match"]=etag;
    const response=await fetch(url,{signal,headers});
    if(response.status===429) {
      const retry=Number(response.headers.get("Retry-After"));
      globalThrottleUntil=Date.now()+
        (Number.isFinite(retry)&&retry>0?retry*1000:LIVE_TTL);
      throw new Error("429");
    }
    if(response.status===304)return {notModified:true,etag};
    if(!response.ok)throw new Error("HTTP "+response.status);
    const json=await response.json();
    return {json,etag:response.headers.get("ETag")||null};
  }
  async function loadCatalog(key,{force=false}={}) {
    const s=state.get(key),now=Date.now();
    if(s.inflightCatalog)return s.inflightCatalog;
    if(s.catalog&&now-s.catalogAt<CATALOG_TTL&&!force)return;
    if(now-s.catalogAttempt<RETRY_DELAY||now<globalThrottleUntil)return;
    s.catalogAttempt=now;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    const promise=(async()=>{
      try{
        const {json}=await readJSON(ROOT+PARKS[key].id+"/children",controller.signal);
        if(!Array.isArray(json?.children))throw new Error("Formato de catálogo inválido");
        const catalog=[];
        const ids=new Set();
        for(const entity of json.children){
          if(!["ATTRACTION","SHOW"].includes(entity?.entityType)||typeof entity.id!=="string"||
             typeof entity.name!=="string"||!entity.name.trim()||ids.has(entity.id))continue;
          ids.add(entity.id);
          const coords=coordinates(entity,key);
          catalog.push({
            id:entity.id,name:entity.name.trim(),lat:coords?.lat??null,
            lon:coords?.lon??null,hasCoordinates:!!coords,area:entity.entityType==="SHOW"?"Espetáculo":"Atração",entityType:entity.entityType
          });
        }
        // Um catálogo vazio é um estado real; não inventar marcadores.
        s.catalog=catalog;
        s.catalogAt=Date.now();
        s.catalogError="";
        window.dispatchEvent(new CustomEvent("parkpath:catalog-updated",{detail:{key,count:catalog.length}}));
      }catch(err){
        if(err.name!=="AbortError"){
          console.warn("ParkPath: erro ao buscar atrações",key,err);
          s.catalogError="Não foi possível carregar o cadastro de atrações.";
        }
      }finally{
        clearTimeout(timer);
        if(park===key)render();
        if(s.inflightCatalog===promise)s.inflightCatalog=null;
      }
    })();
    s.inflightCatalog=promise;
    return promise;
  }
  async function loadLive(key,{force=false}={}) {
    const s=state.get(key),now=Date.now();
    if(s.inflightLive)return s.inflightLive;
    if(s.live&&now-s.liveAt<LIVE_TTL&&!force)return;
    if(now-s.liveAttempt<LIVE_TTL||now<globalThrottleUntil)return;
    s.liveAttempt=now;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    els.queueRefreshBtn.disabled=true;
    const promise=(async()=>{
      try {
        const response=await readJSON(ROOT+PARKS[key].id+"/live",controller.signal,s.etag);
        if(response.notModified){
          if(!s.live)throw new Error("304 sem cache");
          s.liveAt=Date.now();
        } else {
          if(!Array.isArray(response.json?.liveData))throw new Error("Formato de filas inválido");
          s.live=response.json.liveData.filter(item=>["ATTRACTION","SHOW"].includes(item?.entityType) &&
            typeof item.id==="string" && typeof item.name==="string");
          s.liveAt=Date.now();
          s.etag=response.etag;
        }
        s.liveError="";
      }catch(err){
        if(err.name!=="AbortError"){
          console.warn("ParkPath: erro ao buscar filas",key,err);
          s.liveError=err.message==="429"
            ?"A fonte limitou as requisições. Aguarde para consultar novamente."
            :"Não foi possível consultar as filas.";
        }
      }finally {
        clearTimeout(timer);
        if(park===key){
          els.queueRefreshBtn.disabled=false;
          render();
        }
        if(s.inflightLive===promise)s.inflightLive=null;
      }
    })();
    s.inflightLive=promise;
    return promise;
  }
  function closePanel(){
    els.queuePanel.classList.add("hidden");
    els.queuePanel.setAttribute("aria-hidden","true");
  }
  function changePark(key) {
    if(!PARKS[key])return;
    park=key;
    renderTicket++;
    selectedId=null;
    markerLayer.clearLayers();
    markers.clear();
    els.queueOpenBtn.hidden=false;
    els.queueSearch.value="";
    els.queueParkHeading.textContent=PARKS[key].name;
    render();
    if(!document.hidden){
      loadCatalog(key);
      loadLive(key);
    }
  }
  function openPanel(){
    els.queuePanel.classList.remove("hidden");
    els.queuePanel.setAttribute("aria-hidden","false");
    render();
    if(!document.hidden){loadCatalog(park);loadLive(park);}
    els.queueCloseBtn.focus();
  }
  els.queueOpenBtn.addEventListener("click",openPanel);
  els.queueCloseBtn.addEventListener("click",closePanel);
  els.queueSearch.addEventListener("input",renderRows);
  els.queueSort.addEventListener("change",renderRows);
  els.queueRefreshBtn.addEventListener("click",()=>{
    if(document.hidden)return;
    loadCatalog(park);
    loadLive(park);
  });
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&!els.queuePanel.classList.contains("hidden")){
      closePanel();
      els.queueOpenBtn.focus();
    }
  });
  window.addEventListener("parkpath:park",event=>changePark(event.detail?.key));
  window.addEventListener("parkpath:attraction",event=>{
    selectedId=event.detail?.id??null;
    renderAttractionCard();
    renderMarkers();
  });
  window.addEventListener("parkpath:attraction-closed",()=>{
    selectedId=null;
    renderMarkers();
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden){loadCatalog(park);loadLive(park);render();}
  });
  setInterval(()=>{
    if(document.hidden)return;
    render();
    loadLive(park);
    loadCatalog(park);
  },60000);

  // Mapas Disney e Universal podem exibir um catálogo antes da fila chegar.
  changePark(park);
})();