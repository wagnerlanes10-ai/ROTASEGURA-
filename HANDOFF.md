# RotaSegura — Handoff do Projeto

Documento de transferência do projeto RotaSegura. Contém tudo que outra IA ou desenvolvedor precisa saber para continuar o trabalho.

**Última atualização:** 16/10/2025
**URL do app:** https://rotasegura-oficial.vercel.app
**Repositório:** github.com/wagnerlanes10-ai/rotasegura-oficial

---

## 1. O QUE É O PROJETO

**RotaSegura** é um PWA (Progressive Web App) de navegação GPS com foco em segurança, feito em HTML/CSS/JavaScript puro, hospedado na Vercel.

**Diferenciais:**
- Modo para-brisa com câmera traseira + setas animadas (AR-like)
- Efeito de chuva detectado automaticamente pela câmera
- Sistema de reporte de riscos comunitário (Supabase)
- Voz dinâmica em português
- Card dinâmico de instruções (estilo Waze)
- Mapa 3D com zoom automático

**Stack:**
- HTML + CSS + JavaScript vanilla
- MapLibre GL JS (mapas 3D)
- OSRM (cálculo de rotas)
- Nominatim (geocodificação)
- Supabase (backend de riscos)
- Vercel (deploy + serverless functions)

---

## 2. ESTRUTURA DO PROJETO

```
📁 rotasegura-oficial/
├── 📁 api/
│   ├── 📄 risk.js           → GET lista riscos + POST cria report
│   ├── 📁 risk/
│   │   └── 📄 report.js     → POST report (RPC Supabase)
│   └── 📁 mod/              → moderação (uso interno)
├── 📁 data/
│   └── 📄 risk.geojson      → riscos locais (fallback)
├── 📄 index.html            → estrutura da UI
├── 📄 styles.css            → todos os estilos
├── 📄 script.js             → mapa, GPS, rota, voz, card
├── 📄 script2.js            → HUD, câmera, setas, report, voz
├── 📄 script3.js            → efeito chuva + detecção
├── 📄 manifest.json         → PWA
├── 📄 splash.html           → tela inicial
├── 📄 moderar.html          → moderação (uso interno)
├── 📄 vercel.json           → configuração de rotas
└── 📄 HANDOFF.md            → este arquivo
```

**Observação:** scripts carregados nesta ordem no `index.html`:
```
script.js → script2.js → script3.js
```

---

## 3. FUNCIONALIDADES ATUAIS

### ✅ FUNCIONANDO

| Feature | Onde | Status |
|---|---|---|
| Mapa MapLibre + GPS | script.js | ✅ |
| Cálculo de rota (OSRM) | script.js | ✅ |
| Zoom 3D ao calcular rota | script.js | ✅ |
| Card de instrução no topo (estático) | script.js + styles.css | ✅ |
| Card dinâmico do HUD (atualiza enquanto dirige) | script2.js | ✅ |
| Voz "Rota calculada. X km, Y min" | script.js | ✅ |
| Voz "Começar rota!" (2.5s depois) | script.js | ✅ |
| Voz por distância (300m/100m/30m) | script2.js | ✅ |
| Botão 🔊 Som / 🔇 Mudo | script2.js | ✅ |
| Modo para-brisa (câmera traseira) | script2.js | ✅ |
| Setas ciano animadas (retas) | script2.js | ✅ |
| Efeito chuva (gotas caindo + grudadas) | script3.js | ✅ |
| Detecção automática de chuva pela câmera | script3.js | ✅ |
| Botão chuva: Auto/Ligado/Desligado | script3.js | ✅ |
| Menu lateral (Dia/Noite, Auto, Chuva, Sobre) | script.js | ✅ |
| Modo Dia/Noite automático (5h-17h dia, resto noite) | script.js | ✅ |
| Recentralizar 3D quando tem rota | script.js | ✅ |
| Reportar risco (Supabase) | script2.js + api/ | ✅ |
| Backend serverless (Vercel + Supabase) | api/ | ✅ |

### ⏳ PENDENTE / INCOMPLETO

| Feature | Status | Observação |
|---|---|---|
| **Setas curvas** (acompanham a curva da rota) | ⚠️ Instável | Ver seção 5 |
| **Indicação de rotatória** ("pegue a 3ª saída") | ❌ Não implementado | Google Maps faz |
| **"Continue por X km"** | ❌ Não implementado | Google Maps faz |
| **Voz natural (neural)** | ❌ Não implementado | Chrome/Safari só tem vozes robóticas nativas |
| **Velocímetro no mapa (só com rota)** | ❌ Não implementado | Pedido pelo usuário |
| **Indicação de pedágio** | ❌ Não implementado | OSRM tem suporte (`exclude=toll`) |
| **Múltiplas rotas** | ❌ Não implementado | OSRM suporta |
| **Histórico de rotas** | ❌ Não implementado | |
| **Salvar Casa/Trabalho** | ❌ Não implementado | |
| **Modo game (cockpit 3D)** | ❌ Ideia futura | Precisa motor gráfico |

---

## 4. COMO O APP FUNCIONA

### Fluxo do usuário:

1. **Abre o app** → mapa carrega, GPS ativa
2. **Digita destino** → clica em IR
3. **App busca endereço** (Nominatim) → calcula rota (OSRM)
4. **Zoom 3D automático** (se rota < 20km) + card de instrução aparece
5. **Voz fala** "Rota calculada..." + "Começar rota!"
6. **Usuário toca em "🚗 Modo para-brisa"** → câmera liga, mapa esconde
7. **Setas ciano aparecem** sobre a câmera
8. **Card do HUD atualiza** conforme anda (a cada 2s)
9. **Voz fala nas faixas** 300m / 100m / 30m antes da curva
10. **Se tiver chuva**, script3.js detecta e ativa efeito chuva
11. **Se tiver risco perto** (< 500m), card vermelho aparece

### Arquitetura técnica:

**script.js (Parte 1 — principal):**
- Inicializa mapa, GPS, rota
- Funções principais: `initMap`, `locateUser`, `calcRoute`, `centerOnUser`
- Voz ao calcular rota (`falar` está no script2.js)
- Card estático no topo (`navCard`)
- Menu lateral, dia/noite

**script2.js (Parte 2 — HUD e câmera):**
- Modo para-brisa: `startHUD`, `stopHUD`
- Câmera traseira: `startCamera`, `stopCamera`
- Canvas das setas: `startArrowCanvas`, `animateArrows`
- Card dinâmico do HUD: `iniciarAtualizacaoCard`
- Voz por distância: `iniciarVerificacaoVozPorDistancia`
- Reportar risco: `submitReport`

**script3.js (Parte 3 — chuva):**
- Independente, usa MutationObserver no #hud
- Quando HUD abre → inicia detecção da câmera
- Quando detecta chuva → ativa efeito visual

---

## 5. DESAFIOS TÉCNICOS ABERTOS

### 🔴 PRIORIDADE 1 — Setas curvas

**Objetivo:** fazer a fileira de setas desenhar a curva da rota (tipo Waze/jogo).

**Tentativas feitas:**

1. **v9-v14:** setas curvavam com base em `bearing` da bússola do celular → **pisava/desalinhava** (bússola oscila muito)

2. **script4.js v1:** sobrescrevia `animateArrows` do script2.js → **não funcionou** (JavaScript não deixa sobrescrever função já em execução)

3. **script4.js v2:** escondia canvas do script2.js + criava próprio → **funcionou parcialmente** mas setas ficaram "esquisitas" (curva exagerada, "quebrada")

4. **Última tentativa no script2.js:** cálculo de `bearing` do GPS 60x/s dentro da animação → **setas piscavam** (NaN ou lentidão)

5. **Versão com cache 1x/s:** calculava posições 1x/s, desenhava 60x/s → **funcionou, mas setas ficaram retas** (algo errado no cálculo de x/rotação)

**Abordagem recomendada para próxima tentativa:**

Ir **por partes**, testando cada etapa:

- **Etapa 1:** Setas retas + **inclinação individual pequena** (±10°) baseada na instrução do card. Nada mais. Testar.
- **Etapa 2:** Se funcionar, aumentar inclinação para ±25°. Testar.
- **Etapa 3:** Se funcionar, adicionar deslocamento lateral progressivo. Testar.
- **Etapa 4:** Se funcionar, adicionar deslocamento + inclinação juntos. Testar.

**Não tentar tudo de uma vez.** Foi o erro das tentativas anteriores.

**Código atual do `animateArrows` (script2.js estável, setas retas):**
```js
function animateArrows() {
  // ... 10 setas com Y animado, sem desvio
  // desenha em centerX (fixo)
}
```

---

### 🟡 PRIORIDADE 2 — Voz natural

**Problema:** `speechSynthesis` do navegador só tem vozes robóticas no português brasileiro.

**Soluções pesquisadas:**

- **Microsoft Edge TTS** (vozes neurais grátis) → **BLOQUEADO por CORS no Chrome mobile**
- **Google Cloud TTS** (Chirp 3 HD) → **exige cartão de crédito**
- **Azure Speech** (500k caracteres grátis/mês) → **exige cartão**
- **SpeechGen.io** → pay-as-you-go
- **@pedrobef/vozz** → 86MB de download, viável mas pesado
- **Fish Audio** → uso gratuito com fair use

**Recomendação:** testar **Fish Audio** ou **@pedrobef/vozz** (offline).

---

### 🟡 PRIORIDADE 3 — Rotatórias detalhadas

**Objetivo:** ao se aproximar de rotatória, dizer "pegue a 3ª saída".

**Onde implementar:** `script2.js` na função `traduzirInstrucao` ou `iniciarAtualizacaoCard`.

**OSRM retorna:**
```js
step.maneuver.type === 'roundabout'
step.maneuver.exit === 3  // número da saída
```

**Fórmula sugerida:**
```js
if (type === 'roundabout') {
  const saida = m.exit || 1;
  return `Na rotatória, pegue a ${saida}ª saída`;
}
```

---

### 🟡 PRIORIDADE 4 — Indicação de pedágio

**O que fazer:** adicionar botão "Evitar pedágio" no menu. Quando ligado, recalcular rota com `exclude=toll` no OSRM.

**Como:**
```js
const osrmUrl = `https://router.project-osrm.org/route/v1/driving/` +
  `${userPos[1]},${userPos[0]};${destLng},${destLat}` +
  `?steps=true&geometries=geojson&overview=full` +
  (evitarPedagio ? '&exclude=toll' : '');
```

---

### 🟢 PRIORIDADE 5 — Features menores

- **Velocímetro no mapa (só com rota)** → adicionar `<div id="speedMap">` no index.html + atualizar no watchPosition
- **Múltiplas rotas** → OSRM retorna `routes[]` (atualmente só usa `routes[0]`)
- **Histórico de rotas** → localStorage
- **Salvar Casa/Trabalho** → localStorage

---

## 6. PROBLEMAS CONHECIDOS E SOLUÇÕES

### 🔴 `vercel.json` bloqueava arquivos estáticos
**Sintoma:** `/script2.js` retornava 404.
**Causa:** rewrite `"/(.*)"` redirecionava tudo pra `index.html`.
**Solução:** adicionar rotas específicas para `/script.js`, `/script2.js`, etc antes do catch-all.

### 🔴 Scripts cortados no chat
**Sintoma:** arquivos colados no GitHub ficavam incompletos.
**Causa:** limite de tamanho da mensagem.
**Solução:** dividir em vários arquivos (`script.js`, `script2.js`, `script3.js`).

### 🔴 Voz não falava nas curvas
**Causa:** card do HUD ficava estático (não atualizava).
**Solução:** adicionar `iniciarAtualizacaoCard` no script2.js.

### 🔴 Card mostrava "3 m — Siga em frente"
**Causa:** OSRM retorna micro-steps (< 30m) que não são curvas reais.
**Solução:** filtrar steps com `distanciaStep < 30` e `i === 0` (depart).

### 🔴 Modo noturno quebrava com tiles CARTO
**Sintoma:** "API KEY REQUIRED" no mapa.
**Causa:** CARTO passou a exigir API key.
**Solução:** usar filtro CSS `filter: invert(1) hue-rotate(180deg)` sobre tiles OSM normais.

---

## 7. COMO RODAR / TESTAR

### Ambiente:
- **Não precisa build.** É HTML/CSS/JS puro.
- **Deploy:** automático via Vercel (git push).
- **Testes:** apenas no celular (GPS e câmera não funcionam bem em desktop).

### Testar localmente:
```bash
# Simples servidor HTTP (Python)
python -m http.server 8000
# Abre http://localhost:8000 no celular conectado à mesma rede
```

**Atenção:** GPS e câmera exigem **HTTPS**. Localhost é exceção. Pra testar em celular pela rede local, use ngrok ou teste direto na Vercel.

---

## 8. VARIÁVEIS DE AMBIENTE (Vercel)

Configuradas em **Vercel → Settings → Environment Variables**:

```
SUPABASE_URL         = https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY = eyJhbGci... (service_role key)
```

---

## 9. BANCO DE DADOS (Supabase)

### Tabela `riscos`
```sql
CREATE TABLE riscos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat FLOAT NOT NULL,
  lng FLOAT NOT NULL,
  severidade TEXT CHECK (severidade IN ('alto','medio','baixo')) DEFAULT 'medio',
  tipo TEXT,
  nota TEXT,
  criado_em TIMESTAMPTZ DEFAULT now(),
  confirmacoes INT DEFAULT 0
);
```

### Tabela `risk_reports` (usada pela RPC)
Ver detalhes no `api/risk/report.js`.

### RPC `report_risk`
Ver definição no Supabase.

---

## 10. HISTÓRICO DE VERSÕES (importante)

| Versão | O que mudou | Status |
|---|---|---|
| v1-v8 | MVP básico, mapa 2D, GPS, rota | ❌ |
| v8 | Efeito chuva (simples) | ⚠️ |
| v9-v14 | Tentativas de setas curvas (bússola) | ❌ |
| v16 | Setas retas centralizadas | ✅ |
| v17 | Dia/noite automático | ✅ |
| v17a | Refatoração em script.js + script2.js | ✅ |
| v3 (chuva) | Chuva com intensidade dinâmica + splash | ✅ |
| v4 (chuva) | Gotas realistas (Bezier + brilhos) | ✅ |
| Card dinâmico | Atualiza card do HUD + voz por distância | ✅ |
| Filtro micro-steps | Evita "3 m — Siga em frente" | ✅ |
| Recentralizar 3D | Zoom + pitch 60° com rota | ✅ |
| Voz "Começar rota" | Falado 2.5s após rota | ✅ |
| script4.js | Setas curvas (alternativa) | ⚠️ Instável |

---

## 11. PEDIDOS DO USUÁRIO (em aberto)

Cronológico, do mais recente:

1. **Setas curvas** — fazer fileira de setas desenhar a curva real (em andamento)
2. **Rotatórias** — dizer qual saída pegar
3. **"Continue por X km"** — antes de cada situação
4. **Voz natural** — melhorar qualidade da voz
5. **Velocímetro no mapa (só com rota)** — não existe hoje
6. **Indicação de pedágio** — botão "evitar pedágio" no menu

---

## 12. INSTRUÇÕES PARA A PRÓXIMA IA

**Ao retomar o projeto:**

1. **Leia este documento inteiro** antes de mexer.
2. **Verifique o estado atual** abrindo https://rotasegura-oficial.vercel.app
3. **Priorize as tarefas da seção 5** (desafios abertos).
4. **Ao fazer mudanças:**
   - Sempre ofereça backup antes
   - Faça uma mudança por vez (não tente tudo junto)
   - Peça print de teste após cada mudança
   - Se der problema, volte o backup imediatamente
5. **Cuidado com:**
   - `vercel.json` (rewrite pode bloquear arquivos)
   - Chat tem limite de mensagem (divida arquivos grandes)
   - Scripts dependem uns dos outros (`script.js` → `script2.js` → `script3.js`)

**Ordem de dependência importante:**
- `script2.js` depende de variáveis globais do `script.js` (`map`, `userPos`, `routeCoords`, `currentRoute`)
- `script3.js` depende do `#hud` estar visível (usa MutationObserver)
- Se `script.js` falhar em carregar, TODOS os outros quebram.

---

## 13. CONTATO / CONTEXTO

- **Usuário:** desenvolvedor iniciante, trabalha **pelo celular** (sem computador pra testar/debugar)
- **Nunca teve acesso ao console do navegador** — debug é feito **por prints** enviados pelo usuário
- **Testes são feitos dirigindo** — precisa ser cuidadoso pra não distrair
- **Comunicação em português brasileiro**
- **Feedback por letras (A/B/C/D)** — evita confusão

---

## 14. ESTRUTURA DE PASTAS PARA RESTAURAR

Se for recriar o projeto do zero, a estrutura mínima é:

```
rotasegura-oficial/
├── api/
│   ├── risk.js
│   └── risk/
│       └── report.js
├── data/
│   └── risk.geojson
├── index.html
├── styles.css
├── script.js
├── script2.js
├── script3.js
├── manifest.json
├── splash.html
├── vercel.json
└── HANDOFF.md
```

**Todos os códigos estão no repositório GitHub** (github.com/wagnerlanes10-ai/rotasegura-oficial).

---

**Fim do documento.**
