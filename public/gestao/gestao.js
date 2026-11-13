// gestao.js - Portal Dedicado da Gestão Municipal (B2G)
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function carregarGestao() {
    const rpa = $("filtroRpa").value;
    const res = await fetch(`/api/gestao/kpis?rpa=${encodeURIComponent(rpa)}`);
    const data = await res.json();
    const { kpis, ubss, auditoria, engine } = data;

    $("kpiViagens").textContent = Number(kpis.viagens_perdidas_evitadas || 0).toLocaleString("pt-BR");
    $("kpiHoras").textContent = `${Number(kpis.horas_fila_poupadas || 0).toLocaleString("pt-BR")}h`;
    $("kpiRede").textContent = `${kpis.ubss_abertas}/${kpis.total_ubss_rede} abertas`;
    $("kpiRedeDetalhe").textContent = `${kpis.ubss_interrompidas} unidade(s) com sala interrompida`;
    $("kpiGuardrails").textContent = `${kpis.guardrails_violacoes_bloqueadas} bloqueios`;
    $("kpiAlertas").textContent = `${kpis.alertas_preventivos_disparados} alertas preventivos enviados`;
    $("dbEngineBadge").textContent = `Banco: ${engine || "PostgreSQL"}`;

    $("demandBars").innerHTML = (kpis.distribuicao_demandas || [])
      .map((d) => `
        <div class="bar-row">
          <div class="bar-labels"><span>${esc(d.servico)}</span><strong>${d.quantidade} (${d.percentual}%)</strong></div>
          <div class="bar-bg"><div class="bar-fill" style="width:${d.percentual}%"></div></div>
        </div>`)
      .join("");

    const interrompidas = ubss.filter((u) => u.status_atual !== "aberto" && u.status_atual !== "aberto_normal");
    if (interrompidas.length > 0) {
      $("iaRecomendacao").innerHTML = `Identificada interrupção em <strong>${esc(interrompidas[0].nome)} (${esc(interrompidas[0].bairro)})</strong>. O Agente Sentinela já está redirecionando a demanda para unidades abertas da mesma RPA, evitando deslocamentos perdidos.`;
    } else {
      $("iaRecomendacao").textContent = "Rede operando em equilíbrio na região selecionada. Nenhum gargalo crítico detectado no momento.";
    }

    $("auditLog").innerHTML = (auditoria || [])
      .map((a) => `
        <div class="audit-item ${esc(a.tipo)}">
          <small>[${new Date(a.criado_em).toLocaleTimeString("pt-BR")}] ${esc(a.tag)}</small>
          <span>${esc(a.detalhe)}</span>
        </div>`)
      .join("");

    $("tabelaRede").innerHTML = ubss
      .map((u) => {
        const ok = u.status_atual === "aberto" || u.status_atual === "aberto_normal";
        const pct = Math.min(100, Math.round((u.atendimentos_hoje / u.capacidade_diaria) * 100));
        return `
        <tr>
          <td>${esc(u.cnes)}</td>
          <td><strong>${esc(u.nome)}</strong><br><small style="color:#a0aec0">${esc(u.endereco)}</small></td>
          <td>${esc(u.bairro)} <small style="color:#a0aec0">(RPA ${esc(u.rpa)})</small></td>
          <td>${u.servicos_disponiveis.map((s) => esc(s)).join(", ")}</td>
          <td>${u.atendimentos_hoje}/${u.capacidade_diaria} (${pct}%)</td>
          <td><span class="badge ${ok ? "ok" : "warn"}">${ok ? "🟢 Aberta" : "🔴 Interrupção"}</span></td>
        </tr>`;
      })
      .join("");
  }

  $("filtroRpa").addEventListener("change", carregarGestao);
  $("btnAtualizar").addEventListener("click", carregarGestao);

  carregarGestao();
})();
