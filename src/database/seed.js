'use strict';
/**
 * src/database/seed.js
 * Cria o usuário administrador padrão se o banco estiver vazio.
 */

const bcrypt = require('bcrypt');
const db     = require('../../lib/db');

async function criarUsuarioPadrao() {
  const existe = db.prepare('SELECT id FROM usuarios WHERE login = ?').get('admin');
  if (existe) return;

  const hash = await bcrypt.hash('admin123', 10);
  db.prepare(`
    INSERT INTO usuarios (nome, login, senha_hash, perfil, turno, senha_temporaria)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('Administrador', 'admin', hash, 'supervisor', 'Manha', 1);

  console.log('[seed] Admin criado — login: admin | senha: admin123 (TROQUE AO PRIMEIRO ACESSO)');
}

module.exports = { criarUsuarioPadrao };
