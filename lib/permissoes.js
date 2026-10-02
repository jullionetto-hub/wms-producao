/* ══ Permissões Granulares — lib/permissoes.js ══
   V12 da evolução do WMS: camada ADITIVA sobre requerPerfil (lib/auth.js),
   nunca uma substituição — o próprio audit avisou pra "estender, não
   substituir" o modelo de perfil atual (item 19 do briefing). Por padrão
   (sem nenhuma linha em permissoes_usuario), o acesso continua sendo
   exatamente o que requerPerfil já decidiu — essa função só pode ficar
   MAIS restritiva que o perfil, nunca mais permissiva: ela só nega quando
   existir uma revogação EXPLÍCITA pra aquele usuário+ação.

   Aplicada, por decisão consciente de escopo, só nas ações mais destrutivas
   hoje (excluir usuário/separador, exclusão em massa de pedidos, zerar
   dados) — não em todas as ~225 rotas, pra não arriscar quebrar acesso em
   massa numa mudança só.
══════════════════════════════════════════════════════════════════════ */
const { db } = require('./db');

const ACOES = ['ver', 'criar', 'editar', 'excluir', 'executar', 'aprovar', 'administrar'];

function requerPermissao(acao) {
  return async (req, res, next) => {
    const usuarioId = req.session?.usuario?.id;
    if (!usuarioId) return next(); // requerAuth já roda antes na cadeia de middlewares
    try {
      const row = await db.get(
        `SELECT concedida FROM permissoes_usuario WHERE usuario_id=$1 AND acao=$2`,
        [usuarioId, acao]
      );
      if (row && row.concedida === false) {
        console.log(`[PERMISSAO] Acesso negado: ${req.session.usuario.login} teve a ação "${acao}" revogada explicitamente.`);
        return res.status(403).json({ erro: `Acesso negado. A ação "${acao}" foi revogada pra este usuário.` });
      }
      next();
    } catch (e) {
      // Falha ao consultar a tabela não deve travar uma operação que o
      // perfil já autorizou — essa camada só pode RESTRINGIR, nunca é a
      // única linha de defesa (requerPerfil já rodou antes dela).
      next();
    }
  };
}

module.exports = { ACOES, requerPermissao };
