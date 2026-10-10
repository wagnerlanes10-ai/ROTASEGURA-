/* =========================================================
   RotaSegura — script.js (Parte 1)
   Mapa, GPS, rota, riscos, dia/noite, menu lateral
   Mapa escuro: filtro CSS (sem API key)
   ========================================================= */

const $ = id => document.getElementById(id);

let map = null;
let userMarker = null;
let risks = [];
let userPos = null;
let destPos = null;
let currentRoute = null;
let hudActive = false;
let watchId = null;
let pendingReport = null;
let currentSpeed = 0;
let currentHeading = 0;
let currentMode = 'driving';
let riskMarkers = [];
let gpsOk = false;
let routeCoords = [];

// ===== DIA/NOITE =====
let isNightMode = false;
let autoModeActive = true;
let autoModeTimer = null;

// ===== ESTILO DO MAPA (só claro, escuro é via filtro CSS) =====
const STYLE_MAP = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap'
    }
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
};

// ===== TOAST =====
function toast(msg, ok = true) {
  const t = $('toast');
  if (!t) { console.log('[toast]', msg); return; }
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

// ===== HELPERS =====
function isValidLat(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 90 && Math.abs(v) > 0.0001; }
function isValidLng(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 180 && Math.abs(v) > 0.0001; }
function isValidCoord(lat, lng) { return isValidLat(lat) && isValidLng(lng); }

// ===== MENU LATERAL =====
function openMenu() {
  const overlay = $('menuOverlay');
  const menu = $('sideMenu');
  if (overlay) overlay.classList.add('open');
  if (menu) menu.classList.add('open');
  updateMenuValues();
}

function closeMenu() {
  const overlay = $('menuOverlay');
  const menu = $('sideMenu');
  if (overlay) overlay.classList.remove('open');
  if (menu) menu.classList.remove('open');
}

function updateMenuValues() {
  const dayNightVal = $('menuDayNightValue');
  if (dayNightVal) {
    dayNightVal.textContent = isNightMode ? 'Noite' : 'Dia';
    dayNightVal.classList.toggle('night', isNightMode);
  }
  const autoVal = $('menuAutoValue');
  if (autoVal) {
    autoVal.textContent = autoModeActive ? 'Ligado' : 'Manual';
  }
  const dayNightIcon = document.querySelector('#menuDayNight .side-icon');
  if (dayNightIcon) {
    dayNightIcon.textContent = isNightMode ? '🌙' : '☀️';
  }
}

function toggleDayNightFromMenu() {
  if (autoModeActive) autoModeActive = false;
  applyDayNightMode(!isNightMode);
  updateMenuValues();
}

function toggleAutoFromMenu() {
  autoModeActive = !autoModeActive;
  if (autoModeActive) {
    checkAutoDayNight();
    toast('⚙️ Modo automático ligado');
  } else {
    toast('⚙️ Modo manual');
  }
  updateMenuValues();
}

function openAboutFromMenu() {
  closeMenu();
  let modal = document.getElementById('aboutModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'aboutModal';
    modal.innerHTML = `
      <div class="about-card">
        <div class="about-logo">🛡️</div>
        <h2>RotaSegura</h2>
        <div class="about-version">versão 1.0</div>
        <p>App de navegação com alertas de risco em tempo real, feito para te levar até o destino com mais segurança.</p>
        <p style="font-size:12px;color:#64748b">Mapas: OpenStreetMap · Rotas: OSRM · Dados: Supabase</p>
        <button class="about-close" onclick="closeAbout()">Fechar</button>
      </div>
    `;
    modal.addEventListener('click', e => {
      if (e.target === modal) closeAbout();
    });
    document.body.appendChild(modal);
  }
  modal.classList.add('open');
}

function closeAbout() {
  const modal = document.getElementById('aboutModal');
  if (modal) modal.classList.remove('open');
}

// ===== DIA/NOITE (via filtro CSS) =====
function shouldBeNight() {
  const h = new Date().getHours();
  return h < 5 || h >= 17;
}

function applyDayNightMode(isNight) {
  isNightMode = isNight;
  const mapEl = document.getElementById('map');
  if (mapEl) {
    if (isNight) mapEl.classList.add('night-map');
    else mapEl.classList.remove('night-map');
  }
  updateMenuValues();
  console.log('[dia/noite]', isNight ? 'NOITE' : 'DIA');
}

function checkAutoDayNight() {
  if (!autoModeActive) return;
  const should = shouldBeNight();
  if (should !== isNightMode) {
    applyDayNightMode(should);
    toast(should ? '🌙 Modo noite ativado' : '☀️ Modo dia ativado');
  }
}

function setupDayNight() {
  const initialNight = shouldBeNight();
  isNightMode = initialNight;
  if (initialNight) {
    const mapEl = document.getElementById('map');
    if (mapEl) mapEl.classList.add('night-map');
  }
  updateMenuValues();
}

// ===== INIT =====
window.addEventListener('load', () => {
  initMap();
  loadRisks();
  locateUser();
  setupDayNight();
  autoModeTimer = setInterval(checkAutoDayNight, 60000);
});

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: STYLE_MAP,
    center: [-43.1729, -22.9068],
    zoom: 13,
    pitch: 0,
    bearing: 0,
    antialias: true
  });

  map.on('load', () => {
    map.addSource('rota', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'rota-casing', type: 'line', source: 'rota',
      paint: { 'line-color': '#0b3d91', 'line-width': 14, 'line-opacity': 0.7 },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
    map.addLayer({
      id: 'rota-linha', type: 'line', source: 'rota',
      paint: { 'line-color': '#00c8ff', 'line-width': 7, 'line-opacity': 0.95 },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
    console.log('[map] carregado');
  });

  map.on('click', e => {
    if (hudActive) return;
    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;
    if (!isValidCoord(lat, lng)) return;
    pendingReport = { lat, lng };
    openReportSheet(lat, lng);
  });
}

// ===== GEOLOCALIZAÇÃO =====
function locateUser() {
  if (!navigator.geolocation) {
    const s = $('status');
    if (s) s.textContent = '⚠️ Geolocalização indisponível';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isValidCoord(lat, lng)) return;
      gpsOk = true;
      userPos = [lat, lng];
      updateUserMarker();
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
      const g = $('gpsStatus'); if (g) g.style.display = 'flex';
      const s = $('status'); if (s) s.textContent = '✅ Localização obtida.';
    },
    err => {
      const s = $('status');
      if (s) {
        if (err.code === 1) s.textContent = '🚫 Permissão de GPS negada.';
        else if (err.code === 2) s.textContent = '📡 Sinal de GPS indisponível.';
        else if (err.code === 3) s.textContent = '⏱️ GPS demorou demais.';
        else s.textContent = '⚠️ ' + err.message;
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      if (!isValidCoord(lat, lng)) return;
      gpsOk = true;
      userPos = [lat, lng];
      currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
      currentHeading = pos.coords.heading || currentHeading;
      updateUserMarker();
      if (hudActive) {
        updateHUDSpeed();
        updateHUDCompass();
        updateHUDFollow();
        checkRiskProximity();
      }
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 }
  );
}

function updateUserMarker() {
  if (!userPos) return;
  if (!isValidCoord(userPos[0], userPos[1])) return;
  if (userMarker) { try { userMarker.remove(); } catch {} }
  userMarker = new maplibregl.Marker({ color: '#1a73e8' })
    .setLngLat([userPos[1], userPos[0]])
    .addTo(map);
}

function updateHUDFollow() {
  if (!hudActive || !userPos) return;
  if (!isValidCoord(userPos[0], userPos[1])) return;
  map.easeTo({
    center: [userPos[1], userPos[0]],
    bearing: currentHeading,
    duration: 500
  });
}

// ===== RISCOS =====
async function loadRisks() {
  try {
    const r = await fetch('/api/risk', { cache: 'no-store' });
    if (!r.ok) throw new Error('status ' + r.status);
    const data = await r.json();
    risks = Array.isArray(data.features) ? data.features : [];
  } catch {
    try {
      const r = await fetch('/data/risk.geojson', { cache: 'no-store' });
      const data = await r.json();
      risks = Array.isArray(data.features) ? data.features : [];
    } catch { risks = []; }
  }
  paintRisks();
}

function paintRisks() {
  riskMarkers.forEach(m => { try { m.remove(); } catch {} });
  riskMarkers = [];
  risks.forEach(f => {
    try {
      const p = f.properties || {};
      const c = (f.geometry && f.geometry.coordinates) || [p.lng, p.lat];
      const lng = p.lng ?? c[0];
      const lat = p.lat ?? c[1];
      if (!isValidCoord(lat, lng)) return;
      const sev = String(p.level || p.severity_eff || p.severity || p.severidade || 'medio').toLowerCase();
      const el = document.createElement('div');
      el.className = 'risk-marker risk-' + sev;
      el.title = (p.name || p.tipo || p.type || 'Risco') + ' — ' + sev;
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
      riskMarkers.push(m);
    } catch {}
  });
}

// ===== ROTA =====
async function calcRoute() {
  try {
    const dest = ($('destInput')?.value || '').trim();
    if (!dest) return toast('Digite um destino', false);
    if (!gpsOk || !userPos) return toast('🚫 GPS não disponível.', false);
    if (!isValidCoord(userPos[0], userPos[1])) return toast('🚫 Coordenadas GPS inválidas', false);

    toast('Buscando destino…');

    let geo;
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(dest)}`;
      const resp = await fetch(geoUrl, { headers: { 'Accept-Language': 'pt-BR' } });
      geo = await resp.json();
    } catch {
      return toast('Erro ao buscar endereço', false);
    }

    if (!Array.isArray(geo) || !geo.length) return toast('Destino não encontrado.', false);

    const destLat = parseFloat(geo[0].lat);
    const destLng = parseFloat(geo[0].lon);
    if (!isValidCoord(destLat, destLng)) return toast('Coordenadas do destino inválidas', false);

    destPos = [destLat, destLng];
    toast('Calculando rota…');

    const osrmUrl = `https://router.project-osrm.org/route/v1/${currentMode}/` +
      `${userPos[1]},${userPos[0]};${destLng},${destLat}` +
      `?steps=true&geometries=geojson&overview=full`;

    let data;
    try {
      const resp = await fetch(osrmUrl);
      data = await resp.json();
    } catch {
      return toast('Erro ao calcular rota', false);
    }

    if (!data || !Array.isArray(data.routes) || !data.routes.length) {
      return toast('Rota não encontrada', false);
    }

    const route = data.routes[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      return toast('Rota com formato inválido', false);
    }

    const rawCoords = route.geometry.coordinates;
    const validCoords = [];
    for (const c of rawCoords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!isValidCoord(lat, lng)) continue;
      validCoords.push([lng, lat]);
    }

    if (validCoords.length < 2) return toast('Rota com coordenadas inválidas', false);

    const firstLng = validCoords[0][0], firstLat = validCoords[0][1];
    const lastLng = validCoords[validCoords.length - 1][0];
    const lastLat = validCoords[validCoords.length - 1][1];
    const distToStart = haversine(firstLat, firstLng, userPos[0], userPos[1]);
    const distToEnd = haversine(lastLat, lastLng, destLat, destLng);
    const distToStartReverse = haversine(firstLat, firstLng, destLat, destLng);
    const distToEndReverse = haversine(lastLat, lastLng, userPos[0], userPos[1]);
    if (distToStartReverse + distToEndReverse < distToStart + distToEnd) {
      validCoords.reverse();
    }

    currentRoute = route;
    route.geometry.coordinates = validCoords;
    routeCoords = validCoords;

    if (map.getSource('rota')) {
      map.getSource('rota').setData({ type: 'Feature', geometry: route.geometry });
    }

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const c of validCoords) {
      const lng = c[0], lat = c[1];
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
    const distKm = (route.distance || 0) / 1000;
    const boundsValid = isFinite(minLng) && isFinite(minLat) && isFinite(maxLng) && isFinite(maxLat);
    const boundsSpan = Math.max(Math.abs(maxLng - minLng), Math.abs(maxLat - minLat));

    if (boundsValid && boundsSpan > 0.0005 && boundsSpan < 5 && distKm < 300) {
      try {
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 80, pitch: 0, bearing: 0, duration: 1200, maxZoom: 16 }
        );
      } catch {
        map.easeTo({ center: [userPos[1], userPos[0]], zoom: 14, duration: 1000 });
      }
    } else {
      map.easeTo({ center: [userPos[1], userPos[0]], zoom: 13, duration: 1000 });
    }

    try {
      const step = route.legs[0].steps[0];
      $('hudDistance').textContent = formatDist(step.distance);
      $('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
      $('hudStreet').textContent = step.name || '—';
      const ss = $('hudSignStreet'); if (ss) ss.textContent = step.name || '—';
      const cs = $('hudCurrentStreet'); if (cs) cs.textContent = step.name || '—';
      $('hudTime').textContent = Math.round(route.duration / 60) + ' min';
      $('hudArrival').textContent = calcularChegada(route.duration);
      $('distChip').textContent = distKm.toFixed(1) + ' km';
      $('timeChip').textContent = Math.round(route.duration / 60) + ' min';
      const ri = $('routeInfo'); if (ri) ri.style.display = 'flex';
    } catch {}

    toast('✅ Rota calculada!');
  } catch (e) {
    console.error('[calcRoute erro]', e);
    toast('Erro inesperado', false);
  }
}

function formatDist(m) {
  if (!isFinite(m)) return '—';
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1).replace('.', ',') + ' km';
}

function traduzirInstrucao(m) {
  if (!m) return 'Siga em frente';
  const { type, modifier } = m;
  if (type === 'arrive') return 'Chegada ao destino';
  if (type === 'depart') return 'Siga em frente';
  if (type === 'turn') {
    if (modifier === 'right') return 'Vire à direita';
    if (modifier === 'left') return 'Vire à esquerda';
    if (modifier === 'slight right') return 'Curva suave à direita';
    if (modifier === 'slight left') return 'Curva suave à esquerda';
    if (modifier === 'sharp right') return 'Curva acentuada à direita';
    if (modifier === 'sharp left') return 'Curva acentuada à esquerda';
    if (modifier === 'uturn') return 'Retorne';
  }
  if (type === 'merge') return 'Entre na via';
  if (type === 'fork') return 'Mantenha-se ' + (modifier || '');
  if (type === 'roundabout') return 'Entre na rotatória';
  return 'Continue';
}

function calcularChegada(seg) {
  const d = new Date(Date.now() + (Number(seg) || 0) * 1000);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ===== HUD básico =====
function closeHUDAndSearch() { stopHUD(); $('destInput')?.focus(); }
function updateHUDSpeed() { const e = $('hudSpeed'); if (e) e.textContent = currentSpeed; }

function updateHUDCompass() {
  const dirs = ['N','NE','L','SE','S','SO','O','NO'];
  const idx = Math.round(((currentHeading % 360) + 360) % 360 / 45) % 8;
  const e = $('hudCompassLabel'); if (e) e.textContent = dirs[idx];
}

function setMode(btn, mode) {
  currentMode = mode;
  document.querySelectorAll('.hud-modes button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (destPos && userPos && gpsOk) calcRoute();
}

function toggleSound() {
  const btn = $('hudSoundBtn');
  if (!btn) return;
  btn.textContent = btn.textContent.includes('🔊') ? '🔇 Som' : '🔊 Som';
}

function showTrafficInfo() { toast('Trânsito: livre (em breve)'); }
function showRouteDetails() { toast('Detalhes em breve'); }

function centerOnUser() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS.', false);
  map.flyTo({ center: [userPos[1], userPos[0]], zoom: 16, pitch: hudActive ? 60 : 0 });
}

// ===== PROXIMIDADE =====
function checkRiskProximity() {
  if (!userPos || !risks.length) return;
  let nearest = null, minDist = Infinity;
  for (const f of risks) {
    const p = f.properties || {};
    const c = (f.geometry && f.geometry.coordinates) || [p.lng, p.lat];
    const lng = p.lng ?? c[0];
    const lat = p.lat ?? c[1];
    if (!isValidCoord(lat, lng)) continue;
    const d = haversine(userPos[0], userPos[1], lat, lng);
    if (d < minDist) { minDist = d; nearest = f; }
  }
  const alert = $('hudRiskAlert');
  if (!alert) return;
  if (nearest && minDist < 500) {
    alert.style.display = 'block';
    const e = $('hudRiskDist'); if (e) e.textContent = Math.round(minDist) + ' m';
  } else {
    alert.style.display = 'none';
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

console.log('[RotaSegura] script.js (Parte 1) carregado — mapa escuro via filtro CSS');
