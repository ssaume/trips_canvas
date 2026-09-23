const CONFIG = window.TRIP_CONFIG || {};
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SESSION_KEY = "tripcanvas-session-v1";

const state = {
  tripId: params.get("trip") || "", hasJourney: Boolean(params.get("trip")), data: freshTrip(), dirty: false,
  token: localStorage.getItem(SESSION_KEY) || "", user: null, owner: "", tripCanEdit: false,
  map: null, markers: [], polylines: [], mapsReady: false, lastGeocodeAt: 0, draggedStopId: ""
};

function freshTrip() {
  const today = new Date().toISOString().slice(0, 10);
  return { schemaVersion: 4, trip: { title: "", startDate: today, endDate: today, description: "" }, stops: [] };
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
    schemaVersion: 4,
    trip: { title: String(trip.title || base.trip.title).slice(0, 120), startDate: String(trip.startDate || base.trip.startDate).slice(0, 10), endDate: String(trip.endDate || trip.startDate || base.trip.endDate).slice(0, 10), description: String(trip.description || "").slice(0, 2000) },
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
    renderAuth(); await refreshCurrentPermissions(); await refreshTripList();
    toast(result.defaultPasswordWarning ? "登入成功；請至帳號管理更換預設管理員密碼" : "登入成功");
  } catch (error) { $("loginError").textContent = error.message; }
  finally { $("confirmLoginBtn").disabled = false; }
}
async function logout() {
  if (state.dirty && !confirm("目前有未儲存變更，確定登出？")) return;
  state.token = ""; state.user = null; state.tripCanEdit = false; localStorage.removeItem(SESSION_KEY); renderAuth();
  if (state.tripId) await loadTripById(state.tripId, false); else renderAll();
  await refreshTripList(); toast("已登出，現在是訪客檢視模式");
}
async function refreshCurrentPermissions() { if (state.tripId) await loadTripById(state.tripId, false); else { state.tripCanEdit = Boolean(state.user); renderAll(); } }

async function loadTripById(id, updateUrl = true) {
  if (state.dirty && updateUrl && !confirm("目前有未儲存變更，確定切換旅程？")) return;
  setStatus("載入中…");
  try {
    const result = await apiGet(id);
    state.tripId = result.id; state.data = normalizeTrip(result.data); state.hasJourney = true; state.owner = result.owner || ""; state.tripCanEdit = Boolean(result.canEdit); state.dirty = false;
    if (updateUrl) history.replaceState(null, "", `${location.pathname}?trip=${encodeURIComponent(state.tripId)}`);
    $("dayFilter").value = "all"; setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`); renderAll();
  } catch (error) { setStatus("載入失敗"); toast(error.message); }
}
async function loadInitialTrip() { if (state.tripId) await loadTripById(state.tripId, false); else renderAll(); }

async function saveTrip() {
  if (!state.user) return openLogin();
  if (!state.hasJourney) return toast("請先新增或載入旅程");
  if (!canEdit()) return toast("你沒有編輯這個旅程的權限");
  syncMetaFromForm(); if (!state.data.trip.title.trim()) return toast("請輸入旅程名稱");
  const creating = !state.tripId; setStatus("儲存中…"); $("saveBtn").disabled = true;
  try {
    const result = await apiPost({ action: creating ? "create" : "save", id: state.tripId, token: state.token, data: state.data });
    state.tripId = result.id; state.owner = result.owner; state.tripCanEdit = true; state.dirty = false;
    history.replaceState(null, "", `${location.pathname}?trip=${encodeURIComponent(state.tripId)}`);
    setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`); renderAll(); await refreshTripList(); toast(creating ? "旅程已建立" : "旅程已儲存");
  } catch (error) { setStatus("儲存失敗"); toast(error.message); }
  finally { renderMode(); }
}

function markDirty() { state.dirty = true; setStatus("有未儲存變更"); }
const autoRender = debounce(() => { syncMetaFromForm(); renderTimeline(); refreshMap(); markDirty(); }, 250);
function syncMetaFromForm() { if (canEdit()) state.data.trip.title = $("tripTitle").value.trim() || "未命名旅程"; }
function syncFormFromState() {
  $("tripTitle").value = state.data.trip.title; $("viewTitle").textContent = state.data.trip.title || "尚未選擇旅程";
  $("viewDates").textContent = state.hasJourney ? [state.data.trip.startDate, state.data.trip.endDate].filter(Boolean).join(" — ") : "";
  $("tripOwner").textContent = state.hasJourney ? `建立者：${state.owner || (state.tripId ? "舊版資料／待管理員接管" : state.user?.username || "尚未儲存")}` : "";
}
function renderAll() { syncFormFromState(); renderMode(); renderFilters(); renderTimeline(); refreshMap(); }
function renderMode() {
  const editable = canEdit(); document.body.classList.toggle("read-only", !editable);
  $("addItemBtn").disabled = !editable; $("saveBtn").disabled = !editable; $("exportBtn").disabled = !state.hasJourney;
  $("tripTitle").disabled = !editable; $("shareBtn").disabled = !state.tripId;
  $("cancelDraftBtn").hidden = !(state.user && state.hasJourney && !state.tripId);
  $("deleteTripBtn").hidden = !(state.tripId && editable);
  $("mobileTripTitle").textContent = state.data.trip.title || "行程面板";
  $("emptyState").querySelector("p").textContent = state.user ? "請先新增旅程，再新增行程項目；也可以直接上傳旅程檔。" : "訪客可從上方『選擇旅程』檢視大家上傳的資料；登入後才能新增與編輯。";
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
    ${items.map(s => `<article class="stop-card" data-id="${escapeHtml(s.id)}" data-date="${escapeHtml(s.date)}" draggable="${canEdit()}" title="雙擊可在地圖上顯示">
      ${canEdit() ? `<div class="drag-handle" title="拖拉調整同日順序">⋮⋮</div>` : ""}<div class="stop-time">${escapeHtml(s.startTime || "—")}</div>
      <div class="stop-body"><h3>${escapeHtml(s.title)}</h3>${s.origin || s.destination ? `<p class="route-detail">${escapeHtml(s.origin || "—")} → ${escapeHtml(s.destination || "—")}</p>` : ""}<p>${escapeHtml(s.address)}</p>${s.cost ? `<p class="cost-detail">料金：${escapeHtml(s.cost)}</p>` : ""}${s.notes ? `<p>${escapeHtml(s.notes)}</p>` : ""}<span class="category">${escapeHtml(s.category)}</span>${s.transportMode ? `<span class="category">${escapeHtml(s.transportMode)}</span>` : ""}</div>
      <div class="stop-actions"><button class="small-btn" data-action="focus" title="在地圖顯示">⌖</button>${canEdit() ? `<button class="small-btn" data-action="edit" title="編輯">✎</button><button class="small-btn" data-action="delete" title="刪除">×</button>` : ""}</div>
    </article>`).join("")}</section>`).join("");
}

function openLogin() { $("loginError").textContent = ""; $("loginPassword").value = ""; $("loginDialog").showModal(); $("loginUsername").focus(); }
function openNewTripDialog() {
  if (!state.user) return openLogin();
  if (state.dirty && !confirm("目前有未儲存變更，確定建立新的旅程？")) return;
  const today = new Date().toISOString().slice(0, 10);
  $("newTripTitle").value = ""; $("newTripStartDate").value = today; $("newTripEndDate").value = today; $("newTripDescription").value = ""; $("newTripError").textContent = ""; $("newTripDialog").showModal();
}
function createJourney(event) {
  event.preventDefault(); const title = $("newTripTitle").value.trim(), startDate = $("newTripStartDate").value, endDate = $("newTripEndDate").value;
  if (!title || !startDate || !endDate) return $("newTripError").textContent = "請填寫旅程名稱與日期";
  if (endDate < startDate) return $("newTripError").textContent = "結束日期不可早於開始日期";
  state.tripId = ""; state.hasJourney = true; state.owner = state.user.username; state.tripCanEdit = true;
  state.data = normalizeTrip({ schemaVersion: 4, trip: { title, startDate, endDate, description: $("newTripDescription").value.trim() }, stops: [] }); state.dirty = true;
  history.replaceState(null, "", location.pathname); $("dayFilter").value = "all"; $("newTripDialog").close(); renderAll(); setStatus("新旅程（尚未儲存）"); toast("旅程已建立，現在可以新增行程項目");
}
function openStopDialog(stop = null) {
  if (!canEdit()) return state.user ? toast("你沒有編輯這個旅程的權限") : openLogin();
  $("dialogTitle").textContent = stop ? "編輯行程項目" : "新增行程項目"; $("stopId").value = stop?.id || ""; $("stopTitle").value = stop?.title || "";
  $("stopDate").value = stop?.date || state.data.trip.startDate || new Date().toISOString().slice(0, 10); $("stopTime").value = stop?.startTime || ""; $("stopEndTime").value = stop?.endTime || "";
  $("stopCategory").value = normalizeCategory(stop?.category); $("stopTransportMode").value = stop?.transportMode || ""; $("stopOrigin").value = stop?.origin || "";
  $("stopOriginLat").value = stop?.originLat ?? ""; $("stopOriginLng").value = stop?.originLng ?? ""; $("stopDestination").value = stop?.destination || ""; $("stopAddress").value = stop?.address || "";
  $("stopLat").value = stop?.lat ?? ""; $("stopLng").value = stop?.lng ?? ""; $("stopCost").value = stop?.cost || ""; $("stopNotes").value = stop?.notes || ""; $("formError").textContent = ""; $("stopDialog").showModal();
}
async function submitStop(event) {
  event.preventDefault(); if (!$("stopTitle").value.trim() || !$("stopDate").value || !$("stopAddress").value.trim()) return $("formError").textContent = "請填寫名稱、日期與地址";
  $("confirmStopBtn").disabled = true; $("formError").textContent = "正在定位地址…";
  try {
    let lat = finiteOrNull($("stopLat").value), lng = finiteOrNull($("stopLng").value); if (lat == null || lng == null) ({ lat, lng } = await geocode($("stopAddress").value.trim()));
    const existing = state.data.stops.find(s => s.id === $("stopId").value), sameDayCount = state.data.stops.filter(s => s.date === $("stopDate").value && s.id !== existing?.id).length;
    const stop = { id: existing?.id || uid(), date: $("stopDate").value, startTime: $("stopTime").value, endTime: $("stopEndTime").value, order: existing?.date === $("stopDate").value ? existing.order : sameDayCount, title: $("stopTitle").value.trim(), address: $("stopAddress").value.trim(), lat, lng, category: $("stopCategory").value, transportMode: $("stopTransportMode").value, origin: $("stopOrigin").value.trim(), originLat: finiteOrNull($("stopOriginLat").value), originLng: finiteOrNull($("stopOriginLng").value), destination: $("stopDestination").value.trim(), cost: $("stopCost").value.trim(), notes: $("stopNotes").value.trim() };
    const prospective = sortStops([...state.data.stops.filter(item => item.id !== stop.id), stop]);
    if (prospective[0]?.id === stop.id && stop.category === "移動" && stop.transportMode === "飛機" && stop.origin && (stop.originLat == null || stop.originLng == null)) { $("formError").textContent = "正在定位首筆飛機行程的起點機場…"; ({ lat: stop.originLat, lng: stop.originLng } = await geocode(stop.origin)); }
    const index = state.data.stops.findIndex(s => s.id === stop.id); if (index >= 0) state.data.stops[index] = stop; else state.data.stops.push(stop);
    syncTripDates(); $("stopDialog").close(); markDirty(); renderFilters(); renderTimeline(); refreshMap();
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

async function geocode(address) {
  const wait = Math.max(0, 1100 - (Date.now() - state.lastGeocodeAt)); if (wait) await new Promise(resolve => setTimeout(resolve, wait)); state.lastGeocodeAt = Date.now();
  const url = new URL(CONFIG.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search"); url.searchParams.set("q", address); url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("accept-language", "zh-TW,ja,en");
  const response = await fetch(url, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(`地址服務暫時無法使用（${response.status}）`);
  const results = await response.json(); if (!results?.length) throw new Error("找不到地址"); return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
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
function uniqueLocatedStops(includeMovements = false) {
  const source = visibleStops().filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (includeMovements || s.category !== "移動"));
  return source.filter((stop, index) => index === 0 || Math.abs(stop.lat - source[index - 1].lat) > .00001 || Math.abs(stop.lng - source[index - 1].lng) > .00001);
}
function firstFlightOrigin() { const first = sortStops()[0]; if (!first || first.category !== "移動" || first.transportMode !== "飛機" || !Number.isFinite(first.originLat) || !Number.isFinite(first.originLng)) return null; const day = $("dayFilter").value; return day === "all" || first.date === day ? first : null; }
function clearMapObjects() { state.markers.forEach(m => m.remove()); state.markers = []; state.polylines.forEach(p => p.remove()); state.polylines = []; }
function refreshMap() {
  if (!state.mapsReady) return; clearMapObjects(); let stops = uniqueLocatedStops(false); if (!stops.length) stops = uniqueLocatedStops(true); const zero = firstFlightOrigin(); if (!stops.length && !zero) return;
  const bounds = L.latLngBounds();
  if (zero) { const icon = L.divIcon({ className: "trip-number-icon", html: `<div class="pin pin-zero"><span>0</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -35] }); const marker = L.marker([zero.originLat, zero.originLng], { title: zero.origin, icon }).addTo(state.map); marker.bindPopup(`<h3>旅程起點｜${escapeHtml(zero.origin)}</h3><p>${escapeHtml(zero.date)} ${escapeHtml(zero.startTime)}・飛機</p>`); marker.stopId = `${zero.id}:origin`; state.markers.push(marker); bounds.extend(marker.getLatLng()); }
  stops.forEach((stop, index) => { const icon = L.divIcon({ className: "trip-number-icon", html: `<div class="pin"><span>${index + 1}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -35] }); const marker = L.marker([stop.lat, stop.lng], { title: stop.title, icon }).addTo(state.map); marker.bindPopup(`<h3>${escapeHtml(stop.title)}</h3><p>${escapeHtml(stop.date)} ${escapeHtml(stop.startTime)}・${escapeHtml(stop.category)}</p>${stop.origin || stop.destination ? `<p>${escapeHtml(stop.origin || "—")} → ${escapeHtml(stop.destination || "—")}</p>` : ""}<p>${escapeHtml(stop.address)}</p>`); marker.stopId = stop.id; state.markers.push(marker); bounds.extend(marker.getLatLng()); });
  const count = stops.length + (zero ? 1 : 0); if (count === 1) state.map.setView(zero ? [zero.originLat, zero.originLng] : [stops[0].lat, stops[0].lng], 14); else state.map.fitBounds(bounds, { padding: [55, 55] });
}
function drawRoute() { if (!state.mapsReady) return toast("地圖尚未載入"); let stops = uniqueLocatedStops(false); if (!stops.length) stops = uniqueLocatedStops(true); const zero = firstFlightOrigin(), points = [...(zero ? [{ lat: zero.originLat, lng: zero.originLng }] : []), ...stops]; if (points.length < 2) return toast("此日期至少需要兩個已定位地點"); state.polylines.forEach(p => p.remove()); state.polylines = []; const line = L.polyline(points.map(s => [s.lat, s.lng]), { color: "#e76845", opacity: .9, weight: 5, dashArray: "10 8" }).addTo(state.map); state.polylines.push(line); state.map.fitBounds(line.getBounds(), { padding: [55, 55] }); toast("已依行程順序連線；實際道路請使用 Google Maps 導航"); }
function openGoogleNavigation() { const candidates = visibleStops().filter(s => s.category !== "移動" && ((Number.isFinite(s.lat) && Number.isFinite(s.lng)) || s.address)); const allStops = candidates.filter((stop, index) => index === 0 || stop.address !== candidates[index - 1].address); if (allStops.length < 2) return toast("至少需要兩個有地址或座標的地點"); const stops = allStops.slice(0, 10), locationOf = stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) ? `${stop.lat},${stop.lng}` : stop.address, url = new URL("https://www.google.com/maps/dir/"); url.searchParams.set("api", "1"); url.searchParams.set("origin", locationOf(stops[0])); url.searchParams.set("destination", locationOf(stops.at(-1))); if (stops.length > 2) url.searchParams.set("waypoints", stops.slice(1, -1).map(locationOf).join("|")); url.searchParams.set("travelmode", "driving"); window.open(url.toString(), "_blank", "noopener,noreferrer"); if (allStops.length > 10) toast("Google Maps 單次先帶入前 10 個地點"); }
function focusStop(id) { if (!state.mapsReady) return toast("地圖尚未載入"); const marker = state.markers.find(m => m.stopId === id), stop = state.data.stops.find(s => s.id === id); if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return toast("此項目尚未完成定位"); const zeroMarker = state.markers.find(m => m.stopId === `${id}:origin`); if (zeroMarker) { state.map.fitBounds(L.latLngBounds([zeroMarker.getLatLng(), [stop.lat, stop.lng]]), { padding: [70, 70] }); zeroMarker.openPopup(); return; } if (!marker) { state.map.setView([stop.lat, stop.lng], 15); return toast("已定位移動項目的目的地"); } state.map.setView(marker.getLatLng(), 15); marker.openPopup(); }

function parseCsv(text) { const rows = []; let row = [], cell = "", quoted = false; for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; } else if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { row.push(cell); cell = ""; } else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && next === "\n") i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; } else cell += ch; } row.push(cell); if (row.some(v => v.trim())) rows.push(row); if (rows.length < 2) throw new Error("CSV 沒有資料"); const headers = rows[0].map(h => h.trim().toLowerCase()); return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() || ""]))); }
function pickField(row, ...names) { for (const name of names) if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") return row[name]; return ""; }
function excelDate(value) { if (value instanceof Date) return value.toISOString().slice(0, 10); if (typeof value === "number" && value >= 1) return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10); const match = String(value || "").trim().replace(/[./]/g, "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : ""; }
function excelTime(value) { if (value === "" || value == null) return ""; if (typeof value === "number") { const minutes = Math.round((value % 1) * 1440) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; } if (value instanceof Date) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; const match = String(value).trim().match(/(\d{1,2}):(\d{2})/); return match ? `${match[1].padStart(2, "0")}:${match[2]}` : ""; }
function inferCategory(type, title, origin, destination) { if (String(type || "").trim()) return normalizeCategory(type); const text = `${title} ${origin} ${destination}`; if (origin || destination || /自駕|開車|飛機|航班|CI\d+|JR|新幹線|特急|電車|市電|巴士|バス|Taxi|計程車|步行|接送|入境|到着|取車|還車/i.test(text)) return "移動"; if (/午餐|晚餐|早餐|用餐|餐廳|市場|食事|弁当|咖啡|拉麵|飯|料理/i.test(text)) return "食事"; if (/飯店|旅館|ホテル|宿|休息|休憩|入住|Check.?in/i.test(text)) return "休憩"; return "觀光"; }
function inferTransportMode(title) { const text = String(title || ""); if (/自駕|開車|取車|還車/.test(text)) return "自駕"; if (/CI\d+|飛機|航班/.test(text)) return "飛機"; if (/JR|新幹線|特急|鉄道|鐵路/.test(text)) return "鐵路"; if (/市電/.test(text)) return "市電"; if (/巴士|バス|接送/.test(text)) return "巴士"; if (/Taxi|計程車/i.test(text)) return "計程車"; if (/步行/.test(text)) return "步行"; return ""; }
function referenceRowsToTrip(rows, filename) { const stops = rows.map((row, index) => { const title = String(pickField(row, "項目", "item", "title", "地點名稱", "名稱") || "").trim(), origin = String(pickField(row, "起", "origin", "from", "起點") || "").trim(), destination = String(pickField(row, "迄", "destination", "to", "迄點") || "").trim(), type = pickField(row, "類型", "类型", "type", "category"); return { id: uid(), order: index, date: excelDate(pickField(row, "日期", "date")), startTime: excelTime(pickField(row, "啟程時間", "启程时间", "startTime", "starttime", "time", "開始時間")), endTime: excelTime(pickField(row, "到達時間", "到达时间", "endTime", "endtime", "結束時間")), title: title || destination || origin || "未命名項目", origin, destination, address: String(pickField(row, "地址", "address") || destination || origin || title).trim(), lat: finiteOrNull(pickField(row, "緯度", "lat", "latitude")), lng: finiteOrNull(pickField(row, "經度", "lng", "longitude")), originLat: finiteOrNull(pickField(row, "起點緯度", "originLat", "originlat")), originLng: finiteOrNull(pickField(row, "起點經度", "originLng", "originlng")), category: inferCategory(type, title, origin, destination), transportMode: String(pickField(row, "移動方式", "transportMode", "transportmode") || inferTransportMode(title)), cost: String(pickField(row, "料金", "費用", "cost", "fee") || "").trim(), notes: String(pickField(row, "備註", "notes", "note") || "").trim() }; }).filter(stop => stop.date || stop.title !== "未命名項目"); const dates = stops.map(s => s.date).filter(Boolean).sort(); return normalizeTrip({ schemaVersion: 4, trip: { title: filename.replace(/\.(xlsx?|csv)$/i, ""), startDate: dates[0], endDate: dates.at(-1), description: "由旅程檔案匯入" }, stops }); }
async function importExcel(file) { if (!window.XLSX) throw new Error("Excel 解析元件尚未載入"); const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false }), firstSheet = workbook.Sheets[workbook.SheetNames[0]]; if (!firstSheet) throw new Error("Excel 沒有工作表"); const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: true }); if (!rows.length) throw new Error("Excel 沒有旅程資料"); return referenceRowsToTrip(rows, file.name); }
async function importFile(file) { if (!state.user) return openLogin(); try { const lower = file.name.toLowerCase(); if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) state.data = await importExcel(file); else if (lower.endsWith(".json")) state.data = normalizeTrip(JSON.parse(await file.text())); else state.data = referenceRowsToTrip(parseCsv(await file.text()), file.name); state.tripId = ""; state.hasJourney = true; state.owner = state.user.username; state.tripCanEdit = true; history.replaceState(null, "", location.pathname); renderAll(); markDirty(); toast(`已匯入 ${state.data.stops.length} 個行程項目`); } catch (error) { toast(`匯入失敗：${error.message}`); } finally { $("fileInput").value = ""; } }
function exportJson() { if (!state.hasJourney) return toast("目前沒有可匯出的旅程"); syncMetaFromForm(); const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.data.trip.title || "trip"}.json`; a.click(); URL.revokeObjectURL(a.href); }

function formatDay(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date; return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function formatTimestamp(value) { if (!value) return ""; return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function openShare() { if (!state.tripId) return toast("請先儲存旅程，再建立分享連結"); $("viewLink").value = `${location.origin}${location.pathname}?trip=${encodeURIComponent(state.tripId)}`; $("shareDialog").showModal(); }

function tripListItemHtml(item) {
  const isDemo = item.source === "demo", permission = isDemo ? "示範" : item.canEdit ? "可編輯" : "檢視";
  return `<button class="trip-list-item" type="button" data-trip-source="${isDemo ? "demo" : "saved"}" data-trip-id="${escapeHtml(item.id)}"><span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml([item.startDate, item.endDate].filter(Boolean).join(" — "))}</p><p>${escapeHtml(`${item.stopCount || 0} 個項目${item.owner ? `・${item.owner}` : ""}${item.updatedAt ? `・更新 ${formatTimestamp(item.updatedAt)}` : ""}`)}</p></span><span class="trip-list-tag ${isDemo ? "demo" : item.canEdit ? "editable" : ""}">${permission}</span></button>`;
}
async function refreshTripList() {
  const demos = (window.TRIP_DEMOS || []).map(demo => ({ source: "demo", id: demo.id, title: demo.data.trip.title, startDate: demo.data.trip.startDate, endDate: demo.data.trip.endDate, stopCount: demo.data.stops.length }));
  $("tripListContent").innerHTML = demos.map(tripListItemHtml).join("") || `<p class="hint">目前沒有示範旅程。</p>`;
  if (!isConfigured(CONFIG.GAS_URL)) return;
  try { const result = await apiList(), saved = (result.trips || []).map(item => ({ ...item, source: "saved" })); $("tripListContent").innerHTML = [...demos, ...saved].map(tripListItemHtml).join("") || `<p class="hint">尚無旅程。</p>`; }
  catch (error) { toast(`旅程清單讀取失敗：${error.message}`); }
}
function loadDemoTrip(id) { const demo = (window.TRIP_DEMOS || []).find(item => item.id === id); if (!demo) return toast("找不到示範旅程"); if (state.dirty && !confirm("目前有未儲存變更，確定載入示範旅程？")) return; state.tripId = ""; state.hasJourney = true; state.owner = "示範資料"; state.tripCanEdit = Boolean(state.user); state.data = normalizeTrip(structuredClone(demo.data)); state.dirty = Boolean(state.user); history.replaceState(null, "", location.pathname); $("dayFilter").value = "all"; renderAll(); setStatus(state.user ? "示範資料（可另存新旅程）" : "示範資料（訪客檢視）"); toast(state.user ? "已載入示範旅程；儲存後會建立你的副本" : "已載入示範旅程資料"); }
function resetJourneyState(message) {
  state.tripId = ""; state.hasJourney = false; state.owner = ""; state.tripCanEdit = false; state.data = freshTrip(); state.dirty = false;
  history.replaceState(null, "", location.pathname); $("dayFilter").value = "all"; renderAll(); setStatus("尚未選擇旅程"); if (message) toast(message);
}
function clearTripView() {
  if (!state.hasJourney) return toast("目前畫面已是空白");
  if (state.dirty && !confirm("目前有未儲存變更，確定清空畫面？已上傳旅程不會被刪除。")) return;
  resetJourneyState("已清空畫面；已上傳旅程仍保留");
}
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
    resetJourneyState("旅程已刪除"); await refreshTripList();
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
function initResponsiveLayout() {
  const media = matchMedia("(max-width: 820px)");
  if (media.matches) setMobilePanel(false);
  media.addEventListener?.("change", event => {
    if (event.matches) setMobilePanel(false);
    else { document.body.classList.remove("mobile-panel-collapsed"); setTimeout(() => state.map?.invalidateSize(), 260); }
  });
}

async function openUserAdmin() { if (!isAdmin()) return; resetUserForm(); $("userDialog").showModal(); await refreshUsers(); }
function resetUserForm() { $("userUsername").value = ""; $("userUsername").disabled = false; $("userRole").value = "user"; $("userPassword").value = ""; $("userActive").checked = true; $("userError").textContent = ""; }
async function refreshUsers() { $("userList").innerHTML = `<p class="hint">載入中…</p>`; try { const result = await apiPost({ action: "listUsers", token: state.token }); $("userList").innerHTML = result.users.map(user => `<button type="button" class="user-row" data-username="${escapeHtml(user.username)}" data-role="${escapeHtml(user.role)}" data-active="${user.active}"><span><strong>${escapeHtml(user.username)}</strong><small>${user.role === "admin" ? "管理員" : "使用者"}</small></span><span class="trip-list-tag ${user.active ? "editable" : ""}">${user.active ? "啟用" : "停用"}</span></button>`).join(""); } catch (error) { $("userError").textContent = error.message; } }
async function submitUser(event) { event.preventDefault(); $("userError").textContent = "儲存中…"; try { await apiPost({ action: "upsertUser", token: state.token, username: $("userUsername").value.trim(), password: $("userPassword").value, role: $("userRole").value, active: $("userActive").checked }); resetUserForm(); await refreshUsers(); toast("帳號已儲存"); } catch (error) { $("userError").textContent = error.message; } }
function selectUserRow(button) { $("userUsername").value = button.dataset.username; $("userUsername").disabled = true; $("userRole").value = button.dataset.role; $("userActive").checked = button.dataset.active === "true"; $("userPassword").value = ""; $("userError").textContent = "編輯模式：密碼留白表示不變更"; }

function bindEvents() {
  $("tripTitle").addEventListener("input", autoRender); $("saveBtn").addEventListener("click", saveTrip); $("shareBtn").addEventListener("click", openShare); $("newTripBtn").addEventListener("click", openNewTripDialog); $("addItemBtn").addEventListener("click", () => openStopDialog());
  $("loginBtn").addEventListener("click", openLogin); $("accountBtn").addEventListener("click", logout); $("adminBtn").addEventListener("click", openUserAdmin); $("loginForm").addEventListener("submit", submitLogin); $("newTripForm").addEventListener("submit", createJourney); $("stopForm").addEventListener("submit", submitStop); $("userForm").addEventListener("submit", submitUser); $("resetUserFormBtn").addEventListener("click", resetUserForm);
  $("fileInput").addEventListener("change", e => e.target.files[0] && importFile(e.target.files[0])); $("exportBtn").addEventListener("click", exportJson); $("refreshTripsBtn").addEventListener("click", refreshTripList); $("clearTripViewBtn").addEventListener("click", clearTripView);
  $("cancelDraftBtn").addEventListener("click", cancelDraft); $("deleteTripBtn").addEventListener("click", deleteTrip);
  $("tripPicker").addEventListener("toggle", () => { if ($("tripPicker").open) refreshTripList(); });
  $("tripListContent").addEventListener("click", e => { const item = e.target.closest("[data-trip-id]"); if (!item) return; item.dataset.tripSource === "demo" ? loadDemoTrip(item.dataset.tripId) : loadTripById(item.dataset.tripId); });
  $("userList").addEventListener("click", e => { const row = e.target.closest(".user-row"); if (row) selectUserRow(row); });
  $("dayFilter").addEventListener("change", refreshMap); $("routeBtn").addEventListener("click", drawRoute); $("navBtn").addEventListener("click", openGoogleNavigation);
  $("timeline").addEventListener("click", e => { const button = e.target.closest("button[data-action]"); if (!button) return; const id = button.closest(".stop-card").dataset.id; if (button.dataset.action === "focus") focusStop(id); if (button.dataset.action === "edit") openStopDialog(state.data.stops.find(s => s.id === id)); if (button.dataset.action === "delete" && canEdit() && confirm("確定刪除此行程項目？")) { state.data.stops = state.data.stops.filter(s => s.id !== id); syncTripDates(); markDirty(); renderFilters(); renderTimeline(); refreshMap(); } });
  $("timeline").addEventListener("dblclick", e => { if (e.target.closest("button")) return; const card = e.target.closest(".stop-card"); if (card) focusStop(card.dataset.id); });
  $("timeline").addEventListener("dragstart", e => { const card = e.target.closest(".stop-card"); if (!card || !canEdit()) return e.preventDefault(); state.draggedStopId = card.dataset.id; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.dataset.id); });
  $("timeline").addEventListener("dragover", e => { if (!state.draggedStopId) return; const card = e.target.closest(".stop-card"); if (card) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.classList.add("drag-over"); } });
  $("timeline").addEventListener("dragleave", e => e.target.closest(".stop-card")?.classList.remove("drag-over"));
  $("timeline").addEventListener("drop", e => { const card = e.target.closest(".stop-card"); if (!card) return; e.preventDefault(); reorderStops(state.draggedStopId, card.dataset.id); state.draggedStopId = ""; });
  $("timeline").addEventListener("dragend", () => { state.draggedStopId = ""; document.querySelectorAll(".dragging,.drag-over").forEach(el => el.classList.remove("dragging", "drag-over")); });
  document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => $(button.dataset.close).close()));
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText($(button.dataset.copy).value); toast("連結已複製"); }));
  $("mobileListBtn").addEventListener("click", toggleMobilePanel); $("mobilePanelToggleBtn").addEventListener("click", toggleMobilePanel);
  addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
}

bindEvents();
initResponsiveLayout();
await restoreSession();
await Promise.all([loadInitialTrip(), initMap(), refreshTripList()]);
