// Zelo • App do Cidadão — consome a API do Zelo (/api/*)
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NOMES_SERVICO = {
    vacinacao: "💉 Vacinação",
    clinico_geral: "🩺 Clínico geral",
    pediatria: "🧒 Pediatria",
    odontologia: "🦷 Odontologia",
    prenatal: "🤰 Pré-natal",
    curativos: "🩹 Curativos"
  };
  const SERVICOS_ORDEM = Object.keys(NOMES_SERVICO);

  const state = {
    perfil: carregarPerfil(),
    localizacao: carregarLocalizacao(),
    ubss: [],
    filtro: "todos",
    fonte: Number(localStorage.getItem("zelo_fonte") || 18)
  };

  function carregarLocalizacao() {
    try {
      const s = JSON.parse(localStorage.getItem("zelo_loc"));
      if (s && (s.lat != null || s.bairro)) return s;
    } catch (_) {}
    return { bairro: "PRADO", lat: -8.0638, lng: -34.9137, origem: "padrão" };
  }

  function salvarLocalizacao(loc) {
    state.localizacao = loc;
    localStorage.setItem("zelo_loc", JSON.stringify(loc));
    atualizarTextoLocalizacao();
  }

  function atualizarTextoLocalizacao() {
    const l = state.localizacao;
    const label = l.bairro ? `${l.bairro} (${l.origem})` : `GPS (${l.lat.toFixed(3)}, ${l.lng.toFixed(3)})`;
    if ($("locTexto")) $("locTexto").innerHTML = `Localização: <strong>${esc(label)}</strong>`;
  }

  // ---------- Utilidades ----------
  function carregarPerfil() {
    try {
      const salvo = JSON.parse(localStorage.getItem("zelo_perfil"));
      if (salvo && salvo.nome && salvo.telefone) return salvo;
    } catch (_) { /* usa padrão */ }
    return { nome: "Maria José da Silva", telefone: "(81) 98765-4321" };
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function md(texto) {
    return esc(texto).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 3500);
  }

  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.erro || `Erro ${res.status}`);
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const aberta = (u) => u.status_atual === "aberto" || u.status_atual === "aberto_normal";

  // ---------- Navegação ----------
  function irPara(viewId) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
    window.scrollTo({ top: 0 });
    if (viewId === "view-inicio") atualizarInicio();
    if (viewId === "view-unidades") carregarUnidades();
    if (viewId === "view-agenda") carregarAgenda();
    if (viewId === "view-chat") setTimeout(() => $("chatInput").focus(), 50);
  }

  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.view)));
  $("btnFalarZelo").addEventListener("click", () => irPara("view-chat"));

  // ---------- Acessibilidade ----------
  function aplicarFonte() {
    document.documentElement.style.setProperty("--fs", state.fonte + "px");
    localStorage.setItem("zelo_fonte", state.fonte);
  }
  $("btnFonte").addEventListener("click", () => {
    state.fonte = state.fonte >= 24 ? 18 : state.fonte + 2;
    aplicarFonte();
  });
  $("btnContraste").addEventListener("click", () => {
    document.body.classList.toggle("contraste");
    localStorage.setItem("zelo_contraste", document.body.classList.contains("contraste") ? "1" : "0");
  });
  if (localStorage.getItem("zelo_contraste") === "1") document.body.classList.add("contraste");
  aplicarFonte();

  // ---------- Início ----------
  function saudacao() {
    const h = new Date().getHours();
    const periodo = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    return `${periodo}, ${state.perfil.nome.split(" ")[0]}!`;
  }

  async function atualizarInicio() {
    $("saudacao").textContent = saudacao();
    const box = $("avisoBox");
    try {
      const { agendamentos } = await api(`/api/cidadao/agendamentos?telefone=${encodeURIComponent(state.perfil.telefone)}`);
      const problema = agendamentos.find((a) => !a.sala_aberta && a.status_alerta !== "remanejado");
      const remanejado = agendamentos.find((a) => a.status_alerta === "remanejado");
      if (problema) {
        box.className = "aviso";
        box.innerHTML = `⚠️ <strong>Não saia de casa agora!</strong><br>Seu atendimento de ${esc(NOMES_SERVICO[problema.servico] || problema.servico)} (${esc(problema.horario)}) na ${esc(problema.ubs.nome)} está suspenso: ${esc(problema.motivo || "sala temporariamente fechada")}.<br><button class="btn-secondary" style="margin-top:10px" id="btnVerAgenda">Ver o que fazer</button>`;
        $("btnVerAgenda").addEventListener("click", () => irPara("view-agenda"));
      } else if (remanejado) {
        box.className = "aviso ok";
        box.innerHTML = `✅ Seu atendimento foi transferido para <strong>${esc(remanejado.remanejado_para || remanejado.ubs.nome)}</strong>. Horário: ${esc(remanejado.horario)}.`;
      } else {
        box.className = "aviso hidden";
        box.innerHTML = "";
      }
    } catch (_) {
      box.className = "aviso hidden";
    }
  }

  document.querySelectorAll(".service-card").forEach((c) =>
    c.addEventListener("click", () => {
      irPara("view-chat");
      enviarMensagem(`Preciso de ${c.dataset.label} hoje, perto de mim`);
    })
  );

  // ---------- Chat ----------
  function addBolha(html, cls = "agent") {
    const div = document.createElement("div");
    div.className = `bubble ${cls}`;
    div.innerHTML = html;
    $("chatMessages").appendChild(div);
    div.scrollIntoView({ behavior: "smooth", block: "end" });
    return div;
  }

  function resumoFerramentas(logs) {
    const itens = (logs || []).filter((l) => l.tipo === "tool_call" || l.tipo === "guardrail" || l.tag === "STATUS AO VIVO: INTERRUPÇÃO DETECTADA");
    if (!itens.length) return "";
    return `<details class="tools"><summary>Como o Zelo conferiu</summary><ul>${itens.map((l) => `<li>${esc(l.detalhe)}</li>`).join("")}</ul></details>`;
  }

  async function enviarMensagem(texto) {
    const mensagem = (texto || "").trim();
    if (!mensagem) return;
    addBolha(esc(mensagem), "user");
    $("chatInput").value = "";
    $("btnEnviar").disabled = true;
    const typing = addBolha('<span class="typing">Zelo está conferindo as unidades…</span>');

    try {
      const data = await api("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem, localizacao: state.localizacao })
      });
      typing.remove();
      const bolha = addBolha(
        md(data.resposta) + resumoFerramentas(data.logs) + '<br><button class="speak" type="button">🔊 Ouvir</button>',
        data.guardrailAtivado ? "agent alert" : "agent"
      );
      bolha.querySelector(".speak").addEventListener("click", () => falar(data.resposta));
    } catch (err) {
      typing.remove();
      addBolha("Desculpe, não consegui conversar agora. Tente de novo em instantes.", "agent alert");
    } finally {
      $("btnEnviar").disabled = false;
    }
  }

  $("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    enviarMensagem($("chatInput").value);
  });
  document.querySelectorAll("#chatSugestoes .chip").forEach((c) => c.addEventListener("click", () => enviarMensagem(c.dataset.msg)));

  // Voz (quando o navegador suporta)
  function falar(texto) {
    if (!("speechSynthesis" in window)) return toast("Seu navegador não lê em voz alta.");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(texto).replace(/\*\*/g, ""));
    u.lang = "pt-BR";
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("btnVoz").classList.add("hidden");
  } else {
    $("btnVoz").addEventListener("click", () => {
      const rec = new SR();
      rec.lang = "pt-BR";
      rec.onstart = () => toast("Pode falar…");
      rec.onresult = (e) => {
        $("chatInput").value = e.results[0][0].transcript;
        $("chatInput").focus();
      };
      rec.onerror = () => toast("Não consegui ouvir. Tente de novo.");
      rec.start();
    });
  }

  // ---------- Unidades ----------
  async function carregarUnidades() {
    try {
      const l = state.localizacao;
      const qs = l.lat != null && l.lng != null
        ? `?lat=${encodeURIComponent(l.lat)}&lng=${encodeURIComponent(l.lng)}`
        : (l.bairro ? `?bairro=${encodeURIComponent(l.bairro)}` : "");
      const data = await api(`/api/status${qs}`);
      state.ubss = data.ubss;
      renderFiltros();
      renderUnidades();
    } catch (_) {
      $("listaUnidades").innerHTML = '<div class="card bad">Não foi possível carregar as unidades.</div>';
    }
  }

  function renderFiltros() {
    const servicos = SERVICOS_ORDEM.filter((s) => state.ubss.some((u) => u.servicos_disponiveis.includes(s)));
    $("filtroServicos").innerHTML = ['todos', ...servicos]
      .map((s) => `<button class="chip ${state.filtro === s ? "active" : ""}" data-f="${s}">${s === "todos" ? "Todas" : NOMES_SERVICO[s]}</button>`)
      .join("");
    $("filtroServicos").querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => { state.filtro = c.dataset.f; renderFiltros(); renderUnidades(); })
    );
  }

  function renderUnidades() {
    const lista = state.ubss.filter((u) => state.filtro === "todos" || u.servicos_disponiveis.includes(state.filtro));
    if (!lista.length) {
      $("listaUnidades").innerHTML = '<div class="card">Nenhuma unidade oferece esse serviço.</div>';
      return;
    }
    $("listaUnidades").innerHTML = lista
      .map((u) => {
        const ok = aberta(u);
        return `
        <article class="card ${ok ? "" : "warn"}">
          <div class="row">
            <div>
              <h3>${esc(u.nome)}</h3>
              <div class="meta">${esc(u.bairro)} • ${esc(u.distancia)}</div>
            </div>
            <span class="badge ${ok ? "ok" : "bad"}">${ok ? "🟢 Aberta" : "🔴 Em reunião"}</span>
          </div>
          <div class="meta" style="margin-top:6px">${esc(u.motivo_status)}</div>
          <div class="tags">${u.servicos_disponiveis.map((s) => `<span class="tag">${esc(NOMES_SERVICO[s] || s)}</span>`).join("")}</div>
          <div class="actions">
            <button class="btn-primary" data-agendar="${esc(u.id)}" ${ok ? "" : "disabled"}>${ok ? "Agendar aqui" : "Indisponível agora"}</button>
          </div>
        </article>`;
      })
      .join("");
    $("listaUnidades").querySelectorAll("[data-agendar]").forEach((b) =>
      b.addEventListener("click", () => abrirModal(state.filtro !== "todos" ? state.filtro : null, b.dataset.agendar))
    );
  }

  // ---------- Agenda ----------
  $("perfilNome").value = state.perfil.nome;
  $("perfilTelefone").value = state.perfil.telefone;

  $("perfilForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.perfil = { nome: $("perfilNome").value.trim(), telefone: $("perfilTelefone").value.trim() };
    localStorage.setItem("zelo_perfil", JSON.stringify(state.perfil));
    toast("Dados salvos.");
    carregarAgenda();
  });

  async function carregarAgenda() {
    const alvo = $("listaAgendamentos");
    try {
      const { agendamentos } = await api(`/api/cidadao/agendamentos?telefone=${encodeURIComponent(state.perfil.telefone)}`);
      if (!agendamentos.length) {
        alvo.innerHTML = '<div class="card">Você ainda não tem agendamentos.</div>';
        return;
      }
      alvo.innerHTML = agendamentos
        .map((a) => {
          const remanejado = a.status_alerta === "remanejado";
          const suspenso = !a.sala_aberta && !remanejado;
          const badge = remanejado ? '<span class="badge info">🔄 Transferido</span>'
            : suspenso ? '<span class="badge bad">⚠️ Suspenso</span>'
            : '<span class="badge ok">✅ Confirmado</span>';
          const aviso = suspenso
            ? `<div class="erro" style="margin-top:10px">Não saia de casa. ${esc(a.motivo || "Sala temporariamente fechada.")}</div>`
            : remanejado ? `<div class="meta" style="margin-top:8px">Agora em: <strong>${esc(a.remanejado_para || a.ubs.nome)}</strong></div>` : "";
          const acao = suspenso
            ? `<div class="actions"><button class="btn-primary" data-reag="${esc(a.servico)}">Reagendar em outra unidade</button></div>` : "";
          return `
          <article class="card ${suspenso ? "bad" : ""}">
            <div class="row">
              <div>
                <h3>${esc(NOMES_SERVICO[a.servico] || a.servico)}</h3>
                <div class="meta">${esc(a.horario)} • ${esc(a.ubs ? a.ubs.nome : "")}</div>
              </div>
              ${badge}
            </div>
            ${aviso}${acao}
          </article>`;
        })
        .join("");
      alvo.querySelectorAll("[data-reag]").forEach((b) => b.addEventListener("click", () => abrirModal(b.dataset.reag, null)));
    } catch (err) {
      alvo.innerHTML = `<div class="card bad">${esc(err.message)}</div>`;
    }
  }

  // ---------- Modal de agendamento ----------
  async function abrirModal(servicoPre, ubsPre) {
    if (!state.ubss.length) {
      try { state.ubss = (await api("/api/status")).ubss; } catch (_) { return toast("Erro ao carregar unidades."); }
    }
    const servicos = SERVICOS_ORDEM.filter((s) => state.ubss.some((u) => u.servicos_disponiveis.includes(s)));
    $("agServico").innerHTML = servicos.map((s) => `<option value="${s}">${NOMES_SERVICO[s]}</option>`).join("");
    if (servicoPre && servicos.includes(servicoPre)) $("agServico").value = servicoPre;
    preencherUbs(ubsPre);
    $("agErro").classList.add("hidden");
    $("modalAgendar").classList.remove("hidden");
  }

  function preencherUbs(ubsPre) {
    const servico = $("agServico").value;
    const opcoes = state.ubss.filter((u) => u.servicos_disponiveis.includes(servico));
    $("agUbs").innerHTML = opcoes
      .map((u) => `<option value="${esc(u.id)}">${esc(u.nome)} — ${aberta(u) ? "aberta" : "em reunião"}</option>`)
      .join("");
    if (ubsPre && opcoes.some((u) => u.id === ubsPre)) $("agUbs").value = ubsPre;
  }

  $("agServico").addEventListener("change", () => preencherUbs(null));
  $("btnNovoAgendamento").addEventListener("click", () => abrirModal(null, null));
  $("btnCancelarAg").addEventListener("click", () => $("modalAgendar").classList.add("hidden"));
  $("modalAgendar").addEventListener("click", (e) => { if (e.target.id === "modalAgendar") e.target.classList.add("hidden"); });

  $("agendarForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = $("agErro");
    erro.classList.add("hidden");
    try {
      await api("/api/paciente/agendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: state.perfil.nome,
          telefone: state.perfil.telefone,
          servico: $("agServico").value,
          ubs_id: $("agUbs").value,
          horario: $("agHorario").value
        })
      });
      $("modalAgendar").classList.add("hidden");
      toast("Agendamento confirmado! ✅");
      irPara("view-agenda");
    } catch (err) {
      erro.textContent = err.message + (err.data && err.data.motivo ? ` (${err.data.motivo})` : "");
      erro.classList.remove("hidden");
    }
  });

  // ---------- Geolocalização (GPS + CEP + Bairro) ----------
  atualizarTextoLocalizacao();

  $("btnUsarGps").addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      return toast("Seu navegador não tem GPS. Use CEP ou bairro.");
    }
    toast("Obtendo sua localização…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        salvarLocalizacao({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          bairro: null,
          origem: "GPS"
        });
        toast("Localização atualizada pelo GPS! 📍");
        if ($("view-unidades").classList.contains("active")) carregarUnidades();
      },
      () => toast("Não foi possível acessar o GPS. Tente informar seu CEP ou bairro."),
      { enableHighAccuracy: false, timeout: 7000 }
    );
  });

  $("btnAbrirLoc").addEventListener("click", async () => {
    $("locErro").classList.add("hidden");
    try {
      const { bairros } = await api("/api/geo/bairros");
      $("selectBairro").innerHTML = bairros
        .map((b) => `<option value="${esc(b.nome)}" data-lat="${b.lat}" data-lng="${b.lng}">${esc(b.nome)}</option>`)
        .join("");
      if (state.localizacao.bairro) $("selectBairro").value = state.localizacao.bairro;
    } catch (_) { /* mantém vazio se falhar */ }
    $("modalLoc").classList.remove("hidden");
  });

  $("btnCancelarLoc").addEventListener("click", () => $("modalLoc").classList.add("hidden"));
  $("modalLoc").addEventListener("click", (e) => { if (e.target.id === "modalLoc") e.target.classList.add("hidden"); });

  $("cepForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("locErro").classList.add("hidden");
    const cep = $("inputCep").value.replace(/\D/g, "");
    try {
      const res = await api(`/api/geo/cep/${cep}`);
      salvarLocalizacao({
        lat: res.latitude,
        lng: res.longitude,
        bairro: res.bairro || res.cidade,
        origem: `CEP ${res.cep}`
      });
      $("modalLoc").classList.add("hidden");
      toast(`Localização definida: ${res.bairro || res.cep} 📍`);
      if ($("view-unidades").classList.contains("active")) carregarUnidades();
    } catch (err) {
      $("locErro").textContent = err.message;
      $("locErro").classList.remove("hidden");
    }
  });

  $("btnSalvarBairro").addEventListener("click", () => {
    const sel = $("selectBairro");
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    salvarLocalizacao({
      lat: parseFloat(opt.dataset.lat),
      lng: parseFloat(opt.dataset.lng),
      bairro: opt.value,
      origem: "bairro"
    });
    $("modalLoc").classList.add("hidden");
    toast(`Bairro definido: ${opt.value} 📍`);
    if ($("view-unidades").classList.contains("active")) carregarUnidades();
  });

  // ---------- Início ----------
  irPara("view-inicio");
})();
