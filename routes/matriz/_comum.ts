// Ajudantes compartilhados por mais de uma parte de routes/matriz/ (movidos sem alteracao; so ganharam "export").
import { requerPerfil } from '../../lib/auth';

// ── Matriz de Responsabilidades — proxy completo ────────────────────────────
// App FastAPI separado (repo próprio "matriz-responsabilidades"), com seu
// próprio banco e seu próprio sistema de papéis (gerente/coordenador/
// supervisor por turno). O WMS autentica como UMA conta de serviço fixa
// (MATRIZ_EMAIL/MATRIZ_PASSWORD, normalmente gerente — acesso total), então
// todo mundo que acessa essas rotas pelo WMS herda esse acesso total — por
// isso as rotas aqui são restritas a gestor/supervisor do WMS, e as ações
// "de referência" (grade RACI, cargos, incentivo, carreira) só a gestor.
export const MATRIZ_URL  = (process.env.MATRIZ_URL || 'https://matriz-responsabilidades-production.up.railway.app').replace(/\/$/, '');
export const MATRIZ_USER = process.env.MATRIZ_EMAIL    || '';
export const MATRIZ_PASS = process.env.MATRIZ_PASSWORD || '';

export let _token: string | null = null;
export let _tokenExp = 0;

export async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExp) return _token;
  if (!MATRIZ_USER || !MATRIZ_PASS) throw new Error('Credenciais da Matriz não configuradas (MATRIZ_EMAIL / MATRIZ_PASSWORD)');
  const body = new URLSearchParams();
  body.set('username', MATRIZ_USER);
  body.set('password', MATRIZ_PASS);
  const res = await fetch(`${MATRIZ_URL}/api/auth/login`, { method: 'POST', body });
  if (!res.ok) {
    let d = ''; try { d = ((await res.json()) as any).detail || ''; } catch {}
    throw new Error(`Auth Matriz ${res.status}: ${d}`);
  }
  const { access_token } = (await res.json()) as any;
  _token    = access_token;
  _tokenExp = Date.now() + 50 * 60 * 1000;
  return _token as string;
}

export const gLeitura = requerPerfil('gestor', 'supervisor'); // leitura + edição
export const gGestor  = requerPerfil('gestor');                // "referência": RACI, cargos, incentivo, carreira

/* ══════════════════════════════════════════════════════════════════════════
   ROTAS NATIVAS — leem/escrevem direto no banco do WMS (tabelas mz_*), sem
   depender mais do serviço externo. Dados já migrados e conferidos
   (ver /matriz/migrar/conferencia). O serviço externo só continua sendo
   usado pelas rotas de /matriz/migrar* abaixo, pra re-sincronizar se
   necessário — não é mais chamado no dia a dia.
══════════════════════════════════════════════════════════════════════════ */

export const wrap = (fn: any) => async (req: any, res: any) => {
  try { await fn(req, res); }
  catch (e) { res.status(500).json({ erro: e.message }); }
};
