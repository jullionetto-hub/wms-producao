const crypto = require('crypto');

function dataHoraLocal() {
  const agora = new Date();
  const partes = agora.toLocaleDateString('pt-BR', {
    timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
  }).split('/');
  const dataISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
  const hora = agora.toLocaleTimeString('pt-BR', {
    timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', hour12:false
  });
  return { data: dataISO, hora };
}

function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha + 'wms_salt_2026').digest('hex');
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
    const d = new Date(new Date(1899,11,30).getTime() + num * 86400000);
    const p = n => String(n).padStart(2,'0');
    return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  return s;
}

module.exports = { dataHoraLocal, hashSenha, perfisPermitidos, formatarAguardandoDesde };
