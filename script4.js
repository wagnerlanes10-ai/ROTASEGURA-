/* =========================================================
   RotaSegura — script4.js
   Setas curvas (versão alternativa, não modifica script2.js)
   ========================================================= */

(function () {
  'use strict';

  let s4Ativo = false;
  let s4DesvioAtual = 0;
  let s4DesvioAlvo = 0;
  let s4CurvaLoopId = null;
  let s4AnimId = null;
  let s4Canvas = null;
  let s4Ctx = null;
  let s4Offset = 0;
  let s4W = 0;
  let s4H = 0;

  function log(msg) { console.log('[script4]', msg); }

  function instalar() {
    const hud = document.getElementById('hud');
    if (!hud) { setTimeout(instalar, 300); return; }

    log('observer instalado');

    const observer = new MutationObserver(() => {
      const visivel = hud.style.display === 'block';
      if (visivel && !s4Ativo) iniciar();
      else if (!visivel && s4Ativo) parar();
    });

    observer.observe(hud, { attributes: true, attributeFilter: ['style'] });
  }

  function iniciar() {
    s4Ativo = true;
    log('iniciando setas curvas');

    // Esconde o canvas do script2
    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = 'none';

    // Cria o canvas do script4
    s4Canvas = document.createElement('canvas');
    s4Canvas.id = 'arrowCanvasCurvo';
    s4Canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;' +
      'z-index:1501;pointer-events:none;';
    document.body.appendChild(s4Canvas);

    s4Ctx = s4Canvas.getContext('2d', { alpha: true });
    redimensionar();
    window.addEventListener('resize', redimensionar);

    s4Offset = 0;
    s4DesvioAtual = 0;
    s4DesvioAlvo = 0;

    // Loop de cálculo (1x/1.5s)
    calcular();
    s4CurvaLoopId = setInterval(calcular, 1500);

    // Loop de desenho (60x/s)
    loop();
  }

  function parar() {
    s4Ativo = false;
    if (s4AnimId) { cancelAnimationFrame(s4AnimId); s4AnimId = null; }
    if (s4CurvaLoopId) { clearInterval(s4CurvaLoopId); s4CurvaLoopId = null; }
    if (s4Canvas) { s4Canvas.remove(); s4Canvas = null; s4Ctx = null; }
    window.removeEventListener('resize', redimensionar);

    // Mostra o canvas do script2 de volta
    const antigo = document.getElementById('arrowCanvas');
    if (antigo) antigo.style.display = '';

    log('setas curvas paradas');
  }

  function redimensionar() {
    if (!s4Canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s4W = window.innerWidth;
    s4H = window.innerHeight;
    s4Canvas.width = s4W * dpr;
    s4Canvas.height = s4H * dpr;
    s4Ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function calcular() {
    if (!s4Ativo) return;
    const el = document.getElementById('hudInstruction');
    if (!el) return;
    const instrucao = (el.textContent || '').trim();

    let fatorInst = 0;
    if (instrucao.includes('Chegada')) fatorInst = 0;
    else if (instrucao.includes('Retorne')) fatorInst = -0.7;
    else if (instrucao.includes('Curva acentuada à direita')) fatorInst = 1.0;
    else if (instrucao.includes('Curva acentuada à esquerda')) fatorInst = -1.0;
    else if (instrucao.includes('Curva suave à direita')) fatorInst = 0.6;
    else if (instrucao.includes('Curva suave à esquerda')) fatorInst = -0.6;
    else if (instrucao.includes('Vire à direita')) fatorInst = 0.9;
    else if (instrucao.includes('Vire à esquerda')) fatorInst = -0.9;
    else if (instrucao.includes('rotatória')) fatorInst = 0.7;
    else if (instrucao.includes('Entre na via') || instrucao.includes('Mantenha-se')) {
      if (instrucao.includes('direita')) fatorInst = 0.6;
      else if (instrucao.includes('esquerda')) fatorInst = -0.6;
    }

    // Lê a distância do hudDistance
    const elD = document.getElementById('hudDistance');
    let dist = 0;
    if (elD) {
      const txt = elD.textContent || '';
      const m = txt.match(/([\d.,]+)\s*(km|m)/i);
      if (m) {
        let v = parseFloat(m[1].replace(',', '.'));
        if (m[2].toLowerCase() === 'km') v *= 1000;
        dist = v;
      }
    }

    let fatorDist = 0;
    if (dist > 300) fatorDist = 0;
    else if (dist > 100) fatorDist = 0.35;
    else if (dist > 30) fatorDist = 0.65;
    else fatorDist = 1.0;

    s4DesvioAlvo = fatorInst * fatorDist;
  }

  function loop() {
    if (!s4Ctx || !s4Canvas) return;
    const W = s4W;
    const H = s4H;
    s4Ctx.clearRect(0, 0, W, H);

    s4DesvioAtual += (s4DesvioAlvo - s4DesvioAtual) * 0.04;

    const n = 10;
    const horizonY = H * 0.32;
    const baseY = H * 1.02;
    const cx = W / 2;
    const deslocMax = W * 0.30;
    const rotMax = 35;

    for (let i = n - 1; i >= 0; i--) {
      const bf = i / n;
      const af = (bf + s4Offset) % 1;

      const y = baseY - af * (baseY - horizonY);
      const ss = Math.pow(1 - af, 1.2) * 0.85 + 0.15;
      const aw = W * 0.32 * ss;
      const ah = W * 0.16 * ss;

      const fx = af * af * (3 - 2 * af);
      const fr = Math.pow(af, 1.4);

      const xo = s4DesvioAtual * deslocMax * fx;
      const x = cx + xo;
      const rot = s4DesvioAtual * rotMax * fr;

      const alpha = Math.max(0.5, 0.55 + ss * 0.45);
      desenhar(s4Ctx, x, y, aw, ah, alpha, rot);
    }

    s4Offset = (s4Offset + 0.008) % 1;
    s4AnimId = requestAnimationFrame(loop);
  }

  function desenhar(ctx, cx, cy, w, h, alpha, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot * Math.PI / 180);

    const x1 = -w/2, y1 = 0;
    const x2 = 0, y2 = -h;
    const x3 = w/2, y3 = 0;
    const nY = y3 - h * 0.35;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x2, nY);
    ctx.closePath();

    ctx.fillStyle = 'rgba(0,210,255,' + Math.min(1, alpha + 0.15) + ')';
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, alpha + 0.2) + ')';
    ctx.lineWidth = Math.max(2.5, w * 0.08);
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.restore();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(instalar, 500);
  } else {
    window.addEventListener('load', function () { setTimeout(instalar, 500); });
  }
})();
