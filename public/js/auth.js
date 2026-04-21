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
    const temPermissao = perfis.some(p => perfisUser.includes(p));
    if (!temPermissao) {
      console.log(`[AUTH] Acesso negado: ${user.login} (${user.perfil}) tentou rota que requer ${perfis.join('/')}`);
      return res.status(403).json({ erro: `Acesso negado. Perfil necessário: ${perfis.join(' ou ')}` });
    }
    next();
  };
}

// Rate limiting para login
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  const entry = loginAttempts.get(ip) || { count:0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= maxAttempts;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

module.exports = { requerAuth, requerPerfil, checkRateLimit };
