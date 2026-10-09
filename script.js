/* =========================================================
   RotaSegura — script.js v3 (blindado)
   Todas as funções protegidas contra coordenadas inválidas.
   ========================================================= */

const $ = id => document.getElementById(id);

let map = null;
let userMarker = null;
let risks = [];
let userPos = null;      // [lat, lng]
let destPos = null;      // [lat, lng]
let currentRoute = null;
let hudActive = false;
let watchId = null;
let pendingReport = null;
let currentSpeed = 0;
let currentHeading = 0;
let currentMode = 'driving';
let riskMarkers = [];
let gpsOk = false;

// ===== TOAST =====
function toast(msg, ok = true) {
  const t = $('toast');
  if (!t) { console.log('[toast]', msg); return; }
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.style.display = 'none'; }, 4000);
  console.log('[toast]', msg);
}

// ===== HELPERS =====
function isValidLat(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 90 && Math.abs(v) > 0.0001; }
function isValidLng(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 180 && Math.abs(v) > 0.0001; }
function isValidCoord(lat, lng) { return isValidLat(lat) && isValidLng(lng); }

// ===== INIT =====
window.addEventListener('load', () => {
  initMap();
  loadRisks();
  locateUser();
});

function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
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
    },
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
      paint: { 'line-color': '#0b3d91', 'line-width': 12, 'line-opacity': 0.6 },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
    map.addLayer({
      id: 'rota-linha', type: 'line', source: 'rota',
      paint: { 'line-color': '#00c8ff', 'line-width': 6, 'line-opacity': 0.95 },
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
    if (s) s.textContent = '⚠️ Geolocalização indisponível neste navegador';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      console.log('[GPS 1x]', lat, lng);

      if (!isValidCoord(lat, lng)) {
        const s = $('status');
        if (s) s.textContent = '⚠️ GPS retornou coordenadas inválidas. Aguardando...';
        return;
      }

      gpsOk = true;
      userPos = [lat, lng];
      updateUserMarker();
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
      const g = $('gpsStatus'); if (g) g.style.display = 'flex';
      const s = $('status'); if (s) s.textContent = '✅ Localização obtida. Toque no mapa para reportar riscos.';
    },
    err => {
      console.warn('[GPS erro]', err);
      const s = $('status');
      if (s) {
        if (err.code === 1) s.textContent = '🚫 Permissão de GPS negada. Toque no cadeado 🔒 e permita Localização.';
        else if (err.code === 2) s.textContent = '📡 Sinal de GPS indisponível. Vá para local aberto.';
        else if (err.code === 3) s.textContent = '⏱️ GPS demorou demais. Recarregue a página.';
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
      updateUserMarker();

      if (hudActive) {
        currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
        currentHeading = pos.coords.heading || 0;
        updateHUDSpeed();
        updateHUDCompass();
        updateHUDFollow();
        checkRiskProximity();
      }
    },
    err => { console.warn('[GPS watch]', err); },
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
  } catch (e) {
    console.warn('[risks api]', e.message);
    try {
      const r = await fetch('/data/risk.geojson', { cache: 'no-store' });
      const data = await r.json();
      risks = Array.isArray(data.features) ? data.features : [];
    } catch { risks = []; }
  }
  console.log('[risks]', risks.length, 'carregados');
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
    } catch (e) { console.warn('[paintRisk]', e); }
  });
}

// ===== ROTA (BLINDADA) =====
async function calcRoute() {
  try {
    const dest = ($('destInput')?.value || '').trim();
    if (!dest) return toast('Digite um destino', false);
    if (!gpsOk || !userPos) return toast('🚫 GPS não disponível. Permita a localização no cadeado 🔒', false);
    if (!isValidCoord(userPos[0], userPos[1])) return toast('🚫 Coordenadas GPS inválidas', false);

    toast('Buscando destino…');

    let geo;
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(dest)}`;
      const resp = await fetch(geoUrl, { headers: { 'Accept-Language': 'pt-BR' } });
      geo = await resp.json();
    } catch (e) {
      console.warn('[nominatim]', e);
      return toast('Erro ao buscar endereço', false);
    }

    if (!Array.isArray(geo) || !geo.length) return toast('Destino não encontrado. Tente ser mais específico.', false);

    const destLat = parseFloat(geo[0].lat);
    const destLng = parseFloat(geo[0].lon);
    if (!isValidCoord(destLat, destLng)) return toast('Coordenadas do destino inválidas', false);

    destPos = [destLat, destLng];
    console.log('[dest]', destLat, destLng);
    toast('Calculando rota…');

    const osrmUrl = `https://router.project-osrm.org/route/v1/${currentMode}/` +
      `${userPos[1]},${userPos[0]};${destLng},${destLat}` +
      `?steps=true&geometries=geojson&overview=full`;

    let data;
    try {
      const resp = await fetch(osrmUrl);
      data = await resp.json();
    } catch (e) {
      console.warn('[osrm]', e);
      return toast('Erro ao calcular rota', false);
    }

    if (!data || !Array.isArray(data.routes) || !data.routes.length) {
      return toast('Rota não encontrada', false);
    }

    const route = data.routes[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      return toast('Rota com formato inválido', false);
    }

    // ===== VALIDAÇÃO CRÍTICA DAS COORDENADAS DA ROTA =====
    const rawCoords = route.geometry.coordinates;
    const validCoords = [];
    for (const c of rawCoords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!isValidCoord(lat, lng)) continue;
      validCoords.push([lng, lat]);
    }

    if (validCoords.length < 2) {
      console.warn('[rota] coordenadas inválidas', rawCoords.slice(0, 3));
      return toast('Rota com coordenadas inválidas', false);
    }

    // Garante que o primeiro e último ponto são coerentes com user/dest
    // (proteção contra OSRM devolver rota espelhada)
    const firstLng = validCoords[0][0], firstLat = validCoords[0][1];
    const lastLng = validCoords[validCoords.length - 1][0];
    const lastLat = validCoords[validCoords.length - 1][1];

    const distToStart = haversine(firstLat, firstLng, userPos[0], userPos[1]);
    const distToEnd = haversine(lastLat, lastLng, destLat, destLng);
    const distToStartReverse = haversine(firstLat, firstLng, destLat, destLng);
    const distToEndReverse = haversine(lastLat, lastLng, userPos[0], userPos[1]);

    // Se invertida estiver muito melhor, inverte
    if (distToStartReverse + distToEndReverse < distToStart + distToEnd) {
      console.warn('[rota] invertida — corrigindo');
      validCoords.reverse();
    }

    // ===== ATUALIZA A ROTA NO MAPA =====
    currentRoute = route;
    route.geometry.coordinates = validCoords;

    map.getSource('rota').setData({ type: 'Feature', geometry: route.geometry });

    // ===== CALCULA BOUNDS REAIS =====
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

    console.log('[bounds]', { minLng, minLat, maxLng, maxLat, distKm, boundsSpan });

    // Só faz fitBounds se os bounds forem razoáveis
    if (boundsValid && boundsSpan > 0.0005 && boundsSpan < 5 && distKm < 300) {
      try {
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: 80, pitch: 0, bearing: 0, duration: 1200, maxZoom: 16 }
        );
      } catch (e) {
        console.warn('[fitBounds falhou]', e);
        map.easeTo({ center: [userPos[1], userPos[0]], zoom: 14, duration: 1000 });
      }
    } else {
      console.warn('[bounds] fora do razoável — centralizando no usuário');
      map.easeTo({ center: [userPos[1], userPos[0]], zoom: 13, duration: 1000 });
    }

    // ===== PREENCHE O HUD =====
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
    } catch (e) { console.warn('[hud preencher]', e); }

    toast('✅ Rota calculada!');
  } catch (e) {
    console.error('[calcRoute erro fatal]', e);
    toast('Erro inesperado ao calcular rota', false);
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

// ===== HUD =====
function startHUD() {
  hudActive = true;
  const hud = $('hud'); if (hud) hud.style.display = 'block';
  map.easeTo({ pitch: 60, bearing: currentHeading || 0, duration: 1000 });
  if (currentRoute) {
    try {
      const step = currentRoute.legs[0].steps[0];
      $('hudDistance').textContent = formatDist(step.distance);
      $('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
      $('hudStreet').textContent = step.name || '—';
    } catch {}
  }
}

function stopHUD() {
  hudActive = false;
  const hud = $('hud'); if (hud) hud.style.display = 'none';
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
}

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

function showTrafficInfo() { toast('Trânsito: livre (dados em breve)'); }
function showRouteDetails() { toast('Detalhes da rota em breve'); }
function openMenu() { toast('Menu em breve'); }

function centerOnUser() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS. Permita no cadeado 🔒', false);
  map.flyTo({ center: [userPos[1], userPos[0]], zoom: 16, pitch: hudActive ? 60 : 0 });
}

// ===== PROXIMIDADE DE RISCO =====
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

// ===== REPORT =====
function openReportFromBtn() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS. Permita no cadeado 🔒', false);
  pendingReport = { lat: userPos[0], lng: userPos[1] };
  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  const e = $('reportCoords'); if (e) e.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  const s = $('reportSheet'); if (s) s.style.display = 'block';
}

function closeReport() {
  const s = $('reportSheet'); if (s) s.style.display = 'none';
  pendingReport = null;
}

async function submitReport() {
  if (!pendingReport) return;
  let deviceId = localStorage.getItem('rs_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('rs_device_id', deviceId);
  }
  const payload = {
    lat: pendingReport.lat,
    lng: pendingReport.lng,
    severity: $('repSev')?.value || 'medio',
    type: $('repType')?.value || 'Outro',
    note: $('repNote')?.value || '',
    radius_m: 200,
    device_id: deviceId
  };
  const btn = $('repSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    const r = await fetch('/api/risk/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || data.rejected) {
      toast('⛔ ' + (data.error || 'Muitos reportes. Aguarde.'), false);
      return;
    }
    if (!r.ok || !data.ok) {
      toast('Erro ao enviar: ' + (data.error || r.status), false);
      return;
    }
    const msgs = {
      created:   '✅ Reporte criado!',
      confirmed: `✅ Confirmado! (${data.count || 1} relatos)`,
      merged:    '✅ Somado a um risco existente'
    };
    toast(msgs[data.action] || '✅ Reporte enviado!');
    closeReport();
    const n = $('repNote'); if (n) n.value = '';
    await loadRisks();
  } catch (e) {
    console.warn('[report]', e);
    toast('Erro de rede. Tente novamente.', false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
  }
}

// Log de versão pra você confirmar que o arquivo novo está no ar
console.log('[RotaSegura] script.js v3 carregado — gpsOk:', gpsOk);
