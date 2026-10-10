/* =========================================================
   RotaSegura — script2.js (Parte 2)
   HUD, câmera, setas animadas, report
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
}

function stopHUD() {
  hudActive = false;
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
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

// ===== ANIMAÇÃO DAS SETAS =====
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
});

console.log('[RotaSegura] script2.js (Parte 2) carregado');
