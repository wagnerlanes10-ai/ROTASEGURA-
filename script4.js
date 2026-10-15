/* =========================================================
   RotaSegura — script4.js (Parte 4)
   Setas curvas (override do animateArrows do script2.js)
   Se este arquivo for removido, script2.js volta a funcionar
   ========================================================= */

(function() {
  'use strict';

  // Espera o script2.js carregar antes de fazer override
  function instalarSetasCurvas() {
    if (typeof window.animateArrows !== 'function') {
      // script2.js ainda não carregou — tenta de novo em 200ms
      setTimeout(instalarSetasCurvas, 200);
      return;
    }

    console.log('[script4] instalando setas curvas...');

    // ===== ESTADO DA CURVA =====
    let desvioAtual = 0;
    let desvioAlvo = 0;
    let curvaLoopId = null;

    // ===== CALCULA DESVIO BASEADO NA INSTRUÇÃO + DISTÂNCIA =====
    function calcularDesvio() {
      const el = document.getElementById('hudInstruction');
      if (!el) return;
      const instrucao = el.textContent?.trim() || '';

      // Fator da instrução
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
      else if (instrucao.includes('Entre na via') || instrucao.includes('Mantenha-se')) {
        if (instrucao.includes('direita')) fatorInstrucao = 0.6;
        else if (instrucao.includes('esquerda')) fatorInstrucao = -0.6;
      } else fatorInstrucao = 0;

      // Fator da distância
      // Pega a distância do elemento hudDistance
      const elDist = document.getElementById('hudDistance');
      let distancia = 0;
      if (elDist) {
        const txt = elDist.textContent || '';
        const match = txt.match(/([\d.,]+)\s*(km|m)/i);
        if (match) {
          let valor = parseFloat(match[1].replace(',', '.'));
          if (match[2].toLowerCase() === 'km') valor *= 1000;
          distancia = valor;
        }
      }

      let fatorDistancia = 0;
      if (distancia > 300) fatorDistancia = 0;
      else if (distancia > 100) fatorDistancia = 0.35;
      else if (distancia > 30) fatorDistancia = 0.65;
      else fatorDistancia = 1.0;

      desvioAlvo = fatorInstrucao * fatorDistancia;
    }

    // ===== LOOP DE CÁLCULO (1x/1.5s) =====
    function iniciarCurvaLoop() {
      if (curvaLoopId) return;
      curvaLoopId = setInterval(() => {
        if (!window.hudActive) return;
        calcularDesvio();
      }, 1500);
    }

    // ===== DRAW DA SETA COM ROTAÇÃO =====
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

    // ===== OVERRIDE: animateArrows com curva =====
    window.animateArrows = function() {
      if (!arrowCtx || !arrowCanvas) return;
      const W = canvasW;
      const H = canvasH;
      arrowCtx.clearRect(0, 0, W, H);

      // Suaviza o desvio
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
      arrowAnimId = requestAnimationFrame(window.animateArrows);
    };

    // ===== SOBRESCREVE startArrowCanvas PRA RODAR O NOVO LOOP =====
    const originalStart = window.startArrowCanvas;
    window.startArrowCanvas = function() {
      if (originalStart) originalStart();
      desvioAtual = 0;
      desvioAlvo = 0;
      iniciarCurvaLoop();
    };

    // ===== SOBRESCREVE stopArrowCanvas PRA PARAR O LOOP =====
    const originalStop = window.stopArrowCanvas;
    window.stopArrowCanvas = function() {
      if (curvaLoopId) { clearInterval(curvaLoopId); curvaLoopId = null; }
      desvioAtual = 0;
      desvioAlvo = 0;
      if (originalStop) originalStop();
    };

    // ===== SE JÁ TEM CANVAS RODANDO, REINICIA =====
    if (arrowCanvas && arrowAnimId) {
      cancelAnimationFrame(arrowAnimId);
      window.animateArrows();
      iniciarCurvaLoop();
    }

    console.log('[script4] setas curvas instaladas ✓');
  }

  // Aguarda o carregamento completo
  if (document.readyState === 'complete') {
    setTimeout(instalarSetasCurvas, 300);
  } else {
    window.addEventListener('load', () => {
      setTimeout(instalarSetasCurvas, 300);
    });
  }
})();
