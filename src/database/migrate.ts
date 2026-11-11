// Executa o schema completo (tabelas + índices).
// Todas as tabelas usam CREATE IF NOT EXISTS, então é seguro rodar múltiplas vezes.

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../../lib/db';
import { TABLES, INDEXES } from './schema';
import log from '../../lib/logger';

// Seed de configurações padrão e alterações de colunas aplicadas após criação inicial
export const ALTERATIONS: string[] = [
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_separacao','75','Meta pedidos separação/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_embalagem','120','Meta embalagem/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_checkout','90','Meta checkout/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('meta_reposicao','90','Meta reposição/turno') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_manha','8','Horas turno Manhã') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_tarde','8','Horas turno Tarde') ON CONFLICT (chave) DO NOTHING",
  "INSERT INTO configuracoes (chave,valor,descricao) VALUES ('horas_turno_noite','6','Horas turno Noite') ON CONFLICT (chave) DO NOTHING",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_separados INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS sep_em_separacao INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS ck_feitos INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS ck_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS emb_embalados INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS emb_pendentes INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS rep_procurando INTEGER DEFAULT 0",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS rep_na_rua INTEGER DEFAULT 0",
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS embalagem_iniciado_em VARCHAR(20) DEFAULT ''",
  "ALTER TABLE embalagem ADD COLUMN IF NOT EXISTS embalagem_inicio VARCHAR(20) DEFAULT ''",
  // Corrige o DEFAULT da coluna — novos pedidos devem começar como 'nao_iniciado', não 'pendente'
  "ALTER TABLE pedidos ALTER COLUMN status_embalagem SET DEFAULT 'nao_iniciado'",
  // Corrige pedidos existentes que nunca passaram pelo checkout nem pela embalagem
  `UPDATE pedidos SET status_embalagem='nao_iniciado'
   WHERE status='concluido'
     AND status_embalagem='pendente'
     AND NOT EXISTS (SELECT 1 FROM checkout c WHERE c.pedido_id=pedidos.id AND c.status='concluido')
     AND NOT EXISTS (SELECT 1 FROM embalagem e WHERE e.pedido_id=pedidos.id)`,
  // Normaliza valores de turno — remove acentos para consistência com o filtro do dashboard
  "UPDATE usuarios SET turno='Manha' WHERE turno='Manhã'",
  "UPDATE separadores SET turno='Manha' WHERE turno='Manhã'",
  // Garante colunas criado_em em tabelas criadas antes delas serem adicionadas ao schema
  "ALTER TABLE embalagem ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW()",
  "ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW()",
  "ALTER TABLE passagem_turno ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW()",
  // Garante coluna historico em avisos_repositor
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS historico JSONB DEFAULT '[]'::jsonb",
  // Turno do lote — definido pelo botão ativo na tela de distribuição
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS turno_distribuicao TEXT DEFAULT NULL",
  // Normaliza 'Madrugada' → 'Noite' em todos os registros (padronização do nome do turno)
  "UPDATE usuarios SET turno='Noite' WHERE turno='Madrugada'",
  "UPDATE separadores SET turno='Noite' WHERE turno='Madrugada'",
  "UPDATE pedidos SET turno_distribuicao='Noite' WHERE turno_distribuicao='Madrugada'",
  // Total de itens (soma de quantidades) — separado de 'itens' que é contagem de produtos distintos
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS total_itens INTEGER DEFAULT 0",
  // Backfill: preenche total_itens para pedidos já existentes a partir de itens_pedido
  `UPDATE pedidos SET total_itens = (SELECT COALESCE(SUM(ip.quantidade), 0) FROM itens_pedido ip WHERE ip.pedido_id = pedidos.id) WHERE total_itens = 0`,
  // Rastreio de tentativas de busca do repositor (máx 3 por item — uma por turno)
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS tentativas JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS total_tentativas INTEGER DEFAULT 0",
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_inicio_busca TEXT DEFAULT ''",
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_protocolo TEXT DEFAULT ''",
  // Data/hora em que o item realmente FECHOU como 'protocolado' — diferente de
  // hora_protocolo (que marca quando virou 'nao_encontrado'/aguardando decisão).
  // Usado pra filtrar a aba "Protocolados" pela data de fechamento, não a de abertura.
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS data_fechamento TEXT DEFAULT ''",
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS hora_fechamento TEXT DEFAULT ''",
  // Tempo real de separação: gravado quando o separador termina de escanear todos os SKUs.
  // Para pedidos sem falta = concluido_em. Para pedidos com falta = 1ª tentativa de concluir
  // (antes de aguardar repositor). Garante que espera por reposição não penaliza o separador.
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS skus_concluido_em TEXT DEFAULT ''",
  // Validação do Diário de Bordo por turno seguinte
  "ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'rascunho'",
  "ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS enviado_em TIMESTAMPTZ",
  "ALTER TABLE diario_bordo ADD COLUMN IF NOT EXISTS prazo_validacao TIMESTAMPTZ",
  // Heartbeat de sessão — último ping do frontend (para calcular tempo logado mesmo sem logout explícito)
  "ALTER TABLE sessoes_trabalho ADD COLUMN IF NOT EXISTS ultimo_ping TIMESTAMPTZ DEFAULT NOW()",
  // Tabela de ocorrências de colaboradores (Performance → aba Ocorrências)
  `CREATE TABLE IF NOT EXISTS ocorrencias (
    id               SERIAL PRIMARY KEY,
    colaborador_nome TEXT NOT NULL,
    tipo             TEXT NOT NULL,
    gravidade        TEXT NOT NULL DEFAULT 'leve',
    descricao        TEXT NOT NULL DEFAULT '',
    data             TEXT NOT NULL,
    turno            TEXT NOT NULL DEFAULT '',
    supervisor_nome  TEXT NOT NULL DEFAULT '',
    criado_em        TIMESTAMPTZ DEFAULT NOW()
  )`,
  "ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS colaborador_nome TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS data_distribuicao TEXT DEFAULT ''",
  // Corrige dessincronização: usuarios.turno era atualizado mas separadores.turno não
  // Usa usuarios.turno como fonte da verdade para todos os separadores vinculados
  `UPDATE separadores s SET turno = u.turno FROM usuarios u WHERE s.usuario_id = u.id AND u.turno IS NOT NULL AND u.turno != ''`,
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS caixa_lote TEXT DEFAULT NULL",
  // Ordem manual arrastada pelo repositor na aba Separar — compartilhada entre todos.
  "ALTER TABLE avisos_repositor ADD COLUMN IF NOT EXISTS ordem_manual INTEGER DEFAULT 0",
  // Ordem manual arrastada pelo separador na própria fila de pedidos.
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ordem_fila INTEGER DEFAULT 0",
  // Checklist de Caixas: quem estava operando a estação e em qual turno
  "ALTER TABLE checklist_caixas ADD COLUMN IF NOT EXISTS operador_nome TEXT DEFAULT ''",
  "ALTER TABLE checklist_caixas ADD COLUMN IF NOT EXISTS turno TEXT DEFAULT ''",
  // Banco de horas do dia (saída real - saída oficial do turno), absenteísmo nativo.
  // Abandonado em favor do Saldo Final oficial do PDF (ver saldo_final_min abaixo)
  // mas a coluna fica (sem uso, sem dado perdido em não apagar).
  "ALTER TABLE abs_registros_diarios ADD COLUMN IF NOT EXISTS banco_horas_min INTEGER",
  // Banco de horas = "Saldo Final" lido direto do resumo do PDF (já soma o
  // acumulado de períodos anteriores, não dá pra recalcular por conta própria).
  "ALTER TABLE abs_colaboradores ADD COLUMN IF NOT EXISTS saldo_final_min INTEGER",
  // Separação por lote (formação automática) — aponta o pedido de volta pro
  // lotes_separacao que o agrupou, se houver.
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS lote_id INTEGER DEFAULT NULL",
  // Estado (UF) do destinatário — vem da coluna "Destinatário - Estado" do
  // arquivo de transportadora importado. Usado pra imprimir na etiqueta e
  // classificar automaticamente NF cheia x Declaração/Talão (ver
  // lib/helpers.js classificarFiscal).
  "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT ''",
  // Itens em falta do checkout (antes só criada pela auto-migração de routes/checkout.ts, que falha num banco novo)
  "ALTER TABLE checkout ADD COLUMN IF NOT EXISTS itens_falta JSONB DEFAULT '[]'::jsonb",
  // Recado da gestão por turno: '' = todos os turnos; senão, os turnos que veem o recado separados por vírgula ("Manha,Noite")
  "ALTER TABLE diario_recados ADD COLUMN IF NOT EXISTS turnos TEXT NOT NULL DEFAULT ''",
];

export async function runSchema(): Promise<void> {
  // Cria/verifica tabelas
  for (const sql of TABLES) {
    await pool.query(sql).catch(e => log.warn({ err: e }, 'tabela: ignorado'));
  }
  // Cria índices — erros não são fatais (coluna pode não existir antes das ALTERATIONS)
  for (const sql of INDEXES) {
    await pool.query(sql).catch(e => log.warn({ err: e, sql }, 'índice: ignorado'));
  }
  // Migrações e seeds — erros sempre ignorados
  for (const sql of ALTERATIONS) await pool.query(sql).catch(() => {});
  // Re-tenta criar índices após as alterações (garante colunas existam)
  for (const sql of INDEXES) {
    await pool.query(sql).catch(e => log.warn({ err: e }, 'índice (2ª tentativa): ignorado'));
  }
  log.info('schema, índices e migrações aplicados com sucesso');

  // Migração de segurança: força troca de senha para usuários com hash SHA-256 legado.
  // SHA-256 com salt fixo é muito mais fraco que bcrypt — crackável em minutos com GPU.
  // Esses usuários nunca fizeram login desde a implementação do bcrypt.
  await migrarHashesLegados();
}

/**
 * Identifica usuários ativos com hash SHA-256 legado (não começa com $2) e força
 * redefinição de senha na próxima entrada. Gera uma senha temporária aleatória,
 * faz o hash com bcrypt e registra no log para o admin comunicar aos usuários.
 */
async function migrarHashesLegados(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, login, nome FROM usuarios
       WHERE status = 'ativo'
         AND senha_hash IS NOT NULL
         AND senha_hash != ''
         AND senha_hash NOT LIKE '$2%'
         AND senha_temporaria = false`
    );

    if (rows.length === 0) return;

    log.warn({ total: rows.length }, '⚠️  Usuários com hash SHA-256 legado detectados — forçando redefinição de senha');

    for (const u of rows) {
      // Senha aleatória DESCARTADA: ninguém precisa conhecê-la e ela NUNCA vai para o log (os logs do Railway
      // são visíveis a quem tem acesso ao projeto). O usuário só volta a entrar quando o supervisor definir
      // uma nova senha temporária em Usuários (PUT /usuarios/:id).
      const tempPlain = crypto.randomBytes(16).toString('hex');
      const tempHash  = await bcrypt.hash(tempPlain, 12);
      const expira    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

      await pool.query(
        `UPDATE usuarios
            SET senha_hash = $1,
                senha_temporaria = true,
                senha_temporaria_expira = $2
          WHERE id = $3`,
        [tempHash, expira, u.id]
      );

      // Loga SÓ quem foi afetado (nunca a senha), para o supervisor saber a quem definir uma nova senha.
      log.warn({ login: u.login, nome: u.nome },
        'Hash legado invalidado — o supervisor deve definir uma nova senha temporária para este usuário (tela Usuários)');
    }

    log.warn({ total: rows.length }, '✅  Migração de hashes legados concluída — defina uma nova senha temporária para cada usuário listado acima (tela Usuários)');
  } catch (e) {
    log.error({ err: e }, 'Erro na migração de hashes legados (não fatal)');
  }
}

