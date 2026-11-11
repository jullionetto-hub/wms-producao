// Cria o usuário administrador padrão SOMENTE na primeira execução (tabela de usuários vazia).
// Antes ele era recriado a cada reinício se o login "admin" não existisse — ou seja, se alguém apagasse ou
// renomeasse o admin, voltava um supervisor com a senha padrão '123456'. Agora, havendo qualquer usuário, não cria nada.
// ATENÇÃO: A senha padrão '123456' deve ser trocada no primeiro login.
// O campo senha_temporaria=true força a troca de senha ao entrar.

import { pool }      from '../../lib/db';
import { hashSenha } from '../../lib/helpers';

export async function criarUsuarioPadrao(): Promise<void> {
  const { rows } = await pool.query('SELECT 1 FROM usuarios LIMIT 1');
  if (rows.length > 0) return;
  await pool.query(
    `INSERT INTO usuarios (nome, login, senha_hash, perfil, perfis_acesso, status, senha_temporaria)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (login) DO NOTHING`,
    ['Supervisor Master', 'admin', hashSenha('123456'),
     'supervisor', 'separador,repositor,checkout', 'ativo', true]
  );
}
