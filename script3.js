/* =========================================================
   RotaSegura — script3.js (Parte 3)
   Efeito visual de chuva melhorado (v2)
   Independente: usa MutationObserver no HUD
   ========================================================= */

// ===== ESTADO DA CHUVA =====
let rainCanvas3 = null;
let rainCtx3 = null;
let rainAnimId3 = null;
let rainDrops3 = [];
let rainAtivo3 = false;
const RAIN_COUNT3 = 80;

// Vento global (muda suavemente ao longo do tempo)
let ventoX3 = 0;
let ventoTempo3 = 0;

// ===== OBSERVER DO HUD =====
function iniciarObserverHUD() {
  const hud = document.getElementById('hud');
  if (!hud) {
    console.warn('[chuva] HUD não encontrado');
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'style') {
        const display = hud.style.display;
        if (display === 'block' && !rainAtivo3) {
          console.log('[chuva] HUD abriu — ligando chuva');
          startRain3();
        } else if (display === 'none' && rainAtivo3) {
          console.log('[chuva] HUD fechou — desligando chuva');
          stopRain3();
        }
      }
    }
  });

  observer.observe(hud, { attributes: true, attributeFilter: ['style'] });
  console.log('[chuva] observer ativo');
}

// ===== CANVAS =====
function startRain3() {
  if (rainCanvas3) return;

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
    // 70% caindo, 30% grudadas
    const tipo = Math.random() < 0.7 ? 'queda' : 'grudada';

    // ===== TAMANHO (3 categorias) =====
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

    // ===== VELOCIDADE =====
    let vy;
    if (tamanho === 'pequena') vy = 6 + Math.random() * 4;
    else if (tamanho === 'media') vy = 10 + Math.random() * 6;
    else vy = 14 + Math.random() * 8;

    // ===== OPACIDADE =====
    let alpha;
    if (tipo === 'queda') alpha = 0.20 + Math.random() * 0.35;
    else alpha = 0.15 + Math.random() * 0.30;

    rainDrops3.push({
      tipo,
      tamanho,
      x: Math.random() * W,
      y: Math.random() * H,
      vy,
      vx: 0,           // será calculado com base no vento global
      len,
      alpha,
      // Balanço lateral (wobble)
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.05,
      // Gotas grudadas: escorrendo ou estáticas
      escorrendo: tipo === 'grudada' && Math.random() < 0.4,
      escorrendoVel: 0.3 + Math.random() * 0.8,
      // Vida (grudadas somem e renascem)
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

  // ===== VENTO GLOBAL (muda lentamente) =====
  ventoTempo3 += 0.005;
  ventoX3 = Math.sin(ventoTempo3) * 0.8; // oscila entre -0.8 e +0.8

  for (const g of rainDrops3) {
    if (g.tipo === 'queda') {
      // ===== CAINDO =====
      // Balanço lateral (wobble)
      g.wobble += g.wobbleSpeed;
      const wobbleX = Math.sin(g.wobble) * 0.4;

      // Posição final (com vento + wobble)
      const desvioX = ventoX3 + wobbleX;
      const fimX = g.x + desvioX * g.len * 0.15;
      const fimY = g.y + g.len;

      // Traço com gradiente (mais claro em cima, some embaixo)
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

      // Move
      g.y += g.vy;
      g.x += desvioX * 0.5;

      // Rebobina no topo
      if (g.y > H + 30) {
        g.y = -30;
        g.x = Math.random() * W;
      }
      // Saiu lateral
      if (g.x < -30) g.x = W + 30;
      if (g.x > W + 30) g.x = -30;

    } else {
      // ===== GRUDADA =====
      // Algumas escorrem devagar
      if (g.escorrendo) {
        g.y += g.escorrendoVel;
        if (g.y > H + 10) {
          // Renasce em outro lugar
          g.x = Math.random() * W;
          g.y = Math.random() * H * 0.5;
        }
      }

      // Corpo da gota (elipse levemente alongada verticalmente)
      rainCtx3.save();
      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x, g.y, g.len, g.len * 1.2, 0, 0, Math.PI * 2);
      // Fundo escuro (sombra da gota)
      rainCtx3.fillStyle = 'rgba(120, 150, 180, ' + (g.alpha * 0.6) + ')';
      rainCtx3.fill();

      // Highlight (reflexo da luz, canto superior esquerdo)
      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x - g.len * 0.25, g.y - g.len * 0.35, g.len * 0.5, g.len * 0.55, 0, 0, Math.PI * 2);
      rainCtx3.fillStyle = 'rgba(255, 255, 255, ' + (g.alpha * 1.3) + ')';
      rainCtx3.fill();

      // Bordinha brilhante (contorno)
      rainCtx3.beginPath();
      rainCtx3.ellipse(g.x, g.y, g.len, g.len * 1.2, 0, 0, Math.PI * 2);
      rainCtx3.strokeStyle = 'rgba(220, 240, 255, ' + (g.alpha * 0.8) + ')';
      rainCtx3.lineWidth = 0.6;
      rainCtx3.stroke();

      rainCtx3.restore();

      // Vida útil
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
});

console.log('[RotaSegura] script3.js (Parte 3) carregado — chuva melhorada v2');
