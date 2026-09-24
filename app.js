const CONFIG = window.TRIP_CONFIG || {};
const $ = id => document.getElementById(id);
const SESSION_KEY = "tripcanvas-session-v1";
const GEOCODE_CACHE_KEY = "tripcanvas-geocode-cache-v1";
const DESKTOP_PANEL_KEY = "tripcanvas-desktop-panel-collapsed-v1";
const TRIP_LIST_CACHE_MS = 60000;

const state = {
  tripId: "", hasJourney: false, data: freshTrip(), dirty: false,
  token: localStorage.getItem(SESSION_KEY) || "", user: null, owner: "", tripCanEdit: false,
  map: null, markers: [], polylines: [], routeLine: null, mapsReady: false, lastGeocodeAt: 0, draggedStopId: "",
  tripsCache: null, tripsLoadedAt: 0, geocodeJobId: 0, geocodeCache: null
};

function freshTrip() {
  const today = new Date().toISOString().slice(0, 10);
  return { schemaVersion: 5, trip: { title: "", startDate: today, endDate: today, description: "", isPublic: false }, stops: [] };
}
function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function finiteOrNull(value) { const n = Number(value); return value !== "" && value != null && Number.isFinite(n) ? n : null; }
function debounce(fn, wait = 450) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2800); }
function setStatus(text) { $("syncStatus").textContent = text; }
function isConfigured(value) { return value && !String(value).startsWith("PASTE_"); }
function isAdmin() { return state.user?.role === "admin"; }
function canEdit() { return Boolean(state.user && state.hasJourney && (!state.tripId || state.tripCanEdit)); }

function normalizeCategory(value) {
  const type = String(value || "").trim();
  if (["移動", "移动", "交通"].includes(type)) return "移動";
  if (["休憩", "休息", "住宿"].includes(type)) return "休憩";
  if (["観光", "觀光", "景點", "购物", "購物"].includes(type)) return "觀光";
  if (["食事", "餐飲", "用餐", "午餐", "晚餐"].includes(type)) return "食事";
  return "觀光";
}
function normalizeTrip(input) {
  if (!input || typeof input !== "object") throw new Error("旅程檔格式不正確");
  const base = freshTrip(), trip = input.trip || input, stops = Array.isArray(input.stops) ? input.stops : [];
  return {
    schemaVersion: 5,
    trip: { title: String(trip.title || base.trip.title).slice(0, 120), startDate: String(trip.startDate || base.trip.startDate).slice(0, 10), endDate: String(trip.endDate || trip.startDate || base.trip.endDate).slice(0, 10), description: String(trip.description || "").slice(0, 2000), isPublic: typeof trip.isPublic === "boolean" ? trip.isPublic : base.trip.isPublic },
    stops: stops.slice(0, 500).map((s, index) => ({
      id: String(s.id || uid()), date: String(s.date || trip.startDate || base.trip.startDate).slice(0, 10), startTime: String(s.startTime || s.time || "").slice(0, 5), endTime: String(s.endTime || "").slice(0, 5),
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : index, title: String(s.title || s.name || `項目 ${index + 1}`).slice(0, 100), address: String(s.address || "").slice(0, 300),
      lat: finiteOrNull(s.lat ?? s.latitude), lng: finiteOrNull(s.lng ?? s.longitude), category: normalizeCategory(s.category || s.type), transportMode: String(s.transportMode || "").slice(0, 30),
      origin: String(s.origin || s.from || "").slice(0, 200), originLat: finiteOrNull(s.originLat), originLng: finiteOrNull(s.originLng), destination: String(s.destination || s.to || "").slice(0, 200),
      cost: String(s.cost || s.fee || s["料金"] || "").slice(0, 100), notes: String(s.notes || s.note || "").slice(0, 1000)
    }))
  };
}
function sortStops(stops = state.data.stops) {
  return [...stops].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.order ?? 9999) - Number(b.order ?? 9999) || String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99")));
}
function normalizedPlaceName(value) { return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\-_｜|→>、，,。．・()（）\[\]【】]/g, ""); }
function placeNamesMatch(target, candidates) {
  const expected = normalizedPlaceName(target); if (!expected) return false;
  return candidates.some(candidate => { const actual = normalizedPlaceName(candidate); return actual && (actual === expected || (Math.min(actual.length, expected.length) >= 4 && (actual.includes(expected) || expected.includes(actual)))); });
}
function coordinatesMatch(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return false;
  const radians = value => value * Math.PI / 180, dLat = radians(bLat - aLat), dLng = radians(bLng - aLng), lat1 = radians(aLat), lat2 = radians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= 750;
}
function movementContinuity(stop, orderedStops = sortStops()) {
  if (stop.category !== "移動") return null;
  const index = orderedStops.findIndex(item => item.id === stop.id), previous = index > 0 ? orderedStops[index - 1] : null, next = index >= 0 && index < orderedStops.length - 1 ? orderedStops[index + 1] : null;
  const originMatches = previous ? coordinatesMatch(stop.originLat, stop.originLng, previous.lat, previous.lng) || placeNamesMatch(stop.origin, [previous.destination, previous.address, previous.title]) : null;
  const nextLat = next?.category === "移動" && Number.isFinite(next.originLat) ? next.originLat : next?.lat, nextLng = next?.category === "移動" && Number.isFinite(next.originLng) ? next.originLng : next?.lng;
  const destinationMatches = next ? coordinatesMatch(stop.lat, stop.lng, nextLat, nextLng) || placeNamesMatch(stop.destination, [next.category === "移動" ? next.origin : next.address, next.title]) : null;
  return { previous, next, originMatches, destinationMatches };
}
function continuityHtml(stop, orderedStops) {
  const check = movementContinuity(stop, orderedStops); if (!check) return "";
  const warnings = [];
  if (check.previous && !check.originMatches) warnings.push(`A 點與前一項「${check.previous.title}」不一致`);
  if (check.next && !check.destinationMatches) warnings.push(`B 點與後一項「${check.next.title}」不一致`);
  if (warnings.length) return `<p class="continuity-status warn">⚠ ${escapeHtml(warnings.join("；"))}</p>`;
  if (check.previous && check.next) return `<p class="continuity-status ok">A／B 點與前後行程銜接正常</p>`;
  return `<p class="continuity-status partial">${check.previous ? "B 點無後一項可比對" : "A 點無前一項可比對"}</p>`;
}

async function apiJsonp(parameters) {
  if (!isConfigured(CONFIG.GAS_URL)) throw new Error("尚未設定 GAS_URL");
  return new Promise((resolve, reject) => {
    const callback = `tripJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`, script = document.createElement("script");
    const timer = setTimeout(() => cleanup(new Error("讀取逾時")), 15000);
    function cleanup(error, result) { clearTimeout(timer); delete window[callback]; script.remove(); error ? reject(error) : resolve(result); }
    window[callback] = result => result?.ok ? cleanup(null, result) : cleanup(new Error(result?.error || "讀取失敗"));
    script.onerror = () => cleanup(new Error("無法連線至 GAS"));
    script.src = `${CONFIG.GAS_URL}?${new URLSearchParams({ ...parameters, callback })}`;
    document.head.appendChild(script);
  });
}
async function apiPost(payload) {
  if (!isConfigured(CONFIG.GAS_URL)) throw new Error("尚未設定 GAS_URL");
  const response = await fetch(CONFIG.GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
  const result = await response.json();
  if (!result.ok) {
    if (/登入已失效|登入已逾時|帳號已停用|使用者不存在/.test(result.error || "")) {
      state.token = ""; state.user = null; state.tripCanEdit = false; localStorage.removeItem(SESSION_KEY); renderAuth();
    }
    throw new Error(result.error || "操作失敗");
  }
  return result;
}
async function apiList() { return state.token ? apiPost({ action: "list", token: state.token }) : apiJsonp({ action: "list" }); }
async function apiGet(id) { return state.token ? apiPost({ action: "get", id, token: state.token }) : apiJsonp({ action: "get", id }); }

async function restoreSession() {
  if (!state.token) return renderAuth();
  try { const result = await apiPost({ action: "me", token: state.token }); state.user = result.user; }
  catch (error) { state.token = ""; state.user = null; localStorage.removeItem(SESSION_KEY); toast("登入已失效，已切換為訪客模式"); }
  renderAuth();
}
function renderAuth() {
  document.body.classList.toggle("is-guest", !state.user);
  document.body.classList.toggle("is-admin", isAdmin());
  $("guestBadge").textContent = state.user ? (isAdmin() ? "管理員" : "使用者") : "訪客模式";
  $("accountBtn").textContent = state.user ? `${state.user.username}｜登出` : "";
  renderMode();
}
async function submitLogin(event) {
  event.preventDefault(); $("confirmLoginBtn").disabled = true; $("loginError").textContent = "登入中…";
  try {
    const result = await apiPost({ action: "login", username: $("loginUsername").value.trim(), password: $("loginPassword").value });
    state.token = result.token; state.user = result.user; localStorage.setItem(SESSION_KEY, state.token); $("loginDialog").close();
    renderAuth(); await refreshCurrentPermissions(); await refreshTripList(true);
    toast(result.defaultPasswordWarning ? "登入成功；請至帳號管理更換預設管理員密碼" : "登入成功");
  } catch (error) { $("loginError").textContent = error.message; }
  finally { $("confirmLoginBtn").disabled = false; }
}
async function logout() {
  if (state.dirty && !confirm("目前有未儲存變更，確定登出？")) return;
  state.token = ""; state.user = null; state.tripCanEdit = false; localStorage.removeItem(SESSION_KEY); renderAuth();
  if (state.tripId && state.data.trip.isPublic) await loadTripById(state.tripId, false); else if (state.tripId) resetJourneyState("私人旅程已關閉"); else renderAll();
  await refreshTripList(true); toast("已登出，現在是訪客檢視模式");
}
async function refreshCurrentPermissions() { if (state.tripId) await loadTripById(state.tripId, false); else { state.tripCanEdit = Boolean(state.user); renderAll(); } }

async function loadTripById(id, updateUrl = true) {
  if (state.dirty && updateUrl && !confirm("目前有未儲存變更，確定切換旅程？")) return;
  setStatus("載入中…");
  try {
    const result = await apiGet(id);
    state.geocodeJobId++;
    state.tripId = result.id; state.data = normalizeTrip(result.data); state.hasJourney = true; state.owner = result.owner || ""; state.tripCanEdit = Boolean(result.canEdit); state.dirty = false;
    history.replaceState(null, "", location.pathname); $("tripPicker").open = false;
    $("dayFilter").value = "all"; setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`); renderAll(); updateSelectedTripInList();
  } catch (error) { setStatus("載入失敗"); toast(error.message); }
}
async function loadInitialTrip() { if (location.search) history.replaceState(null, "", location.pathname); renderAll(); }

async function saveTrip() {
  if (!state.user) return openLogin();
  if (!state.hasJourney) return toast("請先新增或載入旅程");
  if (!canEdit()) return toast("你沒有編輯這個旅程的權限");
  syncMetaFromForm(); if (!state.data.trip.title.trim()) return toast("請輸入旅程名稱");
  const creating = !state.tripId; setStatus("儲存中…"); $("saveBtn").disabled = true;
  try {
    const result = await apiPost({ action: creating ? "create" : "save", id: state.tripId, token: state.token, data: state.data });
    state.tripId = result.id; state.owner = result.owner; state.tripCanEdit = true; state.dirty = false;
    history.replaceState(null, "", location.pathname);
    setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`); renderAll(); await refreshTripList(true); toast(creating ? "旅程已建立" : "旅程已儲存");
  } catch (error) { setStatus("儲存失敗"); toast(error.message); }
  finally { renderMode(); }
}

function markDirty() { state.dirty = true; setStatus("有未儲存變更"); }
const autoRender = debounce(() => { syncMetaFromForm(); $("viewTitle").textContent = state.data.trip.title; $("mobileTripTitle").textContent = state.data.trip.title || "行程面板"; markDirty(); }, 250);
function syncMetaFromForm() { if (canEdit()) state.data.trip.title = $("tripTitle").value.trim() || "未命名旅程"; }
function syncFormFromState() {
  $("tripTitle").value = state.data.trip.title; $("viewTitle").textContent = state.data.trip.title || "尚未選擇旅程";
  $("viewDates").textContent = state.hasJourney ? [state.data.trip.startDate, state.data.trip.endDate].filter(Boolean).join(" — ") : "";
  $("tripOwner").textContent = state.hasJourney ? `建立者：${state.owner || (state.tripId ? "舊版資料／待管理員接管" : state.user?.username || "尚未儲存")}・${state.data.trip.isPublic ? "公開旅程" : "私人旅程"}` : "";
}
function renderAll() { syncFormFromState(); renderMode(); renderFilters(); renderTimeline(); refreshMap(); }
function renderMode() {
  const editable = canEdit(); document.body.classList.toggle("read-only", !editable); document.body.classList.toggle("has-journey", state.hasJourney);
  $("addItemBtn").disabled = !editable; $("saveBtn").disabled = !editable; $("exportBtn").disabled = !state.hasJourney;
  $("tripTitle").disabled = !editable; $("tripSettingsBtn").disabled = !state.hasJourney;
  $("cancelDraftBtn").hidden = !(state.user && state.hasJourney && !state.tripId);
  $("deleteTripBtn").hidden = !(state.tripId && editable);
  $("mobileTripTitle").textContent = state.data.trip.title || "行程面板";
  $("emptyState").querySelector("p").textContent = state.user ? "請先新增旅程，再新增行程項目；也可以直接上傳旅程檔。" : "訪客可從上方『選擇旅程』檢視使用者公開的旅程；登入後才能新增與編輯。";
}

function renderFilters() {
  const current = $("dayFilter").value, dates = [...new Set(sortStops().map(s => s.date).filter(Boolean))];
  $("dayFilter").innerHTML = `<option value="all">全部日期</option>${dates.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(formatDay(d))}</option>`).join("")}`;
  if (["all", ...dates].includes(current)) $("dayFilter").value = current;
}
function renderTimeline() {
  const timeline = $("timeline"), stops = sortStops(); $("emptyState").hidden = stops.length > 0; timeline.hidden = stops.length === 0;
  const groups = Object.groupBy ? Object.groupBy(stops, s => s.date || "未指定日期") : stops.reduce((g, s) => ((g[s.date || "未指定日期"] ||= []).push(s), g), {});
  timeline.innerHTML = Object.entries(groups).map(([date, items]) => `
    <section class="day-group" data-date="${escapeHtml(date)}"><div class="day-heading"><strong>${escapeHtml(formatDay(date))}</strong><span>${items.length} 個行程項目</span></div>
    ${items.map(s => `<article class="stop-card" data-id="${escapeHtml(s.id)}" data-date="${escapeHtml(s.date)}" draggable="${canEdit()}" title="單擊可在地圖上顯示">
      ${canEdit() ? `<div class="drag-handle" title="拖拉調整同日順序">⋮⋮</div>` : ""}<div class="stop-time">${escapeHtml(s.startTime || "—")}</div>
      <div class="stop-body"><h3>${escapeHtml(s.title)}</h3>${s.origin || s.destination ? `<p class="route-detail">${escapeHtml(s.origin || "—")} → ${escapeHtml(s.destination || "—")}</p>` : ""}${continuityHtml(s, stops)}${s.address ? `<p>${escapeHtml(s.address)}</p>` : ""}${s.cost ? `<p class="cost-detail">料金：${escapeHtml(s.cost)}</p>` : ""}${s.notes ? `<p>${escapeHtml(s.notes)}</p>` : ""}<span class="category">${escapeHtml(s.category)}</span>${s.transportMode ? `<span class="category">${escapeHtml(s.transportMode)}</span>` : ""}</div>
      <div class="stop-actions"><button class="small-btn" data-action="focus" title="在地圖顯示">⌖</button>${canEdit() ? `<button class="small-btn" data-action="edit" title="編輯">✎</button><button class="small-btn" data-action="delete" title="刪除">×</button>` : ""}</div>
    </article>`).join("")}</section>`).join("");
}

function openLogin() { $("loginError").textContent = ""; $("loginPassword").value = ""; $("loginDialog").showModal(); $("loginUsername").focus(); }
function openNewTripDialog() {
  if (!state.user) return openLogin();
  if (state.dirty && !confirm("目前有未儲存變更，確定建立新的旅程？")) return;
  const today = new Date().toISOString().slice(0, 10);
  $("newTripTitle").value = ""; $("newTripStartDate").value = today; $("newTripEndDate").value = today; $("newTripDescription").value = ""; $("newTripPublic").checked = false; $("newTripError").textContent = ""; $("newTripDialog").showModal();
}
function createJourney(event) {
  event.preventDefault(); const title = $("newTripTitle").value.trim(), startDate = $("newTripStartDate").value, endDate = $("newTripEndDate").value;
  if (!title || !startDate || !endDate) return $("newTripError").textContent = "請填寫旅程名稱與日期";
  if (endDate < startDate) return $("newTripError").textContent = "結束日期不可早於開始日期";
  state.geocodeJobId++; state.tripId = ""; state.hasJourney = true; state.owner = state.user.username; state.tripCanEdit = true;
  state.data = normalizeTrip({ schemaVersion: 5, trip: { title, startDate, endDate, description: $("newTripDescription").value.trim(), isPublic: $("newTripPublic").checked }, stops: [] }); state.dirty = true;
  history.replaceState(null, "", location.pathname); $("dayFilter").value = "all"; $("newTripDialog").close(); renderAll(); setStatus("新旅程（尚未儲存）"); toast("旅程已建立，現在可以新增行程項目");
}
function updateStopFormMode() {
  const movement = $("stopCategory").value === "移動";
  document.querySelectorAll(".movement-only").forEach(field => field.hidden = !movement);
  $("stopAddressField").hidden = movement; $("stopAddress").required = !movement; $("stopOrigin").required = movement; $("stopDestination").required = movement;
}
function openStopDialog(stop = null) {
  if (!canEdit()) return state.user ? toast("你沒有編輯這個旅程的權限") : openLogin();
  $("dialogTitle").textContent = stop ? "編輯行程項目" : "新增行程項目"; $("stopId").value = stop?.id || ""; $("stopTitle").value = stop?.title || "";
  $("stopDate").value = stop?.date || state.data.trip.startDate || new Date().toISOString().slice(0, 10); $("stopTime").value = stop?.startTime || ""; $("stopEndTime").value = stop?.endTime || "";
  $("stopCategory").value = normalizeCategory(stop?.category); $("stopTransportMode").value = stop?.transportMode || ""; $("stopOrigin").value = stop?.origin || "";
  $("stopOriginLat").value = stop?.originLat ?? ""; $("stopOriginLng").value = stop?.originLng ?? ""; $("stopDestination").value = stop?.destination || ""; $("stopAddress").value = stop?.address || "";
  $("stopLat").value = stop?.lat ?? ""; $("stopLng").value = stop?.lng ?? ""; $("stopCost").value = stop?.cost || ""; $("stopNotes").value = stop?.notes || ""; $("formError").textContent = ""; updateStopFormMode(); $("stopDialog").showModal();
}
async function submitStop(event) {
  event.preventDefault(); const category = $("stopCategory").value, movement = category === "移動", origin = $("stopOrigin").value.trim(), destination = $("stopDestination").value.trim(), address = $("stopAddress").value.trim();
  if (!$("stopTitle").value.trim() || !$("stopDate").value) return $("formError").textContent = "請填寫名稱與日期";
  if (movement && (!origin || !destination)) return $("formError").textContent = "移動項目請填寫 A 點與 B 點";
  if (!movement && !address) return $("formError").textContent = "請填寫地址或地點關鍵字";
  $("confirmStopBtn").disabled = true; $("formError").textContent = movement ? "正在定位 A 點…" : "正在定位地址…";
  try {
    let lat = finiteOrNull($("stopLat").value), lng = finiteOrNull($("stopLng").value), originLat = finiteOrNull($("stopOriginLat").value), originLng = finiteOrNull($("stopOriginLng").value);
    if (movement) {
      if (originLat == null || originLng == null) ({ lat: originLat, lng: originLng } = await geocode(origin));
      $("formError").textContent = "正在定位 B 點…";
      if (lat == null || lng == null) ({ lat, lng } = await geocode(destination));
    } else if (lat == null || lng == null) ({ lat, lng } = await geocode(address));
    const existing = state.data.stops.find(s => s.id === $("stopId").value), sameDayStops = state.data.stops.filter(s => s.date === $("stopDate").value && s.id !== existing?.id), nextOrder = Math.max(-1, ...sameDayStops.map(s => Number(s.order) || 0)) + 1;
    const stop = { id: existing?.id || uid(), date: $("stopDate").value, startTime: $("stopTime").value, endTime: $("stopEndTime").value, order: existing?.date === $("stopDate").value ? existing.order : nextOrder, title: $("stopTitle").value.trim(), address: movement ? "" : address, lat, lng, category, transportMode: $("stopTransportMode").value, origin: movement ? origin : "", originLat: movement ? originLat : null, originLng: movement ? originLng : null, destination: movement ? destination : "", cost: $("stopCost").value.trim(), notes: $("stopNotes").value.trim() };
    const index = state.data.stops.findIndex(s => s.id === stop.id); if (index >= 0) state.data.stops[index] = stop; else state.data.stops.push(stop);
    syncTripDates(); $("stopDialog").close(); markDirty(); renderFilters(); renderTimeline(); refreshMap();
    const check = movementContinuity(stop); if (check && ((check.previous && !check.originMatches) || (check.next && !check.destinationMatches))) toast("移動項目的 A／B 點與前後行程不一致，請查看清單警告");
  } catch (error) { $("formError").textContent = `定位失敗：${error.message}。可手動填入緯度、經度。`; }
  finally { $("confirmStopBtn").disabled = false; }
}
function syncTripDates() {
  const dates = state.data.stops.map(s => s.date).filter(Boolean).sort();
  if (!dates.length) return;
  if (!state.data.trip.startDate || dates[0] < state.data.trip.startDate) state.data.trip.startDate = dates[0];
  if (!state.data.trip.endDate || dates.at(-1) > state.data.trip.endDate) state.data.trip.endDate = dates.at(-1);
  syncFormFromState();
}

function reorderStops(sourceId, targetId) {
  if (!canEdit() || sourceId === targetId) return;
  const source = state.data.stops.find(s => s.id === sourceId), target = state.data.stops.find(s => s.id === targetId);
  if (!source || !target) return; if (source.date !== target.date) return toast("目前只支援同一天內拖拉排序");
  const dayStops = sortStops(state.data.stops.filter(s => s.date === source.date)), from = dayStops.findIndex(s => s.id === sourceId), to = dayStops.findIndex(s => s.id === targetId);
  dayStops.splice(to, 0, dayStops.splice(from, 1)[0]); dayStops.forEach((s, index) => s.order = index); markDirty(); renderTimeline(); refreshMap(); toast("順序已調整，請記得儲存");
}

function normalizeLocationKey(address) { return String(address || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
function loadGeocodeCache() { if (state.geocodeCache) return state.geocodeCache; try { const value = JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) || "{}"); state.geocodeCache = value && typeof value === "object" ? value : {}; } catch (error) { state.geocodeCache = {}; } return state.geocodeCache; }
function cachedGeocode(address) { const item = loadGeocodeCache()[normalizeLocationKey(address)]; return item && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)) ? { lat: Number(item.lat), lng: Number(item.lng) } : null; }
function cacheGeocode(address, coordinates) {
  try {
    const cache = loadGeocodeCache(), key = normalizeLocationKey(address); cache[key] = { lat: coordinates.lat, lng: coordinates.lng, at: Date.now() };
    const trimmed = Object.fromEntries(Object.entries(cache).sort((a, b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0)).slice(0, 400)); state.geocodeCache = trimmed;
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(trimmed));
  } catch (error) { console.warn("無法儲存定位快取", error); }
}
async function geocode(address) {
  const cached = cachedGeocode(address); if (cached) return cached;
  const wait = Math.max(0, 1100 - (Date.now() - state.lastGeocodeAt)); if (wait) await new Promise(resolve => setTimeout(resolve, wait)); state.lastGeocodeAt = Date.now();
  const url = new URL(CONFIG.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search"); url.searchParams.set("q", address); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("accept-language", "zh-TW,ja,en");
  const response = await fetch(url, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(`地址服務暫時無法使用（${response.status}）`);
  const results = await response.json(); if (!results?.length) throw new Error("找不到地址"); const coordinates = { lat: Number(results[0].lat), lng: Number(results[0].lon) }; cacheGeocode(address, coordinates); return coordinates;
}

async function locateImportedStops(jobId) {
  const tasks = new Map();
  const addTarget = (query, apply) => { const key = normalizeLocationKey(query); if (!key) return; if (!tasks.has(key)) tasks.set(key, { query, targets: [] }); tasks.get(key).targets.push(apply); };
  state.data.stops.forEach(stop => { if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) addTarget(stop.address || stop.destination || stop.origin || stop.title, coordinates => { stop.lat = coordinates.lat; stop.lng = coordinates.lng; }); });
  state.data.stops.filter(stop => stop.category === "移動" && stop.origin).forEach(stop => { if (!Number.isFinite(stop.originLat) || !Number.isFinite(stop.originLng)) addTarget(stop.origin, coordinates => { stop.originLat = coordinates.lat; stop.originLng = coordinates.lng; }); });
  if (!tasks.size) return toast("匯入完成，所有行程項目已有座標");
  let completed = 0, located = 0, failed = 0; setStatus(`匯入定位 0/${tasks.size}…`);
  for (const task of tasks.values()) {
    if (state.geocodeJobId !== jobId) return;
    try { const coordinates = await geocode(task.query); task.targets.forEach(apply => apply(coordinates)); located += task.targets.length; }
    catch (error) { failed++; console.warn(`無法定位：${task.query}`, error); }
    completed++; state.dirty = true; setStatus(`匯入定位 ${completed}/${tasks.size}…`);
    if (completed % 5 === 0 || completed === tasks.size) refreshMap();
  }
  if (state.geocodeJobId !== jobId) return;
  renderTimeline(); const suffix = failed ? `，${failed} 個地點需手動確認` : ""; setStatus(`已定位 ${located} 個端點${suffix}`); toast(`匯入定位完成${suffix}`);
}

function initMap() {
  try {
    if (!window.L) throw new Error("Leaflet 程式庫載入失敗"); const center = CONFIG.DEFAULT_CENTER || { lat: 23.6978, lng: 120.9605 };
    state.map = L.map("map", { zoomControl: true }).setView([center.lat, center.lng], CONFIG.DEFAULT_ZOOM || 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(state.map);
    state.mapsReady = true; $("mapNotice").hidden = true; refreshMap();
  } catch (error) { $("mapNotice").textContent = `地圖載入失敗：${error.message}`; }
}
function visibleStops() { const day = $("dayFilter").value; return sortStops().filter(s => day === "all" || s.date === day); }
function locatedVisibleStops() {
  const sequence = new Map(sortStops().map((stop, index) => [stop.id, index + 1]));
  return visibleStops().filter(stop => stop.category !== "移動" && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)).map(stop => ({ ...stop, sequence: sequence.get(stop.id) }));
}
function routePoints() {
  const source = locatedVisibleStops();
  return source.filter((stop, index) => index === 0 || Math.abs(stop.lat - source[index - 1].lat) > .00001 || Math.abs(stop.lng - source[index - 1].lng) > .00001);
}
function markerGroups() {
  const groups = new Map();
  locatedVisibleStops().forEach(stop => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    if (!groups.has(key)) groups.set(key, { lat: stop.lat, lng: stop.lng, stops: [] });
    groups.get(key).stops.push(stop);
  });
  return [...groups.values()];
}
function markerLabel(stops) {
  const numbers = stops.map(stop => stop.sequence);
  if (numbers.length <= 2) return numbers.join("·");
  return `${numbers[0]}…${numbers.at(-1)}`;
}
function visibleMovementLinks() {
  const sequence = new Map(sortStops().map((stop, index) => [stop.id, index + 1]));
  return visibleStops().filter(stop => stop.category === "移動" && [stop.originLat, stop.originLng, stop.lat, stop.lng].every(Number.isFinite)).map(stop => ({ ...stop, sequence: sequence.get(stop.id) }));
}
function firstFlightOrigin() { const first = sortStops()[0]; if (!first || first.category !== "移動" || first.transportMode !== "飛機" || !Number.isFinite(first.originLat) || !Number.isFinite(first.originLng)) return null; const day = $("dayFilter").value; return day === "all" || first.date === day ? first : null; }
function clearMapObjects() { state.markers.forEach(m => m.remove()); state.markers = []; state.polylines.forEach(p => p.remove()); state.polylines = []; state.routeLine = null; }
function refreshMap() {
  if (!state.mapsReady) return; clearMapObjects(); const groups = markerGroups(), links = visibleMovementLinks(), zero = firstFlightOrigin(); if (!groups.length && !links.length && !zero) return;
  const bounds = L.latLngBounds();
  links.forEach(stop => {
    const line = L.polyline([[stop.originLat, stop.originLng], [stop.lat, stop.lng]], { color: "#5d98a6", opacity: .8, weight: 4, dashArray: "7 7" }).addTo(state.map);
    line.bindTooltip(`${stop.sequence}. ${escapeHtml(stop.origin)} → ${escapeHtml(stop.destination)}`, { sticky: true });
    line.stopId = stop.id; line.isMovementLine = true; state.polylines.push(line);
    bounds.extend([stop.originLat, stop.originLng]); bounds.extend([stop.lat, stop.lng]);
  });
  if (zero) { const icon = L.divIcon({ className: "trip-number-icon", html: `<div class="pin pin-zero"><span>0</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -35] }); const marker = L.marker([zero.originLat, zero.originLng], { title: zero.origin, icon }).addTo(state.map); marker.bindPopup(`<h3>旅程起點｜${escapeHtml(zero.origin)}</h3><p>${escapeHtml(zero.date)} ${escapeHtml(zero.startTime)}・飛機</p>`); marker.stopIds = [`${zero.id}:origin`]; state.markers.push(marker); bounds.extend(marker.getLatLng()); }
  groups.forEach(group => { const label = markerLabel(group.stops), wide = label.length > 2, size = wide ? 44 : 34; const icon = L.divIcon({ className: "trip-number-icon", html: `<div class="pin${wide ? " pin-wide" : ""}"><span>${escapeHtml(label)}</span></div>`, iconSize: [size, 34], iconAnchor: [size / 2, 34], popupAnchor: [0, -35] }); const popup = group.stops.map(stop => `<div class="map-stop"><h3>${stop.sequence}. ${escapeHtml(stop.title)}</h3><p>${escapeHtml(stop.date)} ${escapeHtml(stop.startTime)}・${escapeHtml(stop.category)}</p>${stop.origin || stop.destination ? `<p>${escapeHtml(stop.origin || "—")} → ${escapeHtml(stop.destination || "—")}</p>` : ""}${stop.address ? `<p>${escapeHtml(stop.address)}</p>` : ""}</div>`).join(""); const marker = L.marker([group.lat, group.lng], { title: group.stops.map(stop => `${stop.sequence}. ${stop.title}`).join(" / "), icon }).addTo(state.map); marker.bindPopup(popup); marker.stopIds = group.stops.map(stop => stop.id); state.markers.push(marker); bounds.extend(marker.getLatLng()); });
  const count = groups.length + (zero ? 1 : 0); if (count === 1) state.map.setView(zero ? [zero.originLat, zero.originLng] : [groups[0].lat, groups[0].lng], 14); else state.map.fitBounds(bounds, { padding: [55, 55] });
}
function drawRoute() { if (!state.mapsReady) return toast("地圖尚未載入"); const stops = routePoints(), zero = firstFlightOrigin(), points = [...(zero ? [{ lat: zero.originLat, lng: zero.originLng }] : []), ...stops]; if (points.length < 2) return toast("此日期至少需要兩個已定位地點"); if (state.routeLine) { state.routeLine.remove(); state.polylines = state.polylines.filter(line => line !== state.routeLine); } const line = L.polyline(points.map(s => [s.lat, s.lng]), { color: "#e76845", opacity: .9, weight: 5, dashArray: "10 8" }).addTo(state.map); state.routeLine = line; state.polylines.push(line); state.map.fitBounds(line.getBounds(), { padding: [55, 55] }); toast("已依行程項目順序連線；藍線為各移動項目的 A→B 關係"); }
function openGoogleNavigation() { const candidates = visibleStops().filter(s => s.category !== "移動" && ((Number.isFinite(s.lat) && Number.isFinite(s.lng)) || s.address)); const allStops = candidates.filter((stop, index) => index === 0 || stop.address !== candidates[index - 1].address); if (allStops.length < 2) return toast("至少需要兩個有地址或座標的地點"); const stops = allStops.slice(0, 10), locationOf = stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) ? `${stop.lat},${stop.lng}` : stop.address, url = new URL("https://www.google.com/maps/dir/"); url.searchParams.set("api", "1"); url.searchParams.set("origin", locationOf(stops[0])); url.searchParams.set("destination", locationOf(stops.at(-1))); if (stops.length > 2) url.searchParams.set("waypoints", stops.slice(1, -1).map(locationOf).join("|")); url.searchParams.set("travelmode", "driving"); window.open(url.toString(), "_blank", "noopener,noreferrer"); if (allStops.length > 10) toast("Google Maps 單次先帶入前 10 個地點"); }
function resetMovementLineStyles() {
  state.polylines.filter(line => line.isMovementLine).forEach(line => line.setStyle({ color: "#5d98a6", opacity: .8, weight: 4, dashArray: "7 7" }));
}
function focusStop(id) {
  if (!state.mapsReady) return toast("地圖尚未載入");
  const stop = state.data.stops.find(item => item.id === id);
  if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return toast("此項目尚未完成定位");
  if ($("dayFilter")?.value !== "all" && $("dayFilter").value !== stop.date) { $("dayFilter").value = stop.date; refreshMap(); }
  resetMovementLineStyles();
  if (stop.category === "移動") {
    if (!Number.isFinite(stop.originLat) || !Number.isFinite(stop.originLng)) return toast("此移動項目的 A 點尚未完成定位");
    const line = state.polylines.find(item => item.isMovementLine && item.stopId === id);
    if (line) {
      line.setStyle({ color: "#e76845", opacity: 1, weight: 7, dashArray: null });
      line.bringToFront?.(); line.openTooltip?.();
      state.map.fitBounds(line.getBounds(), { padding: [80, 80], maxZoom: 14 });
    } else state.map.fitBounds(L.latLngBounds([[stop.originLat, stop.originLng], [stop.lat, stop.lng]]), { padding: [80, 80], maxZoom: 14 });
    return;
  }
  const marker = state.markers.find(item => item.stopIds?.includes(id));
  if (!marker) { state.map.setView([stop.lat, stop.lng], 16); return; }
  state.map.setView(marker.getLatLng(), 16); marker.openPopup();
}

function parseCsv(text) { const rows = []; let row = [], cell = "", quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; } else if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { row.push(cell); cell = ""; } else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && next === "\n") i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; } else cell += ch; } row.push(cell); if (row.some(v => v.trim())) rows.push(row); if (rows.length < 2) throw new Error("CSV 沒有資料"); const headers = rows[0].map(h => h.trim().toLowerCase()); return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() || ""]))); }
function pickField(row, ...names) { for (const name of names) if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") return row[name]; return ""; }
function excelDate(value) { if (value instanceof Date) return value.toISOString().slice(0, 10); if (typeof value === "number" && value >= 1) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10); const match = String(value || "").trim().replace(/[./]/g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : ""; }
function excelTime(value) { if (value === "" || value == null) return ""; if (typeof value === "number") { const minutes = Math.round((value % 1) * 1440) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; } if (value instanceof Date) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; const match = String(value).trim().match(/(\d{1,2}):(\d{2})/); return match ? `${match[1].padStart(2, "0")}:${match[2]}` : ""; }
function inferCategory(type, title, origin, destination) { if (String(type || "").trim()) return normalizeCategory(type); const text = `${title} ${origin} ${destination}`; if (origin || destination || /自駕|開車|飛機|航班|CI\d+|JR|新幹線|特急|電車|市電|巴士|バス|Taxi|計程車|步行|接送|入境|到着|取車|還車/i.test(text)) return "移動"; if (/午餐|晚餐|早餐|用餐|餐廳|市場|食事|弁当|咖啡|拉麵|飯|料理/i.test(text)) return "食事"; if (/飯店|旅館|ホテル|宿|休息|休憩|入住|Check.?in/i.test(text)) return "休憩"; return "觀光"; }
function inferTransportMode(title) { const text = String(title || ""); if (/自駕|開車|取車|還車/.test(text)) return "自駕"; if (/CI\d+|飛機|航班/.test(text)) return "飛機"; if (/JR|新幹線|特急|鉄道|鐵路/.test(text)) return "鐵路"; if (/市電/.test(text)) return "市電"; if (/巴士|バス|接送/.test(text)) return "巴士"; if (/Taxi|計程車/i.test(text)) return "計程車"; if (/步行/.test(text)) return "步行"; return ""; }
function referenceRowsToTrip(rows, filename) { const stops = rows.map((row, index) => { const title = String(pickField(row, "項目", "item", "title", "地點名稱", "名稱") || "").trim(), origin = String(pickField(row, "起", "origin", "from", "起點") || "").trim(), destination = String(pickField(row, "迄", "destination", "to", "迄點") || "").trim(), type = pickField(row, "類型", "类型", "type", "category"); return { id: uid(), order: index, date: excelDate(pickField(row, "日期", "date")), startTime: excelTime(pickField(row, "啟程時間", "启程时间", "startTime", "starttime", "time", "開始時間")), endTime: excelTime(pickField(row, "到達時間", "到达时间", "endTime", "endtime", "結束時間")), title: title || destination || origin || "未命名項目", origin, destination, address: String(pickField(row, "地址", "address") || destination || origin || title).trim(), lat: finiteOrNull(pickField(row, "緯度", "lat", "latitude")), lng: finiteOrNull(pickField(row, "經度", "lng", "longitude")), originLat: finiteOrNull(pickField(row, "起點緯度", "originLat", "originlat")), originLng: finiteOrNull(pickField(row, "起點經度", "originLng", "originlng")), category: inferCategory(type, title, origin, destination), transportMode: String(pickField(row, "移動方式", "transportMode", "transportmode") || inferTransportMode(title)), cost: String(pickField(row, "料金", "費用", "cost", "fee") || "").trim(), notes: String(pickField(row, "備註", "notes", "note") || "").trim() }; }).filter(stop => stop.date || stop.title !== "未命名項目"); const dayOrders = new Map(); stops.forEach(stop => { const key = stop.date || ""; stop.order = dayOrders.get(key) || 0; if (stop.category === "移動") stop.address = ""; dayOrders.set(key, stop.order + 1); }); const dates = stops.map(s => s.date).filter(Boolean).sort(); return normalizeTrip({ schemaVersion: 5, trip: { title: filename.replace(/\.(xlsx?|csv)$/i, ""), startDate: dates[0], endDate: dates.at(-1), description: "由旅程檔案匯入", isPublic: false }, stops }); }
async function importExcel(file) { if (!window.XLSX) throw new Error("Excel 解析元件尚未載入"); const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false }), firstSheet = workbook.Sheets[workbook.SheetNames[0]]; if (!firstSheet) throw new Error("Excel 沒有工作表"); const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: true }); if (!rows.length) throw new Error("Excel 沒有旅程資料"); return referenceRowsToTrip(rows, file.name); }
async function importFile(file) { if (!state.user) return openLogin(); try { const lower = file.name.toLowerCase(); if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) state.data = await importExcel(file); else if (lower.endsWith(".json")) state.data = normalizeTrip(JSON.parse(await file.text())); else state.data = referenceRowsToTrip(parseCsv(await file.text()), file.name); state.data.trip.isPublic = false; state.tripId = ""; state.hasJourney = true; state.owner = state.user.username; state.tripCanEdit = true; const jobId = ++state.geocodeJobId; history.replaceState(null, "", location.pathname); renderAll(); markDirty(); toast(`已匯入 ${state.data.stops.length} 個行程項目，預設為私人旅程，正在背景定位`); void locateImportedStops(jobId); } catch (error) { toast(`匯入失敗：${error.message}`); } finally { $("fileInput").value = ""; } }
function exportJson() { if (!state.hasJourney) return toast("目前沒有可匯出的旅程"); syncMetaFromForm(); const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.data.trip.title || "trip"}.json`; a.click(); URL.revokeObjectURL(a.href); }

function formatDay(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date; return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function formatTimestamp(value) { if (!value) return ""; return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function openTripSettings() { if (!canEdit()) return toast("你沒有修改這個旅程設定的權限"); $("tripPublicToggle").checked = Boolean(state.data.trip.isPublic); $("tripSettingsDialog").showModal(); }
async function submitTripSettings(event) { event.preventDefault(); state.data.trip.isPublic = $("tripPublicToggle").checked; markDirty(); $("tripSettingsDialog").close(); if (state.tripId) await saveTrip(); else { syncFormFromState(); toast("公開設定已套用，儲存旅程後生效"); } }

function tripListItemHtml(item) {
  const isDemo = item.source === "demo", visibility = isDemo || item.isPublic ? "公開" : "私人", permission = isDemo ? "示範" : item.canEdit ? `${visibility}・可編輯` : visibility;
  return `<button class="trip-list-item${!isDemo && item.id === state.tripId ? " selected" : ""}" type="button" data-trip-source="${isDemo ? "demo" : "saved"}" data-trip-id="${escapeHtml(item.id)}"><span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml([item.startDate, item.endDate].filter(Boolean).join(" — "))}</p><p>${escapeHtml(`${item.stopCount || 0} 個項目${item.owner ? `・${item.owner}` : ""}${item.updatedAt ? `・更新 ${formatTimestamp(item.updatedAt)}` : ""}`)}</p></span><span class="trip-list-tag ${isDemo ? "demo" : item.isPublic ? "public" : "private"}">${permission}</span></button>`;
}
async function refreshTripList(force = false) {
  const demos = (window.TRIP_DEMOS || []).map(demo => ({ source: "demo", id: demo.id, title: demo.data.trip.title, startDate: demo.data.trip.startDate, endDate: demo.data.trip.endDate, stopCount: demo.data.stops.length }));
  $("tripListContent").innerHTML = demos.map(tripListItemHtml).join("") || `<p class="hint">目前沒有示範旅程。</p>`;
  if (!isConfigured(CONFIG.GAS_URL)) return;
  if (!force && state.tripsCache && Date.now() - state.tripsLoadedAt < TRIP_LIST_CACHE_MS) { $("tripListContent").innerHTML = [...demos, ...state.tripsCache].map(tripListItemHtml).join("") || `<p class="hint">尚無旅程。</p>`; return; }
  try { const result = await apiList(), saved = (result.trips || []).map(item => ({ ...item, source: "saved" })); state.tripsCache = saved; state.tripsLoadedAt = Date.now(); $("tripListContent").innerHTML = [...demos, ...saved].map(tripListItemHtml).join("") || `<p class="hint">尚無旅程。</p>`; }
  catch (error) { toast(`旅程清單讀取失敗：${error.message}`); }
}
function loadDemoTrip(id) { const demo = (window.TRIP_DEMOS || []).find(item => item.id === id); if (!demo) return toast("找不到示範旅程"); if (state.dirty && !confirm("目前有未儲存變更，確定載入示範旅程？")) return; state.geocodeJobId++; state.tripId = ""; state.hasJourney = true; state.owner = "示範資料"; state.tripCanEdit = Boolean(state.user); state.data = normalizeTrip(structuredClone(demo.data)); state.data.trip.isPublic = true; state.dirty = Boolean(state.user); history.replaceState(null, "", location.pathname); $("tripPicker").open = false; $("dayFilter").value = "all"; renderAll(); setStatus(state.user ? "示範資料（可另存新旅程）" : "示範資料（訪客檢視）"); toast(state.user ? "已載入示範旅程；儲存後會建立你的副本" : "已載入示範旅程資料"); }
function resetJourneyState(message) {
  state.geocodeJobId++; state.tripId = ""; state.hasJourney = false; state.owner = ""; state.tripCanEdit = false; state.data = freshTrip(); state.dirty = false;
  history.replaceState(null, "", location.pathname); $("dayFilter").value = "all"; renderAll(); setStatus("尚未選擇旅程"); if (message) toast(message);
}
function clearTripView() {
  if (!state.hasJourney) return toast("目前畫面已是空白");
  if (state.dirty && !confirm("目前有未儲存變更，確定清空畫面？已上傳旅程不會被刪除。")) return;
  resetJourneyState("已清空畫面；已上傳旅程仍保留");
}
function updateSelectedTripInList() { document.querySelectorAll(".trip-list-item").forEach(item => item.classList.toggle("selected", item.dataset.tripSource === "saved" && item.dataset.tripId === state.tripId)); }
async function showTripList() { if (matchMedia("(max-width: 820px)").matches) setMobilePanel(true); $("tripPicker").open = true; await refreshTripList(); $("tripPicker").scrollIntoView({ behavior: "smooth", block: "start" }); updateSelectedTripInList(); }
function cancelDraft() {
  if (!state.hasJourney || state.tripId) return;
  if (!confirm(`確定放棄尚未儲存的旅程「${state.data.trip.title || "未命名旅程"}」？`)) return;
  resetJourneyState("已放棄未儲存的旅程草稿");
}
async function deleteTrip() {
  if (!state.tripId || !canEdit()) return toast("你沒有刪除此旅程的權限");
  const title = state.data.trip.title || "未命名旅程";
  if (!confirm(`確定永久刪除旅程「${title}」？此操作無法由網站復原。`)) return;
  $("deleteTripBtn").disabled = true; setStatus("刪除中…");
  try {
    await apiPost({ action: "delete", id: state.tripId, token: state.token });
    resetJourneyState("旅程已刪除"); await refreshTripList(true);
  } catch (error) { setStatus("刪除失敗"); toast(error.message); }
  finally { $("deleteTripBtn").disabled = false; renderMode(); }
}

function setMobilePanel(expanded) {
  document.body.classList.toggle("mobile-panel-collapsed", !expanded);
  $("mobilePanelToggleBtn").textContent = expanded ? "收合" : "展開";
  $("mobileListBtn").textContent = expanded ? "收合行程面板" : "展開行程面板";
  setTimeout(() => state.map?.invalidateSize(), 260);
}
function toggleMobilePanel() { setMobilePanel(document.body.classList.contains("mobile-panel-collapsed")); }
function setDesktopPanel(expanded, persist = true) {
  document.body.classList.toggle("desktop-panel-collapsed", !expanded);
  const button = $("desktopPanelToggleBtn");
  button.textContent = expanded ? "‹" : "›";
  button.setAttribute("aria-expanded", String(expanded));
  button.setAttribute("aria-label", expanded ? "收合行程面板" : "展開行程面板");
  button.title = expanded ? "收合行程面板" : "展開行程面板";
  if (persist) localStorage.setItem(DESKTOP_PANEL_KEY, expanded ? "0" : "1");
  setTimeout(() => state.map?.invalidateSize(), 260);
}
function toggleDesktopPanel() { setDesktopPanel(document.body.classList.contains("desktop-panel-collapsed")); }
function initResponsiveLayout() {
  const media = matchMedia("(max-width: 820px)");
  if (media.matches) { document.body.classList.remove("desktop-panel-collapsed"); setMobilePanel(false); }
  else setDesktopPanel(localStorage.getItem(DESKTOP_PANEL_KEY) !== "1", false);
  media.addEventListener?.("change", event => {
    if (event.matches) { document.body.classList.remove("desktop-panel-collapsed"); setMobilePanel(false); }
    else { document.body.classList.remove("mobile-panel-collapsed"); setDesktopPanel(localStorage.getItem(DESKTOP_PANEL_KEY) !== "1", false); }
  });
}

async function openUserAdmin() { if (!isAdmin()) return; resetUserForm(); $("userDialog").showModal(); await refreshUsers(); }
function resetUserForm() { $("userUsername").value = ""; $("userUsername").disabled = false; $("userRole").value = "user"; $("userPassword").value = ""; $("userActive").checked = true; $("userError").textContent = ""; }
async function refreshUsers() { $("userList").innerHTML = `<p class="hint">載入中…</p>`; try { const result = await apiPost({ action: "listUsers", token: state.token }); $("userList").innerHTML = result.users.map(user => `<button type="button" class="user-row" data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role)}" data-active="${user.active}"><span><strong>${escapeHtml(user.username)}</strong><small>${user.role === "admin" ? "管理員" : "使用者"}</small></span><span class="trip-list-tag ${user.active ? "editable" : ""}">${user.active ? "啟用" : "停用"}</span></button>`).join(""); } catch (error) { $("userError").textContent = error.message; } }
async function submitUser(event) { event.preventDefault(); $("userError").textContent = "儲存中…"; try { await apiPost({ action: "upsertUser", token: state.token, username: $("userUsername").value.trim(), password: $("userPassword").value, role: $("userRole").value, active: $("userActive").checked }); resetUserForm(); await refreshUsers(); toast("帳號已儲存"); } catch (error) { $("userError").textContent = error.message; } }
function selectUserRow(button) { $("userUsername").value = button.dataset.username; $("userUsername").disabled = true; $("userRole").value = button.dataset.role; $("userActive").checked = button.dataset.active === "true"; $("userPassword").value = ""; $("userError").textContent = "編輯模式：密碼留白表示不變更"; }

function bindEvents() {
  $("tripTitle").addEventListener("input", autoRender); $("saveBtn").addEventListener("click", saveTrip); $("tripSettingsBtn").addEventListener("click", openTripSettings); $("tripSettingsForm").addEventListener("submit", submitTripSettings); $("backToTripsBtn").addEventListener("click", showTripList); $("newTripBtn").addEventListener("click", openNewTripDialog); $("addItemBtn").addEventListener("click", () => openStopDialog());
  $("stopCategory").addEventListener("change", updateStopFormMode);
  $("stopOrigin").addEventListener("input", () => { $("stopOriginLat").value = ""; $("stopOriginLng").value = ""; });
  $("stopDestination").addEventListener("input", () => { $("stopLat").value = ""; $("stopLng").value = ""; });
  $("stopAddress").addEventListener("input", () => { $("stopLat").value = ""; $("stopLng").value = ""; });
  $("loginBtn").addEventListener("click", openLogin); $("accountBtn").addEventListener("click", logout); $("adminBtn").addEventListener("click", openUserAdmin); $("loginForm").addEventListener("submit", submitLogin); $("newTripForm").addEventListener("submit", createJourney); $("stopForm").addEventListener("submit", submitStop); $("userForm").addEventListener("submit", submitUser); $("resetUserFormBtn").addEventListener("click", resetUserForm);
  $("fileInput").addEventListener("change", e => e.target.files[0] && importFile(e.target.files[0])); $("exportBtn").addEventListener("click", exportJson); $("refreshTripsBtn").addEventListener("click", () => refreshTripList(true)); $("clearTripViewBtn").addEventListener("click", clearTripView);
  $("cancelDraftBtn").addEventListener("click", cancelDraft); $("deleteTripBtn").addEventListener("click", deleteTrip);
  $("tripPicker").addEventListener("toggle", () => { if ($("tripPicker").open) refreshTripList(); });
  $("tripListContent").addEventListener("click", e => { const item = e.target.closest("[data-trip-id]"); if (!item) return; item.dataset.tripSource === "demo" ? loadDemoTrip(item.dataset.tripId) : loadTripById(item.dataset.tripId); });
  $("userList").addEventListener("click", e => { const row = e.target.closest(".user-row"); if (row) selectUserRow(row); });
  $("dayFilter").addEventListener("change", refreshMap); $("routeBtn").addEventListener("click", drawRoute); $("navBtn").addEventListener("click", openGoogleNavigation);
  $("timeline").addEventListener("click", e => { const card = e.target.closest(".stop-card"); if (!card) return; const button = e.target.closest("button[data-action]"), id = card.dataset.id; if (!button) { if (!e.target.closest(".drag-handle") && !state.draggedStopId) focusStop(id); return; } if (button.dataset.action === "focus") focusStop(id); if (button.dataset.action === "edit") openStopDialog(state.data.stops.find(s => s.id === id)); if (button.dataset.action === "delete" && canEdit() && confirm("確定刪除此行程項目？")) { state.data.stops = state.data.stops.filter(s => s.id !== id); syncTripDates(); markDirty(); renderFilters(); renderTimeline(); refreshMap(); } });
  $("timeline").addEventListener("dragstart", e => { const card = e.target.closest(".stop-card"); if (!card || !canEdit()) return e.preventDefault(); state.draggedStopId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.id); });
  $("timeline").addEventListener("dragover", e => { if (!state.draggedStopId) return; const card = e.target.closest(".stop-card"); if (card) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.classList.add("drag-over"); } });
  $("timeline").addEventListener("dragleave", e => e.target.closest(".stop-card")?.classList.remove("drag-over"));
  $("timeline").addEventListener("drop", e => { const card = e.target.closest(".stop-card"); if (!card) return; e.preventDefault(); reorderStops(state.draggedStopId, card.dataset.id); state.draggedStopId = ""; });
  $("timeline").addEventListener("dragend", () => { state.draggedStopId = ""; document.querySelectorAll(".dragging,.drag-over").forEach(el => el.classList.remove("dragging", "drag-over")); });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText($(button.dataset.copy).value); toast("連結已複製"); }));
  $("mobileListBtn").addEventListener("click", toggleMobilePanel); $("mobilePanelToggleBtn").addEventListener("click", toggleMobilePanel); $("desktopPanelToggleBtn").addEventListener("click", toggleDesktopPanel);
  addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
}

bindEvents();
initResponsiveLayout();
await restoreSession();
await Promise.all([loadInitialTrip(), initMap(), refreshTripList()]);
