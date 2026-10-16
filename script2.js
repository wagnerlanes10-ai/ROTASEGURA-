/* =========================================================
   RotaSegura — script2.js (Parte 2)
   HUD, câmera, setas curvas, report, voz
   FIX: considera bifurcações (fork, merge, ramps) como críticas
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

// ===== DESVIO DAS SETAS =====
let desvioAtual = 0;
let desvioAlvo = 0;
let setasLoopId = null;

// ===== CARD DINÂMICO =====
let cardLoopId = null;

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

// ===== HUD =====
async function startHUD() {
  hudActive = true;
  const cameraOk = await startCamera();
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'block';

  const navCard = document.getElementById('navCard');
  if (navCard) navCard.style.display = 'none';

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
      document.getElementById('hudDistance').textContent = formatDist(step.distance);
      document.getElementById('hudInstruction').textContent = traduzirInstrucao(step.maneuver);
      document.getElementById('hudStreet').textContent = step.name || '—';
    } catch (e) {}
  }

  atualizarBotaoSom();
  iniciarVerificacaoVoz();
  iniciarAtualizacaoSetas();
  iniciarAtualizacaoCard();
}

function stopHUD() {
  hudActive = false;
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  stopCamera();
  stopArrowCanvas();
  pararVoz();
  pararAtualizacaoSetas();
  pararAtualizacaoCard();
  const mapEl = document.getElementById('map');
  if (mapEl) {
    mapEl.style.opacity = '1';
    mapEl.style.transition = 'opacity 0.6s';
  }
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });

  if (currentRoute && routeCoords && routeCoords.length > 1) {
    const navCard = document.getElementById('navCard');
    if (navCard) navCard.style.display = 'flex';
  }

  faixasFaladas = { 300: false, 100: false, 30: false };
  ultimaStepTexto = '';
  ultimoIndiceRota = 0;
  desvioAtual = 0;
  desvioAlvo = 0;
}

// ===== BOTÃO DE SOM =====
function toggleSound() {
  vozAtiva = !vozAtiva;
  try { localStorage.setItem('rs_voz_ativa', vozAtiva ? 'true' : 'false'); } catch (e) {}
  atualizarBotaoSom();
  if (vozAtiva) toast('🔊 Som ligado');
  else { pararVoz(); toast('🔇 Som desligado'); }
}

function atualizarBotaoSom() {
  const btn = document.getElementById('hudSoundBtn');
  if (!btn) return;
  btn.textContent = vozAtiva ? '🔊 Som' : '🔇 Mudo';
}

// ===== FUNÇÃO CENTRAL: O QUE É UMA MANOBRA CRÍTICA =====
function ehManobraCritica(tipo, modifier, distanciaStep) {
  // 1. Pula steps muito curtas (micro-marcações)
  if (distanciaStep < 10) return false;

  // 2. Lista completa de manobras que exigem decisão do motorista
  const tiposCriticos = [
    'turn',           // virar
    'fork',           // bifurcação ← FALTAVA!
    'merge',          // entrar na via
    'roundabout',     // rotatória
    'uturn',          // retorno
    'end of road',    // fim de rua
    'on ramp',        // entrada de rodovia
    'off ramp',       // saída de rodovia
    'arrive'          // chegada
  ];

  if (!tiposCriticos.includes(tipo)) return false;

  // 3. Para "fork" e "merge", exige que tenha modificador (left/right)
  if ((tipo === 'fork' || tipo === 'merge') && !modifier) return false;

  return true;
}

// ===== CARD DINÂMICO =====
function iniciarAtualizacaoCard() {
  if (cardLoopId) return;
  cardLoopId = setInterval(() => {
    if (!hudActive) return;
    if (!currentRoute || !routeCoords || !userPos) return;
    if (!isValidCoord(userPos[0], userPos[1])) return;

    const idxAtual = encontrarPontoMaisProximoDaRota();
    const idxCurva = encontrarIndiceDaProximaCurva();

    let stepAtual = null;
    let distanciaAte = 0;

    if (idxCurva < 0) {
      const steps = currentRoute.legs[0].steps;
      stepAtual = steps[steps.length - 1];
      distanciaAte = distanciaAoLongoDaRota(idxAtual, routeCoords.length - 1);
    } else {
      const steps = currentRoute.legs[0].steps;
      let acumulado = 0;
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const distanciaStep = s.distance || 0;
        acumulado += distanciaStep;
        if (i === 0) continue;

        const tipo = s.maneuver?.type || '';
        const modifier = s.maneuver?.modifier || '';
        if (!ehManobraCritica(tipo, modifier, distanciaStep)) continue;

        const idxStep = encontrarIndicePorDistancia(acumulado);
        if (idxStep >= idxCurva) { stepAtual = s; break; }
      }
      if (!stepAtual) stepAtual = steps[steps.length - 1];
      distanciaAte = distanciaAoLongoDaRota(idxAtual, idxCurva);
    }

    if (!stepAtual) return;

    try {
      const elDist = document.getElementById('hudDistance');
      const elInst = document.getElementById('hudInstruction');
      const elSt = document.getElementById('hudStreet');
      if (elDist) elDist.textContent = formatDist(distanciaAte);
      if (elInst) {
        elInst.textContent = traduzirInstrucao(stepAtual.maneuver);
        elInst.dataset.distancia = String(distanciaAte);
      }
      if (elSt) elSt.textContent = stepAtual.name || '—';
    } catch (e) {}
  }, 2000);
}

function pararAtualizacaoCard() {
  if (cardLoopId) { clearInterval(cardLoopId); cardLoopId = null; }
}

// ===== ATUALIZAÇÃO DAS SETAS =====
function iniciarAtualizacaoSetas() {
  if (setasLoopId) return;
  setasLoopId = setInterval(() => {
    if (!hudActive) return;
    const el = document.getElementById('hudInstruction');
    if (!el) return;
    const instrucao = el.textContent?.trim() || '';
    const distancia = parseFloat(el.dataset.distancia || '0') || 0;
    ajustarDesvioPorInstrucao(instrucao, distancia);
  }, 1500);
}

function pararAtualizacaoSetas() {
  if (setasLoopId) { clearInterval(setasLoopId); setasLoopId = null; }
}

function ajustarDesvioPorInstrucao(instrucao, distancia) {
  let fatorInstrucao = 0;
  if (!instrucao) fatorInstrucao = 0;
  else if (instrucao.includes('Chegada')) fatorInstrucao = 0;
  else if (instrucao.includes('Retorne')) fatorInstrucao = -0.7;
  else if (instrucao.includes('Curva acentuada à direita')) fatorInstrucao = 1.0;
  else if (instrucao.includes('Curva acentuada à esquerda')) fatorInstrucao = -1.0;
  else if (instrucao.includes('Curva suave à direita')) fatorInstrucao = 0.6;
  else if (instrucao.includes('Curva suave à esquerda')) fatorInstrucao = -0.6;
  else if (instrucao.includes('Vire à direita')) fatorInstrucao = 0.9;
  else if (instrucao.includes('Vire à esquerda')) fatorInstrucao = -0.9;
  else if (instrucao.includes('rotatória')) fatorInstrucao = 0.7;
  else if (instrucao.includes('Mantenha-se à direita') || instrucao.includes('Mantenha-se à esquerda')) {
    if (instrucao.includes('direita')) fatorInstrucao = 0.6;
    else fatorInstrucao = -0.6;
  }
  else if (instrucao.includes('Entre na via')) {
    if (instrucao.includes('direita')) fatorInstrucao = 0.5;
    else if (instrucao.includes('esquerda')) fatorInstrucao = -0.5;
  }

  let fatorDistancia = 0;
  if (distancia > 300) fatorDistancia = 0;
  else if (distancia > 100) fatorDistancia = 0.35;
  else if (distancia > 30) fatorDistancia = 0.65;
  else fatorDistancia = 1.0;

  desvioAlvo = fatorInstrucao * fatorDistancia;
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
  } catch (e) {}
}

function pararVoz() {
  try { if (vozSuportada) speechSynthesis.cancel(); } catch (e) {}
}

// ===== HELPERS =====
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
    if (d < melhorDist) { melhorDist = d; melhorIdx = i; }
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
    const modifier = s.maneuver?.modifier || '';
    const distanciaStep = s.distance || 0;
    distAcumulada += distanciaStep;
    if (i === 0) continue;
    if (!ehManobraCritica(tipo, modifier, distanciaStep)) continue;
    return encontrarIndicePorDistancia(distAcumulada);
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

// ===== VOZ POR DISTÂNCIA =====
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
    'Vire à direita', 'Vire à esquerda',
    'Curva acentuada à direita', 'Curva acentuada à esquerda',
    'Retorne', 'Chegada ao destino',
    'Mantenha-se à direita', 'Mantenha-se à esquerda'
  ];
  return criticas.some(c => instrucao.includes(c));
}

// ===== CÂMERA =====
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
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
      position: fixed; inset: 0; width: 100%; height: 100%;
      object-fit: cover; z-index: 0; background: #000;
    `;
    cameraActive = true;
    return true;
  } catch (e) {
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
  if (video) { video.srcObject = null; video.remove(); }
  cameraActive = false;
}

// ===== CANVAS DAS SETAS =====
function startArrowCanvas() {
  if (arrowCanvas) return;
  arrowCanvas = document.createElement('canvas');
  arrowCanvas.id = 'arrowCanvas';
  arrowCanvas.style.cssText = `
    position: fixed; inset: 0; width: 100%; height: 100%;
    z-index: 1500; pointer-events: none;
  `;
  document.body.appendChild(arrowCanvas);
  arrowCtx = arrowCanvas.getContext('2d', { alpha: true });
  resizeArrowCanvas();
  window.addEventListener('resize', resizeArrowCanvas);
  arrowOffset = 0;
  desvioAtual = 0;
  desvioAlvo = 0;
  animateArrows();
}

function stopArrowCanvas() {
  if (arrowAnimId) { cancelAnimationFrame(arrowAnimId); arrowAnimId = null; }
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

  const velocidadeDesvio = 0.04;
  desvioAtual += (desvioAlvo - desvioAtual) * velocidadeDesvio;

  const numArrows = 10;
  const horizonY = H * 0.32;
  const baseY = H * 1.02;
  const centerX = W / 2;

  const deslocamentoMax = W * 0.30;
  const rotacaoMax = 35;

  for (let i = numArrows - 1; i >= 0; i--) {
    const baseFrac = i / numArrows;
    const animFrac = (baseFrac + arrowOffset) % 1;

    const y = baseY - animFrac * (baseY - horizonY);
    const sizeScale = Math.pow(1 - animFrac, 1.2) * 0.85 + 0.15;
    const arrowW = W * 0.32 * sizeScale;
    const arrowH = W * 0.16 * sizeScale;

    const fatorX = animFrac * animFrac * (3 - 2 * animFrac);
    const fatorR = Math.pow(animFrac, 1.4);

    const xOffset = desvioAtual * deslocamentoMax * fatorX;
    const x = centerX + xOffset;
    const rotacao = desvioAtual * rotacaoMax * fatorR;

    const alpha = Math.max(0.5, 0.55 + sizeScale * 0.45);
    drawArrowCurva(arrowCtx, x, y, arrowW, arrowH, alpha, rotacao);
  }

  arrowOffset = (arrowOffset + 0.008) % 1;
  arrowAnimId = requestAnimationFrame(animateArrows);
}

function drawArrowCurva(ctx, cx, cy, w, h, alpha, rotacao) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotacao * Math.PI / 180);

  const x1 = -w / 2;
  const y1 = 0;
  const x2 = 0;
  const y2 = -h;
  const x3 = w / 2;
  const y3 = 0;
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

  ctx.restore();
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
      created: '✅ Reporte criado!',
      confirmed: `✅ Confirmado! (${data.count || 1})`,
      merged: '✅ Somado a um risco'
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

window.addEventListener('beforeunload', () => {
  stopCamera();
  stopArrowCanvas();
  pararVoz();
  pararAtualizacaoSetas();
  pararAtualizacaoCard();
});

console.log('[RotaSegura] script2.js carregado — manobras completas (fork/merge/ramp)');
