// app.js - Frontend Interativo para Demonstração ZELO (Squad 13 - AKCIT Camp 2026)

document.addEventListener("DOMContentLoaded", () => {
  // Elementos do DOM
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const userInput = document.getElementById("userInput");
  const btnEnviar = document.getElementById("btnEnviar");
  const logsConsole = document.getElementById("logsConsole");
  const ubssGrid = document.getElementById("ubssGrid");
  const btnAcionarSentinela = document.getElementById("btnAcionarSentinela");
  const pacienteAlertaBox = document.getElementById("pacienteAlertaBox");
  const whatsappConteudo = document.getElementById("whatsappConteudo");
  const btnResetarDemo = document.getElementById("btnResetarDemo");
  const quickChips = document.querySelectorAll(".chip-btn");

  // Carrega status inicial das UBSs
  carregarStatusUBSs();

  // Configuração dos Chips de Teste Rápido
  quickChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt) {
        userInput.value = prompt;
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
  });

  // Envio de Mensagem no Chat (Agente 1)
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mensagem = userInput.value.trim();
    if (!mensagem) return;

    // 1. Renderiza mensagem do usuário
    adicionarMensagemUsuario(mensagem);
    userInput.value = "";
    userInput.disabled = true;
    btnEnviar.disabled = true;

    // 2. Indicador temporário de processamento
    const bubbleCarregando = adicionarIndicadorDigitacao();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem })
      });

      const data = await response.json();

      // Remove indicador de carregamento
      bubbleCarregando.remove();

      // 3. Renderiza os logs no terminal de telemetria da banca com animação progressiva
      if (data.logs && Array.isArray(data.logs)) {
        await animarLogsNoTerminal(data.logs);
      }

      // 4. Renderiza resposta do Agente 1
      adicionarMensagemAgente(data.resposta, data.guardrailAtivado);

    } catch (err) {
      bubbleCarregando.remove();
      adicionarLogTerminal({
        tipo: "guardrail",
        tag: "ERRO DE REDE",
        hora: horaAtual(),
        detalhe: `Falha na requisição: ${err.message}`
      });
      adicionarMensagemAgente("Desculpe, ocorreu uma instabilidade momentânea na conexão. Por favor, tente novamente.", false);
    } finally {
      userInput.disabled = false;
      btnEnviar.disabled = false;
      userInput.focus();
    }
  });

  // Acionamento da Recepção da UBS (Agente 2 - Sentinela)
  btnAcionarSentinela.addEventListener("click", async () => {
    btnAcionarSentinela.disabled = true;
    btnAcionarSentinela.style.opacity = "0.7";

    try {
      const response = await fetch("/api/sentinela/interrupcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ubs_id: "ubs_B",
          motivo: "Reunião técnica interna na Sala de Vacinação"
        })
      });

      const data = await response.json();

      // Anima logs do Sentinela
      if (data.logs) {
        await animarLogsNoTerminal(data.logs);
      }

      // Atualiza a visualização do card do WhatsApp da Dona Maria
      if (data.mensagemGerada) {
        whatsappConteudo.innerHTML = formatarMarkdown(data.mensagemGerada);
        pacienteAlertaBox.classList.remove("hidden");
        pacienteAlertaBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }

      // Recarrega o grid das UBSs para mostrar status atualizado
      await carregarStatusUBSs();

    } catch (err) {
      adicionarLogTerminal({
        tipo: "alerta",
        tag: "ERRO SENTINELA",
        hora: horaAtual(),
        detalhe: `Erro ao acionar sentinela: ${err.message}`
      });
    } finally {
      btnAcionarSentinela.disabled = false;
      btnAcionarSentinela.style.opacity = "1";
    }
  });

  // Botão Resetar Demonstração
  btnResetarDemo.addEventListener("click", async () => {
    try {
      await fetch("/api/reset", { method: "POST" });

      // Limpa chat
      chatMessages.innerHTML = `
        <div class="message-bubble agent-bubble">
          <div class="bubble-header">
            <span class="bubble-author">Zelo • Atenção Básica</span>
            <span class="bubble-time">Agora</span>
          </div>
          <div class="bubble-body">
            Olá! Sou o <strong>Zelo</strong>, seu assistente da Atenção Básica do SUS. Minha missão é garantir que você não perca viagem e saiba exatamente onde e quando ser atendido, sem pegar filas desnecessárias.<br><br>
            Como posso ajudar você hoje?
          </div>
        </div>
      `;

      // Limpa terminal
      logsConsole.innerHTML = `
        <div class="log-entry system-init">
          <span class="log-time">[${horaAtual()}]</span>
          <span class="log-badge badge-neutral">SISTEMA</span>
          <span class="log-text">Demonstração resetada com sucesso. Estado inicial restaurado.</span>
        </div>
      `;

      // Oculta WhatsApp de Dona Maria
      pacienteAlertaBox.classList.add("hidden");

      // Recarrega grid
      await carregarStatusUBSs();

    } catch (err) {
      console.error("Erro ao resetar demo:", err);
    }
  });

  // ==========================================
  // FUNÇÕES AUXILIARES DE RENDERIZAÇÃO
  // ==========================================

  function adicionarMensagemUsuario(texto) {
    const div = document.createElement("div");
    div.className = "message-bubble user-bubble";
    div.innerHTML = `
      <div class="bubble-header">
        <span class="bubble-author">Você (Cidadão)</span>
        <span class="bubble-time">${horaAtual()}</span>
      </div>
      <div class="bubble-body">${escapeHTML(texto)}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function adicionarMensagemAgente(texto, ehGuardrail = false) {
    const div = document.createElement("div");
    div.className = `message-bubble agent-bubble ${ehGuardrail ? 'guardrail-alert' : ''}`;
    div.innerHTML = `
      <div class="bubble-header">
        <span class="bubble-author">${ehGuardrail ? '🛡️ Zelo • Guardrail de Segurança Ativado' : '💙 Zelo • Agente de Acolhimento'}</span>
        <span class="bubble-time">${horaAtual()}</span>
      </div>
      <div class="bubble-body">${formatarMarkdown(texto)}</div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function adicionarIndicadorDigitacao() {
    const div = document.createElement("div");
    div.className = "message-bubble agent-bubble";
    div.innerHTML = `
      <div class="bubble-body" style="display:flex; align-items:center; gap:8px;">
        <span class="dot-sm pulse-blue"></span> Consultando RAG e checando status operacional ao vivo...
      </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  async function animarLogsNoTerminal(logs) {
    for (const log of logs) {
      adicionarLogTerminal(log);
      // Pequeno delay para efeito visual de raciocínio da IA durante a apresentação
      await new Promise(r => setTimeout(r, 120));
    }
  }

  function adicionarLogTerminal(log) {
    const div = document.createElement("div");
    div.className = `log-entry ${log.tipo || 'info'}`;

    const badgeClass = `badge-${log.tipo || 'neutral'}`;

    div.innerHTML = `
      <span class="log-time">[${log.hora || horaAtual()}]</span>
      <span class="log-badge ${badgeClass}">${log.tag || 'INFO'}</span>
      <span class="log-text">${escapeHTML(log.detalhe || '')}</span>
    `;

    logsConsole.appendChild(div);
    logsConsole.scrollTop = logsConsole.scrollHeight;
  }

  async function carregarStatusUBSs() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      renderizarCardsUBSs(data.ubss);
    } catch (err) {
      console.error("Falha ao carregar status das UBSs:", err);
    }
  }

  function renderizarCardsUBSs(ubss) {
    if (!ubss || ubss.length === 0) return;

    ubssGrid.innerHTML = ubss.map(ubs => {
      const estaAberta = ubs.status_atual === "aberto" || ubs.status_atual === "aberto_normal";
      const tagClass = estaAberta ? "status-tag-aberto" : "status-tag-reuniao";
      const tagTexto = estaAberta ? "🟢 Aberto" : "🔴 Em Reunião";
      const cardClass = estaAberta ? "" : "status-fechada";

      const servicosFormatados = ubs.servicos_disponiveis
        .map(s => s === "vacinacao" ? "💉 Vacinação" : s === "clinico_geral" ? "🩺 Clínico Geral" : s)
        .join(" • ");

      return `
        <div class="ubs-card-mini ${cardClass}">
          <div class="ubs-mini-header">
            <span class="ubs-mini-name">${escapeHTML(ubs.nome)}</span>
            <span class="ubs-badge-status ${tagClass}">${tagTexto}</span>
          </div>
          <div class="ubs-mini-dist">📍 ${escapeHTML(ubs.distancia)}</div>
          <div class="ubs-mini-services">${servicosFormatados}</div>
        </div>
      `;
    }).join("");
  }

  function horaAtual() {
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatarMarkdown(texto) {
    if (!texto) return "";
    let res = escapeHTML(texto);
    // Negrito
    res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Quebras de linha
    res = res.replace(/\n/g, '<br>');
    return res;
  }
});
