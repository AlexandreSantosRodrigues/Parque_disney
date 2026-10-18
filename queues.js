/* ParkPath: filas dos 4 parques Disney via ThemeParks.wiki REST v1. */
(() => {
  "use strict";
  const PARKS={
    magic:{name:"Magic Kingdom",id:"75ea578a-adc8-4116-a54d-dccb60765ef9"},
    epcot:{name:"EPCOT",id:"47f90d2c-e191-4239-a466-5892ef59a88b"},
    hollywood:{name:"Hollywood Studios",id:"288747d1-8b4f-4a64-867e-ea7c9b27bad8"},
    animal:{name:"Animal Kingdom",id:"1c84a229-8862-4648-9c71-378ddd2c7693"}
  };
  const POLL=300000,STALE=720000;
  const nodes=Object.fromEntries(["queueOpenBtn","queueOpenHint","queuePanel","queueCloseBtn","queueParkHeading","queueStatus","queueSearch","queueSort","queueList","queueRefreshBtn","attractionQueueInfo","attractionName","attractionCard"].map(id=>[id,document.getElementById(id)]));
  if(Object.values(nodes).some(x=>!x)){console.warn("ParkPath: painel de filas incompleto.");return;}
  let current=document.getElementById("parkSelect").value;
  let records=null,controller=null,sequence=0,limitUntil=0;
  const cache=new Map(),attempts=new Map();
  const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const time=t=>{const date=Date.parse(t||"");return Number.isFinite(date)?new Intl.DateTimeFormat("pt-BR",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit"}).format(date)+" (Orlando)":"horário desconhecido";};
  const age=(item,now=Date.now())=>now-Date.parse(item?.lastUpdated||"");
  const howOld=a=>Number.isFinite(a)?a<60000?"menos de 1 min":Math.floor(a/60000)+" min":"sem horário";
  const status=s=>({OPERATING:"Funcionando",DOWN:"Parada temporária",CLOSED:"Fechada",REFURBISHMENT:"Manutenção"})[s]||"Situação não informada";
  function info(item,now=Date.now()){
    const howLong=age(item,now),state=String(item?.status||"").toUpperCase();
    if(!Number.isFinite(howLong)||howLong>STALE||howLong< -120000)return {minutes:null,text:"Dados antigos ou sem horário",age:howLong,stale:true};
    if(state!=="OPERATING")return {minutes:null,text:status(state),age:howLong,stale:false};
    const raw=item?.queue?.STANDBY?.waitTime;
    const minutes=typeof raw==="number"&&Number.isFinite(raw)&&raw>=0&&raw<=360?Math.round(raw):null;
    return {minutes,text:minutes===null?"Tempo não informado":minutes+" min",age:howLong,stale:false};
  }
  function find(name){return records?.park===current?records.rows.find(item=>norm(item.name)===norm(name)):null;}
  function attraction(){
    if(current!=="magic"||nodes.attractionCard.classList.contains("hidden"))return;
    const item=find(nodes.attractionName.textContent),v=item?info(item):null;
    nodes.attractionQueueInfo.textContent=v?
      "Fila comum: "+v.text+" · atualização: "+howOld(v.age)+" · ThemeParks.wiki":
      "Fila indisponível para esta atração · confira o aplicativo oficial";
  }
  function render(){
    if(!PARKS[current])return;
    nodes.queueParkHeading.textContent=PARKS[current].name;
    nodes.queueList.replaceChildren();
    if(!records||records.park!==current){
      const p=document.createElement("p");p.className="queue-empty";p.textContent="Filas indisponíveis no momento.";nodes.queueList.append(p);
      attraction();return;
    }
    const now=Date.now(),filter=norm(nodes.queueSearch.value),sort=nodes.queueSort.value;
    const rows=records.rows.filter(row=>norm(row.name).includes(filter));
    rows.sort((a,b)=>{
      if(sort==="name")return a.name.localeCompare(b.name);
      const x=info(a,now).minutes,y=info(b,now).minutes;
      if(x===null&&y===null)return a.name.localeCompare(b.name);
      if(x===null)return 1;if(y===null)return -1;
      return (sort==="short"?x-y:y-x)||a.name.localeCompare(b.name);
    });
    const fragment=document.createDocumentFragment();
    for(const item of rows){
      const v=info(item,now);
      const row=document.createElement("div");row.className="queue-row";
      const details=document.createElement("div");details.className="queue-details";
      const title=document.createElement("strong");title.textContent=item.name;
      const meta=document.createElement("small");meta.textContent=status(String(item.status||"").toUpperCase())+" · "+howOld(v.age)+" · "+time(item.lastUpdated);
      const wait=document.createElement("strong");wait.className="queue-wait"+(v.minutes===null?" unavailable":"");wait.textContent=v.text;
      details.append(title,meta);row.append(details,wait);fragment.append(row);
    }
    if(!rows.length){const p=document.createElement("p");p.className="queue-empty";p.textContent=filter?"Nenhuma atração encontrada.":"Nenhuma atração informada nesta consulta.";fragment.append(p);}
    nodes.queueList.append(fragment);
    const available=records.rows.filter(row=>info(row,now).minutes!==null).length;
    const staleCount=records.rows.filter(row=>info(row,now).stale).length;
    nodes.queueOpenHint.textContent="· "+available+" com tempo";
    nodes.queueStatus.textContent="Fonte: ThemeParks.wiki · "+available+" tempos disponíveis"+(staleCount?" · "+staleCount+" registros antigos ocultados":"")+" · consultado há "+howOld(now-records.received);
    attraction();
  }
  function unavailable(msg){records=null;nodes.queueOpenHint.textContent="· indisponível";nodes.queueStatus.textContent=msg;render();}
  async function load(){
    if(!PARKS[current]||document.hidden)return;
    const now=Date.now(),park=current,saved=cache.get(park);
    if(saved&&now-saved.received<POLL){records=saved;render();return;}
    if(now<(attempts.get(park)||0)+POLL||now<limitUntil){
      unavailable("Nova consulta temporariamente limitada. Aguarde até 5 minutos.");return;
    }
    attempts.set(park,now);
    const token=++sequence;
    if(controller)controller.abort();
    controller=new AbortController();const active=controller;
    nodes.queueRefreshBtn.disabled=true;nodes.queueStatus.textContent="Buscando tempos atualizados…";
    const timeout=setTimeout(()=>active.abort(),15000);
    try{
      const res=await fetch("https://api.themeparks.wiki/v1/entity/"+PARKS[park].id+"/live?entityType=ATTRACTION",{signal:active.signal,headers:{Accept:"application/json"}});
      if(res.status===429){const retry=Number(res.headers.get("Retry-After"));limitUntil=Date.now()+(Number.isFinite(retry)&&retry>0?retry*1000:POLL);throw Error("429");}
      if(!res.ok)throw Error("HTTP "+res.status);
      const data=await res.json();
      if(!Array.isArray(data?.liveData))throw Error("Formato inesperado");
      if(token!==sequence||park!==current)return;
      records={park,received:Date.now(),rows:data.liveData.filter(x=>x&&x.entityType==="ATTRACTION"&&typeof x.name==="string")};
      cache.set(park,records);render();
    }catch(err){
      if(token!==sequence||park!==current)return;
      console.warn("ParkPath filas Disney:",err);
      unavailable(err.message==="429"?"Fonte com limite de requisições (429). Tente mais tarde.":"Fonte de filas indisponível ou bloqueada pelo navegador. Não exibiremos números antigos.");
    }finally{clearTimeout(timeout);if(token===sequence){controller=null;nodes.queueRefreshBtn.disabled=false;}}
  }
  function close(){nodes.queuePanel.classList.add("hidden");nodes.queuePanel.setAttribute("aria-hidden","true");}
  function changePark(key){
    ++sequence;if(controller){controller.abort();controller=null;}current=key;
    if(!PARKS[key]){records=null;nodes.queueOpenBtn.hidden=true;close();return;}
    nodes.queueOpenBtn.hidden=false;nodes.queueSearch.value="";
    records=cache.get(key)||null;render();load();
  }
  nodes.queueOpenBtn.addEventListener("click",()=>{nodes.queuePanel.classList.remove("hidden");nodes.queuePanel.setAttribute("aria-hidden","false");render();load();nodes.queueCloseBtn.focus();});
  nodes.queueCloseBtn.addEventListener("click",close);
  nodes.queueSearch.addEventListener("input",render);
  nodes.queueSort.addEventListener("change",render);
  nodes.queueRefreshBtn.addEventListener("click",load);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!nodes.queuePanel.classList.contains("hidden")){close();nodes.queueOpenBtn.focus();}});
  window.addEventListener("parkpath:park",e=>changePark(e.detail?.key));
  window.addEventListener("parkpath:attraction",attraction);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)load();});
  setInterval(()=>{if(!document.hidden&&PARKS[current]){render();if(Date.now()-(attempts.get(current)||0)>=POLL)load();}},60000);
  changePark(current);
})();