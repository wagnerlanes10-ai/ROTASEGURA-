/* =========================================================
   RotaSegura — script.js v11
   Setas grandes, brilhantes, retas, seguindo o traçado da rota
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

// ===== CÂMERA =====
let cameraStream = null;
let cameraActive = false;

// ===== CANVAS DAS SETAS =====
let arrowCanvas = null;
let arrowCtx = null;
let arrowAnimId = null;
let arrowOffset = 0;

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
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(size * 0.15, size * 0.35);
    ctx.lineTo(size * 0.50, size * 0.65);
    ctx.lineTo(size * 0.85, size * 0.35);
    ctx.lineWidth = size * 0.18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    const imageData = ctx.getImageData(0, 0, size, size);
    map.addImage('arrow-icon', imageData, { sdf: true });

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

    map.addSource('setas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'setas-layer',
      type: 'symbol',
      source: 'setas',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 60,
        'icon-image': 'arrow-icon',
        'icon-size': 0.7,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
        'icon-rotate': 0
      },
      paint: {
        'icon-color': '#ffffff',
        'icon-opacity': 0.95,
        'icon-halo-color': '#0099cc',
        'icon-halo-width': 1.5
      }
    });

    console.log('[map] carregado v11');
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

    map.getSource('rota').setData({ type: 'Feature', geometry: route.geometry });
    updateArrows();

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

function updateArrows() {
  if (!routeCoords || routeCoords.length < 2) return;
  const linhaFeature = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: routeCoords },
    properties: {}
  };
  const source = map.getSource('setas');
  if (source) {
    source.setData({ type: 'FeatureCollection', features: [linhaFeature] });
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
async function startHUD() {
  hudActive = true;
  const cameraOk = await startCamera();
  const hud = $('hud'); if (hud) hud.style.display = 'block';

  if (cameraOk) {
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.style.opacity = '0';
      mapEl.style.transition = 'opacity 0.6s';
    }
    startArrowCanvas();
  } else {
    toast('📷 Câmera negada — modo mapa 3D', false);
    map.easeTo({ pitch: 60, bearing: currentHeading || 0, duration: 1000 });
  }

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
  stopCamera();
  stopArrowCanvas();
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.opacity = '1';
    mapEl.style.transition = 'opacity 0.6s';
  }
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
}

// ===== CÂMERA =====
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[camera] indisponível');
    return false;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    let video = document.getElementById('cameraVideo');
    if (!video) {
      video = document.createElement('video');
      video.id = 'cameraVideo';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      document.body.appendChild(video);
    }
    video.srcObject = cameraStream;
    await video.play().catch(() => {});
    video.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
      background: #000;
    `;
    cameraActive = true;
    return true;
  } catch (e) {
    console.warn('[camera] erro:', e.name, e.message);
    cameraActive = false;
    return false;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) {
    video.srcObject = null;
    video.remove();
  }
  cameraActive = false;
}

// ===== CANVAS DAS SETAS =====
function startArrowCanvas() {
  if (arrowCanvas) return;

  arrowCanvas = document.createElement('canvas');
  arrowCanvas.id = 'arrowCanvas';
  arrowCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1500;
    pointer-events: none;
  `;
  document.body.appendChild(arrowCanvas);

  arrowCtx = arrowCanvas.getContext('2d');
  resizeArrowCanvas();
  window.addEventListener('resize', resizeArrowCanvas);

  arrowOffset = 0;
  animateArrows();
  console.log('[arrows] canvas ativo');
}

function stopArrowCanvas() {
  if (arrowAnimId) {
    cancelAnimationFrame(arrowAnimId);
    arrowAnimId = null;
  }
  if (arrowCanvas) {
    arrowCanvas.remove();
    arrowCanvas = null;
    arrowCtx = null;
  }
  window.removeEventListener('resize', resizeArrowCanvas);
}

function resizeArrowCanvas() {
  if (!arrowCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  arrowCanvas.width = window.innerWidth * dpr;
  arrowCanvas.height = window.innerHeight * dpr;
  arrowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== HELPERS DE ROTA =====
function bearingBetween(lng1, lat1, lng2, lat2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Normaliza ângulo para [-180, 180]
function normalizeAngle(deg) {
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

// ===== CANVAS DAS SETAS (v11) =====
function animateArrows() {
  if (!arrowCtx || !arrowCanvas) return;

  const W = window.innerWidth;
  const H = window.innerHeight;
  arrowCtx.clearRect(0, 0, W, H);

  const numArrows = 10;
  const horizonY = H * 0.32;   // chega até a altura da lupa
  const baseY = H * 1.02;
  const centerX = W / 2;

  // ===== CALCULA O DESVIO LATERAL DA ROTA =====
  // Cada seta vai olhar para um ponto da rota e calcular quanto desviar
  // do centro da tela. Assim a fileira desenha a curva.

  // Pega a direção "base" do usuário (heading da bússola)
  // E a direção "para a rota" no ponto correspondente

  // Se não tem rota, todas as setas ficam no centro
  const hasRoute = routeCoords && routeCoords.length > 5 && gpsOk && userPos;

  for (let i = numArrows - 1; i >= 0; i--) {
    const baseFrac = i / numArrows;
    const animFrac = (baseFrac + arrowOffset) % 1;

    // Y (profundidade)
    const y = baseY - animFrac * (baseY - horizonY);

    // ===== ESCALA (perspectiva) =====
    const sizeScale = Math.pow(1 - animFrac, 1.6);
    const arrowW = Math.max(W * 0.04, W * 0.36 * sizeScale);
    const arrowH = Math.max(W * 0.02, W * 0.18 * sizeScale);

    // ===== POSIÇÃO X (para desviar conforme a rota curva) =====
    let x = centerX;

    if (hasRoute) {
      // A seta "longe" (animFrac próximo de 1) olha mais longe na rota
      const lookAheadIdx = Math.floor(animFrac * Math.min(routeCoords.length - 1, 60));
      const targetCoord = routeCoords[Math.min(lookAheadIdx, routeCoords.length - 1)];

      if (targetCoord) {
        // Bearing do usuário até o ponto da rota
        const bearingToRoute = bearingBetween(userPos[1], userPos[0], targetCoord[0], targetCoord[1]);
        // Diferença entre a direção do usuário e a direção da rota
        const diff = normalizeAngle(bearingToRoute - currentHeading);
        // Limita o desvio a ±90° e aplica suavização
        const clamped = Math.max(-90, Math.min(90, diff));
        // Quanto mais longe, mais desvio (perspectiva)
        const xOffset = (clamped / 90) * (W * 0.35) * (1 - animFrac);
        x = centerX + xOffset;
      }
    }

    // ===== OPACIDADE (bem visível, como a primeira versão) =====
    const alpha = Math.max(0.35, 0.55 + sizeScale * 0.45);

    // ===== SEM INCLINAÇÃO — sempre reta (aponta pra cima) =====
    drawArrow3D(arrowCtx, x, y, arrowW, arrowH, alpha, 0);
  }

  arrowOffset = (arrowOffset + 0.008) % 1;
  arrowAnimId = requestAnimationFrame(animateArrows);
}

// ===== DESENHO DA SETA (v11: grande, brilhante, reta) =====
function drawArrow3D(ctx, cx, cy, w, h, alpha, tiltDeg = 0) {
  ctx.save();

  ctx.translate(cx, cy);
  // Sem inclinação — mantemos o parâmetro para uso futuro, mas passamos 0
  ctx.rotate(tiltDeg * Math.PI / 180);

  // ===== GLOW AZUL FORTE (volta ao brilho da primeira versão) =====
  const glowColor = 'rgba(0, 200, 255, ' + Math.min(1, alpha) + ')';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 22;

  const x1 = -w / 2;
  const y1 = 0;
  const x2 = 0;
  const y2 = -h;
  const x3 = w / 2;
  const y3 = 0;

  // Preenchimento azul ciano vibrante
  const baseColor = 'rgba(0, 210, 255, ' + Math.min(1, alpha + 0.15) + ')';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x2, y3 - h * 0.35);
  ctx.closePath();
  ctx.fillStyle = baseColor;
  ctx.fill();

  // ===== BORDA BRANCA GROSSA =====
  const edgeColor = 'rgba(255, 255, 255, ' + Math.min(1, alpha + 0.2) + ')';
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = Math.max(2.5, w * 0.07);
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.restore();
}

// ===== OUTRAS FUNÇÕES =====
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
function openMenu() { toast('Menu em breve'); }

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

// ===== REPORT =====
function openReportFromBtn() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS.', false);
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
      toast('⛔ ' + (data.error || 'Muitos reportes.'), false);
      return;
    }
    if (!r.ok || !data.ok) {
      toast('Erro: ' + (data.error || r.status), false);
      return;
    }
    const msgs = {
      created:   '✅ Reporte criado!',
      confirmed: `✅ Confirmado! (${data.count || 1})`,
      merged:    '✅ Somado a um risco'
    };
    toast(msgs[data.action] || '✅ Reporte enviado!');
    closeReport();
    const n = $('repNote'); if (n) n.value = '';
    await loadRisks();
  } catch {
    toast('Erro de rede.', false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
  }
}

window.addEventListener('beforeunload', () => {
  stopCamera();
  stopArrowCanvas();
});

console.log('[RotaSegura] script.js v11 carregado — setas retas seguindo a rota');
