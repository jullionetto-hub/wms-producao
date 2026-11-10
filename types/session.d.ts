// Tipos da sessao (req.session). So descricao para o TypeScript checar o codigo:
// nao existe em tempo de execucao. Formato conforme routes/auth.js (login).
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    usuario?: {
      id: number;
      nome: string;
      login: string;
      perfil: string;
      subtipo_repositor: string;
      turno?: string;
      perfis_acesso: string;
    };
    separador?: {
      id: number;
      nome: string;
      matricula: string;
      turno: string;
      status: string;
    } | null;
  }
}
