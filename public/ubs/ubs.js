// ubs.js - Portal Dedicado da Recepção da UBS
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  let ubsAtualId = "ubs_B";
  let todasUbss = [];
  let ubsAtual = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 3200);
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
    return data;
  }

  async function carregarListaUbss() {
    const data = await api("/api/status");
    todasUbss = data.ubss;
    const sel = $("selectUbs");
    sel.innerHTML = todasUbss
      .map((u) => `<option value="${esc(u.id)}">${esc(u.nome)} (${esc(u.bairro)})</option>`)
      .join("");
    if (todasUbss.some((u) => u.id === ubsAtualId)) sel.value = ubsAtualId;
  }

  async function carregarOperacaoUbs() {
    const data = await api(`/api/ubs/${encodeURIComponent(ubsAtualId)}`);
    ubsAtual = data.ubs;
    const pacientes = data.pacientes;

    $("ubsNome").textContent = ubsAtual.nome;
    $("ubsEndereco").textContent = `${ubsAtual.endereco} • ${ubsAtual.bairro} • Tel: ${ubsAtual.telefone || "-"} • ${ubsAtual.horario}`;
    $("ubsCnes").textContent = ubsAtual.cnes;
    $("ubsAtendidos").textContent = `${ubsAtual.atendimentos_hoje} atendimentos`;
    $("ubsCapacidade").textContent = `${ubsAtual.capacidade_diaria} fichas/dia`;

    const aberta = ubsAtual.status_atual === "aberto" || ubsAtual.status_atual === "aberto_normal";
    const badge = $("ubsStatusBadge");
    badge.className = `badge ${aberta ? "ok" : "warn"}`;
    badge.textContent = aberta ? "🟢 Funcionamento Normal" : "🔴 Interrupção em Sala";

    renderSalas(ubsAtual.salas || []);
    renderPacientes(pacientes || []);
    await renderVizinhas();
  }

  function renderSalas(salas) {
    $("salasList").innerHTML = salas
      .map((s) => {
        const ok = s.status === "aberto" || s.status === "aberto_normal";
        return `
        <div class="sala-item ${ok ? "" : "fechada"}">
          <div>
            <strong>${esc(s.nome)}</strong>
            <span>${ok ? "🟢 Aberta" : "🔴 Fechada"} • ${esc(s.responsavel)} • Fila: ${s.fila_espera} • Fichas: ${s.fichas_restantes}</span>
            ${s.motivo_interrupcao ? `<small>⚠️ ${esc(s.motivo_interrupcao)}</small>` : ""}
          </div>
          <button class="btn-sala ${ok ? "fechar" : "abrir"}" data-sala="${esc(s.id)}" data-status="${ok ? "em_reuniao_interna" : "aberto"}">
            ${ok ? "Fechar p/ Reunião" : "Reabrir Sala"}
          </button>
        </div>`;
      })
      .join("");

    $("salasList").querySelectorAll("[data-sala]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const novo = btn.dataset.status;
        const motivo = novo === "aberto" ? "" : "Reunião técnica da equipe local";
        await api("/api/ubs/sala-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ubs_id: ubsAtualId, sala_id: btn.dataset.sala, novo_status: novo, motivo })
        });
        toast(novo === "aberto" ? "Sala reaberta! ✅" : "Sala marcada como fechada ⚠️");
        await carregarListaUbss();
        await carregarOperacaoUbs();
      })
    );
  }

  function renderPacientes(pacientes) {
    const tbody = $("tabelaPacientes");
    if (!pacientes.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:#a0aec0; text-align:center;">Nenhum paciente agendado nesta unidade no momento.</td></tr>';
      return;
    }

    const melhorDestino = todasUbss.find(
      (u) => u.id !== ubsAtualId && (u.status_atual === "aberto" || u.status_atual === "aberto_normal") && u.servicos_disponiveis.includes("vacinacao")
    ) || { id: "ubs_C", nome: "UBS San Martin / Iputinga" };

    tbody.innerHTML = pacientes
      .map((p) => {
        let st = '<span class="st-tag wait">⏳ Aguardando</span>';
        if (p.status_alerta === "notificado_com_sucesso") st = '<span class="st-tag ok">✓ Avisado WhatsApp</span>';
        if (p.status_alerta === "remanejado") st = '<span class="st-tag mov">🔄 Remanejado</span>';
        if (p.status_alerta === "confirmado_presencial") st = '<span class="st-tag ok">✓ Confirmado</span>';

        const acao = p.status_alerta !== "remanejado"
          ? `<button class="btn-micro" data-rem="${esc(p.id)}" data-dest="${esc(melhorDestino.id)}">Remanejar p/ vizinha aberta</button>`
          : `<small style="color:#a0aec0">${esc(p.remanejado_para || "")}</small>`;

        return `
        <tr>
          <td><strong>${esc(p.nome)}</strong><br><small style="color:#a0aec0">${esc(p.telefone)}</small></td>
          <td>${esc(p.servico)}</td>
          <td>${esc(p.horario_agendado)}</td>
          <td>${st}</td>
          <td>${acao}</td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("[data-rem]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api("/api/paciente/remanejar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paciente_id: b.dataset.rem, destino_ubs_id: b.dataset.dest })
        });
        toast("Paciente remanejado para unidade aberta! 🔄");
        await carregarOperacaoUbs();
      })
    );
  }

  async function renderVizinhas() {
    if (!ubsAtual) return;
    const data = await api(`/api/status?lat=${ubsAtual.latitude}&lng=${ubsAtual.longitude}`);
    const vizinhas = data.ubss.filter((u) => u.id !== ubsAtualId).slice(0, 4);
    $("listaVizinhas").innerHTML = vizinhas
      .map((v) => {
        const ok = v.status_atual === "aberto" || v.status_atual === "aberto_normal";
        return `
        <div class="vizinha-card">
          <strong>${esc(v.nome)}</strong>
          <small>${esc(v.bairro)} • ${esc(v.distancia)}</small>
          <span class="st-tag ${ok ? "ok" : "wait"}" style="align-self:flex-start; margin-top:4px">${ok ? "🟢 Aberta" : "🔴 Fechada"}</span>
        </div>`;
      })
      .join("");
  }

  $("selectUbs").addEventListener("change", (e) => {
    ubsAtualId = e.target.value;
    $("sentinelaResultado").classList.add("hidden");
    carregarOperacaoUbs();
  });

  $("btnDispararSentinela").addEventListener("click", async () => {
    const btn = $("btnDispararSentinela");
    btn.disabled = true;
    try {
      const motivo = $("inputMotivoSentinela").value.trim() || "Reunião interna na Sala de Vacina";
      const data = await api("/api/sentinela/interrupcao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubs_id: ubsAtualId, motivo })
      });
      const box = $("sentinelaResultado");
      box.innerHTML = `<strong>✅ ${data.pacientesAfetados.length} paciente(s) notificado(s) via WhatsApp:</strong><br><br>${esc(data.mensagemGerada).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}`;
      box.classList.remove("hidden");
      toast("Agente Sentinela disparou os alertas!");
      await carregarListaUbss();
      await carregarOperacaoUbs();
    } catch (err) {
      toast("Erro: " + err.message);
    } finally {
      btn.disabled = false;
    }
  });

  $("btnNovoPaciente").addEventListener("click", () => {
    const srvs = ubsAtual?.servicos_disponiveis || ["clinico_geral"];
    $("chkServico").innerHTML = srvs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    $("modalCheckin").classList.remove("hidden");
  });
  $("btnCancelarChk").addEventListener("click", () => $("modalCheckin").classList.add("hidden"));
  $("formCheckin").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/paciente/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: $("chkNome").value.trim(),
          telefone: $("chkTel").value.trim(),
          servico: $("chkServico").value,
          ubs_id: ubsAtualId,
          horario: $("chkHorario").value.trim()
        })
      });
      $("modalCheckin").classList.add("hidden");
      toast("Check-in registrado!");
      await carregarOperacaoUbs();
    } catch (err) {
      toast(err.message);
    }
  });

  $("btnReset").addEventListener("click", async () => {
    await api("/api/reset", { method: "POST" });
    $("sentinelaResultado").classList.add("hidden");
    toast("Banco restaurado ao estado inicial!");
    await carregarListaUbss();
    await carregarOperacaoUbs();
  });

  (async () => {
    await carregarListaUbss();
    await carregarOperacaoUbs();
  })();
})();
