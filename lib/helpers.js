const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

function dataHoraLocal() {
  // Use en-US locale for consistent MM/DD/YYYY parsing regardless of server ICU data.
  // pt-BR may be unavailable on Railway containers, swapping day and month in the output.
  const agora = new Date();
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const pad = n => String(n).padStart(2, '0');
  const dataISO = `${sp.getFullYear()}-${pad(sp.getMonth() + 1)}-${pad(sp.getDate())}`;
  const hora = `${pad(sp.getHours())}:${pad(sp.getMinutes())}:${pad(sp.getSeconds())}`;
  return { data: dataISO, hora };
}

// Limites de relógio dos 3 turnos — mesmos usados em público/js/auth.js
// (_turnoAtualPorHora, ex: valor padrão do Diário de Bordo). Existem OUTRAS
// duas noções de "duração do turno" no projeto (configuracoes.horas_turno_*
// = 8/8/6h, usada só pra escalar metas; performance-dash.js TURNO_MIN =
// 465/465/453min, usada só pra escalar meta-por-tempo-logado) que não batem
// com estes horários de relógio — nenhuma das três é "errada", são usadas
// pra propósitos diferentes; esta aqui é a única com horário de início/fim
// de verdade, por isso é a usada para calcular "tempo restante até o fim do
// turno" (Control Tower).
const TURNOS_HORARIO = {
  Manha: { fimH: 13 },
  Tarde: { fimH: 22 },
  Noite: { fimH: 6 }, // atravessa a meia-noite
};

function turnoAtualEHorarios() {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const h = sp.getHours(), min = sp.getMinutes();
  let turno;
  if (h >= 6 && h < 13) turno = 'Manha';
  else if (h >= 13 && h < 22) turno = 'Tarde';
  else turno = 'Noite';
  const { fimH } = TURNOS_HORARIO[turno];
  const minutosAgora = h * 60 + min;
  const minutosFim = fimH * 60;
  const minutosRestantes = turno === 'Noite' && h >= 22
    ? (24 * 60 - minutosAgora) + minutosFim
    : minutosFim - minutosAgora;
  return { turno, fim_hora: `${String(fimH).padStart(2, '0')}:00`, minutos_restantes: minutosRestantes };
}

// Gera hash bcrypt para novas senhas
function hashSenha(senha) {
  return bcrypt.hashSync(senha, BCRYPT_ROUNDS);
}

// Verifica senha contra hash bcrypt ou SHA-256 legado
function verificarSenha(senha, hash) {
  if (!senha || !hash) return false;
  // Hash bcrypt começa com $2a$ ou $2b$
  if (hash.startsWith('$2')) {
    return bcrypt.compareSync(senha, hash);
  }
  // Fallback para hashes SHA-256 legados
  const legacyHash = crypto.createHash('sha256').update(senha + 'wms_salt_2026').digest('hex');
  return crypto.timingSafeEqual(Buffer.from(legacyHash), Buffer.from(hash));
}

// Indica se o hash precisa ser atualizado para bcrypt
function hashNeedsMigration(hash) {
  return hash && !hash.startsWith('$2');
}

function perfisPermitidos(user) {
  const extras = String(user.perfis_acesso||'').split(',').map(s=>s.trim()).filter(Boolean);
  return [...new Set([user.perfil, ...extras])];
}

function formatarAguardandoDesde(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  const num = parseFloat(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Aritmética em UTC de propósito: número serial do Excel é uma contagem de
    // dias sem timezone embutido. Calcular via new Date(ano,mes,dia) local e ler
    // com getHours()/getDate() fica refém do fuso do SO que roda o código — no
    // Windows local isso pegava o LMT histórico de -3:06 de 1899 do fuso de
    // São Paulo, arredondando a hora errado, e daria outro valor ainda num
    // runner de CI em UTC. UTC puro é o mesmo resultado em qualquer máquina.
    const d = new Date(Date.UTC(1899,11,30) + num * 86400000);
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }
  return s;
}

function sanitizeStr(val, maxLen = 255) {
  if (val === null || val === undefined) return '';
  return String(val).trim().slice(0, maxLen);
}

function validarId(id) {
  const n = parseInt(id);
  return !isNaN(n) && n > 0 ? n : null;
}

module.exports = { dataHoraLocal, turnoAtualEHorarios, hashSenha, verificarSenha, hashNeedsMigration, perfisPermitidos, formatarAguardandoDesde, sanitizeStr, validarId };
