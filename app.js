const CONFIG = window.TRIP_CONFIG || {};
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const state = {
  tripId: params.get("trip") || "",
  editKey: decodeURIComponent((location.hash.match(/(?:^#|&)edit=([^&]+)/) || [])[1] || ""),
  data: freshTrip(),
  dirty: false,
  map: null,
  markers: [],
  polylines: [],
  mapsReady: false,
  lastGeocodeAt: 0
};

function freshTrip() {
  const today = new Date().toISOString().slice(0, 10);
  return { schemaVersion: 1, trip: { title: "我的新行程", startDate: today, endDate: today, description: "" }, stops: [] };
}

function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 30);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
function debounce(fn, wait = 450) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2400); }
function setStatus(text) { $("syncStatus").textContent = text; }
function isConfigured(value) { return value && !String(value).startsWith("PASTE_"); }
function canEdit() { return !state.tripId || Boolean(state.editKey); }

function normalizeTrip(input) {
  if (!input || typeof input !== "object") throw new Error("行程檔格式不正確");
  const base = freshTrip();
  const trip = input.trip || input;
  const stops = Array.isArray(input.stops) ? input.stops : [];
  return {
    schemaVersion: 1,
    trip: {
      title: String(trip.title || base.trip.title).slice(0, 120),
      startDate: String(trip.startDate || base.trip.startDate).slice(0, 10),
      endDate: String(trip.endDate || trip.startDate || base.trip.endDate).slice(0, 10),
      description: String(trip.description || "").slice(0, 2000)
    },
    stops: stops.slice(0, 500).map((s, index) => ({
      id: String(s.id || uid()),
      date: String(s.date || trip.startDate || base.trip.startDate).slice(0, 10),
      startTime: String(s.startTime || s.time || "").slice(0, 5),
      endTime: String(s.endTime || "").slice(0, 5),
      title: String(s.title || s.name || `地點 ${index + 1}`).slice(0, 100),
      address: String(s.address || "").slice(0, 300),
      lat: finiteOrNull(s.lat ?? s.latitude),
      lng: finiteOrNull(s.lng ?? s.longitude),
      category: String(s.category || "景點").slice(0, 30),
      notes: String(s.notes || s.note || "").slice(0, 1000)
    }))
  };
}
function finiteOrNull(value) { const n = Number(value); return value !== "" && value != null && Number.isFinite(n) ? n : null; }

function sortStops(stops = state.data.stops) {
  return [...stops].sort((a, b) => `${a.date} ${a.startTime || "99:99"}`.localeCompare(`${b.date} ${b.startTime || "99:99"}`));
}

async function apiGet(id) {
  if (!isConfigured(CONFIG.GAS_URL)) throw new Error("尚未設定 GAS_URL");
  return new Promise((resolve, reject) => {
    const callback = `tripJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => cleanup(new Error("讀取逾時")), 15000);
    function cleanup(error, result) { clearTimeout(timer); delete window[callback]; script.remove(); error ? reject(error) : resolve(result); }
    window[callback] = result => result?.ok ? cleanup(null, result) : cleanup(new Error(result?.error || "讀取失敗"));
    script.onerror = () => cleanup(new Error("無法連線至 GAS"));
    script.src = `${CONFIG.GAS_URL}?action=get&id=${encodeURIComponent(id)}&callback=${callback}`;
    document.head.appendChild(script);
  });
}

async function apiPost(payload) {
  if (!isConfigured(CONFIG.GAS_URL)) throw new Error("尚未設定 GAS_URL");
  const response = await fetch(CONFIG.GAS_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "儲存失敗");
  return result;
}

async function loadTrip() {
  if (!state.tripId) return renderAll();
  setStatus("載入中…");
  try {
    const result = await apiGet(state.tripId);
    state.data = normalizeTrip(result.data);
    state.editKey ||= localStorage.getItem(`trip-edit-${state.tripId}`) || "";
    setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`);
  } catch (error) {
    setStatus("載入失敗");
    toast(error.message);
  }
  renderAll();
}

async function saveTrip() {
  syncMetaFromForm();
  if (!state.data.trip.title.trim()) return toast("請輸入行程名稱");
  const creating = !state.tripId;
  if (creating && !state.editKey) state.editKey = randomKey();
  setStatus("儲存中…");
  $("saveBtn").disabled = true;
  try {
    const result = await apiPost({ action: creating ? "create" : "save", id: state.tripId, editKey: state.editKey, createSecret: CONFIG.CREATE_SECRET || "", data: state.data });
    state.tripId = result.id;
    localStorage.setItem(`trip-edit-${state.tripId}`, state.editKey);
    const newUrl = `${location.pathname}?trip=${encodeURIComponent(state.tripId)}#edit=${encodeURIComponent(state.editKey)}`;
    history.replaceState(null, "", newUrl);
    state.dirty = false;
    setStatus(`已同步 ${formatTimestamp(result.updatedAt)}`);
    renderMode();
    toast(creating ? "行程已建立，可跨裝置分享" : "行程已儲存");
  } catch (error) {
    setStatus("儲存失敗");
    toast(error.message);
  } finally { $("saveBtn").disabled = false; }
}

function markDirty() { state.dirty = true; setStatus("有未儲存變更"); }
const autoRender = debounce(() => { syncMetaFromForm(); renderTimeline(); refreshMap(); markDirty(); }, 250);

function syncMetaFromForm() {
  state.data.trip.title = $("tripTitle").value.trim() || "未命名行程";
  state.data.trip.startDate = $("startDate").value;
  state.data.trip.endDate = $("endDate").value || $("startDate").value;
}
function syncFormFromState() {
  $("tripTitle").value = state.data.trip.title;
  $("startDate").value = state.data.trip.startDate;
  $("endDate").value = state.data.trip.endDate;
  $("viewTitle").textContent = state.data.trip.title;
  $("viewDates").textContent = [state.data.trip.startDate, state.data.trip.endDate].filter(Boolean).join(" — ");
}

function renderAll() { syncFormFromState(); renderMode(); renderFilters(); renderTimeline(); refreshMap(); }
function renderMode() { document.body.classList.toggle("view-mode", !canEdit()); }

function renderFilters() {
  const current = $("dayFilter").value;
  const dates = [...new Set(sortStops().map(s => s.date).filter(Boolean))];
  $("dayFilter").innerHTML = `<option value="all">全部日期</option>${dates.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(formatDay(d))}</option>`).join("")}`;
  if (["all", ...dates].includes(current)) $("dayFilter").value = current;
}

function renderTimeline() {
  const timeline = $("timeline");
  const stops = sortStops();
  $("emptyState").hidden = stops.length > 0;
  timeline.hidden = stops.length === 0;
  const groups = Object.groupBy ? Object.groupBy(stops, s => s.date || "未指定日期") : stops.reduce((g, s) => ((g[s.date || "未指定日期"] ||= []).push(s), g), {});
  timeline.innerHTML = Object.entries(groups).map(([date, items]) => `
    <section class="day-group"><div class="day-heading"><strong>${escapeHtml(formatDay(date))}</strong><span>${items.length} 個地點</span></div>
    ${items.map((s, index) => `<article class="stop-card" data-id="${escapeHtml(s.id)}">
      <div class="stop-time">${escapeHtml(s.startTime || "—")}</div>
      <div class="stop-body"><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.address)}</p>${s.notes ? `<p>${escapeHtml(s.notes)}</p>` : ""}<span class="category">${escapeHtml(s.category)}</span></div>
      <div class="stop-actions">
        <button class="small-btn" data-action="focus" title="在地圖顯示">⌖</button>
        ${canEdit() ? `<button class="small-btn" data-action="edit" title="編輯">✎</button><button class="small-btn" data-action="delete" title="刪除">×</button>` : ""}
      </div></article>`).join("")}</section>`).join("");
}

function openStopDialog(stop = null) {
  $("dialogTitle").textContent = stop ? "編輯地點" : "新增地點";
  $("stopId").value = stop?.id || "";
  $("stopTitle").value = stop?.title || "";
  $("stopDate").value = stop?.date || state.data.trip.startDate || new Date().toISOString().slice(0, 10);
  $("stopTime").value = stop?.startTime || "";
  $("stopEndTime").value = stop?.endTime || "";
  $("stopCategory").value = stop?.category || "景點";
  $("stopAddress").value = stop?.address || "";
  $("stopLat").value = stop?.lat ?? "";
  $("stopLng").value = stop?.lng ?? "";
  $("stopNotes").value = stop?.notes || "";
  $("formError").textContent = "";
  $("stopDialog").showModal();
}

async function submitStop(event) {
  event.preventDefault();
  if (!$("stopTitle").value.trim() || !$("stopDate").value || !$("stopAddress").value.trim()) return $("formError").textContent = "請填寫名稱、日期與地址";
  $("confirmStopBtn").disabled = true;
  $("formError").textContent = "正在定位地址…";
  try {
    let lat = finiteOrNull($("stopLat").value), lng = finiteOrNull($("stopLng").value);
    if (lat == null || lng == null) ({ lat, lng } = await geocode($("stopAddress").value.trim()));
    const stop = { id: $("stopId").value || uid(), date: $("stopDate").value, startTime: $("stopTime").value, endTime: $("stopEndTime").value, title: $("stopTitle").value.trim(), address: $("stopAddress").value.trim(), lat, lng, category: $("stopCategory").value, notes: $("stopNotes").value.trim() };
    const index = state.data.stops.findIndex(s => s.id === stop.id);
    if (index >= 0) state.data.stops[index] = stop; else state.data.stops.push(stop);
    $("stopDialog").close();
    markDirty(); renderFilters(); renderTimeline(); refreshMap();
  } catch (error) { $("formError").textContent = `定位失敗：${error.message}。可手動填入緯度、經度。`; }
  finally { $("confirmStopBtn").disabled = false; }
}

async function geocode(address) {
  const wait = Math.max(0, 1100 - (Date.now() - state.lastGeocodeAt));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  state.lastGeocodeAt = Date.now();
  const endpoint = CONFIG.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
  const url = new URL(endpoint);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "zh-TW,ja,en");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`地址服務暫時無法使用（${response.status}）`);
  const results = await response.json();
  if (!results?.length) throw new Error("找不到地址");
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

function initMap() {
  try {
    if (!window.L) throw new Error("Leaflet 程式庫載入失敗");
    const center = CONFIG.DEFAULT_CENTER || { lat: 23.6978, lng: 120.9605 };
    state.map = L.map("map", { zoomControl: true }).setView([center.lat, center.lng], CONFIG.DEFAULT_ZOOM || 7);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    state.mapsReady = true;
    $("mapNotice").hidden = true; refreshMap();
  } catch (error) { $("mapNotice").textContent = `地圖載入失敗：${error.message}`; }
}

function visibleStops() { const day = $("dayFilter").value; return sortStops().filter(s => day === "all" || s.date === day); }
function clearMapObjects() { state.markers.forEach(m => m.remove()); state.markers = []; state.polylines.forEach(p => p.remove()); state.polylines = []; }
function refreshMap() {
  if (!state.mapsReady) return;
  clearMapObjects();
  const stops = visibleStops().filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!stops.length) return;
  const bounds = L.latLngBounds();
  stops.forEach((stop, index) => {
    const icon = L.divIcon({ className: "trip-number-icon", html: `<div class="pin"><span>${index + 1}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -35] });
    const marker = L.marker([stop.lat, stop.lng], { title: stop.title, icon }).addTo(state.map);
    marker.bindPopup(`<h3>${escapeHtml(stop.title)}</h3><p>${escapeHtml(stop.date)} ${escapeHtml(stop.startTime)}</p><p>${escapeHtml(stop.address)}</p>`);
    marker.stopId = stop.id; state.markers.push(marker); bounds.extend(marker.getLatLng());
  });
  if (stops.length === 1) state.map.setView([stops[0].lat, stops[0].lng], 14); else state.map.fitBounds(bounds, { padding: [55, 55] });
}

function drawRoute() {
  if (!state.mapsReady) return toast("地圖尚未載入");
  const stops = visibleStops().filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (stops.length < 2) return toast("此篩選至少需要兩個已定位地點");
  state.polylines.forEach(p => p.remove()); state.polylines = [];
  const line = L.polyline(stops.map(s => [s.lat, s.lng]), { color: "#e76845", opacity: .9, weight: 5, dashArray: "10 8" }).addTo(state.map);
  state.polylines.push(line); state.map.fitBounds(line.getBounds(), { padding: [55, 55] });
  toast("已依行程順序連線；實際道路請使用 Google Maps 導航");
}

function openGoogleNavigation() {
  const allStops = visibleStops().filter(s => (Number.isFinite(s.lat) && Number.isFinite(s.lng)) || s.address);
  if (allStops.length < 2) return toast("至少需要兩個有地址或座標的地點");
  const stops = allStops.slice(0, 10);
  const location = stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lng) ? `${stop.lat},${stop.lng}` : stop.address;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", location(stops[0]));
  url.searchParams.set("destination", location(stops.at(-1)));
  if (stops.length > 2) url.searchParams.set("waypoints", stops.slice(1, -1).map(location).join("|"));
  url.searchParams.set("travelmode", "driving");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
  if (allStops.length > 10) toast("Google Maps 單次先帶入前 10 個地點，請依日期分段導航");
}

function focusStop(id) {
  const marker = state.markers.find(m => m.stopId === id); const stop = state.data.stops.find(s => s.id === id);
  if (!marker || !stop) return toast("此地點尚未完成定位");
  state.map.setView(marker.getLatLng(), 15); marker.openPopup();
}

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i], next = text[i + 1]; if (ch === '"' && quoted && next === '"') { cell += '"'; i++; } else if (ch === '"') quoted = !quoted; else if (ch === "," && !quoted) { row.push(cell); cell = ""; } else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && next === "\n") i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ""; } else cell += ch; }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row); if (rows.length < 2) throw new Error("CSV 沒有資料");
  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() || ""])));
}

async function importFile(file) {
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".json")) state.data = normalizeTrip(JSON.parse(text));
    else {
      const items = parseCsv(text);
      state.data.stops = normalizeTrip({ trip: state.data.trip, stops: items.map(r => ({ date: r.date || r["日期"], startTime: r.starttime || r.time || r["開始時間"] || r["時間"], endTime: r.endtime || r["結束時間"], title: r.title || r.name || r["地點名稱"] || r["名稱"], address: r.address || r["地址"], lat: r.lat || r.latitude || r["緯度"], lng: r.lng || r.longitude || r["經度"], category: r.category || r["類別"], notes: r.notes || r.note || r["備註"] })) }).stops;
    }
    renderAll(); markDirty(); toast(`已匯入 ${state.data.stops.length} 個地點`);
  } catch (error) { toast(`匯入失敗：${error.message}`); }
  finally { $("fileInput").value = ""; }
}

function exportJson() {
  syncMetaFromForm(); const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${state.data.trip.title || "trip"}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function formatDay(date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date; return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function formatTimestamp(value) { if (!value) return ""; return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

function openShare() {
  if (!state.tripId) return toast("請先儲存行程，再建立分享連結");
  const base = `${location.origin}${location.pathname}?trip=${encodeURIComponent(state.tripId)}`;
  $("viewLink").value = base; $("editLink").value = `${base}#edit=${encodeURIComponent(state.editKey)}`; $("shareDialog").showModal();
}

function bindEvents() {
  $("tripTitle").addEventListener("input", autoRender); $("startDate").addEventListener("change", autoRender); $("endDate").addEventListener("change", autoRender);
  $("saveBtn").addEventListener("click", saveTrip); $("shareBtn").addEventListener("click", openShare); $("addStopBtn").addEventListener("click", () => openStopDialog());
  $("stopForm").addEventListener("submit", submitStop); $("fileInput").addEventListener("change", e => e.target.files[0] && importFile(e.target.files[0])); $("exportBtn").addEventListener("click", exportJson);
  $("dayFilter").addEventListener("change", refreshMap); $("routeBtn").addEventListener("click", drawRoute); $("navBtn").addEventListener("click", openGoogleNavigation);
  $("timeline").addEventListener("click", e => { const button = e.target.closest("button[data-action]"); if (!button) return; const id = button.closest(".stop-card").dataset.id; if (button.dataset.action === "focus") focusStop(id); if (button.dataset.action === "edit") openStopDialog(state.data.stops.find(s => s.id === id)); if (button.dataset.action === "delete" && confirm("確定刪除此地點？")) { state.data.stops = state.data.stops.filter(s => s.id !== id); markDirty(); renderFilters(); renderTimeline(); refreshMap(); } });
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => $(b.dataset.close).close()));
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => { await navigator.clipboard.writeText($(b.dataset.copy).value); toast("連結已複製"); }));
  $("mobileListBtn").addEventListener("click", () => document.querySelector(".side-panel").scrollIntoView({ behavior: "smooth" }));
  addEventListener("beforeunload", e => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });
}

bindEvents();
await Promise.all([loadTrip(), initMap()]);
