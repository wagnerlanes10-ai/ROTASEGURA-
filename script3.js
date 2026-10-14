/* =========================================================
   RotaSegura — script3.js (Parte 3)
   Chuva v3: intensidade dinâmica + splash + rastro + detecção
   ========================================================= */

// ===== ESTADO DA CHUVA =====
let rainCanvas3 = null;
let rainCtx3 = null;
let rainAnimId3 = null;
let rainDrops3 = [];
let rainAtivo3 = false;

// Intensidade (0.3 = fraca, 0.6 = média, 1.0 = forte)
let intensidadeChuva3 = 0.6;

// Quantidade de gotas (varia com intensidade)
let rainCount3 = 80;

let rainModo3 = 'auto';

try {
  const saved = localStorage.getItem('rs_rain_mode');
  if (saved === 'on' || saved === 'off' || saved === 'auto') {
    rainModo3 = saved;
  }
} catch (e) {}

let ventoX3 = 0;
let ventoTempo3 = 0;

// ===== DETECÇÃO =====
let detCanvas3 = null;
let detCtx3 = null;
let detLoopId3 = null;
let frameAnterior3 = null;
let ultimaDeteccao3 = 0;
let chuvaDetectada3 = false;
let historicoDeteccao3 = [];

// Histórico de intensidade (média suavizada)
let historicoIntensidade3 = [];

const DET_W = 160;
const DET_H = 120;
const DET_INTERVALO = 500;

// ===== MENU =====
function toggleRainFromMenu() {
  if (rainModo3 === 'auto') rainModo3 = 'on';
  else if (rainModo3 === 'on') rainModo3 = 'off';
  else rainModo3 = 'auto';

  try {
    localStorage.setItem('rs_rain_mode', rainModo3);
  } catch (e) {}

  atualizarMenuRain();

  if (rainModo3 === 'auto') toast('🌧️ Chuva: Automático');
  else if (rainModo3 === 'on') toast('🌧️ Chuva: Sempre ligada');
  else toast('🌧️ Chuva: Desligada');

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
    if (!chuvaDetectada3 && rainAtivo3) stopRain3();
    else if (chuvaDetectada3 && !rainAtivo3) startRain3();
  }
}

// ===== OBSERVER =====
function iniciarObserverHUD() {
  const hud = document.getElementById('hud');
  if (!hud) return;

  atualizarMenuRain();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'style') {
        const display = hud.style.display;
        if (display === 'block') {
          if (rainModo3 === 'on') startRain3();
          else if (rainModo3 === 'auto') iniciarDeteccao3();
        } else if (display === 'none') {
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

  if (!detCanvas3) {
    detCanvas3 = document.createElement('canvas');
    detCanvas3.width = DET_W;
    detCanvas3.height = DET_H;
    detCtx3 = detCanvas3.getContext('2d', { willReadFrequently: true });
  }

  chuvaDetectada3 = false;
  frameAnterior3 = null;
  historicoDeteccao3 = [];
  historicoIntensidade3 = [];
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
  historicoDeteccao3 = [];
  historicoIntensidade3 = [];
  console.log('[chuva] detecção parada');
}

function analisarFrame3() {
  const video = document.getElementById('cameraVideo');
  if (!video) return;
  if (video.readyState < 2) return;
  if (!detCtx3 || !detCanvas3) return;

  try {
    detCtx3.drawImage(video, 0, 0, DET_W, DET_H);
    const frameAtual = detCtx3.getImageData(0, 0, DET_W, DET_H).data;

    if (!frameAnterior3) {
      frameAnterior3 = frameAtual;
      return;
    }

    let pixelsMudancaTotal = 0;
    let pixelsMudancaVertical = 0;

    const stepY = 4;
    const stepX = 4;

    for (let y = 0; y < DET_H; y += stepY) {
      for (let x = 0; x < DET_W; x += stepX) {
        const idx = (y * DET_W + x) * 4;
        const diff = Math.abs(frameAnterior3[idx] - frameAtual[idx]) +
                     Math.abs(frameAnterior3[idx + 1] - frameAtual[idx + 1]) +
                     Math.abs(frameAnterior3[idx + 2] - frameAtual[idx + 2]);

        if (diff > 30) {
          pixelsMudancaTotal++;
          const yAcima = y - stepY;
          if (yAcima >= 0) {
            const idxAcima = (yAcima * DET_W + x) * 4;
            const diffAcima = Math.abs(frameAnterior3[idxAcima] - frameAtual[idxAcima]) +
                              Math.abs(frameAnterior3[idxAcima + 1] - frameAtual[idxAcima + 1]) +
                              Math.abs(frameAnterior3[idxAcima + 2] - frameAtual[idxAcima + 2]);
            if (diffAcima > 30) pixelsMudancaVertical++;
          }
        }
      }
    }

    const total = (DET_H / stepY) * (DET_W / stepX);
    const ratioMudanca = pixelsMudancaTotal / total;
    const ratioVertical = pixelsMudancaVertical / Math.max(1, pixelsMudancaTotal);

    const detectouAgora = ratioMudanca > 0.04 && ratioVertical > 0.20;

    // ===== CALCULA INTENSIDADE =====
    // Baseada na % de mudança: mais pixels mudando = chuva mais forte
    let intensidadeAgora = 0;
    if (detectouAgora) {
      if (ratioMudanca < 0.10) intensidadeAgora = 0.3;        // fraca
      else if (ratioMudanca < 0.20) intensidadeAgora = 0.6;   // média
      else intensidadeAgora = 1.0;                             // forte
    }

    // Suaviza a intensidade (média das últimas 3)
    historicoIntensidade3.push(intensidadeAgora);
    if (historicoIntensidade3.length > 3) historicoIntensidade3.shift();
    const intensidadeSuave = historicoIntensidade3.reduce((a, b) => a + b, 0) / historicoIntensidade3.length;

    // Suaviza a detecção (2 de 3)
    historicoDeteccao3.push(detectouAgora);
    if (historicoDeteccao3.length > 3) historicoDeteccao3.shift();
    const detectouConsistente = historicoDeteccao3.length >= 2 &&
                                 historicoDeteccao3.filter(x => x).length >= 2;

    console.log('[chuva] mudanca=' + (ratioMudanca * 100).toFixed(1) + '% intensidade=' + (intensidadeSuave * 100).toFixed(0) + '% detectou=' + detectouConsistente);

    if (detectouConsistente) {
      ultimaDeteccao3 = Date.now();

      // ===== ATUALIZA INTENSIDADE =====
      atualizarIntensidade3(intensidadeSuave);

      if (!chuvaDetectada3) {
        chuvaDetectada3 = true;
        console.log('[chuva] DETECTADA! Ligando efeito');
        if (rainModo3 === 'auto' && !rainAtivo3) startRain3();
      }
    } else {
      const agora = Date.now();
      if (chuvaDetectada3 && (agora - ultimaDeteccao3) > 4000) {
        chuvaDetectada3 = false;
        console.log('[chuva] parou de detectar. Desligando');
        if (rainModo3 === 'auto' && rainAtivo3) stopRain3();
      }
    }

    frameAnterior3 = frameAtual;
  } catch (e) {
    console.warn('[chuva] erro análise:', e);
  }
}

// ===== ATUALIZA INTENSIDADE =====
function atualizarIntensidade3(intensidade) {
  if (!rainAtivo3) return;

  intensidadeChuva3 = intensidade;

  // Recalcula a quantidade de gotas
  const novoCount = Math.round(20 + intensidade * 130); // 20 a 150
  if (Math.abs(novoCount - rainCount3) > 10) {
    rainCount3 = novoCount;
    // Ajusta sem recriar todas (adiciona ou remove)
    ajustarGotas3();
  }
}

function ajustarGotas3() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  // Se tem gotas demais, remove
  while (rainDrops3.length > rainCount3) {
    rainDrops3.pop();
  }

  // Se tem poucas, adiciona
  while (rainDrops3.length < rainCount3) {
    rainDrops3.push(criarGota3(W, H));
  }
}

// ===== CRIAR GOTA =====
function criarGota3(W, H) {
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

  // Velocidade aumenta com intensidade
  vy *= (0.7 + intensidadeChuva3 * 0.6);

  let alpha;
  if (tipo === 'queda') alpha = 0.20 + Math.random() * 0.35;
  else alpha = 0.15 + Math.random() * 0.30;

  return {
    tipo, tamanho,
    x: Math.random() * W,
    y: Math.random() * H,
    vy, vx: 0, len, alpha,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.02 + Math.random() * 0.05,
    escorrendo: tipo === 'grudada' && Math.random() < 0.4,
    escorrendoVel: 0.3 + Math.random() * 0.8,
    vida: tipo === 'grudada' ? (Math.random() * 600 + 200) : 0,
    // Rastro (não usado pra todas)
    temRastro: tipo === 'grudada' && Math.random() < 0.3,
    rastro: []
  };
}

// ===== CANVAS =====
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

  // Cria gotas iniciais baseado na intensidade atual
  rainCount3 = Math.round(20 + intensidadeChuva3 * 130);
  criarGotas3();
  rainAtivo3 = true;
  animateRain3();
  console.log('[chuva] canvas ativo com', rainCount3, 'gotas');
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

  for (let i = 0; i < rainCount3; i++) {
    rainDrops3.push(criarGota3(W, H));
  }
}

// ===== SPLASH (respingo) =====
let splashes3 = [];

function criarSplash3(x, y) {
  const num = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < num; i++) {
    const angulo = Math.random() * Math.PI * 2;
    const vel = 1 + Math.random() * 2;
    splashes3.push({
      x, y,
      vx: Math.cos(angulo) * vel,
      vy: Math.sin(angulo) * vel - 1,
      vida: 15 + Math.random() * 10,
      alpha: 0.4 + Math.random() * 0.3
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
  ventoX3 = Math.sin(ventoTempo3) * 0.8 * (0.5 + intensidadeChuva3 * 0.8);

  // ===== GOTAS =====
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

      // Caiu: rebobina
      if (g.y > H + 30) {
        // Chance de criar splash (só se não tiver chovendo fraco)
        if (Math.random() < intensidadeChuva3 * 0.5) {
          criarSplash3(g.x, H - 10);
        }
        g.y = -30;
        g.x = Math.random() * W;
      }
      if (g.x < -30) g.x = W + 30;
      if (g.x > W + 30) g.x = -30;

    } else {
      // ===== GRUDADA =====
      if (g.escorrendo) {
        // ===== RASTRO =====
        if (g.temRastro) {
          g.rastro.push({ x: g.x, y: g.y });
          if (g.rastro.length > 15) g.rastro.shift();
        }

        g.y += g.escorrendoVel;
        if (g.y > H + 10) {
          g.x = Math.random() * W;
          g.y = Math.random() * H * 0.5;
          g.rastro = [];
        }
      }

      // ===== DESENHA RASTRO PRIMEIRO =====
      if (g.temRastro && g.rastro.length > 1) {
        rainCtx3.strokeStyle = 'rgba(180, 210, 240, ' + (g.alpha * 0.3) + ')';
        rainCtx3.lineWidth = g.len * 1.5;
        rainCtx3.lineCap = 'round';
        rainCtx3.beginPath();
        rainCtx3.moveTo(g.rastro[0].x, g.rastro[0].y);
        for (let i = 1; i < g.rastro.length; i++) {
          rainCtx3.lineTo(g.rastro[i].x, g.rastro[i].y);
        }
        rainCtx3.stroke();
      }

      // ===== DESENHA A GOTA =====
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
        g.rastro = [];
      }
    }
  }

  // ===== SPLASHES =====
  for (let i = splashes3.length - 1; i >= 0; i--) {
    const s = splashes3[i];
    rainCtx3.beginPath();
    rainCtx3.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
    rainCtx3.fillStyle = 'rgba(200, 225, 255, ' + s.alpha + ')';
    rainCtx3.fill();

    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.2; // gravidade
    s.vida--;
    s.alpha *= 0.92;

    if (s.vida <= 0) splashes3.splice(i, 1);
  }

  rainAnimId3 = requestAnimationFrame(animateRain3);
}

window.addEventListener('load', () => {
  setTimeout(iniciarObserverHUD, 500);
});

window.addEventListener('beforeunload', () => {
  stopRain3();
  pararDeteccao3();
});

console.log('[RotaSegura] script3.js (Parte 3) carregado — chuva v3 com intensidade dinâmica');
