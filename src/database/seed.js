'use strict';
/**
 * src/database/seed.js
 * Cria o usuário administrador padrão se não existir.
 */

const bcrypt    = require('bcrypt');
const { pool }  = require('../../lib/db');

async function criarUsuarioPadrao() {
  const { rows } = await pool.query('SELECT id FROM usuarios WHERE login = $1', ['admin']);
  if (rows.length > 0) return;

  const hash = await bcrypt.hash('admin123', 10);
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, turno, senha_temporaria)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    ['Administrador', 'admin', hash, 'supervisor', 'Manha', 1]
  );

  console.log('[seed] Admin criado — login: admin | senha: admin123 (TROQUE NO PRIMEIRO ACESSO)');
}

module.exports = { criarUsuarioPadrao };
