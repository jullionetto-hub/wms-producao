const { pool } = require('./db');
const { dataHoraLocal } = require('./helpers');

async function registrarAuditoria(req, acao, entidade='', entidadeId=null, dadosAntes=null, dadosDepois=null) {
  try {
    const u = req.session?.usuario;
    const {data, hora} = dataHoraLocal();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    await pool.query(
      `INSERT INTO auditoria (usuario_id, usuario_login, usuario_nome, acao, entidade, entidade_id, dados_antes, dados_depois, ip, data, hora)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [u?.id||null, u?.login||'sistema', u?.nome||'sistema', acao, entidade, entidadeId,
       dadosAntes?JSON.stringify(dadosAntes):null,
       dadosDepois?JSON.stringify(dadosDepois):null,
       ip, data, hora]
    ).catch(()=>{});
  } catch(e) {}
}

module.exports = { registrarAuditoria };
