const $ = id => document.getElementById(id);
let map, userMarker, risks = [];
let userPos = null, destPos = null, currentRoute = null;
let hudActive = false, watchId = null, pendingReport = null;
let currentSpeed = 0, currentHeading = 0, currentMode = 'driving';
let riskMarkers = [];

// ===== TOAST =====
function toast(msg, ok = true) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = ok ? 'ok' : 'err';
  t.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.style.display = 'none', 3000);
}

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
    zoom: 14,
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
  });

  map.on('click', e => {
    if (hudActive) return;
    pendingReport = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    openReportSheet(e.lngLat.lat, e.lngLat.lng);
  });
}

// ===== GEOLOCALIZAÇÃO =====
function locateUser() {
  if (!navigator.geolocation) return toast('Geolocalização indisponível', false);

  navigator.geolocation.getCurrentPosition(pos => {
    userPos = [pos.coords.latitude, pos.coords.longitude];
    updateUserMarker();
    map.flyTo({ center: [userPos[1], userPos[0]], zoom: 15 });
    const g = $('gpsStatus'); if (g) g.style.display = 'flex';
    const s = $('status'); if (s) s.textContent = '✅ Localização obtida. Toque no mapa para reportar riscos.';
  }, err => {
    const s = $('status'); if (s) s.textContent = '⚠️ ' + err.message;
  }, { enableHighAccuracy: true, timeout: 10000 });

  watchId = navigator.geolocation.watchPosition(pos => {
    userPos = [pos.coords.latitude, pos.coords.longitude];
    updateUserMarker();
    if (hudActive) {
      currentSpeed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
      currentHeading = pos.coords.heading || 0;
      updateHUDSpeed();
      updateHUDCompass();
      updateHUDFollow();
      checkRiskProximity();
    }
  }, () => {}, { enableHighAccuracy: true });
}

function updateUserMarker() {
  if (!userPos) return;
  if (userMarker) userMarker.remove();
  userMarker = new maplibregl.Marker({ color: '#1a73e8' })
    .setLngLat([userPos[1], userPos[0]])
    .addTo(map);
}

function updateHUDFollow() {
  if (!hudActive || !userPos) return;
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
    if (!r.ok) throw new Error();
    const data = await r.json();
    risks = data.features || [];
  } catch {
    try {
      const r = await fetch('/data/risk.geojson', { cache: 'no-store' });
      const data = await r.json();
      risks = data.features || [];
    } catch { risks = []; }
  }
  paintRisks();
}

function paintRisks() {
  riskMarkers.forEach(m => m.remove());
  riskMarkers = [];
  risks.forEach(f => {
    const p = f.properties || {};
    const c = f.geometry?.coordinates || [p.lng, p.lat];
    const lng = p.lng ?? c[0], lat = p.lat ?? c[1];
    const sev = (p.level || p.severity_eff || p.severity || p.severidade || 'medio').toLowerCase();
    const el = document.createElement('div');
    el.className = 'risk-marker risk-' + sev;
    el.title = (p.name || p.tipo || p.type || 'Risco') + ' — ' + sev;
    const m = new maplibregl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);
    riskMarkers.push(m);
  });
}

// ===== ROTA =====
async function calcRoute() {
  const dest = $('destInput').value.trim();
  if (!dest) return toast('Digite um destino', false);
  if (!userPos) return toast('Aguardando GPS…', false);

  toast('Calculando rota…');

  const geo = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(dest)}`,
    { headers: { 'Accept-Language': 'pt-BR' } }
  ).then(r => r.json());

  if (!geo.length) return toast('Destino não encontrado', false);
  destPos = [parseFloat(geo[0].lat), parseFloat(geo[0].lon)];

  const url = `https://router.project-osrm.org/route/v1/${currentMode}/` +
    `${userPos[1]},${userPos[0]};${destPos[1]},${destPos[0]}` +
    `?steps=true&geometries=geojson&overview=full`;

  const data = await fetch(url).then(r => r.json());
  if (!data.routes?.length) return toast('Rota não encontrada', false);

  const route = data.routes[0];
  currentRoute = route;

  map.getSource('rota').setData({ type: 'Feature', geometry: route.geometry });

  const coords = route.geometry.coordinates;
  map.fitBounds(
    [[coords[0][0], coords[0][1]], [coords[coords.length - 1][0], coords[coords.length - 1][1]]],
    { padding: 80, pitch: 0, bearing: 0, duration: 1200 }
  );

  const step = route.legs[0].steps[0];
  $('hudDistance').textContent = formatDist(step.distance);
  $('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
  $('hudStreet').textContent = step.name || '—';
  const ss = $('hudSignStreet'); if (ss) ss.textContent = step.name || '—';
  const cs = $('hudCurrentStreet'); if (cs) cs.textContent = step.name || '—';
  $('hudTime').textContent = Math.round(route.duration / 60) + ' min';
  $('hudArrival').textContent = calcularChegada(route.duration);
  $('distChip').textContent = (route.distance / 1000).toFixed(1) + ' km';
  $('timeChip').textContent = Math.round(route.duration / 60) + ' min';
  const ri = $('routeInfo'); if (ri) ri.style.display = 'flex';

  toast('Rota calculada!');
}

function formatDist(m) {
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
  const d = new Date(Date.now() + seg * 1000);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ===== HUD (MODO PARA-BRISA 3D) =====
function startHUD() {
  hudActive = true;
  $('hud').style.display = 'block';

  // Ativa o modo 3D (pitch = inclinação, bearing = direção)
  map.easeTo({
    pitch: 60,
    bearing: currentHeading || 0,
    duration: 1000
  });

  // Se já tem rota, preenche o HUD
  if (currentRoute) {
    const step = currentRoute.legs[0].steps[0];
    $('hudDistance').textContent = formatDist(step.distance);
    $('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
    $('hudStreet').textContent = step.name || '—';
  }
}

function stopHUD() {
  hudActive = false;
  $('hud').style.display = 'none';
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
}

function closeHUDAndSearch() {
  stopHUD();
  $('destInput').focus();
}

function updateHUDSpeed() { $('hudSpeed').textContent = currentSpeed; }

function updateHUDCompass() {
  const dirs = ['N','NE','L','SE','S','SO','O','NO'];
  const idx = Math.round(currentHeading / 45) % 8;
  $('hudCompassLabel').textContent = dirs[idx];
}

function setMode(btn, mode) {
  currentMode = mode;
  document.querySelectorAll('.hud-modes button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (destPos && userPos) calcRoute();
}

function toggleSound() {
  const btn = $('hudSoundBtn');
  btn.textContent = btn.textContent.includes('🔊') ? '🔇 Som' : '🔊 Som';
}

function showTrafficInfo() { toast('Trânsito: livre (dados em breve)'); }
function showRouteDetails() { toast('Detalhes da rota em breve'); }
function openMenu() { toast('Menu em breve'); }

function centerOnUser() {
  if (!userPos) return toast('Sem GPS', false);
  map.flyTo({ center: [userPos[1], userPos[0]], zoom: 16, pitch: hudActive ? 60 : 0 });
}

// ===== PROXIMIDADE DE RISCO =====
function checkRiskProximity() {
  if (!userPos || !risks.length) return;
  let nearest = null, minDist = Infinity;
  for (const f of risks) {
    const p = f.properties || {};
    const c = f.geometry?.coordinates || [p.lng, p.lat];
    const lng = p.lng ?? c[0], lat = p.lat ?? c[1];
    const d = haversine(userPos[0], userPos[1], lat, lng);
    if (d < minDist) { minDist = d; nearest = f; }
  }
  const alert = $('hudRiskAlert');
  if (nearest && minDist < 500) {
    alert.style.display = 'block';
    $('hudRiskDist').textContent = Math.round(minDist) + ' m';
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
  if (!userPos) return toast('Sem GPS', false);
  pendingReport = { lat: userPos[0], lng: userPos[1] };
  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  $('reportCoords').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  $('reportSheet').style.display = 'block';
}

function closeReport() {
  $('reportSheet').style.display = 'none';
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
    severity: $('repSev').value,
    type: $('repType').value,
    note: $('repNote').value,
    radius_m: 200,
    device_id: deviceId
  };

  const btn = $('repSubmit');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

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
    $('repNote').value = '';
    await loadRisks();

  } catch (e) {
    toast('Erro de rede. Tente novamente.', false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar reporte';
  }
}
