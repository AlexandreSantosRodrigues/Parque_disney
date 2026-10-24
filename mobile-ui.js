/* Small-screen navigation shared by Disney and Hogwarts.
   Keeps the same canonical URLs and the existing 144px map controls.
*/
(function(){
  "use strict";
  const parkToggle=document.getElementById("mobileParkToggle");
  const searchToggle=document.getElementById("mobileSearchToggle");
  const queueToggle=document.getElementById("mobileQueueToggle");
  const toolsToggle=document.getElementById("mobileToolsToggle");
  const scrim=document.getElementById("mobileScrim");
  const activeLabel=document.getElementById("mobileActivePark");
  const select=document.getElementById("parkSelect");
  const nav=document.querySelector(".park-selector");
  const searchInput=document.getElementById("attractionSearch");
  const queueButton=document.getElementById("queueOpenBtn");
  const controls=document.querySelector(".controls");
  if(!parkToggle||!searchToggle||!queueToggle||!toolsToggle||!scrim||!select||!nav||!controls)return;
  const modes=["park","search","tools"];
  function mobile(){return window.matchMedia("(max-width: 760px)").matches;}
  function updateLabel(){
    const option=select.selectedOptions?.[0];
    const key=select.value;
    // Compact names; long park names remain available in full menu.
    const button=nav.querySelector('[data-park="'+key+'"]');
    activeLabel.textContent=(button?.textContent||option?.textContent||"Escolher parque").trim();
  }
  function updateToggle(){
    parkToggle.setAttribute("aria-expanded",String(document.body.classList.contains("mobile-park-open")));
    searchToggle.setAttribute("aria-expanded",String(document.body.classList.contains("mobile-search-open")));
    toolsToggle.setAttribute("aria-expanded",String(document.body.classList.contains("mobile-tools-open")));
  }
  function closeAll(){
    for(const mode of modes)document.body.classList.remove("mobile-"+mode+"-open");
    updateToggle();
  }
  function toggle(mode){
    if(!mobile())return;
    const wasOpen=document.body.classList.contains("mobile-"+mode+"-open");
    closeAll();
    if(!wasOpen)document.body.classList.add("mobile-"+mode+"-open");
    updateToggle();
    if(mode==="search"&&!wasOpen)searchInput?.focus({preventScroll:true});
  }
  parkToggle.addEventListener("click",()=>toggle("park"));
  searchToggle.addEventListener("click",()=>toggle("search"));
  toolsToggle.addEventListener("click",()=>toggle("tools"));
  scrim.addEventListener("click",closeAll);
  queueToggle.addEventListener("click",()=>{
    closeAll();
    queueButton?.click();
  });
  nav.querySelectorAll("[data-park]").forEach(button=>button.addEventListener("click",()=>{
    updateLabel();
    closeAll();
  }));
  select.addEventListener("change",()=>{
    updateLabel();
    closeAll();
  });
  // parkpath:park is emitted by each site's own app.js.
  window.addEventListener("parkpath:park",()=>{updateLabel();closeAll();});
  window.addEventListener("parkpath:attraction",closeAll);
  // Also close search when selecting a result, even if the card is not yet open.
  document.getElementById("searchResults")?.addEventListener("click",event=>{
    if(event.target.closest?.("button"))closeAll();
  });
  controls.querySelectorAll(".map-btn").forEach(button=>button.addEventListener("click",closeAll));
  window.addEventListener("resize",()=>{if(!mobile())closeAll();});
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape")closeAll();
  });
  // Closing the search via Enter also returns to a clear map.
  searchInput?.addEventListener("keydown",e=>{
    if(e.key==="Escape"){closeAll();searchInput.blur();}
  });
  const closeAttraction=document.getElementById("closeAttraction");
  closeAttraction?.addEventListener("click",closeAll);
  updateLabel();
  closeAll();
})();
