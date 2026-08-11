// Middlewares de autenticação e autorização

function requerAuth(req, res, next) {
  if (!req.session?.usuario) {
    console.log(`[AUTH] 401 em ${req.method} ${req.path} — sem sessão. Session ID: ${req.sessionID}`);
    return res.status(401).json({ erro: 'Não autenticado. Faça login.' });
  }
  next();
}

function requerPerfil(...perfis) {
  return (req, res, next) => {
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
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATENTATIVAS = 10;

function checkRateLimit(key) {
  if (process.env.NODE_ENV === 'test') return true;
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < RATE_LIMIT_MAX_ATENTATIVAS;
}
function registrarFalhaLogin(key) {
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

module.exports = { requerAuth, requerPerfil, checkRateLimit, registrarFalhaLogin, _loginAttempts: loginAttempts };
