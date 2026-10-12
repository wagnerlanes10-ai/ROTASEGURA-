/* =========================================================
   RotaSegura — script2.js (Parte 2)
   HUD, câmera, setas, report, voz, voz por distância, chuva
   ========================================================= */

// ===== CÂMERA =====
let cameraStream = null;
let cameraActive = false;

// ===== CANVAS DAS SETAS =====
let arrowCanvas = null;
let arrowCtx = null;
let arrowAnimId = null;
let arrowOffset = 0;
let canvasW = 0;
let canvasH = 0;

// ===== CANVAS DA CHUVA =====
let rainCanvas = null;
let rainCtx = null;
let rainAnimId = null;
let rainDrops = [];
let rainActive = true; // ativa por padrão no modo para-brisa
const RAIN_COUNT = 80;

// ===== VOZ =====
let vozAtiva = true;
let ultimaInstrucaoFalada = '';
let vozSuportada = ('speechSynthesis' in window);

let faixasFaladas = { 300: false, 100: false, 30: false };
let ultimaStepTexto = '';
let ultimoIndiceRota = 0;

try {
  const saved = localStorage.getItem('rs_voz_ativa');
  if (saved === 'false') vozAtiva = false;
} catch (e) {}

// ===== HUD (MODO PARA-BRISA) =====
async function startHUD() {
  hudActive = true;
  const cameraOk = await startCamera();
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'block';

  if (cameraOk) {
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.style.opacity = '0';
      mapEl.style.transition = 'opacity 0.6s';
    }
    startArrowCanvas();
    startRainCanvas();
  } else {
    toast('📷 Câmera negada — modo mapa 3D', false);
    map.easeTo({ pitch: 60, bearing: currentHeading || 0, duration: 1000 });
  }

  if (currentRoute) {
    try {
      const step = currentRoute.legs[0].steps[0];
      document.getElementById('hudDistance').textContent = formatDist(step.distance);
      document.getElementById('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
      document.getElementById('hudStreet').textContent = step.name || '—';
    } catch (e) {}
  }

  atualizarBotaoSom();
  iniciarVerificacaoVoz();
}

function stopHUD() {
  hudActive = false;
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  stopCamera();
  stopArrowCanvas();
  stopRainCanvas();
  pararVoz();
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.opacity = '1';
    mapEl.style.transition = 'opacity 0.6s';
  }
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
  faixasFaladas = { 300: false, 100: false, 30: false };
  ultimaStepTexto = '';
  ultimoIndiceRota = 0;
}

// ===== BOTÃO DE SOM =====
function toggleSound() {
  vozAtiva = !vozAtiva;
  try {
    localStorage.setItem('rs_voz_ativa', vozAtiva ? 'true' : 'false');
  } catch (e) {}
  atualizarBotaoSom();
  if (vozAtiva) {
    toast('🔊 Som ligado');
  } else {
    pararVoz();
    toast('🔇 Som desligado');
  }
}

function atualizarBotaoSom() {
  const btn = document.getElementById('hudSoundBtn');
  if (!btn) return;
  btn.textContent = vozAtiva ? '🔊 Som' : '🔇 Mudo';
}

// ===== VOZ =====
function falar(texto) {
  if (!vozAtiva) return;
  if (!vozSuportada) return;
  if (!texto) return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'pt-BR';
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    speechSynthesis.speak(utter);
    console.log('[voz] falou:', texto);
  } catch (e) {
    console.warn('[voz] erro:', e);
  }
}

function pararVoz() {
  try {
    if (vozSuportada) speechSynthesis.cancel();
  } catch (e) {}
}

// ===== VOZ POR DISTÂNCIA =====
function encontrarPontoMaisProximoDaRota() {
  if (!routeCoords || !routeCoords.length || !userPos) return 0;
  if (!isValidCoord(userPos[0], userPos[1])) return 0;
  let melhorIdx = ultimoIndiceRota;
  let melhorDist = Infinity;
  const inicio = Math.max(0, ultimoIndiceRota - 50);
  const fim = Math.min(routeCoords.length - 1, ultimoIndiceRota + 50);
  for (let i = inicio; i <= fim; i++) {
    const c = routeCoords[i];
    const d = haversine(userPos[0], userPos[1], c[1], c[0]);
    if (d < melhorDist) {
      melhorDist = d;
      melhorIdx = i;
    }
  }
  ultimoIndiceRota = melhorIdx;
  return melhorIdx;
}

function distanciaAoLongoDaRota(idx1, idx2) {
  if (!routeCoords || idx1 >= idx2) return 0;
  let total = 0;
  for (let i = idx1; i < idx2; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];
    if (!c1 || !c2) continue;
    total += haversine(c1[1], c1[0], c2[1], c2[0]);
  }
  return total;
}

function encontrarIndiceDaProximaCurva() {
  if (!currentRoute || !routeCoords) return -1;
  if (!currentRoute.legs || !currentRoute.legs[0]) return -1;
  const steps = currentRoute.legs[0].steps;
  if (!steps || !steps.length) return -1;
  let distAcumulada = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const tipo = s.maneuver?.type || '';
    const ehCritica = (
      tipo === 'turn' ||
      tipo === 'roundabout' ||
      tipo === 'uturn' ||
      tipo === 'arrive' ||
      tipo === 'end of road'
    );
    distAcumulada += (s.distance || 0);
    if (ehCritica && i > 0) {
      return encontrarIndicePorDistancia(distAcumulada);
    }
  }
  return -1;
}

function encontrarIndicePorDistancia(distanciaAlvo) {
  if (!routeCoords || !routeCoords.length) return -1;
  let acumulado = 0;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const c1 = routeCoords[i];
    const c2 = routeCoords[i + 1];
    if (!c1 || !c2) continue;
    const d = haversine(c1[1], c1[0], c2[1], c2[0]);
    acumulado += d;
    if (acumulado >= distanciaAlvo) return i;
  }
  return routeCoords.length - 1;
}

let vozDistLoopId = null;
function iniciarVerificacaoVozPorDistancia() {
  if (vozDistLoopId) return;
  vozDistLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!vozAtiva) return;
    if (!currentRoute || !routeCoords || !userPos) return;
    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();
    if (idxCurva < 0) return;
    const dist = distanciaAoLongoDaRota(idxAtual, idxCurva);
    const instrucaoEl = document.getElementById('hudInstruction');
    const instrucao = instrucaoEl?.textContent?.trim() || '';
    if (instrucao !== ultimaStepTexto) {
      faixasFaladas = { 300: false, 100: false, 30: false };
      ultimaStepTexto = instrucao;
    }
    if (!deveFalar(instrucao)) return;
    if (dist <= 30 && !faixasFaladas[30]) {
      faixasFaladas[30] = true;
      faixasFaladas[100] = true;
      faixasFaladas[300] = true;
      falar(instrucao + ' agora');
    } else if (dist <= 100 && !faixasFaladas[100]) {
      faixasFaladas[100] = true;
      faixasFaladas[300] = true;
      falar(instrucao);
    } else if (dist <= 300 && !faixasFaladas[300]) {
      faixasFaladas[300] = true;
      falar(instrucao + ' em 300 metros');
    }
  }, 2000);
}

let vozLoopId = null;
function iniciarVerificacaoVoz() {
  if (vozLoopId) return;
  vozLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!vozAtiva) return;
    const el = document.getElementById('hudInstruction');
    if (!el) return;
    const inst = el.textContent?.trim();
    if (!inst || inst === '—' || inst === 'Aguardando rota…') return;
    if (inst === ultimaInstrucaoFalada) return;
    if (deveFalar(inst) && !ultimaStepTexto) {
      ultimaInstrucaoFalada = inst;
      falar(inst);
    } else {
      ultimaInstrucaoFalada = inst;
    }
  }, 2000);
  iniciarVerificacaoVozPorDistancia();
}

function deveFalar(instrucao) {
  const criticas = [
    'Vire à direita',
    'Vire à esquerda',
    'Curva acentuada à direita',
    'Curva acentuada à esquerda',
    'Retorne',
    'Chegada ao destino'
  ];
  return criticas.some(c => instrucao.includes(c));
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
    console.log('[camera] ativa');
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
  arrowCtx = arrowCanvas.getContext('2d', { alpha: true });
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  arrowCanvas.width = canvasW * dpr;
  arrowCanvas.height = canvasH * dpr;
  arrowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function animateArrows() {
  if (!arrowCtx || !arrowCanvas) return;
  const W = canvasW;
  const H = canvasH;
  arrowCtx.clearRect(0, 0, W, H);
  const numArrows = 10;
  const horizonY = H * 0.32;
  const baseY = H * 1.02;
  const centerX = W / 2;
  for (let i = numArrows - 1; i >= 0; i--) {
    const baseFrac = i / numArrows;
    const animFrac = (baseFrac + arrowOffset) % 1;
    const y = baseY - animFrac * (baseY - horizonY);
    const sizeScale = Math.pow(1 - animFrac, 1.2) * 0.85 + 0.15;
    const arrowW = W * 0.32 * sizeScale;
    const arrowH = W * 0.16 * sizeScale;
    const alpha = Math.max(0.5, 0.55 + sizeScale * 0.45);
    drawArrowFast(arrowCtx, centerX, y, arrowW, arrowH, alpha);
  }
  arrowOffset = (arrowOffset + 0.008) % 1;
  arrowAnimId = requestAnimationFrame(animateArrows);
}

function drawArrowFast(ctx, cx, cy, w, h, alpha) {
  const x1 = cx - w / 2;
  const y1 = cy;
  const x2 = cx;
  const y2 = cy - h;
  const x3 = cx + w / 2;
  const y3 = cy;
  const notchY = y3 - h * 0.35;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x2, notchY);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 210, 255, ' + Math.min(1, alpha + 0.15) + ')';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, ' + Math.min(1, alpha + 0.2) + ')';
  ctx.lineWidth = Math.max(2.5, w * 0.08);
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// ===== CANVAS DA CHUVA =====
function startRainCanvas() {
  if (rainCanvas) return;
  rainCanvas = document.createElement('canvas');
  rainCanvas.id = 'rainCanvas';
  // Fica ACIMA das setas (z-index 1600) — chuva na frente
  rainCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1600;
    pointer-events: none;
  `;
  document.body.appendChild(rainCanvas);
  rainCtx = rainCanvas.getContext('2d', { alpha: true });
  resizeRainCanvas();
  window.addEventListener('resize', resizeRainCanvas);
  criarGotasDeChuva();
  animateRain();
  console.log('[rain] canvas ativo');
}

function stopRainCanvas() {
  if (rainAnimId) {
    cancelAnimationFrame(rainAnimId);
    rainAnimId = null;
  }
  if (rainCanvas) {
    rainCanvas.remove();
    rainCanvas = null;
    rainCtx = null;
  }
  rainDrops = [];
  window.removeEventListener('resize', resizeRainCanvas);
}

function resizeRainCanvas() {
  if (!rainCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  rainCanvas.width = W * dpr;
  rainCanvas.height = H * dpr;
  rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function criarGotasDeChuva() {
  rainDrops = [];
  const W = window.innerWidth;
  const H = window.innerHeight;

  for (let i = 0; i < RAIN_COUNT; i++) {
    // 70% são gotas caindo, 30% são gotas grudadas (estáticas)
    const tipo = Math.random() < 0.7 ? 'queda' : 'grudada';
    rainDrops.push({
      tipo,
      x: Math.random() * W,
      y: Math.random() * H,
      // Velocidade de queda (só para tipo 'queda')
      vy: 8 + Math.random() * 12,
      // Desvio lateral (vento leve)
      vx: -0.3 + Math.random() * 0.6,
      // Comprimento do traço (queda) ou raio (grudada)
      len: tipo === 'queda' ? (10 + Math.random() * 20) : (2 + Math.random() * 4),
      // Opacidade
      alpha: tipo === 'queda' ? (0.25 + Math.random() * 0.35) : (0.15 + Math.random() * 0.25),
      // Vida (para gotas grudadas, some e renasce)
      vida: tipo === 'grudada' ? (Math.random() * 600 + 200) : 0
    });
  }
}

function animateRain() {
  if (!rainCtx || !rainCanvas) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  rainCtx.clearRect(0, 0, W, H);

  for (const g of rainDrops) {
    if (g.tipo === 'queda') {
      // Traço de chuva caindo
      const grad = rainCtx.createLinearGradient(g.x, g.y, g.x + g.vx * 2, g.y + g.len);
      grad.addColorStop(0, 'rgba(180, 210, 240, ' + (g.alpha * 0.2) + ')');
      grad.addColorStop(0.5, 'rgba(200, 225, 255, ' + g.alpha + ')');
      grad.addColorStop(1, 'rgba(220, 240, 255, 0)');
      rainCtx.strokeStyle = grad;
      rainCtx.lineWidth = 1.2;
      rainCtx.beginPath();
      rainCtx.moveTo(g.x, g.y);
      rainCtx.lineTo(g.x + g.vx * 2, g.y + g.len);
      rainCtx.stroke();

      // Move
      g.y += g.vy;
      g.x += g.vx;

      // Se saiu da tela por baixo, renasce no topo
      if (g.y > H + 30) {
        g.y = -30;
        g.x = Math.random() * W;
      }
      // Se saiu lateralmente, reposiciona
      if (g.x < -20) g.x = W + 20;
      if (g.x > W + 20) g.x = -20;
    } else {
      // Gota grudada no vidro (círculo com highlight)
      // Fundo (sombra da gota)
      rainCtx.beginPath();
      rainCtx.arc(g.x, g.y, g.len, 0, Math.PI * 2);
      rainCtx.fillStyle = 'rgba(140, 170, 200, ' + (g.alpha * 0.5) + ')';
      rainCtx.fill();

      // Highlight (luz refletida)
      rainCtx.beginPath();
      rainCtx.arc(g.x - g.len * 0.3, g.y - g.len * 0.3, g.len * 0.4, 0, Math.PI * 2);
      rainCtx.fillStyle = 'rgba(255, 255, 255, ' + (g.alpha * 1.2) + ')';
      rainCtx.fill();

      // Contagem de vida
      g.vida -= 1;
      if (g.vida <= 0) {
        // Some e nasce em outro lugar
        g.x = Math.random() * W;
        g.y = Math.random() * H;
        g.len = 2 + Math.random() * 4;
        g.vida = Math.random() * 600 + 200;
      }
    }
  }

  rainAnimId = requestAnimationFrame(animateRain);
}

// ===== REPORT =====
function openReportFromBtn() {
  if (!gpsOk || !userPos) return toast('🚫 Sem GPS.', false);
  pendingReport = { lat: userPos[0], lng: userPos[1] };
  openReportSheet(userPos[0], userPos[1]);
}

function openReportSheet(lat, lng) {
  const e = document.getElementById('reportCoords');
  if (e) e.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  const s = document.getElementById('reportSheet');
  if (s) s.style.display = 'block';
}

function closeReport() {
  const s = document.getElementById('reportSheet');
  if (s) s.style.display = 'none';
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
    severity: (document.getElementById('repSev')?.value) || 'medio',
    type: (document.getElementById('repType')?.value) || 'Outro',
    note: (document.getElementById('repNote')?.value) || '',
    radius_m: 200,
    device_id: deviceId
  };
  const btn = document.getElementById('repSubmit');
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
    const n = document.getElementById('repNote');
    if (n) n.value = '';
    await loadRisks();
  } catch (e) {
    toast('Erro de rede.', false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
  }
}

// ===== CLEANUP =====
window.addEventListener('beforeunload', () => {
  stopCamera();
  stopArrowCanvas();
  stopRainCanvas();
  pararVoz();
});

console.log('[RotaSegura] script2.js (Parte 2) carregado — com chuva');
