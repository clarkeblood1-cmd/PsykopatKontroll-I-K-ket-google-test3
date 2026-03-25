let items = JSON.parse(localStorage.getItem('matlista') || '[]');
let quickItems = JSON.parse(localStorage.getItem('matlista_snabb') || '[]');
let recipes = JSON.parse(localStorage.getItem('matlista_recept') || '[]');

let categories = JSON.parse(localStorage.getItem('matlista_categories') || 'null');
if (!Array.isArray(categories) || !categories.length) {
  categories = ['MAT'];
}

let places = JSON.parse(localStorage.getItem('matlista_places') || 'null');
if (!Array.isArray(places) || !places.length) {
  places = [
    { key: 'kyl', label: '🧊 Kyl' },
    { key: 'frys', label: '❄️ Frys' },
    { key: 'kryddor', label: '🌶️ Kryddor' }
  ];
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
      link: ''
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
let editingIngredientIndex = null;
let editingIngredientRecipeIndex = null;
let selectedAddQuickIndex = null;

let draggedItemIndex = null;
let draggedItemSource = null;
let holdAddTimeout = null;
let holdAddInterval = null;
let holdAddTriggered = false;

const defaultPlaces = [
  { key: 'kyl', label: '🧊 Kyl' },
  { key: 'frys', label: '❄️ Frys' },
  { key: 'kryddor', label: '🌶️ Kryddor' }
];

const lockedPlaceKeys = ['kyl', 'frys', 'kryddor'];

const weightSizeOptions = [14, 28, 50, 100, 150, 200, 250, 500, 750, 1000];
const spiceWeightSizeOptions = [14, 28, 50, 100, 150, 200];
const liquidSizeOptions = [250, 500, 1000, 1500, 2000];

function isWeightUnit(unit) {
  return ['g', 'kg'].includes(String(unit || '').toLowerCase());
}

function isLiquidUnit(unit) {
  return ['ml', 'l', 'dl'].includes(String(unit || '').toLowerCase());
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
    const match = raw.match(/^\d+\s*(st|g|kg|ml|dl|l|pkt)?\s+(.*)$/i);
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
  const options = getSizeOptions(unit, context);
  const n = Number(size || 0);
  if (options.includes(n)) return n;
  return getDefaultSize(unit, context);
}

function formatSizeValue(unit, size) {
  const normalized = normalizeSize(unit, size);
  if (!normalized) return '';
  if (isWeightUnit(unit)) {
    return normalized === 1000 ? '1 kg' : `${normalized} g`;
  }
  const liters = normalized / 1000;
  return `${String(Number(liters.toFixed(1))).replace('.', ',')} l`;
}

function getDisplayUnit(unit, size = null) {
  if (isWeightUnit(unit) && Number(size || 0) === 1000) return 'kg';
  if (isLiquidUnit(unit) && Number(size || 0) >= 1000) return 'l';
  if (isLiquidUnit(unit)) return 'ml';
  return unit || 'st';
}

function formatItemAmount(item) {
  const amount = Math.max(0, Number(item?.quantity || 0));
  if (supportsSize(item?.unit)) {
    const sizeLabel = formatSizeValue(item.unit, item.size);
    return `${amount} × ${sizeLabel}`;
  }
  return `${amount} ${item?.unit || 'st'}`;
}

function getSelectedRecipePortions() {
  return Number(document.getElementById('portionSelect')?.value || 2);
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

function applySelectedPortionToIngredient(value) {
  const ingredient = normalizeRecipeIngredient(value);
  if (!ingredient) return null;
  if (isWeightUnit(ingredient.unit)) {
    const context = getRecipeIngredientContext(ingredient);
    return {
      ...ingredient,
      size: context === 'RECIPE_KRYDDOR'
        ? portionToRecipeSpiceSize(getSelectedRecipePortions())
        : context === 'RECIPE_RIVEN_OST'
          ? portionToRecipeGratedCheeseSize(getSelectedRecipePortions())
          : portionToRecipeSize(getSelectedRecipePortions())
    };
  }
  return ingredient;
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
  const base = applySelectedPortionToIngredient(ingredient);
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

function findPlace(placeKey) {
  return places.find(place => place.key === placeKey) || null;
}

function ensurePlaceExists(placeValue) {
  const clean = normalizePlaceKey(placeValue || 'kyl');
  if (!clean) return 'kyl';
  if (!findPlace(clean)) {
    if (clean === 'kyl') places.unshift({ key: 'kyl', label: '🧊 Kyl' });
    else places.push({ key: clean, label: clean });
  }
  return clean;
}

function ensureCategoryExists(category) {
  const clean = String(category || '').trim().toUpperCase();
  if (!clean) return 'MAT';
  if (!categories.includes(clean)) categories.push(clean);
  return clean;
}


function normalizeImageFileName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getRawImageFileName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:"*?<>|]+/g, '')
    .trim();
}

function getImageCandidates(name) {
  const raw = getRawImageFileName(name);
  const normalized = normalizeImageFileName(name);
  const candidates = [
    raw ? `images/${raw}.png` : '',
    raw ? `images/${raw}.jpg` : '',
    raw ? `images/${raw}.jpeg` : '',
    raw ? `images/${raw}.webp` : '',
    normalized ? `images/${normalized}.png` : '',
    normalized ? `images/${normalized}.jpg` : '',
    normalized ? `images/${normalized}.jpeg` : '',
    normalized ? `images/${normalized}.webp` : ''
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function getAutoImagePath(name) {
  const candidates = getImageCandidates(name);
  return candidates[0] || '';
}

function getDisplayImageSrc(item) {
  return item?.img ? String(item.img) : getAutoImagePath(item?.name || '');
}

function handleAutoImageError(imgEl) {
  if (!imgEl) return;
  const listAttr = imgEl.getAttribute('data-img-candidates') || '';
  const candidates = listAttr ? listAttr.split('|').filter(Boolean) : [];
  const nextIndex = Number(imgEl.getAttribute('data-img-index') || '0') + 1;

  if (nextIndex < candidates.length) {
    imgEl.setAttribute('data-img-index', String(nextIndex));
    imgEl.src = candidates[nextIndex];
    return;
  }

  imgEl.onerror = null;
  imgEl.src = 'https://via.placeholder.com/100?text=Bild';
}

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

function getPlaceMeta(place) {
  const found = findPlace(place);
  if (!found) return { key: 'kyl', label: '🧊 Kyl', cls: 'place-kyl' };

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

  places = places
    .map(place => ({
      key: normalizePlaceKey(place?.key || place?.label || ''),
      label: cleanPlaceLabel(place?.label || place?.key || '')
    }))
    .filter(place => place.key && place.label);

  defaultPlaces.slice().reverse().forEach(defaultPlace => {
    if (!findPlace(defaultPlace.key)) places.unshift({ ...defaultPlace });
  });

  places = places.filter((place, index, arr) => arr.findIndex(p => p.key === place.key) === index);

  items = items.map(item => ({
    name: String(item?.name || '').trim(),
    price: Number(item?.price || 0),
    quantity: Math.max(0, Number(item?.quantity || 0)),
    unit: String(item?.unit || 'st'),
    size: normalizeSize(item?.unit || 'st', item?.size),
    category: ensureCategoryExists(item?.category || 'MAT'),
    place: ensurePlaceExists(item?.place || 'kyl'),
    type: item?.type === 'buy' ? 'buy' : 'home',
    img: item?.img ? String(item.img) : getAutoImagePath(item?.name || '')
  })).filter(item => item.name);

  quickItems = quickItems.map(item => ({
    name: String(item?.name || '').trim(),
    price: Number(item?.price || 0),
    quantity: 1,
    unit: String(item?.unit || 'st'),
    size: normalizeSize(item?.unit || 'st', item?.size),
    category: ensureCategoryExists(item?.category || 'MAT'),
    place: ensurePlaceExists(item?.place || 'kyl'),
    type: 'home',
    img: item?.img ? String(item.img) : getAutoImagePath(item?.name || '')
  })).filter(item => item.name);

  recipes = recipes.map(recipe => ({
    name: String(recipe?.name || '').trim(),
    items: normalizeRecipeIngredientList(recipe?.items),
    link: String(recipe?.link || '')
  })).filter(recipe => recipe.name);

  if (!categories.includes('MAT')) categories.unshift('MAT');
  categories = [...new Set(categories.map(c => String(c || '').trim().toUpperCase()).filter(Boolean))];
  places = places.map(place => ({
    key: normalizePlaceKey(place.key),
    label: cleanPlaceLabel(place.label)
  }));
}

function save() {
  localStorage.setItem('matlista', JSON.stringify(items));
  localStorage.setItem('matlista_snabb', JSON.stringify(quickItems));
  localStorage.setItem('matlista_recept', JSON.stringify(recipes));
  localStorage.setItem('matlista_categories', JSON.stringify(categories));
  localStorage.setItem('matlista_places', JSON.stringify(places));
  localStorage.setItem('homeOpenState', JSON.stringify(homeOpenState));
  localStorage.setItem('matlista_recipe_choices', JSON.stringify(recipeIngredientChoices));
  localStorage.setItem('matlista_household_size', String(householdSize));
  localStorage.setItem('matlista_weekplanner', JSON.stringify(weekPlanner));
  localStorage.setItem('matlista_weekplanner_selected', selectedWeekDay);

  window.items = items;
  window.quickItems = quickItems;
  window.recipes = recipes;
  window.categories = categories;
  window.places = places;
  window.homeOpenState = homeOpenState;
  window.recipeIngredientChoices = recipeIngredientChoices;
  window.householdSize = householdSize;
  window.weekPlanner = weekPlanner;
  window.selectedWeekDay = selectedWeekDay;
}

function syncQuickItemFromItem(changedItem) {
  const quick = quickItems.find(q => normalizeText(q.name) === normalizeText(changedItem.name));
  if (!quick) return;
  quick.place = ensurePlaceExists(changedItem.place || quick.place || 'kyl');
  quick.category = ensureCategoryExists(changedItem.category || quick.category || 'MAT');
  if (!quick.img && changedItem.img) quick.img = changedItem.img;
  if (Number(changedItem.price || 0) > 0) quick.price = Number(changedItem.price || 0);
  quick.unit = changedItem.unit || quick.unit || 'st';
  quick.size = normalizeSize(quick.unit, changedItem.size || quick.size);
  quick.quantity = 1;
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
  document.querySelectorAll('[data-place-select]').forEach(select => {
    const current = select.dataset.currentValue || select.value || 'kyl';
    const fallback = findPlace(current) ? current : 'kyl';
    select.innerHTML = places.map(place => `<option value="${place.key}">${place.label}</option>`).join('');
    select.value = fallback;
  });

  renderPlaceManager();
}

function renderPlaceManager() {
  const wrap = document.getElementById('placeChips');
  if (!wrap) return;

  wrap.innerHTML = '';
  places.forEach(place => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';
    chip.innerHTML = `
      <span>${place.label}</span>
      <button type="button" class="chip-delete" onclick="removePlace('${place.key.replace(/'/g, "\\'")}')">×</button>
    `;
    wrap.appendChild(chip);
  });
}

function addPlace() {
  const input = document.getElementById('newPlaceName');
  if (!input) return;

  const label = cleanPlaceLabel(input.value);
  const key = normalizePlaceKey(label);
  if (!label || !key) return;

  if (findPlace(key)) {
    alert('Plats finns redan.');
    input.value = '';
    return;
  }

  places.push({ key, label });
  save();
  renderPlaceOptions();
  input.value = '';
}

function removePlace(key) {
  const clean = normalizePlaceKey(key);
  if (!clean) return;

  if (lockedPlaceKeys.includes(clean)) {
    alert('Kyl, Frys och Kryddor kan inte tas bort.');
    return;
  }

  places = places.filter(place => place.key !== clean);

  items.forEach(item => {
    if (item.place === clean) item.place = 'kyl';
  });

  quickItems.forEach(item => {
    if (item.place === clean) item.place = 'kyl';
  });

  delete homeOpenState[clean];
  save();
  render();
}

function renderCategoryOptions() {
  document.querySelectorAll('[data-category-select]').forEach(select => {
    const current = select.dataset.currentValue || select.value || 'MAT';
    const fallback = categories.includes(current) ? current : 'MAT';
    select.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    select.value = fallback;
  });

  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    const current = categoryFilter.dataset.currentValue || categoryFilter.value || '';
    categoryFilter.innerHTML = '<option value="">Alla kategorier</option>' + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    categoryFilter.value = categories.includes(current) ? current : '';
  }

  renderCategoryManager();
}

function renderCategoryManager() {
  const wrap = document.getElementById('categoryChips');
  if (!wrap) return;

  wrap.innerHTML = '';
  categories.forEach(category => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';
    chip.innerHTML = `
      <span>${category}</span>
      <button type="button" class="chip-delete" onclick="removeCategory('${category.replace(/'/g, "\\'")}')">×</button>
    `;
    wrap.appendChild(chip);
  });
}

function addCategory() {
  const input = document.getElementById('newCategoryName');
  if (!input) return;

  const clean = String(input.value || '').trim().toUpperCase();
  if (!clean) return;

  if (categories.includes(clean)) {
    alert('Kategori finns redan.');
    input.value = '';
    return;
  }

  categories.push(clean);
  save();
  renderCategoryOptions();
  input.value = '';
}

function removeCategory(name) {
  const clean = String(name || '').trim().toUpperCase();
  if (!clean) return;

  if (clean === 'MAT') {
    alert('MAT kan inte tas bort. Den används som fallback.');
    return;
  }

  categories = categories.filter(cat => cat !== clean);

  items.forEach(item => {
    if (item.category === clean) item.category = 'MAT';
  });

  quickItems.forEach(item => {
    if (item.category === clean) item.category = 'MAT';
  });

  save();
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
  const reader = new FileReader();
  reader.onload = event => {
    const img = new Image();
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
      callback(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
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
}

function updateSummary() {
  const homeItems = items.filter(i => i.type === 'home');
  const buyItems = items.filter(i => i.type === 'buy');
  const homeCount = document.getElementById('homeCount');
  const buyCount = document.getElementById('buyCount');
  const buyCost = document.getElementById('buyCost');
  const dinnerCount = document.getElementById('dinnerCount');
  const householdSelect = document.getElementById('householdSize');

  if (homeCount) homeCount.textContent = homeItems.length;
  if (buyCount) buyCount.textContent = buyItems.length;
  if (buyCost) {
    const total = buyItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
    buyCost.textContent = `${total} kr`;
  }

  if (householdSelect) householdSelect.value = String(householdSize);

  if (dinnerCount) {
    const totalDinnerWeight = homeItems.reduce((sum, item) => sum + getDinnerWeightFromItem(item), 0);
    const totalDinners = Math.floor(totalDinnerWeight / (250 * householdSize));
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
      if (!existing.img && current.img) existing.img = current.img;
      if (Number(existing.price || 0) === 0 && Number(current.price || 0) > 0) existing.price = Number(current.price || 0);
      existing.category = existing.category || current.category || 'MAT';
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
    size: normalizeSize(sourceItem.unit || 'st', sourceItem.size),
    category: ensureCategoryExists(sourceItem.category || 'MAT'),
    place: ensurePlaceExists(targetPlace || sourceItem.place || 'kyl'),
    type: 'home',
    img: sourceItem.img ? String(sourceItem.img) : ''
  };

  const existing = items.find(entry =>
    entry.type === 'home' && sameVariant(entry, copy)
  );

  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + Number(copy.quantity || 0);
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
    size: normalizeSize(sourceItem.unit || 'st', sourceItem.size),
    category: ensureCategoryExists(sourceItem.category || 'MAT'),
    place: ensurePlaceExists(sourceItem.place || 'kyl'),
    type: 'buy',
    img: sourceItem.img ? String(sourceItem.img) : ''
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

  const movedOne = {
    ...sourceItem,
    quantity: 1,
    type: normalizedTargetType,
    place: resolvedTargetPlace
  };

  if (normalizedTargetType === 'home') addHomeItemFromTemplate(movedOne, 1, resolvedTargetPlace);
  else addBuyItemFromTemplate(movedOne, 1);

  sourceItem.quantity = Math.max(0, Number(sourceItem.quantity || 0) - 1);

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
      category: ensureCategoryExists(item.category || 'MAT'),
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

  item.place = ensurePlaceExists(newPlace || 'kyl');
  items.forEach(entry => {
    if (normalizeText(entry.name) === normalizeText(item.name)) entry.place = item.place;
  });

  save();
  render();
}

function changeQuickCategory(index, newCategory) {
  const item = quickItems[index];
  if (!item) return;

  item.category = ensureCategoryExists(newCategory || 'MAT');
  items.forEach(entry => {
    if (normalizeText(entry.name) === normalizeText(item.name)) entry.category = item.category;
  });

  save();
  render();
}

function matchesSearch(item, textSearch, categoryFilter) {
  const search = String(textSearch || '').toLowerCase().trim();
  if (categoryFilter && item.category !== categoryFilter) return false;
  if (!search) return true;
  const hay = `${item.name || ''} ${item.category || ''} ${item.place || ''}`.toLowerCase();
  return hay.includes(search);
}

function createCategorySelect(current, onchangeCode) {
  const options = categories.map(cat => `<option value="${cat}" ${current === cat ? 'selected' : ''}>${cat}</option>`).join('');
  return `<select class="category-select" data-category-select onchange="${onchangeCode}">${options}</select>`;
}

function createPlaceSelect(current, onchangeCode) {
  return `
    <select class="place-select" data-place-select data-current-value="${current || 'kyl'}" onchange="${onchangeCode}">
      ${places.map(place => `<option value="${place.key}" ${current === place.key ? 'selected' : ''}>${place.label}</option>`).join('')}
    </select>
  `;
}

function createCard(item, source = 'items') {
  const realIndex = source === 'quick' ? quickItems.indexOf(item) : items.indexOf(item);
  const img = getDisplayImageSrc(item);
  const imgCandidates = item?.img ? [String(item.img)] : getImageCandidates(item?.name || '');
  const imgCandidateAttr = imgCandidates.join('|').replace(/"/g, '&quot;');
  const moveText = item.type === 'home' ? '↔ Flytta 1 till köp' : '↔ Flytta 1 till hemma';
  const placeMeta = getPlaceMeta(item.place);
  const div = document.createElement('div');
  div.className = 'card';
  div.draggable = true;
  div.ondragstart = () => dragStartItem(realIndex, source === 'quick' ? 'quick' : 'items');
  div.ondragend = () => dragEndItem();

  if (source === 'quick') {
    div.innerHTML = `
      <img src="${img}" alt="${item.name}" data-img-candidates="${imgCandidateAttr}" data-img-index="0" onerror="handleAutoImageError(this)" onclick="showQuickImage(${realIndex})">
      <div class="info">
        <div class="top-tags">
          ${createCategorySelect(item.category || 'MAT', `changeQuickCategory(${realIndex}, this.value)`)}
          ${createPlaceSelect(item.place || 'kyl', `changeQuickPlace(${realIndex}, this.value)`)}
        </div>
        <div class="name">${item.name || ''}</div>
        <div class="meta">
          <div class="quantity-wrap">
            <span>${formatItemAmount(item)}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="ghost-btn" onclick="changeQuickImage(${realIndex})">🖼️ Byt bild</button>
        <button type="button" class="ghost-btn" onclick="editQuickItem(${realIndex})">✏️ Ändra</button>
        <button type="button" class="ghost-btn" onmousedown="startQuickAdd(${realIndex})" onmouseup="finishQuickAdd(${realIndex})" onmouseleave="stopQuickAdd()" ontouchstart="startQuickAdd(${realIndex})" ontouchend="finishQuickAdd(${realIndex})" ontouchcancel="stopQuickAdd()">Lägg till 1</button>
        <button type="button" class="delete" onclick="removeQuickItem(${realIndex})">🗑️</button>
      </div>
    `;
    return div;
  }

  div.innerHTML = `
    <img src="${img}" alt="${item.name}" data-img-candidates="${imgCandidateAttr}" data-img-index="0" onerror="handleAutoImageError(this)" onclick="showImage(${realIndex})">
    <div class="info">
      <div class="top-tags">
        <div class="category">${item.category || 'MAT'}</div>
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

  let hasAny = false;

  places.forEach(place => {
    const filtered = items.filter(item =>
      item.type === 'home' &&
      item.place === place.key &&
      matchesSearch(item, searchText, categoryFilter)
    );

    if (!filtered.length) return;
    hasAny = true;

    const isOpen = homeOpenState[place.key] !== false;
    const section = document.createElement('div');
    section.className = 'subsection';

    const title = document.createElement('div');
    title.className = 'subsection-title';
    title.style.cursor = 'pointer';
    title.textContent = `${place.label}${isOpen ? ' ▲' : ' ▼'}`;
    title.onclick = () => {
      homeOpenState[place.key] = !isOpen;
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
    target.innerHTML = '<div class="empty">Inga varor hemma här ännu.</div>';
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

  if (itemName) itemName.value = item.name || '';
  if (itemPrice) itemPrice.value = Number(item.price || 0) || '';
  if (itemQuantity) itemQuantity.value = 1;
  if (itemCategory) itemCategory.value = item.category || 'MAT';
  if (itemUnit) itemUnit.value = item.unit || 'st';
  if (itemSize) updateSizeSelect('itemSize', item.unit || 'st', item.size);
  if (itemPlace) {
    itemPlace.dataset.currentValue = item.place || 'kyl';
    renderPlaceOptions();
    itemPlace.value = item.place || 'kyl';
  }

  hideMainItemSuggestions();
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

  const matches = quickItems.filter(item => normalizeText(item.name).includes(search));
  if (!matches.length) {
    box.style.display = 'none';
    return;
  }

  matches.slice(0, 8).forEach(item => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'suggestion-row';
    row.textContent = `${item.name}${item.category ? ' • ' + item.category : ''}`;
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
    row.textContent = `${item.name}${item.category ? ' • ' + item.category : ''}`;
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

  const search = String(quickInput?.value || '').toLowerCase().trim();
  let list = quickItems.slice();

  if (search) {
    list = list.filter(item =>
      String(item.name || '').toLowerCase().includes(search) ||
      String(item.category || '').toLowerCase().includes(search) ||
      String(item.place || '').toLowerCase().includes(search)
    );
    renderQuickSuggestions(list);
  } else {
    hideQuickSuggestions();
  }

  if (!list.length) {
    target.innerHTML = '<div class="empty">Inga träffar</div>';
    return;
  }

  list.forEach(item => target.appendChild(createCard(item, 'quick')));
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

    resizeImage(file, dataUrl => {
      quickItems[index].img = dataUrl;
      items.forEach(item => {
        if (normalizeText(item.name) === normalizeText(quickItems[index].name)) item.img = dataUrl;
      });
      save();
      render();
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

  if (editName) editName.value = item.name || '';
  if (editPrice) editPrice.value = Number(item.price || 0) || '';
  if (editQuantity) editQuantity.value = Math.max(1, Number(item.quantity || 1));
  if (editUnit) editUnit.value = item.unit || 'st';
  if (editSize) updateSizeSelect('editSize', item.unit || 'st', item.size);
  if (editCategory) {
    editCategory.dataset.currentValue = item.category || 'MAT';
    renderCategoryOptions();
    editCategory.value = item.category || 'MAT';
  }
  if (editPlace) {
    editPlace.dataset.currentValue = item.place || 'kyl';
    renderPlaceOptions();
    editPlace.value = item.place || 'kyl';
  }
  if (editModal) editModal.style.display = 'flex';
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
  const updated = {
    name: updatedName,
    price: Number(document.getElementById('editPrice')?.value || 0),
    quantity: Math.max(1, Number(document.getElementById('editQuantity')?.value || 1)),
    unit: updatedUnit,
    size: normalizeSize(updatedUnit, document.getElementById('editSize')?.value || currentItem.size, document.getElementById('editCategory')?.value || currentItem.category),
    category: ensureCategoryExists(document.getElementById('editCategory')?.value || currentItem.category || 'MAT'),
    place: ensurePlaceExists(document.getElementById('editPlace')?.value || currentItem.place || 'kyl'),
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
    if (findPlace('kryddor')) place.value = 'kryddor';
  } else if (category === 'MAT' && !supportsSize(unit.value)) {
    unit.value = 'st';
  }

  updateSizeSelect('itemSize', unit.value, null, category);
}

function showImage(index) {
  const src = items[index]?.img;
  if (!src) return;
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  if (modal) modal.style.display = 'flex';
  if (modalImg) modalImg.src = src;
}

function showQuickImage(index) {
  const src = quickItems[index]?.img;
  if (!src) return;
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  if (modal) modal.style.display = 'flex';
  if (modalImg) modalImg.src = src;
}

function clearInputs() {
  const itemName = document.getElementById('itemName');
  const itemPrice = document.getElementById('itemPrice');
  const itemQuantity = document.getElementById('itemQuantity');
  const itemImage = document.getElementById('itemImage');
  const itemCategory = document.getElementById('itemCategory');
  const itemUnit = document.getElementById('itemUnit');
  const itemSize = document.getElementById('itemSize');
  const itemPlace = document.getElementById('itemPlace');

  if (itemName) itemName.value = '';
  if (itemPrice) itemPrice.value = '';
  if (itemQuantity) itemQuantity.value = '';
  if (itemImage) itemImage.value = '';
  if (itemCategory) itemCategory.value = 'MAT';
  if (itemUnit) itemUnit.value = 'st';
  if (itemSize) updateSizeSelect('itemSize', 'st');
  if (itemPlace) {
    itemPlace.dataset.currentValue = 'kyl';
    renderPlaceOptions();
    itemPlace.value = 'kyl';
  }

  selectedAddQuickIndex = null;
  hideMainItemSuggestions();
}

function addItem() {
  const nameInput = document.getElementById('itemName');
  const fileInput = document.getElementById('itemImage');
  const qtyInput = document.getElementById('itemQuantity');
  const priceInput = document.getElementById('itemPrice');
  const categoryInput = document.getElementById('itemCategory');
  const unitInput = document.getElementById('itemUnit');
  const sizeInput = document.getElementById('itemSize');
  const placeInput = document.getElementById('itemPlace');

  const name = nameInput?.value.trim() || '';
  if (!name) return;

  const matchedQuick = quickItems.find(q => normalizeText(q.name) === normalizeText(name));

  const resolvedUnit = unitInput?.value || (matchedQuick ? matchedQuick.unit : 'st');
  const item = {
    name: matchedQuick ? matchedQuick.name : name,
    price: Number(priceInput?.value || (matchedQuick ? matchedQuick.price : 0) || 0),
    quantity: Math.max(1, Number(qtyInput?.value || 1)),
    unit: resolvedUnit,
    size: normalizeSize(resolvedUnit, sizeInput?.value || (matchedQuick ? matchedQuick.size : null), categoryInput?.value || matchedQuick?.category),
    category: ensureCategoryExists(categoryInput?.value || (matchedQuick ? matchedQuick.category : 'MAT')),
    place: ensurePlaceExists(placeInput?.value || (matchedQuick ? matchedQuick.place : 'kyl')),
    type: 'home',
    img: matchedQuick?.img
      ? String(matchedQuick.img)
      : getAutoImagePath(matchedQuick ? matchedQuick.name : name)
  };

  const file = fileInput?.files?.[0];

  const saveItem = imgData => {
    if (imgData) item.img = imgData;

    const existingHome = items.find(i =>
      i.type === 'home' && sameVariant(i, item)
    );

    if (existingHome) {
      existingHome.quantity = Number(existingHome.quantity || 0) + Number(item.quantity || 0);
      existingHome.price = Number(item.price || existingHome.price || 0);
      existingHome.category = item.category;
      if (item.img) existingHome.img = item.img;
      syncQuickItemFromItem(existingHome);
    } else {
      items.push(item);
      syncQuickItemFromItem(item);
    }

    const existsQuick = quickItems.find(i => normalizeText(i.name) === normalizeText(item.name));
    if (existsQuick) {
      existsQuick.price = Number(item.price || existsQuick.price || 0);
      existsQuick.quantity = 1;
      existsQuick.unit = item.unit || existsQuick.unit || 'st';
      existsQuick.size = normalizeSize(existsQuick.unit, item.size || existsQuick.size, item.category || existsQuick.category);
      existsQuick.category = item.category || existsQuick.category || 'MAT';
      existsQuick.place = item.place || existsQuick.place || 'kyl';
      if (item.img) existsQuick.img = item.img;
    } else {
      quickItems.unshift({ ...item, type: 'home' });
    }

    save();
    render();
    clearInputs();
  };

  if (file) resizeImage(file, saveItem);
  else saveItem('');
}

function updateQuantity(index, value) {
  const item = items[index];
  if (!item) return;

  const oldQty = Number(item.quantity || 0);
  const newQty = Math.max(0, Number(value || 0));
  const diff = oldQty - newQty;

  item.quantity = newQty;

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
        category: ensureCategoryExists(item.category || 'MAT'),
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
    row.className = 'recipe-item';
    row.innerHTML = `
      <div>${recipeIngredientToText(ingredient)}</div>
      <button type="button" class="ghost-btn" onclick="editDraftIngredient(${idx})">✏️</button>
      <button type="button" class="delete" onclick="removeDraftIngredient(${idx})">🗑️</button>
    `;
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
  const ingredientEditModal = document.getElementById('ingredientEditModal');

  if (ingredientEditName) ingredientEditName.value = parsed.name || '';
  if (ingredientEditQty) ingredientEditQty.value = Number(parsed.quantity || 1);
  if (ingredientEditUnit) ingredientEditUnit.value = parsed.unit || 'st';
  if (ingredientEditSize) updateSizeSelect('ingredientEditSize', parsed.unit || 'st', parsed.size, getRecipeIngredientContext(parsed));
  if (ingredientEditModal) ingredientEditModal.style.display = 'flex';
}

function saveRecipe() {
  const name = document.getElementById('recipeName')?.value.trim() || '';
  const link = document.getElementById('recipeLink')?.value.trim() || '';
  if (!name) return;

  const existingIndex = recipes.findIndex(r => normalizeText(r.name) === normalizeText(name));
  const recipe = {
    name,
    items: recipeDraftItems.length ? normalizeRecipeIngredientList(recipeDraftItems) : (existingIndex >= 0 ? normalizeRecipeIngredientList(recipes[existingIndex].items) : []),
    link
  };

  if (existingIndex >= 0) recipes[existingIndex] = recipe;
  else recipes.push(recipe);

  const recipeName = document.getElementById('recipeName');
  const recipeLink = document.getElementById('recipeLink');
  const recipeQuickSearch = document.getElementById('recipeQuickSearch');
  const recipeQuickSuggestions = document.getElementById('recipeQuickSuggestions');

  if (recipeName) recipeName.value = '';
  if (recipeLink) recipeLink.value = '';
  if (recipeQuickSearch) recipeQuickSearch.value = '';
  if (recipeQuickSuggestions) recipeQuickSuggestions.style.display = 'none';

  recipeDraftItems = [];
  save();
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

  const search = (document.getElementById('recipeSearch')?.value || '').toLowerCase().trim();
  const previous = select.value;
  select.innerHTML = '';

  let filtered = recipes.slice();
  if (search) {
    filtered = filtered.filter(recipe => (recipe.name || '').toLowerCase().includes(search));
  }

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
      opt.value = recipe.name;
      opt.textContent = recipe.name;
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
    target.innerHTML = '<div class="empty">Välj ett recept.</div>';
    return;
  }

  const topActions = document.createElement('div');
  topActions.style.display = 'flex';
  topActions.style.gap = '8px';
  topActions.style.flexWrap = 'wrap';
  topActions.style.marginBottom = '10px';

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

  if (!recipe.items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Inga ingredienser i receptet.';
    target.appendChild(empty);
  } else {
    recipe.items.forEach((ingredient, idx) => {
      const baseIngredient = applySelectedPortionToIngredient(ingredient);
      if (!baseIngredient) return;
      const displayIngredient = resolveRecipeIngredient(baseIngredient, recipe);
      const replacements = getRecipeReplacementOptions(baseIngredient);
      const selectedChoice = getRecipeIngredientChoice(recipe.name, baseIngredient.name);
      const row = document.createElement('div');
      row.className = 'recipe-item';

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

      row.innerHTML = `
        <div>
          <div>${recipeIngredientToText(displayIngredient)}</div>
          ${controls}
        </div>
        <button type="button" class="ghost-btn" onclick="editRecipeIngredient(${idx})">✏️</button>
        <button type="button" class="delete" onclick="removeRecipeIngredient(${idx})">🗑️</button>
      `;
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
  const match = raw.match(/^(\d+)\s*(st|g|kg|ml|dl|l|pkt)?\s+(.*)$/i);

  if (match) {
    const name = (match[3] || '').trim();
    const unit = (match[2] || 'st').toLowerCase();
    const context = getRecipeIngredientContext({ name, unit });
    return {
      quantity: Number(match[1]) || 1,
      unit,
      size: supportsSize(unit) ? getDefaultSize(unit, context) : null,
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
  return {
    name,
    quantity: Math.max(1, Number(value.quantity || value.qty || 1)),
    unit,
    size: supportsSize(unit) ? normalizeSize(unit, value.size, context) : null,
    category: context === 'RECIPE_KRYDDOR' ? 'KRYDDOR' : (context === 'RECIPE_RIVEN_OST' ? 'RECIPE_RIVEN_OST' : '')
  };
}

function normalizeRecipeIngredientList(list) {
  return (Array.isArray(list) ? list : [])
    .map(normalizeRecipeIngredient)
    .filter(Boolean);
}

function recipeIngredientToText(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return '';
  if (supportsSize(ing.unit)) {
    return `${ing.quantity} × ${formatSizeValue(ing.unit, ing.size)} ${ing.name}`.trim();
  }
  return `${ing.quantity} ${ing.unit} ${ing.name}`.trim();
}

function buildRecipeIngredient(name, quantity, unit, size = null, category = '') {
  return normalizeRecipeIngredient({ name, quantity, unit, size, category });
}

function recipeUnitsCompatible(a, b) {
  if (supportsSize(a) && supportsSize(b)) return true;
  return String(a || 'st').toLowerCase() === String(b || 'st').toLowerCase();
}

function recipeIngredientCanonicalAmount(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return 0;
  if (supportsSize(ing.unit)) return Number(ing.quantity || 0) * Number(ing.size || 0);
  return Number(ing.quantity || 0);
}

function ingredientMatchesName(ingredient, name) {
  return normalizeText(normalizeRecipeIngredient(ingredient)?.name || '') === normalizeText(name || '');
}

function getHomeAmountForIngredient(ingredient) {
  const ing = normalizeRecipeIngredient(ingredient);
  if (!ing) return 0;

  return items
    .filter(item => item.type === 'home' && ingredientMatchesName(ing, item.name) && recipeUnitsCompatible(ing.unit, item.unit))
    .reduce((sum, item) => {
      if (supportsSize(ing.unit) && supportsSize(item.unit)) {
        return sum + (Number(item.quantity || 0) * Number(item.size || 0));
      }
      return sum + Number(item.quantity || 0);
    }, 0);
}

function formatRecipeAmount(unit, amount) {
  if (supportsSize(unit)) {
    if (isWeightUnit(unit)) {
      return amount >= 1000 ? `${String(Number((amount / 1000).toFixed(2))).replace('.', ',')} kg` : `${amount} g`;
    }
    return amount >= 1000 ? `${String(Number((amount / 1000).toFixed(2))).replace('.', ',')} l` : `${amount} ml`;
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

  const ingredientEditName = document.getElementById('ingredientEditName');
  const ingredientEditQty = document.getElementById('ingredientEditQty');
  const ingredientEditUnit = document.getElementById('ingredientEditUnit');
  const ingredientEditModal = document.getElementById('ingredientEditModal');

  if (ingredientEditName) ingredientEditName.value = parsed.name || '';
  if (ingredientEditQty) ingredientEditQty.value = Number(parsed.quantity || 1);
  if (ingredientEditUnit) ingredientEditUnit.value = parsed.unit || 'st';
  updateSizeSelect('ingredientEditSize', parsed.unit || 'st', parsed.size, getRecipeIngredientContext(parsed));
  if (ingredientEditModal) ingredientEditModal.style.display = 'flex';
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
  const quantity = Number(document.getElementById('ingredientEditQty')?.value || 1);
  const unit = document.getElementById('ingredientEditUnit')?.value || 'st';
  const size = document.getElementById('ingredientEditSize')?.value || null;

  if (!name) return;

  const previousIngredient = editingIngredientRecipeIndex === -1
    ? normalizeRecipeIngredient(recipeDraftItems[editingIngredientIndex])
    : normalizeRecipeIngredient(recipes[editingIngredientRecipeIndex]?.items[editingIngredientIndex]);

  const updated = buildRecipeIngredient(name, quantity, unit, size, previousIngredient?.category || '');
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
      div.textContent = `${recipeIngredientToText(entry.ingredient)} • har ${formatRecipeAmount(entry.ingredient.unit, entry.have)}`;
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

  currentRecipeMissing.forEach(entry => {
    const ingredient = normalizeRecipeIngredient(entry?.ingredient || entry);
    const missingAmount = Number(entry?.missing || getMissingRecipeIngredient(ingredient)?.missing || 0);
    if (!ingredient || missingAmount <= 0) return;

    const unit = ingredient.unit || 'st';
    const size = supportsSize(unit) ? normalizeSize(unit, ingredient.size) : null;
    const buyQuantity = supportsSize(unit)
      ? Math.ceil(missingAmount / Math.max(1, Number(size || getDefaultSize(unit))))
      : Math.ceil(missingAmount);

    const existingBuy = items.find(i =>
      i.type === 'buy' &&
      normalizeText(i.name) === normalizeText(ingredient.name) &&
      (i.unit || 'st') === unit &&
      Number(i.size || 0) === Number(size || 0)
    );

    if (existingBuy) {
      existingBuy.quantity = Number(existingBuy.quantity || 0) + buyQuantity;
    } else {
      const quickMatch = quickItems.find(q => normalizeText(q.name) === normalizeText(ingredient.name));
      items.push({
        name: ingredient.name,
        price: Number(quickMatch?.price || 0),
        quantity: buyQuantity,
        unit,
        size,
        category: ensureCategoryExists(quickMatch?.category || 'MAT'),
        place: quickMatch?.place || 'kyl',
        type: 'buy',
        img: quickMatch?.img ? String(quickMatch.img) : ''
      });
    }
  });

  items = mergeItems(items);
  save();
  render();
  checkRecipe();
}

function useRecipeIngredients() {
  const recipe = getSelectedRecipe();
  if (!recipe) return;

  recipe.items.forEach(rawIngredient => {
    const ingredient = resolveRecipeIngredient(rawIngredient, recipe);
    if (!ingredient) return;

    let remaining = recipeIngredientCanonicalAmount(ingredient);

    const homeMatches = items.filter(i => i.type === 'home' && ingredientMatchesName(ingredient, i.name) && recipeUnitsCompatible(ingredient.unit, i.unit));

    homeMatches.forEach(homeItem => {
      if (remaining <= 0) return;

      if (supportsSize(ingredient.unit) && supportsSize(homeItem.unit)) {
        const packSize = Number(homeItem.size || 0);
        const itemAmount = Number(homeItem.quantity || 0) * packSize;
        const amountToUse = Math.min(itemAmount, remaining);
        const packsToUse = Math.ceil(amountToUse / Math.max(1, packSize));
        homeItem.quantity = Math.max(0, Number(homeItem.quantity || 0) - packsToUse);
        remaining = Math.max(0, remaining - (packsToUse * packSize));
      } else {
        const amountToUse = Math.min(Number(homeItem.quantity || 0), remaining);
        homeItem.quantity = Math.max(0, Number(homeItem.quantity || 0) - amountToUse);
        remaining = Math.max(0, remaining - amountToUse);
      }
    });

    const quickMatch = quickItems.find(q => normalizeText(q.name) === normalizeText(ingredient.name));
    const unit = ingredient.unit || quickMatch?.unit || 'st';
    const size = supportsSize(unit) ? normalizeSize(unit, ingredient.size) : null;
    const refillQuantity = supportsSize(unit)
      ? Math.max(1, Number(ingredient.quantity || 1))
      : Math.max(1, Number(ingredient.quantity || 1));

    const existingBuy = items.find(i =>
      i.type === 'buy' &&
      normalizeText(i.name) === normalizeText(ingredient.name) &&
      (i.unit || 'st') === unit &&
      Number(i.size || 0) === Number(size || 0)
    );

    if (existingBuy) {
      existingBuy.quantity = Number(existingBuy.quantity || 0) + refillQuantity;
    } else {
      items.push({
        name: ingredient.name,
        price: Number(quickMatch?.price || 0),
        quantity: refillQuantity,
        unit,
        size,
        category: ensureCategoryExists(quickMatch?.category || 'MAT'),
        place: quickMatch?.place || 'kyl',
        type: 'buy',
        img: quickMatch?.img ? String(quickMatch.img) : ''
      });
    }
  });

  items = items.filter(item => !(item.type === 'home' && Number(item.quantity || 0) <= 0));
  items = mergeItems(items);
  currentRecipeMissing = [];

  save();
  render();
  checkRecipe();
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

  const matches = quickItems.filter(item => normalizeText(item.name).includes(search));
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
      const ingredientData = buildRecipeIngredient(item.name, 1, item.unit || 'st', item.size, item.category || '');
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

  const matches = quickItems.filter(item => normalizeText(item.name).includes(search));
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
      const ingredientData = buildRecipeIngredient(item.name, 1, item.unit || 'st', item.size, item.category || '');
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

function render() {
  updateToggleButtons();
  renderCategoryOptions();
  renderPlaceOptions();
  renderQuickList();

  const searchText = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const categoryFilter = document.getElementById('categoryFilter')?.value || '';

  renderHomeList(searchText, categoryFilter);
  renderBuyList(searchText, categoryFilter);
  updateSummary();
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
  hydrateData();
  householdSize = Math.max(1, Math.min(8, Number(householdSize || 1)));
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

let weekPlanner = JSON.parse(localStorage.getItem('matlista_weekplanner') || '{}');
let selectedWeekDay = localStorage.getItem('matlista_weekplanner_selected') || getTodayWeekKey();


function bindStateToWindow() {
  const bindings = {
    items: { get: () => items, set: value => { items = Array.isArray(value) ? value : []; } },
    quickItems: { get: () => quickItems, set: value => { quickItems = Array.isArray(value) ? value : []; } },
    recipes: { get: () => recipes, set: value => { recipes = Array.isArray(value) ? value : []; } },
    categories: { get: () => categories, set: value => { categories = Array.isArray(value) && value.length ? value : ['MAT']; } },
    places: { get: () => places, set: value => { places = Array.isArray(value) && value.length ? value : defaultPlaces.slice(); } },
    homeOpenState: { get: () => homeOpenState, set: value => { homeOpenState = value && typeof value === 'object' ? value : {}; } },
    recipeIngredientChoices: { get: () => recipeIngredientChoices, set: value => { recipeIngredientChoices = value && typeof value === 'object' ? value : {}; } },
    householdSize: { get: () => householdSize, set: value => { householdSize = Math.max(1, Math.min(8, Number(value || 1))); } },
    weekPlanner: { get: () => weekPlanner, set: value => { weekPlanner = value && typeof value === 'object' ? value : {}; } },
    selectedWeekDay: { get: () => selectedWeekDay, set: value => { selectedWeekDay = String(value || getTodayWeekKey()); } }
  };

  Object.entries(bindings).forEach(([key, descriptor]) => {
    try {
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: true,
        get: descriptor.get,
        set: descriptor.set
      });
    } catch (error) {
      window[key] = descriptor.get();
    }
  });
}

bindStateToWindow();

function getTodayWeekKey() {
  const day = new Date().getDay();
  const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[day] || 'mon';
}

function getWeekDayDef(dayKey) {
  return WEEK_DAYS.find(day => day.key === dayKey) || WEEK_DAYS[0];
}

function ensureWeekPlannerShape() {
  if (!weekPlanner || typeof weekPlanner !== 'object' || Array.isArray(weekPlanner)) weekPlanner = {};
  WEEK_DAYS.forEach(day => {
    const entry = weekPlanner[day.key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      weekPlanner[day.key] = { recipe: '', meal: '', note: '', cooked: false, lastCheckMissing: null };
    } else {
      weekPlanner[day.key] = {
        recipe: String(entry.recipe || ''),
        meal: String(entry.meal || ''),
        note: String(entry.note || ''),
        cooked: Boolean(entry.cooked),
        lastCheckMissing: entry.lastCheckMissing === null || entry.lastCheckMissing === undefined ? null : Math.max(0, Number(entry.lastCheckMissing || 0))
      };
    }
  });
}

function saveWeekPlannerState() {
  ensureWeekPlannerShape();
  localStorage.setItem('matlista_weekplanner', JSON.stringify(weekPlanner));
  localStorage.setItem('matlista_weekplanner_selected', selectedWeekDay);
}

function getWeekPlan(dayKey = selectedWeekDay) {
  ensureWeekPlannerShape();
  return weekPlanner[dayKey] || { recipe: '', meal: '', note: '', cooked: false, lastCheckMissing: null };
}

function getWeekPlanTitle(plan) {
  if (!plan) return 'Ingen plan';
  return plan.recipe || plan.meal || 'Ingen plan';
}

function getWeekPlanStatus(plan) {
  if (!plan || (!plan.recipe && !plan.meal && !plan.note)) return 'empty';
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

function buildWeekRecipeOptions(selectedValue) {
  const select = document.getElementById('weekRecipeSelect');
  if (!select) return;
  select.innerHTML = '<option value="">Välj recept</option>';
  recipes.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv')).forEach(recipe => {
    const opt = document.createElement('option');
    opt.value = recipe.name || '';
    opt.textContent = recipe.name || '';
    if ((recipe.name || '') === (selectedValue || '')) opt.selected = true;
    select.appendChild(opt);
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
      <span class="day-meal">${escapeHtml(getWeekPlanTitle(plan))}</span>
    `;
    row.appendChild(btn);
  });
}

function renderWeekOverview() {
  const target = document.getElementById('weekOverview');
  if (!target) return;

  const plannedCount = WEEK_DAYS.filter(day => {
    const plan = getWeekPlan(day.key);
    return Boolean(plan.recipe || plan.meal);
  }).length;

  const cookedCount = WEEK_DAYS.filter(day => getWeekPlan(day.key).cooked).length;
  const missingCount = WEEK_DAYS.filter(day => Number(getWeekPlan(day.key).lastCheckMissing || 0) > 0 && !getWeekPlan(day.key).cooked).length;

  const nextPlanned = WEEK_DAYS.find(day => {
    const plan = getWeekPlan(day.key);
    return Boolean(plan.recipe || plan.meal);
  });

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
    const card = document.createElement('div');
    card.className = 'week-overview-card';
    card.innerHTML = `
      <h4>${day.long}</h4>
      <div class="week-overview-meal">${escapeHtml(getWeekPlanTitle(plan))}</div>
      <div class="week-overview-note">${escapeHtml(plan.note || '-')}</div>
      <div class="week-overview-meta">
        <span>${getWeekPlanStatusLabel(plan)}</span>
        <span>${plan.recipe ? 'Recept' : (plan.meal ? 'Text' : '-')}</span>
      </div>
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

  buildWeekRecipeOptions(plan.recipe);

  const selectedDayName = document.getElementById('weekSelectedDayName');
  const customMeal = document.getElementById('weekCustomMeal');
  const note = document.getElementById('weekNote');
  const previewMeal = document.getElementById('weekPreviewMeal');
  const previewNote = document.getElementById('weekPreviewNote');
  const dayStatus = document.getElementById('weekDayStatus');

  if (selectedDayName) selectedDayName.textContent = dayDef.long;
  if (customMeal) customMeal.value = plan.meal || '';
  if (note) note.value = plan.note || '';
  if (previewMeal) previewMeal.textContent = getWeekPlanTitle(plan);
  if (previewNote) previewNote.textContent = plan.note || '-';

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

  const recipe = document.getElementById('weekRecipeSelect')?.value || '';
  const meal = document.getElementById('weekCustomMeal')?.value.trim() || '';
  const note = document.getElementById('weekNote')?.value.trim() || '';

  const previous = getWeekPlan(selectedWeekDay);
  weekPlanner[selectedWeekDay] = {
    recipe,
    meal,
    note,
    cooked: previous.cooked && (recipe || meal || note) ? true : false,
    lastCheckMissing: recipe === previous.recipe ? previous.lastCheckMissing : null
  };

  if (!recipe && !meal && !note) {
    weekPlanner[selectedWeekDay].cooked = false;
    weekPlanner[selectedWeekDay].lastCheckMissing = null;
  }

  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function clearSelectedWeekPlan() {
  weekPlanner[selectedWeekDay] = { recipe: '', meal: '', note: '', cooked: false, lastCheckMissing: null };
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function toggleCookedSelectedDay() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!plan.recipe && !plan.meal && !plan.note) return;
  plan.cooked = !plan.cooked;
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function syncRecipeSectionToWeekPlan(plan) {
  const recipeName = plan?.recipe || '';
  if (!recipeName) return false;
  const select = document.getElementById('recipeSelect');
  if (!select) return false;

  const optionExists = Array.from(select.options).some(opt => opt.value === recipeName);
  if (!optionExists) return false;

  select.value = recipeName;

  const search = document.getElementById('recipeSearch');
  if (search) search.value = '';
  const portion = document.getElementById('portionSelect');
  if (portion && !portion.value) portion.value = '2';

  if (typeof renderSelectedRecipeIngredients === 'function') renderSelectedRecipeIngredients();
  if (typeof clearRecipeResult === 'function') clearRecipeResult();

  const recipeSection = document.getElementById('recipeSection');
  if (recipeSection) recipeSection.style.display = '';
  showRecipes = true;
  updateToggleButtons();
  return true;
}

function openSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!plan.recipe) return;
  const ok = syncRecipeSectionToWeekPlan(plan);
  if (!ok) return;
  const recipeBlock = document.getElementById('recipeSection');
  if (recipeBlock) recipeBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function checkSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!plan.recipe) return;

  const ok = syncRecipeSectionToWeekPlan(plan);
  if (!ok) return;

  if (typeof checkRecipe === 'function') checkRecipe();

  const missingCount = Array.isArray(currentRecipeMissing) ? currentRecipeMissing.length : 0;
  plan.lastCheckMissing = missingCount;
  if (missingCount === 0 && (plan.recipe || plan.meal)) {
    plan.cooked = false;
  }
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

function addMissingForSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!plan.recipe) return;
  checkSelectedWeekRecipe();
  if (typeof addMissingToBuy === 'function') addMissingToBuy();
  refreshWeekPlannerUI();
}

function cookSelectedWeekRecipe() {
  const plan = getWeekPlan(selectedWeekDay);
  if (!plan.recipe) return;

  const ok = syncRecipeSectionToWeekPlan(plan);
  if (!ok) return;

  if (typeof useRecipeIngredients === 'function') useRecipeIngredients();
  plan.cooked = true;
  plan.lastCheckMissing = 0;
  weekPlanner[selectedWeekDay] = plan;
  saveWeekPlannerState();
  refreshWeekPlannerUI();
}

document.addEventListener('DOMContentLoaded', () => {
  ensureWeekPlannerShape();
  refreshWeekPlannerUI();

  const weekRecipeSelect = document.getElementById('weekRecipeSelect');
  if (weekRecipeSelect) {
    weekRecipeSelect.addEventListener('change', () => {
      const selectedName = weekRecipeSelect.value || '';
      const customMeal = document.getElementById('weekCustomMeal');
      if (selectedName && customMeal && !customMeal.value.trim()) customMeal.value = selectedName;
    });
  }
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
