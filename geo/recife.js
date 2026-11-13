// geo/recife.js - Geolocalização, Haversine e Tabela de Bairros do Recife/PE

const BAIRROS_RECIFE = {
  "BAIRRO DO RECIFE": { lat: -8.0631, lng: -34.8711 },
  "SANTO AMARO": { lat: -8.0468, lng: -34.8812 },
  "BOA VISTA": { lat: -8.0592, lng: -34.8891 },
  "SOLEDADE": { lat: -8.0564, lng: -34.8919 },
  "DERBY": { lat: -8.0545, lng: -34.8998 },
  "GRACAS": { lat: -8.0469, lng: -34.9012 },
  "ESPINHEIRO": { lat: -8.0422, lng: -34.8936 },
  "ENCRUZILHADA": { lat: -8.0345, lng: -34.8916 },
  "BEBERIBE": { lat: -8.0039, lng: -34.8967 },
  "AGUA FRIA": { lat: -8.0168, lng: -34.8995 },
  "ARRUDA": { lat: -8.0235, lng: -34.8938 },
  "CASA AMARELA": { lat: -8.0252, lng: -34.9174 },
  "CASA FORTE": { lat: -8.0348, lng: -34.9225 },
  "NOVA DESCOBERTA": { lat: -8.0101, lng: -34.9255 },
  "VASCO DA GAMA": { lat: -8.0163, lng: -34.9211 },
  "ALTO DO MANDU": { lat: -8.0243, lng: -34.9285 },
  "MACAXEIRA": { lat: -8.0138, lng: -34.9348 },
  "MADALENA": { lat: -8.0558, lng: -34.9085 },
  "TORRE": { lat: -8.0468, lng: -34.9125 },
  "CORDEIRO": { lat: -8.0502, lng: -34.9258 },
  "TORROES": { lat: -8.0589, lng: -34.9319 },
  "IPUTINGA": { lat: -8.0386, lng: -34.9310 },
  "CAXANGA": { lat: -8.0307, lng: -34.9558 },
  "VARZEA": { lat: -8.0485, lng: -34.9592 },
  "PRADO": { lat: -8.0638, lng: -34.9137 },
  "BONGI": { lat: -8.0672, lng: -34.9235 },
  "SAN MARTIN": { lat: -8.0695, lng: -34.9308 },
  "AFOGADOS": { lat: -8.0756, lng: -34.9094 },
  "MUSTARDINHA": { lat: -8.0721, lng: -34.9182 },
  "BARRO": { lat: -8.0898, lng: -34.9422 },
  "TOTO": { lat: -8.0794, lng: -34.9704 },
  "JARDIM SAO PAULO": { lat: -8.0812, lng: -34.9403 },
  "CURADO": { lat: -8.0729, lng: -34.9435 },
  "TEJIPIO": { lat: -8.0885, lng: -34.9522 },
  "COHAB": { lat: -8.1197, lng: -34.9481 },
  "IBURA": { lat: -8.1155, lng: -34.9382 },
  "JORDAO": { lat: -8.1316, lng: -34.9370 },
  "PINA": { lat: -8.0874, lng: -34.8898 },
  "BRASILIA TEIMOSA": { lat: -8.0842, lng: -34.8815 },
  "IMBIRIBEIRA": { lat: -8.1168, lng: -34.9110 },
  "IPSEP": { lat: -8.1065, lng: -34.9185 },
  "BOA VIAGEM": { lat: -8.1334, lng: -34.9047 }
};

function normalizarTexto(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function resolverBairroParaCoordenadas(bairro) {
  const chave = normalizarTexto(bairro);
  if (BAIRROS_RECIFE[chave]) {
    return { bairro: chave, ...BAIRROS_RECIFE[chave] };
  }
  const parcial = Object.keys(BAIRROS_RECIFE).find(
    (b) => b.includes(chave) || chave.includes(b)
  );
  if (parcial) {
    return { bairro: parcial, ...BAIRROS_RECIFE[parcial] };
  }
  return null;
}

function listarBairros() {
  return Object.keys(BAIRROS_RECIFE)
    .sort()
    .map((nome) => ({
      nome,
      lat: BAIRROS_RECIFE[nome].lat,
      lng: BAIRROS_RECIFE[nome].lng
    }));
}

/**
 * Calcula distância em linha reta (Haversine) em quilômetros
 */
function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatarDistanciaTempo(km) {
  if (km == null || Number.isNaN(km)) return null;
  if (km < 1.2) {
    const minPe = Math.max(2, Math.round((km / 4.5) * 60));
    const metros = Math.round(km * 1000);
    return `${minPe} min a pé (${metros}m)`;
  }
  const minOnibus = Math.max(4, Math.round((km / 18) * 60) + 3);
  return `${minOnibus} min (${km.toFixed(1)} km)`;
}

/**
 * Consulta ViaCEP e converte para coordenadas aproximadas via bairro local
 */
async function buscarCepViaCep(cepRaw) {
  const cep = String(cepRaw || "").replace(/\D/g, "");
  if (cep.length !== 8) {
    throw new Error("CEP deve ter 8 dígitos.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal
    });
    if (!res.ok) throw new Error("Falha ao consultar ViaCEP.");
    const data = await res.json();
    if (data.erro) throw new Error("CEP não encontrado.");

    const coords = resolverBairroParaCoordenadas(data.bairro);
    return {
      cep: data.cep,
      logradouro: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      uf: data.uf || "",
      latitude: coords ? coords.lat : -8.0578,
      longitude: coords ? coords.lng : -34.8829,
      aproximado_recife: Boolean(coords)
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  BAIRROS_RECIFE,
  normalizarTexto,
  resolverBairroParaCoordenadas,
  listarBairros,
  calcularDistanciaKm,
  formatarDistanciaTempo,
  buscarCepViaCep
};
