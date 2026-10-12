/* =========================================================
   RotaSegura — script3.js (Parte 3)
   Chuva: efeito visual + botão menu + detecção automática
   ========================================================= */

// ===== ESTADO DA CHUVA =====
let rainCanvas3 = null;
let rainCtx3 = null;
let rainAnimId3 = null;
let rainDrops3 = [];
let rainAtivo3 = false;
const RAIN_COUNT3 = 80;

// Modo: 'auto' | 'on' | 'off'
let rainModo3 = 'auto';

try {
  const saved = localStorage.getItem('rs_rain_mode');
  if (saved === 'on' || saved === 'off' || saved === 'auto') {
    rainModo3 = saved;
  }
} catch (e) {}

// Vento global
let ventoX3 = 0;
let ventoTempo3 = 0;

// ===== DETECÇÃO DE CHUVA =====
let detCanvas3 = null;
let detCtx3 = null;
let detLoopId3 = null;
let frameAnterior3 = null;
let ultimaDeteccao3 = 0;  // timestamp
let chuvaDetectada3 = false;

const DET_W = 160;
const DET_H = 120;
const DET_INTERVALO = 500; // 2x por segundo

// ===== MENU: BOTÃO DO EFEITO CHUVA =====
function toggleRainFromMenu() {
  if (rainModo3 === 'auto') rainModo3 = 'on';
  else if (rainModo3 === 'on') rainModo3 = 'off';
  else rainModo3 = 'auto';

  try {
    localStorage.setItem('rs_rain_mode', rainModo3);
  } catch (e) {}

  atualizarMenuRain();

  if (rainModo3 === 'auto') {
    toast('🌧️ Chuva: Automático');
  } else if (rainModo3 === 'on') {
    toast('🌧️ Chuva: Sempre ligada');
  } else {
    toast('🌧️ Chuva: Desligada');
  }

  const hud = document.getElementById('hud');
  if (hud && hud.style.display === 'block') {
    aplicarModoChuva();
  }
}

function atualizarMenuRain() {
  const el = document.getElementById('menuRainValue');
  if (!el) return;
  if (rainModo3 === 'auto') el.textContent = 'Automático';
  else if (rainModo3 === 'on') el.textContent = 'Ligado';
  else el.textContent = 'Desligado';
}

function aplicarModoChuva() {
  if (rainModo3 === 'off') {
    stopRain3();
  } else if (rainModo3 === 'on') {
    if (!rainAtivo3) startRain3();
  } else if (rainModo3 === 'auto') {
    // No auto, começa desligado (a detecção liga se detectar chuva)
    if (!chuvaDetectada3 && rainAtivo3) {
      stopRain3();
    } else if (chuvaDetectada3 && !rainAtivo3) {
      startRain3();
    }
  }
}

// ===== OBSERVER DO HUD =====
function iniciarObserverHUD() {
  const hud = document.getElementById('hud');
  if (!hud) {
    console.warn('[chuva] HUD não encontrado');
    return;
  }

  atualizarMenuRain();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'style') {
        const display = hud.style.display;
        if (display === 'block') {
          console.log('[chuva] HUD abriu');
          // Só liga se NÃO estiver desligado
          if (rainModo3 === 'on') {
            startRain3();
          } else if (rainModo3 === 'auto') {
            // Inicia a detecção (só liga o efeito se detectar)
            iniciarDeteccao3();
          }
        } else if (display === 'none') {
          console.log('[chuva] HUD fechou');
          stopRain3();
          pararDeteccao3();
        }
      }
    }
  });

  observer.observe(hud, { attributes: true, attributeFilter: ['style'] });
  console.log('[chuva] observer ativo');
}

// ===== DETECÇÃO =====
function iniciarDeteccao3() {
  if (detLoopId3) return;

  // Cria canvas escondido pra análise
  if (!detCanvas3) {
    detCanvas3 = document.createElement('canvas');
    detCanvas3.width = DET_W;
    detCanvas3.height = DET_H;
    detCtx3 = detCanvas3.getContext('2d', { willReadFrequently: true });
  }

  chuvaDetectada3 = false;
  frameAnterior3 = null;
  ultimaDeteccao3 = Date.now();

  detLoopId3 = setInterval(() => {
    analisarFrame3();
  }, DET_INTERVALO);

  console.log('[chuva] detecção iniciada');
}

function pararDeteccao3() {
  if (detLoopId3) {
    clearInterval(detLoopId3);
    detLoopId3 = null;
  }
  frameAnterior3 = null;
  chuvaDetectada3 = false;
  console.log('[chuva] detecção parada');
}

function analisarFrame3() {
  const video = document.getElementById('cameraVideo');
  if (!video) return;
  if (video.readyState < 2) return; // video não pronto
  if (!detCtx3 || !detCanvas3) return;

  try {
    // Desenha o frame atual em miniatura
    detCtx3.drawImage(video, 0, 0, DET_W, DET_H);
    const frameAtual = detCtx3.getImageData(0, 0, DET_W, DET_H).data;

    if (!frameAnterior3) {
      frameAnterior3 = frameAtual;
      return;
    }

    // Compara frame atual com anterior
    // Procura mudanças em padrão VERTICAL (chuva)
    let pixelsMudancaTotal = 0;
    let pixelsMudancaVertical = 0;

    // Analisa uma grade
    const stepY = 4;
    const stepX = 4;

    for (let y = 0; y < DET_H; y += stepY) {
      for (let x = 0; x < DET_W; x += stepX) {
        const idx = (y * DET_W + x) * 4;
        const r1 = frameAnterior3[idx];
        const g1 = frameAnterior3[idx + 1];
        const b1 = frameAnterior3[idx + 2];
        const r2 = frameAtual[idx];
        const g2 = frameAtual[idx + 1];
        const b2 = frameAtual[idx + 2];

        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);

        if (diff > 40) {
          pixelsMudancaTotal++;
          // Verifica se o pixel acima também mudou (padrão vertical)
          const yAcima = y - stepY;
          if (yAcima >= 0) {
            const idxAcima = (yAcima * DET_W + x) * 4;
            const r1a = frameAnterior3[idxAcima];
            const g1a = frameAnterior3[idxAcima + 1];
            const b1a = frameAnterior3[idxAcima + 2];
            const r2a = frameAtual[idxAcima];
            const g2a = frameAtual[idxAcima + 1];
            const b2a = frameAtual[idxAcima + 2];
            const diffAcima = Math.abs(r1a - r2a) + Math.abs(g1a - g2a) + Math.abs(b1a - b2a);
            if (diffAcima > 40) {
              pixelsMudancaVertical++;
            }
          }
        }
      }
    }

    const total = (DET_H / stepY) * (DET_W / stepX);
    const ratioMudanca = pixelsMudancaTotal / total;
    const ratioVertical = pixelsMudancaVertical / Math.max(1, pixelsMudancaTotal);

    // Critério: pelo menos 8% dos pixels mudaram, e 40% das mudanças são verticais
    const detectou = ratioMudanca > 0.08 && ratioVertical > 0.4;

    if (detectou) {
      ultimaDeteccao3 = Date.now();
      if (!chuvaDetectada3) {
        chuvaDetectada3 = true;
        console.log('[chuva] detectada! Ligando efeito');
        if (rainModo3 === 'auto' && !rainAtivo3) {
          startRain3();
        }
      }
    } else {
      // Se não detecta há 5 segundos, desliga
      const agora = Date.now();
      if (chuvaDetectada3 && (agora - ultimaDeteccao3) > 5000) {
        chuvaDetectada3 = false;
        console.log('[chuva] parou de detectar. Desligando efeito');
        if (rainModo3 === 'auto' && rainAtivo3) {
          stopRain3();
        }
      }
    }

    frameAnterior3 = frameAtual;
  } catch (e) {
    console.warn('[chuva] erro análise:', e);
  }
}

// ===== CANVAS DE CHUVA =====
function startRain3() {
  if (rainCanvas3) return;
  if (rainModo3 === 'off') return;

  rainCanvas3 = document.createElement('canvas');
  rainCanvas3.id = 'rainCanvas3';
  rainCanvas3.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1600;
    pointer-events: none;
  `;
  document.body.appendChild(rainCanvas3);

  rainCtx3 = rainCanvas3.getContext('2d', { alpha: true });
  resizeRainCanvas3();
  window.addEventListener('resize', resizeRainCanvas3);

  criarGotas3();
  rainAtivo3 = true;
  animateRain3();
  console.log('[chuva] canvas ativo');
}

function stopRain3() {
  if (rainAnimId3) {
    cancelAnimationFrame(rainAnimId3);
    rainAnimId3 = null;
  }
  if (rainCanvas3) {
    rainCanvas3.remove();
    rainCanvas3 = null;
    rainCtx3 = null;
  }
  rainDrops3 = [];
  rainAtivo3 = false;
  window.removeEventListener('resize', resizeRainCanvas3);
}

function resizeRainCanvas3() {
  if (!rainCanvas3) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  rainCanvas3.width = window.innerWidth * dpr;
  rainCanvas3.height = window.innerHeight * dpr;
  rainCtx3.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== GOTAS =====
function criarGotas3() {
  rainDrops3 = [];
  const W = window.innerWidth;
  const H = window.innerHeight;

  for (let i = 0; i < RAIN_COUNT3; i++) {
    const tipo = Math.random() < 0.7 ? 'queda' : 'grudada';

    let tamanho;
    const r = Math.random();
    if (r < 0.5) tamanho = 'pequena';
    else if (r < 0.85) tamanho = 'media';
    else tamanho = 'grande';

    let len;
    if (tipo === 'queda') {
      if (tamanho === 'pequena') len = 6 + Math.random() * 8;
      else if (tamanho === 'media') len = 14 + Math.random() * 10;
      else len = 24 + Math.random() * 15;
    } else {
      if (tamanho === 'pequena') len = 1.5 + Math.random() * 1.5;
      else if (tamanho === 'media') len = 3 + Math.random() * 2;
      else len = 5 + Math.random() * 3;
    }

    let vy;
    if (tamanho === 'pequena') vy = 6 + Math.random() * 4;
    else if (tamanho === 'media') vy = 10 + Math.random() * 6;
    else vy = 14 + Math.random() * 8;

    let alpha;
    if (tipo === 'queda') alpha = 0.20 + Math.random() * 0.35;
    else alpha = 0.15 + Math.random() * 0.30;

    rainDrops3.push({
      tipo,
      tamanho,
      x: Math.random() * W,
      y: Math.random() * H,
      vy,
      vx: 0,
      len,
      alpha,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.05,
      escorrendo: tipo === 'grudada' && Math.random() < 0.4,
      escorrendoVel: 0.3 + Math.random() * 0.8,
      vida: tipo === 'grudada' ? (Math.random() * 600 + 200) : 0
    });
  }
}

// ===== ANIMAÇÃO =====
function animateRain3() {
  if (!rainCtx3 || !rainCanvas3) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  rainCtx3.clearRect(0, 0, W, H);

  ventoTempo3 += 0.005;
  ventoX3 = Math.sin(ventoTempo3) * 0.8;

  for (const g of rainDrops3) {
    if (g.tipo === 'queda') {
      g.wobble += g.wobbleSpeed;
      const wobbleX = Math.sin(g.wobble) * 0.4;
      const desvioX = ventoX3 + wobbleX;
      const fimX = g.x + desvioX * g.len * 0.15;
      const fimY = g.y + g.len;

      const grad = rainCtx3.createLinearGradient(g.x, g.y, fimX, fimY);
      grad.addColorStop(0, 'rgba(180, 210, 240, 0)');
      grad.addColorStop(0.3, 'rgba(200, 225, 255, ' + g.alpha * 0.6 + ')');
      grad.addColorStop(0.7, 'rgba(220, 240, 255, ' + g.alpha + ')');
      grad.addColorStop(1, 'rgba(200, 225, 255, 0)');

      rainCtx3.strokeStyle = grad;
      rainCtx3.lineWidth = g.tamanho === 'grande' ? 1.6 : 1.1;
      rainCtx3.lineCap = 'round';
      rainCtx3.beginPath();
      rainCtx3.moveTo(g.x, g.y);
      rainCtx3.lineTo(fimX, fimY);
      rainCtx3.stroke();

      g.y += g.vy;
      g.x += desvioX * 0.5;

      if (g.y > H + 30) {
        g.y = -30;
        g.x = Math.random() * W;
      }
      if (g.x < -30) g.x = W + 30;
      if (g.x > W + 30) g.x = -30;

    } else {
      if (g.escorrendo) {
        g.y += g.escorrendoVel;
        if (g.y > H + 10) {
          g.x = Math.random() * W;
          g.y = Math.random() * H * 0.5;
        }
      }

      rainCtx3.save();
      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x, g.y, g.len, g.len * 1.2, 0, 0, Math.PI * 2);
      rainCtx3.fillStyle = 'rgba(120, 150, 180, ' + (g.alpha * 0.6) + ')';
      rainCtx3.fill();

      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x - g.len * 0.25, g.y - g.len * 0.35, g.len * 0.5, g.len * 0.55, 0, 0, Math.PI * 2);
      rainCtx3.fillStyle = 'rgba(255, 255, 255, ' + (g.alpha * 1.3) + ')';
      rainCtx3.fill();

      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x, g.y, g.len, g.len * 1.2, 0, 0, Math.PI * 2);
      rainCtx3.strokeStyle = 'rgba(220, 240, 255, ' + (g.alpha * 0.8) + ')';
      rainCtx3.lineWidth = 0.6;
      rainCtx3.stroke();

      rainCtx3.restore();

      g.vida -= 1;
      if (g.vida <= 0) {
        g.x = Math.random() * W;
        g.y = Math.random() * H;
        g.vida = Math.random() * 600 + 200;
      }
    }
  }

  rainAnimId3 = requestAnimationFrame(animateRain3);
}

// ===== INIT =====
window.addEventListener('load', () => {
  setTimeout(iniciarObserverHUD, 500);
});

window.addEventListener('beforeunload', () => {
  stopRain3();
  pararDeteccao3();
});

console.log('[RotaSegura] script3.js (Parte 3) carregado — chuva + detecção');
