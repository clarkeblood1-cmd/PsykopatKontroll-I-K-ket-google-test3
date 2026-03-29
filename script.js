let items = JSON.parse(localStorage.getItem('matlista') || '[]');
let quickItems = JSON.parse(localStorage.getItem('matlista_snabb') || '[]');
let recipes = JSON.parse(localStorage.getItem('matlista_recept') || '[]');

let categories = JSON.parse(localStorage.getItem('matlista_categories') || 'null');
if (!Array.isArray(categories) || !categories.length) {
  categories = ['ÖVRIGT'];
}

let recipeCategories = JSON.parse(localStorage.getItem('matlista_recipe_categories') || 'null');
if (!Array.isArray(recipeCategories) || !recipeCategories.length) {
  recipeCategories = ['matlagning', 'bakverk'];
}

let places = JSON.parse(localStorage.getItem('matlista_places') || 'null');
if (!Array.isArray(places) || !places.length) {
  places = [
    { key: 'kyl', label: '🧊 Kyl' },
    { key: 'frys', label: '❄️ Frys' },
    { key: 'kryddor', label: '🌶️ Kryddor' }
  ];
}


let roomConfigs = JSON.parse(localStorage.getItem('matlista_room_configs') || 'null');
const BASE_ROOM_DEFS = [
  { key: 'koket', label: 'KÖKET', defaultCategories: ['ÖVRIGT', 'MAT', 'KÖTTFÄRS', 'BAKINGREDIENSER'], defaultPlaces: [{ key: 'kyl', label: '🧊 Kyl' }, { key: 'frys', label: '❄️ Frys' }, { key: 'kryddor', label: '🌶️ Kryddor' }, { key: 'skafferi', label: '🥫 Skafferi' }] },
  { key: 'badrummet', label: 'BADRUMMET', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🧴 Hylla' }] },
  { key: 'hallen', label: 'HALLEN', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🧺 Hylla' }] },
  { key: 'sovrummet-1', label: 'SOVRUMMET 1', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '🗄️ Hylla' }] }
];
const PROTECTED_ROOM_KEYS = BASE_ROOM_DEFS.map(room => room.key);
const DEPRECATED_ROOM_MIGRATIONS = {
  'sovrummet-2': 'sovrummet-1',
  'sovrummet-3': 'sovrummet-1'
};
let roomDefs = JSON.parse(localStorage.getItem('matlista_rooms') || 'null');
let activeRoom = localStorage.getItem('matlista_active_room') || 'koket';
let activePlaceFilter = localStorage.getItem('matlista_active_place_filter') || '';


function normalizeRoomKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function cleanRoomLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}


function getRoomTheme(roomOrKey = activeRoom) {
  const room = typeof roomOrKey === 'object' && roomOrKey
    ? roomOrKey
    : getAllRoomDefs().find(entry => entry.key === roomOrKey) || null;

  const key = normalizeRoomKey(room?.key || roomOrKey || '');
  const label = cleanRoomLabel(room?.label || room?.key || roomOrKey || '');
  const haystack = `${key} ${label}`.toLowerCase();

  if (haystack.includes('kok') || haystack.includes('kitchen')) {
    return { icon: '🍳', accent: '#22c55e', accentSoft: 'rgba(34,197,94,.18)' };
  }
  if (haystack.includes('badrum') || haystack.includes('toalett') || haystack.includes('dusch') || haystack.includes('bath')) {
    return { icon: '🚿', accent: '#38bdf8', accentSoft: 'rgba(56,189,248,.18)' };
  }
  if (haystack.includes('hall') || haystack.includes('entre') || haystack.includes('entr') || haystack.includes('door')) {
    return { icon: '🚪', accent: '#f59e0b', accentSoft: 'rgba(245,158,11,.18)' };
  }
  if (haystack.includes('sovrum') || haystack.includes('bedroom') || haystack.includes('guestroom') || haystack.includes('gasterum')) {
    return { icon: '🛏️', accent: '#a78bfa', accentSoft: 'rgba(167,139,250,.18)' };
  }
  if (haystack.includes('tvatt') || haystack.includes('tvätt') || haystack.includes('laundry')) {
    return { icon: '🧺', accent: '#14b8a6', accentSoft: 'rgba(20,184,166,.18)' };
  }
  if (haystack.includes('kontor') || haystack.includes('office') || haystack.includes('arbets')) {
    return { icon: '💻', accent: '#60a5fa', accentSoft: 'rgba(96,165,250,.18)' };
  }
  if (haystack.includes('garage') || haystack.includes('verkstad')) {
    return { icon: '🧰', accent: '#ef4444', accentSoft: 'rgba(239,68,68,.18)' };
  }
  return { icon: '🏠', accent: '#22c55e', accentSoft: 'rgba(34,197,94,.18)' };
}

function getRoomThemeStyle(roomOrKey = activeRoom) {
  const theme = getRoomTheme(roomOrKey);
  return `--room-accent:${theme.accent};--room-accent-soft:${theme.accentSoft};`;
}

function ensureRoomDefs() {
  const map = new Map();
  BASE_ROOM_DEFS.forEach(room => map.set(room.key, {
    key: normalizeRoomKey(room.key),
    label: cleanRoomLabel(room.label),
    defaultCategories: Array.isArray(room.defaultCategories) && room.defaultCategories.length ? room.defaultCategories.slice() : ['ÖVRIGT'],
    defaultPlaces: Array.isArray(room.defaultPlaces) && room.defaultPlaces.length ? room.defaultPlaces.map(place => ({
      key: normalizePlaceKey(place.key || place.label || 'hylla'),
      label: cleanPlaceLabel(place.label || place.key || '📦 Plats')
    })) : [{ key: 'hylla', label: '📦 Plats' }]
  }));

  if (!Array.isArray(roomDefs)) roomDefs = [];
  roomDefs.forEach(room => {
    const key = normalizeRoomKey(room?.key || room?.label);
    const label = cleanRoomLabel(room?.label || room?.key);
    if (!key || !label) return;
    const base = map.get(key);
    map.set(key, {
      key,
      label,
      defaultCategories: Array.isArray(room?.defaultCategories) && room.defaultCategories.length ? room.defaultCategories.map(v => String(v || '').trim().toUpperCase()).filter(Boolean) : (base?.defaultCategories || ['ÖVRIGT']),
      defaultPlaces: Array.isArray(room?.defaultPlaces) && room.defaultPlaces.length ? room.defaultPlaces.map(place => ({
        key: normalizePlaceKey(place?.key || place?.label || 'hylla'),
        label: cleanPlaceLabel(place?.label || place?.key || '📦 Plats')
      })) : (base?.defaultPlaces || [{ key: 'hylla', label: '📦 Plats' }])
    });
  });

  roomDefs = Array.from(map.values());
}

function getAllRoomDefs() {
  ensureRoomDefs();
  return roomDefs;
}

function getRoomDef(roomKey = activeRoom) {
  const defs = getAllRoomDefs();
  return defs.find(room => room.key === roomKey) || defs[0] || { key: 'koket', label: 'KÖKET', defaultCategories: ['ÖVRIGT'], defaultPlaces: [{ key: 'hylla', label: '📦 Plats' }] };
}

function getRoomLabel(roomKey = activeRoom) {
  return getRoomDef(roomKey).label;
}


function getRoomFallbackCategory(roomKey = activeRoom) {
  const roomConfig = getRoomConfig(roomKey);
  const categories = Array.isArray(roomConfig?.categories) ? roomConfig.categories : [];
  const fallback = categories.find(cat => String(cat || '').trim().toUpperCase() === 'ÖVRIGT');
  if (fallback) return fallback;
  if (categories.length) return String(categories[0] || '').trim().toUpperCase();
  roomConfig.categories = ['ÖVRIGT'];
  refreshLegacyCollections();
  return 'ÖVRIGT';
}


function getQuickRoomSelection() {
  return document.getElementById('quickRoom')?.value || activeRoom;
}

function populateQuickRoomSelect(selectedRoom = getQuickRoomSelection()) {
  const quickRoom = document.getElementById('quickRoom');
  if (!quickRoom) return;
  const roomDefs = getAllRoomDefs();
  const fallbackRoom = roomDefs.some(room => room.key === selectedRoom) ? selectedRoom : (roomDefs[0]?.key || activeRoom || 'koket');
  quickRoom.innerHTML = roomDefs.map(room => {
    const theme = getRoomTheme(room.key);
    return `<option value="${room.key}">${theme.icon} ${room.label}</option>`;
  }).join('');
  quickRoom.value = fallbackRoom;
}

function renderQuickAddRoomOptions(roomKey = getQuickRoomSelection(), keepSelections = true) {
  const safeRoom = getAllRoomDefs().some(room => room.key === roomKey) ? roomKey : activeRoom;
  const itemCategory = document.getElementById('itemCategory');
  const itemPlace = document.getElementById('itemPlace');

  if (itemCategory) {
    const categories = getCategoriesForRoom(safeRoom);
    const fallbackCategory = getRoomFallbackCategory(safeRoom);
    const currentCategory = keepSelections ? (itemCategory.dataset.currentValue || itemCategory.value || fallbackCategory) : fallbackCategory;
    const nextCategory = categories.includes(currentCategory) ? currentCategory : fallbackCategory;
    itemCategory.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    itemCategory.value = nextCategory;
    itemCategory.dataset.currentValue = nextCategory;
  }

  if (itemPlace) {
    const places = getPlacesForRoom(safeRoom);
    const fallbackPlace = places[0]?.key || 'kyl';
    const currentPlace = keepSelections ? (itemPlace.dataset.currentValue || itemPlace.value || fallbackPlace) : fallbackPlace;
    const nextPlace = findPlace(currentPlace, safeRoom) ? currentPlace : fallbackPlace;
    itemPlace.innerHTML = places.map(place => `<option value="${place.key}">${place.label}</option>`).join('');
    itemPlace.value = nextPlace;
    itemPlace.dataset.currentValue = nextPlace;
  }
}

function handleQuickRoomChange(roomKey) {
  populateQuickRoomSelect(roomKey);
  renderQuickAddRoomOptions(roomKey, false);
  try { suggestUnit(); } catch (e) {}
}

function isRoomProtected(roomKey) {
  return PROTECTED_ROOM_KEYS.includes(roomKey);
}

function migrateDeprecatedRooms() {
  ensureRoomDefs();
  const migrations = DEPRECATED_ROOM_MIGRATIONS || {};
  const validKeys = new Set(getAllRoomDefs().map(room => room.key));

  Object.entries(migrations).forEach(([oldKey, targetKey]) => {
    if (!targetKey || !validKeys.has(targetKey)) return;

    items.forEach(item => {
      if ((item.room || 'koket') === oldKey) item.room = targetKey;
    });

    quickItems.forEach(item => {
      if ((item.room || 'koket') === oldKey) item.room = targetKey;
    });

    if (roomConfigs?.[oldKey] && !roomConfigs[targetKey]) {
      roomConfigs[targetKey] = roomConfigs[oldKey];
    }

    if (activeRoom === oldKey) activeRoom = targetKey;
  });

  if (Array.isArray(roomDefs)) {
    roomDefs = roomDefs.filter(room => !migrations[room.key]);
  }

  if (roomConfigs && typeof roomConfigs === 'object') {
    Object.keys(migrations).forEach(oldKey => {
      delete roomConfigs[oldKey];
    });
  }
}

function createDefaultRoomConfigs() {
  const configs = {};
  getAllRoomDefs().forEach(room => {
    configs[room.key] = {
      categories: [...new Set((room.defaultCategories || ['ÖVRIGT']).map(value => String(value || '').trim().toUpperCase()).filter(Boolean))],
      places: (room.defaultPlaces || [{ key: 'hylla', label: '📦 Plats' }]).map(place => ({
        key: normalizePlaceKey(place.key || place.label || 'hylla'),
        label: cleanPlaceLabel(place.label || place.key || 'Plats')
      }))
    };
  });
  return configs;
}

function ensureRoomConfigs() {
  migrateDeprecatedRooms();
  if (!roomConfigs || typeof roomConfigs !== 'object' || Array.isArray(roomConfigs)) roomConfigs = {};
  const fallbackConfigs = createDefaultRoomConfigs();

  getAllRoomDefs().forEach(room => {
    const current = roomConfigs[room.key];
    const fallback = fallbackConfigs[room.key];
    const nextCategories = Array.isArray(current?.categories) ? current.categories : fallback.categories;
    const nextPlaces = Array.isArray(current?.places) ? current.places : fallback.places;

    roomConfigs[room.key] = {
      categories: [...new Set(nextCategories.map(value => String(value || '').trim().toUpperCase()).filter(Boolean).concat(['ÖVRIGT']))],
      places: nextPlaces.map(place => ({
        key: normalizePlaceKey(place?.key || place?.label || 'hylla'),
        label: cleanPlaceLabel(place?.label || place?.key || 'Plats')
      })).filter(place => place.key && place.label)
    };

    if (!roomConfigs[room.key].categories.length) roomConfigs[room.key].categories = fallback.categories.slice();
    if (!roomConfigs[room.key].places.length) roomConfigs[room.key].places = fallback.places.slice();
  });

  if (!getAllRoomDefs().some(room => room.key === activeRoom)) activeRoom = getAllRoomDefs()[0]?.key || 'koket';
}

function getRoomConfig(roomKey = activeRoom) {
  ensureRoomConfigs();
  return roomConfigs[roomKey] || roomConfigs.koket;
}

function getCategoriesForRoom(roomKey = activeRoom) {
  return getRoomConfig(roomKey).categories.slice();
}

function getPlacesForRoom(roomKey = activeRoom) {
  return getRoomConfig(roomKey).places.slice();
}

function refreshLegacyCollections() {
  ensureRoomConfigs();
  categories = [...new Set(Object.values(roomConfigs).flatMap(config => config.categories || []).map(value => String(value || '').trim().toUpperCase()).filter(Boolean))];
  places = [...new Map(Object.values(roomConfigs).flatMap(config => (config.places || []).map(place => [normalizePlaceKey(place.key), { key: normalizePlaceKey(place.key), label: cleanPlaceLabel(place.label) }]))).values()];
}

function normalizeRecipeType(type) {
  const value = String(type || '').trim().toLowerCase();
  return value === 'bakverk' ? 'bakverk' : 'matlagning';
}

function normalizeRecipeCategory(category) {
  const value = String(category || '').trim().toLowerCase();
  return value || 'matlagning';
}

function getRecipeFallbackCategory(recipe) {
  return normalizeRecipeType(recipe?.type || recipe?.category || 'matlagning');
}

function ensureRecipeCategoryExists(category) {
  const normalized = normalizeRecipeCategory(category);
  if (!recipeCategories.includes(normalized)) {
    recipeCategories.push(normalized);
  }
  return normalized;
}

function getRecipeCategoryLabel(category) {
  const normalized = normalizeRecipeCategory(category);
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Matlagning';
}

function getRecipeYieldLabel(category, count = null) {
  const normalized = normalizeRecipeCategory(category);
  if (normalized === 'bakverk') return '';
  const baseLabel = 'portion';
  const amount = Number(count || 0);
  if (!amount) return 'Portioner';
  return `${amount} ${baseLabel}${amount === 1 ? '' : 'er'}`;
}

function isRecipePortionControlled(recipe = null) {
  return normalizeRecipeCategory(recipe?.category || recipe?.type || 'matlagning') !== 'bakverk';
}

function normalizeRecipeYield(value, fallback = 4) {
  const n = Math.round(Number(value || 0));
  return Math.max(1, Math.min(24, Number.isFinite(n) && n > 0 ? n : fallback));
}

function getRecipeBaseYield(recipe = null) {
  return normalizeRecipeYield(recipe?.yield, 4);
}

function getSelectedRecipePortions() {
  return Math.max(1, householdSize);
}

function getRecipeScaleFactor(recipe = null) {
  if (!recipe || !isRecipePortionControlled(recipe)) return 1;
  return getSelectedRecipePortions() / Math.max(1, getRecipeBaseYield(recipe));
}

function shouldUseGlobalPortionWeight(ingredient, recipe = null) {
  if (!recipe || !isRecipePortionControlled(recipe)) return false;
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing || !isWeightUnit(ing.unit)) return false;
  const normalized = normalizeText(ing.name);
  const keywords = [
    'kottfars', 'notfars', 'blandfars', 'hushallsfars', 'kycklingfars',
    'kyckling', 'flaskfile', 'flaskkotlett', 'flask', 'nötfars', 'notfile', 'not',
    'lax', 'torsk', 'fisk', 'korv', 'falukorv', 'scans', 'entrecote', 'biff',
    'kott', 'högrev', 'bog', 'salsiccia', 'chorizo'
  ];
  return keywords.some(keyword => normalized.includes(normalizeText(keyword)));
}

function getSmartPortionWeightForIngredient(ingredient, recipe = null) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing || !shouldUseGlobalPortionWeight(ing, recipe)) return null;
  return Math.max(1, Number(getSelectedRecipePortions() || 1) * Number(portionGrams || 0));
}

function isTacoSpiceRecipeIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return false;
  const normalized = normalizeText(ing.name);
  return normalized.includes('tacokrydda') || normalized.includes('taco krydda');
}

function getReferenceProteinAmountForRecipe(recipe = null) {
  if (!recipe || !Array.isArray(recipe.items)) return 450;

  const proteinIngredient = recipe.items
    .map(normalizeRecipeIngredient)
    .find(item => item && shouldUseGlobalPortionWeight(item, recipe));

  if (!proteinIngredient) {
    return Math.max(1, Number(getSelectedRecipePortions() || 1) * Number(portionGrams || 0)) || 450;
  }

  const proteinRule = shouldUseGlobalPortionWeight(proteinIngredient, recipe)
    ? { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * Number(portionGrams || 0)), unit: 'g' }
    : null;

  if (proteinRule && isWeightUnit(proteinRule.unit)) return Math.max(1, Math.round(Number(proteinRule.amount || 0)));

  const canonicalAmount = recipeIngredientCanonicalAmount(proteinIngredient);
  return Math.max(1, Math.round(Number(canonicalAmount || 0))) || 450;
}

function getTacoSpiceWeightForRecipe(recipe = null) {
  const meatGrams = getReferenceProteinAmountForRecipe(recipe);
  return Math.max(1, Math.round((Number(meatGrams || 450) / 450) * 28));
}

function getSmartPortionRuleForIngredient(ingredient, recipe = null) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing || !recipe || !isRecipePortionControlled(recipe)) return null;

  const normalized = normalizeText(ing.name);
  const hasAny = keywords => keywords.some(keyword => normalized.includes(normalizeText(keyword)));

  if (isTacoSpiceRecipeIngredient(ing)) {
    return { amount: getTacoSpiceWeightForRecipe(recipe), unit: 'g', label: 'taco-krydda' };
  }

  if (shouldUseGlobalPortionWeight(ing, recipe)) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * Number(portionGrams || 0)), unit: 'g', label: 'protein' };
  }

  if (hasAny(['pasta', 'spaghetti', 'makaroner', 'makaroni', 'nudlar', 'couscous', 'bulgur'])) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 100), unit: 'g', label: 'pasta' };
  }

  if (hasAny(['ris', 'quinoa', 'matvete', 'gryn', 'havreris'])) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 75), unit: 'g', label: 'ris' };
  }

  if (hasAny(['potatis', 'pommes', 'potatismos'])) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 250), unit: 'g', label: 'potatis' };
  }

  if (hasAny(['riven ost', 'ost riven', 'pizzaost', 'mozzarella riven', 'cheddar riven']) || isRecipeGratedCheeseName(ing.name)) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 25), unit: 'g', label: 'ost' };
  }

  if (hasAny(['gradde', 'grädde', 'creme fraiche', 'crème fraiche', 'kokosmjolk', 'kokosmjölk', 'mjolk', 'mjölk', 'passata', 'krossade tomater', 'tomatsas', 'tomatsås', 'buljong', 'fond', 'sas', 'sås'])) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 75), unit: 'ml', label: 'sås' };
  }

  if (hasAny(['broccoli', 'blomkal', 'blomkål', 'morot', 'paprika', 'sallad', 'spenat', 'gronsaker', 'grönsaker', 'majs', 'arter', 'ärter', 'lok', 'lök', 'tomat', 'gurka', 'zucchini'])) {
    return { amount: Math.max(1, Number(getSelectedRecipePortions() || 1) * 100), unit: 'g', label: 'grönsaker' };
  }

  return null;
}

function getRecipePortionSummary(recipe = null) {
  if (!recipe || !isRecipePortionControlled(recipe)) return '';
  const target = getSelectedRecipePortions();
  const base = getRecipeBaseYield(recipe);
  const ratio = getRecipeScaleFactor(recipe);
  const ratioText = ratio === 1 ? '1×' : `${String(Number(ratio.toFixed(2))).replace('.', ',')}×`;
  return `${base} portioner sparat → ${target} portioner nu (${ratioText})`;
}

function refreshPortionSelectLabels(recipe = null) {
  const yieldWrap = document.getElementById('recipeYieldWrap');
  const yieldInput = document.getElementById('recipeYield');
  const yieldLabel = document.getElementById('recipeYieldLabel');
  const selectedInfo = document.getElementById('recipePortionInfo');

  const categoryValue = normalizeRecipeCategory(document.getElementById('recipeCategory')?.value || recipe?.category || recipe?.type || 'matlagning');
  const isPortionRecipe = categoryValue !== 'bakverk';

  if (yieldWrap) yieldWrap.style.display = isPortionRecipe ? '' : 'none';
  if (yieldLabel) yieldLabel.textContent = isPortionRecipe ? 'Receptet räcker till' : 'Bakverk';
  if (yieldInput) {
    if (isPortionRecipe) {
      const nextValue = recipe ? getRecipeBaseYield(recipe) : normalizeRecipeYield(yieldInput.value || 4, 4);
      if (String(yieldInput.value || '') !== String(nextValue)) yieldInput.value = String(nextValue);
    }
  }

  if (selectedInfo) {
    if (recipe && isRecipePortionControlled(recipe)) {
      selectedInfo.style.display = 'block';
      selectedInfo.textContent = `👥 ${getRecipePortionSummary(recipe)} • ${householdSize} personer × ${portionGrams} g = ${formatWeightDisplay(householdSize * portionGrams)}`;
    } else {
      selectedInfo.style.display = 'none';
      selectedInfo.textContent = '';
    }
  }
}

function handlePortionInputChange() {
  renderSelectedRecipeIngredients();
  clearRecipeResult();
}

function getRecipeCategoryMeta(category) {
  const normalized = normalizeRecipeCategory(category);
  if (normalized === 'bakverk') return { value: 'bakverk', label: 'Bakverk', icon: '🧁' };
  if (normalized === 'matlagning') return { value: 'matlagning', label: 'Matlagning', icon: '🍳' };
  return { value: normalized, label: getRecipeCategoryLabel(normalized), icon: '🍽️' };
}

function getRecipeTypeMeta(type) {
  return getRecipeCategoryMeta(type);
}

if (!recipes.length) {
  recipes = [
    {
      name: 'Tacos',
      items: [
        { name: 'köttfärs', quantity: 1, unit: 'pkt', size: null },
        { name: 'tacokrydda', quantity: 1, unit: 'pkt', size: null },
        { name: 'tortillabröd', quantity: 1, unit: 'pkt', size: null },
        { name: 'ost', quantity: 1, unit: 'st', size: null }
      ],
      link: '',
      type: 'matlagning',
      category: 'matlagning',
      yield: 4
    }
  ];
}

let editingIndex = null;
let editingQuick = false;
let showQuick = true;
let showHome = true;
let showBuy = true;
let showRecipes = true;
let homeOpenState = JSON.parse(localStorage.getItem('homeOpenState') || '{}');
let recipeDraftItems = [];
let currentRecipeMissing = [];
let recipeIngredientChoices = JSON.parse(localStorage.getItem('matlista_recipe_choices') || '{}');
let householdSize = Math.max(1, Number(localStorage.getItem('matlista_household_size') || 1));
let portionGrams = Math.max(1, Math.min(250, Math.round(Number(localStorage.getItem('matlista_portion_grams') || 100) || 100)));
let editingIngredientIndex = null;
let editingIngredientRecipeIndex = null;
let selectedAddQuickIndex = null;

let recipeCategoryEditState = { activeFilter: '' };

let draggedItemIndex = null;
let draggedItemSource = null;
let holdAddTimeout = null;
let holdAddInterval = null;
let holdAddTriggered = false;
let draggedRecipeIngredientIndex = null;
let draggedRecipeIngredientMode = '';
let draggedRecipeIngredientRecipeName = '';
let activeRecipeTouchDrag = null;

const defaultPlaces = getPlacesForRoom('koket');
const lockedPlaceKeysByRoom = {
  koket: ['kyl', 'frys', 'kryddor', 'skafferi']
};

const weightSizeOptions = [14, 28, 50, 100, 150, 200, 250, 500, 750, 1000];
const spiceWeightSizeOptions = [14, 28, 50, 100, 150, 200];
const liquidSizeOptions = [1, 5, 15, 50, 100, 250, 500, 1000, 1500, 2000];

function isWeightUnit(unit) {
  return ['g', 'kg'].includes(String(unit || '').toLowerCase());
}

function isLiquidUnit(unit) {
  return ['ml', 'l', 'dl', 'krm', 'tsk', 'msk'].includes(String(unit || '').toLowerCase());
}

function supportsSize(unit) {
  return isWeightUnit(unit) || isLiquidUnit(unit);
}

function normalizeCategoryName(category) {
  return String(category || '').trim().toUpperCase();
}

function getContextCategory(context = null) {
  if (!context) return '';
  if (typeof context === 'string') return normalizeCategoryName(context);
  if (typeof context === 'object') return normalizeCategoryName(context.category);
  return '';
}

function getSizeOptions(unit, context = null) {
  const category = getContextCategory(context);
  if (isWeightUnit(unit)) {
    if (category === 'RECIPE_KRYDDOR') return spiceWeightSizeOptions.slice();
    if (category === 'RECIPE_RIVEN_OST') return [50, 100, 150, 200];
    if (category === 'RECIPE') return [250, 500, 750, 1000];
    return category === 'KRYDDOR' ? spiceWeightSizeOptions.slice() : weightSizeOptions.slice();
  }
  if (isLiquidUnit(unit)) return liquidSizeOptions.slice();
  return [];
}

function getDefaultSize(unit, context = null) {
  if (!supportsSize(unit)) return null;
  const category = getContextCategory(context);
  if (isWeightUnit(unit)) {
    if (category === 'RECIPE_KRYDDOR') return 28;
    if (category === 'RECIPE_RIVEN_OST') return 100;
    if (category === 'RECIPE') return 250;
    return category === 'KRYDDOR' ? 28 : 500;
  }
  return 1000;
}

function isRecipeSpiceName(name) {
  const normalized = normalizeText(name);
  if (!normalized) return false;

  const keywords = [
    'krydda', 'salt', 'peppar', 'paprika', 'oregano', 'basilika', 'timjan',
    'rosmarin', 'chiliflakes', 'chili flakes', 'chili', 'cayenne', 'vitlokspulver',
    'vitloks pulver', 'lokpulver', 'lonpulver', 'ingefara', 'kanel', 'spiskummin',
    'kummin', 'kardemumma', 'koriander', 'gurkmeja', 'curry', 'garam masala',
    'taco krydda', 'tacokrydda', 'grillkrydda', 'allkrydda'
  ];

  return keywords.some(keyword => normalized.includes(normalizeText(keyword)));
}

function isRecipeGratedCheeseName(name) {
  const normalized = normalizeText(name);
  if (!normalized) return false;

  const keywords = [
    'riven ost', 'ost riven', 'riven cheese', 'grated cheese',
    'tacoost', 'taco ost', 'tacoost riven', 'taco ost riven',
    'riven tacoost', 'riven taco ost', 'mozzarella riven', 'riven mozzarella',
    'cheddar riven', 'riven cheddar', 'pizzaost', 'pizza ost',
    'riven gouda', 'gouda riven', 'riven parmesan', 'parmesan riven'
  ];

  return keywords.some(keyword => normalized.includes(normalizeText(keyword)))
    || (normalized.includes('ost') && normalized.includes('riven'));
}

function getRecipeIngredientContext(value = null) {
  if (!value) return 'RECIPE';

  if (typeof value === 'string') {
    const raw = String(value).trim();
    const match = raw.match(/^\d+\s*(st|g|kg|ml|dl|l|krm|tsk|msk|pkt)?\s+(.*)$/i);
    const name = match ? match[2] : raw;
    if (isRecipeGratedCheeseName(name)) return 'RECIPE_RIVEN_OST';
    return isRecipeSpiceName(name) ? 'RECIPE_KRYDDOR' : 'RECIPE';
  }

  const category = normalizeCategoryName(value.category || '');
  if (category === 'KRYDDOR' || category === 'RECIPE_KRYDDOR') return 'RECIPE_KRYDDOR';
  if (category === 'RECIPE_RIVEN_OST') return 'RECIPE_RIVEN_OST';

  if (isRecipeGratedCheeseName(value.name || '')) return 'RECIPE_RIVEN_OST';
  return isRecipeSpiceName(value.name || '') ? 'RECIPE_KRYDDOR' : 'RECIPE';
}

function normalizeSize(unit, size, context = null) {
  if (!supportsSize(unit)) return null;
  const n = Number(size || 0);
  if (Number.isFinite(n) && n > 0) {
    return Math.min(Math.round(n), getBaseUnitLimit(unit));
  }
  const options = getSizeOptions(unit, context);
  if (options.includes(n)) return n;
  return getDefaultSize(unit, context);
}

function formatSizeValue(unit, size) {
  const normalized = normalizeSize(unit, size);
  if (!normalized) return '';
  return formatSmartMeasureDisplay(normalized, unit);
}

function getDisplayUnit(unit, size = null) {
  if (isWeightUnit(unit)) return Number(size || 0) >= 1000 ? 'kg' : 'g';
  if (isLiquidUnit(unit)) {
    const value = Number(size || 0);
    if (value >= 1000) return 'l';
    if (value >= 100) return 'dl';
    if (value < 5 && Number.isInteger(value)) return 'krm';
    if (value < 15 && value % 5 === 0) return 'tsk';
    if (value < 100 && value % 15 === 0) return 'msk';
    return 'ml';
  }
  return unit || 'st';
}

function isPackTrackedItem(item) {
  if (!item || item.type !== 'home' || !isWeightUnit(item.unit)) return false;
  const size = Math.max(0, Number(item.size || 0));
  const unopened = Math.max(0, Number(item.quantity || 0));
  const opened = Math.max(0, Number(item.openedAmount || 0));
  return size > 0 && (unopened > 1 || opened > 0 || item.packMode === 'bags');
}

function getOpenedAmount(item) {
  if (!item) return 0;
  const size = Math.max(0, Number(item.size || 0));
  const opened = Math.max(0, Number(item.openedAmount || 0));
  if (!size) return 0;
  return Math.min(size, opened);
}

function formatPackState(item) {
  if (!isPackTrackedItem(item)) return '';
  const unopened = Math.max(0, Number(item.quantity || 0));
  const size = Math.max(0, Number(item.size || 0));
  const opened = getOpenedAmount(item);
  const parts = [];

  if (unopened > 0) parts.push(`${unopened} påsar × ${formatSmartMeasureDisplay(size, item.unit)}`);
  if (opened > 0) parts.push(`öppnad påse: ${formatSmartMeasureDisplay(opened, item.unit)} kvar`);

  return parts.join(' + ');
}

function formatItemAmount(item) {
  const amount = Math.max(0, Number(item?.quantity || 0));

  if (supportsSize(item?.unit)) {
    if (isPackTrackedItem(item)) {
      const size = Math.max(0, Number(item?.size || 0));
      const opened = getOpenedAmount(item);
      const total = (amount * size) + opened;
      const packText = formatPackState(item);
      return packText ? `${formatSmartMeasureDisplay(total, item.unit)} totalt • ${packText}` : formatSmartMeasureDisplay(total, item.unit);
    }

    const size = Number(item?.size || 0);
    const total = amount * size;
    return formatSmartMeasureDisplay(total, item.unit);
  }

  return `${amount} ${item?.unit || 'st'}`;
}

function portionToRecipeSize(portions) {
  const map = {
    2: 250,
    4: 500,
    6: 750,
    8: 1000
  };
  return map[Number(portions) || 2] || 250;
}

function portionToRecipeSpiceSize(portions) {
  const map = {
    2: 14,
    4: 28,
    6: 50,
    8: 100
  };
  return map[Number(portions) || 2] || 14;
}

function portionToRecipeGratedCheeseSize(portions) {
  const map = {
    2: 50,
    4: 100,
    6: 150,
    8: 200
  };
  return map[Number(portions) || 2] || 50;
}

function applySelectedPortionToIngredient(value, recipe = null) {
  const ingredient = normalizeRecipeIngredient(value);
  if (!ingredient) return null;

  if (!isRecipePortionControlled(recipe)) return { ...ingredient };

  const smartRule = getSmartPortionRuleForIngredient(ingredient, recipe);
  if (smartRule) {
    return {
      ...ingredient,
      quantity: 1,
      unit: smartRule.unit,
      size: smartRule.amount,
      measureText: supportsSize(smartRule.unit) ? formatSmartMeasureDisplay(smartRule.amount, smartRule.unit) : '',
      weightText: isWeightUnit(smartRule.unit) ? formatSmartMeasureDisplay(smartRule.amount, smartRule.unit) : ''
    };
  }

  const factor = getRecipeScaleFactor(recipe);
  if (supportsSize(ingredient.unit)) {
    const totalAmount = recipeIngredientCanonicalAmount(ingredient);
    const scaledAmount = Math.max(1, Math.round(totalAmount * factor));
    return {
      ...ingredient,
      quantity: 1,
      size: scaledAmount,
      measureText: formatSmartMeasureDisplay(scaledAmount, ingredient.unit),
      weightText: isWeightUnit(ingredient.unit) ? formatSmartMeasureDisplay(scaledAmount, ingredient.unit) : ''
    };
  }

  return {
    ...ingredient,
    quantity: Math.max(1, Math.ceil(Number(ingredient.quantity || 1) * factor))
  };
}

const recipeReplacementGroups = {
  kottfars: ['Nötfärs', 'Blandfärs', 'Kycklingfärs', 'Hushållsfärs', 'Salsicciafärs', 'Chorizofärs']
};

function isMincedMeatRecipeIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return false;
  return normalizeText(ing.name).includes('kottfars');
}

function getHomeMincedMeatOptions() {
  const seen = new Set();
  return items
    .filter(item =>
      item.type === 'home' &&
      Number(item.quantity || 0) > 0 &&
      normalizeCategoryName(item.category) === 'KÖTTFÄRS'
    )
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'sv'))
    .filter(item => {
      const key = normalizeText(item.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(item => item.name);
}

function getRecipeChoiceKey(recipeName, ingredientName) {
  return `${normalizeText(recipeName)}__${normalizeText(ingredientName)}`;
}

function getRecipeIngredientChoice(recipeName, ingredientName) {
  const key = getRecipeChoiceKey(recipeName, ingredientName);
  return recipeIngredientChoices[key] || '';
}

function setRecipeIngredientChoice(recipeName, ingredientName, value) {
  const key = getRecipeChoiceKey(recipeName, ingredientName);
  if (value) recipeIngredientChoices[key] = value;
  else delete recipeIngredientChoices[key];
  localStorage.setItem('matlista_recipe_choices', JSON.stringify(recipeIngredientChoices));
  localStorage.setItem('matlista_household_size', String(householdSize));
  localStorage.setItem('matlista_portion_grams', String(portionGrams));
}

function clearRecipeChoicesForRecipe(recipeName) {
  const prefix = `${normalizeText(recipeName)}__`;
  Object.keys(recipeIngredientChoices).forEach(key => {
    if (key.startsWith(prefix)) delete recipeIngredientChoices[key];
  });
  localStorage.setItem('matlista_recipe_choices', JSON.stringify(recipeIngredientChoices));
  localStorage.setItem('matlista_household_size', String(householdSize));
}

function getRecipeReplacementOptions(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return [];

  if (isMincedMeatRecipeIngredient(ing)) {
    const homeOptions = getHomeMincedMeatOptions();
    return homeOptions;
  }

  return [];
}

function resolveRecipeIngredient(ingredient, recipe = null) {
  const base = applySelectedPortionToIngredient(ingredient, recipe);
  if (!base) return null;
  if (!recipe?.name) return base;

  const availableOptions = getRecipeReplacementOptions(base);
  const chosenName = getRecipeIngredientChoice(recipe.name, base.name);

  if (chosenName && availableOptions.some(option => normalizeText(option) === normalizeText(chosenName))) {
    return { ...base, name: chosenName };
  }

  if (isMincedMeatRecipeIngredient(base)) {
    const homeOptions = getHomeMincedMeatOptions();
    if (homeOptions.length === 1) {
      return { ...base, name: homeOptions[0] };
    }
  }

  return base;
}

function changeRecipeIngredientChoice(recipeName, ingredientName, value) {
  setRecipeIngredientChoice(recipeName, ingredientName, value);
  clearRecipeResult();
  renderSelectedRecipeIngredients();
}

function formatBuyCostLabel(item) {
  const price = Number(item?.price || 0);
  const amount = Math.max(0, Number(item?.quantity || 0));
  const unitLabel = supportsSize(item?.unit) ? formatSizeValue(item.unit, item.size) : (item?.unit || 'st');
  return {
    unitPrice: `${price} kr/${unitLabel}`,
    total: `${price * amount} kr`
  };
}

function sameVariant(a, b, includeType = true) {
  if (!a || !b) return false;
  return normalizeText(a.name) === normalizeText(b.name)
    && (!includeType || (a.type || 'home') === (b.type || 'home'))
    && (a.room || 'koket') === (b.room || 'koket')
    && (a.place || 'kyl') === (b.place || 'kyl')
    && (a.unit || 'st') === (b.unit || 'st')
    && Number(a.size || 0) === Number(b.size || 0);
}

function getCategoryForSelect(selectId) {
  const map = {
    itemSize: 'itemCategory',
    editSize: 'editCategory'
  };
  const categorySelect = document.getElementById(map[selectId] || '');
  return categorySelect?.value || '';
}

function updateSizeSelect(selectId, unit, currentSize = null, context = null) {
  const select = document.getElementById(selectId);
  if (!select) return;
  if (!supportsSize(unit)) {
    select.innerHTML = '';
    select.style.display = 'none';
    select.disabled = true;
    return;
  }
  const resolvedContext = context || getCategoryForSelect(selectId);
  const options = getSizeOptions(unit, resolvedContext);
  const fallback = currentSize || getDefaultSize(unit, resolvedContext);
  const value = normalizeSize(unit, fallback, resolvedContext);
  select.innerHTML = options.map(size => `<option value="${size}">${formatSizeValue(unit, size)}</option>`).join('');
  select.value = String(value);
  select.style.display = '';
  select.disabled = false;
}

function normalizePlaceKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

function cleanPlaceLabel(label) {
  return String(label || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPlace(placeKey, roomKey = activeRoom) {
  const clean = normalizePlaceKey(placeKey);
  return getPlacesForRoom(roomKey).find(place => place.key === clean) || null;
}

function ensurePlaceExists(placeValue, roomKey = activeRoom) {
  ensureRoomConfigs();
  const fallbackPlace = getPlacesForRoom(roomKey)[0]?.key || 'kyl';
  const clean = normalizePlaceKey(placeValue || fallbackPlace);
  if (!clean) return fallbackPlace;
  const roomConfig = getRoomConfig(roomKey);
  if (!roomConfig.places.some(place => place.key === clean)) {
    roomConfig.places.push({ key: clean, label: cleanPlaceLabel(placeValue || clean) });
  }
  refreshLegacyCollections();
  return clean;
}

function ensureCategoryExists(category, roomKey = activeRoom) {
  ensureRoomConfigs();
  const clean = String(category || '').trim().toUpperCase();
  if (!clean) return getRoomFallbackCategory(roomKey);
  const roomConfig = getRoomConfig(roomKey);
  if (!roomConfig.categories.includes(clean)) roomConfig.categories.push(clean);
  refreshLegacyCollections();
  return clean;
}

function normalizeImageFileName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9åäö _-]+/g, '')
    .trim();
}

function stripSwedishChars(text) {
  return String(text || '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o');
}

function slugifyImageName(name, separator = '-') {
  return normalizeImageFileName(name)
    .replace(/\s+/g, separator)
    .replace(new RegExp(`\\${separator}+`, 'g'), separator)
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '');
}

function compactImageName(name) {
  return normalizeImageFileName(name)
    .replace(/[ _-]+/g, '');
}

function normalizeForDistance(text) {
  return stripSwedishChars(normalizeImageFileName(text))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (!s) return t.length;
  if (!t) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}

function getKnownImageNames() {
  return [...new Set([...items, ...quickItems].map(item => String(item?.name || '').trim()).filter(Boolean))];
}

function buildImageNameVariants(name) {
  const original = normalizeImageFileName(name);
  if (!original) return [];

  const variants = new Set();
  const add = value => {
    const clean = String(value || '').trim();
    if (clean) variants.add(clean);
  };

  const swedishSpaces = original;
  const swedishHyphen = slugifyImageName(original, '-');
  const swedishUnderscore = slugifyImageName(original, '_');
  const swedishCompact = compactImageName(original);

  const asciiSpaces = stripSwedishChars(swedishSpaces);
  const asciiHyphen = stripSwedishChars(swedishHyphen);
  const asciiUnderscore = stripSwedishChars(swedishUnderscore);
  const asciiCompact = stripSwedishChars(swedishCompact);

  [
    swedishSpaces,
    swedishHyphen,
    swedishUnderscore,
    swedishCompact,
    asciiSpaces,
    asciiHyphen,
    asciiUnderscore,
    asciiCompact
  ].forEach(add);

  const target = normalizeForDistance(original);
  const maxAllowed = target.length <= 5 ? 1 : 2;

  getKnownImageNames().forEach(candidateName => {
    const candidate = normalizeForDistance(candidateName);
    if (!candidate) return;
    if (levenshteinDistance(target, candidate) <= maxAllowed) {
      add(normalizeImageFileName(candidateName));
      add(slugifyImageName(candidateName, '-'));
      add(slugifyImageName(candidateName, '_'));
      add(compactImageName(candidateName));
      add(stripSwedishChars(normalizeImageFileName(candidateName)));
      add(stripSwedishChars(slugifyImageName(candidateName, '-')));
      add(stripSwedishChars(slugifyImageName(candidateName, '_')));
      add(stripSwedishChars(compactImageName(candidateName)));
    }
  });

  return [...variants];
}

function getAutoImageCandidates(name) {
  const fileNames = [
    ...buildImageNameVariants(name),
    ...getSmartImageMatches(name)
  ];
  const extensions = ['png', 'jpg', 'jpeg', 'webp'];
  const candidates = [];

  fileNames.forEach(fileName => {
    extensions.forEach(ext => {
      candidates.push(`images/${encodeURIComponent(fileName)}.${ext}`);
    });
  });

  return [...new Set(candidates)];
}

function getAutoImagePath(name) {
  return getAutoImageCandidates(name)[0] || '';
}

function getNextAutoImagePath(name, currentSrc = '') {
  const candidates = getAutoImageCandidates(name);
  if (!candidates.length) return '';
  const current = String(currentSrc || '');
  const currentIndex = candidates.findIndex(candidate => current.includes(candidate));
  return currentIndex === -1 ? candidates[0] : (candidates[currentIndex + 1] || '');
}

function getDefaultItemIcon() {
  return 'icons/icon-192.png';
}

function getNoImagePlaceholder() {
  return getDefaultItemIcon();
}

function isCloudImageUrl(value) {
  const src = String(value || '');
  return /^https?:\/\//i.test(src) && src.includes('firebasestorage');
}

function isInlineImage(value) {
  return String(value || '').startsWith('data:image/');
}

function isLocalImagePath(value) {
  return /^images\//i.test(String(value || ''));
}

function getFirebaseStorageInstance() {
  try {
    if (!window.firebase || typeof firebase.storage !== 'function') return null;
    return firebase.storage();
  } catch (error) {
    return null;
  }
}

function getCloudUserUid() {
  try {
    return firebase?.auth?.().currentUser?.uid || '';
  } catch (error) {
    return '';
  }
}

function canUploadImagesToCloud() {
  return !!(getFirebaseStorageInstance() && getCloudUserUid());
}

const remoteImageUrlCache = new Map();
const remoteImageLookupInflight = new Map();
let remoteImageRerenderTimer = null;

function getRemoteImageScopeKey() {
  const uid = getCloudUserUid();
  const householdIds = [];

  const add = value => {
    const normalized = String(value || '').trim();
    if (normalized && !householdIds.includes(normalized)) householdIds.push(normalized);
  };

  add(window.activeHouseholdId);
  add(window.householdId);
  add(window.currentHouseholdId);
  add(localStorage.getItem('activeHouseholdId'));
  add(localStorage.getItem('householdId'));
  add(localStorage.getItem('matlista_household_id'));
  add(localStorage.getItem('cloudHouseholdId'));

  return `${uid || 'guest'}|${householdIds.join(',')}`;
}

function getRemoteImageCacheKey(itemName = '') {
  return `${getRemoteImageScopeKey()}::${normalizeText(itemName || '')}`;
}

function scheduleRemoteImageRerender() {
  if (remoteImageRerenderTimer) return;
  remoteImageRerenderTimer = setTimeout(() => {
    remoteImageRerenderTimer = null;
    try {
      if (typeof render === 'function') render();
    } catch (error) {}
  }, 60);
}

function getFirebaseAutoImageCandidatePaths(itemName = 'vara') {
  const variants = [...new Set([
    ...buildImageNameVariants(itemName),
    ...getSmartImageMatches(itemName)
  ].filter(Boolean))];
  if (!variants.length) return [];

  const bases = [];
  const uid = getCloudUserUid();
  if (uid) {
    bases.push(`users/${uid}/item-images`);
    bases.push(`users/${uid}/images`);
    bases.push(`users/${uid}/auto-images`);
  }

  const householdIds = [];
  const addHousehold = value => {
    const normalized = String(value || '').trim();
    if (normalized && !householdIds.includes(normalized)) householdIds.push(normalized);
  };

  addHousehold(window.activeHouseholdId);
  addHousehold(window.householdId);
  addHousehold(window.currentHouseholdId);
  addHousehold(localStorage.getItem('activeHouseholdId'));
  addHousehold(localStorage.getItem('householdId'));
  addHousehold(localStorage.getItem('matlista_household_id'));
  addHousehold(localStorage.getItem('cloudHouseholdId'));

  householdIds.forEach(householdId => {
    bases.push(`households/${householdId}/images`);
    bases.push(`households/${householdId}/item-images`);
    bases.push(`households/${householdId}/auto-images`);
  });

  bases.push('shared-images');
  bases.push('auto-images');

  const extensions = ['jpg', 'jpeg', 'png', 'webp'];
  const paths = [];
  bases.forEach(base => {
    variants.forEach(fileName => {
      extensions.forEach(ext => {
        paths.push(`${base}/${fileName}.${ext}`);
      });
    });
  });

  return [...new Set(paths)];
}

function lookupRemoteAutoImage(itemName = 'vara') {
  const storage = getFirebaseStorageInstance();
  if (!storage) return Promise.resolve('');

  const cacheKey = getRemoteImageCacheKey(itemName);
  if (remoteImageUrlCache.has(cacheKey)) {
    return Promise.resolve(String(remoteImageUrlCache.get(cacheKey) || ''));
  }

  if (remoteImageLookupInflight.has(cacheKey)) {
    return remoteImageLookupInflight.get(cacheKey);
  }

  const candidates = getFirebaseAutoImageCandidatePaths(itemName);
  if (!candidates.length) {
    remoteImageUrlCache.set(cacheKey, '');
    return Promise.resolve('');
  }

  const promise = candidates.reduce((chain, candidatePath) => {
    return chain.then(found => {
      if (found) return found;
      return storage.ref().child(candidatePath).getDownloadURL().catch(() => '');
    });
  }, Promise.resolve('')).then(url => {
    const finalUrl = normalizeCloudImageDisplayUrl(String(url || ''));
    remoteImageUrlCache.set(cacheKey, finalUrl);
    return finalUrl;
  }).finally(() => {
    remoteImageLookupInflight.delete(cacheKey);
  });

  remoteImageLookupInflight.set(cacheKey, promise);
  return promise;
}

function queueRemoteAutoImageLookup(itemName = 'vara', onResolved = null) {
  return lookupRemoteAutoImage(itemName).then(url => {
    if (url) {
      if (typeof onResolved === 'function') {
        try { onResolved(url); } catch (error) {}
      }
      scheduleRemoteImageRerender();
    }
    return url;
  });
}


function getPreferredCloudImageFolder() {
  const householdIds = [];
  const addHousehold = value => {
    const normalized = String(value || '').trim();
    if (normalized && !householdIds.includes(normalized)) householdIds.push(normalized);
  };

  addHousehold(window.activeHouseholdId);
  addHousehold(window.householdId);
  addHousehold(window.currentHouseholdId);
  addHousehold(localStorage.getItem('activeHouseholdId'));
  addHousehold(localStorage.getItem('householdId'));
  addHousehold(localStorage.getItem('matlista_household_id'));
  addHousehold(localStorage.getItem('cloudHouseholdId'));

  if (householdIds.length) return `households/${householdIds[0]}/item-images`;

  const uid = getCloudUserUid();
  return uid ? `users/${uid}/item-images` : 'shared-images';
}

function makeCloudImagePath(itemName = 'vara') {
  const safeName = stripSwedishChars(slugifyImageName(itemName || 'vara', '-')).slice(0, 64) || 'vara';
  return `${getPreferredCloudImageFolder()}/${safeName}.jpg`;
}

function dataUrlToBlob(dataUrl) {
  try {
    const parts = String(dataUrl || '').split(',');
    if (parts.length < 2) return null;
    const meta = parts[0] || '';
    const mimeMatch = meta.match(/data:([^;]+);base64/i);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (error) {
    return null;
  }
}

function updateCloudImageStatus(message) {
  try {
    if (typeof window.setCloudStatusMessage === 'function') window.setCloudStatusMessage(message);
  } catch (error) {}
}

function uploadItemImageToCloud(dataUrl, itemName = 'vara') {
  if (!isInlineImage(dataUrl) || !canUploadImagesToCloud()) {
    return Promise.resolve(String(dataUrl || ''));
  }

  const storage = getFirebaseStorageInstance();
  if (!storage) return Promise.resolve(String(dataUrl || ''));

  const ref = storage.ref().child(makeCloudImagePath(itemName));
  const metadata = {
    contentType: 'image/jpeg',
    cacheControl: 'public,max-age=300',
    customMetadata: {
      itemName: String(itemName || 'vara'),
      normalizedItemName: stripSwedishChars(slugifyImageName(itemName || 'vara', '-')).slice(0, 64) || 'vara',
      updatedAtMs: String(Date.now())
    }
  };

  updateCloudImageStatus('☁️ Laddar upp bild till cloud...');

  return ref.putString(String(dataUrl), 'data_url', metadata)
    .then(snapshot => snapshot.ref.getDownloadURL())
    .catch(error => {
      console.warn('Image upload putString retry:', error);
      const blob = dataUrlToBlob(dataUrl);
      if (!blob) throw error;
      return ref.put(blob, metadata).then(snapshot => snapshot.ref.getDownloadURL());
    })
    .then(url => {
      const rawUrl = String(url || dataUrl || '');
      const finalUrl = normalizeCloudImageDisplayUrl(rawUrl && /^https?:\/\//i.test(rawUrl)
        ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
        : rawUrl);
      remoteImageUrlCache.set(getRemoteImageCacheKey(itemName), finalUrl);
      updateCloudImageStatus('☁️ Bild uppladdad till cloud');
      scheduleRemoteImageRerender();
      return finalUrl;
    })
    .catch(error => {
      console.error('Image upload error:', error);
      updateCloudImageStatus('⚠️ Cloud-bild misslyckades – lokal bild används');
      return String(dataUrl || '');
    });
}

function normalizeCloudImageDisplayUrl(src = '') {
  const value = String(src || '').trim();
  if (!value) return '';
  if (!isCloudImageUrl(value)) return value;
  if (/([?&])v=\d+/i.test(value)) return value;
  return `${value}${value.includes('?') ? '&' : '?'}v=1`;
}

function resolveExplicitImageSource(item) {
  if (!item || !item.img) return '';
  const src = String(item.img || '').trim();
  if (!src) return '';
  if (isInlineImage(src) || isCloudImageUrl(src) || isLocalImagePath(src)) return normalizeCloudImageDisplayUrl(src);
  if (/^https?:\/\//i.test(src)) return src;
  return '';
}

function getSmartImageMatches(name) {
  const normalizedTarget = normalizeForDistance(name || '');
  if (!normalizedTarget) return [];

  const stopWords = new Set(['file', 'fil', 'bit', 'bitar', 'skivor', 'skivade', 'riven', 'hackad', 'hela', 'hel', 'farsk', 'fryst']);
  const rawTokens = normalizedTarget.split(' ').map(token => token.trim()).filter(Boolean);
  const tokens = rawTokens.filter(token => !stopWords.has(token));
  const source = tokens.length ? tokens : rawTokens;
  if (!source.length) return [];

  const variants = new Set();
  for (let size = source.length; size >= 1; size -= 1) {
    for (let start = 0; start + size <= source.length; start += 1) {
      const phrase = source.slice(start, start + size).join(' ').trim();
      if (!phrase || phrase === normalizedTarget) continue;
      buildImageNameVariants(phrase).forEach(value => variants.add(value));
    }
  }

  return [...variants];
}

function handleItemImageError(imgEl) {
  if (!imgEl) return;

  const itemName = imgEl.dataset.itemName || imgEl.getAttribute('alt') || '';
  const nextSrc = getNextAutoImagePath(itemName, imgEl.src);

  if (nextSrc && !imgEl.dataset.triedSrcs?.includes(nextSrc)) {
    const tried = imgEl.dataset.triedSrcs ? `${imgEl.dataset.triedSrcs}|${nextSrc}` : nextSrc;
    imgEl.dataset.triedSrcs = tried;
    imgEl.src = nextSrc;
    return;
  }

  const cacheKey = getRemoteImageCacheKey(itemName);
  const cachedRemote = String(remoteImageUrlCache.get(cacheKey) || '');
  if (cachedRemote) {
    imgEl.onerror = null;
    imgEl.src = cachedRemote;
    return;
  }

  imgEl.onerror = null;
  imgEl.src = getNoImagePlaceholder();

  queueRemoteAutoImageLookup(itemName, (url) => {
    if (!url || !imgEl.isConnected) return;
    if ((imgEl.dataset.itemName || imgEl.getAttribute('alt') || '') !== itemName) return;
    imgEl.src = url;
  }).catch(() => {});
}

function getItemImage(item) {
  if (!item) return getNoImagePlaceholder();
  const explicit = resolveExplicitImageSource(item);
  if (explicit) return explicit;

  const cachedRemote = String(remoteImageUrlCache.get(getRemoteImageCacheKey(item.name || '')) || '');
  if (cachedRemote) return cachedRemote;

  queueRemoteAutoImageLookup(item.name || '').catch(() => {});
  return getAutoImagePath(item.name || '') || getNoImagePlaceholder();
}

function getItemImageSourceMeta(item) {
  const explicit = resolveExplicitImageSource(item);
  if (explicit) {
    if (isCloudImageUrl(explicit)) return { type: 'cloud', label: '☁️ Cloud', title: 'Bilden kommer från Firebase Storage' };
    if (isLocalImagePath(explicit)) return { type: 'images', label: '🖼️ Images', title: 'Bilden kommer från images-mappen' };
    if (isInlineImage(explicit)) return { type: 'inline', label: '📦 Lokal', title: 'Bilden är sparad lokalt i appdata' };
    return { type: 'external', label: '🔗 Länk', title: 'Bilden kommer från en extern länk' };
  }

  const cachedRemote = String(remoteImageUrlCache.get(getRemoteImageCacheKey(item?.name || '')) || '');
  if (cachedRemote) return { type: 'cloud', label: '☁️ Cloud', title: 'Bilden hittades automatiskt i Firebase Storage' };

  const autoImage = getAutoImagePath(item?.name || '');
  if (autoImage) return { type: 'images', label: '🖼️ Images', title: 'Bilden matchades automatiskt från images-mappen' };

  queueRemoteAutoImageLookup(item?.name || '').catch(() => {});
  return { type: 'default', label: '📄 Standard', title: 'Ingen egen bild hittades ännu. Appen testar även Firebase Storage i bakgrunden.' };
}

function showImageSourceInfo(sourceType = 'default') {
  const messages = {
    cloud: 'Bilden kommer från Firebase Storage.',
    images: 'Bilden kommer från images-mappen.',
    inline: 'Bilden är sparad lokalt i appens data.',
    external: 'Bilden kommer från en extern bildlänk.',
    default: 'Ingen egen bild hittades. Standardikonen visas.'
  };
  alert(messages[sourceType] || messages.default);
}

function getRecipeIngredientImage(ingredient) {
  if (!ingredient) return getNoImagePlaceholder();

  const explicit = resolveExplicitImageSource(ingredient);
  if (explicit) return explicit;

  const normalizedName = normalizeText(ingredient.name || '');
  const matchedItem = [...quickItems, ...items].find(entry => normalizeText(entry?.name || '') === normalizedName && entry?.img);
  const matchedExplicit = resolveExplicitImageSource(matchedItem);
  if (matchedExplicit) return matchedExplicit;

  const cachedRemote = String(remoteImageUrlCache.get(getRemoteImageCacheKey(ingredient.name || '')) || '');
  if (cachedRemote) return cachedRemote;

  queueRemoteAutoImageLookup(ingredient.name || '').catch(() => {});
  return getAutoImagePath(ingredient.name || '') || getNoImagePlaceholder();
}



// === SMART WEIGHT TEXT + TOTAL DISPLAY ===
const MAX_WEIGHT_GRAMS = 100000; // 100 kg
const MAX_LIQUID_ML = 100000; // 100 l

function getUnitFamily(unit) {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'g' || u === 'kg') return 'weight';
  if (['ml', 'dl', 'l', 'msk', 'tsk', 'krm'].includes(u)) return 'liquid';
  return '';
}

function getBaseUnitLimit(unit) {
  return getUnitFamily(unit) === 'liquid' ? MAX_LIQUID_ML : MAX_WEIGHT_GRAMS;
}

function unitToBaseMultiplier(unit) {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'kg' || u === 'l') return 1000;
  if (u === 'dl') return 100;
  if (u === 'msk') return 15;
  if (u === 'tsk') return 5;
  if (u === 'krm') return 1;
  return 1;
}

function parseSmartMeasureInput(text, unitHint = 'g') {
  const raw = String(text || '').trim().toLowerCase().replace(',', '.');
  if (!raw) return null;

  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|dl|l|krm|tsk|msk)?$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const hintFamily = getUnitFamily(unitHint);
  let suffix = (match[2] || String(unitHint || '')).toLowerCase();
  if (!suffix) suffix = hintFamily === 'liquid' ? 'ml' : 'g';

  const suffixFamily = getUnitFamily(suffix);
  if (!suffixFamily || (hintFamily && suffixFamily !== hintFamily)) return null;

  const baseValue = Math.round(value * unitToBaseMultiplier(suffix));
  if (!Number.isFinite(baseValue) || baseValue <= 0 || baseValue > getBaseUnitLimit(suffix)) return null;

  return baseValue;
}

function formatWeightDisplay(grams) {
  const value = Number(grams || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1000) {
    const kg = value / 1000;
    return `${kg.toFixed(kg % 1 === 0 ? 0 : 2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1').replace('.', ',')} kg`;
  }
  return `${Math.round(value)} g`;
}

function formatLiquidDisplay(ml) {
  const value = Number(ml || 0);
  if (!Number.isFinite(value) || value <= 0) return '';

  const fmt = (n) => String(Number(n.toFixed(2))).replace('.', ',');

  if (value >= 1000) {
    return `${fmt(value / 1000)} l`;
  }
  if (value >= 100) {
    return `${fmt(value / 100)} dl`;
  }
  if (value < 5 && Number.isInteger(value)) {
    return `${Math.round(value)} krm`;
  }
  if (value < 15 && value % 5 === 0) {
    return `${Math.round(value / 5)} tsk`;
  }
  if (value < 100 && value % 15 === 0) {
    return `${Math.round(value / 15)} msk`;
  }
  return `${Math.round(value)} ml`;
}

function formatSmartMeasureDisplay(baseValue, unitHint = 'g') {
  return getUnitFamily(unitHint) === 'liquid'
    ? formatLiquidDisplay(baseValue)
    : formatWeightDisplay(baseValue);
}

function getSmartMeasurePlaceholder(unit) {
  const u = String(unit || '').toLowerCase();
  if (u === 'kg' || u === 'l') return 'Mängd per st, t.ex. 1 eller 1,5';
  if (u === 'dl') return 'Mängd per st, t.ex. 5 eller 2,5';
  if (u === 'tsk') return 'Mängd per st, t.ex. 1 eller 2';
  if (u === 'msk') return 'Mängd per st, t.ex. 1 eller 2';
  if (u === 'krm') return 'Mängd per st, t.ex. 1 eller 3';
  return 'Mängd per st, t.ex. 500 eller 1,5';
}

function getMeasureInputError(unit) {
  return getUnitFamily(unit) === 'liquid'
    ? 'Skriv mängd per st. Du kan skriva bara 500 eller 1,5.'
    : 'Skriv vikt per st. Du kan skriva bara 500 eller 1,5.';
}

function getMeasureValidationMessage(baseValue, amount, unit) {
  const total = Number(baseValue || 0) * Math.max(1, Number(amount || 1));
  if (getUnitFamily(unit) === 'liquid' && total > MAX_LIQUID_ML) {
    return `Max 100 l per rad. Du försökte lägga in ${formatLiquidDisplay(total)}.`;
  }
  if (getUnitFamily(unit) === 'weight' && total > MAX_WEIGHT_GRAMS) {
    return `Max 100 kg per rad. Du försökte lägga in ${formatWeightDisplay(total)}.`;
  }
  return '';
}

function normalizeMeasureItemData(item, unitHint = null) {
  if (!item || !supportsSize(item.unit)) return item;
  const hint = unitHint || item.unit || 'g';
  const parsed = parseSmartMeasureInput(item.measureText || item.weightText || item.size, hint);
  if (!parsed) return item;
  const openedAmount = getUnitFamily(hint) === 'weight'
    ? Math.max(0, Math.min(parsed, Number(item?.openedAmount || 0)))
    : 0;
  return {
    ...item,
    unit: hint,
    size: parsed,
    measureText: formatSmartMeasureDisplay(parsed, hint),
    weightText: getUnitFamily(hint) === 'weight' ? formatSmartMeasureDisplay(parsed, hint) : '',
    openedAmount,
    packMode: getUnitFamily(hint) === 'weight' && (Number(item?.quantity || 0) > 1 || openedAmount > 0 || item?.packMode === 'bags') ? 'bags' : ''
  };
}

function getMeasureTextInput() {
  return document.getElementById('itemMeasureText');
}

function getMeasureSummaryEl() {
  return document.getElementById('itemMeasureSummary');
}

function updateMeasureSummary() {
  const amountEl = document.getElementById('itemQuantity');
  const unitEl = document.getElementById('itemUnit');
  const inputEl = getMeasureTextInput();
  const summaryEl = getMeasureSummaryEl();

  if (!amountEl || !unitEl || !inputEl || !summaryEl) return;

  const amount = Math.max(1, Number(amountEl.value || 1));
  const unit = unitEl.value;
  const parsed = parseSmartMeasureInput(inputEl.value, unit);

  if (!parsed || !supportsSize(unit)) {
    summaryEl.textContent = '';
    summaryEl.style.display = 'none';
    return;
  }

  const total = parsed * amount;
  const warning = getMeasureValidationMessage(parsed, amount, unit);
  summaryEl.textContent = warning || `${amount} × ${formatSmartMeasureDisplay(parsed, unit)} = ${formatSmartMeasureDisplay(total, unit)}`;
  summaryEl.style.display = 'block';
}

function syncMeasureModeVisibility() {
  const unitEl = document.getElementById('itemUnit');
  const sizeWrap = document.getElementById('itemSizeWrap');
  const measureWrap = document.getElementById('itemMeasureTextWrap');
  const inputEl = getMeasureTextInput();

  if (!unitEl || !sizeWrap || !measureWrap) return;

  const smartMode = supportsSize(unitEl.value);
  sizeWrap.style.display = smartMode ? 'none' : '';
  measureWrap.style.display = smartMode ? '' : 'none';

  if (inputEl) inputEl.placeholder = getSmartMeasurePlaceholder(unitEl.value);

  if (smartMode && inputEl?.value) {
    const parsed = parseSmartMeasureInput(inputEl.value, unitEl.value);
    if (parsed) inputEl.value = formatSmartMeasureDisplay(parsed, unitEl.value);
  }

  if (!smartMode && inputEl) inputEl.value = '';
  updateMeasureSummary();
}

function getEditMeasureTextInput() {
  return document.getElementById('editMeasureText');
}

function getEditMeasureSummaryEl() {
  return document.getElementById('editMeasureSummary');
}

function getIngredientEditMeasureTextInput() {
  return document.getElementById('ingredientEditMeasureText');
}

function getIngredientEditMeasureSummaryEl() {
  return document.getElementById('ingredientEditMeasureSummary');
}

function updateIngredientEditMeasureSummary() {
  const amountEl = document.getElementById('ingredientEditQty');
  const unitEl = document.getElementById('ingredientEditUnit');
  const inputEl = getIngredientEditMeasureTextInput();
  const summaryEl = getIngredientEditMeasureSummaryEl();

  if (!amountEl || !unitEl || !inputEl || !summaryEl) return;

  const amount = Math.max(1, Number(amountEl.value || 1));
  const unit = unitEl.value;
  const parsed = parseSmartMeasureInput(inputEl.value, unit);

  if (!parsed || !supportsSize(unit)) {
    summaryEl.textContent = '';
    summaryEl.style.display = 'none';
    return;
  }

  const total = parsed * amount;
  const warning = getMeasureValidationMessage(parsed, amount, unit);
  summaryEl.textContent = warning || `${amount} × ${formatSmartMeasureDisplay(parsed, unit)} = ${formatSmartMeasureDisplay(total, unit)}`;
  summaryEl.style.display = 'block';
}

function syncIngredientEditMeasureModeVisibility() {
  const unitEl = document.getElementById('ingredientEditUnit');
  const sizeWrap = document.getElementById('ingredientEditSizeWrap');
  const measureWrap = document.getElementById('ingredientEditMeasureTextWrap');
  const inputEl = getIngredientEditMeasureTextInput();

  if (!unitEl || !sizeWrap || !measureWrap) return;

  const smartMode = supportsSize(unitEl.value);
  sizeWrap.style.display = smartMode ? 'none' : '';
  measureWrap.style.display = smartMode ? '' : 'none';

  if (inputEl) inputEl.placeholder = getSmartMeasurePlaceholder(unitEl.value);

  if (smartMode && inputEl?.value) {
    const parsed = parseSmartMeasureInput(inputEl.value, unitEl.value);
    if (parsed) inputEl.value = formatSmartMeasureDisplay(parsed, unitEl.value);
  }

  if (!smartMode && inputEl) inputEl.value = '';
  updateIngredientEditMeasureSummary();
}

function updateEditMeasureSummary() {
  const amountEl = document.getElementById('editQuantity');
  const unitEl = document.getElementById('editUnit');
  const inputEl = getEditMeasureTextInput();
  const summaryEl = getEditMeasureSummaryEl();

  if (!amountEl || !unitEl || !inputEl || !summaryEl) return;

  const amount = Math.max(1, Number(amountEl.value || 1));
  const unit = unitEl.value;
  const parsed = parseSmartMeasureInput(inputEl.value, unit);

  if (!parsed || !supportsSize(unit)) {
    summaryEl.textContent = '';
    summaryEl.style.display = 'none';
    return;
  }

  const total = parsed * amount;
  const warning = getMeasureValidationMessage(parsed, amount, unit);
  summaryEl.textContent = warning || `${amount} × ${formatSmartMeasureDisplay(parsed, unit)} = ${formatSmartMeasureDisplay(total, unit)}`;
  summaryEl.style.display = 'block';
}

function syncEditMeasureModeVisibility() {
  const unitEl = document.getElementById('editUnit');
  const sizeWrap = document.getElementById('editSizeWrap');
  const measureWrap = document.getElementById('editMeasureTextWrap');
  const inputEl = getEditMeasureTextInput();

  if (!unitEl || !sizeWrap || !measureWrap) return;

  const smartMode = supportsSize(unitEl.value);
  sizeWrap.style.display = smartMode ? 'none' : '';
  measureWrap.style.display = smartMode ? '' : 'none';

  if (inputEl) inputEl.placeholder = getSmartMeasurePlaceholder(unitEl.value);

  if (smartMode && inputEl?.value) {
    const parsed = parseSmartMeasureInput(inputEl.value, unitEl.value);
    if (parsed) inputEl.value = formatSmartMeasureDisplay(parsed, unitEl.value);
  }

  if (!smartMode && inputEl) inputEl.value = '';
  updateEditMeasureSummary();
}

function formatMeasureInputField(inputEl, unit) {
  if (!inputEl) return null;
  const parsed = parseSmartMeasureInput(inputEl.value, unit);
  if (!parsed) return null;
  inputEl.value = formatSmartMeasureDisplay(parsed, unit);
  return parsed;
}

function getMeasureTextFromSize(size, unit) {
  const baseValue = Number(size || 0);
  return baseValue > 0 ? formatSmartMeasureDisplay(baseValue, unit) : '';
}

function getItemTotalWeightText(item) {
  const amount = Number(item?.quantity || item?.amount || 0);
  const unit = String(item?.unit || '');
  const parsed = Number(item?.size || parseSmartMeasureInput(item?.measureText || item?.weightText || '', unit) || 0);

  if (!amount || !parsed || !supportsSize(unit)) return '';
  const total = parsed * amount;
  return `${amount} × ${formatSmartMeasureDisplay(parsed, unit)} (${formatSmartMeasureDisplay(total, unit)})`;
}
// === END SMART WEIGHT TEXT + TOTAL DISPLAY ===



function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[0-9]+/g, ' ')
    .replace(/\b(st|g|kg|ml|l|pkt|msk|tsk|dl|cl)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuantity(text) {
  const match = String(text || '').match(/^(\d+)/);
  return match ? Number(match[1]) : 1;
}

function smartIngredientMatch(a, b) {
  return normalizeText(String(a || '').replace(/^(\d+)\s*(st|g|kg|ml|dl|l|pkt)?\s*/i, '')) === normalizeText(String(b || ''));
}

function getPlaceMeta(place, roomKey = activeRoom) {
  const fallbackPlace = getPlacesForRoom(roomKey)[0] || { key: 'kyl', label: '🧊 Kyl' };
  const found = findPlace(place, roomKey);
  if (!found) return { key: fallbackPlace.key, label: fallbackPlace.label, cls: 'place-custom' };

  const classMap = {
    kyl: 'place-kyl',
    frys: 'place-frys',
    kryddor: 'place-kryddor'
  };

  return {
    key: found.key,
    label: found.label,
    cls: classMap[found.key] || 'place-custom'
  };
}

function hydrateData() {
  items = Array.isArray(items) ? items : [];
  quickItems = Array.isArray(quickItems) ? quickItems : [];
  recipes = Array.isArray(recipes) ? recipes : [];
  ensureRoomConfigs();

  items = items.map(item => {
    const room = getAllRoomDefs().some(entry => entry.key === item?.room) ? item.room : (getAllRoomDefs()[0]?.key || 'koket');
    const fallbackPlace = getPlacesForRoom(room)[0]?.key || 'kyl';
    return {
      name: String(item?.name || '').trim(),
      price: Number(item?.price || 0),
      quantity: Math.max(0, Number(item?.quantity || 0)),
      unit: String(item?.unit || 'st'),
      size: normalizeSize(item?.unit || 'st', parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size),
      measureText: supportsSize(item?.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size, item?.unit || 'st') : '',
      weightText: isWeightUnit(item?.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size, item?.unit || 'st') : '',
      category: ensureCategoryExists(item?.category || getRoomFallbackCategory(room), room),
      place: ensurePlaceExists(item?.place || fallbackPlace, room),
      room,
      type: item?.type === 'buy' ? 'buy' : 'home',
      img: item?.img ? String(item.img) : getAutoImagePath(item?.name || ''),
      openedAmount: Math.max(0, Number(item?.openedAmount || 0)),
      packMode: item?.packMode === 'bags' ? 'bags' : ''
    };
  }).filter(item => item.name);

  quickItems = quickItems.map(item => {
    const room = getAllRoomDefs().some(entry => entry.key === item?.room) ? item.room : (getAllRoomDefs()[0]?.key || 'koket');
    const fallbackPlace = getPlacesForRoom(room)[0]?.key || 'kyl';
    return {
      name: String(item?.name || '').trim(),
      price: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      unit: String(item?.unit || 'st'),
      size: normalizeSize(item?.unit || 'st', parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size),
      measureText: supportsSize(item?.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size, item?.unit || 'st') : '',
      weightText: isWeightUnit(item?.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(item?.measureText || item?.weightText || item?.size, item?.unit || 'st') || item?.size, item?.unit || 'st') : '',
      category: ensureCategoryExists(item?.category || getRoomFallbackCategory(room), room),
      place: ensurePlaceExists(item?.place || fallbackPlace, room),
      room,
      type: 'home',
      img: item?.img ? String(item.img) : getAutoImagePath(item?.name || '')
    };
  }).filter(item => item.name);

  recipeCategories = [...new Set(
    recipeCategories.map(cat => normalizeRecipeCategory(cat)).filter(Boolean).concat(['matlagning', 'bakverk'])
  )];

  recipes = recipes.map(recipe => {
    const fallbackCategory = normalizeRecipeCategory(recipe?.category || recipe?.type || 'matlagning');
    return {
      name: String(recipe?.name || '').trim(),
      items: normalizeRecipeIngredientList(recipe?.items, recipe),
      link: String(recipe?.link || ''),
      type: normalizeRecipeType(recipe?.type || fallbackCategory),
      category: ensureRecipeCategoryExists(fallbackCategory),
      yield: normalizeRecipeYield(recipe?.yield, 4)
    };
  }).filter(recipe => recipe.name);

  refreshLegacyCollections();
  if (!getAllRoomDefs().some(room => room.key === activeRoom)) activeRoom = getAllRoomDefs()[0]?.key || 'koket';
}

function save() {
  refreshLegacyCollections();
  localStorage.setItem('matlista', JSON.stringify(items));
  localStorage.setItem('matlista_snabb', JSON.stringify(quickItems));
  localStorage.setItem('matlista_recept', JSON.stringify(recipes));
  localStorage.setItem('matlista_categories', JSON.stringify(categories));
  localStorage.setItem('matlista_recipe_categories', JSON.stringify(recipeCategories));
  localStorage.setItem('matlista_places', JSON.stringify(places));
  localStorage.setItem('matlista_room_configs', JSON.stringify(roomConfigs));
  localStorage.setItem('matlista_rooms', JSON.stringify(getAllRoomDefs()));
  localStorage.setItem('matlista_active_room', activeRoom);
  localStorage.setItem('matlista_active_place_filter', activePlaceFilter);
  localStorage.setItem('homeOpenState', JSON.stringify(homeOpenState));
  localStorage.setItem('matlista_recipe_choices', JSON.stringify(recipeIngredientChoices));
  localStorage.setItem('matlista_household_size', String(householdSize));
  localStorage.setItem('matlista_portion_grams', String(portionGrams));
  localStorage.setItem('matlista_weekplanner', JSON.stringify(weekPlanner));
  localStorage.setItem('matlista_weekplanner_selected', selectedWeekDay);
  localStorage.setItem('matlista_week_meal_order', JSON.stringify(weekMealOrder));

  window.items = items;
  window.quickItems = quickItems;
  window.recipes = recipes;
  window.categories = categories;
  window.recipeCategories = recipeCategories;
  window.places = places;
  window.roomConfigs = roomConfigs;
  window.roomDefs = getAllRoomDefs();
  window.activeRoom = activeRoom;
  window.activePlaceFilter = activePlaceFilter;
  window.homeOpenState = homeOpenState;
  window.recipeIngredientChoices = recipeIngredientChoices;
  window.householdSize = householdSize;
  window.portionGrams = portionGrams;
  window.weekPlanner = weekPlanner;
  window.selectedWeekDay = selectedWeekDay;
  window.weekMealOrder = weekMealOrder;
  window.activeKitchenPage = localStorage.getItem(PAGE_TAB_STORAGE_KEY) || 'home';
}

window.applyCloudState = function applyCloudState(data) {
  if (!data || typeof data !== 'object') return;

  if (Array.isArray(data.items)) items = data.items;
  if (Array.isArray(data.quickItems)) quickItems = data.quickItems;
  if (Array.isArray(data.recipes)) recipes = data.recipes;
  if (Array.isArray(data.categories)) categories = data.categories;
  if (Array.isArray(data.recipeCategories)) recipeCategories = data.recipeCategories;
  if (Array.isArray(data.places)) places = data.places;
  if (data.roomConfigs && typeof data.roomConfigs === 'object' && !Array.isArray(data.roomConfigs)) roomConfigs = data.roomConfigs;
  if (Array.isArray(data.roomDefs)) roomDefs = data.roomDefs;
  if (typeof data.activeRoom === 'string' && data.activeRoom) activeRoom = data.activeRoom;
  if (typeof data.activePlaceFilter === 'string') activePlaceFilter = data.activePlaceFilter;
  if (data.homeOpenState && typeof data.homeOpenState === 'object') homeOpenState = data.homeOpenState;
  if (data.recipeIngredientChoices && typeof data.recipeIngredientChoices === 'object') recipeIngredientChoices = data.recipeIngredientChoices;
  if (typeof data.householdSize !== 'undefined') householdSize = Math.max(1, Math.min(8, Number(data.householdSize || 1)));
  if (typeof data.portionGrams !== 'undefined') portionGrams = Math.max(1, Math.min(250, Math.round(Number(data.portionGrams || 100) || 100)));
  if (data.weekPlanner && typeof data.weekPlanner === 'object') weekPlanner = data.weekPlanner;
  if (typeof data.selectedWeekDay === 'string' && data.selectedWeekDay) selectedWeekDay = data.selectedWeekDay;
  if (Array.isArray(data.weekMealOrder)) weekMealOrder = data.weekMealOrder;

  if (typeof data.activeKitchenPage === 'string' && data.activeKitchenPage) {
    localStorage.setItem(PAGE_TAB_STORAGE_KEY, data.activeKitchenPage);
  }

  if (typeof data.theme === 'string' && data.theme) {
    localStorage.setItem('theme', data.theme);
  }

  hydrateData();
  save();

  if (typeof data.activeKitchenPage === 'string' && data.activeKitchenPage && typeof window.setActiveKitchenPage === 'function') {
    window.setActiveKitchenPage(data.activeKitchenPage, false);
  }
};

function syncQuickItemFromItem(changedItem) {
  const quick = quickItems.find(q => normalizeText(q.name) === normalizeText(changedItem.name));
  if (!quick) return;
  quick.room = changedItem.room || quick.room || activeRoom;
  quick.place = ensurePlaceExists(changedItem.place || quick.place || getPlacesForRoom(quick.room)[0]?.key || 'kyl', quick.room);
  quick.category = ensureCategoryExists(changedItem.category || quick.category || getRoomFallbackCategory(quick.room), quick.room);
  if (!quick.img && changedItem.img) quick.img = changedItem.img;
  if (Number(changedItem.price || 0) > 0) quick.price = Number(changedItem.price || 0);
  quick.unit = changedItem.unit || quick.unit || 'st';
  quick.size = normalizeSize(quick.unit, parseSmartMeasureInput(changedItem.measureText || changedItem.weightText || changedItem.size, quick.unit) || changedItem.size || quick.size);
  quick.measureText = supportsSize(quick.unit) ? getMeasureTextFromSize(quick.size, quick.unit) : '';
  quick.weightText = isWeightUnit(quick.unit) ? quick.measureText : '';
  quick.quantity = Math.max(1, Number(quick.quantity || 1));
}

function updateToggleButtons() {
  const quickBtn = document.getElementById('quickToggleBtn');
  const homeBtn = document.getElementById('homeToggleBtn');
  const buyBtn = document.getElementById('buyToggleBtn');
  const recipeBtn = document.getElementById('recipeToggleBtn');

  if (quickBtn) quickBtn.textContent = showQuick ? 'Dölj' : 'Visa';
  if (homeBtn) homeBtn.textContent = showHome ? 'Dölj' : 'Visa';
  if (buyBtn) buyBtn.textContent = showBuy ? 'Dölj' : 'Visa';
  if (recipeBtn) recipeBtn.textContent = showRecipes ? 'Dölj' : 'Visa';
}

function renderPlaceOptions() {
  const roomPlaces = getPlacesForRoom(activeRoom);
  const fallbackPlace = roomPlaces[0]?.key || 'kyl';
  document.querySelectorAll('[data-place-select]').forEach(select => {
    const current = select.dataset.currentValue || select.value || fallbackPlace;
    const fallback = findPlace(current, activeRoom) ? current : fallbackPlace;
    select.innerHTML = roomPlaces.map(place => `<option value="${place.key}">${place.label}</option>`).join('');
    select.value = fallback;
  });

  renderPlaceManager();
  renderHomePlaceTabs();
}

function renderPlaceManager() {
  const wrap = document.getElementById('placeChips');
  if (!wrap) return;

  const roomPlaces = getPlacesForRoom(activeRoom);
  const lockedKeys = lockedPlaceKeysByRoom[activeRoom] || [];
  wrap.innerHTML = '<div class="room-empty-hint">Platser i ' + getRoomLabel(activeRoom) + '</div>';

  roomPlaces.forEach(place => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';

    const label = document.createElement('span');
    label.textContent = place.label;
    chip.appendChild(label);

    if (!lockedKeys.includes(place.key)) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'chip-edit';
      editBtn.textContent = '✏️';
      editBtn.onclick = () => renamePlacePrompt(place.key);
      chip.appendChild(editBtn);
    }

    if (lockedKeys.includes(place.key)) {
      const lock = document.createElement('span');
      lock.className = 'chip-lock';
      lock.textContent = 'Låst';
      chip.appendChild(lock);
    } else {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'chip-delete';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = () => removePlace(place.key);
      chip.appendChild(deleteBtn);
    }

    wrap.appendChild(chip);
  });
}

function renamePlacePrompt(oldKey) {
  const cleanOld = normalizePlaceKey(oldKey);
  if (!cleanOld) return;
  if ((lockedPlaceKeysByRoom[activeRoom] || []).includes(cleanOld)) {
    alert('Den här platsen kan inte byta namn i detta rum.');
    return;
  }

  const current = findPlace(cleanOld, activeRoom);
  const next = prompt('Ändra namn på plats', current?.label || cleanOld);
  if (next === null) return;

  const label = cleanPlaceLabel(next);
  const key = normalizePlaceKey(label);
  if (!label || !key) {
    alert('Plats kan inte vara tom.');
    return;
  }

  if (key !== cleanOld && findPlace(key, activeRoom)) {
    alert('Plats finns redan i det här rummet.');
    return;
  }

  const roomConfig = getRoomConfig(activeRoom);
  roomConfig.places = roomConfig.places.map(place => place.key === cleanOld ? { key, label } : place);
  items.forEach(item => {
    if ((item.room || 'koket') === activeRoom && item.place === cleanOld) item.place = key;
  });
  quickItems.forEach(item => {
    if ((item.room || 'koket') === activeRoom && item.place === cleanOld) item.place = key;
  });
  if (activePlaceFilter === cleanOld) activePlaceFilter = key;
  if (homeOpenState[cleanOld]) {
    homeOpenState[key] = homeOpenState[cleanOld];
    delete homeOpenState[cleanOld];
  }
  save();
  render();
}

function addPlace() {
  const input = document.getElementById('newPlaceName');
  if (!input) return;

  const label = cleanPlaceLabel(input.value);
  const key = normalizePlaceKey(label);
  if (!label || !key) return;

  if (findPlace(key, activeRoom)) {
    alert('Plats finns redan i det här rummet.');
    input.value = '';
    return;
  }

  getRoomConfig(activeRoom).places.push({ key, label });
  save();
  renderPlaceOptions();
  input.value = '';
}

function removePlace(key) {
  const roomPlacesNow = getPlacesForRoom(activeRoom);
  if (roomPlacesNow.length <= 1) {
    alert('Rummet måste ha minst en plats kvar.');
    return;
  }

  const clean = normalizePlaceKey(key);
  if (!clean) return;

  const lockedKeys = lockedPlaceKeysByRoom[activeRoom] || [];
  if (lockedKeys.includes(clean)) {
    alert('Den här platsen kan inte tas bort i detta rum.');
    return;
  }

  const roomPlaces = getPlacesForRoom(activeRoom);
  const fallbackPlace = roomPlaces.find(place => place.key !== clean)?.key || roomPlaces[0]?.key || 'kyl';
  getRoomConfig(activeRoom).places = roomPlaces.filter(place => place.key !== clean);

  items.forEach(item => {
    if ((item.room || 'koket') === activeRoom && item.place === clean) item.place = fallbackPlace;
  });

  quickItems.forEach(item => {
    if ((item.room || 'koket') === activeRoom && item.place === clean) item.place = fallbackPlace;
  });

  delete homeOpenState[clean];
  if (activePlaceFilter === clean) activePlaceFilter = '';
  save();
  render();
}

function renderCategoryOptions() {
  const roomCategories = getCategoriesForRoom(activeRoom);
  document.querySelectorAll('[data-category-select]').forEach(select => {
    const fallbackCategory = getRoomFallbackCategory(activeRoom);
    const current = select.dataset.currentValue || select.value || fallbackCategory;
    const fallback = roomCategories.includes(current) ? current : fallbackCategory;
    select.innerHTML = roomCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    select.value = fallback;
  });

  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    const current = categoryFilter.dataset.currentValue || categoryFilter.value || '';
    categoryFilter.innerHTML = '<option value="">Alla kategorier</option>' + roomCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    categoryFilter.value = roomCategories.includes(current) ? current : '';
  }

  renderCategoryManager();
  renderRecipeCategoryOptions();
}

function renderCategoryManager() {
  const wrap = document.getElementById('categoryChips');
  if (!wrap) return;

  wrap.innerHTML = '<div class="room-empty-hint">Kategorier i ' + getRoomLabel(activeRoom) + '</div>';
  const roomCategories = getCategoriesForRoom(activeRoom);

  roomCategories.forEach(category => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';

    const label = document.createElement('span');
    label.textContent = category;
    chip.appendChild(label);

    const fallbackCategory = getRoomFallbackCategory(activeRoom);
    if (category !== fallbackCategory) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'chip-edit';
      editBtn.textContent = '✏️';
      editBtn.onclick = () => renameCategoryPrompt(category);
      chip.appendChild(editBtn);
    }

    if (category === fallbackCategory) {
      const lock = document.createElement('span');
      lock.className = 'chip-lock';
      lock.textContent = 'Fallback';
      chip.appendChild(lock);
    } else {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'chip-delete';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = () => removeCategory(category);
      chip.appendChild(deleteBtn);
    }

    wrap.appendChild(chip);
  });
}

function renderRecipeCategoryOptions() {
  const recipeCategory = document.getElementById('recipeCategory');
  if (recipeCategory) {
    const current = recipeCategory.dataset.currentValue || recipeCategory.value || 'matlagning';
    recipeCategory.innerHTML = recipeCategories
      .map(cat => `<option value="${cat}">${getRecipeCategoryMeta(cat).icon} ${getRecipeCategoryLabel(cat)}</option>`)
      .join('');
    recipeCategory.value = recipeCategories.includes(current) ? current : 'matlagning';
  }

  const recipeCategoryFilter = document.getElementById('recipeCategoryFilter');
  if (recipeCategoryFilter) {
    const current = recipeCategoryFilter.dataset.currentValue || recipeCategoryFilter.value || recipeCategoryEditState.activeFilter || '';
    recipeCategoryFilter.innerHTML = '<option value="">Alla kategorier</option>' + recipeCategories
      .map(cat => `<option value="${cat}">${getRecipeCategoryMeta(cat).icon} ${getRecipeCategoryLabel(cat)}</option>`)
      .join('');
    recipeCategoryFilter.value = recipeCategories.includes(current) ? current : '';
    recipeCategoryEditState.activeFilter = recipeCategoryFilter.value || '';
  }

  renderRecipeCategoryManager();
  refreshPortionSelectLabels(getSelectedRecipe());
}

function renderRecipeCategoryManager() {
  const wrap = document.getElementById('recipeCategoryChips');
  if (!wrap) return;

  const active = recipeCategoryEditState.activeFilter || '';
  wrap.innerHTML = '';

  const allChip = document.createElement('div');
  allChip.className = `category-chip category-chip-filter ${active === '' ? 'active' : ''}`;
  allChip.innerHTML = `<button type="button" class="chip-filter-btn" onclick="setRecipeCategoryFilter('')">Alla kategorier</button>`;
  wrap.appendChild(allChip);

  recipeCategories.forEach(category => {
    const chip = document.createElement('div');
    const locked = category === 'matlagning' || category === 'bakverk';
    const label = `${getRecipeCategoryMeta(category).icon} ${getRecipeCategoryLabel(category)}`;
    chip.className = `category-chip category-chip-filter ${active === category ? 'active' : ''}`;

    chip.innerHTML = `
      <button type="button" class="chip-filter-btn" onclick="setRecipeCategoryFilter('${category.replace(/'/g, "\\'")}')">${label}</button>
      <button type="button" class="chip-edit" onclick="renameRecipeCategoryPrompt('${category.replace(/'/g, "\\'")}')">✏️</button>
      ${locked ? '<span class="chip-lock">Fallback</span>' : `<button type="button" class="chip-delete" onclick="removeRecipeCategory('${category.replace(/'/g, "\\'")}')">×</button>`}
    `;
    wrap.appendChild(chip);
  });
}

function setRecipeCategoryFilter(value) {
  const normalized = value ? normalizeRecipeCategory(value) : '';
  recipeCategoryEditState.activeFilter = normalized;
  const recipeCategoryFilter = document.getElementById('recipeCategoryFilter');
  if (recipeCategoryFilter) {
    recipeCategoryFilter.value = normalized;
  }
  renderRecipeCategoryManager();
  renderRecipeSelect();
  clearRecipeResult();
}

function addRecipeCategory() {
  const input = document.getElementById('newRecipeCategoryName');
  if (!input) return;

  const clean = normalizeRecipeCategory(input.value || '');
  if (!clean) return;

  if (recipeCategories.includes(clean)) {
    alert('Receptkategori finns redan.');
    input.value = '';
    return;
  }

  recipeCategories.push(clean);
  save();
  input.value = '';
  renderRecipeCategoryOptions();
  setRecipeCategoryFilter(clean);
}

function renameRecipeCategoryPrompt(oldName) {
  const cleanOld = normalizeRecipeCategory(oldName);
  if (!cleanOld) return;

  const next = prompt('Ändra namn på receptkategori', getRecipeCategoryLabel(cleanOld));
  if (next === null) return;

  const cleanNew = normalizeRecipeCategory(next);
  if (!cleanNew) {
    alert('Kategori kan inte vara tom.');
    return;
  }

  if (cleanNew === cleanOld) return;

  if (recipeCategories.includes(cleanNew)) {
    alert('Receptkategori finns redan.');
    return;
  }

  recipeCategories = recipeCategories.map(cat => cat === cleanOld ? cleanNew : cat);

  recipes.forEach(recipe => {
    if (normalizeRecipeCategory(recipe.category) === cleanOld) {
      recipe.category = cleanNew;
    }
    if (normalizeRecipeType(recipe.type) === cleanOld) {
      recipe.type = cleanNew === 'bakverk' ? 'bakverk' : 'matlagning';
    }
  });

  if (recipeCategoryEditState.activeFilter === cleanOld) {
    recipeCategoryEditState.activeFilter = cleanNew;
  }

  const recipeCategory = document.getElementById('recipeCategory');
  if (recipeCategory && normalizeRecipeCategory(recipeCategory.value) === cleanOld) {
    recipeCategory.dataset.currentValue = cleanNew;
  }

  const recipeCategoryFilter = document.getElementById('recipeCategoryFilter');
  if (recipeCategoryFilter && normalizeRecipeCategory(recipeCategoryFilter.value) === cleanOld) {
    recipeCategoryFilter.dataset.currentValue = cleanNew;
  }

  save();
  renderRecipeCategoryOptions();
  renderRecipeSelect();
  renderSelectedRecipeIngredients();
}

function removeRecipeCategory(name) {
  const clean = normalizeRecipeCategory(name);
  if (!clean) return;

  if (clean === 'matlagning' || clean === 'bakverk') {
    alert('Matlagning och Bakverk kan inte tas bort. De används som fallback.');
    return;
  }

  recipeCategories = recipeCategories.filter(cat => cat !== clean);

  recipes.forEach(recipe => {
    if (normalizeRecipeCategory(recipe.category) === clean) {
      recipe.category = getRecipeFallbackCategory(recipe);
    }
  });

  if (recipeCategoryEditState.activeFilter === clean) {
    recipeCategoryEditState.activeFilter = '';
  }

  save();
  renderRecipeCategoryOptions();
  renderRecipeSelect();
  renderSelectedRecipeIngredients();
}

function renameCategoryPrompt(oldName) {
  const cleanOld = String(oldName || '').trim().toUpperCase();
  if (!cleanOld) return;
  if (cleanOld === getRoomFallbackCategory(activeRoom)) {
    alert(getRoomFallbackCategory(activeRoom) + ' kan inte byta namn.');
    return;
  }

  const next = prompt('Ändra namn på kategori', cleanOld);
  if (next === null) return;

  const cleanNew = String(next || '').trim().toUpperCase();
  if (!cleanNew) {
    alert('Kategori kan inte vara tom.');
    return;
  }

  if (cleanNew === cleanOld) return;

  const roomConfig = getRoomConfig(activeRoom);
  if (roomConfig.categories.includes(cleanNew)) {
    alert('Kategori finns redan i det här rummet.');
    return;
  }

  roomConfig.categories = roomConfig.categories.map(cat => cat === cleanOld ? cleanNew : cat);
  items.forEach(item => {
    if ((item.room || 'koket') === activeRoom && String(item.category || '').trim().toUpperCase() === cleanOld) item.category = cleanNew;
  });
  quickItems.forEach(item => {
    if ((item.room || 'koket') === activeRoom && String(item.category || '').trim().toUpperCase() === cleanOld) item.category = cleanNew;
  });
  save();
  render();
}

function addCategory() {
  const input = document.getElementById('newCategoryName');
  if (!input) return;

  const clean = String(input.value || '').trim().toUpperCase();
  if (!clean) return;

  const roomConfig = getRoomConfig(activeRoom);
  if (roomConfig.categories.includes(clean)) {
    alert('Kategori finns redan i det här rummet.');
    input.value = '';
    return;
  }

  roomConfig.categories.push(clean);
  save();
  renderCategoryOptions();
  input.value = '';
}

function removeCategory(name) {
  const clean = String(name || '').trim().toUpperCase();
  if (!clean) return;

  const roomCategories = getCategoriesForRoom(activeRoom);
  if (roomCategories.length <= 1) {
    alert('Rummet måste ha minst en kategori kvar.');
    return;
  }

  const fallbackCategory = getRoomFallbackCategory(activeRoom);
  if (clean === fallbackCategory) {
    alert(fallbackCategory + ' kan inte tas bort. Den används som fallback i rummet.');
    return;
  }

  const roomConfig = getRoomConfig(activeRoom);
  roomConfig.categories = roomCategories.filter(cat => String(cat || '').trim().toUpperCase() !== clean);

  items.forEach(item => {
    if ((item.room || 'koket') === activeRoom && String(item.category || '').trim().toUpperCase() === clean) {
      item.category = fallbackCategory;
    }
  });

  quickItems.forEach(item => {
    if ((item.room || 'koket') === activeRoom && String(item.category || '').trim().toUpperCase() === clean) {
      item.category = fallbackCategory;
    }
  });

  const itemCategory = document.getElementById('itemCategory');
  if (itemCategory && String(itemCategory.value || '').trim().toUpperCase() === clean) {
    itemCategory.dataset.currentValue = fallbackCategory;
    itemCategory.value = fallbackCategory;
  }

  const editCategory = document.getElementById('editCategory');
  if (editCategory && String(editCategory.value || '').trim().toUpperCase() === clean) {
    editCategory.dataset.currentValue = fallbackCategory;
    editCategory.value = fallbackCategory;
  }

  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter && String(categoryFilter.value || '').trim().toUpperCase() === clean) {
    categoryFilter.value = '';
    categoryFilter.dataset.currentValue = '';
  }

  save();
  renderCategoryOptions();
  render();
}

function pickGallery() {
  const input = document.getElementById('itemImage');
  if (!input) return;
  input.removeAttribute('capture');
  input.click();
}

function pickCamera() {
  const input = document.getElementById('itemImage');
  if (!input) return;
  input.setAttribute('capture', 'environment');
  input.click();
}

function resizeImage(file, callback) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Kunde inte läsa bildfilen.'));
    reader.onload = event => {
      const img = new Image();
      img.onerror = () => reject(new Error('Kunde inte öppna bilden.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 220;
        let { width, height } = img;

        if (width > height && width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        } else if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (typeof callback === 'function') callback(dataUrl);
        resolve(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function processPickedImageFile(file, itemName = 'vara') {
  if (!file) return Promise.resolve('');
  return resizeImage(file).then(dataUrl => uploadItemImageToCloud(dataUrl, itemName));
}

let imageMigrationRunning = false;
let imageMigrationQueued = false;

function normalizeMigratedImageLists() {
  let changed = false;
  quickItems.forEach(sourceItem => {
    if (!sourceItem?.img) return;
    const src = String(sourceItem.img || '');
    items.forEach(item => {
      if (normalizeText(item?.name || '') === normalizeText(sourceItem.name || '') && item.img !== src) {
        item.img = src;
        changed = true;
      }
    });
  });
  return changed;
}

function migrateInlineImagesToCloud(force = false) {
  if (!canUploadImagesToCloud()) return Promise.resolve(false);
  if (imageMigrationRunning) {
    imageMigrationQueued = imageMigrationQueued || force;
    return Promise.resolve(false);
  }

  const migrationKey = `matlista_img_migrated_${getCloudUserUid()}`;
  if (!force && localStorage.getItem(migrationKey) === 'done') return Promise.resolve(false);

  const groups = new Map();
  [quickItems, items].forEach(list => {
    list.forEach(item => {
      if (!item || !isInlineImage(item.img)) return;
      const key = String(item.img || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
  });

  const targets = [...groups.entries()].map(([dataUrl, entries]) => ({
    dataUrl,
    entries,
    name: entries[0]?.name || 'vara'
  }));

  if (!targets.length) {
    localStorage.setItem(migrationKey, 'done');
    return Promise.resolve(false);
  }

  imageMigrationRunning = true;
  return targets.reduce((promise, entry) => {
    return promise.then(changed => {
      return uploadItemImageToCloud(entry.dataUrl, entry.name).then(url => {
        const finalUrl = String(url || entry.dataUrl || '');
        entry.entries.forEach(item => {
          if (item && item.img !== finalUrl) {
            item.img = finalUrl;
            changed = true;
          }
        });
        return changed;
      });
    });
  }, Promise.resolve(false)).then(changed => {
    if (normalizeMigratedImageLists()) changed = true;
    if (changed) {
      save();
      try { if (typeof window.saveToCloudNow === 'function') window.saveToCloudNow(); } catch (error) {}
      try { render(); } catch (error) {}
    }
    localStorage.setItem(migrationKey, 'done');
    return changed;
  }).catch(error => {
    console.error('Image migration error:', error);
    return false;
  }).finally(() => {
    imageMigrationRunning = false;
    const rerun = imageMigrationQueued;
    imageMigrationQueued = false;
    if (rerun) setTimeout(() => migrateInlineImagesToCloud(true), 400);
  });
}

function getDinnerWeightFromItem(item) {
  if (!item || item.type !== 'home') return 0;

  const category = normalizeCategoryName(item.category);
  if (!['KÖTT', 'KOTT', 'KÖTTFÄRS', 'KOTTFARS', 'KYCKLING'].includes(category)) return 0;

  const quantity = Math.max(0, Number(item.quantity || 0));
  if (quantity <= 0) return 0;

  if (isWeightUnit(item.unit)) {
    const size = Number(normalizeSize(item.unit, item.size, item.category) || 0);
    if (size > 0) return quantity * size;
  }

  return quantity * 250;
}

function updateHouseholdSize(value) {
  householdSize = Math.max(1, Math.min(8, Number(value || 1)));
  save();
  updateSummary();
  refreshPortionSelectLabels(getSelectedRecipe());
  clearRecipeResult();
  renderSelectedRecipeIngredients();
}

function setPortionGramsPreset(value) {
  updatePortionGrams(value);
}

function updatePortionGrams(value, live = false) {
  const input = document.getElementById('portionGrams');
  const parsed = Math.round(Number(value || 0));

  if (!Number.isFinite(parsed) || parsed < 1) {
    if (!live) {
      if (input) input.value = String(portionGrams);
      updateSummary();
    }
    return;
  }

  portionGrams = Math.max(1, Math.min(250, parsed));
  if (input && input.value !== String(portionGrams)) input.value = String(portionGrams);
  save();
  updateSummary();
  refreshPortionSelectLabels(getSelectedRecipe());
  clearRecipeResult();
  renderSelectedRecipeIngredients();
}

function updateSummary() {
  const homeItems = items.filter(i => i.type === 'home');
  const buyItems = items.filter(i => i.type === 'buy');
  const homeCount = document.getElementById('homeCount');
  const buyCount = document.getElementById('buyCount');
  const buyCost = document.getElementById('buyCost');
  const dinnerCount = document.getElementById('dinnerCount');
  const householdSelect = document.getElementById('householdSize');
  const portionGramsInput = document.getElementById('portionGrams');
  const portionLiveSummary = document.getElementById('portionLiveSummary');

  if (homeCount) homeCount.textContent = homeItems.length;
  if (buyCount) buyCount.textContent = buyItems.length;
  if (buyCost) {
    const total = buyItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
    buyCost.textContent = `${total} kr`;
  }

  if (householdSelect) householdSelect.value = String(householdSize);
  if (portionGramsInput) portionGramsInput.value = String(portionGrams);

  document.querySelectorAll('.portion-chip').forEach(btn => {
    const isActive = Number(btn.textContent.replace(/[^0-9]/g, '')) === Number(portionGrams);
    btn.classList.toggle('active', isActive);
  });

  if (portionLiveSummary) {
    const totalLive = Math.max(1, householdSize * portionGrams);
    portionLiveSummary.textContent = `${householdSize} × ${portionGrams}g = ${totalLive}g`;
  }

  if (dinnerCount) {
    const totalDinnerWeight = homeItems.reduce((sum, item) => sum + getDinnerWeightFromItem(item), 0);
    const gramsPerDinner = Math.max(1, portionGrams * householdSize);
    const totalDinners = Math.floor(totalDinnerWeight / gramsPerDinner);
    dinnerCount.textContent = `${totalDinners} st`;
  }
}

function dragStartItem(index, source) {
  draggedItemIndex = index;
  draggedItemSource = source;
}

function dragEndItem() {
  draggedItemIndex = null;
  draggedItemSource = null;
}

function allowDrop(event) {
  event.preventDefault();
  event.currentTarget?.classList.add('drop-hover');
}

function removeDropHover(event) {
  event.currentTarget?.classList.remove('drop-hover');
}

function mergeItems(list) {
  return list.reduce((acc, current) => {
    const existing = acc.find(item => sameVariant(item, current));

    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Number(current.quantity || 0);
      if (isWeightUnit(existing.unit)) {
        existing.openedAmount = Math.max(0, Number(existing.openedAmount || 0)) + Math.max(0, Number(current.openedAmount || 0));
        const packSize = Math.max(0, Number(existing.size || current.size || 0));
        while (packSize > 0 && existing.openedAmount >= packSize) {
          existing.quantity += 1;
          existing.openedAmount -= packSize;
        }
        existing.packMode = (existing.quantity > 1 || existing.openedAmount > 0 || current.packMode === 'bags') ? 'bags' : '';
      }
      if (!existing.img && current.img) existing.img = current.img;
      if (Number(existing.price || 0) === 0 && Number(current.price || 0) > 0) existing.price = Number(current.price || 0);
      existing.category = existing.category || current.category || getRoomFallbackCategory(current.room || activeRoom);
      existing.size = normalizeSize(existing.unit, existing.size || current.size);
    } else {
      acc.push({ ...current, size: normalizeSize(current.unit, current.size) });
    }
    return acc;
  }, []);
}

function addHomeItemFromTemplate(sourceItem, quantity = 1, targetPlace = null) {
  if (!sourceItem) return;

  const copy = {
    name: sourceItem.name || '',
    price: Number(sourceItem.price || 0),
    quantity: Math.max(1, Number(quantity || 1)),
    unit: sourceItem.unit || 'st',
    size: normalizeSize(sourceItem.unit || 'st', parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size),
    measureText: supportsSize(sourceItem.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size, sourceItem.unit || 'st') : '',
    weightText: isWeightUnit(sourceItem.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size, sourceItem.unit || 'st') : '',
    category: ensureCategoryExists(sourceItem.category || getRoomFallbackCategory(sourceItem.room || activeRoom), sourceItem.room || activeRoom),
    place: ensurePlaceExists(targetPlace || sourceItem.place || 'kyl'),
    type: 'home',
    img: sourceItem.img ? String(sourceItem.img) : '',
    openedAmount: Math.max(0, Number(sourceItem.openedAmount || 0)),
    packMode: isWeightUnit(sourceItem.unit || 'st') && (Number(quantity || sourceItem.quantity || 0) > 1 || Number(sourceItem.openedAmount || 0) > 0 || sourceItem.packMode === 'bags') ? 'bags' : ''
  };

  const existing = items.find(entry =>
    entry.type === 'home' && sameVariant(entry, copy)
  );

  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + Number(copy.quantity || 0);
    existing.openedAmount = Math.max(0, Number(existing.openedAmount || 0)) + Math.max(0, Number(copy.openedAmount || 0));
    while (Number(existing.size || 0) > 0 && existing.openedAmount >= Number(existing.size || 0)) {
      existing.quantity += 1;
      existing.openedAmount -= Number(existing.size || 0);
    }
    existing.packMode = isWeightUnit(existing.unit) && (existing.quantity > 1 || existing.openedAmount > 0 || existing.packMode === 'bags' || copy.packMode === 'bags') ? 'bags' : '';
    existing.price = Number(copy.price || existing.price || 0);
    existing.category = copy.category;
    if (copy.img) existing.img = copy.img;
    syncQuickItemFromItem(existing);
  } else {
    items.push(copy);
    syncQuickItemFromItem(copy);
  }
}

function addBuyItemFromTemplate(sourceItem, quantity = 1) {
  if (!sourceItem) return;

  const copy = {
    name: sourceItem.name || '',
    price: Number(sourceItem.price || 0),
    quantity: Math.max(1, Number(quantity || 1)),
    unit: sourceItem.unit || 'st',
    size: normalizeSize(sourceItem.unit || 'st', parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size),
    measureText: supportsSize(sourceItem.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size, sourceItem.unit || 'st') : '',
    weightText: isWeightUnit(sourceItem.unit || 'st') ? getMeasureTextFromSize(parseSmartMeasureInput(sourceItem.measureText || sourceItem.weightText || sourceItem.size, sourceItem.unit || 'st') || sourceItem.size, sourceItem.unit || 'st') : '',
    category: ensureCategoryExists(sourceItem.category || getRoomFallbackCategory(sourceItem.room || activeRoom), sourceItem.room || activeRoom),
    place: ensurePlaceExists(sourceItem.place || 'kyl'),
    type: 'buy',
    img: sourceItem.img ? String(sourceItem.img) : '',
    openedAmount: 0,
    packMode: ''
  };

  const existing = items.find(entry =>
    entry.type === 'buy' && sameVariant(entry, copy)
  );

  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + Number(copy.quantity || 0);
    existing.price = Number(copy.price || existing.price || 0);
    existing.category = copy.category;
    if (copy.img && !existing.img) existing.img = copy.img;
  } else {
    items.push(copy);
  }
}

function getTransferQuantity(sourceItem, targetType) {
  if (!sourceItem) return 1;

  const normalizedTargetType = targetType === 'buy' ? 'buy' : 'home';
  const sourceType = sourceItem.type === 'buy' ? 'buy' : 'home';
  const currentQuantity = Math.max(1, Number(sourceItem.quantity || 1));
  const unit = String(sourceItem.unit || 'st').toLowerCase();

  if (sourceType === 'buy' && normalizedTargetType === 'home' && unit === 'st') {
    return currentQuantity;
  }

  return 1;
}

function transferSingleItem(index, targetType, targetPlace = null) {
  const sourceItem = items[index];
  if (!sourceItem) return;

  const sourceType = sourceItem.type === 'buy' ? 'buy' : 'home';
  const normalizedTargetType = targetType === 'buy' ? 'buy' : 'home';
  const resolvedTargetPlace = normalizedTargetType === 'home'
    ? ensurePlaceExists(targetPlace || sourceItem.place || 'kyl')
    : ensurePlaceExists(sourceItem.place || 'kyl');

  if (sourceType === normalizedTargetType) {
    if (normalizedTargetType !== 'home') return;
    if ((sourceItem.place || 'kyl') === resolvedTargetPlace) return;
  }

  const transferQuantity = getTransferQuantity(sourceItem, normalizedTargetType);
  const movedItem = {
    ...sourceItem,
    quantity: transferQuantity,
    type: normalizedTargetType,
    place: resolvedTargetPlace
  };

  if (normalizedTargetType === 'home') addHomeItemFromTemplate(movedItem, transferQuantity, resolvedTargetPlace);
  else addBuyItemFromTemplate(movedItem, transferQuantity);

  sourceItem.quantity = Math.max(0, Number(sourceItem.quantity || 0) - transferQuantity);

  if (sourceItem.quantity === 0) {
    items.splice(index, 1);
  } else {
    syncQuickItemFromItem(sourceItem);
  }

  items = mergeItems(items);
}

function startQuickAdd(index) {
  stopQuickAdd();
  holdAddTriggered = false;
  holdAddTimeout = setTimeout(() => {
    holdAddTriggered = true;
    useQuickItem(index);
    holdAddInterval = setInterval(() => useQuickItem(index), 220);
  }, 450);
}

function stopQuickAdd() {
  if (holdAddTimeout) clearTimeout(holdAddTimeout);
  if (holdAddInterval) clearInterval(holdAddInterval);
  holdAddTimeout = null;
  holdAddInterval = null;
}

function finishQuickAdd(index) {
  const wasHold = holdAddTriggered;
  stopQuickAdd();
  if (!wasHold) useQuickItem(index);
  holdAddTriggered = false;
}

function dropToQuickList() {
  const quickList = document.getElementById('quickList');
  if (quickList) quickList.classList.remove('drop-hover');

  if (draggedItemIndex === null || draggedItemSource !== 'items') return;

  const item = items[draggedItemIndex];
  if (!item) return;

  const exists = quickItems.find(q => normalizeText(q.name) === normalizeText(item.name));
  if (!exists) {
    quickItems.unshift({
      name: item.name || '',
      price: Number(item.price || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit: item.unit || 'st',
      size: normalizeSize(item.unit || 'st', item.size),
      measureText: supportsSize(item.unit || 'st') ? getMeasureTextFromSize(item.size, item.unit || 'st') : '',
      weightText: isWeightUnit(item.unit || 'st') ? getMeasureTextFromSize(item.size, item.unit || 'st') : '',
      category: ensureCategoryExists(item.category || getRoomFallbackCategory(item.room || activeRoom), item.room || activeRoom),
      place: item.place || 'kyl',
      type: 'home',
      img: item.img ? String(item.img) : ''
    });
  }

  save();
  render();
  dragEndItem();
}

function dropToList(targetType, targetPlace = null) {
  document.querySelectorAll('.container').forEach(el => el.classList.remove('drop-hover'));
  if (draggedItemIndex === null || !draggedItemSource) return;

  if (draggedItemSource === 'quick') {
    const sourceItem = quickItems[draggedItemIndex];
    if (!sourceItem) return;

    if (targetType === 'home') addHomeItemFromTemplate(sourceItem, 1, targetPlace);
    else addBuyItemFromTemplate(sourceItem, 1);

    save();
    render();
    dragEndItem();
    return;
  }

  if (draggedItemSource === 'items') {
    transferSingleItem(draggedItemIndex, targetType, targetPlace);
    save();
    render();
    dragEndItem();
  }
}

function changeQuickPlace(index, newPlace) {
  const item = quickItems[index];
  if (!item) return;

  const itemRoom = item.room || activeRoom;
  item.place = ensurePlaceExists(newPlace || 'kyl', itemRoom);
  items.forEach(entry => {
    if (normalizeText(entry.name) === normalizeText(item.name)) entry.place = item.place;
  });

  save();
  render();
}

function changeQuickCategory(index, newCategory) {
  const item = quickItems[index];
  if (!item) return;

  item.category = ensureCategoryExists(newCategory || getRoomFallbackCategory(item.room || activeRoom), item.room || activeRoom);
  items.forEach(entry => {
    if (normalizeText(entry.name) === normalizeText(item.name)) entry.category = item.category;
  });

  save();
  render();
}

function getQuickItemSearchHaystack(item) {
  const roomKey = item?.room || activeRoom;
  const roomLabel = getRoomLabel(roomKey);
  const placeLabel = getPlaceMeta(item?.place, roomKey).label;
  return `${item?.name || ''} ${roomLabel || ''} ${item?.category || ''} ${placeLabel || ''} ${item?.place || ''}`.toLowerCase();
}

function matchesSearch(item, textSearch, categoryFilter) {
  const search = String(textSearch || '').toLowerCase().trim();
  if (categoryFilter && item.category !== categoryFilter) return false;
  if (!search) return true;
  const hay = `${item.name || ''} ${item.category || ''} ${item.place || ''}`.toLowerCase();
  return hay.includes(search);
}

function compareQuickItemsByName(a, b) {
  const nameCompare = String(a?.name || '').localeCompare(String(b?.name || ''), 'sv', { sensitivity: 'base', numeric: true });
  if (nameCompare !== 0) return nameCompare;

  const roomCompare = getRoomLabel(a?.room || activeRoom).localeCompare(getRoomLabel(b?.room || activeRoom), 'sv', { sensitivity: 'base', numeric: true });
  if (roomCompare !== 0) return roomCompare;

  const categoryCompare = String(a?.category || '').localeCompare(String(b?.category || ''), 'sv', { sensitivity: 'base', numeric: true });
  if (categoryCompare !== 0) return categoryCompare;

  return getPlaceMeta(a?.place, a?.room || activeRoom).label.localeCompare(getPlaceMeta(b?.place, b?.room || activeRoom).label, 'sv', { sensitivity: 'base', numeric: true });
}

function createRoomBadge(roomKey = activeRoom) {
  const theme = getRoomTheme(roomKey);
  return `<div class="room-badge">${theme.icon} ${getRoomLabel(roomKey)}</div>`;
}

function createCategorySelect(current, onchangeCode, roomKey = activeRoom) {
  const roomCategories = getCategoriesForRoom(roomKey);
  const options = roomCategories.map(cat => `<option value="${cat}" ${current === cat ? 'selected' : ''}>${cat}</option>`).join('');
  return `<select class="category-select" data-category-select onchange="${onchangeCode}">${options}</select>`;
}

function createPlaceSelect(current, onchangeCode, roomKey = activeRoom) {
  const roomPlaces = getPlacesForRoom(roomKey);
  return `
    <select class="place-select" data-place-select data-current-value="${current || roomPlaces[0]?.key || 'kyl'}" onchange="${onchangeCode}">
      ${roomPlaces.map(place => `<option value="${place.key}" ${current === place.key ? 'selected' : ''}>${place.label}</option>`).join('')}
    </select>
  `;
}

function createCard(item, source = 'items') {
  const realIndex = source === 'quick' ? quickItems.indexOf(item) : items.indexOf(item);
  const img = getItemImage(item) || 'https://via.placeholder.com/100?text=Bild';
  const moveText = item.type === 'home' ? '↔ Flytta 1 till köp' : (String(item.unit || 'st').toLowerCase() === 'st' ? '↔ Flytta alla till hemma' : '↔ Flytta 1 till hemma');
  const placeMeta = getPlaceMeta(item.place);
  const div = document.createElement('div');
  div.className = 'card';
  div.draggable = true;
  div.ondragstart = () => dragStartItem(realIndex, source === 'quick' ? 'quick' : 'items');
  div.ondragend = () => dragEndItem();

  if (source === 'quick') {
    const quickRoom = item.room || activeRoom;
    const imageSource = getItemImageSourceMeta(item);
    div.innerHTML = `
      <img src="${img}" alt="${item.name}" data-item-name="${item.name}" data-image-source="${imageSource.type}" onerror="handleItemImageError(this)" onclick="showQuickImage(${realIndex})">
      <div class="info">
        <div class="top-tags quick-top-tags">
          ${createRoomBadge(quickRoom)}
          ${createCategorySelect(item.category || getRoomFallbackCategory(quickRoom), `changeQuickCategory(${realIndex}, this.value)`, quickRoom)}
          ${createPlaceSelect(item.place || 'kyl', `changeQuickPlace(${realIndex}, this.value)`, quickRoom)}
        </div>
        <div class="name">${item.name || ''}</div>
        <div class="meta">
          <div class="quantity-wrap">
            <span>${formatItemAmount(item)}</span>
          </div>
        </div>
        <div class="quick-path">${getRoomLabel(quickRoom)} • ${item.category || getRoomFallbackCategory(quickRoom)} • ${getPlaceMeta(item.place, quickRoom).label}</div>
      </div>
      <div class="actions">
        <button type="button" class="ghost-btn image-source-badge image-source-${imageSource.type}" title="${imageSource.title}" onclick="showImageSourceInfo('${imageSource.type}')">${imageSource.label}</button>
        <button type="button" class="ghost-btn" onclick="changeQuickImage(${realIndex})">🖼️ Byt bild</button>
        <button type="button" class="ghost-btn" onclick="editQuickItem(${realIndex})">✏️ Ändra</button>
        <button type="button" class="ghost-btn" onmousedown="startQuickAdd(${realIndex})" onmouseup="finishQuickAdd(${realIndex})" onmouseleave="stopQuickAdd()" ontouchstart="startQuickAdd(${realIndex})" ontouchend="finishQuickAdd(${realIndex})" ontouchcancel="stopQuickAdd()">Lägg till 1</button>
        <button type="button" class="delete" onclick="removeQuickItem(${realIndex})">🗑️</button>
      </div>
    `;
    return div;
  }

  const imageSource = getItemImageSourceMeta(item);
  div.innerHTML = `
    <img src="${img}" alt="${item.name}" data-item-name="${item.name}" data-image-source="${imageSource.type}" onerror="handleItemImageError(this)" onclick="showImage(${realIndex})">
    <div class="info">
      <div class="top-tags">
        <div class="category">${item.category || getRoomFallbackCategory(item.room || activeRoom)}</div>
        <div class="place-label ${placeMeta.cls}">${placeMeta.label}</div>
      </div>
      <div class="name">${item.name || ''}</div>
      <div class="meta">
        <div class="quantity-wrap">
          <input type="number" min="0" value="${Number(item.quantity || 0)}" onchange="updateQuantity(${realIndex}, this.value)">
          <span>${supportsSize(item.unit) ? formatSizeValue(item.unit, item.size) : (item.unit || 'st')}</span>
        </div>
        ${item.type === 'buy'
          ? `<div class="price-block">${
              Number(item.price || 0) > 0
                ? `<div class="unit-price">${formatBuyCostLabel(item).unitPrice}</div><div class="price">${formatBuyCostLabel(item).total}</div>`
                : `<div class="unit-price missing-price">⚠️ Saknar pris</div>`
            }</div>`
          : ''}
      </div>
    </div>
    <div class="actions">
      <button type="button" class="ghost-btn image-source-badge image-source-${imageSource.type}" title="${imageSource.title}" onclick="showImageSourceInfo('${imageSource.type}')">${imageSource.label}</button>
      <button type="button" class="ghost-btn" onclick="editMainItem(${realIndex})">✏️ Ändra</button>
      <button type="button" class="delete" onclick="removeItem(${realIndex})">🗑️</button>
      <button type="button" onclick="moveItem(${realIndex})">${moveText}</button>
    </div>
  `;
  return div;
}

function renderHomeList(searchText, categoryFilter) {
  const target = document.getElementById('homeList');
  if (!target) return;

  target.innerHTML = '';
  if (!showHome) {
    target.innerHTML = '<div class="empty">Har hemma är dold.</div>';
    return;
  }

  const roomItems = items.filter(item => (item.room || 'koket') === activeRoom && item.type === 'home');
  const roomPlaces = getPlacesForRoom(activeRoom);
  const visiblePlaces = activePlaceFilter ? roomPlaces.filter(place => place.key === activePlaceFilter) : roomPlaces;

  let hasAny = false;

  visiblePlaces.forEach(place => {
    const filtered = roomItems.filter(item =>
      item.place === place.key &&
      matchesSearch(item, searchText, categoryFilter)
    );

    if (!filtered.length) return;
    hasAny = true;

    const openKey = `${activeRoom}__${place.key}`;
    const isOpen = homeOpenState[openKey] !== false;
    const section = document.createElement('div');
    section.className = 'subsection';

    const title = document.createElement('div');
    title.className = 'room-section-title';
    title.style.cursor = 'pointer';
    title.textContent = `${place.label}${isOpen ? ' ▲' : ' ▼'}`;
    title.onclick = () => {
      homeOpenState[openKey] = !isOpen;
      save();
      render();
    };

    const wrap = document.createElement('div');
    wrap.className = 'container';
    wrap.style.display = isOpen ? 'grid' : 'none';
    wrap.ondragover = allowDrop;
    wrap.ondragleave = removeDropHover;
    wrap.ondrop = () => dropToList('home', place.key);

    filtered.forEach(item => wrap.appendChild(createCard(item)));
    section.appendChild(title);
    section.appendChild(wrap);
    target.appendChild(section);
  });

  if (!hasAny) {
    target.innerHTML = `<div class="empty">Inga varor hemma i ${getRoomLabel(activeRoom)} ännu.</div>`;
  }
}

function renderBuyList(searchText, categoryFilter) {
  const target = document.getElementById('buyList');
  if (!target) return;

  target.innerHTML = '';
  if (!showBuy) {
    target.innerHTML = '<div class="empty">Behöver köpa är dold.</div>';
    return;
  }

  const filtered = items.filter(item => item.type === 'buy' && matchesSearch(item, searchText, categoryFilter));
  if (!filtered.length) {
    target.innerHTML = '<div class="empty">Inga varor att köpa just nu.</div>';
    return;
  }

  filtered.forEach(item => target.appendChild(createCard(item)));
}

function applyQuickItemToMainForm(index) {
  const item = quickItems[index];
  if (!item) return;

  selectedAddQuickIndex = index;

  const itemName = document.getElementById('itemName');
  const itemPrice = document.getElementById('itemPrice');
  const itemQuantity = document.getElementById('itemQuantity');
  const itemCategory = document.getElementById('itemCategory');
  const itemUnit = document.getElementById('itemUnit');
  const itemSize = document.getElementById('itemSize');
  const itemPlace = document.getElementById('itemPlace');
  const itemMeasureText = document.getElementById('itemMeasureText');

  if (itemName) itemName.value = item.name || '';
  if (itemPrice) itemPrice.value = Number(item.price || 0) || '';
  if (itemQuantity) itemQuantity.value = 1;
  if (itemCategory) itemCategory.value = item.category || getRoomFallbackCategory(item.room || activeRoom);
  if (itemUnit) itemUnit.value = item.unit || 'st';
  if (itemSize) updateSizeSelect('itemSize', item.unit || 'st', item.size);
  if (itemMeasureText) itemMeasureText.value = supportsSize(item.unit) ? getMeasureTextFromSize(item.size, item.unit) : '';
  if (itemPlace) {
    itemPlace.dataset.currentValue = item.place || 'kyl';
    renderPlaceOptions();
    itemPlace.value = item.place || 'kyl';
  }

  hideMainItemSuggestions();
  try { syncMeasureModeVisibility(); updateMeasureSummary(); } catch (e) {}
}

function showMainItemSuggestions() {
  const input = document.getElementById('itemName');
  const box = document.getElementById('mainItemSuggestions');
  if (!input || !box) return;

  const search = normalizeText(input.value);
  selectedAddQuickIndex = null;
  box.innerHTML = '';

  if (!search) {
    box.style.display = 'none';
    return;
  }

  const matches = quickItems
    .filter(item => getQuickItemSearchHaystack(item).includes(search))
    .sort(compareQuickItemsByName);
  if (!matches.length) {
    box.style.display = 'none';
    return;
  }

  matches.slice(0, 8).forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.textContent = `${item.name} • ${getRoomLabel(item.room || activeRoom)} • ${item.category || ''} • ${getPlaceMeta(item.place, item.room || activeRoom).label}`;
    row.onclick = () => {
      const realIndex = quickItems.indexOf(item);
      if (realIndex !== -1) applyQuickItemToMainForm(realIndex);
    };
    box.appendChild(row);
  });

  box.style.display = 'block';
}

function hideMainItemSuggestions() {
  const box = document.getElementById('mainItemSuggestions');
  if (box) {
    box.innerHTML = '';
    box.style.display = 'none';
  }
}

function renderQuickSuggestions(list) {
  const box = document.getElementById('quickSuggestions');
  if (!box) return;

  box.innerHTML = '';
  if (!list.length) {
    box.style.display = 'none';
    return;
  }

  list.slice(0, 8).forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.textContent = `${item.name} • ${getRoomLabel(item.room || activeRoom)} • ${item.category || ''} • ${getPlaceMeta(item.place, item.room || activeRoom).label}`;
    row.onclick = () => {
      const realIndex = quickItems.indexOf(item);
      if (realIndex !== -1) useQuickItem(realIndex);
      const quickItemName = document.getElementById('quickItemName');
      if (quickItemName) quickItemName.value = '';
      box.style.display = 'none';
      renderQuickList();
    };
    box.appendChild(row);
  });

  box.style.display = 'block';
}

function hideQuickSuggestions() {
  const box = document.getElementById('quickSuggestions');
  if (box) {
    box.innerHTML = '';
    box.style.display = 'none';
  }
}

function toggleQuickList() {
  showQuick = !showQuick;
  render();
}

function toggleHomeList() {
  showHome = !showHome;
  render();
}

function toggleBuyList() {
  showBuy = !showBuy;
  render();
}

function toggleRecipeSection() {
  showRecipes = !showRecipes;
  render();
}

function renderQuickList() {
  const target = document.getElementById('quickList');
  const quickInput = document.getElementById('quickItemName');
  if (!target) return;

  target.innerHTML = '';
  if (!showQuick) {
    target.innerHTML = '<div class="empty">Snabblistan är dold.</div>';
    hideQuickSuggestions();
    return;
  }

  const quickSubtitle = document.querySelector('[data-page="quick"] .section-subtitle');
  const search = String(quickInput?.value || '').toLowerCase().trim();
  let list = quickItems.slice().sort(compareQuickItemsByName);

  if (search) {
    list = list.filter(item => getQuickItemSearchHaystack(item).includes(search));
    renderQuickSuggestions(list);
  } else {
    hideQuickSuggestions();
  }

  if (quickSubtitle) quickSubtitle.textContent = 'Sorterad på vara A-Ö • visar också RUM • KATEGORI • PLATS';

  if (!list.length) {
    target.innerHTML = '<div class="empty">Inga träffar</div>';
    return;
  }

  const grouped = new Map();
  list.forEach(item => {
    const letter = String(item.name || '#').trim().charAt(0).toUpperCase() || '#';
    const key = /[A-ZÅÄÖ]/.test(letter) ? letter : '#';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  grouped.forEach((groupItems, letter) => {
    const section = document.createElement('div');
    section.className = 'subsection';

    const title = document.createElement('h3');
    title.className = 'subsection-title';
    title.textContent = letter;
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'container';
    groupItems.forEach(item => wrap.appendChild(createCard(item, 'quick')));
    section.appendChild(wrap);

    target.appendChild(section);
  });
}

function filterQuickList() {
  renderQuickList();
}

function removeQuickItem(index) {
  quickItems.splice(index, 1);
  save();
  render();
}

function useQuickItem(index) {
  const item = quickItems[index];
  if (!item) return;

  addHomeItemFromTemplate(item, 1, item.place || 'kyl');
  save();
  render();
}

function changeQuickImage(index) {
  if (!quickItems[index]) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png, image/jpeg, image/webp';
  input.onchange = event => {
    const file = event.target.files?.[0];
    if (!file) return;

    processPickedImageFile(file, quickItems[index]?.name || 'vara').then(imgSrc => {
      quickItems[index].img = imgSrc || getAutoImagePath(quickItems[index]?.name || '') || getNoImagePlaceholder();
      items.forEach(item => {
        if (normalizeText(item.name) === normalizeText(quickItems[index].name)) item.img = quickItems[index].img;
      });
      save();
      render();
    }).catch(error => {
      console.error('Quick image change error:', error);
      alert('Kunde inte spara bilden.');
    });
  };
  input.click();
}

function openEditModal(item, isQuick, index) {
  editingIndex = index;
  editingQuick = isQuick;

  const editModal = document.getElementById('editModal');
  const editName = document.getElementById('editName');
  const editPrice = document.getElementById('editPrice');
  const editQuantity = document.getElementById('editQuantity');
  const editUnit = document.getElementById('editUnit');
  const editSize = document.getElementById('editSize');
  const editCategory = document.getElementById('editCategory');
  const editPlace = document.getElementById('editPlace');
  const editMeasureText = document.getElementById('editMeasureText');

  if (editName) editName.value = item.name || '';
  if (editPrice) editPrice.value = Number(item.price || 0) || '';
  if (editQuantity) editQuantity.value = Math.max(1, Number(item.quantity || 1));
  if (editUnit) editUnit.value = item.unit || 'st';
  if (editSize) updateSizeSelect('editSize', item.unit || 'st', item.size);
  if (editMeasureText) editMeasureText.value = supportsSize(item.unit) ? getMeasureTextFromSize(item.size, item.unit) : '';
  if (editCategory) {
    editCategory.dataset.currentValue = item.category || getRoomFallbackCategory(item.room || activeRoom);
    renderCategoryOptions();
    editCategory.value = item.category || getRoomFallbackCategory(item.room || activeRoom);
  }
  if (editPlace) {
    editPlace.dataset.currentValue = item.place || 'kyl';
    renderPlaceOptions();
    editPlace.value = item.place || 'kyl';
  }
  if (editModal) editModal.style.display = 'flex';
  try { syncEditMeasureModeVisibility(); updateEditMeasureSummary(); } catch (e) {}
}

function editQuickItem(index) {
  const item = quickItems[index];
  if (!item) return;
  openEditModal(item, true, index);
}

function editMainItem(index) {
  const item = items[index];
  if (!item) return;
  openEditModal(item, false, index);
}

function closeEditModal() {
  const editModal = document.getElementById('editModal');
  if (editModal) editModal.style.display = 'none';
  editingIndex = null;
  editingQuick = false;
}

function syncRecipeNames(oldName, newName) {
  recipes.forEach(recipe => {
    recipe.items = recipe.items.map(ingredient => {
      const match = String(ingredient || '').match(/^(\d+)\s*(st|g|kg|ml|dl|l|pkt)?\s+(.*)$/i);

      if (match) {
        const rawName = match[3].trim();
        if (normalizeText(rawName) === normalizeText(oldName)) {
          return `${match[1]} ${match[2] || 'st'} ${newName}`.trim();
        }
        return ingredient;
      }

      return normalizeText(ingredient) === normalizeText(oldName) ? newName : ingredient;
    });
  });
}

function saveEditItem() {
  if (editingIndex === null) return;

  const targetList = editingQuick ? quickItems : items;
  const currentItem = targetList[editingIndex];
  if (!currentItem) return;

  const updatedUnit = document.getElementById('editUnit')?.value || 'st';
  const updatedName = document.getElementById('editName')?.value.trim() || '';
  const updatedQuantity = Math.max(1, Number(document.getElementById('editQuantity')?.value || 1));
  const parsedMeasure = supportsSize(updatedUnit)
    ? parseSmartMeasureInput(document.getElementById('editMeasureText')?.value || currentItem.measureText || currentItem.weightText || currentItem.size, updatedUnit)
    : null;

  if (supportsSize(updatedUnit)) {
    if (!parsedMeasure) {
      alert(getMeasureInputError(updatedUnit));
      return;
    }
    const measureWarning = getMeasureValidationMessage(parsedMeasure, updatedQuantity, updatedUnit);
    if (measureWarning) {
      alert(measureWarning);
      return;
    }
    const editMeasureInput = document.getElementById('editMeasureText');
    if (editMeasureInput) editMeasureInput.value = formatSmartMeasureDisplay(parsedMeasure, updatedUnit);
  }

  const updatedRoom = currentItem.room || activeRoom;
  const updated = {
    name: updatedName,
    price: Number(document.getElementById('editPrice')?.value || 0),
    quantity: updatedQuantity,
    unit: updatedUnit,
    size: supportsSize(updatedUnit)
      ? parsedMeasure
      : normalizeSize(updatedUnit, document.getElementById('editSize')?.value || currentItem.size, document.getElementById('editCategory')?.value || currentItem.category),
    measureText: supportsSize(updatedUnit) && parsedMeasure ? formatSmartMeasureDisplay(parsedMeasure, updatedUnit) : '',
    weightText: isWeightUnit(updatedUnit) && parsedMeasure ? formatSmartMeasureDisplay(parsedMeasure, updatedUnit) : '',
    room: updatedRoom,
    category: ensureCategoryExists(document.getElementById('editCategory')?.value || currentItem.category || getRoomFallbackCategory(updatedRoom), updatedRoom),
    place: ensurePlaceExists(document.getElementById('editPlace')?.value || currentItem.place || getPlacesForRoom(updatedRoom)[0]?.key || 'kyl', updatedRoom),
    img: currentItem?.img && String(currentItem.img).startsWith('data:')
      ? String(currentItem.img)
      : getAutoImagePath(updatedName)
  };

  if (!updated.name) return;

  const oldName = currentItem.name;
  targetList[editingIndex] = { ...currentItem, ...updated };

  if (editingQuick) {
    items = items.map(item =>
      normalizeText(item.name) === normalizeText(oldName)
        ? { ...item, ...updated, type: item.type }
        : item
    );
    syncRecipeNames(oldName, updated.name);
  } else {
    syncQuickItemFromItem(targetList[editingIndex]);
  }

  items = mergeItems(items);
  save();
  closeEditModal();
  render();
}

function suggestUnit() {
  const category = document.getElementById('itemCategory')?.value;
  const unit = document.getElementById('itemUnit');
  const place = document.getElementById('itemPlace');

  if (!unit || !place) return;

  if (category === 'KRYDDOR') {
    unit.value = 'g';
    if (findPlace('kryddor', activeRoom)) place.value = 'kryddor';
  } else if (category === getRoomFallbackCategory(activeRoom) && !supportsSize(unit.value)) {
    unit.value = 'st';
  }

  updateSizeSelect('itemSize', unit.value, null, category);
}

function showImage(index) {
  const src = getItemImage(items[index]);
  if (!src) return;
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  if (modal) modal.style.display = 'flex';
  if (modalImg) modalImg.src = src;
}

function showQuickImage(index) {
  const src = getItemImage(quickItems[index]);
  if (!src) return;
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  if (modal) modal.style.display = 'flex';
  if (modalImg) modalImg.src = src;
}

function clearInputs(focusName = false) {
  const itemName = document.getElementById('itemName');
  const itemPrice = document.getElementById('itemPrice');
  const itemQuantity = document.getElementById('itemQuantity');
  const itemImage = document.getElementById('itemImage');
  const itemCategory = document.getElementById('itemCategory');
  const itemUnit = document.getElementById('itemUnit');
  const itemSize = document.getElementById('itemSize');
  const itemPlace = document.getElementById('itemPlace');
  const itemMeasureText = document.getElementById('itemMeasureText');

  if (itemName) itemName.value = '';
  if (itemPrice) itemPrice.value = '';
  if (itemQuantity) itemQuantity.value = '';
  if (itemImage) itemImage.value = '';
  const quickRoom = document.getElementById('quickRoom');
  const selectedQuickRoom = quickRoom?.value || activeRoom;
  if (itemCategory) itemCategory.value = getRoomFallbackCategory(selectedQuickRoom);
  if (itemUnit) itemUnit.value = 'st';
  if (itemSize) updateSizeSelect('itemSize', 'st');
  if (itemMeasureText) itemMeasureText.value = '';
  renderQuickAddRoomOptions(selectedQuickRoom, false);

  selectedAddQuickIndex = null;
  hideMainItemSuggestions();
  try { syncMeasureModeVisibility(); updateMeasureSummary(); } catch (e) {}
  if (focusName && itemName) itemName.focus();
}

function buildItemFromForm() {
  const nameInput = document.getElementById('itemName');
  const fileInput = document.getElementById('itemImage');
  const qtyInput = document.getElementById('itemQuantity');
  const priceInput = document.getElementById('itemPrice');
  const categoryInput = document.getElementById('itemCategory');
  const unitInput = document.getElementById('itemUnit');
  const sizeInput = document.getElementById('itemSize');
  const placeInput = document.getElementById('itemPlace');
  const itemMeasureTextInput = document.getElementById('itemMeasureText');

  const name = nameInput?.value.trim() || '';
  if (!name) return null;

  const matchedQuick = quickItems.find(q => normalizeText(q.name) === normalizeText(name));
  const resolvedUnit = unitInput?.value || (matchedQuick ? matchedQuick.unit : 'st');
  const quantity = Math.max(1, Number(qtyInput?.value || 1));
  const parsedMeasure = supportsSize(resolvedUnit)
    ? parseSmartMeasureInput(itemMeasureTextInput?.value || matchedQuick?.measureText || matchedQuick?.weightText || matchedQuick?.size, resolvedUnit)
    : null;

  if (supportsSize(resolvedUnit)) {
    if (!parsedMeasure) {
      alert(getMeasureInputError(resolvedUnit));
      return null;
    }
    const measureWarning = getMeasureValidationMessage(parsedMeasure, quantity, resolvedUnit);
    if (measureWarning) {
      alert(measureWarning);
      return null;
    }
    if (itemMeasureTextInput) itemMeasureTextInput.value = formatSmartMeasureDisplay(parsedMeasure, resolvedUnit);
  }

  const itemRoom = getQuickRoomSelection() || matchedQuick?.room || activeRoom;
  const fallbackPlace = getPlacesForRoom(itemRoom)[0]?.key || 'kyl';
  const item = {
    name: matchedQuick ? matchedQuick.name : name,
    price: Number(priceInput?.value || (matchedQuick ? matchedQuick.price : 0) || 0),
    quantity,
    unit: resolvedUnit,
    size: supportsSize(resolvedUnit)
      ? parsedMeasure
      : normalizeSize(resolvedUnit, sizeInput?.value || (matchedQuick ? matchedQuick.size : null), categoryInput?.value || matchedQuick?.category),
    measureText: supportsSize(resolvedUnit) && parsedMeasure ? formatSmartMeasureDisplay(parsedMeasure, resolvedUnit) : '',
    weightText: isWeightUnit(resolvedUnit) && parsedMeasure ? formatSmartMeasureDisplay(parsedMeasure, resolvedUnit) : '',
    room: itemRoom,
    category: ensureCategoryExists(categoryInput?.value || (matchedQuick ? matchedQuick.category : getRoomFallbackCategory(itemRoom)), itemRoom),
    place: ensurePlaceExists(placeInput?.value || (matchedQuick ? matchedQuick.place : fallbackPlace), itemRoom),
    type: 'home',
    img: matchedQuick?.img ? String(matchedQuick.img) : getAutoImagePath(matchedQuick ? matchedQuick.name : name)
  };

  return { item, file: fileInput?.files?.[0] || null, matchedQuick };
}

function saveQuickTemplate(item) {
  const normalized = normalizeMeasureItemData({ ...item, quantity: Math.max(1, Number(item?.quantity || 1)) });
  const existingQuick = quickItems.find(i => normalizeText(i.name) === normalizeText(normalized.name));

  if (existingQuick) {
    existingQuick.price = Number(normalized.price || existingQuick.price || 0);
    existingQuick.quantity = Math.max(1, Number(normalized.quantity || existingQuick.quantity || 1));
    existingQuick.unit = normalized.unit || existingQuick.unit || 'st';
    existingQuick.size = normalizeSize(existingQuick.unit, parseSmartMeasureInput(normalized.measureText || normalized.weightText || normalized.size, existingQuick.unit) || normalized.size || existingQuick.size, normalized.category || existingQuick.category);
    existingQuick.measureText = supportsSize(existingQuick.unit) ? getMeasureTextFromSize(existingQuick.size, existingQuick.unit) : '';
    existingQuick.weightText = isWeightUnit(existingQuick.unit) ? existingQuick.measureText : '';
    existingQuick.room = normalized.room || existingQuick.room || activeRoom;
    existingQuick.category = normalized.category || existingQuick.category || getRoomFallbackCategory(existingQuick.room || activeRoom);
    existingQuick.place = normalized.place || existingQuick.place || getPlacesForRoom(existingQuick.room)[0]?.key || 'kyl';
    if (normalized.img) existingQuick.img = normalized.img;
  } else {
    quickItems.unshift(normalized);
  }
}

function saveHomeItem(item) {
  const normalizedItem = normalizeMeasureItemData(item);
  const existingHome = items.find(i => i.type === 'home' && sameVariant(i, normalizedItem));

  if (existingHome) {
    existingHome.quantity = Number(existingHome.quantity || 0) + Number(normalizedItem.quantity || 0);
    existingHome.price = Number(normalizedItem.price || existingHome.price || 0);
    existingHome.category = normalizedItem.category;
    existingHome.unit = normalizedItem.unit;
    existingHome.size = normalizedItem.size;
    existingHome.measureText = normalizedItem.measureText || '';
    existingHome.weightText = normalizedItem.weightText || '';
    existingHome.openedAmount = Math.max(0, Number(existingHome.openedAmount || 0)) + Math.max(0, Number(normalizedItem.openedAmount || 0));
    while (Number(existingHome.size || 0) > 0 && existingHome.openedAmount >= Number(existingHome.size || 0)) {
      existingHome.quantity += 1;
      existingHome.openedAmount -= Number(existingHome.size || 0);
    }
    existingHome.packMode = isWeightUnit(existingHome.unit) && (existingHome.quantity > 1 || existingHome.openedAmount > 0 || normalizedItem.packMode === 'bags' || existingHome.packMode === 'bags') ? 'bags' : '';
    if (normalizedItem.img) existingHome.img = normalizedItem.img;
    syncQuickItemFromItem(existingHome);
  } else {
    items.push({
      ...normalizedItem,
      room: normalizedItem.room || activeRoom,
      openedAmount: Math.max(0, Number(normalizedItem.openedAmount || 0)),
      packMode: isWeightUnit(normalizedItem.unit) && (Number(normalizedItem.quantity || 0) > 1 || Number(normalizedItem.openedAmount || 0) > 0 || normalizedItem.packMode === 'bags') ? 'bags' : ''
    });
    syncQuickItemFromItem(normalizedItem);
  }
}

function addItem(saveToHome = false) {
  const formData = buildItemFromForm();
  if (!formData) return;

  const { item, file } = formData;

  const finalizeSave = imgData => {
    if (imgData) item.img = imgData;

    saveQuickTemplate(item);
    if (saveToHome) saveHomeItem(item);

    save();
    render();
    clearInputs(true);
    setActiveKitchenPage('quick');
  };

  if (file) {
    processPickedImageFile(file, item.name).then(finalizeSave).catch(error => {
      console.error('Add item image error:', error);
      alert('Kunde inte spara bilden.');
      finalizeSave('');
    });
  } else {
    finalizeSave('');
  }
}

function addItemAndUse() {
  addItem(true);
}

function updateQuantity(index, value) {
  const item = items[index];
  if (!item) return;

  const oldQty = Number(item.quantity || 0);
  const newQty = Math.max(0, Number(value || 0));
  const diff = oldQty - newQty;

  item.quantity = newQty;
  if (newQty === 0 && isWeightUnit(item.unit) && Math.max(0, Number(item.openedAmount || 0)) > 0) {
    item.packMode = 'bags';
  }

  if (item.type === 'home' && diff > 0) {
    const existingBuy = items.find(i =>
      i.type === 'buy' && sameVariant(i, { ...item, type: 'buy' })
    );

    if (existingBuy) {
      existingBuy.quantity = Number(existingBuy.quantity || 0) + diff;
    } else {
      items.push({
        name: item.name,
        price: Number(item.price || 0),
        quantity: diff,
        unit: item.unit || 'st',
        size: normalizeSize(item.unit || 'st', item.size),
        measureText: supportsSize(item.unit || 'st') ? getMeasureTextFromSize(item.size, item.unit || 'st') : '',
        weightText: isWeightUnit(item.unit || 'st') ? getMeasureTextFromSize(item.size, item.unit || 'st') : '',
        category: ensureCategoryExists(item.category || getRoomFallbackCategory(item.room || activeRoom), item.room || activeRoom),
        place: item.place || 'kyl',
        type: 'buy',
        img: item.img || ''
      });
    }
  }

  if (newQty === 0 && item.type === 'home') {
    items.splice(index, 1);
  } else {
    syncQuickItemFromItem(item);
  }

  save();
  render();
}

function moveItem(index) {
  const item = items[index];
  if (!item) return;

  transferSingleItem(index, item.type === 'buy' ? 'home' : 'buy', item.place || 'kyl');
  save();
  render();
}

function removeItem(index) {
  items.splice(index, 1);
  save();
  render();
}

function saveRecipeIngredientOrder(recipe = null) {
  if (recipe && recipe.name) {
    clearRecipeResult();
    save();
    renderRecipeSelect();
    return;
  }
  save();
}

function moveRecipeIngredient(fromIndex, toIndex, mode = 'draft', recipeName = '') {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex || toIndex < 0) return;

  if (mode === 'selected') {
    const recipe = recipeName
      ? recipes.find(entry => entry.name === recipeName)
      : getSelectedRecipe();
    if (!recipe || !Array.isArray(recipe.items) || fromIndex >= recipe.items.length || toIndex >= recipe.items.length) return;

    const moved = recipe.items.splice(fromIndex, 1)[0];
    recipe.items.splice(toIndex, 0, moved);
    saveRecipeIngredientOrder(recipe);
    return;
  }

  if (!Array.isArray(recipeDraftItems) || fromIndex >= recipeDraftItems.length || toIndex >= recipeDraftItems.length) return;
  const moved = recipeDraftItems.splice(fromIndex, 1)[0];
  recipeDraftItems.splice(toIndex, 0, moved);
  renderDraftIngredients();
}

function resetRecipeDragState() {
  draggedRecipeIngredientIndex = null;
  draggedRecipeIngredientMode = '';
  draggedRecipeIngredientRecipeName = '';
}

function clearRecipeDropMarkers() {
  document.querySelectorAll('.recipe-item.drag-over, .recipe-item.is-dragging-source').forEach(el => {
    el.classList.remove('drag-over', 'is-dragging-source');
  });
}

function getRecipeDropRowFromPoint(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY) || [];
  return elements.find(el => el.classList && el.classList.contains('recipe-item')) || null;
}

function finishRecipeTouchDrag(commitDrop = true) {
  const state = activeRecipeTouchDrag;
  if (!state) return;

  if (state.ghost && state.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
  if (state.sourceEl) {
    state.sourceEl.classList.remove('is-touch-dragging', 'is-dragging-source');
    state.sourceEl.style.visibility = '';
  }

  const finalTarget = state.lastTargetEl;
  const targetIndex = finalTarget ? Number(finalTarget.dataset.dragIndex) : NaN;
  if (commitDrop && Number.isInteger(targetIndex) && targetIndex >= 0) {
    moveRecipeIngredient(state.index, targetIndex, state.mode, state.recipeName);
  }

  clearRecipeDropMarkers();
  activeRecipeTouchDrag = null;
}

function startRecipeTouchDrag(event, row, index, mode = 'draft', recipeName = '') {
  if (!row || event.pointerType === 'mouse') return;
  if (event.target && event.target.closest('button, input, select, textarea, a, label, option')) return;

  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true);
  ghost.classList.add('recipe-drag-ghost');
  ghost.style.width = `${Math.max(220, Math.round(rect.width))}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);

  row.classList.add('is-touch-dragging', 'is-dragging-source');
  row.style.visibility = 'hidden';

  activeRecipeTouchDrag = {
    pointerId: event.pointerId,
    sourceEl: row,
    ghost,
    index,
    mode,
    recipeName,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    lastTargetEl: null
  };

  row.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateRecipeTouchDrag(event) {
  const state = activeRecipeTouchDrag;
  if (!state || state.pointerId !== event.pointerId) return;

  const ghostLeft = event.clientX - state.offsetX;
  const ghostTop = event.clientY - state.offsetY;
  state.ghost.style.left = `${ghostLeft}px`;
  state.ghost.style.top = `${ghostTop}px`;

  clearRecipeDropMarkers();
  state.sourceEl.classList.add('is-dragging-source');

  const targetRow = getRecipeDropRowFromPoint(event.clientX, event.clientY);
  if (targetRow && targetRow !== state.sourceEl && targetRow.dataset.dragMode === state.mode && (state.mode !== 'selected' || targetRow.dataset.recipeName === state.recipeName)) {
    targetRow.classList.add('drag-over');
    state.lastTargetEl = targetRow;
  } else {
    state.lastTargetEl = null;
  }

  event.preventDefault();
}

function bindRecipeRowDrag(row, index, mode = 'draft', recipeName = '') {
  if (!row) return;

  row.dataset.dragIndex = String(index);
  row.dataset.dragMode = mode;
  row.dataset.recipeName = recipeName || '';
  row.draggable = true;

  row.addEventListener('dragstart', event => {
    if (event.target && event.target.closest('button, input, select, textarea, a, label, option')) {
      event.preventDefault();
      return;
    }
    draggedRecipeIngredientIndex = index;
    draggedRecipeIngredientMode = mode;
    draggedRecipeIngredientRecipeName = recipeName || '';
    row.classList.add('is-dragging-source');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', `${mode}:${index}`); } catch (err) {}
    }
  });

  row.addEventListener('dragover', event => {
    if (draggedRecipeIngredientIndex === null) return;
    if (draggedRecipeIngredientMode !== mode) return;
    if (mode === 'selected' && draggedRecipeIngredientRecipeName !== (recipeName || '')) return;
    event.preventDefault();
    row.classList.add('drag-over');
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over');
  });

  row.addEventListener('drop', event => {
    if (draggedRecipeIngredientIndex === null) return;
    if (draggedRecipeIngredientMode !== mode) return;
    if (mode === 'selected' && draggedRecipeIngredientRecipeName !== (recipeName || '')) return;
    event.preventDefault();
    row.classList.remove('drag-over');
    moveRecipeIngredient(draggedRecipeIngredientIndex, index, mode, recipeName);
    resetRecipeDragState();
  });

  row.addEventListener('dragend', () => {
    clearRecipeDropMarkers();
    resetRecipeDragState();
  });

  row.addEventListener('pointerdown', event => startRecipeTouchDrag(event, row, index, mode, recipeName), { passive: false });
  row.addEventListener('pointermove', updateRecipeTouchDrag, { passive: false });
  row.addEventListener('pointerup', () => finishRecipeTouchDrag(true));
  row.addEventListener('pointercancel', () => finishRecipeTouchDrag(false));
}

function renderDraftIngredients() {
  const target = document.getElementById('recipeDraftList');
  if (!target) return;

  target.innerHTML = '';
  if (!recipeDraftItems.length) {
    target.innerHTML = '<div class="empty">Inga ingredienser ännu.</div>';
    return;
  }

  recipeDraftItems.forEach((ingredient, idx) => {
    const row = document.createElement('div');
    row.className = 'recipe-item recipe-item-draggable';
    row.innerHTML = `
      <div class="recipe-item-main">
        <span class="recipe-drag-handle" aria-hidden="true">☰</span>
        <div class="recipe-item-text">${recipeIngredientToText(ingredient)}</div>
      </div>
      <div class="recipe-item-actions">
        <button type="button" class="ghost-btn" onclick="editDraftIngredient(${idx})">✏️</button>
        <button type="button" class="delete" onclick="removeDraftIngredient(${idx})">🗑️</button>
      </div>
    `;
    bindRecipeRowDrag(row, idx, 'draft');
    target.appendChild(row);
  });
}

function removeDraftIngredient(index) {
  recipeDraftItems.splice(index, 1);
  renderDraftIngredients();
}

function editDraftIngredient(index) {
  editingIngredientRecipeIndex = -1;
  editingIngredientIndex = index;

  const parsed = normalizeRecipeIngredient(recipeDraftItems[index]);
  if (!parsed) return;

  const ingredientEditName = document.getElementById('ingredientEditName');
  const ingredientEditQty = document.getElementById('ingredientEditQty');
  const ingredientEditUnit = document.getElementById('ingredientEditUnit');
  const ingredientEditSize = document.getElementById('ingredientEditSize');
  const ingredientEditMeasureText = document.getElementById('ingredientEditMeasureText');
  const ingredientEditModal = document.getElementById('ingredientEditModal');

  if (ingredientEditName) ingredientEditName.value = parsed.name || '';
  if (ingredientEditQty) ingredientEditQty.value = Number(parsed.quantity || 1);
  if (ingredientEditUnit) ingredientEditUnit.value = parsed.unit || 'st';
  if (ingredientEditSize) updateSizeSelect('ingredientEditSize', parsed.unit || 'st', parsed.size, getRecipeIngredientContext(parsed));
  if (ingredientEditMeasureText) ingredientEditMeasureText.value = supportsSize(parsed.unit) ? getMeasureTextFromSize(parsed.size, parsed.unit) : '';
  if (ingredientEditModal) ingredientEditModal.style.display = 'flex';
  try { syncIngredientEditMeasureModeVisibility(); updateIngredientEditMeasureSummary(); } catch (e) {}
}

function saveRecipe() {
  const name = document.getElementById('recipeName')?.value.trim() || '';
  const link = document.getElementById('recipeLink')?.value.trim() || '';
  const recipeCategory = ensureRecipeCategoryExists(document.getElementById('recipeCategory')?.value || 'matlagning');
  const recipeType = normalizeRecipeType(recipeCategory);
  if (!name) return;

  const existingIndex = recipes.findIndex(r => normalizeText(r.name) === normalizeText(name));
  const recipe = {
    name,
    items: recipeDraftItems.length ? normalizeRecipeIngredientList(recipeDraftItems, { category: recipeCategory, type: recipeType }) : (existingIndex >= 0 ? normalizeRecipeIngredientList(recipes[existingIndex].items, recipes[existingIndex]) : []),
    link,
    type: recipeType,
    category: recipeCategory,
    yield: normalizeRecipeYield(document.getElementById('recipeYield')?.value || (existingIndex >= 0 ? recipes[existingIndex].yield : 4), 4)
  };

  if (existingIndex >= 0) recipes[existingIndex] = recipe;
  else recipes.push(recipe);

  const recipeName = document.getElementById('recipeName');
  const recipeCategorySelect = document.getElementById('recipeCategory');
  const recipeLink = document.getElementById('recipeLink');
  const recipeYield = document.getElementById('recipeYield');
  const recipeQuickSearch = document.getElementById('recipeQuickSearch');
  const recipeQuickSuggestions = document.getElementById('recipeQuickSuggestions');

  if (recipeName) recipeName.value = '';
  if (recipeCategorySelect) recipeCategorySelect.value = 'matlagning';
  if (recipeLink) recipeLink.value = '';
  if (recipeYield) recipeYield.value = '4';
  if (recipeQuickSearch) recipeQuickSearch.value = '';
  if (recipeQuickSuggestions) recipeQuickSuggestions.style.display = 'none';

  recipeDraftItems = [];
  save();
  renderRecipeCategoryOptions();
  renderRecipeSelect();
  renderDraftIngredients();
}

function filterRecipeSelect() {
  renderRecipeSelect();
  clearRecipeResult();
}

function renderRecipeSelect() {
  const select = document.getElementById('recipeSelect');
  if (!select) return;

  refreshPortionSelectLabels(getSelectedRecipe());

  const search = (document.getElementById('recipeSearch')?.value || '').toLowerCase().trim();
  const recipeCategoryFilterEl = document.getElementById('recipeCategoryFilter');
  const rawCategoryFilter = recipeCategoryFilterEl?.value || recipeCategoryEditState.activeFilter || '';
  const categoryFilter = rawCategoryFilter ? normalizeRecipeCategory(rawCategoryFilter) : '';
  const previous = select.value;
  select.innerHTML = '';

  let filtered = recipes.slice();
  if (search) {
    filtered = filtered.filter(recipe => (recipe.name || '').toLowerCase().includes(search));
  }
  if (categoryFilter) {
    filtered = filtered.filter(recipe => normalizeRecipeCategory(recipe.category || recipe.type) === categoryFilter);
  }
  recipeCategoryEditState.activeFilter = categoryFilter;
  renderRecipeCategoryManager();

  if (!filtered.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Inga recept';
    select.appendChild(opt);

    const selectedRecipeItems = document.getElementById('selectedRecipeItems');
    if (selectedRecipeItems) selectedRecipeItems.innerHTML = '<div class="empty">Inga recept matchar sökningen.</div>';
    return;
  }

  filtered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    .forEach(recipe => {
      const opt = document.createElement('option');
      const typeMeta = getRecipeCategoryMeta(recipe.category || recipe.type);
      opt.value = recipe.name;
      opt.textContent = `${typeMeta.icon} ${recipe.name}`;
      select.appendChild(opt);
    });

  if ([...select.options].some(o => o.value === previous)) {
    select.value = previous;
  }

  renderSelectedRecipeIngredients();
}

function getSelectedRecipe() {
  const name = document.getElementById('recipeSelect')?.value;
  return recipes.find(recipe => recipe.name === name);
}

function openRecipeLink(url) {
  if (!url) return;
  window.open(url, '_blank');
}

function editRecipeLink() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;

  const value = prompt('Ändra receptlänk', recipe.link || '');
  if (value === null) return;

  recipe.link = value.trim();
  save();
  renderSelectedRecipeIngredients();
}

function renderSelectedRecipeIngredients() {
  const target = document.getElementById('selectedRecipeItems');
  if (!target) return;

  target.innerHTML = '';
  const recipe = getSelectedRecipe();

  if (!recipe) {
    refreshPortionSelectLabels();
    target.innerHTML = '<div class="empty">Välj ett recept.</div>';
    return;
  }

  refreshPortionSelectLabels(recipe);

  const topActions = document.createElement('div');
  topActions.style.display = 'flex';
  topActions.style.gap = '8px';
  topActions.style.flexWrap = 'wrap';
  topActions.style.marginBottom = '10px';

  const typeMeta = getRecipeCategoryMeta(recipe.category || recipe.type);
  const typeBadge = document.createElement('span');
  typeBadge.className = `recipe-type-badge recipe-type-${typeMeta.value}`;
  typeBadge.textContent = `${typeMeta.icon} ${typeMeta.label}`;
  topActions.appendChild(typeBadge);

  if (isRecipePortionControlled(recipe)) {
    const yieldBadge = document.createElement('span');
    yieldBadge.className = 'recipe-yield-badge';
    yieldBadge.textContent = `🍽️ ${getRecipeYieldLabel(recipe.category || recipe.type, getRecipeBaseYield(recipe))}`;
    topActions.appendChild(yieldBadge);
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'ghost-btn';
  editBtn.textContent = '✏️ Ändra länk';
  editBtn.onclick = editRecipeLink;
  topActions.appendChild(editBtn);

  if (recipe.link) {
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '🔗 Öppna recept';
    openBtn.onclick = () => openRecipeLink(recipe.link);
    topActions.appendChild(openBtn);
  }

  target.appendChild(topActions);

  if (isRecipePortionControlled(recipe)) {
    const summary = document.createElement('div');
    summary.className = 'recipe-portion-summary';
    summary.textContent = `👥 ${getRecipePortionSummary(recipe)} • ${householdSize} personer × ${portionGrams} g = ${formatWeightDisplay(householdSize * portionGrams)}`;
    target.appendChild(summary);
  }

  if (!recipe.items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Inga ingredienser i receptet.';
    target.appendChild(empty);
  } else {
    recipe.items.forEach((ingredient, idx) => {
      const baseIngredient = applySelectedPortionToIngredient(ingredient, recipe);
      if (!baseIngredient) return;
      const displayIngredient = resolveRecipeIngredient(baseIngredient, recipe);
      const replacements = getRecipeReplacementOptions(baseIngredient);
      const selectedChoice = getRecipeIngredientChoice(recipe.name, baseIngredient.name);
      const row = document.createElement('div');
      row.className = 'recipe-item recipe-item-draggable';

      const controls = replacements.length
        ? `
          <div class="recipe-choice-wrap">
            <label class="recipe-choice-label">Välj hemma-vara</label>
            <select class="recipe-choice-select" onchange="changeRecipeIngredientChoice('${recipe.name.replace(/'/g, "\'")}', '${baseIngredient.name.replace(/'/g, "\'")}', this.value)">
              <option value="">${replacements.length === 1 ? 'Auto: ' + replacements[0] : 'Välj en hemma-vara'}</option>
              ${replacements.map(name => `<option value="${name}" ${selectedChoice === name ? 'selected' : ''}>${name}</option>`).join('')}
            </select>
          </div>
        `
        : '';

      const ingredientImage = getRecipeIngredientImage(displayIngredient);
      row.innerHTML = `
        <div class="recipe-item-main">
          <span class="recipe-drag-handle" aria-hidden="true">☰</span>
          <img class="recipe-item-image" src="${ingredientImage}" alt="${displayIngredient.name}" data-item-name="${displayIngredient.name}" onerror="handleItemImageError(this)">
          <div class="recipe-item-content">
            <div class="recipe-item-text">${recipeIngredientToText(displayIngredient)}</div>
            ${controls}
          </div>
        </div>
        <div class="recipe-item-actions">
          <button type="button" class="ghost-btn" onclick="editRecipeIngredient(${idx})">✏️</button>
          <button type="button" class="delete" onclick="removeRecipeIngredient(${idx})">🗑️</button>
        </div>
      `;
      bindRecipeRowDrag(row, idx, 'selected', recipe.name);
      target.appendChild(row);
    });
  }

  const addRow = document.createElement('div');
  addRow.style.position = 'relative';
  addRow.style.marginTop = '10px';
  addRow.innerHTML = `
    <input id="editRecipeSearch" placeholder="Sök ingrediens från snabblistan..." oninput="showEditRecipeSuggestions()">
    <div id="editRecipeSuggestions" class="suggestion-box"></div>
  `;
  target.appendChild(addRow);
}

function parseRecipeIngredientText(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^(\d+(?:[\.,]\d+)?)\s*(st|g|kg|ml|dl|l|krm|tsk|msk|pkt)?\s+(.*)$/i);

  if (match) {
    const name = (match[3] || '').trim();
    const unit = (match[2] || 'st').toLowerCase();
    const context = getRecipeIngredientContext({ name, unit });
    const rawAmount = parseFloat(String(match[1] || '').replace(',', '.')) || 1;

    if (supportsSize(unit)) {
      const size = parseSmartMeasureInput(`${rawAmount} ${unit}`, unit) || getDefaultSize(unit, context);
      return {
        quantity: 1,
        unit,
        size,
        name,
        category: context === 'RECIPE_KRYDDOR' ? 'KRYDDOR' : (context === 'RECIPE_RIVEN_OST' ? 'RECIPE_RIVEN_OST' : ''),
        smartMode: 'manual'
      };
    }

    return {
      quantity: Math.max(1, Math.round(rawAmount)),
      unit,
      size: null,
      name,
      category: context === 'RECIPE_KRYDDOR' ? 'KRYDDOR' : (context === 'RECIPE_RIVEN_OST' ? 'RECIPE_RIVEN_OST' : '')
    };
  }

  return { quantity: 1, unit: 'st', size: null, name: raw, category: isRecipeSpiceName(raw) ? 'KRYDDOR' : (isRecipeGratedCheeseName(raw) ? 'RECIPE_RIVEN_OST' : '') };
}

function normalizeRecipeIngredient(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const parsed = parseRecipeIngredientText(value);
    return parsed.name ? parsed : null;
  }

  const name = String(value.name || '').trim();
  if (!name) return null;

  const unit = String(value.unit || 'st').toLowerCase();
  const context = getRecipeIngredientContext({ ...value, name, unit });
  const parsedSize = supportsSize(unit)
    ? (parseSmartMeasureInput(value.measureText || value.weightText || '', unit) || Number(value.size || 0))
    : null;

  return {
    name,
    quantity: supportsSize(unit)
      ? Math.max(1, Math.round(Number(value.quantity || value.qty || 1)))
      : Math.max(1, Number(value.quantity || value.qty || 1)),
    unit,
    size: supportsSize(unit) ? normalizeSize(unit, parsedSize, context) : null,
    category: context === 'RECIPE_KRYDDOR' ? 'KRYDDOR' : (context === 'RECIPE_RIVEN_OST' ? 'RECIPE_RIVEN_OST' : ''),
    smartMode: String(value.smartMode || '').trim().toLowerCase()
  };
}

function normalizeRecipeIngredientList(list, recipe = null) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeRecipeIngredient)
    .map(item => syncRecipeIngredientFromQuickItem(item, recipe))
    .filter(Boolean);
}

function recipeIngredientToText(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return '';
  if (supportsSize(ing.unit)) {
    const total = Number(ing.quantity || 1) * Number(ing.size || 0);
    return `${formatSmartMeasureDisplay(total, ing.unit)} ${ing.name}`.trim();
  }
  return `${ing.quantity} ${ing.unit} ${ing.name}`.trim();
}

function findQuickItemByName(name) {
  const normalized = normalizeText(name || '');
  if (!normalized) return null;
  return quickItems.find(item => normalizeText(item?.name || '') === normalized) || null;
}

function isBakverkRecipe(recipe = null) {
  return normalizeRecipeCategory(recipe?.category || recipe?.type || '') === 'bakverk';
}

function syncRecipeIngredientFromQuickItem(ingredient, recipe = null) {
  const normalized = normalizeRecipeIngredient(ingredient);
  if (!normalized) return null;

  const quickMatch = findQuickItemByName(normalized.name);
  if (!quickMatch) return normalized;

  const isManual = normalized.smartMode === 'manual';
  if (isBakverkRecipe(recipe) || isManual) {
    return normalizeRecipeIngredient({
      ...normalized,
      category: quickMatch.category || normalized.category || ''
    });
  }

  const quickUnit = String(quickMatch.unit || normalized.unit || 'st').toLowerCase();
  const quickContext = getRecipeIngredientContext({
    ...normalized,
    name: normalized.name,
    unit: quickUnit,
    category: quickMatch.category || normalized.category || ''
  });

  return normalizeRecipeIngredient({
    ...normalized,
    unit: quickUnit,
    size: supportsSize(quickUnit)
      ? normalizeSize(quickUnit, quickMatch.size ?? normalized.size, quickContext)
      : null,
    category: quickMatch.category || normalized.category || '',
    smartMode: 'linked'
  });
}

function buildRecipeIngredient(name, quantity, unit, size = null, category = '', recipe = null, smartMode = 'linked') {
  return syncRecipeIngredientFromQuickItem({ name, quantity, unit, size, category, smartMode }, recipe);
}

function getRecipeUnitFamily(unit) {
  if (isWeightUnit(unit)) return 'weight';
  if (isLiquidUnit(unit)) return 'liquid';
  return String(unit || 'st').toLowerCase();
}

function getIngredientDensityPerMl(name) {
  const normalized = normalizeText(name || '');
  if (!normalized) return null;

  const rules = [
    { match: ['strosocker', 'socker'], gramsPerMl: 0.85 },
    { match: ['vetemjol', 'mjol'], gramsPerMl: 0.60 },
    { match: ['kakao'], gramsPerMl: 0.40 },
    { match: ['vanillinsocker', 'vaniljsocker'], gramsPerMl: 0.60 },
    { match: ['salt'], gramsPerMl: 1.20 }
  ];

  const found = rules.find(rule => rule.match.some(keyword => normalized.includes(keyword)));
  return found ? Number(found.gramsPerMl || 0) : null;
}

function convertCanonicalAmountForIngredient(amount, fromUnit, toUnit, ingredientName = '') {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const fromFamily = getRecipeUnitFamily(fromUnit);
  const toFamily = getRecipeUnitFamily(toUnit);

  if (!fromFamily || !toFamily) return null;
  if (fromFamily === toFamily) return value;

  if (!['weight', 'liquid'].includes(fromFamily) || !['weight', 'liquid'].includes(toFamily)) {
    return null;
  }

  const gramsPerMl = getIngredientDensityPerMl(ingredientName);
  if (!Number.isFinite(gramsPerMl) || gramsPerMl <= 0) return null;

  if (fromFamily === 'weight' && toFamily === 'liquid') {
    return value / gramsPerMl;
  }

  if (fromFamily === 'liquid' && toFamily === 'weight') {
    return value * gramsPerMl;
  }

  return null;
}

function recipeUnitsCompatible(a, b, ingredientName = '') {
  return convertCanonicalAmountForIngredient(1, a, b, ingredientName) !== null;
}

function getItemCanonicalAmount(item, unitHint = null) {
  if (!item) return 0;

  const unit = String(unitHint || item.unit || 'st').toLowerCase();
  const quantity = Math.max(0, Number(item.quantity || 0));
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  if (supportsSize(unit)) {
    const numericSize = Math.max(0, Number(item.size || 0));
    const parsedSize = numericSize > 0 ? numericSize : parseSmartMeasureInput(item.measureText || item.weightText || '', unit);
    const size = Math.max(0, Number(parsedSize || 0));
    if (!Number.isFinite(size) || size <= 0) return 0;
    if (isPackTrackedItem(item)) {
      return (quantity * size) + getOpenedAmount(item);
    }
    return quantity * size;
  }

  return quantity;
}

function recipeIngredientCanonicalAmount(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return 0;
  return getItemCanonicalAmount(ing, ing.unit);
}

function ingredientMatchesName(ingredient, name) {
  return normalizeText(normalizeRecipeIngredient(ingredient)?.name || '') === normalizeText(name || '');
}

function getMatchingHomeItemsForIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return [];

  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'home' && ingredientMatchesName(ing, item.name) && recipeUnitsCompatible(ing.unit, item.unit, ing.name));
}

function getHomeAmountForIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return 0;

  return getMatchingHomeItemsForIngredient(ing)
    .reduce((sum, { item }) => {
      const canonical = getItemCanonicalAmount(item, item.unit);
      const converted = convertCanonicalAmountForIngredient(canonical, item.unit, ing.unit, ing.name);
      return sum + Math.max(0, Number(converted || 0));
    }, 0);
}

function formatHomeAmountForIngredientDisplay(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return '';

  const matches = getMatchingHomeItemsForIngredient(ing);
  if (!matches.length) return formatRecipeAmount(ing.unit, 0);

  const unique = [];
  const seen = new Set();

  matches.forEach(({ item }) => {
    if (!item) return;
    const key = [
      normalizeText(item.name || ''),
      String(item.unit || 'st').toLowerCase(),
      Number(item.quantity || 0),
      Number(item.size || 0),
      Number(item.openedAmount || 0),
      String(item.packMode || '')
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(formatItemAmount(item));
  });

  return unique.join(' + ');
}

function cloneTemplateForIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return null;

  const quickMatch = findQuickItemByName(ing.name);
  const homeMatch = getMatchingHomeItemsForIngredient(ing)[0]?.item || null;
  const base = quickMatch || homeMatch || {};
  const unit = String(base.unit || ing.unit || 'st').toLowerCase();
  const unitFamilyMatches = recipeUnitsCompatible(unit, ing.unit);
  const resolvedUnit = unitFamilyMatches ? unit : ing.unit;
  const context = getRecipeIngredientContext({
    ...base,
    ...ing,
    unit: resolvedUnit,
    category: base.category || ing.category || ''
  });

  const normalizedSize = supportsSize(resolvedUnit)
    ? normalizeSize(resolvedUnit, base.size ?? ing.size, context)
    : null;

  return {
    name: base.name || ing.name,
    price: Number(base.price || 0),
    quantity: 1,
    unit: resolvedUnit,
    size: normalizedSize,
    measureText: supportsSize(resolvedUnit) && normalizedSize ? formatSmartMeasureDisplay(normalizedSize, resolvedUnit) : '',
    weightText: isWeightUnit(resolvedUnit) && normalizedSize ? formatSmartMeasureDisplay(normalizedSize, resolvedUnit) : '',
    category: ensureCategoryExists(base.category || ing.category || getRoomFallbackCategory(activeRoom), activeRoom),
    place: ensurePlaceExists(base.place || 'kyl'),
    img: base.img ? String(base.img) : ''
  };
}

function createBuyItemFromMissingEntry(entry) {
  if (!entry) return null;

  const ingredient = normalizeRecipeIngredient(entry.ingredient || entry);
  if (!ingredient) return null;

  const missingAmount = Math.max(0, Number(entry.missing || 0));
  if (!missingAmount) return null;

  const template = cloneTemplateForIngredient(ingredient) || {
    name: ingredient.name,
    price: 0,
    quantity: 1,
    unit: ingredient.unit || 'st',
    size: supportsSize(ingredient.unit) ? normalizeSize(ingredient.unit, ingredient.size, ingredient) : null,
    measureText: '',
    weightText: '',
    category: ensureCategoryExists(ingredient.category || getRoomFallbackCategory(activeRoom), activeRoom),
    place: ensurePlaceExists('kyl'),
    img: ''
  };

  const unit = String(template.unit || ingredient.unit || 'st').toLowerCase();
  if (supportsSize(unit)) {
    const totalAmount = Math.max(1, Math.round(missingAmount));
    return {
      ...template,
      type: 'buy',
      quantity: 1,
      unit,
      size: totalAmount,
      measureText: formatSmartMeasureDisplay(totalAmount, unit),
      weightText: isWeightUnit(unit) ? formatSmartMeasureDisplay(totalAmount, unit) : ''
    };
  }

  return {
    ...template,
    type: 'buy',
    quantity: Math.max(1, Math.ceil(missingAmount)),
    unit,
    size: null,
    measureText: '',
    weightText: ''
  };
}

function mergeCanonicalItemIntoList(nextItem, type = 'buy') {
  if (!nextItem) return;

  const normalizedType = type === 'home' ? 'home' : 'buy';
  const copy = {
    ...nextItem,
    type: normalizedType,
    quantity: Math.max(1, Number(nextItem.quantity || 1)),
    unit: String(nextItem.unit || 'st').toLowerCase(),
    size: supportsSize(nextItem.unit) ? Math.max(1, Math.round(Number(nextItem.size || 0))) : null,
    price: Number(nextItem.price || 0),
    category: ensureCategoryExists(nextItem.category || getRoomFallbackCategory(nextItem.room || activeRoom), nextItem.room || activeRoom),
    place: ensurePlaceExists(nextItem.place || 'kyl'),
    img: nextItem.img ? String(nextItem.img) : ''
  };

  const existing = items.find(entry =>
    entry.type === normalizedType &&
    normalizeText(entry.name) === normalizeText(copy.name) &&
    recipeUnitsCompatible(entry.unit, copy.unit)
  );

  if (existing) {
    if (supportsSize(copy.unit)) {
      const currentTotal = getItemCanonicalAmount(existing, copy.unit);
      const incomingTotal = getItemCanonicalAmount(copy, copy.unit);
      const mergedTotal = Math.max(0, Math.round(currentTotal + incomingTotal));
      existing.quantity = 1;
      existing.unit = copy.unit;
      existing.size = mergedTotal;
      existing.measureText = formatSmartMeasureDisplay(mergedTotal, copy.unit);
      existing.weightText = isWeightUnit(copy.unit) ? formatSmartMeasureDisplay(mergedTotal, copy.unit) : '';
    } else {
      existing.quantity = Math.max(0, Number(existing.quantity || 0) + Number(copy.quantity || 0));
      existing.size = null;
      existing.measureText = '';
      existing.weightText = '';
    }

    if (Number(existing.price || 0) === 0 && Number(copy.price || 0) > 0) existing.price = Number(copy.price || 0);
    existing.category = copy.category || existing.category || getRoomFallbackCategory(existing.room || copy.room || activeRoom);
    existing.place = copy.place || existing.place || 'kyl';
    if (!existing.img && copy.img) existing.img = copy.img;
    return;
  }

  items.push(copy);
}

function addMissingEntriesToBuy(entries = []) {
  (Array.isArray(entries) ? entries : []).forEach(entry => {
    const buyItem = createBuyItemFromMissingEntry(entry);
    if (buyItem) mergeCanonicalItemIntoList(buyItem, 'buy');
  });
  save();
}

function createRestockBuyItemFromQuick(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return null;

  const quickMatch = findQuickItemByName(ing.name);
  if (!quickMatch) return null;

  const unit = String(quickMatch.unit || ing.unit || 'st').toLowerCase();
  const context = getRecipeIngredientContext({
    ...quickMatch,
    ...ing,
    unit,
    category: quickMatch.category || ing.category || ''
  });
  const normalizedSize = supportsSize(unit)
    ? normalizeSize(unit, quickMatch.size, context)
    : null;

  return {
    name: quickMatch.name || ing.name,
    price: Number(quickMatch.price || 0),
    quantity: Math.max(1, Number(quickMatch.quantity || 1)),
    unit,
    size: normalizedSize,
    measureText: supportsSize(unit) && normalizedSize ? formatSmartMeasureDisplay(normalizedSize, unit) : '',
    weightText: isWeightUnit(unit) && normalizedSize ? formatSmartMeasureDisplay(normalizedSize, unit) : '',
    category: ensureCategoryExists(quickMatch.category || ing.category || getRoomFallbackCategory(quickMatch.room || activeRoom), quickMatch.room || activeRoom),
    place: ensurePlaceExists(quickMatch.place || 'kyl'),
    img: quickMatch.img ? String(quickMatch.img) : '',
    type: 'buy'
  };
}

function queueRestockIfDepleted(ingredient, amountBefore = 0) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing || amountBefore <= 0) return;

  const amountAfter = getHomeAmountForIngredient(ing);
  if (amountAfter > 0) return;

  const buyItem = createRestockBuyItemFromQuick(ing);
  if (!buyItem) return;

  mergeCanonicalItemIntoList(buyItem, 'buy');
}

function queueConsumedCountToBuy(ingredient, consumedAmount = 0) {
  const ing = normalizeRecipeIngredient(ingredient);
  const countToBuy = Math.max(0, Math.ceil(Number(consumedAmount || 0)));
  if (!ing || countToBuy <= 0) return;

  const amountAfter = Math.max(0, Number(getHomeAmountForIngredient(ing) || 0));
  if (amountAfter > 1) return;

  const template = cloneTemplateForIngredient(ing) || {
    name: ing.name,
    price: 0,
    quantity: 1,
    unit: ing.unit || 'st',
    size: null,
    measureText: '',
    weightText: '',
    category: ensureCategoryExists(ing.category || getRoomFallbackCategory(activeRoom), activeRoom),
    place: ensurePlaceExists('kyl'),
    img: ''
  };

  const unit = String(template.unit || ing.unit || 'st').toLowerCase();
  if (supportsSize(unit)) return;

  mergeCanonicalItemIntoList({
    ...template,
    type: 'buy',
    unit,
    size: null,
    measureText: '',
    weightText: '',
    quantity: 1
  }, 'buy');
}

function consumeIngredientEntries(entries = []) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];

  normalizedEntries.forEach(entry => {
    const ingredient = normalizeRecipeIngredient(entry?.ingredient || entry);
    if (!ingredient) return;

    const amountBefore = getHomeAmountForIngredient(ingredient);
    let remaining = recipeIngredientCanonicalAmount(ingredient);
    const requestedAmount = remaining;
    if (!remaining) return;

    const matches = getMatchingHomeItemsForIngredient(ingredient)
      .map(match => ({
        ...match,
        availableForRecipe: Math.max(0, Number(convertCanonicalAmountForIngredient(
          getItemCanonicalAmount(match.item, match.item.unit),
          match.item.unit,
          ingredient.unit,
          ingredient.name
        ) || 0))
      }))
      .sort((a, b) => b.availableForRecipe - a.availableForRecipe);

    matches.forEach(({ item, index, availableForRecipe }) => {
      if (remaining <= 0 || !items[index]) return;
      if (availableForRecipe <= 0) return;

      const stored = items[index];
      if (!stored) return;

      const consumedForRecipe = Math.min(availableForRecipe, remaining);
      const consumedForStored = Math.max(0, Number(convertCanonicalAmountForIngredient(
        consumedForRecipe,
        ingredient.unit,
        stored.unit,
        ingredient.name
      ) || 0));

      remaining = Math.max(0, remaining - consumedForRecipe);

      if (supportsSize(stored.unit)) {
        const currentStoredAmount = Math.max(0, Number(getItemCanonicalAmount(stored, stored.unit) || 0));
        const nextStoredAmount = Math.max(0, Math.round(currentStoredAmount - consumedForStored));

        if (isPackTrackedItem(stored)) {
          const packSize = Math.max(0, Number(stored.size || 0));
          if (packSize <= 0 || nextStoredAmount <= 0) {
            items.splice(index, 1);
            return;
          }

          const unopened = Math.floor(nextStoredAmount / packSize);
          const opened = nextStoredAmount % packSize;

          if (unopened <= 0 && opened <= 0) {
            items.splice(index, 1);
            return;
          }

          stored.quantity = unopened;
          stored.openedAmount = opened;
          stored.packMode = (unopened > 1 || opened > 0 || stored.packMode === 'bags') ? 'bags' : '';
          stored.measureText = formatSmartMeasureDisplay(packSize, stored.unit);
          stored.weightText = isWeightUnit(stored.unit) ? formatSmartMeasureDisplay(packSize, stored.unit) : '';
          return;
        }

        if (nextStoredAmount <= 0) {
          items.splice(index, 1);
          return;
        }

        stored.quantity = 1;
        stored.size = nextStoredAmount;
        stored.openedAmount = 0;
        stored.packMode = '';
        stored.measureText = formatSmartMeasureDisplay(nextStoredAmount, stored.unit);
        stored.weightText = isWeightUnit(stored.unit) ? formatSmartMeasureDisplay(nextStoredAmount, stored.unit) : '';
        return;
      }

      const availableCount = Math.max(0, Number(stored.quantity || 0));
      const consumedCount = Math.min(availableCount, Math.ceil(consumedForRecipe));
      stored.quantity = Math.max(0, availableCount - consumedCount);
      if (stored.quantity <= 0) items.splice(index, 1);
    });

    const consumedTotal = Math.max(0, requestedAmount - remaining);
    if (supportsSize(ingredient.unit)) {
      queueRestockIfDepleted(ingredient, amountBefore);
    } else {
      queueConsumedCountToBuy(ingredient, consumedTotal);
    }
  });

  save();
}

function getCombinedRecipeIngredientEntries(recipeEntries = []) {
  const combinedMap = new Map();

  (Array.isArray(recipeEntries) ? recipeEntries : []).forEach(entry => {
    const recipe = entry?.recipe;
    if (!recipe || !Array.isArray(recipe.items)) return;

    recipe.items.forEach(rawIngredient => {
      const ingredient = resolveRecipeIngredient(rawIngredient, recipe);
      if (!ingredient) return;

      const key = `${normalizeText(ingredient.name)}__${getRecipeUnitFamily(ingredient.unit)}`;
      const existing = combinedMap.get(key);
      const canonical = recipeIngredientCanonicalAmount(ingredient);

      if (!existing) {
        combinedMap.set(key, {
          ingredient: supportsSize(ingredient.unit)
            ? {
                ...ingredient,
                quantity: 1,
                size: canonical,
                measureText: formatSmartMeasureDisplay(canonical, ingredient.unit),
                weightText: isWeightUnit(ingredient.unit) ? formatSmartMeasureDisplay(canonical, ingredient.unit) : ''
              }
            : { ...ingredient },
          amount: canonical
        });
        return;
      }

      existing.amount += canonical;
      if (supportsSize(existing.ingredient.unit)) {
        existing.ingredient.quantity = 1;
        existing.ingredient.size = Math.max(1, Math.round(existing.amount));
        existing.ingredient.measureText = formatSmartMeasureDisplay(existing.ingredient.size, existing.ingredient.unit);
        existing.ingredient.weightText = isWeightUnit(existing.ingredient.unit) ? formatSmartMeasureDisplay(existing.ingredient.size, existing.ingredient.unit) : '';
      } else {
        existing.ingredient.quantity = Math.max(1, Math.ceil(existing.amount));
      }
    });
  });

  return [...combinedMap.values()];
}

function formatRecipeAmount(unit, amount) {
  if (supportsSize(unit)) {
    return formatSmartMeasureDisplay(Number(amount || 0), unit);
  }
  return `${amount} ${unit || 'st'}`.trim();
}

function getMissingRecipeIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return null;
  const needed = recipeIngredientCanonicalAmount(ing);
  const have = getHomeAmountForIngredient(ing);
  const missing = Math.max(0, needed - have);
  if (missing <= 0) return null;
  return { ingredient: ing, needed, have, missing };
}

function recipeIngredientMissingText(entry) {
  if (!entry) return '';
  return `${recipeIngredientToText(entry.ingredient)} (saknar ${formatRecipeAmount(entry.ingredient.unit, entry.missing)})`;
}

function editRecipeIngredient(index) {
  editingIngredientRecipeIndex = recipes.findIndex(r => r.name === document.getElementById('recipeSelect')?.value);
  editingIngredientIndex = index;

  const recipe = recipes[editingIngredientRecipeIndex];
  if (!recipe) return;

  const parsed = normalizeRecipeIngredient(recipe.items[index]);
  if (!parsed) return;

  const ingredientEditName = document.getElementById('ingredientEditName');
  const ingredientEditQty = document.getElementById('ingredientEditQty');
  const ingredientEditUnit = document.getElementById('ingredientEditUnit');
  const ingredientEditSize = document.getElementById('ingredientEditSize');
  const ingredientEditMeasureText = document.getElementById('ingredientEditMeasureText');
  const ingredientEditModal = document.getElementById('ingredientEditModal');

  if (ingredientEditName) ingredientEditName.value = parsed.name || '';
  if (ingredientEditQty) ingredientEditQty.value = Number(parsed.quantity || 1);
  if (ingredientEditUnit) ingredientEditUnit.value = parsed.unit || 'st';
  if (ingredientEditSize) updateSizeSelect('ingredientEditSize', parsed.unit || 'st', parsed.size, getRecipeIngredientContext(parsed));
  if (ingredientEditMeasureText) ingredientEditMeasureText.value = supportsSize(parsed.unit) ? getMeasureTextFromSize(parsed.size, parsed.unit) : '';
  if (ingredientEditModal) ingredientEditModal.style.display = 'flex';
  try { syncIngredientEditMeasureModeVisibility(); updateIngredientEditMeasureSummary(); } catch (e) {}
}

function closeIngredientEdit() {
  const ingredientEditModal = document.getElementById('ingredientEditModal');
  if (ingredientEditModal) ingredientEditModal.style.display = 'none';

  editingIngredientIndex = null;
  editingIngredientRecipeIndex = null;
}

function saveIngredientEdit() {
  if (editingIngredientIndex === null) return;

  const name = document.getElementById('ingredientEditName')?.value.trim() || '';
  const quantity = Math.max(1, Number(document.getElementById('ingredientEditQty')?.value || 1));
  const unit = document.getElementById('ingredientEditUnit')?.value || 'st';
  let size = document.getElementById('ingredientEditSize')?.value || null;

  if (!name) return;

  if (supportsSize(unit)) {
    const parsedMeasure = parseSmartMeasureInput(document.getElementById('ingredientEditMeasureText')?.value || size, unit);
    if (!parsedMeasure) {
      alert(getMeasureInputError(unit));
      return;
    }
    const measureWarning = getMeasureValidationMessage(parsedMeasure, quantity, unit);
    if (measureWarning) {
      alert(measureWarning);
      return;
    }
    size = parsedMeasure;
    const ingredientEditMeasureInput = document.getElementById('ingredientEditMeasureText');
    if (ingredientEditMeasureInput) ingredientEditMeasureInput.value = formatSmartMeasureDisplay(parsedMeasure, unit);
  }

  const previousIngredient = editingIngredientRecipeIndex === -1
    ? normalizeRecipeIngredient(recipeDraftItems[editingIngredientIndex])
    : normalizeRecipeIngredient(recipes[editingIngredientRecipeIndex]?.items[editingIngredientIndex]);

  const updated = buildRecipeIngredient(
    name,
    quantity,
    unit,
    size,
    previousIngredient?.category || '',
    editingIngredientRecipeIndex === -1 ? { category: document.getElementById('recipeCategory')?.value || 'matlagning' } : recipes[editingIngredientRecipeIndex],
    'manual'
  );
  if (!updated) return;

  if (editingIngredientRecipeIndex === -1) {
    recipeDraftItems[editingIngredientIndex] = updated;
    renderDraftIngredients();
  } else {
    const recipe = recipes[editingIngredientRecipeIndex];
    if (!recipe) return;
    const previous = normalizeRecipeIngredient(recipe.items[editingIngredientIndex]);
    if (previous && normalizeText(previous.name) !== normalizeText(updated.name)) {
      setRecipeIngredientChoice(recipe.name, previous.name, '');
    }
    recipe.items[editingIngredientIndex] = updated;
    save();
    clearRecipeResult();
    renderSelectedRecipeIngredients();
  }

  closeIngredientEdit();
}


function removeRecipeIngredient(index) {
  const recipe = getSelectedRecipe();
  if (!recipe) return;

  const removed = normalizeRecipeIngredient(recipe.items[index]);
  if (removed) setRecipeIngredientChoice(recipe.name, removed.name, '');
  recipe.items.splice(index, 1);
  save();
  clearRecipeResult();
  renderSelectedRecipeIngredients();
}

function deleteRecipe() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;
  if (!confirm(`Ta bort receptet "${recipe.name}"?`)) return;

  recipes = recipes.filter(r => r.name !== recipe.name);
  clearRecipeChoicesForRecipe(recipe.name);
  save();
  renderRecipeSelect();
  clearRecipeResult();
}

function clearRecipeResult() {
  const recipeResult = document.getElementById('recipeResult');
  const recipeHasList = document.getElementById('recipeHasList');
  const recipeMissingList = document.getElementById('recipeMissingList');

  if (recipeResult) recipeResult.style.display = 'none';
  if (recipeHasList) recipeHasList.innerHTML = '';
  if (recipeMissingList) recipeMissingList.innerHTML = '';

  currentRecipeMissing = [];
}

function checkRecipe() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;

  const has = [];
  const missing = [];

  recipe.items.forEach(rawIngredient => {
    const ingredient = resolveRecipeIngredient(rawIngredient, recipe);
    if (!ingredient) return;

    const needed = recipeIngredientCanonicalAmount(ingredient);
    const have = getHomeAmountForIngredient(ingredient);

    if (have >= needed) {
      has.push({ ingredient, have, needed });
    } else {
      missing.push({ ingredient, have, needed, missing: Math.max(0, needed - have) });
    }
  });

  const hasList = document.getElementById('recipeHasList');
  const missingList = document.getElementById('recipeMissingList');
  if (!hasList || !missingList) return;

  hasList.innerHTML = '';
  missingList.innerHTML = '';

  if (!has.length) {
    hasList.innerHTML = '<div class="empty">Inget matchar hemma.</div>';
  } else {
    has.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-pill ok';
      div.textContent = `${recipeIngredientToText(entry.ingredient)} • har ${formatHomeAmountForIngredientDisplay(entry.ingredient)}`;
      hasList.appendChild(div);
    });
  }

  if (!missing.length) {
    missingList.innerHTML = '<div class="empty">Du har allt till receptet.</div>';
  } else {
    missing.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'result-pill miss';
      div.textContent = recipeIngredientMissingText(entry);
      missingList.appendChild(div);
    });
  }

  currentRecipeMissing = missing;
  const recipeResult = document.getElementById('recipeResult');
  if (recipeResult) recipeResult.style.display = 'grid';
}

function addMissingToBuy() {
  if (!currentRecipeMissing.length) {
    checkRecipe();
  }

  if (!currentRecipeMissing.length) return;

  addMissingEntriesToBuy(currentRecipeMissing);
  checkRecipe();
  render();
}

function useRecipeIngredients() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;

  const combinedEntries = getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }]);
  consumeIngredientEntries(combinedEntries);
  checkRecipe();
  render();
}

function showEditRecipeSuggestions() {
  const input = document.getElementById('editRecipeSearch');
  const box = document.getElementById('editRecipeSuggestions');
  const recipe = getSelectedRecipe();
  if (!input || !box || !recipe) return;

  const search = normalizeText(input.value);
  box.innerHTML = '';

  if (!search) {
    box.style.display = 'none';
    return;
  }

  const matches = quickItems
    .filter(item => getQuickItemSearchHaystack(item).includes(search))
    .sort(compareQuickItemsByName);
  if (!matches.length) {
    box.style.display = 'none';
    return;
  }

  matches.forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.textContent = item.name;
    row.onclick = () => {
      const ingredientData = buildRecipeIngredient(item.name, 1, item.unit || 'st', item.size, item.category || '', recipe);
      if (!recipe.items.some(i => ingredientMatchesName(i, item.name))) {
        recipe.items.push(ingredientData);
        save();
        renderSelectedRecipeIngredients();
      }
      input.value = '';
      box.innerHTML = '';
      box.style.display = 'none';
    };
    box.appendChild(row);
  });

  box.style.display = 'block';
}

function showNewRecipeQuickSuggestions() {
  const input = document.getElementById('recipeQuickSearch');
  const box = document.getElementById('recipeQuickSuggestions');
  if (!input || !box) return;

  const search = normalizeText(input.value);
  box.innerHTML = '';

  if (!search) {
    box.style.display = 'none';
    return;
  }

  const matches = quickItems
    .filter(item => getQuickItemSearchHaystack(item).includes(search))
    .sort(compareQuickItemsByName);
  if (!matches.length) {
    box.style.display = 'none';
    return;
  }

  matches.forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.textContent = item.name;
    row.onclick = () => {
      const ingredientData = buildRecipeIngredient(item.name, 1, item.unit || 'st', item.size, item.category || '', { category: document.getElementById('recipeCategory')?.value || 'matlagning' });
      if (!recipeDraftItems.some(i => ingredientMatchesName(i, item.name))) {
        recipeDraftItems.push(ingredientData);
        renderDraftIngredients();
      }
      input.value = '';
      box.innerHTML = '';
      box.style.display = 'none';
    };
    box.appendChild(row);
  });

  box.style.display = 'block';
}


function renderRoomTabs() {
  const homeWrap = document.getElementById('homeRoomTabs');
  const manageWrap = document.getElementById('manageRoomTabs');

  if (homeWrap) {
    homeWrap.innerHTML = '';
    getAllRoomDefs().forEach(room => {
      const theme = getRoomTheme(room);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'room-tab';
      btn.style.cssText = getRoomThemeStyle(room);
      if (room.key === activeRoom) btn.classList.add('active');
      btn.innerHTML = `<span class="room-tab-icon">${escapeHtml(theme.icon)}</span><span class="room-tab-label">${escapeHtml(room.label)}</span>`;
      btn.onclick = () => setActiveRoom(room.key);
      homeWrap.appendChild(btn);
    });
  }

  if (manageWrap) {
    manageWrap.innerHTML = '';
    getAllRoomDefs().forEach(room => {
      const theme = getRoomTheme(room);
      const card = document.createElement('div');
      card.className = 'manage-room-card' + (room.key === activeRoom ? ' active' : '');
      card.style.cssText = getRoomThemeStyle(room);

      const mainBtn = document.createElement('button');
      mainBtn.type = 'button';
      mainBtn.className = 'manage-room-tab';
      mainBtn.style.cssText = getRoomThemeStyle(room);
      if (room.key === activeRoom) mainBtn.classList.add('active');
      mainBtn.innerHTML = `<span class="room-tab-icon">${escapeHtml(theme.icon)}</span><span class="room-tab-label">${escapeHtml(room.label)}</span>`;
      mainBtn.onclick = () => setActiveRoom(room.key);

      const actions = document.createElement('div');
      actions.className = 'manage-room-actions';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'manage-room-action';
      renameBtn.title = 'Ändra namn på rum';
      renameBtn.textContent = '✏️';
      renameBtn.onclick = () => renameRoomPrompt(room.key);
      actions.appendChild(renameBtn);

      if (!isRoomProtected(room.key)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'manage-room-action delete';
        deleteBtn.title = 'Ta bort rum';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => removeRoom(room.key);
        actions.appendChild(deleteBtn);
      } else {
        const lock = document.createElement('span');
        lock.className = 'manage-room-lock';
        lock.textContent = 'Fallback';
        actions.appendChild(lock);
      }

      card.appendChild(mainBtn);
      card.appendChild(actions);
      manageWrap.appendChild(card);
    });
  }

  const subtitle = document.getElementById('homeRoomSubtitle');
  if (subtitle) {
    const theme = getRoomTheme(activeRoom);
    subtitle.innerHTML = `<span class="room-title-inline">${escapeHtml(theme.icon)} ${escapeHtml(getRoomLabel(activeRoom))}</span> med egna kategorier och platser`;
  }

  const manageLabel = document.getElementById('manageActiveRoomLabel');
  if (manageLabel) {
    const theme = getRoomTheme(activeRoom);
    manageLabel.innerHTML = `${escapeHtml(theme.icon)} ${escapeHtml(getRoomLabel(activeRoom))}`;
  }

  const roomSelect = document.getElementById('homeRoomSelect');
  if (roomSelect) {
    roomSelect.innerHTML = getAllRoomDefs().map(room => {
      const theme = getRoomTheme(room);
      return `<option value="${room.key}">${escapeHtml(theme.icon)} ${escapeHtml(room.label)}</option>`;
    }).join('');
    roomSelect.value = activeRoom;
  }
}

function renderHomePlaceTabs() {
  const wrap = document.getElementById('homePlaceTabs');
  if (!wrap) return;
  wrap.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'room-subtab' + (!activePlaceFilter ? ' active' : '');
  allBtn.textContent = 'Alla platser';
  allBtn.onclick = () => setActivePlaceFilter('');
  wrap.appendChild(allBtn);

  getPlacesForRoom(activeRoom).forEach(place => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'room-subtab' + (activePlaceFilter === place.key ? ' active' : '');
    btn.textContent = place.label;
    btn.onclick = () => setActivePlaceFilter(place.key);
    wrap.appendChild(btn);
  });
}


function addRoom() {
  const input = document.getElementById('newRoomName');
  if (!input) return;

  const label = cleanRoomLabel(input.value);
  const key = normalizeRoomKey(label);
  if (!label || !key) return;

  if (getAllRoomDefs().some(room => room.key === key || room.label === label)) {
    alert('Rum finns redan.');
    input.value = '';
    return;
  }

  getAllRoomDefs().push({
    key,
    label,
    defaultCategories: ['ÖVRIGT'],
    defaultPlaces: [{ key: 'hylla', label: '📦 Hylla' }]
  });

  if (!roomConfigs || typeof roomConfigs !== 'object' || Array.isArray(roomConfigs)) roomConfigs = {};
  roomConfigs[key] = {
    categories: ['ÖVRIGT'],
    places: [{ key: 'hylla', label: '📦 Hylla' }]
  };

  input.value = '';
  activeRoom = key;
  activePlaceFilter = '';
  save();
  render();
}

function renameRoomPrompt(roomKey) {
  const room = getRoomDef(roomKey);
  if (!room?.key) return;

  const next = prompt('Ändra namn på rum', room.label);
  if (next === null) return;

  const label = cleanRoomLabel(next);
  if (!label) {
    alert('Rum kan inte vara tomt.');
    return;
  }

  const exists = getAllRoomDefs().some(entry => entry.key !== room.key && entry.label === label);
  if (exists) {
    alert('Det finns redan ett rum med det namnet.');
    return;
  }

  room.label = label;
  save();
  render();
}

function removeRoom(roomKey) {
  const cleanKey = normalizeRoomKey(roomKey);
  if (!cleanKey) return;

  if (isRoomProtected(cleanKey)) {
    alert('Det här rummet kan inte tas bort.');
    return;
  }

  const defs = getAllRoomDefs();
  if (defs.length <= 1) {
    alert('Du måste ha minst ett rum kvar.');
    return;
  }

  const room = defs.find(entry => entry.key === cleanKey);
  if (!room) return;

  if (!confirm(`Ta bort ${room.label}? Varor flyttas till KÖKET.`)) return;

  const fallbackRoom = getAllRoomDefs().find(entry => entry.key === 'koket')?.key || getAllRoomDefs().find(entry => entry.key !== cleanKey)?.key || 'koket';

  items.forEach(item => {
    if ((item.room || 'koket') === cleanKey) {
      item.room = fallbackRoom;
      item.place = ensurePlaceExists(item.place || getPlacesForRoom(fallbackRoom)[0]?.key || 'hylla', fallbackRoom);
      item.category = ensureCategoryExists(item.category || getRoomFallbackCategory(item.room || activeRoom), fallbackRoom);
    }
  });

  quickItems.forEach(item => {
    if ((item.room || 'koket') === cleanKey) {
      item.room = fallbackRoom;
      item.place = ensurePlaceExists(item.place || getPlacesForRoom(fallbackRoom)[0]?.key || 'hylla', fallbackRoom);
      item.category = ensureCategoryExists(item.category || getRoomFallbackCategory(item.room || activeRoom), fallbackRoom);
    }
  });

  roomDefs = defs.filter(entry => entry.key !== cleanKey);
  delete roomConfigs[cleanKey];

  if (activeRoom === cleanKey) {
    activeRoom = fallbackRoom;
    activePlaceFilter = '';
  }

  save();
  render();
}

function setActiveRoom(roomKey) {
  if (!getAllRoomDefs().some(room => room.key === roomKey)) return;
  activeRoom = roomKey;
  activePlaceFilter = '';
  save();
  render();
}

function setActivePlaceFilter(placeKey) {
  activePlaceFilter = placeKey || '';
  save();
  renderHomePlaceTabs();
  renderHomeList(document.getElementById('searchInput')?.value.trim() || '', document.getElementById('categoryFilter')?.value || '');
}

function scrollRoomTabs(direction = 1) {
  const wrap = document.getElementById('homeRoomTabs');
  if (wrap) wrap.scrollBy({ left: 220 * direction, behavior: 'smooth' });
}

function scrollPlaceTabs(direction = 1) {
  const wrap = document.getElementById('homePlaceTabs');
  if (wrap) wrap.scrollBy({ left: 180 * direction, behavior: 'smooth' });
}

function scrollManageRoomTabs(direction = 1) {
  const wrap = document.getElementById('manageRoomTabs');
  if (wrap) wrap.scrollBy({ left: 240 * direction, behavior: 'smooth' });
}

function updateManageCounts() {
  const categoryCount = document.getElementById('manageCategoryCount');
  const placeCount = document.getElementById('managePlaceCount');
  const roomLabel = document.getElementById('manageActiveRoomLabel');
  const roomCategories = getCategoriesForRoom(activeRoom);
  const roomPlaces = getPlacesForRoom(activeRoom);

  if (categoryCount) categoryCount.textContent = `${roomCategories.length} kategorier`;
  if (placeCount) placeCount.textContent = `${roomPlaces.length} platser`;
  if (roomLabel) roomLabel.textContent = getRoomLabel(activeRoom);
}


function render() {
  populateQuickRoomSelect();
  updateToggleButtons();
  renderRoomTabs();
  renderCategoryOptions();
  renderPlaceOptions();
  renderQuickAddRoomOptions(getQuickRoomSelection());
  renderQuickList();

  const searchText = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const categoryFilter = document.getElementById('categoryFilter')?.value || '';

  renderHomeList(searchText, categoryFilter);
  renderBuyList(searchText, categoryFilter);
  updateSummary();
  updateManageCounts();
  renderRecipeSelect();
  renderDraftIngredients();
  if (typeof refreshWeekPlannerUI === 'function') refreshWeekPlannerUI();

  const recipeSection = document.getElementById('recipeSection');
  if (recipeSection) recipeSection.style.display = showRecipes ? '' : 'none';
}

document.addEventListener('click', event => {
  const quickInput = document.getElementById('quickItemName');
  const quickBox = document.getElementById('quickSuggestions');
  if (quickInput && quickBox && !quickBox.contains(event.target) && event.target !== quickInput) hideQuickSuggestions();

  const mainInput = document.getElementById('itemName');
  const mainBox = document.getElementById('mainItemSuggestions');
  if (mainInput && mainBox && !mainBox.contains(event.target) && event.target !== mainInput) hideMainItemSuggestions();
});

document.addEventListener('DOMContentLoaded', () => {
  const itemName = document.getElementById('itemName');
  const itemPrice = document.getElementById('itemPrice');
  const itemQuantity = document.getElementById('itemQuantity');
  const itemMeasureText = document.getElementById('itemMeasureText');

  const handleQuickAddKeydown = (event) => {
    const targetId = event.target?.id || '';
    if (!['itemName', 'itemPrice', 'itemQuantity', 'itemMeasureText'].includes(targetId)) return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) addItemAndUse();
    else addItem();
  };

  [itemName, itemPrice, itemQuantity, itemMeasureText].forEach(el => {
    if (el) el.addEventListener('keydown', handleQuickAddKeydown);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  hydrateData();
  householdSize = Math.max(1, Math.min(8, Number(householdSize || 1)));
  const recipeCategory = document.getElementById('recipeCategory');
  if (recipeCategory) {
    recipeCategory.value = 'matlagning';
    recipeCategory.addEventListener('change', () => refreshPortionSelectLabels());
  }
  const recipeYield = document.getElementById('recipeYield');
  if (recipeYield) recipeYield.value = '4';
  renderCategoryOptions();
  renderPlaceOptions();
  updateSizeSelect('itemSize', document.getElementById('itemUnit')?.value || 'st');
  updateSizeSelect('editSize', document.getElementById('editUnit')?.value || 'st');
  updateSizeSelect('ingredientEditSize', document.getElementById('ingredientEditUnit')?.value || 'st', null, getRecipeIngredientContext(document.getElementById('ingredientEditName')?.value || ''));
  render();
});


const WEEK_DAYS = [
  { key: 'mon', short: 'Mån', long: 'Måndag' },
  { key: 'tue', short: 'Tis', long: 'Tisdag' },
  { key: 'wed', short: 'Ons', long: 'Onsdag' },
  { key: 'thu', short: 'Tor', long: 'Torsdag' },
  { key: 'fri', short: 'Fre', long: 'Fredag' },
  { key: 'sat', short: 'Lör', long: 'Lördag' },
  { key: 'sun', short: 'Sön', long: 'Söndag' }
];

const WEEK_MEAL_SLOTS_DEFAULT = [
  {
    key: 'breakfast',
    label: 'Frukost',
    icon: '🥐',
    recipeKey: 'breakfastRecipe',
    customKey: 'breakfast',
    selectId: 'weekBreakfastRecipeSelect',
    inputId: 'weekBreakfast',
    previewId: 'weekPreviewBreakfast'
  },
  {
    key: 'lunch',
    label: 'Lunch',
    icon: '🥗',
    recipeKey: 'lunchRecipe',
    customKey: 'lunch',
    selectId: 'weekLunchRecipeSelect',
    inputId: 'weekLunch',
    previewId: 'weekPreviewLunch'
  },
  {
    key: 'dinner',
    label: 'Middag',
    icon: '🍽️',
    recipeKey: 'recipe',
    customKey: 'meal',
    selectId: 'weekRecipeSelect',
    inputId: 'weekCustomMeal',
    previewId: 'weekPreviewMeal'
  },
  {
    key: 'evening',
    label: 'Kvällsmat',
    icon: '🌙',
    recipeKey: 'eveningRecipe',
    customKey: 'evening',
    selectId: 'weekEveningRecipeSelect',
    inputId: 'weekEveningMeal',
    previewId: 'weekPreviewEvening'
  },
  {
    key: 'dessert',
    label: 'Efterrätt',
    icon: '🍰',
    recipeKey: 'dessertRecipe',
    customKey: 'dessert',
    selectId: 'weekDessertRecipeSelect',
    inputId: 'weekDessertMeal',
    previewId: 'weekPreviewDessert'
  },
  {
    key: 'candy',
    label: 'Godis',
    icon: '🍬',
    recipeKey: 'candyRecipe',
    customKey: 'candy',
    selectId: 'weekCandyRecipeSelect',
    inputId: 'weekCandyMeal',
    previewId: 'weekPreviewCandy'
  }
];

let weekMealOrder = JSON.parse(localStorage.getItem('matlista_week_meal_order') || '[]');
let weekPlanner = JSON.parse(localStorage.getItem('matlista_weekplanner') || '{}');
let selectedWeekDay = localStorage.getItem('matlista_weekplanner_selected') || getTodayWeekKey();

function getTodayWeekKey() {
  const day = new Date().getDay();
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[day] || 'mon';
}

function getWeekMealSlots() {
  const defaultKeys = WEEK_MEAL_SLOTS_DEFAULT.map(slot => slot.key);
  const order = Array.isArray(weekMealOrder) ? weekMealOrder.filter(key => defaultKeys.includes(key)) : [];
  defaultKeys.forEach(key => {
    if (!order.includes(key)) order.push(key);
  });
  weekMealOrder = order.slice();
  return weekMealOrder.map(key => WEEK_MEAL_SLOTS_DEFAULT.find(slot => slot.key === key)).filter(Boolean);
}

function getWeekDayDef(dayKey) {
  return WEEK_DAYS.find(day => day.key === dayKey) || WEEK_DAYS[0];
}

function getWeekPlanEmptyEntry() {
  return {
    recipe: '',
    meal: '',
    breakfast: '',
    breakfastRecipe: '',
    lunch: '',
    lunchRecipe: '',
    evening: '',
    eveningRecipe: '',
    dessert: '',
    dessertRecipe: '',
    candy: '',
    candyRecipe: '',
    note: '',
    cooked: false,
    lastCheckMissing: null
  };
}

function ensureWeekPlannerShape() {
  if (!weekPlanner || typeof weekPlanner !== 'object' || Array.isArray(weekPlanner)) weekPlanner = {};
  WEEK_DAYS.forEach(day => {
    const entry = weekPlanner[day.key];
    const base = getWeekPlanEmptyEntry();

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      weekPlanner[day.key] = { ...base };
      return;
    }

    weekPlanner[day.key] = {
      ...base,
      recipe: String(entry.recipe || ''),
      meal: String(entry.meal || ''),
      breakfast: String(entry.breakfast || ''),
      breakfastRecipe: String(entry.breakfastRecipe || ''),
      lunch: String(entry.lunch || ''),
      lunchRecipe: String(entry.lunchRecipe || ''),
      evening: String(entry.evening || ''),
      eveningRecipe: String(entry.eveningRecipe || ''),
      dessert: String(entry.dessert || ''),
      dessertRecipe: String(entry.dessertRecipe || ''),
      candy: String(entry.candy || ''),
      candyRecipe: String(entry.candyRecipe || ''),
      note: String(entry.note || ''),
      cooked: Boolean(entry.cooked),
      lastCheckMissing: entry.lastCheckMissing === null || entry.lastCheckMissing === undefined ? null : Math.max(0, Number(entry.lastCheckMissing || 0))
    };
  });
}

function saveWeekPlannerState() {
  ensureWeekPlannerShape();
  localStorage.setItem('matlista_weekplanner', JSON.stringify(weekPlanner));
  localStorage.setItem('matlista_weekplanner_selected', selectedWeekDay);
  localStorage.setItem('matlista_week_meal_order', JSON.stringify(weekMealOrder));
}

function getWeekPlan(dayKey = selectedWeekDay) {
  ensureWeekPlannerShape();
  return { ...getWeekPlanEmptyEntry(), ...(weekPlanner[dayKey] || {}) };
}

function getWeekMealValue(plan, slot) {
  if (!plan || !slot) return '';
  return String(plan[slot.recipeKey] || plan[slot.customKey] || '').trim();
}

function getWeekMealDisplay(plan, slot) {
  return getWeekMealValue(plan, slot) || '-';
}

function getWeekPlanHasContent(plan) {
  if (!plan) return false;
  return Boolean(
    getWeekMealSlots().some(slot => getWeekMealValue(plan, slot)) ||
    String(plan.note || '').trim()
  );
}

function getWeekPlanRecipes(plan) {
  return getWeekMealSlots()
    .map(slot => {
      const recipeName = String(plan?.[slot.recipeKey] || '').trim();
      if (!recipeName) return null;
      const recipe = recipes.find(entry => entry.name === recipeName);
      if (!recipe) return null;
      return { slot, recipe, recipeName };
    })
    .filter(Boolean);
}

function getWeekDayBadgeText(plan) {
  const slots = getWeekMealSlots();
  const dinnerSlot = slots.find(slot => slot.key === 'dinner');
  const dinner = getWeekMealValue(plan, dinnerSlot);
  if (dinner) return dinner;
  const firstPlanned = slots.find(slot => getWeekMealValue(plan, slot));
  if (!firstPlanned) return 'Ingen plan';
  return getWeekMealValue(plan, firstPlanned);
}

function getWeekDinnerTitle(plan) {
  return getWeekDayBadgeText(plan);
}

function getWeekPlanTitle(plan) {
  if (!getWeekPlanHasContent(plan)) return 'Ingen plan';
  const parts = getWeekMealSlots()
    .filter(slot => getWeekMealValue(plan, slot))
    .map(slot => `${slot.label}: ${getWeekMealValue(plan, slot)}`);
  if (plan.note) parts.push(`Notis: ${plan.note}`);
  return parts.join(' • ');
}

function getWeekPlanStatus(plan) {
  if (!getWeekPlanHasContent(plan)) return 'empty';
  if (plan.cooked) return 'cooked';
  if (Number(plan.lastCheckMissing || 0) > 0) return 'missing';
  return 'planned';
}

function getWeekPlanStatusLabel(plan) {
  const status = getWeekPlanStatus(plan);
  if (status === 'cooked') return 'Klar';
  if (status === 'missing') return 'Saknar varor';
  if (status === 'planned') return 'Planerad';
  return 'Ingen plan';
}

function buildWeekRecipeOptions(selectId, selectedValue, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  recipes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv')).forEach(recipe => {
    const opt = document.createElement('option');
    const typeMeta = getRecipeCategoryMeta(recipe.category || recipe.type);
    opt.value = recipe.name || '';
    opt.textContent = `${typeMeta.icon} ${recipe.name || ''}`;
    if ((recipe.name || '') === (selectedValue || '')) opt.selected = true;
    select.appendChild(opt);
  });
}

function buildAllWeekRecipeOptions(plan) {
  getWeekMealSlots().forEach(slot => {
    buildWeekRecipeOptions(
      slot.selectId,
      plan?.[slot.recipeKey] || '',
      `Välj ${slot.label.toLowerCase()}-recept`
    );
  });
}

function renderWeekMealRowsByOrder() {
  const container = document.getElementById('weekMealRows');
  if (!container) return;
  const noteRow = container.querySelector('.week-note-row');
  getWeekMealSlots().forEach(slot => {
    const row = container.querySelector(`.week-meal-row[data-slot-key="${slot.key}"]`);
    if (row) container.insertBefore(row, noteRow || null);
  });
}

function renderWeekDayButtons() {
  const row = document.getElementById('weekDayRow');
  if (!row) return;
  row.innerHTML = '';

  WEEK_DAYS.forEach(day => {
    const plan = getWeekPlan(day.key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'week-day-btn';
    if (day.key === selectedWeekDay) btn.classList.add('active');
    if (day.key === getTodayWeekKey()) btn.classList.add('today');
    btn.classList.add('status-' + getWeekPlanStatus(plan));
    btn.onclick = () => selectWeekDay(day.key);
    btn.innerHTML = `
      <span class="day-short">${day.short}</span>
      <span class="day-meal">${escapeHtml(getWeekDinnerTitle(plan))}</span>
    `;
    row.appendChild(btn);
  });
}

function renderWeekOverview() {
  const target = document.getElementById('weekOverview');
  if (!target) return;

  const plannedCount = WEEK_DAYS.filter(day => getWeekPlanHasContent(getWeekPlan(day.key))).length;
  const cookedCount = WEEK_DAYS.filter(day => getWeekPlan(day.key).cooked).length;
  const missingCount = WEEK_DAYS.filter(day => Number(getWeekPlan(day.key).lastCheckMissing || 0) > 0 && !getWeekPlan(day.key).cooked).length;
  const nextPlanned = WEEK_DAYS.find(day => getWeekPlanHasContent(getWeekPlan(day.key)));

  target.innerHTML = `
    <div class="week-summary-line" style="grid-column:1/-1;">
      <div class="week-summary-pill">Plan ${plannedCount}/7</div>
      <div class="week-summary-pill">Klara ${cookedCount}</div>
      <div class="week-summary-pill">Saknas ${missingCount}</div>
      <div class="week-summary-pill">Nästa ${nextPlanned ? nextPlanned.long : 'Ingen'}</div>
    </div>
  `;

  WEEK_DAYS.forEach(day => {
    const plan = getWeekPlan(day.key);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `week-overview-card status-${getWeekPlanStatus(plan)}`;
    if (day.key === selectedWeekDay) card.classList.add('active');
    card.onclick = () => selectWeekDay(day.key);

    const mealsHtml = getWeekMealSlots()
      .filter(slot => getWeekMealValue(plan, slot))
      .map(slot => `<div class="week-overview-meta"><strong>${slot.icon}</strong> ${escapeHtml(getWeekMealValue(plan, slot))}</div>`)
      .join('') || '<div class="week-overview-meta">Ingen plan</div>';

    card.innerHTML = `
      <h4>${day.long}</h4>
      <div class="week-overview-meal">${escapeHtml(getWeekDinnerTitle(plan))}</div>
      ${mealsHtml}
    `;
    target.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function refreshWeekPlannerUI() {
  ensureWeekPlannerShape();

  if (!WEEK_DAYS.some(day => day.key === selectedWeekDay)) {
    selectedWeekDay = getTodayWeekKey();
  }

  const plan = getWeekPlan(selectedWeekDay);
  const dayDef = getWeekDayDef(selectedWeekDay);

  buildAllWeekRecipeOptions(plan);
  renderWeekMealRowsByOrder();

  const selectedDayName = document.getElementById('weekSelectedDayName');
  const note = document.getElementById('weekNote');
  const previewNote = document.getElementById('weekPreviewNote');
  const dayStatus = document.getElementById('weekDayStatus');

  if (selectedDayName) selectedDayName.textContent = dayDef.long;
  if (note) note.value = plan.note || '';
  if (previewNote) previewNote.textContent = plan.note || '-';

  getWeekMealSlots().forEach(slot => {
    const select = document.getElementById(slot.selectId);
    const input = document.getElementById(slot.inputId);
    const preview = document.getElementById(slot.previewId);
    if (select) select.value = plan[slot.recipeKey] || '';
    if (input) input.value = plan[slot.customKey] || '';
    if (preview) preview.textContent = getWeekMealDisplay(plan, slot);
  });

  if (dayStatus) {
    dayStatus.textContent = getWeekPlanStatusLabel(plan);
    dayStatus.className = 'week-status-pill week-status-' + getWeekPlanStatus(plan);
  }

  renderWeekDayButtons();
  renderWeekOverview();
  saveWeekPlannerState();
}

function selectWeekDay(dayKey) {
  selectedWeekDay = dayKey;
  refreshWeekPlannerUI();
}

function jumpToTodayPlan() {
  selectedWeekDay = getTodayWeekKey();
  refreshWeekPlannerUI();
  const planner = document.querySelector('.week-planner');
  if (planner) planner.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveWeekPlanForSelectedDay() {
  ensureWeekPlannerShape();

  const previous = getWeekPlan(selectedWeekDay);
  const nextPlan = {
    ...previous,
    note: document.getElementById('weekNote')?.value.trim() || ''
  };

  getWeekMealSlots().forEach(slot => {
    nextPlan[slot.recipeKey] = document.getElementById(slot.selectId)?.value || '';
    nextPlan[slot.customKey] = document.getElementById(slot.inputId)?.value.trim() || '';
  });

  const recipeNames = getWeekMealSlots().map(slot => nextPlan[slot.recipeKey]).filter(Boolean);
  const previousRecipeNames = getWeekMealSlots().map(slot => previous[slot.recipeKey]).filter(Boolean);
  const sameRecipes = recipeNames.length === previousRecipeNames.length && recipeNames.every((name, index) => name === previousRecipeNames[index]);

  nextPlan.cooked = previous.cooked && getWeekPlanHasContent(nextPlan) ? true : false;
  nextPlan.lastCheckMissing = sameRecipes ? previous.lastCheckMissing : null;

  if (!getWeekPlanHasContent(nextPlan)) {
    nextPlan.cooked = false;
    nextPlan.lastCheckMissing = null;
  }

  weekPlanner[selectedWeekDay] = nextPlan;
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function clearSelectedWeekPlan() {
  weekPlanner[selectedWeekDay] = getWeekPlanEmptyEntry();
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function toggleCookedSelectedDay() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!getWeekPlanHasContent(plan)) return;
  plan.cooked = !plan.cooked;
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function syncRecipeSectionToWeekPlan(recipeName) {
  if (!recipeName) return false;
  const select = document.getElementById('recipeSelect');
  if (!select) return false;

  const optionExists = Array.from(select.options).some(opt => opt.value === recipeName);
  if (!optionExists) return false;

  select.value = recipeName;

  const search = document.getElementById('recipeSearch');
  if (search) search.value = '';
  if (typeof refreshPortionSelectLabels === 'function') refreshPortionSelectLabels(getSelectedRecipe());

  if (typeof renderSelectedRecipeIngredients === 'function') renderSelectedRecipeIngredients();
  if (typeof clearRecipeResult === 'function') clearRecipeResult();

  const recipeSection = document.getElementById('recipeSection');
  if (recipeSection) recipeSection.style.display = '';
  showRecipes = true;
  updateToggleButtons();
  return true;
}

function getWeekPrimaryRecipeName(plan) {
  const recipesForDay = getWeekPlanRecipes(plan);
  const dinnerRecipe = recipesForDay.find(entry => entry.slot.key === 'dinner');
  return (dinnerRecipe || recipesForDay[0] || {}).recipeName || '';
}

function checkSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  const recipesForDay = getWeekPlanRecipes(plan);
  if (!recipesForDay.length) return;

  let totalMissing = 0;

  recipesForDay.forEach((entry, index) => {
    const ok = syncRecipeSectionToWeekPlan(entry.recipeName);
    if (!ok) return;
    if (typeof checkRecipe === 'function') checkRecipe();
    totalMissing += Array.isArray(currentRecipeMissing) ? currentRecipeMissing.length : 0;
  });

  plan.lastCheckMissing = totalMissing;
  if (totalMissing === 0 && getWeekPlanHasContent(plan)) {
    plan.cooked = false;
  }
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();

  const primaryRecipe = getWeekPrimaryRecipeName(plan);
  if (primaryRecipe) syncRecipeSectionToWeekPlan(primaryRecipe);
  refreshWeekPlannerUI();
}

function addMissingForSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  const recipesForDay = getWeekPlanRecipes(plan);
  if (!recipesForDay.length) return;

  let totalMissing = 0;

  recipesForDay.forEach(entry => {
    const ok = syncRecipeSectionToWeekPlan(entry.recipeName);
    if (!ok) return;
    if (typeof checkRecipe === 'function') checkRecipe();
    totalMissing += Array.isArray(currentRecipeMissing) ? currentRecipeMissing.length : 0;
    if (typeof addMissingToBuy === 'function') addMissingToBuy();
  });

  plan.lastCheckMissing = totalMissing;
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();

  const primaryRecipe = getWeekPrimaryRecipeName(plan);
  if (primaryRecipe) syncRecipeSectionToWeekPlan(primaryRecipe);
  refreshWeekPlannerUI();
}

function cookSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  const recipesForDay = getWeekPlanRecipes(plan);
  if (!recipesForDay.length) return;

  recipesForDay.forEach(entry => {
    const ok = syncRecipeSectionToWeekPlan(entry.recipeName);
    if (!ok) return;
    if (typeof useRecipeIngredients === 'function') useRecipeIngredients();
  });

  plan.cooked = true;
  plan.lastCheckMissing = 0;
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();

  const primaryRecipe = getWeekPrimaryRecipeName(plan);
  if (primaryRecipe) syncRecipeSectionToWeekPlan(primaryRecipe);
  refreshWeekPlannerUI();
}

function updateWeekMealOrderFromDom() {
  const rows = Array.from(document.querySelectorAll('#weekMealRows .week-meal-row[data-slot-key]'));
  const nextOrder = rows
    .map(row => row.dataset.slotKey || '')
    .filter(Boolean);

  const defaultKeys = WEEK_MEAL_SLOTS_DEFAULT.map(slot => slot.key);
  defaultKeys.forEach(key => {
    if (!nextOrder.includes(key)) nextOrder.push(key);
  });
  weekMealOrder = nextOrder;
  saveWeekPlannerState();
}

function initWeekMealDragAndDrop() {
  const container = document.getElementById('weekMealRows');
  if (!container) return;

  let draggedRow = null;

  container.querySelectorAll('.week-meal-row[data-slot-key]').forEach(row => {
    row.setAttribute('draggable', 'true');

    row.addEventListener('dragstart', () => {
      draggedRow = row;
      row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggedRow = null;
      updateWeekMealOrderFromDom();
      renderWeekMealRowsByOrder();
    });

    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      const currentTarget = row;
      if (!draggedRow || draggedRow === currentTarget) return;

      const rect = currentTarget.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      if (before) {
        container.insertBefore(draggedRow, currentTarget);
      } else {
        container.insertBefore(draggedRow, currentTarget.nextSibling);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  ensureWeekPlannerShape();
  renderWeekMealRowsByOrder();
  refreshWeekPlannerUI();
  initWeekMealDragAndDrop();

  getWeekMealSlots().forEach(slot => {
    const select = document.getElementById(slot.selectId);
    const input = document.getElementById(slot.inputId);

    if (select) {
      select.addEventListener('change', () => {
        const selectedName = select.value || '';
        if (selectedName && input && !input.value.trim()) input.value = selectedName;
      });
    }
  });
});

// ===== THEME SYSTEM =====
const themes = ["scifi","dark","light","matrix","sunset","ice"];
let currentThemeIndex = 0;

const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  const index = themes.indexOf(savedTheme);
  if (index !== -1) currentThemeIndex = index;
}

function applyTheme(theme) {
  document.body.className = "";
  document.body.classList.add("theme-" + theme);
  localStorage.setItem("theme", theme);

  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.innerText = "🎨 " + theme.toUpperCase();
}

function toggleTheme() {
  currentThemeIndex++;
  if (currentThemeIndex >= themes.length) currentThemeIndex = 0;
  applyTheme(themes[currentThemeIndex]);
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(themes[currentThemeIndex]);
});



// ===== PWA / INSTALL APP =====
let deferredPrompt = null;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallButtonVisibility(forceHide = false) {
  const installBtn = document.getElementById('installBtn');
  if (!installBtn) return;
  if (forceHide || isStandaloneMode()) {
    installBtn.style.display = 'none';
    return;
  }
  installBtn.style.display = deferredPrompt ? 'inline-flex' : 'none';
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  updateInstallButtonVisibility();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  updateInstallButtonVisibility(true);
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (err) {
        console.warn('Install prompt avbröts:', err);
      }
      deferredPrompt = null;
      updateInstallButtonVisibility(true);
    });
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Service worker kunde inte registreras:', err);
    });
  }

  updateInstallButtonVisibility();
});



document.addEventListener('input', (e) => {
  if (!e.target) return;
  if (['itemMeasureText', 'itemQuantity'].includes(e.target.id)) updateMeasureSummary();
  if (['editMeasureText', 'editQuantity'].includes(e.target.id)) updateEditMeasureSummary();
  if (['ingredientEditMeasureText', 'ingredientEditQty'].includes(e.target.id)) updateIngredientEditMeasureSummary();
});

document.addEventListener('change', (e) => {
  if (!e.target) return;
  if (e.target.id === 'itemUnit') syncMeasureModeVisibility();
  if (e.target.id === 'editUnit') syncEditMeasureModeVisibility();
  if (e.target.id === 'ingredientEditUnit') syncIngredientEditMeasureModeVisibility();
  if (e.target.id === 'itemMeasureText') formatMeasureInputField(e.target, document.getElementById('itemUnit')?.value || 'g');
  if (e.target.id === 'editMeasureText') formatMeasureInputField(e.target, document.getElementById('editUnit')?.value || 'g');
  if (e.target.id === 'ingredientEditMeasureText') formatMeasureInputField(e.target, document.getElementById('ingredientEditUnit')?.value || 'g');
});

document.addEventListener('blur', (e) => {
  if (!e.target) return;
  if (e.target.id === 'itemMeasureText') {
    formatMeasureInputField(e.target, document.getElementById('itemUnit')?.value || 'g');
    updateMeasureSummary();
  }
  if (e.target.id === 'editMeasureText') {
    formatMeasureInputField(e.target, document.getElementById('editUnit')?.value || 'g');
    updateEditMeasureSummary();
  }
  if (e.target.id === 'ingredientEditMeasureText') {
    formatMeasureInputField(e.target, document.getElementById('ingredientEditUnit')?.value || 'g');
    updateIngredientEditMeasureSummary();
  }
}, true);

window.addEventListener('load', () => { try { syncMeasureModeVisibility(); syncEditMeasureModeVisibility(); syncIngredientEditMeasureModeVisibility(); updateMeasureSummary(); updateEditMeasureSummary(); updateIngredientEditMeasureSummary(); } catch (e) {} });


// Drag & Drop meals
let draggedMeal = null;

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.week-meal-row').forEach(row => {

    row.addEventListener('dragstart', () => {
      draggedMeal = row;
      row.classList.add('dragging');
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const container = row.parentNode;
      const afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement == null) {
        container.appendChild(draggedMeal);
      } else {
        container.insertBefore(draggedMeal, afterElement);
      }
    });

  });
});

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.week-meal-row:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// ===== PAGE TABS =====
const PAGE_TAB_STORAGE_KEY = 'activeKitchenPage';
const PAGE_NAMES = ['home', 'buy', 'quick', 'week', 'recipes', 'manage'];

function normalizePageName(page) {
  return PAGE_NAMES.includes(page) ? page : 'home';
}

function getInitialKitchenPage() {
  const hashPage = (window.location.hash || '').replace('#', '').trim().toLowerCase();
  if (PAGE_NAMES.includes(hashPage)) return hashPage;
  const savedPage = localStorage.getItem(PAGE_TAB_STORAGE_KEY) || 'home';
  return normalizePageName(savedPage);
}

function setActiveKitchenPage(page, pushHash = true) {
  const nextPage = normalizePageName(page);
  document.querySelectorAll('[data-page]').forEach(section => {
    const isActive = section.dataset.page === nextPage;
    section.classList.toggle('page-visible', isActive);
    section.classList.toggle('page-switching', isActive);
  });

  document.querySelectorAll('[data-page-tab]').forEach(button => {
    const active = button.dataset.pageTab === nextPage;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  localStorage.setItem(PAGE_TAB_STORAGE_KEY, nextPage);
  if (pushHash) {
    history.replaceState(null, '', `#${nextPage}`);
  }
  window.setTimeout(() => {
    document.querySelectorAll('.page-switching').forEach(node => node.classList.remove('page-switching'));
  }, 220);
}

window.setActiveKitchenPage = setActiveKitchenPage;

function initKitchenPageTabs() {
  document.querySelectorAll('[data-page-tab]').forEach(button => {
    button.addEventListener('click', () => setActiveKitchenPage(button.dataset.pageTab || 'home'));
  });
  setActiveKitchenPage(getInitialKitchenPage(), false);
  window.addEventListener('hashchange', () => {
    const hashPage = (window.location.hash || '').replace('#', '').trim().toLowerCase();
    if (PAGE_NAMES.includes(hashPage)) setActiveKitchenPage(hashPage, false);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initKitchenPageTabs();
  updateManageCounts();
});


document.addEventListener('DOMContentLoaded', updateManageCounts);


window.addEventListener('cloud-auth-changed', event => {
  if (event?.detail?.loggedIn) {
    setTimeout(() => migrateInlineImagesToCloud(true), 700);
  }
});

window.addEventListener('load', () => {
  setTimeout(() => migrateInlineImagesToCloud(false), 1400);
});



/* === AUTO BUY ZIP: use quick-list template for restock packs, only when threshold is reached === */
(function () {
  function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function getQuickTemplateForIngredient(ingredient) {
    const ing = typeof normalizeRecipeIngredient === 'function'
      ? normalizeRecipeIngredient(ingredient)
      : ingredient;
    if (!ing || typeof findQuickItemByName !== 'function') return null;
    return findQuickItemByName(ing.name) || null;
  }

  function getQuickPackSizeForIngredient(ingredient) {
    const ing = normalizeRecipeIngredient(ingredient);
    const quick = getQuickTemplateForIngredient(ing);
    if (!ing || !quick) return 0;

    const unit = String(quick.unit || ing.unit || 'st').toLowerCase();
    if (!supportsSize(unit)) return 0;

    const context = getRecipeIngredientContext({
      ...quick,
      ...ing,
      unit,
      category: quick.category || ing.category || ''
    });

    return Math.max(0, Number(normalizeSize(unit, quick.size, context) || 0));
  }

  function buildQuickPackBuyItem(ingredient, packCount = 1) {
    const ing = normalizeRecipeIngredient(ingredient);
    const quick = getQuickTemplateForIngredient(ing);
    if (!ing || !quick) return null;

    const room = quick.room || activeRoom;
    const unit = String(quick.unit || ing.unit || 'st').toLowerCase();
    const context = getRecipeIngredientContext({
      ...quick,
      ...ing,
      unit,
      category: quick.category || ing.category || ''
    });
    const size = supportsSize(unit) ? normalizeSize(unit, quick.size, context) : null;

    return {
      name: quick.name || ing.name,
      price: Number(quick.price || 0),
      quantity: Math.max(1, Math.round(packCount)) * Math.max(1, Number(quick.quantity || 1)),
      unit,
      size,
      measureText: supportsSize(unit) && size ? formatSmartMeasureDisplay(size, unit) : '',
      weightText: isWeightUnit(unit) && size ? formatSmartMeasureDisplay(size, unit) : '',
      category: ensureCategoryExists(quick.category || ing.category || getRoomFallbackCategory(room), room),
      place: ensurePlaceExists(quick.place || 'kyl', room),
      room,
      img: quick.img ? String(quick.img) : '',
      type: 'buy'
    };
  }

  function pushOrMergeBuyPack(item) {
    if (!item) return;

    const existing = items.find(entry =>
      entry &&
      entry.type === 'buy' &&
      normalizeText(entry.name) === normalizeText(item.name) &&
      String(entry.unit || 'st').toLowerCase() === String(item.unit || 'st').toLowerCase() &&
      Number(entry.size || 0) === Number(item.size || 0)
    );

    if (existing) {
      existing.quantity = Math.max(1, safeNum(existing.quantity || 0) + safeNum(item.quantity || 0));
      if (!existing.img && item.img) existing.img = item.img;
      if (!safeNum(existing.price || 0) && safeNum(item.price || 0)) existing.price = safeNum(item.price || 0);
      existing.category = item.category || existing.category;
      existing.place = item.place || existing.place;
      existing.room = item.room || existing.room;
      existing.measureText = item.measureText || existing.measureText || '';
      existing.weightText = item.weightText || existing.weightText || '';
      return;
    }

    items.push({
      ...item,
      quantity: Math.max(1, safeNum(item.quantity || 1))
    });
  }

  /* Lock Snabblista: recipe/home should never mutate quick templates */
  window.syncQuickItemFromItem = function () { return; };
  syncQuickItemFromItem = window.syncQuickItemFromItem;

  window.changeQuickPlace = function changeQuickPlace(index, newPlace) {
    const item = quickItems[index];
    if (!item) return;
    const room = item.room || activeRoom;
    item.place = ensurePlaceExists(newPlace || 'kyl', room);
    save();
    render();
  };
  changeQuickPlace = window.changeQuickPlace;

  window.changeQuickCategory = function changeQuickCategory(index, newCategory) {
    const item = quickItems[index];
    if (!item) return;
    item.category = ensureCategoryExists(newCategory || getRoomFallbackCategory(item.room || activeRoom), item.room || activeRoom);
    save();
    render();
  };
  changeQuickCategory = window.changeQuickCategory;

  /* Buy list should keep whole pack rows instead of merging to weird total kg */
  const originalMergeCanonicalItemIntoList = window.mergeCanonicalItemIntoList || mergeCanonicalItemIntoList;
  window.mergeCanonicalItemIntoList = function mergeCanonicalItemIntoListAutoBuy(nextItem, type = 'buy') {
    if (!nextItem) return;
    const normalizedType = type === 'home' ? 'home' : 'buy';
    const unit = String(nextItem.unit || 'st').toLowerCase();

    if (normalizedType === 'buy' && supportsSize(unit) && Number(nextItem.size || 0) > 0) {
      pushOrMergeBuyPack({
        ...nextItem,
        type: 'buy',
        unit,
        size: Math.max(1, Math.round(Number(nextItem.size || 0)))
      });
      return;
    }

    return originalMergeCanonicalItemIntoList(nextItem, type);
  };
  mergeCanonicalItemIntoList = window.mergeCanonicalItemIntoList;

  /* Missing ingredients button should use whole packs from quick template */
  window.createBuyItemFromMissingEntry = function createBuyItemFromMissingEntryAutoBuy(entry) {
    if (!entry) return null;

    const ingredient = normalizeRecipeIngredient(entry.ingredient || entry);
    if (!ingredient) return null;

    const missingAmount = Math.max(0, Number(entry.missing || 0));
    if (!missingAmount) return null;

    const packSize = getQuickPackSizeForIngredient(ingredient);
    if (packSize > 0) {
      const packCount = Math.max(1, Math.ceil(missingAmount / packSize));
      return buildQuickPackBuyItem(ingredient, packCount);
    }

    return null;
  };
  createBuyItemFromMissingEntry = window.createBuyItemFromMissingEntry;

  function shouldAutoBuyPack(ingredient, amountBefore = 0) {
    const ing = normalizeRecipeIngredient(ingredient);
    if (!ing) return false;

    const amountAfter = Math.max(0, Number(getHomeAmountForIngredient(ing) || 0));
    const quickPackSize = Math.max(0, Number(getQuickPackSizeForIngredient(ing) || 0));

    if (isWeightUnit(ing.unit)) {
      const hadMultiplePacksBefore = quickPackSize > 0 && Number(amountBefore || 0) > quickPackSize;
      if (hadMultiplePacksBefore) return amountAfter <= quickPackSize;
      return amountAfter <= 0;
    }

    return amountAfter <= 0;
  }

  /* Recipe button:
     - weight packs (e.g. 2 st × 450 g) add +1 pack when they go down to 1 pack left
     - loose gram items add only when they are completely empty */
  window.queueRestockIfDepleted = function queueRestockIfDepletedAutoBuy(ingredient, amountBefore = 0) {
    const ing = normalizeRecipeIngredient(ingredient);
    if (!ing || amountBefore <= 0) return;
    if (!supportsSize(ing.unit)) return;
    if (!shouldAutoBuyPack(ing, amountBefore)) return;

    const buyItem = buildQuickPackBuyItem(ing, 1);
    if (buyItem) pushOrMergeBuyPack(buyItem);
  };
  queueRestockIfDepleted = window.queueRestockIfDepleted;

  /* Core behavior:
     - keep original gram consumption in Har hemma
     - add one new pack to Buy list only when the remaining amount is low enough */
  const originalUseRecipeIngredients = window.useRecipeIngredients || useRecipeIngredients;
  window.useRecipeIngredients = function useRecipeIngredientsAutoBuy() {
    const recipe = getSelectedRecipe();
    if (!recipe) return;

    const combinedEntries = getCombinedRecipeIngredientEntries([{ slot: { label: 'Recept' }, recipe, recipeName: recipe.name }]);

    consumeIngredientEntries(combinedEntries);

    save();
    checkRecipe();
    render();
  };
  useRecipeIngredients = window.useRecipeIngredients;

  window.__autoBuyZip = 'v30-recipe-button-pack-restock';
})();




(function () {
  'use strict';

  const originalTransferSingleItem = window.transferSingleItem || transferSingleItem;

  function getQuickTemplateForMove(sourceItem) {
    if (!sourceItem || typeof findQuickItemByName !== 'function') return null;
    return findQuickItemByName(sourceItem.name || '') || null;
  }

  window.transferSingleItem = function transferSingleItemQuickTemplateMove(index, targetType, targetPlace = null) {
    const sourceItem = items[index];
    if (!sourceItem) return;

    const sourceType = sourceItem.type === 'buy' ? 'buy' : 'home';
    const normalizedTargetType = targetType === 'buy' ? 'buy' : 'home';

    if (sourceType === 'home' && normalizedTargetType === 'buy') {
      const transferQuantity = getTransferQuantity(sourceItem, normalizedTargetType);
      const quickTemplate = getQuickTemplateForMove(sourceItem);

      if (quickTemplate) {
        addBuyItemFromTemplate(quickTemplate, 1);
      } else {
        addBuyItemFromTemplate(sourceItem, transferQuantity);
      }

      sourceItem.quantity = Math.max(0, Number(sourceItem.quantity || 0) - transferQuantity);

      if (sourceItem.quantity === 0) {
        items.splice(index, 1);
      } else {
        syncQuickItemFromItem(sourceItem);
      }

      items = mergeItems(items);
      return;
    }

    return originalTransferSingleItem(index, targetType, targetPlace);
  };
  transferSingleItem = window.transferSingleItem;

  window.__autoBuyZip = 'v24-move-button-template';
})();
