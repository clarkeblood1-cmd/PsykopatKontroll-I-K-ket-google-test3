const STORAGE_KEY = "matlist_max_realtime_v1";

const defaultState = {
  currentPage: "home",
  currentManageRoom: "Alla rum",
  rooms: ["Köket","Badrummet","Hallen"],
  placesByRoom: {
    "Köket": ["Kyl","Frys","Kryddor","Skafferi 1"],
    "Badrummet": ["Skåp","Under handfat"],
    "Hallen": ["Hylla","Städskåp"]
  },
  drawersByRoomPlace: {
    "Köket||Kyl": ["Låda 1","Låda 2","Hyllplan 1","Hyllplan 2"],
    "Köket||Frys": ["Låda 1","Låda 2","Låda 3"],
    "Köket||Kryddor": ["Hyllplan 1"],
    "Köket||Skafferi 1": ["Hyllplan 1","Hyllplan 2"],
    "Badrummet||Skåp": ["Hyllplan 1"],
    "Badrummet||Under handfat": ["Låda 1"],
    "Hallen||Hylla": ["Hyllplan 1"],
    "Hallen||Städskåp": ["Hyllplan 1","Hyllplan 2"]
  },
  categoriesByRoom: {
    "Köket": ["Mat","Godis","Disk","Kryddor"],
    "Badrummet": ["Tvätt","Toalett","Städ"],
    "Hallen": ["Städ"]
  },
  categories: ["Mat","Godis","Disk","Tvätt","Toalett","Städ","Kryddor"],
  homeItems: [],
  buyItems: [],
  templates: [],
  recipeCategories: ["Middag"],
  recipes: [],
  draftRecipe: {ingredients: []},
  filters: {
    home: {search:"",room:"Alla rum",place:"Alla platser",drawer:"Alla lådor/hyllplan"},
    buy: {search:"",room:"Alla rum",place:"Alla platser",drawer:"Alla lådor/hyllplan"},
    add: {search:"",room:"Alla rum",place:"Alla platser"},
    recipes: {search:"",category:"Alla Recept Kategori"}
  },
  manageUi: {
    section: "home",
    roomSearch: "",
    categorySearch: "",
    placeSearch: "",
    drawerSearch: "",
    currentPlace: ""
  },
  imageFitMode: "contain",
  meta: {
    updatedAt: 0,
    version: "max-realtime-version",
    cloudEnabled: false,
    clientId: "",
    pendingSync: false,
    syncError: "",
    lastCloudAckAt: 0,
    lastLocalChangeAt: 0
  }
};

const units = ["Styck","Kg","Gram","Milliliter","Liter","Kryddmått","Tesked","Matsked","Decilitermått"];
const itemModes = [{value:"normal",label:"Vanlig vara"},{value:"package",label:"Paket + fast mått"}];

let state = loadState();
ensureClientMeta();
migrateCategoriesByRoom();
let currentEdit = null;
const LOCAL_SYNC_CHANNEL = "matlist-realtime-sync";
let localSyncChannel = null;
let suppressRealtimeBroadcast = false;

function getClientId(){
  return String(state?.meta?.clientId || "");
}

function ensureRealtimeChannel(){
  if(localSyncChannel || typeof BroadcastChannel === "undefined") return localSyncChannel;
  try{
    localSyncChannel = new BroadcastChannel(LOCAL_SYNC_CHANNEL);
    localSyncChannel.addEventListener("message", (event) => {
      const data = event?.data || {};
      if(!data || data.type !== "state-update") return;
      if(data.clientId && data.clientId === getClientId()) return;
      applyIncomingLocalState(data.state, { source: "broadcast" });
    });
  }catch(e){
    localSyncChannel = null;
  }
  return localSyncChannel;
}

function emitRealtimeState(reason = "state-update"){
  if(suppressRealtimeBroadcast) return;
  const payload = getSerializableState();
  const message = {
    type: "state-update",
    reason,
    clientId: getClientId(),
    sentAt: Date.now(),
    state: payload
  };
  const channel = ensureRealtimeChannel();
  if(channel){
    try{ channel.postMessage(message); }catch(e){}
  }
}

function applyIncomingLocalState(nextState, options = {}){
  if(!nextState) return false;
  const incoming = mergeDeep(structuredClone(defaultState), nextState || {});
  const incomingUpdated = Number(incoming?.meta?.updatedAt || 0);
  const localUpdated = Number(state?.meta?.updatedAt || 0);
  const incomingClientId = String(incoming?.meta?.clientId || "");
  if(incomingClientId && incomingClientId === getClientId()) return false;
  if(incomingUpdated && incomingUpdated <= localUpdated) return false;
  suppressRealtimeBroadcast = true;
  try{
    replaceAppState(incoming, { skipSave: true });
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
  } finally {
    suppressRealtimeBroadcast = false;
  }
  if(window.matlistCloud && typeof window.matlistCloud.flushSyncQueue === "function" && state?.meta?.cloudEnabled && navigator.onLine){
    window.matlistCloud.flushSyncQueue();
  }
  return true;
}

window.addEventListener("storage", (event) => {
  if(event.key !== STORAGE_KEY || !event.newValue) return;
  try{
    const incoming = JSON.parse(event.newValue);
    applyIncomingLocalState(incoming, { source: "storage" });
  }catch(e){}
});

function normalizeRestItems(){
  const normalizeName = (name) => String(name || "")
    .replace(/\s*\((rest|restpaket)\)\s*/gi, "")
    .replace(/\s+RESTPAKET\s*🔥?/gi, "")
    .trim();

  [...state.homeItems, ...state.buyItems].forEach(item => {
    const looksLikeRest = !!item.isRest || /restpaket|\(rest\)|\(restpaket\)/i.test(String(item.name || ""));
    if(looksLikeRest){
      item.isRest = true;
      item.name = normalizeName(item.name);
      item.mode = "package";
      item.qty = 1;
      item.packageCount = 1;
      item.fixedAmount = Number(item.fixedAmount || 0) || 0;
    }
  });
}


function ensureClientMeta(){
  state.meta ||= {};
  if(!state.meta.clientId){
    state.meta.clientId = `client_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){}
  }
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return mergeDeep(structuredClone(defaultState), parsed);
  }catch(e){
    return structuredClone(defaultState);
  }
}
function saveState(){
  state.meta ||= {};
  state.meta.updatedAt = Date.now();
  state.meta.lastLocalChangeAt = state.meta.updatedAt;
  state.meta.pendingSync = !!state.meta.cloudEnabled;
  state.meta.syncError = "";
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emitRealtimeState("save");
  if(window.matlistCloud && typeof window.matlistCloud.scheduleSync === "function"){
    window.matlistCloud.scheduleSync();
  }
}
function persistStateMeta(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emitRealtimeState("meta");
  }catch(e){}
}
function replaceAppState(nextState, options={}){
  const merged = mergeDeep(structuredClone(defaultState), nextState || {});
  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, merged);
  migrateCategoriesByRoom();
  if(!options.skipSave){
    saveState();
  }
  if(typeof render === "function"){
    render();
  }
}
function getSerializableState(){
  return JSON.parse(JSON.stringify(state));
}
function mergeDeep(target, source){
  for(const key in source){
    if(source[key] && typeof source[key] === "object" && !Array.isArray(source[key])){
      if(!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
      mergeDeep(target[key], source[key]);
    }else{
      target[key] = source[key];
    }
  }
  return target;
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}
function escapeAttr(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function uid(){
  return Date.now().toString(36)+Math.random().toString(36).slice(2,8);
}
function getPlaces(room){
  if(!room || room === "Alla rum") return [];
  return [...(state.placesByRoom[room] || [])];
}
function getDrawers(room, place){
  if(!room || !place || room==="Alla rum" || place==="Alla platser") return [];
  return [...(state.drawersByRoomPlace[room+"||"+place] || [])];
}

function getAllCategories(){
  var set = new Set();
  var map = state.categoriesByRoom || {};
  Object.keys(map).forEach(function(room){
    (map[room] || []).forEach(function(cat){
      if(cat) set.add(cat);
    });
  });
  return Array.from(set);
}
function ensureCategoriesForRoom(room){
  if(!room) return;
  if(!state.categoriesByRoom) state.categoriesByRoom = {};
  if(!Array.isArray(state.categoriesByRoom[room])) state.categoriesByRoom[room] = [];
}
function getCategories(room, includeAllFallback){
  if(room && room !== "Alla rum"){
    ensureCategoriesForRoom(room);
    return [].concat(state.categoriesByRoom[room]);
  }
  return includeAllFallback ? getAllCategories() : [];
}
function syncLegacyCategoriesArray(){
  state.categories = getAllCategories();
}
function migrateCategoriesByRoom(){
  if(!state.categoriesByRoom) state.categoriesByRoom = {};
  var legacy = Array.isArray(state.categories) ? state.categories.slice() : [];
  (state.rooms || []).forEach(function(room){
    ensureCategoriesForRoom(room);
    legacy.forEach(function(cat){
      if(cat && state.categoriesByRoom[room].indexOf(cat) === -1){
        state.categoriesByRoom[room].push(cat);
      }
    });
  });
  [].concat(state.homeItems || [], state.buyItems || []).forEach(function(item){
    if(item && item.room && item.category){
      ensureCategoriesForRoom(item.room);
      if(state.categoriesByRoom[item.room].indexOf(item.category) === -1){
        state.categoriesByRoom[item.room].push(item.category);
      }
    }
  });
  (state.templates || []).forEach(function(t){
    if(t && t.defaultRoom && t.category){
      ensureCategoriesForRoom(t.defaultRoom);
      if(state.categoriesByRoom[t.defaultRoom].indexOf(t.category) === -1){
        state.categoriesByRoom[t.defaultRoom].push(t.category);
      }
    }
  });
  syncLegacyCategoriesArray();
}
function uniqueRoomsFromItems(items){
  return [...new Set(items.map(i=>i.room).filter(Boolean))];
}
function countTotalQty(items){
  return items.reduce((sum,i)=>sum+(Number(i.qty)||0),0);
}
function statCards(){
  const cards = [
    {k:"Varor hemma",v:state.homeItems.length},
    {k:"Antal hemma",v:countTotalQty(state.homeItems)},
    {k:"På köpa lista",v:state.buyItems.length},
    {k:"Mallar",v:state.templates.length}
  ];
  document.getElementById("stats").innerHTML = cards.map(c=>`
    <div class="stat">
      <div class="k">${c.k}</div>
      <div class="v">${c.v}</div>
    </div>
  `).join("");
}
function toggleNewModeFields(){
  const mode = document.getElementById("new-mode")?.value || "normal";
  const normalWrap = document.getElementById("new-normal-wrap");
  const packageWrap = document.getElementById("new-package-wrap");
  if(normalWrap) normalWrap.style.display = mode === "normal" ? "" : "none";
  if(packageWrap) packageWrap.style.display = mode === "package" ? "" : "none";
}
function toggleEditModeFields(){
  const mode = document.getElementById("edit-mode")?.value || "normal";
  const normalWrap = document.getElementById("edit-normal-wrap");
  const packageWrap = document.getElementById("edit-package-wrap");
  if(normalWrap) normalWrap.style.display = mode === "normal" ? "" : "none";
  if(packageWrap) packageWrap.style.display = mode === "package" ? "" : "none";
}
function setActiveNav(page){
  document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
  const btn = document.getElementById("nav-"+page);
  if(btn) btn.classList.add("active");
}
function showPage(page){
  state.currentPage = page;
  saveState();
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-"+page).classList.add("active");
  setActiveNav(page);
  render();
}
function applyImageFitMode(){
  const mode = state.imageFitMode === "cover" ? "cover" : "contain";
  document.body.classList.remove("imageFitContain","imageFitCover");
  document.body.classList.add(mode === "cover" ? "imageFitCover" : "imageFitContain");
  const containBtn = document.getElementById("fit-mode-contain");
  const coverBtn = document.getElementById("fit-mode-cover");
  if(containBtn) containBtn.classList.toggle("primary", mode === "contain");
  if(containBtn) containBtn.classList.toggle("secondary", mode !== "contain");
  if(coverBtn) coverBtn.classList.toggle("primary", mode === "cover");
  if(coverBtn) coverBtn.classList.toggle("secondary", mode !== "cover");
}
function setImageFitMode(mode){
  state.imageFitMode = mode === "cover" ? "cover" : "contain";
  saveState();
  applyImageFitMode();
}

function render(){
  applyImageFitMode();
  statCards();

  if(state.currentPage === "home") renderHome();
  if(state.currentPage === "buy") renderBuy();
  if(state.currentPage === "add") renderAdd();
  if(state.currentPage === "manage") renderManage();
  if(state.currentPage === "recipes") renderRecipes();
}
function renderFilterChips(type, field, options, activeValue){
  return options.map(option => `
    <button class="filterChip ${activeValue===option ? 'active' : ''}" onclick="updateFilter('${type}','${field}','${escapeAttr(option)}')">${escapeHtml(option)}</button>
  `).join("");
}
function renderFilterRail(type, field, options, activeValue){
  const railId = `filter-${type}-${field}`;
  return `
    <div class="filterRail">
      <button class="filterNav left" onmousedown="startFilterHold('${railId}',-18)" onmouseup="stopFilterHold()" onmouseleave="stopFilterHold()" ontouchstart="startFilterHold('${railId}',-18)" ontouchend="stopFilterHold()" onclick="scrollFilterRow('${railId}',-220)" aria-label="Scrolla vänster">◀</button>
      <div class="filterScrollerWrap">
        <div class="filterScroller" id="${railId}">${renderFilterChips(type, field, options, activeValue)}</div>
      </div>
      <button class="filterNav right" onmousedown="startFilterHold('${railId}',18)" onmouseup="stopFilterHold()" onmouseleave="stopFilterHold()" ontouchstart="startFilterHold('${railId}',18)" ontouchend="stopFilterHold()" onclick="scrollFilterRow('${railId}',220)" aria-label="Scrolla höger">▶</button>
    </div>
  `;
}
function renderPageToolbar(type, title){
  const f = state.filters[type];
  const placeOptions = f.room && f.room !== "Alla rum" ? getPlaces(f.room) : [];
  const drawerOptions = f.room && f.place && f.room !== "Alla rum" && f.place !== "Alla platser" ? getDrawers(f.room, f.place) : [];
  const roomOptions = ["Alla rum", ...state.rooms];
  const placeValues = ["Alla platser", ...placeOptions];
  const drawerValues = ["Alla lådor/hyllplan", ...drawerOptions];

  return `
    <div class="section">
      <h2 class="sectionTitle">${title}</h2>
      <div class="toolbar">
        <div class="filterStack">
          <input placeholder="Sök i ${title}" value="${escapeHtml(f.search)}" oninput="updateFilter('${type}','search',this.value)">
          ${renderFilterRail(type, 'room', roomOptions, f.room)}
          ${renderFilterRail(type, 'place', placeValues, f.place)}
          ${renderFilterRail(type, 'drawer', drawerValues, f.drawer)}
        </div>
      </div>
    </div>
  `;
}

let filterHoldTimer = null;
function scrollFilterRow(id, amount){
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollBy({left: amount, behavior: 'smooth'});
}
function startFilterHold(id, step){
  stopFilterHold();
  const el = document.getElementById(id);
  if(!el) return;
  filterHoldTimer = setInterval(() => {
    el.scrollLeft += step;
  }, 16);
}
function stopFilterHold(){
  if(filterHoldTimer){
    clearInterval(filterHoldTimer);
    filterHoldTimer = null;
  }
}

function filterItems(items, type){
  const f = state.filters[type];
  return items.filter(item=>{
    const q = f.search.trim().toLowerCase();
    const matchSearch = !q || [item.name,item.category,item.room,item.place,item.drawer,item.note].join(" ").toLowerCase().includes(q);
    const matchRoom = f.room==="Alla rum" || item.room===f.room;
    const matchPlace = f.place==="Alla platser" || item.place===f.place;
    const matchDrawer = f.drawer==="Alla lådor/hyllplan" || item.drawer===f.drawer;
    return matchSearch && matchRoom && matchPlace && matchDrawer;
  });
}

function getTemplateById(templateId){
  return state.templates.find(t => t.id === templateId);
}
function getHomeTotalByTemplateId(templateId){
  return state.homeItems
    .filter(item => item.templateId === templateId)
    .reduce((sum, item) => sum + getItemTotalAmount(item), 0);
}
function formatAmount(value){
  const n = Number(value)||0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/,"").replace(/(\.\d)0$/,"$1");
}
function getItemTotalAmount(item){
  const packageCount = Number(item.packageCount || item.qty || 0) || 0;
  const fixedAmount = Number(item.fixedAmount || 1) || 1;
  return packageCount * fixedAmount;
}
function createRestPackageItem(baseItem, restAmount){
  return {
    ...baseItem,
    id: uid(),
    name: (baseItem.name || ""),
    qty: 1,
    mode: "package",
    packageCount: 1,
    fixedAmount: Number(restAmount || 0) || 0,
    isRest: true
  };
}
function renderPackageText(item){
  const mode = item.mode || "normal";
  const packageCount = Number(item.packageCount || item.qty || 0) || 0;
  const fixedAmount = Number(item.fixedAmount || 1) || 1;
  const qty = Number(item.qty || 0) || 0;
  const unit = item.unit ? " " + escapeHtml(item.unit) : "";
  if(item.isRest){
    const template = item.templateId ? getTemplateById(item.templateId) : null;
    const originalPackageAmount = Number(template?.fixedAmount || item.originalPackageAmount || 0) || 0;
    const restAmount = getItemTotalAmount(item);
    const originalText = originalPackageAmount > 0 ? ` av ${formatAmount(originalPackageAmount)}${unit}` : "";
    return `Öppnat paket: ${formatAmount(restAmount)}${unit} kvar${originalText}`;
  }
  if(mode === "package"){
    return `${formatAmount(packageCount)} paket × ${formatAmount(fixedAmount)}${unit} = ${formatAmount(getItemTotalAmount(item))}${unit}`;
  }
  return `Antal: ${formatAmount(qty)}${unit}`;
}
function unitFamily(unit){
  const count = ["Styck"];
  const mass = ["Kg","Gram"];
  const volume = ["Liter","Milliliter","Kryddmått","Tesked","Matsked","Decilitermått"];
  if(count.includes(unit)) return "count";
  if(mass.includes(unit)) return "mass";
  if(volume.includes(unit)) return "volume";
  return "other";
}
function unitToBase(amount, unit){
  const n = Number(amount)||0;
  switch(unit){
    case "Kg": return n * 1000;
    case "Gram": return n;
    case "Liter": return n * 1000;
    case "Milliliter": return n;
    case "Kryddmått": return n * 1;
    case "Tesked": return n * 5;
    case "Matsked": return n * 15;
    case "Decilitermått": return n * 100;
    default: return n;
  }
}
function baseToUnit(amountBase, unit){
  const n = Number(amountBase)||0;
  switch(unit){
    case "Kg": return n / 1000;
    case "Gram": return n;
    case "Liter": return n / 1000;
    case "Milliliter": return n;
    case "Kryddmått": return n / 1;
    case "Tesked": return n / 5;
    case "Matsked": return n / 15;
    case "Decilitermått": return n / 100;
    default: return n;
  }
}
const ingredientDensityMap = {
  "strosocker": { gramsPerDeciliter: 85 },
  "socker": { gramsPerDeciliter: 85 },
  "vetemjol": { gramsPerDeciliter: 60 },
  "mjol": { gramsPerDeciliter: 60 },
  "kakao": { gramsPerDeciliter: 40 },
  "vanillinsocker": { gramsPerDeciliter: 60 },
  "vaniljsocker": { gramsPerDeciliter: 60 },
  "salt": { gramsPerDeciliter: 120 }
};
function normalizeIngredientName(name){
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function getDensityDataByName(name){
  const n = normalizeIngredientName(name);
  return ingredientDensityMap[n] || null;
}
function getTemplateDensityData(templateOrName){
  if(!templateOrName) return null;
  if(typeof templateOrName === "string") return getDensityDataByName(templateOrName);
  return getDensityDataByName(templateOrName.name);
}
function canConvertUnits(fromUnit, toUnit, templateOrName){
  if(!fromUnit || !toUnit) return false;
  if(fromUnit === toUnit) return true;

  const fromFamily = unitFamily(fromUnit);
  const toFamily = unitFamily(toUnit);
  if(fromFamily === toFamily) return true;

  const densityData = getTemplateDensityData(templateOrName);
  const massVolume =
    (fromFamily === "mass" && toFamily === "volume") ||
    (fromFamily === "volume" && toFamily === "mass");

  return !!densityData?.gramsPerDeciliter && massVolume;
}
function convertByDensity(amount, fromUnit, toUnit, densityData){
  if(!densityData?.gramsPerDeciliter) return NaN;
  const n = Number(amount) || 0;
  const fromFamily = unitFamily(fromUnit);
  const toFamily = unitFamily(toUnit);

  if(fromFamily === "volume" && toFamily === "mass"){
    const volumeMl = unitToBase(n, fromUnit);
    const grams = (volumeMl / 100) * densityData.gramsPerDeciliter;
    return baseToUnit(grams, toUnit);
  }
  if(fromFamily === "mass" && toFamily === "volume"){
    const grams = unitToBase(n, fromUnit);
    const volumeMl = (grams / densityData.gramsPerDeciliter) * 100;
    return baseToUnit(volumeMl, toUnit);
  }
  return NaN;
}
function convertAmount(amount, fromUnit, toUnit, templateOrName){
  if(!fromUnit || !toUnit || fromUnit === toUnit) return Number(amount)||0;

  const fromFamily = unitFamily(fromUnit);
  const toFamily = unitFamily(toUnit);

  if(fromFamily === toFamily){
    return baseToUnit(unitToBase(amount, fromUnit), toUnit);
  }
  if(canConvertUnits(fromUnit, toUnit, templateOrName)){
    return convertByDensity(amount, fromUnit, toUnit, getTemplateDensityData(templateOrName));
  }
  return NaN;
}
function getHomeTotalByTemplateIdInUnit(templateId, targetUnit){
  const template = getTemplateById(templateId);
  const templateUnit = template?.unit || targetUnit || "";
  const totalInTemplateUnit = state.homeItems
    .filter(item => item.templateId === templateId)
    .reduce((sum, item) => sum + getItemTotalAmount(item), 0);

  if(!targetUnit || !templateUnit) return totalInTemplateUnit;
  const converted = convertAmount(totalInTemplateUnit, templateUnit, targetUnit, template);
  return Number.isNaN(converted) ? totalInTemplateUnit : converted;
}
function recipeHasEverything(recipe){
  return recipe.ingredients.every(ing => {
    const template = getTemplateById(ing.templateId);
    const homeUnit = template?.unit || "";
    const recipeUnit = ing.unit || homeUnit;
    if(recipeUnit && homeUnit && !canConvertUnits(recipeUnit, homeUnit, template)) return false;
    return getHomeTotalByTemplateIdInUnit(ing.templateId, recipeUnit) >= (Number(ing.amount)||0);
  });
}

function openRecipeLink(link){
  if(!link) return;
  window.open(link, "_blank");
}

function recipeMissingText(recipe){
  const missing = recipe.ingredients
    .filter(ing => {
      const template = getTemplateById(ing.templateId);
      const homeUnit = template?.unit || "";
      const recipeUnit = ing.unit || homeUnit;
      if(recipeUnit && homeUnit && !canConvertUnits(recipeUnit, homeUnit, template)) return true;
      return getHomeTotalByTemplateIdInUnit(ing.templateId, recipeUnit) < (Number(ing.amount)||0);
    })
    .map(ing => {
      const t = getTemplateById(ing.templateId);
      const recipeUnit = ing.unit || t?.unit || "";
      const homeUnit = t?.unit || "";
      if(recipeUnit && homeUnit && !canConvertUnits(recipeUnit, homeUnit, t)){
        return `${t?.name || "Saknad vara"} (fel enhet: ${recipeUnit} ↔ ${homeUnit})`;
      }
      const need = (Number(ing.amount)||0) - getHomeTotalByTemplateIdInUnit(ing.templateId, recipeUnit);
      return `${t?.name || "Saknad vara"} (${formatAmount(need)}${recipeUnit ? " " + recipeUnit : ""})`;
    });
  return missing.join(", ");
}

function renderItemDetails(item, listType){
  const parts = [];
  if(item.note) parts.push(escapeHtml(item.note));
  return parts.length ? `<div class="small">${parts.join(" • ")}</div>` : "";
}

function renderItemCard(item, listType){
  const isRest = !!item.isRest;
  const canMove = !(listType === "home" && isRest);

  return `
    <div class="item">
      <div class="thumb" onclick="openImageModal('${escapeJs(item.img || "")}','${escapeJs(item.name)}')">
        ${item.img ? `<img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}">` : `<div class="ph">Ingen bild</div>`}
      </div>
      <div class="itemBody">
        <div class="itemName">${escapeHtml(item.name || "Namnlös vara")}${isRest ? `<span class="restBadge">REST 🔥</span>` : ``}</div>
        ${isRest ? `<div class="restHint">Används först i recept</div>` : ``}
        <div class="meta">
          ${chip(item.category || "Ingen kategori")}
          ${chip(item.room || "Inget rum")}
          ${chip(item.place || "Ingen plats")}
          ${chip(item.drawer || "Ingen låda")}
        </div>
        <div class="qtyRow">
          ${!isRest ? `<button class="btn secondary" onclick="changeQty('${listType}','${item.id}',-1)">−</button>` : ``}
          <div class="qtyBox">${renderPackageText(item)}</div>
          ${!isRest ? `<button class="btn secondary" onclick="changeQty('${listType}','${item.id}',1)">+</button>` : ``}
        </div>
        ${renderItemDetails(item, listType)}
        <div class="btnRow" style="margin-top:10px">
          ${!isRest ? `<button class="btn primary" onclick="openItemModal('${listType}','${item.id}')">Ändra</button>` : ``}
          ${canMove ? `<button class="btn good" onclick="moveItem('${listType}','${item.id}')">${listType==='home'?'→ Köpa lista':'→ Hemmet'}</button>` : ``}
          <button class="btn danger" onclick="removeItem('${listType}','${item.id}')">Ta bort</button>
        </div>
      </div>
    </div>
  `;
}
function chip(text){ return `<span class="chip">${escapeHtml(text)}</span>`; }
function renderHome(){
  const root = document.getElementById("page-home");
  const items = filterItems(state.homeItems, "home");

  const totalItems = state.homeItems.length;
  const totalQty = countTotalQty(state.homeItems);
  const roomCount = [...new Set(state.homeItems.map(i => i.room).filter(Boolean))].length;

  root.innerHTML = `
    ${renderPageToolbar("home", "Hemmet")}
    <div class="homeHero">
      <div class="homeHeroCard">
        <h2 class="homeHeroTitle">Hemmet</h2>
        <div class="homeHeroText">
          Här ser du allt du har hemma, med tydligare kort, bättre kontrast och snabbare överblick.
        </div>
        <div class="homeQuickStats">
          <div class="homeQuickStat">
            <div class="k">Varor</div>
            <div class="v">${totalItems}</div>
          </div>
          <div class="homeQuickStat">
            <div class="k">Antal hemma</div>
            <div class="v">${totalQty}</div>
          </div>
          <div class="homeQuickStat">
            <div class="k">Rum</div>
            <div class="v">${roomCount}</div>
          </div>
        </div>
      </div>

      <div class="homeHeroCard">
        <h3 class="homeSectionTitle" style="margin:0 0 8px">Snabb överblick</h3>
        <div class="homeHeroText">
          Filtrera på rum, plats eller låda ovanför för att hitta saker snabbare.
          Korten nedan är nu ljusare och enklare att läsa.
        </div>
      </div>
    </div>

    <div class="homeSection">
      <div class="homeSectionHeader">
        <div>
          <h3 class="homeSectionTitle">Varor hemma</h3>
          <div class="homeSectionSub">${items.length} träffar i aktuell filtrering</div>
        </div>
      </div>
      ${items.length ? `<div class="homeList">${items.map(item=>renderItemCard(item,'home')).join("")}</div>` : `<div class="empty">Inga varor i Hemmet ännu.</div>`}
    </div>
  `;
}
function renderBuy(){
  const root = document.getElementById("page-buy");
  const items = filterItems(state.buyItems, "buy");

  const totalItems = state.buyItems.length;
  const totalQty = countTotalQty(state.buyItems);

  root.innerHTML = `
    ${renderPageToolbar("buy", "Köpa lista")}

    <div class="buyHero">
      <div class="buyHeroCard">
        <h2 class="buyHeroTitle">Köpa lista</h2>
        <div>Alla saker du behöver köpa – tydligare och renare UI.</div>
        <div class="buyQuickStats">
          <div class="buyQuickStat">
            <div>Antal varor</div>
            <div style="font-size:22px;font-weight:900">${totalItems}</div>
          </div>
          <div class="buyQuickStat">
            <div>Antal totalt</div>
            <div style="font-size:22px;font-weight:900">${totalQty}</div>
          </div>
        </div>
      </div>

      <div class="buyHeroCard">
        <div>Tips: Klicka → Hemmet när du handlat klart</div>
      </div>
    </div>

    <div class="buySection">
      ${items.length 
        ? `<div class="buyList">${items.map(item=>renderItemCard(item,'buy')).join("")}</div>` 
        : `<div class="empty">Köpa lista är tom.</div>`}
    </div>
  `;
}
function renderAdd(){
  const root = document.getElementById("page-add");
  const f = state.filters.add;
  const places = f.room && f.room !== "Alla rum" ? getPlaces(f.room) : [];
  const templates = state.templates.filter(t=>{
    const q = f.search.trim().toLowerCase();
    const matchSearch = !q || [t.name,t.category,t.defaultRoom,t.defaultPlace,t.defaultDrawer].join(" ").toLowerCase().includes(q);
    const matchRoom = f.room==="Alla rum" || t.defaultRoom===f.room || !t.defaultRoom;
    const matchPlace = f.place==="Alla platser" || t.defaultPlace===f.place || !t.defaultPlace;
    return matchSearch && matchRoom && matchPlace;
  });

  root.innerHTML = `
    <div class="section">
      <h2 class="sectionTitle">Lägg till</h2>
      <div class="toolbar">
        <input placeholder="Sök i Lägg till" value="${escapeHtml(f.search)}" oninput="updateFilter('add','search',this.value)">
        <select onchange="updateFilter('add','room',this.value)">
          <option ${f.room==="Alla rum"?"selected":""}>Alla rum</option>
          ${state.rooms.map(r=>`<option ${f.room===r?"selected":""}>${escapeHtml(r)}</option>`).join("")}
        </select>
        <select onchange="updateFilter('add','place',this.value)">
          <option ${f.place==="Alla platser"?"selected":""}>Alla platser</option>
          ${places.map(p=>`<option ${f.place===p?"selected":""}>${escapeHtml(p)}</option>`).join("")}
        </select>
        <button class="btn secondary" onclick="showPage('manage'); setManageSection('add');">Hantera mallar</button>
      </div>
      <div class="footerNote">Spara mall finns bara i Hantera → Lägg till.</div>
    </div>

    <div class="section">
      <h3 class="sectionTitle">Mallar</h3>
      <div class="templateTools">
        ${templates.length ? templates.map(t=>`
          <div class="item">
            <div class="thumb" onclick="openImageModal('${escapeJs(t.img || "")}','${escapeJs(t.name)}')">
              ${t.img ? `<img src="${escapeHtml(t.img)}" alt="${escapeHtml(t.name)}">` : `<div class="ph">Ingen bild</div>`}
            </div>
            <div class="itemBody">
              <div class="itemName">${escapeHtml(t.name)}</div>
              <div class="meta">
                ${chip(t.category || "Ingen kategori")}
                ${chip((t.mode || "normal") === "package" ? "Paket + fast mått" : "Vanlig vara")}
                ${chip(t.unit || "Ingen enhet")}
                ${chip(t.defaultRoom || "Inget rum")}
                ${chip(t.defaultPlace || "Ingen plats")}
                ${chip(t.defaultDrawer || "Ingen låda")}
              </div>
              <div class="small">${(t.mode||"normal")==="package" ? `${formatAmount(Number(t.packageCount || t.qty || 0))} paket × ${formatAmount(Number(t.fixedAmount || 1))}${t.unit ? " " + escapeHtml(t.unit) : ""} = ${formatAmount((Number(t.packageCount || t.qty || 0)) * (Number(t.fixedAmount || 1)))}${t.unit ? " " + escapeHtml(t.unit) : ""}` : `${formatAmount(Number(t.qty)||0)}${t.unit ? " " + escapeHtml(t.unit) : ""}`}${t.note ? " • " + escapeHtml(t.note) : ""}</div>
              <div class="btnRow" style="margin-top:10px">
                <button class="btn good" onclick="addTemplateTo('home','${t.id}')">+ Hemmet</button>
                <button class="btn primary" onclick="addTemplateTo('buy','${t.id}')">+ Köpa lista</button>
              </div>
            </div>
          </div>
        `).join("") : `<div class="empty">Inga mallar sparade ännu.</div>`}
      </div>
    </div>
  `;
}

function renderRecipes(){
  const root = document.getElementById("page-recipes");
  const filter = state.filters.recipes || {search:"", category:"Alla Recept Kategori"};
  const recipes = (state.recipes || []).filter(recipe=>{
    const q = (filter.search || "").trim().toLowerCase();
    const matchSearch = !q || [recipe.name].join(" ").toLowerCase().includes(q);
    const matchCategory = filter.category === "Alla Recept Kategori" || recipe.category === filter.category;
    return matchSearch && matchCategory;
  });

  root.innerHTML = `
    <div class="section">
      <h2 class="sectionTitle">Recept</h2>
      <div class="toolbar">
        <div class="recipeSearchInputWrap">
          <input id="recipe-search-input" placeholder="Sök Recept" autocomplete="off" value="${escapeHtml(filter.search || "")}" oninput="handleRecipeSearchInput(this.value)" onfocus="handleRecipeSearchFocus()">
          <div id="recipe-search-suggest"></div>
        </div>
        <select onchange="updateRecipeFilter('category',this.value)">
          <option ${filter.category==="Alla Recept Kategori" ? "selected" : ""}>Alla Recept Kategori</option>
          ${state.recipeCategories.map(cat => `<option value="${escapeHtml(cat)}" ${filter.category===cat ? "selected" : ""}>${escapeHtml(cat)}</option>`).join("")}
        </select>
        <button class="btn secondary" onclick="showPage('manage'); setManageSection('recipes');">Hantera recept</button>
      </div>
      <div class="footerNote">Ny receptkategori, Lägg till recept och Receptkategorier finns bara i Hantera → Recept.</div>
    </div>

    <div class="section">
      <h3 class="sectionTitle">Recept</h3>
      ${recipes.length ? `<div class="templateTools">${recipes.map(recipe => renderRecipeCard(recipe)).join("")}</div>` : `<div class="empty">Inga recept ännu.</div>`}
    </div>
  `;
}

function renderDraftRecipeIngredients(){
  const list = state.draftRecipe?.ingredients || [];
  if(!list.length) return `<div class="empty">Inga ingredienser valda ännu.</div>`;
  return `<div class="entityList">` + list.map((ing, index) => {
    const t = getTemplateById(ing.templateId);
    return `
      <div class="entity">
        <span>${escapeHtml(t?.name || "Okänd vara")} — ${formatAmount(ing.amount)} ${escapeHtml(ing.unit || t?.unit || "")}</span>
        <div class="btnRow">
          <button class="btn secondary" onclick="editDraftIngredient(${index})">Ändra ingrediens</button>
          <button class="btn danger" onclick="removeDraftIngredient(${index})">Ta bort ingrediens</button>
        </div>
      </div>
    `;
  }).join("") + `</div>`;
}
function renderRecipeCard(recipe){
  const firstIngredient = recipe.ingredients?.[0];
  const firstTemplate = firstIngredient ? getTemplateById(firstIngredient.templateId) : null;
  const recipeImg = recipe.img || firstTemplate?.img || "";
  const hasEverything = recipeHasEverything(recipe);
  const frameClass = hasEverything ? "okFrame" : "missingFrame";
  const badgeClass = hasEverything ? "okBadge" : "missingBadge";
  const badgeText = hasEverything ? "Har allt hemma" : "Saknas ingredienser";
  const isRecipePage = state.currentPage === "recipes";

  return `
    <div class="card">
      <div class="recipeCardHeader">
        <h3 class="sectionTitle">Recept</h3>
        <button class="recipeCookHeaderBtn" onclick="cookRecipe('${recipe.id}')">🍳</button>
      </div>

      ${recipeImg ? `
        <div class="recipeImageFrame ${frameClass}">
          <div class="recipeHeroThumb" onclick="openImageModal('${escapeJs(recipeImg)}','${escapeJs(recipe.name)}')">
            <img src="${escapeHtml(recipeImg)}" alt="${escapeHtml(recipe.name || "Receptbild")}">
            <button class="recipeLinkBtn" onclick="event.stopPropagation();openRecipeLink('${escapeJs(recipe.link || "")}')">🌐</button>
            <div class="recipeOverlay">
              <div class="recipeOverlayTitle">${escapeHtml(recipe.name || "Namnlöst recept")}</div>
              <div class="recipeStatusBadge ${badgeClass}">${badgeText}</div>
            </div>
          </div>
        </div>
      ` : `<div class="itemName">${escapeHtml(recipe.name || "Namnlöst recept")}</div>`}

      <div class="meta">
        ${chip(recipe.category || "Ingen kategori")}
        ${recipe.link ? `<span class="chip">Länk sparad</span>` : `<span class="chip">Ingen länk</span>`}
      </div>

      <div class="entityList" style="margin:12px 0">
        ${(recipe.ingredients||[]).map((ing, index) => {
          const t = getTemplateById(ing.templateId);
          const recipeUnit = ing.unit || t?.unit || "";
          const haveAmount = getHomeTotalByTemplateIdInUnit(ing.templateId, recipeUnit);
          const enough = haveAmount >= (Number(ing.amount) || 0);
          const diffAmount = enough ? (haveAmount - (Number(ing.amount) || 0)) : ((Number(ing.amount) || 0) - haveAmount);
          return `
            <div class="entity recipeIngredientRow">
              <div class="recipeIngredientMain">
                <div class="recipeIngredientThumb" onclick="openImageModal('${escapeJs(t?.img || "")}','${escapeJs(t?.name || "Ingrediens")}')">
                  ${t?.img ? `<img src="${escapeHtml(t.img)}" alt="${escapeHtml(t?.name || "Ingrediens")}">` : `<div class="ph">Ingen bild</div>`}
                </div>
                <div class="recipeIngredientText">
                  <div class="recipeIngredientName">${escapeHtml(t?.name || "Okänd vara")}</div>
                  <div class="amountRow">
                    <div class="amountBox">
                      <div class="amountLabel">Recept</div>
                      <div class="amountValue">${formatAmount(ing.amount)}<span class="amountUnit">${escapeHtml(recipeUnit)}</span></div>
                    </div>
                    <div class="amountBox ${enough ? 'ok' : 'missing'}">
                      <div class="amountLabel">Hemma</div>
                      <div class="amountValue">${formatAmount(haveAmount)}<span class="amountUnit">${escapeHtml(recipeUnit)}</span></div>
                    </div>
                  </div>
                  <div class="amountStatus ${enough ? 'ok' : 'missing'}">${enough ? `✔ Klar • extra: ${formatAmount(diffAmount)} ${escapeHtml(recipeUnit)}` : `✖ Saknas: ${formatAmount(diffAmount)} ${escapeHtml(recipeUnit)}`}</div>
                </div>
              </div>
              ${!isRecipePage ? `
                <div class="recipeIngredientActions">
                  <button class="btn secondary" onclick="editRecipeIngredient('${recipe.id}',${index})">Ändra ingrediens</button>
                  <button class="btn danger" onclick="removeRecipeIngredient('${recipe.id}',${index})">Ta bort ingrediens</button>
                </div>
              ` : ``}
            </div>
          `;
        }).join("") || `<div class="empty">Inga ingredienser i receptet ännu.</div>`}
      </div>

      ${!isRecipePage ? `
        <div class="btnRow" style="margin-bottom:10px">
          <div class="recipeSearchInputWrap">
            <input id="recipe-add-template-search-${recipe.id}" placeholder="Lägg till ingredienser från Lägg till" autocomplete="off"
              oninput="handleTemplateSearchInput('recipe-add-template-search-${recipe.id}','recipe-add-template-${recipe.id}','recipe-add-template-suggest-${recipe.id}')"
              onfocus="handleTemplateSearchFocus('recipe-add-template-search-${recipe.id}','recipe-add-template-${recipe.id}','recipe-add-template-suggest-${recipe.id}')">
            <input id="recipe-add-template-${recipe.id}" type="hidden">
            <div id="recipe-add-template-suggest-${recipe.id}"></div>
          </div>
          <input id="recipe-add-amount-${recipe.id}" type="number" min="0" step="0.01" placeholder="Hur mycket">
          <select id="recipe-add-unit-${recipe.id}">${units.map(u => `<option value="${u}">${u}</option>`).join("")}</select>
          <button class="btn good" onclick="addIngredientToRecipe('${recipe.id}')">Lägg till ingrediens</button>
        </div>
      ` : ``}

      <div class="recipeSummaryBar">
        <div class="recipeSummaryText">${hasEverything ? `<strong>Har jag allt?</strong> Ja` : `<strong>Har jag allt?</strong> Nej — ${escapeHtml(recipeMissingText(recipe))}`}</div>
        <div class="recipeSummaryGlow ${hasEverything ? 'ok' : 'missing'}"></div>
      </div>

      ${!isRecipePage ? `
        <div class="btnRow">
          <button class="btn primary" onclick="editRecipe('${recipe.id}')">Ändra recept</button>
          <button class="btn secondary" onclick="editRecipeImage('${recipe.id}')">Ändra bild</button>
          <button class="btn secondary" onclick="editRecipeLink('${recipe.id}')">Ändra länk</button>
          <button class="btn danger" onclick="deleteRecipe('${recipe.id}')">Ta bort Recept</button>
        </div>
      ` : ``}
    </div>
  `;
}

function refreshRecipeView(){
  if(state.currentPage === "manage" && getManageUi().section === "recipes") renderManage();
  else renderRecipes();
}

function editRecipeLink(recipeId){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;
  const newLink = prompt("Ny recept-länk:", recipe.link || "");
  if(newLink === null) return;
  recipe.link = newLink.trim();
  saveState();
  refreshRecipeView();
}

function editRecipeImage(recipeId){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;
  const value = prompt("Ny bild-URL för receptet (lämna tom för att använda mallbild):", recipe.img || "");
  if(value === null) return;
  recipe.img = value.trim();
  saveState();
  refreshRecipeView();
}

function getRecipeSuggestions(query){
  const q = String(query || '').trim().toLowerCase();
  const sorted = [...(state.recipes || [])].sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  const withMeta = sorted.map(recipe => {
    const firstIngredient = recipe.ingredients?.[0];
    const firstTemplate = firstIngredient ? getTemplateById(firstIngredient.templateId) : null;
    return {
      ...recipe,
      suggestImg: recipe.img || firstTemplate?.img || ''
    };
  });
  if(!q) return withMeta.slice(0,8);
  return withMeta.filter(recipe => String(recipe.name || '').toLowerCase().includes(q)).slice(0,8);
}
function closeRecipeSuggestBox(){
  const box = document.getElementById('recipe-search-suggest');
  if(box) box.innerHTML = '';
}
function renderRecipeSuggestBox(items){
  const box = document.getElementById('recipe-search-suggest');
  if(!box) return;
  if(!items.length){
    box.innerHTML = '<div class="recipeSuggestBox"><div class="recipeSuggestEmpty">Ingen träff</div></div>';
    return;
  }
  box.innerHTML = '<div class="recipeSuggestBox"><div class="recipeSuggestGrid">' + items.map(recipe => `
    <button type="button" class="recipeSuggestItem" onclick="selectRecipeSuggestion('${escapeJs(recipe.id)}')">
      <div class="recipeSuggestThumb">${recipe.suggestImg ? `<img src="${escapeHtml(recipe.suggestImg)}" alt="${escapeHtml(recipe.name || 'Recept')}">` : `<div class="ph">Ingen bild</div>`}</div>
      <div class="recipeSuggestMeta">
        <div class="recipeSuggestName">${escapeHtml(recipe.name || 'Namnlöst recept')}</div>
      </div>
    </button>
  `).join('') + '</div></div>';
}
function handleRecipeSearchInput(value){
  updateRecipeFilter('search', value, false);
  renderRecipeSuggestBox(getRecipeSuggestions(value));
}
function handleRecipeSearchFocus(){
  const input = document.getElementById('recipe-search-input');
  renderRecipeSuggestBox(getRecipeSuggestions(input?.value || ''));
}
function selectRecipeSuggestion(recipeId){
  const recipe = (state.recipes || []).find(r => r.id === recipeId);
  const value = recipe?.name || '';
  state.filters.recipes.search = value;
  saveState();
  refreshRecipeView();
  requestAnimationFrame(() => {
    const input = document.getElementById('recipe-search-input');
    if(input) input.value = value;
  });
}
function updateRecipeFilter(field, value, shouldRender = true){
  state.filters.recipes[field] = value;
  saveState();
  if(shouldRender) refreshRecipeView();
}
function addRecipeCategory(){
  const input = document.getElementById("new-recipe-category");
  const value = input.value.trim();
  if(!value) return;
  if(state.recipeCategories.includes(value)){
    alert("Receptkategorin finns redan.");
    return;
  }
  state.recipeCategories.push(value);
  input.value = "";
  saveState();
  refreshRecipeView();
}
function renameRecipeCategory(oldValue){
  const value = prompt("Nytt namn på receptkategori:", oldValue);
  if(!value || value.trim()===oldValue) return;
  const newValue = value.trim();
  if(state.recipeCategories.includes(newValue)){
    alert("Det namnet finns redan.");
    return;
  }
  state.recipeCategories = state.recipeCategories.map(cat => cat === oldValue ? newValue : cat);
  (state.recipes || []).forEach(recipe => { if(recipe.category === oldValue) recipe.category = newValue; });
  saveState();
  refreshRecipeView();
}
function deleteRecipeCategory(value){
  if(!confirm(`Ta bort receptkategori "${value}"?`)) return;
  state.recipeCategories = state.recipeCategories.filter(cat => cat !== value);
  (state.recipes || []).forEach(recipe => { if(recipe.category === value) recipe.category = ""; });
  saveState();
  refreshRecipeView();
}

function getTemplateSuggestions(query){
  const q = String(query || '').trim().toLowerCase();
  const sorted = [...state.templates].sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  if(!q) return sorted.slice(0, 8);
  return sorted
    .filter(t => [t.name, t.category, t.defaultRoom, t.defaultPlace, t.defaultDrawer, t.note].join(' ').toLowerCase().includes(q))
    .slice(0, 8);
}
function closeTemplateSuggestBox(listId){
  const box = document.getElementById(listId);
  if(box) box.innerHTML = '';
}
function closeAllTemplateSuggestBoxes(){
  document.querySelectorAll('[id^="new-recipe-template-suggest"], [id^="recipe-add-template-suggest-"]').forEach(box => box.innerHTML = '');
}
function renderTemplateSuggestBox(textInputId, hiddenInputId, listId, items){
  const box = document.getElementById(listId);
  if(!box) return;
  if(!items.length){
    box.innerHTML = '<div class="templateSuggestBox"><div class="templateSuggestEmpty">Ingen träff</div></div>';
    return;
  }
  box.innerHTML = '<div class="templateSuggestBox">' + items.map(t => `
    <button type="button" class="templateSuggestItem" onclick="selectTemplateSuggestion('${escapeJs(t.id)}','${escapeJs(hiddenInputId)}','${escapeJs(textInputId)}','${escapeJs(listId)}')">
      <div class="templateSuggestThumb">${t.img ? `<img src="${escapeHtml(t.img)}" alt="${escapeHtml(t.name || 'Vara')}">` : `<div class="ph">Ingen bild</div>`}</div>
      <div class="templateSuggestMeta">
        <div class="templateSuggestName">${escapeHtml(t.name || 'Namnlös vara')}</div>
        <div class="templateSuggestInfo">${escapeHtml(t.category || 'Ingen kategori')}${t.unit ? ` • ${escapeHtml(t.unit)}` : ''}</div>
      </div>
    </button>
  `).join('') + '</div>';
}
function handleTemplateSearchInput(textInputId, hiddenInputId, listId){
  const input = document.getElementById(textInputId);
  const hidden = document.getElementById(hiddenInputId);
  if(!input || !hidden) return;
  hidden.value = '';
  const items = getTemplateSuggestions(input.value);
  if(!(input.value || '').trim()){
    renderTemplateSuggestBox(textInputId, hiddenInputId, listId, getTemplateSuggestions(''));
    return;
  }
  renderTemplateSuggestBox(textInputId, hiddenInputId, listId, items);
}
function handleTemplateSearchFocus(textInputId, hiddenInputId, listId){
  const input = document.getElementById(textInputId);
  if(!input) return;
  renderTemplateSuggestBox(textInputId, hiddenInputId, listId, getTemplateSuggestions(input.value));
}
function selectTemplateSuggestion(templateId, hiddenInputId, textInputId, listId){
  const template = getTemplateById(templateId);
  const hidden = document.getElementById(hiddenInputId);
  const input = document.getElementById(textInputId);
  if(hidden) hidden.value = templateId;
  if(input) input.value = template?.name || '';
  closeTemplateSuggestBox(listId);
}

document.addEventListener('click', (event) => {
  if(event.target.closest('.recipeSearchInputWrap')) return;
  closeAllTemplateSuggestBoxes();
  closeRecipeSuggestBox();
});

function getTemplateIdBySearchInput(inputId){
  const raw = (document.getElementById(inputId)?.value || "").trim();
  if(!raw) return "";
  const exact = state.templates.find(t => (t.name || "").trim().toLowerCase() === raw.toLowerCase());
  if(exact) return exact.id;
  const partial = state.templates.find(t => (t.name || "").toLowerCase().includes(raw.toLowerCase()));
  return partial ? partial.id : "";
}

function addIngredientToDraftRecipe(){
  const hiddenInput = document.getElementById("new-recipe-template-select");
  const templateId = hiddenInput?.value || getTemplateIdBySearchInput("new-recipe-template-search");
  const amount = Number(document.getElementById("new-recipe-ingredient-amount").value || 0);
  const unit = document.getElementById("new-recipe-ingredient-unit").value;
  if(!templateId || !amount){
    alert("Välj ingrediens och skriv hur mycket.");
    return;
  }
  state.draftRecipe ||= {ingredients: []};
  state.draftRecipe.ingredients.push({templateId, amount, unit});
  if(hiddenInput) hiddenInput.value = "";
  document.getElementById("new-recipe-template-search").value = "";
  closeTemplateSuggestBox("new-recipe-template-suggest");
  document.getElementById("new-recipe-ingredient-amount").value = "";
  document.getElementById("new-recipe-ingredient-unit").selectedIndex = 0;
  saveState();
  refreshRecipeView();
}
function editDraftIngredient(index){
  const ing = state.draftRecipe?.ingredients?.[index];
  if(!ing) return;
  const value = prompt("Ändra mängd för ingrediensen:", ing.amount);
  if(value === null) return;
  const unitValue = prompt("Ändra enhet för ingrediensen:", ing.unit || "");
  if(unitValue === null) return;
  ing.amount = Math.max(0, Number(value)||0);
  ing.unit = unitValue.trim() || ing.unit || "";
  if(ing.amount === 0) state.draftRecipe.ingredients.splice(index,1);
  saveState();
  refreshRecipeView();
}
function removeDraftIngredient(index){
  if(!state.draftRecipe?.ingredients) return;
  state.draftRecipe.ingredients.splice(index,1);
  saveState();
  refreshRecipeView();
}
function saveRecipe(){
  const name = document.getElementById("new-recipe-name").value.trim();
  const link = document.getElementById("new-recipe-link").value.trim();
  const category = document.getElementById("new-recipe-category-select").value;
  const ingredients = [...(state.draftRecipe?.ingredients || [])];
  if(!name){
    alert("Skriv receptnamn först.");
    return;
  }
  state.recipes.unshift({id: uid(), name, link, category, ingredients});
  document.getElementById("new-recipe-name").value = "";
  document.getElementById("new-recipe-link").value = "";
  state.draftRecipe = {ingredients: []};
  saveState();
  refreshRecipeView();
}
function editRecipe(recipeId){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;
  const newName = prompt("Ändra receptnamn:", recipe.name);
  if(newName === null) return;
  const newLink = prompt("Ändra länk till recept:", recipe.link || "");
  if(newLink === null) return;
  recipe.name = newName.trim() || recipe.name;
  recipe.link = newLink.trim();
  saveState();
  refreshRecipeView();
}
function deleteRecipe(recipeId){
  if(!confirm("Ta bort detta recept?")) return;
  state.recipes = state.recipes.filter(r => r.id !== recipeId);
  saveState();
  refreshRecipeView();
}
function editRecipeIngredient(recipeId, ingredientIndex){
  const recipe = state.recipes.find(r => r.id === recipeId);
  const ing = recipe?.ingredients?.[ingredientIndex];
  if(!ing) return;
  const value = prompt("Ändra mängd för ingrediensen:", ing.amount);
  if(value === null) return;
  const unitValue = prompt("Ändra enhet för ingrediensen:", ing.unit || "");
  if(unitValue === null) return;
  ing.amount = Math.max(0, Number(value)||0);
  ing.unit = unitValue.trim() || ing.unit || "";
  if(ing.amount === 0) recipe.ingredients.splice(ingredientIndex,1);
  saveState();
  refreshRecipeView();
}
function removeRecipeIngredient(recipeId, ingredientIndex){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;
  recipe.ingredients.splice(ingredientIndex,1);
  saveState();
  refreshRecipeView();
}
function addIngredientToRecipe(recipeId){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;
  const hiddenInput = document.getElementById(`recipe-add-template-${recipeId}`);
  const templateId = hiddenInput?.value || getTemplateIdBySearchInput(`recipe-add-template-search-${recipeId}`);
  const amount = Number(document.getElementById(`recipe-add-amount-${recipeId}`).value || 0);
  const unit = document.getElementById(`recipe-add-unit-${recipeId}`).value;
  if(!templateId || !amount){
    alert("Välj ingrediens och skriv hur mycket.");
    return;
  }
  recipe.ingredients.push({templateId, amount, unit});
  if(hiddenInput) hiddenInput.value = '';
  const searchInput = document.getElementById(`recipe-add-template-search-${recipeId}`);
  if(searchInput) searchInput.value = '';
  closeTemplateSuggestBox(`recipe-add-template-suggest-${recipeId}`);
  document.getElementById(`recipe-add-amount-${recipeId}`).value = '';
  document.getElementById(`recipe-add-unit-${recipeId}`).selectedIndex = 0;
  saveState();
  refreshRecipeView();
}
function cookRecipe(recipeId){
  const recipe = state.recipes.find(r => r.id === recipeId);
  if(!recipe) return;

  if(!recipeHasEverything(recipe)){
    alert("Du har inte allt hemma ännu.");
    return;
  }

  recipe.ingredients.forEach(ing => {
    const template = getTemplateById(ing.templateId);
    const homeUnit = template?.unit || "";
    const recipeUnit = ing.unit || homeUnit;
    let neededInHomeUnit = Number(ing.amount) || 0;
    let packagesUsedForRecipe = 0;

    if(recipeUnit && homeUnit && recipeUnit !== homeUnit){
      const converted = convertAmount(ing.amount, recipeUnit, homeUnit, template);
      if(Number.isNaN(converted)) return;
      neededInHomeUnit = converted;
    }

    let remaining = neededInHomeUnit;

    const matchingItems = state.homeItems
      .filter(item => item.templateId === ing.templateId)
      .sort((a, b) => {
        if(!!a.isRest !== !!b.isRest) return a.isRest ? -1 : 1;
        if((a.mode || "normal") === "package" && (b.mode || "normal") === "package"){
          return (Number(a.fixedAmount || 1) || 1) - (Number(b.fixedAmount || 1) || 1);
        }
        if((a.mode || "normal") !== (b.mode || "normal")){
          return (a.mode || "normal") === "normal" ? -1 : 1;
        }
        return 0;
      });

    for(const item of matchingItems){
      if(remaining <= 0) break;

      const mode = item.mode || "normal";
      const fixedAmount = Number(item.fixedAmount || 1) || 1;

      if(mode === "package"){
        const availablePackages = Number(item.packageCount || item.qty || 0) || 0;
        if(availablePackages <= 0) continue;

        if(item.isRest){
          const availableAmount = Number(item.fixedAmount || 0) || 0;
          const deductAmount = Math.min(availableAmount, remaining);
          const restLeft = Math.max(0, Number((availableAmount - deductAmount).toFixed(2)));

          remaining -= deductAmount;

          if(restLeft > 0){
            item.packageCount = 1;
            item.qty = 1;
            item.fixedAmount = restLeft;
          }else{
            item.packageCount = 0;
            item.qty = 0;
            item.fixedAmount = 0;
          }
        }else if(template?.fixedAmount && fixedAmount === Number(template.fixedAmount || 1)){
          while(remaining > 0 && (Number(item.packageCount || item.qty || 0) || 0) > 0){
            const currentPackages = Number(item.packageCount || item.qty || 0) || 0;

            if(remaining >= fixedAmount){
              item.packageCount = currentPackages - 1;
              item.qty = item.packageCount;
              remaining -= fixedAmount;
              if(!item.isRest) packagesUsedForRecipe += 1;
            }else{
              item.packageCount = currentPackages - 1;
              item.qty = item.packageCount;

              const restAmount = fixedAmount - remaining;
              if(restAmount > 0){
                const restItem = createRestPackageItem(item, Number(restAmount.toFixed(2)));
                restItem.isRest = true;
                restItem.name = item.name || template?.name || "";
                state.homeItems.unshift(restItem);
              }
              remaining = 0;
              if(!item.isRest) packagesUsedForRecipe += 1;
            }
          }
        }else{
          const availableAmount = availablePackages * fixedAmount;
          const deductAmount = Math.min(availableAmount, remaining);
          const newPackages = (availableAmount - deductAmount) / fixedAmount;

          item.packageCount = Math.max(0, Number(newPackages.toFixed(2)));
          item.qty = item.packageCount;
          remaining -= deductAmount;
        }
      }else{
        const availableAmount = Number(item.qty || 0) || 0;
        const deductAmount = Math.min(availableAmount, remaining);

        item.qty = Math.max(0, Number((availableAmount - deductAmount).toFixed(2)));
        item.packageCount = item.qty;
        remaining -= deductAmount;
      }
    }

    if(template?.mode === "package"){
      const templateFixed = Number(template.fixedAmount || 1) || 1;

      if(packagesUsedForRecipe > 0){
        let existingWhole = state.buyItems.find(item =>
          item.templateId === ing.templateId &&
          !item.isRest &&
          (item.mode || "normal") === "package" &&
          Number(item.fixedAmount || 1) === templateFixed
        );

        if(existingWhole){
          existingWhole.packageCount = (Number(existingWhole.packageCount || existingWhole.qty || 0) || 0) + packagesUsedForRecipe;
          existingWhole.qty = existingWhole.packageCount;
          existingWhole.fixedAmount = templateFixed;
        }else{
          state.buyItems.unshift({
            id: uid(),
            templateId: ing.templateId,
            name: template?.name || "Okänd vara",
            qty: packagesUsedForRecipe,
            mode: "package",
            packageCount: packagesUsedForRecipe,
            fixedAmount: templateFixed,
            img: template?.img || "",
            category: template?.category || "",
            room: template?.defaultRoom || "",
            place: template?.defaultPlace || "",
            drawer: template?.defaultDrawer || "",
            unit: homeUnit,
            note: template?.note || "",

          });
        }
      }
    }else{
      const buyQty = Number(ing.amount) || 0;
      let existingBuy = state.buyItems.find(item => item.templateId === ing.templateId && !item.isRest);

      if(existingBuy){
        existingBuy.qty = Number((Number(existingBuy.qty || 0) + buyQty).toFixed(2));
        existingBuy.packageCount = existingBuy.qty;
        if(!existingBuy.unit) existingBuy.unit = recipeUnit || template?.unit || "";
      }else{
        state.buyItems.unshift({
          id: uid(),
          templateId: ing.templateId,
          name: template?.name || "Okänd vara",
          qty: Number(buyQty.toFixed(2)),
          mode: template?.mode || "normal",
          packageCount: Number(buyQty.toFixed(2)),
          fixedAmount: 1,
          img: template?.img || "",
          category: template?.category || "",
          room: template?.defaultRoom || "",
          place: template?.defaultPlace || "",
          drawer: template?.defaultDrawer || "",
          unit: recipeUnit || template?.unit || "",
          note: template?.note || "",

        });
      }
    }
  });

  state.homeItems = state.homeItems.filter(item => {
    if((item.mode || "normal") === "package"){
      return (Number(item.packageCount || item.qty || 0) || 0) > 0 && (Number(item.fixedAmount || 0) || 0) > 0;
    }
    return (Number(item.qty) || 0) > 0;
  });

  saveState();
  render();
  showPage("recipes");
}
function getManageUi(){
  state.manageUi ||= { section:"home", roomSearch:"", categorySearch:"", placeSearch:"", drawerSearch:"", currentPlace:"" };
  if(!state.manageUi.section) state.manageUi.section = "home";
  return state.manageUi;
}
function filteredManageValues(values, search){
  const q = String(search || '').trim().toLowerCase();
  const list = Array.isArray(values) ? values : [];
  if(!q) return list;
  return list.filter(v => String(v || '').toLowerCase().includes(q));
}
function renderManageEntityChips(values, options = {}){
  const { rowId = '', onSelect = null, activeValue = '', renameCall = null, deleteCall = null, emptyText = 'Ingen träff.' } = options;
  if(!values.length) return `<div class="manageEmpty">${escapeHtml(emptyText)}</div>`;
  return `
    <div class="manageChipRail">
      <button class="manageArrow" onclick="scrollManageRow('${escapeJs(rowId)}',-220)" aria-label="Scrolla vänster">◀</button>
      <div class="manageScroller" id="${escapeHtml(rowId)}">
        ${values.map(value => `
          <div class="manageEntityChip ${activeValue===value ? 'active' : ''}">
            <button class="manageEntityChipName" onclick="${onSelect ? `${onSelect}('${escapeJs(value)}')` : 'void(0)'}">${escapeHtml(value)}</button>
            ${renameCall ? `<button class="manageChipAction" onclick="${renameCall(value)}" title="Ändra">✏️</button>` : ``}
            ${deleteCall ? `<button class="manageChipAction danger" onclick="${deleteCall(value)}" title="Ta bort">×</button>` : ``}
          </div>
        `).join('')}
      </div>
      <button class="manageArrow" onclick="scrollManageRow('${escapeJs(rowId)}',220)" aria-label="Scrolla höger">▶</button>
    </div>
  `;
}
function renderManageHomeSection(ui){
  const fallbackRoom = state.rooms[0] || "";
  if(state.currentManageRoom === "Alla rum") state.currentManageRoom = fallbackRoom || "Alla rum";
  if(state.currentManageRoom && state.currentManageRoom !== "Alla rum" && !state.rooms.includes(state.currentManageRoom)){
    state.currentManageRoom = fallbackRoom || "Alla rum";
  }
  const room = state.currentManageRoom && state.currentManageRoom !== "Alla rum" ? state.currentManageRoom : fallbackRoom;
  const allPlaces = room ? getPlaces(room) : [];
  if(ui.currentPlace && !allPlaces.includes(ui.currentPlace)) ui.currentPlace = allPlaces[0] || "";
  if(!ui.currentPlace && allPlaces.length) ui.currentPlace = allPlaces[0];
  const place = ui.currentPlace || "";
  const allDrawers = room && place ? getDrawers(room, place) : [];
  const roomValues = filteredManageValues(state.rooms, ui.roomSearch);
  const categoryValues = filteredManageValues(getCategories(room, true), ui.categorySearch);
  const placeValues = filteredManageValues(allPlaces, ui.placeSearch);
  const drawerValues = filteredManageValues(allDrawers, ui.drawerSearch);

  return `
    <div class="manageBoard">
      <section class="manageSection">
        <div class="manageHeaderRow">
          <div class="manageTitleBlock">
            <div class="manageTitleLine"><div class="manageIcon">🏠</div><h3 class="manageBigTitle">Rum</h3></div>
            <div class="manageInputRow">
              <input id="manage-new-room" placeholder="Nytt rum">
              <button class="btn primary" onclick="addRoom()">Lägg till rum</button>
            </div>
          </div>
          <div class="manageSearchWrap"><input class="manageSearchInput" placeholder="Sök Bar" value="${escapeHtml(ui.roomSearch)}" oninput="updateManageUi('roomSearch', this.value)"></div>
        </div>
        ${renderManageEntityChips(roomValues, {
          rowId: 'manage-rooms-row',
          onSelect: 'setManageRoom',
          activeValue: room,
          renameCall: (value) => `renameRoom('${escapeJs(value)}')`,
          deleteCall: (value) => `deleteRoom('${escapeJs(value)}')`,
          emptyText: 'Inga rum matchar sökningen.'
        })}
      </section>

      <section class="manageSection">
        <div class="manageHeaderRow">
          <div class="manageTitleBlock">
            <div class="manageTitleLine"><h3 class="manageBigTitle">Kategorier i ${escapeHtml(room || 'valt rum')}</h3></div>
            <div class="manageInputRow">
              <input id="manage-new-category" placeholder="Ny kategori i ${escapeHtml(room || 'valt rum')}">
              <button class="btn primary" onclick="addCategory()">Lägg till kategori</button>
            </div>
          </div>
          <div class="manageSearchWrap"><input class="manageSearchInput" placeholder="Sök Bar" value="${escapeHtml(ui.categorySearch)}" oninput="updateManageUi('categorySearch', this.value)"></div>
        </div>
        ${renderManageEntityChips(categoryValues, {
          rowId: 'manage-categories-row',
          renameCall: (value) => `renameCategory('${escapeJs(value)}')`,
          deleteCall: (value) => `deleteCategory('${escapeJs(value)}')`,
          emptyText: 'Inga kategorier matchar sökningen.'
        })}
      </section>

      <section class="manageSection">
        <div class="manageHeaderRow">
          <div class="manageTitleBlock">
            <div class="manageTitleLine"><h3 class="manageBigTitle">Platser i ${escapeHtml(room || 'valt rum')}</h3></div>
            <div class="manageInputRow">
              <input id="manage-new-place" placeholder="Ny plats i ${escapeHtml(room || 'valt rum')}">
              <button class="btn primary" onclick="addPlace()">Lägg till plats</button>
            </div>
          </div>
          <div class="manageSearchWrap"><input class="manageSearchInput" placeholder="Sök Bar" value="${escapeHtml(ui.placeSearch)}" oninput="updateManageUi('placeSearch', this.value)"></div>
        </div>
        ${room ? renderManageEntityChips(placeValues, {
          rowId: 'manage-places-row',
          onSelect: 'setManagePlace',
          activeValue: place,
          renameCall: (value) => `renamePlace('${escapeJs(room)}','${escapeJs(value)}')`,
          deleteCall: (value) => `deletePlace('${escapeJs(room)}','${escapeJs(value)}')`,
          emptyText: 'Inga platser matchar sökningen.'
        }) : `<div class="manageEmpty">Skapa ett rum först.</div>`}
      </section>

      <section class="manageSection">
        <div class="manageHeaderRow">
          <div class="manageTitleBlock">
            <div class="manageTitleLine"><h3 class="manageBigTitle">Lådor / Hyllplan i ${escapeHtml(room || 'valt rum')}</h3></div>
            ${room && allPlaces.length ? `<div class="manageMiniTabs">${allPlaces.map(p => `<button class="manageMiniTab ${place===p ? 'active' : ''}" onclick="setManagePlace('${escapeJs(p)}')">${escapeHtml(p)}</button>`).join('')}</div>` : ``}
            <div class="manageInputRow">
              <input id="manage-new-drawer" placeholder="Ny låda / hyllplan${place ? ' i ' + escapeHtml(place) : ''}">
              <button class="btn primary" onclick="addCurrentDrawer()">Lägg till</button>
            </div>
          </div>
          <div class="manageSearchWrap"><input class="manageSearchInput" placeholder="Sök Bar" value="${escapeHtml(ui.drawerSearch)}" oninput="updateManageUi('drawerSearch', this.value)"></div>
        </div>
        ${room && place ? renderManageEntityChips(drawerValues, {
          rowId: 'manage-drawers-row',
          renameCall: (value) => `renameDrawer('${escapeJs(room)}','${escapeJs(place)}','${escapeJs(value)}')`,
          deleteCall: (value) => `deleteDrawer('${escapeJs(room)}','${escapeJs(place)}','${escapeJs(value)}')`,
          emptyText: 'Inga lådor eller hyllplan matchar sökningen.'
        }) : `<div class="manageEmpty">Välj först rum och plats.</div>`}
        <div class="manageHint">Valt rum: <strong>${escapeHtml(room || '—')}</strong>${place ? ` • Vald plats: <strong>${escapeHtml(place)}</strong>` : ''}</div>
      </section>
    </div>
  `;
}

function renderManageAddSection(){
  const templates = [...state.templates].sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'sv'));
  return `
    <div class="manageSplitGrid">
      <section class="manageSection" id="newTemplateForm">
        <div class="manageTitleLine"><h3 class="manageBigTitle">Spara mall</h3></div>
        <div class="addGrid" style="grid-template-columns:1fr; margin-top:12px;">
          <input id="new-name" placeholder="Namn">
          <select id="new-mode" onchange="toggleNewModeFields()">
            <option value="normal">Vanlig vara</option>
            <option value="package">Paket + fast mått</option>
          </select>
          <div id="new-normal-wrap"><input id="new-qty" type="number" min="0" step="1" value="1" placeholder="Antal"></div>
          <input id="new-img" placeholder="Bild .webp eller bildlänk">
          <select id="new-category"><option value="">Välj rum först</option></select>
          <select id="new-room" onchange="refreshNewTemplateCategoryOptions(); refreshNewTemplatePlaceOptions()">
            <option value="">Välj rum</option>
            ${state.rooms.map(r=>`<option>${escapeHtml(r)}</option>`).join("")}
          </select>
          <select id="new-place" onchange="refreshNewTemplateDrawerOptions()"><option value="">Välj plats</option></select>
          <select id="new-drawer"><option value="">Välj låda / hyllplan</option></select>
          <select id="new-unit">${units.map(u=>`<option value="${u}">${u}</option>`).join("")}</select>
          <div id="new-package-wrap"><input id="new-package-count" type="number" min="0" step="0.01" value="1" placeholder="Antal paket, t.ex. 2">
          <input id="new-fixed-amount" type="number" min="0" step="0.01" value="1" placeholder="Fast mått per paket, t.ex. 500"></div>
          <input id="new-note" placeholder="Anteckning">
          <button class="btn primary" onclick="createTemplate()">Spara mall</button>
        </div>
        <div class="footerNote">Skapa och spara nya mallar direkt inne i Hantera.</div>
      </section>

      <section class="manageSection">
        <div class="manageTitleLine"><h3 class="manageBigTitle">Mallar</h3></div>
        <div class="templateTools" style="margin-top:12px">
          ${templates.length ? templates.map(t=>`
            <div class="item">
              <div class="thumb" onclick="openImageModal('${escapeJs(t.img || "")}','${escapeJs(t.name)}')">
                ${t.img ? `<img src="${escapeHtml(t.img)}" alt="${escapeHtml(t.name)}">` : `<div class="ph">Ingen bild</div>`}
              </div>
              <div class="itemBody">
                <div class="itemName">${escapeHtml(t.name || 'Namnlös mall')}</div>
                <div class="meta">
                  ${chip(t.category || 'Ingen kategori')}
                  ${chip(t.defaultRoom || 'Inget rum')}
                  ${chip(t.defaultPlace || 'Ingen plats')}
                  ${chip(t.defaultDrawer || 'Ingen låda')}
                </div>
                <div class="small">${(t.mode || 'normal') === 'package' ? `${formatAmount(Number(t.packageCount)||0)} paket × ${formatAmount(Number(t.fixedAmount)||0)} ${escapeHtml(t.unit || '')}` : `${formatAmount(Number(t.qty)||0)} ${escapeHtml(t.unit || '')}`}${t.note ? ' • ' + escapeHtml(t.note) : ''}</div>
                <div class="btnRow" style="margin-top:10px">
                  <button class="btn good" onclick="addTemplateTo('home','${t.id}')">+ Hemmet</button>
                  <button class="btn primary" onclick="addTemplateTo('buy','${t.id}')">+ Köpa lista</button>
                  <button class="btn secondary" onclick="editTemplate('${t.id}')">Ändra</button>
                  <button class="btn danger" onclick="deleteTemplate('${t.id}')">Ta bort</button>
                </div>
              </div>
            </div>
          `).join('') : `<div class="empty">Inga mallar sparade ännu.</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderManageRecipeSection(){
  const filter = state.filters.recipes || {search:"", category:"Alla Recept Kategori"};
  const recipes = (state.recipes || []).filter(recipe=>{
    const q = (filter.search || '').trim().toLowerCase();
    const matchSearch = !q || [recipe.name].join(' ').toLowerCase().includes(q);
    const matchCategory = filter.category === 'Alla Recept Kategori' || recipe.category === filter.category;
    return matchSearch && matchCategory;
  });

  return `
    <div class="manageBoard">
      <section class="manageSection">
        <div class="manageTitleLine"><h3 class="manageBigTitle">Ny Recept Kategori</h3></div>
        <div class="manageInputRow" style="margin-top:12px">
          <input id="new-recipe-category" placeholder="Ny Recept Kategori">
          <button class="btn primary" onclick="addRecipeCategory()">Lägg till Kategori</button>
        </div>
      </section>

      <section class="manageSection">
        <div class="manageTitleLine"><h3 class="manageBigTitle">Lägg till Recept</h3></div>
        <div class="toolbar" style="margin-top:12px">
          <input id="new-recipe-name" placeholder="Receptnamn t.ex. Tacos">
          <input id="new-recipe-link" placeholder="Länk till Recept">
        </div>
        <div class="toolbar">
          <select id="new-recipe-category-select">
            ${state.recipeCategories.map(cat => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('')}
          </select>
          <div class="recipeSearchInputWrap">
            <input id="new-recipe-template-search" placeholder="Lägg till ingredienser från Lägg till" autocomplete="off"
              oninput="handleTemplateSearchInput('new-recipe-template-search','new-recipe-template-select','new-recipe-template-suggest')"
              onfocus="handleTemplateSearchFocus('new-recipe-template-search','new-recipe-template-select','new-recipe-template-suggest')">
            <input id="new-recipe-template-select" type="hidden">
            <div id="new-recipe-template-suggest"></div>
          </div>
          <input id="new-recipe-ingredient-amount" type="number" min="0" step="0.01" placeholder="Hur mycket">
          <select id="new-recipe-ingredient-unit">${units.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
          <button class="btn good" onclick="addIngredientToDraftRecipe()">Lägg till ingrediens</button>
        </div>
        <div class="btnRow" style="margin-bottom:10px">
          <button class="btn primary" onclick="saveRecipe()">Spara Recept</button>
        </div>
        <div id="draft-recipe-ingredients">${renderDraftRecipeIngredients()}</div>
        <div class="footerNote">Recept hämtar ingredienser från Lägg till-mallarna.</div>
      </section>

      <section class="manageSection">
        <div class="toolbar">
          <div class="recipeSearchInputWrap">
            <input id="recipe-search-input" placeholder="Sök Recept" autocomplete="off" value="${escapeHtml(filter.search || '')}" oninput="handleRecipeSearchInput(this.value)" onfocus="handleRecipeSearchFocus()">
            <div id="recipe-search-suggest"></div>
          </div>
          <select onchange="updateRecipeFilter('category',this.value)">
            <option ${filter.category==='Alla Recept Kategori' ? 'selected' : ''}>Alla Recept Kategori</option>
            ${state.recipeCategories.map(cat => `<option value="${escapeHtml(cat)}" ${filter.category===cat ? 'selected' : ''}>${escapeHtml(cat)}</option>`).join('')}
          </select>
        </div>
        <div class="manageSplitGrid" style="margin-top:12px">
          <div class="section">
            <h3 class="sectionTitle">Receptkategorier</h3>
            <div class="entityList">
              ${state.recipeCategories.map(cat => `
                <div class="entity">
                  <span>${escapeHtml(cat)}</span>
                  <div class="btnRow">
                    <button class="btn secondary" onclick="renameRecipeCategory('${escapeJs(cat)}')">Ändra namn</button>
                    <button class="btn danger" onclick="deleteRecipeCategory('${escapeJs(cat)}')">Ta bort</button>
                  </div>
                </div>
              `).join('') || `<div class="empty">Inga receptkategorier ännu.</div>`}
            </div>
          </div>
          <div class="section">
            <h3 class="sectionTitle">Recept</h3>
            ${recipes.length ? `<div class="templateTools">${recipes.map(recipe => renderRecipeCard(recipe)).join('')}</div>` : `<div class="empty">Inga recept ännu.</div>`}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderManage(){
  const root = document.getElementById("page-manage");
  const ui = getManageUi();
  const section = ui.section || 'home';

  let content = '';
  if(section === 'add') content = renderManageAddSection();
  else if(section === 'recipes') content = renderManageRecipeSection();
  else content = renderManageHomeSection(ui);

  root.innerHTML = `
    <div class="managePageHeader section">
      <h2 class="sectionTitle">Hantera</h2>
      <div class="footerNote">Hantera har nu egna undersidor för Hemmet, Lägg till och Recept.</div>
    </div>

    <div class="manageSubnav">
      <button class="manageSubnavBtn ${section==='home' ? 'active' : ''}" onclick="setManageSection('home')">Hemmet</button>
      <button class="manageSubnavBtn ${section==='add' ? 'active' : ''}" onclick="setManageSection('add')">Lägg till</button>
      <button class="manageSubnavBtn ${section==='recipes' ? 'active' : ''}" onclick="setManageSection('recipes')">Recept</button>
    </div>

    ${content}
  `;

  if(section === 'add'){
    refreshNewTemplateCategoryOptions(true);
    refreshNewTemplatePlaceOptions(true);
    refreshNewTemplateDrawerOptions(true);
    toggleNewModeFields();
  }
}

function setManageSection(section){
  const ui = getManageUi();
  ui.section = section;
  saveState();
  renderManage();
}

function scrollManageRow(id, amount){
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollBy({ left: amount, behavior: 'smooth' });
}
function updateManageUi(field, value){
  const ui = getManageUi();
  ui[field] = value;
  saveState();
  renderManage();
}
function setManagePlace(place){
  const ui = getManageUi();
  ui.currentPlace = place;
  saveState();
  renderManage();
}
function addCurrentDrawer(){
  const room = state.currentManageRoom;
  const place = getManageUi().currentPlace;
  if(!room || room === 'Alla rum' || !place){
    alert('Välj rum och plats först.');
    return;
  }
  addDrawer(room, place, 'manage-new-drawer');
}
function slug(str){
  return String(str).toLowerCase().replace(/[^a-z0-9åäö]+/gi,"-");
}
function updateFilter(type, field, value){
  state.filters[type][field] = value;
  if(field === "room"){
    if(type === "home" || type === "buy"){
      state.filters[type].place = "Alla platser";
      state.filters[type].drawer = "Alla lådor/hyllplan";
    }
    if(type === "add"){
      state.filters[type].place = "Alla platser";
    }
  }
  if(field === "place" && (type === "home" || type === "buy")){
    state.filters[type].drawer = "Alla lådor/hyllplan";
  }
  saveState();
  render();
}

function createTemplate(){
  const name = document.getElementById("new-name").value.trim();
  const mode = document.getElementById("new-mode") ? document.getElementById("new-mode").value : "normal";
  const qty = Number(document.getElementById("new-qty").value || 0);
  const img = document.getElementById("new-img").value.trim();
  const category = document.getElementById("new-category").value;
  const defaultRoom = document.getElementById("new-room").value;
  const defaultPlace = document.getElementById("new-place").value;
  const defaultDrawer = document.getElementById("new-drawer").value;
  const unit = document.getElementById("new-unit") ? document.getElementById("new-unit").value : "";
  const packageCount = Number(document.getElementById("new-package-count") ? document.getElementById("new-package-count").value : 1) || 1;
  const fixedAmount = Number(document.getElementById("new-fixed-amount") ? document.getElementById("new-fixed-amount").value : 1) || 1;
  const note = document.getElementById("new-note").value.trim();

  if(!name){
    alert("Skriv namn först.");
    return;
  }
  if(defaultRoom && category){
    ensureCategoriesForRoom(defaultRoom);
    if(state.categoriesByRoom[defaultRoom].indexOf(category) === -1){
      state.categoriesByRoom[defaultRoom].push(category);
    }
    syncLegacyCategoriesArray();
  }
  state.templates.unshift({
    id: uid(),
    name,
    qty,
    mode,
    img,
    category,
    defaultRoom,
    defaultPlace,
    defaultDrawer,
    unit,
    packageCount: mode === "package" ? packageCount : qty,
    fixedAmount: mode === "package" ? fixedAmount : 1,
    note
  });
  saveState();
  render();
  clearTemplateForm();
}
function clearTemplateForm(){
  document.getElementById("new-name").value = "";
  if(document.getElementById("new-mode")) document.getElementById("new-mode").value = "normal";
  document.getElementById("new-qty").value = "1";
  document.getElementById("new-img").value = "";
  document.getElementById("new-room").value = "";
  document.getElementById("new-category").innerHTML = `<option value="">Välj rum först</option>`;
  document.getElementById("new-place").innerHTML = `<option value="">Välj plats</option>`;
  document.getElementById("new-drawer").innerHTML = `<option value="">Välj låda / hyllplan</option>`;
  if(document.getElementById("new-unit")) document.getElementById("new-unit").selectedIndex = 0;
  if(document.getElementById("new-package-count")) document.getElementById("new-package-count").value = "1";
  if(document.getElementById("new-fixed-amount")) document.getElementById("new-fixed-amount").value = "1";
  document.getElementById("new-note").value = "";
  toggleNewModeFields();
}
function scrollToForm(){
  const el = document.getElementById("newTemplateForm");
  if(el) el.scrollIntoView({behavior:"smooth", block:"start"});
}
function refreshNewTemplateCategoryOptions(keep=false){
  var roomEl = document.getElementById("new-room");
  var categoryEl = document.getElementById("new-category");
  if(!roomEl || !categoryEl) return;
  var room = roomEl.value;
  var old = keep ? categoryEl.value : "";
  var categories = room ? getCategories(room, true) : [];
  var placeholder = room ? "Välj kategori" : "Välj rum först";
  categoryEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + categories.map(function(c){
    return `<option value="${escapeHtml(c)}" ${old===c?'selected':''}>${escapeHtml(c)}</option>`;
  }).join("");
}
function refreshNewTemplatePlaceOptions(keep=false){
  const roomEl = document.getElementById("new-room");
  const placeEl = document.getElementById("new-place");
  if(!roomEl || !placeEl) return;
  const room = roomEl.value;
  const old = keep ? placeEl.value : "";
  const places = room ? getPlaces(room) : [];
  placeEl.innerHTML = `<option value="">Välj plats</option>` + places.map(p=>`<option ${old===p?'selected':''}>${escapeHtml(p)}</option>`).join("");
  refreshNewTemplateDrawerOptions(keep);
}
function refreshNewTemplateDrawerOptions(keep=false){
  const roomEl = document.getElementById("new-room");
  const placeEl = document.getElementById("new-place");
  const drawerEl = document.getElementById("new-drawer");
  if(!roomEl || !placeEl || !drawerEl) return;
  const room = roomEl.value;
  const place = placeEl.value;
  const old = keep ? drawerEl.value : "";
  const drawers = (room && place) ? getDrawers(room, place) : [];
  drawerEl.innerHTML = `<option value="">Välj låda / hyllplan</option>` + drawers.map(d=>`<option ${old===d?'selected':''}>${escapeHtml(d)}</option>`).join("");
}
function addTemplateTo(target, templateId){
  const t = state.templates.find(x=>x.id===templateId);
  if(!t) return;

  const list = target === "home" ? state.homeItems : state.buyItems;
  const isPackage = (t.mode || "normal") === "package";

  let existing;
  if(target === "buy"){
    existing = list.find(item =>
      item.templateId === t.id &&
      !item.isRest &&
      (item.mode || "normal") === (t.mode || "normal") &&
      (item.unit || "") === (t.unit || "") &&
      (Number(item.fixedAmount || 1) || 1) === (isPackage ? (Number(t.fixedAmount || 1) || 1) : 1)
    );
  }else{
    existing = list.find(item =>
      item.templateId === t.id &&
      !item.isRest &&
      (item.mode || "normal") === (t.mode || "normal") &&
      (item.unit || "") === (t.unit || "") &&
      (item.room || "") === (t.defaultRoom || "") &&
      (item.place || "") === (t.defaultPlace || "") &&
      (item.drawer || "") === (t.defaultDrawer || "") &&
      (Number(item.fixedAmount || 1) || 1) === (isPackage ? (Number(t.fixedAmount || 1) || 1) : 1)
    );
  }

  if(existing){
    if(isPackage){
      existing.packageCount = (Number(existing.packageCount || existing.qty || 0) || 0) + 1;
      existing.qty = existing.packageCount;
      existing.fixedAmount = Number(t.fixedAmount || 1) || 1;
    }else{
      existing.qty = (Number(existing.qty || 0) || 0) + 1;
      existing.packageCount = existing.qty;
    }
  }else{
    const newItem = {
      id: uid(),
      templateId: t.id,
      name: t.name,
      qty: 1,
      mode: t.mode || "normal",
      packageCount: 1,
      fixedAmount: isPackage ? (Number(t.fixedAmount || 1) || 1) : 1,
      img: t.img || "",
      category: t.category || "",
      room: t.defaultRoom || "",
      place: t.defaultPlace || "",
      drawer: t.defaultDrawer || "",
      unit: t.unit || "",
      note: t.note || "",

    };
    list.unshift(newItem);
  }

  saveState();
  render();
}
function editTemplate(templateId){
  const t = state.templates.find(x=>x.id===templateId);
  if(!t) return;
  currentEdit = {type:"template", id:templateId};
  document.getElementById("itemModalTitle").textContent = "Ändra mall";
  fillEditForm({
    name:t.name,
    qty:t.qty,
    room:t.defaultRoom,
    place:t.defaultPlace,
    drawer:t.defaultDrawer,
    category:t.category,
    unit:t.unit,
    img:t.img,
    note:t.note,
    mode:t.mode || "normal",
    packageCount:Number(t.packageCount || t.qty || 0) || 0,
    fixedAmount:Number(t.fixedAmount || 1) || 1
  });
  document.getElementById("itemModalWrap").classList.add("show");
}
function deleteTemplate(templateId){
  if(!confirm("Ta bort denna mall?")) return;
  state.templates = state.templates.filter(x=>x.id!==templateId);
  saveState();
  render();
}
function changeQty(listType, itemId, delta){
  const list = listType === "home" ? state.homeItems : state.buyItems;
  const item = list.find(x=>x.id===itemId);
  if(!item) return;

  const mode = item.mode || "normal";

  if(mode === "package"){
    // Öka/minska antal paket
    item.packageCount = Math.max(0, (Number(item.packageCount)||0) + delta);
    item.qty = item.packageCount; // håll sync
  }else{
    // Vanlig vara
    item.qty = Math.max(0, (Number(item.qty)||0) + delta);
    item.packageCount = item.qty;
  }

  if((Number(item.qty)||0) === 0 && listType === "home"){
    const shouldMove = confirm("Antal är nu 0. Flytta varan till Köpa lista?");
    if(shouldMove){
      moveItem("home", itemId);
      return;
    }
  }

  saveState();
  render();
}
function removeItem(listType, itemId){
  if(!confirm("Ta bort denna vara?")) return;
  if(listType === "home") state.homeItems = state.homeItems.filter(x=>x.id!==itemId);
  else state.buyItems = state.buyItems.filter(x=>x.id!==itemId);
  saveState();
  render();
}

function moveItem(listType, itemId){
  const fromHome = listType === "home";
  const fromList = fromHome ? state.homeItems : state.buyItems;
  const toList = fromHome ? state.buyItems : state.homeItems;

  const idx = fromList.findIndex(x => x.id === itemId);
  if(idx === -1) return;

  const item = fromList[idx];
  if(fromHome && item.isRest){
    alert("Restpaket ska stanna i Hemmet och kan inte läggas till i Köpa lista.");
    return;
  }
  const mode = item.mode || "normal";
  const template = item.templateId ? getTemplateById(item.templateId) : null;
  const templateFixedAmount = Number(template?.fixedAmount || item.fixedAmount || 1) || 1;

  let movedItem = null;

  if(mode === "package"){
    const maxPackages = Number(item.packageCount || item.qty || 0) || 0;
    if(maxPackages <= 0) return;

    item.packageCount = maxPackages - 1;
    item.qty = item.packageCount;

    movedItem = {
      ...item,
      id: uid(),
      qty: 1,
      packageCount: 1,
      fixedAmount: templateFixedAmount,
      mode: "package",
      isRest: false
    };
  }else{
    const maxQty = Number(item.qty) || 0;
    if(maxQty <= 0) return;

    item.qty = Number((maxQty - 1).toFixed(2));
    item.packageCount = item.qty;

    movedItem = {
      ...item,
      id: uid(),
      qty: 1,
      packageCount: 1,
      mode: "normal",
      isRest: false
    };
  }

  if((Number(item.qty) || 0) <= 0){
    fromList.splice(idx, 1);
  }

  let existing = null;

  if((movedItem.mode || "normal") === "package"){
    existing = toList.find(x =>
      x.templateId === movedItem.templateId &&
      (x.mode || "normal") === "package" &&
      Number(x.fixedAmount || templateFixedAmount || 1) === templateFixedAmount &&
      (!template || (
        x.room === (template.defaultRoom || movedItem.room || "") &&
        x.place === (template.defaultPlace || movedItem.place || "") &&
        x.drawer === (template.defaultDrawer || movedItem.drawer || "")
      ))
    );
  }else{
    existing = toList.find(x =>
      x.templateId === movedItem.templateId &&
      (x.room || "") === (movedItem.room || "") &&
      (x.place || "") === (movedItem.place || "") &&
      (x.drawer || "") === (movedItem.drawer || "") &&
      (x.mode || "normal") === "normal"
    );
  }

  if(existing){
    existing.qty = Number(((Number(existing.qty) || 0) + 1).toFixed(2));
    if((existing.mode || "normal") === "package"){
      existing.packageCount = Number(((Number(existing.packageCount || existing.qty || 0) || 0) + 1).toFixed(2));
      existing.fixedAmount = templateFixedAmount;
    }else{
      existing.packageCount = existing.qty;
    }
  }else{
    if(template){
      movedItem.name = template.name;
      movedItem.img = template.img || movedItem.img || "";
      movedItem.category = template.category || movedItem.category || "";
      movedItem.unit = template.unit || movedItem.unit || "";
      movedItem.room = template.defaultRoom || movedItem.room || "";
      movedItem.place = template.defaultPlace || movedItem.place || "";
      movedItem.drawer = template.defaultDrawer || movedItem.drawer || "";
      if((movedItem.mode || "normal") === "package"){
        movedItem.fixedAmount = templateFixedAmount;
      }
    }
    toList.unshift(movedItem);
  }

  saveState();
  render();
}
function openItemModal(listType, itemId){
  currentEdit = {type:listType, id:itemId};
  const list = listType === "home" ? state.homeItems : state.buyItems;
  const item = list.find(x=>x.id===itemId);
  if(!item) return;
  document.getElementById("itemModalTitle").textContent = "Ändra vara";
  fillEditForm(item);
  document.getElementById("itemModalWrap").classList.add("show");
}
function fillEditForm(item){
  document.getElementById("edit-name").value = item.name || "";
  document.getElementById("edit-qty").value = Number(item.qty)||0;
  fillSelect("edit-room", state.rooms, item.room || "");
  fillSelect("edit-category", getCategories(item.room || "", true), item.category || "", "Välj kategori");
  fillSelect("edit-unit", units, item.unit || "");
  if(document.getElementById("edit-mode")) document.getElementById("edit-mode").value = item.mode || "normal";
  fillSelect("edit-place", getPlaces(item.room || ""), item.place || "", "Ingen plats");
  fillSelect("edit-drawer", getDrawers(item.room || "", item.place || ""), item.drawer || "", "Ingen låda");
  document.getElementById("edit-img").value = item.img || "";
  document.getElementById("edit-note").value = item.note || "";
  if(document.getElementById("edit-package-count")) document.getElementById("edit-package-count").value = Number(item.packageCount || item.qty || 0) || 0;
  if(document.getElementById("edit-fixed-amount")) document.getElementById("edit-fixed-amount").value = Number(item.fixedAmount || 1) || 1;
  toggleEditModeFields();

  document.getElementById("edit-room").onchange = () => {
    const room = document.getElementById("edit-room").value;
    fillSelect("edit-category", getCategories(room, true), "", "Välj kategori");
    fillSelect("edit-place", getPlaces(room), "", "Ingen plats");
    fillSelect("edit-drawer", [], "", "Ingen låda");
  };
  document.getElementById("edit-place").onchange = () => {
    const room = document.getElementById("edit-room").value;
    const place = document.getElementById("edit-place").value;
    fillSelect("edit-drawer", getDrawers(room,place), "", "Ingen låda");
  };
}
function fillSelect(id, values, selectedValue, firstLabel="Välj"){
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(v=>`<option value="${escapeHtml(v)}" ${selectedValue===v?'selected':''}>${escapeHtml(v)}</option>`).join("");
}
function closeItemModal(){
  document.getElementById("itemModalWrap").classList.remove("show");
  currentEdit = null;
}
function syncTemplateToItems(templateId){
  if(!templateId) return;
  const template = state.templates.find(t => t.id === templateId);
  if(!template) return;

  [...state.homeItems, ...state.buyItems].forEach(entry=>{
    if(entry.templateId === templateId){
      const prevQty = Number(entry.qty || 0) || 0;
      const prevPackageCount = Number(entry.packageCount || 0) || 0;
      const prevFixedAmount = Number(entry.fixedAmount || 0) || 0;
      entry.name = template.name;
      entry.img = template.img || "";
      entry.room = template.defaultRoom || "";
      entry.place = template.defaultPlace || "";
      entry.drawer = template.defaultDrawer || "";
      entry.category = template.category || "";
      entry.unit = template.unit || "";
      entry.mode = template.mode || "normal";

      if(entry.isRest){
        entry.mode = "package";
        entry.qty = 1;
        entry.packageCount = 1;
        entry.fixedAmount = prevFixedAmount;
      }else if(entry.mode === "package"){
        entry.packageCount = prevPackageCount;
        entry.qty = prevQty;
        entry.fixedAmount = Number(template.fixedAmount || prevFixedAmount || 1) || 1;
      }else{
        entry.qty = prevQty;
        entry.packageCount = prevQty;
        entry.fixedAmount = 1;
      }
    }
  });
}

function syncAllItemsFromTemplates(){
  [...state.homeItems, ...state.buyItems].forEach(entry=>{
    if(entry.templateId){
      const template = state.templates.find(t => t.id === entry.templateId);
      if(template){
        const prevQty = Number(entry.qty || 0) || 0;
        const prevPackageCount = Number(entry.packageCount || 0) || 0;
        const prevFixedAmount = Number(entry.fixedAmount || 0) || 0;
        entry.name = template.name;
        entry.img = template.img || "";
        entry.room = template.defaultRoom || "";
        entry.place = template.defaultPlace || "";
        entry.drawer = template.defaultDrawer || "";
        entry.category = template.category || "";
        entry.unit = template.unit || "";

        if(entry.isRest){
          entry.mode = "package";
          entry.qty = 1;
          entry.packageCount = 1;
          entry.fixedAmount = prevFixedAmount;
        }else{
          entry.mode = template.mode || "normal";
          entry.packageCount = entry.mode === "package" ? prevPackageCount : prevQty;
          entry.fixedAmount = entry.mode === "package"
            ? (Number(template.fixedAmount || prevFixedAmount || 1) || 1)
            : 1;
          entry.qty = prevQty;
        }
      }
    }
  });
}

function migrateItemsToTemplateIds(){
  [...state.homeItems, ...state.buyItems].forEach(entry=>{
    if(!entry.templateId && entry.name){
      const match = state.templates.find(t => t.name === entry.name);
      if(match){
        entry.templateId = match.id;
      }
    }
  });
}

function saveItemModal(){
  if(!currentEdit) return;
  const payload = {
    name: document.getElementById("edit-name").value.trim(),
    qty: Math.max(0, Number(document.getElementById("edit-qty").value || 0)),
    room: document.getElementById("edit-room").value,
    place: document.getElementById("edit-place").value,
    drawer: document.getElementById("edit-drawer").value,
    category: document.getElementById("edit-category").value,
    img: document.getElementById("edit-img").value.trim(),
    note: document.getElementById("edit-note").value.trim(),
    unit: document.getElementById("edit-unit") ? document.getElementById("edit-unit").value : "",
    mode: document.getElementById("edit-mode") ? document.getElementById("edit-mode").value : "normal",
    packageCount: Number(document.getElementById("edit-package-count") ? document.getElementById("edit-package-count").value : 0) || 0,
    fixedAmount: Number(document.getElementById("edit-fixed-amount") ? document.getElementById("edit-fixed-amount").value : 1) || 1
  };
  if(!payload.name){
    alert("Namn behövs.");
    return;
  }

  if(payload.room && payload.category){
    ensureCategoriesForRoom(payload.room);
    if(state.categoriesByRoom[payload.room].indexOf(payload.category) === -1){
      state.categoriesByRoom[payload.room].push(payload.category);
    }
    syncLegacyCategoriesArray();
  }

  if(currentEdit.type === "template"){
    const t = state.templates.find(x=>x.id===currentEdit.id);
    if(!t) return;

    t.name = payload.name;
    t.qty = payload.qty;
    t.defaultRoom = payload.room;
    t.defaultPlace = payload.place;
    t.defaultDrawer = payload.drawer;
    t.category = payload.category;
    t.unit = payload.unit;
    t.img = payload.img;
    t.note = payload.note;
    t.mode = payload.mode;
    t.packageCount = payload.mode === "package" ? payload.packageCount : payload.qty;
    t.fixedAmount = payload.mode === "package" ? payload.fixedAmount : 1;

    syncTemplateToItems(t.id);
  }else{
    const list = currentEdit.type === "home" ? state.homeItems : state.buyItems;
    const item = list.find(x=>x.id===currentEdit.id);
    if(!item) return;

    // lokalt per post
    item.qty = payload.qty;
    item.note = payload.note;

    // kopplad till mall via ID
    if(item.templateId){
      const t = state.templates.find(x=>x.id===item.templateId);
      if(t){
        t.name = payload.name;
        t.defaultRoom = payload.room;
        t.defaultPlace = payload.place;
        t.defaultDrawer = payload.drawer;
        t.category = payload.category;
        t.unit = payload.unit;
        t.img = payload.img;
        t.mode = payload.mode;
        t.packageCount = payload.mode === "package" ? payload.packageCount : payload.qty;
        t.fixedAmount = payload.mode === "package" ? payload.fixedAmount : 1;
        syncTemplateToItems(t.id);
      }else{
        // fallback om ingen mall finns
        item.name = payload.name;
        item.room = payload.room;
        item.place = payload.place;
        item.drawer = payload.drawer;
        item.category = payload.category;
        item.unit = payload.unit;
        item.img = payload.img;
        item.mode = payload.mode;
        item.packageCount = payload.mode === "package" ? payload.packageCount : payload.qty;
        item.fixedAmount = payload.mode === "package" ? payload.fixedAmount : 1;
      }
    }else{
      // fristående post utan mallkoppling
      item.name = payload.name;
      item.room = payload.room;
      item.place = payload.place;
      item.drawer = payload.drawer;
      item.category = payload.category;
      item.unit = payload.unit;
      item.img = payload.img;
      item.mode = payload.mode;
      item.packageCount = payload.mode === "package" ? payload.packageCount : payload.qty;
      item.fixedAmount = payload.mode === "package" ? payload.fixedAmount : 1;
    }
  }

  saveState();
  closeItemModal();
  render();
}
function moveCurrentItem(){
  if(!currentEdit || currentEdit.type === "template") return;
  moveItem(currentEdit.type, currentEdit.id);
  closeItemModal();
}
function deleteCurrentItem(){
  if(!currentEdit) return;
  if(currentEdit.type === "template"){
    deleteTemplate(currentEdit.id);
  }else{
    removeItem(currentEdit.type, currentEdit.id);
  }
  closeItemModal();
}
let zoomLevel = 1;
let panX = 0;
let panY = 0;
let isDraggingImage = false;
let dragStartX = 0;
let dragStartY = 0;

function updateImageZoomUI(){
  const img = document.getElementById("zoomImg");
  const badge = document.getElementById("zoomPercent");
  if(badge) badge.textContent = Math.round(zoomLevel * 100) + "%";
  if(img){
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    img.style.cursor = zoomLevel > 1 ? (isDraggingImage ? "grabbing" : "grab") : "zoom-in";
  }
}

function clampImagePan(){
  if(zoomLevel <= 1){
    panX = 0;
    panY = 0;
  }
}

function setImageZoom(newZoom){
  zoomLevel = Math.min(6, Math.max(1, newZoom));
  clampImagePan();
  updateImageZoomUI();
}

function zoomInImage(){
  setImageZoom(zoomLevel + 0.25);
}

function zoomOutImage(){
  setImageZoom(zoomLevel - 0.25);
}

function resetImageZoom(){
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isDraggingImage = false;
  updateImageZoomUI();
}

function startImageDrag(clientX, clientY){
  if(zoomLevel <= 1) return;
  isDraggingImage = true;
  dragStartX = clientX - panX;
  dragStartY = clientY - panY;
  updateImageZoomUI();
}

function moveImageDrag(clientX, clientY){
  if(!isDraggingImage) return;
  panX = clientX - dragStartX;
  panY = clientY - dragStartY;
  updateImageZoomUI();
}

function endImageDrag(){
  if(!isDraggingImage) return;
  isDraggingImage = false;
  updateImageZoomUI();
}

function attachImageZoomHandlers(img){
  if(!img) return;

  img.addEventListener("wheel", (e) => {
    e.preventDefault();
    const next = e.deltaY < 0 ? zoomLevel + 0.2 : zoomLevel - 0.2;
    setImageZoom(next);
  }, { passive:false });

  img.addEventListener("dblclick", () => {
    if(zoomLevel === 1){
      setImageZoom(2);
    }else{
      resetImageZoom();
    }
  });

  img.addEventListener("mousedown", (e) => {
    e.preventDefault();
    startImageDrag(e.clientX, e.clientY);
  });

  img.addEventListener("touchstart", (e) => {
    if(e.touches.length === 1){
      const t = e.touches[0];
      startImageDrag(t.clientX, t.clientY);
    }
  }, { passive:true });

  img.addEventListener("touchmove", (e) => {
    if(e.touches.length === 1 && isDraggingImage){
      const t = e.touches[0];
      moveImageDrag(t.clientX, t.clientY);
    }
  }, { passive:true });

  img.addEventListener("touchend", () => endImageDrag());

  window.addEventListener("mousemove", handleGlobalImageMouseMove);
  window.addEventListener("mouseup", handleGlobalImageMouseUp);
}

function handleGlobalImageMouseMove(e){
  moveImageDrag(e.clientX, e.clientY);
}

function handleGlobalImageMouseUp(){
  endImageDrag();
}

function detachImageZoomHandlers(){
  window.removeEventListener("mousemove", handleGlobalImageMouseMove);
  window.removeEventListener("mouseup", handleGlobalImageMouseUp);
}

function openImageModal(src, title){
  const wrap = document.getElementById("imageModalWrap");
  const box = document.getElementById("imageZoomBox");
  if(!wrap || !box) return;

  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isDraggingImage = false;

  box.innerHTML = src
    ? `<img id="zoomImg" src="${escapeHtml(src)}" alt="${escapeHtml(title || "Bild")}">`
    : `<div class="ph">Ingen bild</div>`;

  wrap.classList.add("show");

  const img = document.getElementById("zoomImg");
  attachImageZoomHandlers(img);
  updateImageZoomUI();
}

function closeImageModal(){
  const wrap = document.getElementById("imageModalWrap");
  const box = document.getElementById("imageZoomBox");
  detachImageZoomHandlers();
  if(wrap) wrap.classList.remove("show");
  if(box) box.innerHTML = "";
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  isDraggingImage = false;
}
function escapeJs(str){
  return String(str ?? "").replaceAll("\\","\\\\").replaceAll("'","\\'");
}
function setManageRoom(room){
  if(room && room !== "Alla rum") ensureCategoriesForRoom(room);
  state.currentManageRoom = room;
  const ui = getManageUi();
  const places = getPlaces(room);
  ui.currentPlace = places[0] || "";
  saveState();
  renderManage();
}
function addRoom(){
  const input = document.getElementById("manage-new-room");
  const value = input.value.trim();
  if(!value) return;
  if(state.rooms.includes(value)){ alert("Rummet finns redan."); return; }
  state.rooms.push(value);
  state.placesByRoom[value] = [];
  ensureCategoriesForRoom(value);
  state.currentManageRoom = value;
  const ui = getManageUi();
  ui.currentPlace = "";
  input.value = "";
  saveState();
  render();
}
function renameRoom(oldName){
  const value = prompt("Nytt namn på rum:", oldName);
  if(!value || value.trim()===oldName) return;
  const newName = value.trim();
  if(state.rooms.includes(newName)){ alert("Det namnet finns redan."); return; }
  state.rooms = state.rooms.map(r=>r===oldName?newName:r);
  state.placesByRoom[newName] = state.placesByRoom[oldName] || [];
  delete state.placesByRoom[oldName];
  state.categoriesByRoom[newName] = state.categoriesByRoom[oldName] || [];
  delete state.categoriesByRoom[oldName];

  const newDrawers = {};
  Object.entries(state.drawersByRoomPlace).forEach(([key, arr])=>{
    const [room, place] = key.split("||");
    newDrawers[(room===oldName?newName:room)+"||"+place] = arr;
  });
  state.drawersByRoomPlace = newDrawers;

  [...state.homeItems, ...state.buyItems].forEach(item=>{ if(item.room===oldName) item.room = newName; });
  state.templates.forEach(t=>{ if(t.defaultRoom===oldName) t.defaultRoom = newName; });
  if(state.currentManageRoom===oldName) state.currentManageRoom = newName;
  const ui = getManageUi();
  if(ui.currentPlace && !getPlaces(newName).includes(ui.currentPlace)) ui.currentPlace = getPlaces(newName)[0] || "";
  saveState();
  render();
}
function deleteRoom(room){
  if(!confirm(`Ta bort rummet "${room}"? Varor i detta rum behåller tomt rum.`)) return;
  state.rooms = state.rooms.filter(r=>r!==room);
  delete state.placesByRoom[room];
  if(state.categoriesByRoom) delete state.categoriesByRoom[room];
  Object.keys(state.drawersByRoomPlace).forEach(k=>{ if(k.startsWith(room+"||")) delete state.drawersByRoomPlace[k]; });
  [...state.homeItems, ...state.buyItems].forEach(item=>{
    if(item.room===room){ item.room=""; item.place=""; item.drawer=""; }
  });
  state.templates.forEach(t=>{
    if(t.defaultRoom===room){ t.defaultRoom=""; t.defaultPlace=""; t.defaultDrawer=""; }
  });
  state.currentManageRoom = state.rooms[0] || "Alla rum";
  const ui = getManageUi();
  ui.currentPlace = getPlaces(state.currentManageRoom)[0] || "";
  saveState();
  render();
}
function addCategory(){
  var room = state.currentManageRoom && state.currentManageRoom !== "Alla rum" ? state.currentManageRoom : "";
  var input = document.getElementById("manage-new-category");
  var value = input.value.trim();
  if(!room){
    alert("Välj rum först.");
    return;
  }
  if(!value) return;
  ensureCategoriesForRoom(room);
  if(state.categoriesByRoom[room].indexOf(value) !== -1){
    alert("Kategorin finns redan i detta rum.");
    return;
  }
  state.categoriesByRoom[room].push(value);
  syncLegacyCategoriesArray();
  input.value = "";
  saveState();
  render();
}
function renameCategory(oldVal){
  var room = state.currentManageRoom && state.currentManageRoom !== "Alla rum" ? state.currentManageRoom : "";
  if(!room){
    alert("Välj rum först.");
    return;
  }
  var value = prompt("Nytt namn på kategori i " + room + ":", oldVal);
  if(!value || value.trim()===oldVal) return;
  var newVal = value.trim();
  ensureCategoriesForRoom(room);
  if(state.categoriesByRoom[room].indexOf(newVal) !== -1){
    alert("Det namnet finns redan i detta rum.");
    return;
  }
  state.categoriesByRoom[room] = state.categoriesByRoom[room].map(function(c){ return c===oldVal ? newVal : c; });
  [].concat(state.homeItems || [], state.buyItems || []).forEach(function(item){
    if(item.room === room && item.category === oldVal) item.category = newVal;
  });
  (state.templates || []).forEach(function(t){
    if(t.defaultRoom === room && t.category === oldVal) t.category = newVal;
  });
  syncLegacyCategoriesArray();
  saveState();
  render();
}
function deleteCategory(val){
  var room = state.currentManageRoom && state.currentManageRoom !== "Alla rum" ? state.currentManageRoom : "";
  if(!room){
    alert("Välj rum först.");
    return;
  }
  if(!confirm('Ta bort kategori "' + val + '" i ' + room + '?')) return;
  ensureCategoriesForRoom(room);
  state.categoriesByRoom[room] = state.categoriesByRoom[room].filter(function(c){ return c!==val; });
  [].concat(state.homeItems || [], state.buyItems || []).forEach(function(item){
    if(item.room === room && item.category === val) item.category = "";
  });
  (state.templates || []).forEach(function(t){
    if(t.defaultRoom === room && t.category === val) t.category = "";
  });
  syncLegacyCategoriesArray();
  saveState();
  render();
}
function addPlace(){
  const room = state.currentManageRoom;
  const input = document.getElementById("manage-new-place");
  const value = input.value.trim();
  if(!room || !value) return;
  state.placesByRoom[room] ||= [];
  if(state.placesByRoom[room].includes(value)){ alert("Platsen finns redan i detta rum."); return; }
  state.placesByRoom[room].push(value);
  state.drawersByRoomPlace[room+"||"+value] ||= [];
  const ui = getManageUi();
  ui.currentPlace = value;
  input.value = "";
  saveState();
  render();
}
function renamePlace(room, oldPlace){
  const value = prompt("Nytt namn på plats:", oldPlace);
  if(!value || value.trim()===oldPlace) return;
  const newPlace = value.trim();
  if((state.placesByRoom[room]||[]).includes(newPlace)){ alert("Det namnet finns redan i detta rum."); return; }
  state.placesByRoom[room] = (state.placesByRoom[room]||[]).map(p=>p===oldPlace?newPlace:p);
  const oldKey = room+"||"+oldPlace, newKey = room+"||"+newPlace;
  state.drawersByRoomPlace[newKey] = state.drawersByRoomPlace[oldKey] || [];
  delete state.drawersByRoomPlace[oldKey];
  [...state.homeItems,...state.buyItems].forEach(item=>{ if(item.room===room && item.place===oldPlace){ item.place=newPlace; } });
  state.templates.forEach(t=>{ if(t.defaultRoom===room && t.defaultPlace===oldPlace){ t.defaultPlace=newPlace; } });
  const ui = getManageUi();
  if(ui.currentPlace===oldPlace) ui.currentPlace = newPlace;
  saveState();
  render();
}
function deletePlace(room, place){
  if(!confirm(`Ta bort plats "${place}" i ${room}?`)) return;
  state.placesByRoom[room] = (state.placesByRoom[room]||[]).filter(p=>p!==place);
  delete state.drawersByRoomPlace[room+"||"+place];
  [...state.homeItems,...state.buyItems].forEach(item=>{
    if(item.room===room && item.place===place){ item.place=""; item.drawer=""; }
  });
  state.templates.forEach(t=>{
    if(t.defaultRoom===room && t.defaultPlace===place){ t.defaultPlace=""; t.defaultDrawer=""; }
  });
  const ui = getManageUi();
  if(ui.currentPlace===place) ui.currentPlace = (state.placesByRoom[room]||[])[0] || "";
  saveState();
  render();
}
function addDrawer(room, place, inputId){
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  if(!value) return;
  const key = room+"||"+place;
  state.drawersByRoomPlace[key] ||= [];
  if(state.drawersByRoomPlace[key].includes(value)){ alert("Finns redan."); return; }
  state.drawersByRoomPlace[key].push(value);
  input.value = "";
  saveState();
  render();
}
function renameDrawer(room, place, oldVal){
  const value = prompt("Nytt namn på låda / hyllplan:", oldVal);
  if(!value || value.trim()===oldVal) return;
  const newVal = value.trim();
  const key = room+"||"+place;
  if((state.drawersByRoomPlace[key]||[]).includes(newVal)){ alert("Det namnet finns redan här."); return; }
  state.drawersByRoomPlace[key] = (state.drawersByRoomPlace[key]||[]).map(d=>d===oldVal?newVal:d);
  [...state.homeItems,...state.buyItems].forEach(item=>{
    if(item.room===room && item.place===place && item.drawer===oldVal) item.drawer=newVal;
  });
  state.templates.forEach(t=>{
    if(t.defaultRoom===room && t.defaultPlace===place && t.defaultDrawer===oldVal) t.defaultDrawer=newVal;
  });
  saveState();
  render();
}
function deleteDrawer(room, place, val){
  if(!confirm(`Ta bort "${val}"?`)) return;
  const key = room+"||"+place;
  state.drawersByRoomPlace[key] = (state.drawersByRoomPlace[key]||[]).filter(d=>d!==val);
  [...state.homeItems,...state.buyItems].forEach(item=>{
    if(item.room===room && item.place===place && item.drawer===val) item.drawer="";
  });
  state.templates.forEach(t=>{
    if(t.defaultRoom===room && t.defaultPlace===place && t.defaultDrawer===val) t.defaultDrawer="";
  });
  saveState();
  render();
}
function seedDemo(){
  if(state.homeItems.length || state.buyItems.length || state.templates.length) return;
  state.templates = [
    {id:uid(),name:"Mjölk",qty:2,img:"",category:"Mat",unit:"Milliliter",defaultRoom:"Köket",defaultPlace:"Kyl",defaultDrawer:"Hyllplan 1",note:"1L"},
    {id:uid(),name:"Toapapper",qty:8,img:"",category:"Toalett",unit:"Gram",defaultRoom:"Badrummet",defaultPlace:"Skåp",defaultDrawer:"Hyllplan 1",note:""},
    {id:uid(),name:"Salt",qty:1,img:"",category:"Kryddor",unit:"Gram",defaultRoom:"Köket",defaultPlace:"Kryddor",defaultDrawer:"Hyllplan 1",note:""}
  ];
  migrateCategoriesByRoom();
  saveState();
}
function bindPageLinks(){
  const pageLinks = {
    home: "index.html",
    buy: "kopa-lista.html",
    add: "lagg-till.html",
    recipes: "recept.html",
    manage: "hantera.html"
  };
  document.querySelectorAll(".nav [data-page-link]").forEach(el=>{
    el.addEventListener("click", (e)=>{
      const page = el.getAttribute("data-page-link");
      const href = pageLinks[page];
      if(href && !e.metaKey && !e.ctrlKey && !e.shiftKey){
        e.preventDefault();
        window.location.href = href;
      }
    });
  });
}

window.STORAGE_KEY = STORAGE_KEY;
window.defaultState = defaultState;
window.getSerializableState = getSerializableState;
window.replaceAppState = replaceAppState;
window.saveState = saveState;
window.render = render;
window.state = state;

function bootApp(targetPage){
  ensureRealtimeChannel();
  normalizeRestItems();
  migrateItemsToTemplateIds();
  syncAllItemsFromTemplates();
  saveState();
  bindPageLinks();
  const page = targetPage || state.currentPage || "home";
  setActiveNav(page);
  showPage(page);
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
