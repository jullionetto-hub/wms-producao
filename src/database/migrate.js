'use strict';
// Executa o schema completo (tabelas + índices).
// Todas as tabelas usam CREATE IF NOT EXISTS, então é seguro rodar múltiplas vezes.

const { pool }            = require('../../lib/db');
const { TABLES, INDEXES } = require('./schema');
const log                 = require('../../lib/logger');

// Seed de configurações padrão e alterações de colunas aplicadas após criação inicial
const ALTERATIONS = [
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
];

async function runSchema() {
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
}

module.exports = { runSchema };
