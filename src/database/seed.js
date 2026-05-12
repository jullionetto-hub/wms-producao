'use strict';
// Cria o usuário administrador padrão se ainda não existir.
// ATENÇÃO: A senha padrão '123456' deve ser trocada no primeiro login.
// O campo senha_temporaria=true força a troca de senha ao entrar.

const { pool }      = require('../../lib/db');
const { hashSenha } = require('../../lib/helpers');

async function criarUsuarioPadrao() {
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (login) DO NOTHING`,
    ['Supervisor Master', 'admin', hashSenha('123456'),
     'supervisor', 'separador,repositor,checkout', 'ativo', true]
  );
}

module.exports = { criarUsuarioPadrao };
