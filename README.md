# ZELO-AKCIT-CAMP
# Zelo — Dignidade e Previsibilidade no Acesso às UBS via Agentes de IA
> AKCIT Camp Multicêntrico 2026 — Etapa Regional Nordeste (Recife/PE)

## 1. O Problema Real (Evidência e Validação)
Milhares de cidadãos enfrentam dois gargalos invisíveis na Atenção Básica do SUS:
1. **Filas de madrugada sem garantia de ficha:** Pacientes idosos (como nossa persona Dona Maria, 68 anos) e trabalhadores chegam às UBSs entre 04h00 e 06h00 sem saber se haverá fichas ou médico disponível.
2. **Desinformação operacional em tempo real:** Ferramentas genéricas (como Google Maps ou horários estáticos) informam apenas distância e horário comercial padrão, ignorando **catálogos reais de serviços** (ex.: postos que não aplicam vacinas) e **interrupções operacionais momentâneas** (ex.: salas fechadas por reuniões internas de equipe ou falta médica). Isso gera múltiplas viagens perdidas no mesmo dia.

## 2. A Solução Zelo
O Zelo é um sistema multiagente autônomo que atua como ponte inteligente entre a realidade operacional da UBS e a necessidade imediata do cidadão. Ele elimina deslocamentos desnecessários cruzando a intenção do usuário com a matriz real de serviços das unidades e o status operacional ao vivo, além de disparar alertas preventivos antes que o paciente saia de casa.

## 3. Arquitetura do Sistema Multiagente

```mermaid
graph TD
    C([Cidadão: Texto ou Voz]) -->|1. Solicitação Natural| A1[Agente 1: Triagem e Descoberta]
    R([Recepção UBS / Rosana]) -->|Atualização de Status/Falta| A2[Agente 2: Sentinela Operacional]

    subgraph Núcleo de Orquestração e Inteligência
        A1 -->|RAG: Matriz de Serviços| KB[(Base Oficial de Serviços UBS)]
        A1 -->|Function Calling: Status Vivo| DB[(Banco Operacional UBS)]
        A1 -->|Function Calling: Reserva| DB
        
        A2 -->|Varredura de Afetados| DB
        A2 -->|Busca Unidade Alternativa| KB
    end

    A1 -->|2. Recomendação Assertiva / Ficha| C
    A2 -->|3. Alerta Preventivo + Remanejamento| C
    A2 -->|Painel de Demanda Reprimida| G([Gestor Municipal / Marcelo])
