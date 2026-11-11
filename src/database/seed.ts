// Cria o usuário administrador padrão se ainda não existir.
// ATENÇÃO: A senha padrão '123456' deve ser trocada no primeiro login.
// O campo senha_temporaria=true força a troca de senha ao entrar.

import { pool }      from '../../lib/db';
import { hashSenha } from '../../lib/helpers';

export async function criarUsuarioPadrao(): Promise<void> {
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (login) DO NOTHING`,
    ['Supervisor Master', 'admin', hashSenha('123456'),
     'supervisor', 'separador,repositor,checkout', 'ativo', true]
  );
}
