# Referências do Waze

Este arquivo contém a lista de features do Waze que o RotaSegura
pode implementar. Quando o usuário disser "referência do Waze",
usar este arquivo como base para discutir e priorizar features.

Última atualização: 12/10/2025

---

## 🟢 FÁCEIS (rápidas de implementar)

### 1. Botão "Ir agora" / "Sair depois"
- **O que é:** planejamento de horário de saída
- **Como funciona:** ao calcular rota, mostrar 2 botões:
  - "Ir agora" — começa a navegação
  - "Sair depois" — abre opções de horário (15min, 30min, 1h)
- **Complexidade:** baixa
- **Onde fica:** na tela de preview da rota (ainda não existe no RotaSegura)

### 2. Seleção de tipo de veículo na tela de rota
- **O que é:** botões Carro/Moto na tela de confirmação
- **Como funciona:** toggle que muda o cálculo da rota antes de sair
- **Complexidade:** baixa
- **Observação:** o RotaSegura já tem isso no HUD — só replicar na tela de rota

### 3. Velocímetro numa bolha cinza
- **O que é:** o velocímetro do Waze é uma bolha cinza com número branco
- **Diferença do RotaSegura:** o nosso é verde com borda verde
- **Complexidade:** trivial
- **Decisão:** manter o verde (identidade visual própria)

### 4. Ícone de volume 🔊 no canto
- **O que é:** botão flutuante pra ligar/desligar voz rapidamente
- **Diferença do RotaSegura:** o nosso está no HUD — o Waze põe no canto da tela
- **Complexidade:** baixa
- **Considerar:** adicionar botão fixo no canto quando estiver navegando

### 5. Múltiplas rotas sugeridas
- **O que é:** Waze mostra 2-3 alternativas de rota
- **Como funciona:** o OSRM já pode retornar múltiplas rotas
- **Complexidade:** média
- **Ganho:** usuário escolhe a melhor (mais rápida, mais curta, mais segura)

### 6. Destaque "Melhor rota"
- **O que é:** a rota recomendada ganha um badge roxo "Melhor"
- **Como funciona:** pintar a melhor rota de roxo e as alternativas de cinza
- **Complexidade:** baixa (só CSS)
- **Ganho:** usuário entende rápido qual escolher

---

## 🟡 MÉDIAS (precisa de estrutura)

### 7. Histórico de rotas
- **O que é:** últimas 10 rotas que o usuário fez
- **Como funciona:** salvar em localStorage e mostrar no menu
- **Complexidade:** média
- **Ganho:** atalho pra rotas frequentes

### 8. Salvar Casa e Trabalho
- **O que é:** 2 atalhos fixos no menu
- **Como funciona:** usuário define 2 endereços, vira botão de rota rápida
- **Complexidade:** média
- **Ganho:** gigante (não precisa digitar endereço)

### 9. Conectar com Google Agenda
- **O que é:** importar eventos com endereço
- **Como funciona:** integração com Google Calendar API
- **Complexidade:** alta (autenticação Google)
- **Ganho:** útil pra quem tem reuniões marcadas

---

## 🔴 COMPLEXAS (custa dinheiro ou tempo)

### 10. Trânsito em tempo real
- **O que é:** mostrar trânsito ao vivo (vermelho/laranja/verde)
- **Como funciona:** API paga (Google Traffic, TomTom, HERE)
- **Custo:** ~$200/mês
- **Complexidade:** alta
- **Alternativa gratuita:** OSRM não tem trânsito. Não tem como fazer grátis.

### 11. Alertas comunitários (polícia, buraco, etc)
- **O que é:** usuários reportam, outros veem no mapa
- **Como funciona:** já temos "Reportar risco"! Só refinar e popular
- **Complexidade:** média (a estrutura já existe)
- **Diferencial:** o RotaSegura já tem isso!

### 12. Mapas colaborativos
- **O que é:** usuários editam o mapa (ruas novas, mão única, etc)
- **Como funciona:** integração com OpenStreetMap
- **Complexidade:** altíssima
- **Decisão:** não vale a pena — usamos OSM que já tem isso

---

## 💡 DIFERENCIAL DO ROTASEGURA (o que o Waze NÃO tem)

### 13. Modo para-brisa com AR + câmera
- **Waze:** só mapa 2D
- **RotaSegura:** câmera + setas ciano sobrepostas
- **Vantagem:** efeito visual único

### 14. Efeito chuva
- **Waze:** nada
- **RotaSegura:** gotas caindo na tela + detecção automática
- **Vantagem:** único no mercado

### 15. Reportar risco + card vermelho animado
- **Waze:** reporta mas com UX simples
- **RotaSegura:** card vermelho grande com distância
- **Vantagem:** mais visível e impactante

---

## 📋 PRIORIZAÇÃO SUGERIDA

Ordem para fazer (do mais fácil/útil pro mais complexo):

1. **🥇 Salvar Casa e Trabalho** (média, ganho gigante)
2. **🥈 Múltiplas rotas** (média, ganho grande)
3. **🥉 Histórico de rotas** (média, ganho bom)
4. **🏅 Botão "Ir agora / Sair depois"** (baixa, ganho bom)
5. **🏅 Ícone de volume no canto** (baixa, ganho pequeno)
6. **📊 Testar tudo primeiro** antes de qualquer coisa nova

---

## 🎯 COMO USAR ESTE ARQUIVO

Quando o usuário disser **"referência do Waze"** ou **"vamos ver as referências do Waze"**:

1. Ler este arquivo
2. Perguntar qual item ele quer atacar
3. Implementar na ordem de prioridade sugerida
4. Atualizar este arquivo com o que foi feito

---

## ✅ FEITO

- [ ] (vazio por enquanto)

## 🚧 EM ANDAMENTO

- [ ] (vazio por enquanto)
