// app.js - Frontend Interativo dos 3 Portais Navegáveis ZELO (Squad 13 - AKCIT Camp 2026)

document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // ELEMENTOS DO DOM - NAVEGAÇÃO ENTRE PORTAIS
  // ==========================================
  const portalNav = document.getElementById("portalNav");
  const navTabs = document.querySelectorAll(".nav-tab");
  const portalViews = document.querySelectorAll(".portal-view");

  // ELEMENTOS - PORTAL 1 (CIDADÃO)
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const userInput = document.getElementById("userInput");
  const btnEnviar = document.getElementById("btnEnviar");
  const logsConsole = document.getElementById("logsConsole");
  const ticketStatusBadge = document.getElementById("ticketStatusBadge");
  const ticketAlertTxt = document.getElementById("ticketAlertTxt");
  const whatsappConteudo = document.getElementById("whatsappConteudo");
  const quickChips = document.querySelectorAll(".chip-btn");

  // ELEMENTOS - PORTAL 2 (RECEPÇÃO UBS)
  const salasList = document.getElementById("salasList");
  const btnAcionarSentinelaPortalUbs = document.getElementById("btnAcionarSentinelaPortalUbs");
  const pacientesTableBody = document.getElementById("pacientesTableBody");
  const ubsStatusTagGeral = document.getElementById("ubsStatusTagGeral");
  const countAtendidosHoje = document.getElementById("countAtendidosHoje");
  const countFilaEspera = document.getElementById("countFilaEspera");

  // ELEMENTOS - PORTAL 3 (GESTÃO MUNICIPAL)
  const kpiViagensEvitadas = document.getElementById("kpiViagensEvitadas");
  const kpiHorasPoupadas = document.getElementById("kpiHorasPoupadas");
  const kpiEconomia = document.getElementById("kpiEconomia");
  const kpiGuardrailsBloqueados = document.getElementById("kpiGuardrailsBloqueados");
  const kpiAlertasDisparados = document.getElementById("kpiAlertasDisparados");
  const demandBarsContainer = document.getElementById("demandBarsContainer");

  const btnResetarDemo = document.getElementById("btnResetarDemo");

  // ==========================================
  // CONTROLE DE NAVEGAÇÃO ENTRE PORTAIS
  // ==========================================
  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetPortalId = tab.getAttribute("data-portal");

      // Atualiza estado ativo das abas
      navTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // Alterna visibilidade das telas
      portalViews.forEach(view => {
        if (view.id === targetPortalId) {
          view.classList.add("active");
        } else {
          view.classList.remove("active");
        }
      });

      // Recarrega os dados específicos do portal selecionado
      if (targetPortalId === "portal-ubs") {
        carregarDadosPortalUbs();
      } else if (targetPortalId === "portal-gestao") {
        carregarDadosPortalGestao();
      } else {
        carregarStatusGeral();
      }
    });
  });

  // ==========================================
  // INICIALIZAÇÃO E CARREGAMENTO
  // ==========================================
  carregarStatusGeral();
  carregarDadosPortalUbs();
  carregarDadosPortalGestao();

  // Chips Rápidos no Chat
  quickChips.forEach(chip => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt");
      if (prompt) {
        userInput.value = prompt;
        chatForm.dispatchEvent(new Event("submit"));
      }
    });
  });

  // ==========================================
  // PORTAL 1: CHAT DO CIDADÃO (AGENTE 1)
  // ==========================================
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mensagem = userInput.value.trim();
    if (!mensagem) return;

    adicionarMensagemUsuario(mensagem);
    userInput.value = "";
    userInput.disabled = true;
    btnEnviar.disabled = true;

    const bubbleCarregando = adicionarIndicadorDigitacao();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem })
      });

      const data = await response.json();
      bubbleCarregando.remove();

      if (data.logs && Array.isArray(data.logs)) {
        await animarLogsNoTerminal(data.logs);
      }

      adicionarMensagemAgente(data.resposta, data.guardrailAtivado);

      // Atualiza dados e KPIs após atendimento
      carregarStatusGeral();

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

  // ==========================================
  // PORTAL 2: OPERAÇÃO DA UBS (RECEPÇÃO)
  // ==========================================
  async function carregarDadosPortalUbs() {
    try {
      const res = await fetch("/api/ubs/ubs_B");
      const data = await res.json();
      const ubs = data.ubs;
      const pacientes = data.pacientes;

      if (!ubs) return;

      // Atualiza contadores
      if (countAtendidosHoje) countAtendidosHoje.textContent = ubs.atendimentos_hoje || 42;
      
      const filaTotal = ubs.salas ? ubs.salas.reduce((acc, s) => acc + (s.fila_espera || 0), 0) : 8;
      if (countFilaEspera) countFilaEspera.textContent = `${filaTotal} pacientes`;

      // Atualiza Tag de Status Geral da UBS
      const temSalaFechada = ubs.salas && ubs.salas.some(s => s.status !== "aberto" && s.status !== "aberto_normal");
      if (ubsStatusTagGeral) {
        if (temSalaFechada) {
          ubsStatusTagGeral.className = "ubs-badge-status status-tag-reuniao";
          ubsStatusTagGeral.textContent = "🔴 INTERRUPÇÃO EM SALA";
        } else {
          ubsStatusTagGeral.className = "ubs-badge-status status-tag-aberto";
          ubsStatusTagGeral.textContent = "🟢 TODAS SALAS ABERTAS";
        }
      }

      // Renderiza as salas com toggles de ação imediata
      if (salasList && ubs.salas) {
        salasList.innerHTML = ubs.salas.map(sala => {
          const estaAberta = sala.status === "aberto" || sala.status === "aberto_normal";
          const cardClass = estaAberta ? "" : "fechada";
          const statusTxt = estaAberta ? "🟢 Aberta e Atendendo" : "🔴 Fechada p/ Reunião";
          const motivoTxt = sala.motivo_interrupcao ? `<small>⚠️ ${escapeHTML(sala.motivo_interrupcao)}</small>` : "";

          const btnAction = estaAberta
            ? `<button class="btn-toggle-sala btn-fechar-sala" onclick="alternarStatusSala('ubs_B', '${sala.id}', 'em_reuniao_interna', 'Reunião técnica de emergência da equipe')">Fechar p/ Reunião</button>`
            : `<button class="btn-toggle-sala btn-abrir-sala" onclick="alternarStatusSala('ubs_B', '${sala.id}', 'aberto', '')">Reabrir Sala</button>`;

          return `
            <div class="sala-item-card ${cardClass}">
              <div class="sala-info">
                <strong>${escapeHTML(sala.nome)}</strong>
                <span>${statusTxt} • Responsável: ${escapeHTML(sala.responsavel)}</span>
                ${motivoTxt}
              </div>
              <div class="sala-controls">
                ${btnAction}
              </div>
            </div>
          `;
        }).join("");
      }

      // Renderiza Tabela de Pacientes
      if (pacientesTableBody && pacientes) {
        pacientesTableBody.innerHTML = pacientes.map(p => {
          let badgeStatus = `<span class="status-badge-aguardando">⏳ Na Fila</span>`;
          if (p.status_alerta === "notificado_com_sucesso") {
            badgeStatus = `<span class="status-badge-notificado">✓ Notificado WhatsApp</span>`;
          } else if (p.status_alerta === "remanejado") {
            badgeStatus = `<span class="status-badge-remanejado">🔄 Remanejado</span>`;
          }

          const remanejarBtn = p.status_alerta !== "remanejado"
            ? `<button class="btn-micro-action" onclick="remanejarPacienteIndividual('${p.id}', 'ubs_C')">Transferir p/ San Martin</button>`
            : `<span style="font-size:11px; color:#A0AEC0;">Transferido para ${escapeHTML(p.remanejado_para || 'UBS San Martin')}</span>`;

          return `
            <tr>
              <td>
                <strong>${escapeHTML(p.nome)}</strong><br>
                <small style="color:#718096">${escapeHTML(p.cpf_mascarado || '')} • ${escapeHTML(p.telefone)}</small>
              </td>
              <td>${p.servico === 'vacinacao' ? '💉 Vacinação' : '🩺 Clínico Geral'}</td>
              <td>${escapeHTML(p.horario_agendado)}</td>
              <td>${badgeStatus}</td>
              <td>${remanejarBtn}</td>
            </tr>
          `;
        }).join("");
      }

    } catch (err) {
      console.error("Erro ao carregar dados da UBS:", err);
    }
  }

  // Ação de fechar/abrir sala na recepção
  window.alternarStatusSala = async (ubs_id, sala_id, novo_status, motivo) => {
    try {
      await fetch("/api/ubs/sala-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubs_id, sala_id, novo_status, motivo })
      });

      // Recarrega dados de todos os portais
      await carregarDadosPortalUbs();
      await carregarStatusGeral();
      await carregarDadosPortalGestao();

      // Log no terminal da IA
      adicionarLogTerminal({
        tipo: novo_status === "aberto" ? "sucesso" : "alerta",
        tag: "RECEPÇÃO UBS",
        hora: horaAtual(),
        detalhe: `Status da sala '${sala_id}' alterado para '${novo_status}'. Notificação propagada em tempo real.`
      });

    } catch (err) {
      alert("Erro ao alterar status da sala: " + err.message);
    }
  };

  // Botão Gatilho do Sentinela dentro do Portal da UBS
  btnAcionarSentinelaPortalUbs.addEventListener("click", async () => {
    btnAcionarSentinelaPortalUbs.disabled = true;
    btnAcionarSentinelaPortalUbs.style.opacity = "0.7";

    try {
      const response = await fetch("/api/sentinela/interrupcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ubs_id: "ubs_B",
          motivo: "Reunião de emergência da equipe de vacinação"
        })
      });

      const data = await response.json();

      if (data.logs) {
        await animarLogsNoTerminal(data.logs);
      }

      if (data.mensagemGerada && whatsappConteudo) {
        whatsappConteudo.innerHTML = formatarMarkdown(data.mensagemGerada);
      }

      await carregarDadosPortalUbs();
      await carregarStatusGeral();
      await carregarDadosPortalGestao();

    } catch (err) {
      console.error("Erro ao acionar sentinela:", err);
    } finally {
      btnAcionarSentinelaPortalUbs.disabled = false;
      btnAcionarSentinelaPortalUbs.style.opacity = "1";
    }
  });

  // Remanejar paciente individualmente
  window.remanejarPacienteIndividual = async (paciente_id, destino_ubs_id) => {
    try {
      await fetch("/api/paciente/remanejar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paciente_id, destino_ubs_id })
      });

      await carregarDadosPortalUbs();
      await carregarStatusGeral();
      await carregarDadosPortalGestao();

      adicionarLogTerminal({
        tipo: "sucesso",
        tag: "REMANEJAMENTO ATIVO",
        hora: horaAtual(),
        detalhe: `Paciente remanejado com sucesso para a UBS San Martin. Horário mantido.`
      });

    } catch (err) {
      alert("Erro ao remanejar paciente: " + err.message);
    }
  };

  // Remanejar fila inteira de vacinação para San Martin
  window.remanejarTodosParaSanMartin = async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      const afetados = data.pacientes.filter(p => p.ubs_id === "ubs_B");

      for (const p of afetados) {
        await fetch("/api/paciente/remanejar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paciente_id: p.id, destino_ubs_id: "ubs_C" })
        });
      }

      await carregarDadosPortalUbs();
      await carregarStatusGeral();
      await carregarDadosPortalGestao();

      adicionarLogTerminal({
        tipo: "sucesso",
        tag: "CONTINGÊNCIA EXECUTADA",
        hora: horaAtual(),
        detalhe: `Toda a fila de vacinação da UBS Central foi remanejada para a UBS San Martin com aviso aos cidadãos.`
      });

    } catch (err) {
      alert("Erro ao executar remanejamento em lote: " + err.message);
    }
  };

  // ==========================================
  // PORTAL 3: GESTÃO MUNICIPAL (B2G)
  // ==========================================
  async function carregarDadosPortalGestao() {
    try {
      const res = await fetch("/api/gestao/kpis");
      const data = await res.json();
      const kpis = data.kpis;

      if (!kpis) return;

      if (kpiViagensEvitadas) kpiViagensEvitadas.textContent = kpis.viagens_perdidas_evitadas.toLocaleString("pt-BR");
      if (kpiHorasPoupadas) kpiHorasPoupadas.textContent = `${kpis.horas_fila_poupadas.toLocaleString("pt-BR")}h`;
      if (kpiEconomia) kpiEconomia.textContent = kpis.economia_estimada_reais;
      if (kpiGuardrailsBloqueados) kpiGuardrailsBloqueados.textContent = `${kpis.guardrails_violacoes_bloqueadas} interceptações seguras`;
      if (kpiAlertasDisparados) kpiAlertasDisparados.textContent = `${kpis.alertas_preventivos_disparados} avisos via WhatsApp`;

      // Renderiza as Barras de Demanda por Serviço
      if (demandBarsContainer && kpis.distribuicao_demandas) {
        demandBarsContainer.innerHTML = kpis.distribuicao_demandas.map((d, idx) => {
          const isAccent = idx === 0 ? "accent" : "";
          return `
            <div class="bar-item">
              <div class="bar-label-line">
                <span>${escapeHTML(d.servico)}</span>
                <strong>${d.quantidade} pedidos (${d.percentual}%)</strong>
              </div>
              <div class="bar-bg">
                <div class="bar-fill ${isAccent}" style="width: ${d.percentual}%"></div>
              </div>
            </div>
          `;
        }).join("");
      }

    } catch (err) {
      console.error("Erro ao carregar dados de gestão:", err);
    }
  }

  // ==========================================
  // CARREGAMENTO GERAL E STATUS SINCRONIZADO
  // ==========================================
  async function carregarStatusGeral() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      const ubsB = data.ubss.find(u => u.id === "ubs_B");
      const pacienteMaria = data.pacientes.find(p => p.id === "pac_01");

      if (ubsB && ticketStatusBadge && ticketAlertTxt) {
        const estaEmReuniao = ubsB.status_atual === "em_reuniao_interna";
        const remanejada = pacienteMaria && pacienteMaria.status_alerta === "remanejado";

        if (remanejada) {
          ticketStatusBadge.className = "ticket-badge-live";
          ticketStatusBadge.style.color = "#D6BCFA";
          ticketStatusBadge.style.borderColor = "rgba(159, 122, 234, 0.4)";
          ticketStatusBadge.innerHTML = `<span class="dot-sm" style="background:#9F7AEA"></span> REMANEJADA P/ SAN MARTIN`;
          ticketAlertTxt.style.color = "#68D391";
          ticketAlertTxt.textContent = "✅ Atendimento transferido com sucesso para a UBS 03 - San Martin (Hoje até às 17h).";
        } else if (estaEmReuniao) {
          ticketStatusBadge.className = "ticket-badge-live";
          ticketStatusBadge.style.color = "#ED8936";
          ticketStatusBadge.style.borderColor = "rgba(237, 137, 54, 0.4)";
          ticketStatusBadge.innerHTML = `<span class="dot-sm pulse-orange"></span> SALA EM REUNIÃO`;
          ticketAlertTxt.style.color = "#FEB2B2";
          ticketAlertTxt.textContent = "⚠️ NÃO SAIR DE CASA: Sala fechada para reunião técnica.";
        } else {
          ticketStatusBadge.className = "ticket-badge-live";
          ticketStatusBadge.style.color = "#48BB78";
          ticketStatusBadge.style.borderColor = "rgba(0, 168, 89, 0.4)";
          ticketStatusBadge.innerHTML = `<span class="dot-sm" style="background:#00A859"></span> SALA ABERTA`;
          ticketAlertTxt.style.color = "#68D391";
          ticketAlertTxt.textContent = "✅ Sala de vacinação aberta. Atendimento regular hoje.";
        }
      }

    } catch (err) {
      console.error("Falha ao sincronizar status geral:", err);
    }
  }

  // ==========================================
  // RESET DA DEMONSTRAÇÃO
  // ==========================================
  btnResetarDemo.addEventListener("click", async () => {
    try {
      await fetch("/api/reset", { method: "POST" });

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

      logsConsole.innerHTML = `
        <div class="log-entry system-init">
          <span class="log-time">[${horaAtual()}]</span>
          <span class="log-badge badge-neutral">SISTEMA</span>
          <span class="log-text">Demonstração resetada com sucesso. Estado inicial dos 3 portais restaurado.</span>
        </div>
      `;

      await carregarStatusGeral();
      await carregarDadosPortalUbs();
      await carregarDadosPortalGestao();

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
        <span class="bubble-author">${ehGuardrail ? '🛡️ Zelo • Guardrail Clínico Ativado' : '💙 Zelo • Agente de Acolhimento'}</span>
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
        <span class="dot-sm pulse-blue"></span> Consultando matriz de serviços e checando status operacional ao vivo...
      </div>
    `;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  async function animarLogsNoTerminal(logs) {
    for (const log of logs) {
      adicionarLogTerminal(log);
      await new Promise(r => setTimeout(r, 100));
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
    res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/\n/g, '<br>');
    return res;
  }
});
