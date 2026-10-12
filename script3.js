/* =========================================================
   RotaSegura — script3.js (Parte 3)
   Efeito visual de chuva no modo para-brisa
   Independente: usa MutationObserver no HUD
   ========================================================= */

// ===== ESTADO DA CHUVA =====
let rainCanvas3 = null;
let rainCtx3 = null;
let rainAnimId3 = null;
let rainDrops3 = [];
let rainAtivo3 = false;
const RAIN_COUNT3 = 80;

// ===== OBSERVER DO HUD =====
// Fica olhando quando o #hud aparece/desaparece
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

// ===== CANVAS DA CHUVA =====
function startRain3() {
  if (rainCanvas3) return;

  rainCanvas3 = document.createElement('canvas');
  rainCanvas3.id = 'rainCanvas3';
  // z-index 1600 = na frente das setas (que é 1500)
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
  console.log('[chuva] canvas removido');
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
    // 70% gotas caindo, 30% gotas grudadas
    const tipo = Math.random() < 0.7 ? 'queda' : 'grudada';
    rainDrops3.push({
      tipo,
      x: Math.random() * W,
      y: Math.random() * H,
      vy: 8 + Math.random() * 12,
      vx: -0.3 + Math.random() * 0.6,
      len: tipo === 'queda' ? (10 + Math.random() * 20) : (2 + Math.random() * 4),
      alpha: tipo === 'queda' ? (0.25 + Math.random() * 0.35) : (0.15 + Math.random() * 0.25),
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

  for (const g of rainDrops3) {
    if (g.tipo === 'queda') {
      // Traço de chuva caindo
      const grad = rainCtx3.createLinearGradient(g.x, g.y, g.x + g.vx * 2, g.y + g.len);
      grad.addColorStop(0, 'rgba(180, 210, 240, ' + (g.alpha * 0.2) + ')');
      grad.addColorStop(0.5, 'rgba(200, 225, 255, ' + g.alpha + ')');
      grad.addColorStop(1, 'rgba(220, 240, 255, 0)');
      rainCtx3.strokeStyle = grad;
      rainCtx3.lineWidth = 1.2;
      rainCtx3.beginPath();
      rainCtx3.moveTo(g.x, g.y);
      rainCtx3.lineTo(g.x + g.vx * 2, g.y + g.len);
      rainCtx3.stroke();

      // Move
      g.y += g.vy;
      g.x += g.vx;

      // Rebobina no topo
      if (g.y > H + 30) {
        g.y = -30;
        g.x = Math.random() * W;
      }
      if (g.x < -20) g.x = W + 20;
      if (g.x > W + 20) g.x = -20;
    } else {
      // Gota grudada no vidro (círculo com highlight)
      rainCtx3.beginPath();
      rainCtx3.arc(g.x, g.y, g.len, 0, Math.PI * 2);
      rainCtx3.fillStyle = 'rgba(140, 170, 200, ' + (g.alpha * 0.5) + ')';
      rainCtx3.fill();

      // Highlight de luz
      rainCtx3.beginPath();
      rainCtx3.arc(g.x - g.len * 0.3, g.y - g.len * 0.3, g.len * 0.4, 0, Math.PI * 2);
      rainCtx3.fillStyle = 'rgba(255, 255, 255, ' + (g.alpha * 1.2) + ')';
      rainCtx3.fill();

      // Conta vida
      g.vida -= 1;
      if (g.vida <= 0) {
        g.x = Math.random() * W;
        g.y = Math.random() * H;
        g.len = 2 + Math.random() * 4;
        g.vida = Math.random() * 600 + 200;
      }
    }
  }

  rainAnimId3 = requestAnimationFrame(animateRain3);
}

// ===== INIT =====
// Espera o DOM carregar completamente pra criar o observer
window.addEventListener('load', () => {
  // Espera um pouquinho pra garantir que o #hud já existe
  setTimeout(iniciarObserverHUD, 500);
});

// ===== LIMPEZA =====
window.addEventListener('beforeunload', () => {
  stopRain3();
});

console.log('[RotaSegura] script3.js (Parte 3) carregado — chuva independente');
