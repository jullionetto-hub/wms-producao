// Middlewares de autenticação e autorização
import type { Request, Response, NextFunction } from 'express';

export function requerAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.usuario) {
    console.log(`[AUTH] 401 em ${req.method} ${req.path} — sem sessão. Session ID: ${req.sessionID}`);
    return res.status(401).json({ erro: 'Não autenticado. Faça login.' });
  }
  next();
}

export function requerPerfil(...perfis: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.usuario) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }
    const user = req.session.usuario;
    const perfisUser = [
      user.perfil,
      ...String(user.perfis_acesso||'').split(',').map(s=>s.trim()).filter(Boolean)
    ];
    // gestor herda todas as permissões de supervisor
    if (perfisUser.includes('gestor') && !perfisUser.includes('supervisor')) {
      perfisUser.push('supervisor');
    }
    const temPermissao = perfis.some(p => perfisUser.includes(p));
    if (!temPermissao) {
      console.log(`[AUTH] Acesso negado: ${user.login} (${user.perfil}) tentou rota que requer ${perfis.join('/')}`);
      return res.status(403).json({ erro: `Acesso negado. Perfil necessário: ${perfis.join(' ou ')}` });
    }
    next();
  };
}

// Rate limiting para login — chave por IP+login (não só IP), para que várias pessoas
// logando de uma mesma rede/IP compartilhado (comum em galpão) não travem umas às
// outras. Só conta tentativas com senha errada; login bem-sucedido nunca consome a cota.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATENTATIVAS = 10;

export function checkRateLimit(key: string): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < RATE_LIMIT_MAX_ATENTATIVAS;
}
export function registrarFalhaLogin(key: string): void {
  if (process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count:0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW_MS; }
  entry.count++;
  loginAttempts.set(key, entry);
}
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key);
  }
}, 60 * 60 * 1000);
if (_cleanupInterval.unref) _cleanupInterval.unref();

export const _loginAttempts = loginAttempts;

// ── Diário de Bordo: quem entra e em qual setor ───────────────────────────────
// Supervisor e gestor acessam o diário inteiro. Quem trabalha num setor (separação, reposição,
// embalagem, checkout) entra no diário só para preencher/consultar o SEU setor — nunca para enviar
// o diário nem validar o do turno anterior (isso continua sendo do supervisor).
export const SETOR_DIARIO_DO_PERFIL: Record<string, string> = {
  separador: 'separacao', repositor: 'reposicao', embalador: 'embalagem', checkout: 'checkout',
};

// null = acesso total (supervisor/gestor); lista = só esses setores; [] = sem acesso ao diário
export function setoresDiarioDoUsuario(user: { perfil?: string; perfis_acesso?: string | null } | undefined): string[] | null {
  if (!user) return [];
  const perfis = [user.perfil || '', ...String(user.perfis_acesso || '').split(',').map(s => s.trim())].filter(Boolean);
  if (perfis.includes('supervisor') || perfis.includes('gestor')) return null;
  return [...new Set(perfis.map(p => SETOR_DIARIO_DO_PERFIL[p]).filter(Boolean))];
}

export function requerDiario(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
  const setores = setoresDiarioDoUsuario(req.session.usuario);
  if (setores && !setores.length) return res.status(403).json({ erro: 'Acesso negado. Seu perfil não tem acesso ao Diário de Bordo.' });
  (req as any).setoresDiario = setores;   // null = todos
  next();
}

// Gestão (perfil gestor sem o perfil supervisor) só acompanha o Diário: não preenche, não envia, não valida.
export function ehGestao(req: Request): boolean {
  const u: any = req.session?.usuario || {};
  const perfis = [u.perfil, ...String(u.perfis_acesso || '').split(',').map((s: string) => s.trim())];
  return perfis.includes('gestor') && !perfis.includes('supervisor');
}
