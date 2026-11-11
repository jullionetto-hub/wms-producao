/**
 * Proteções contra "um erro esquecido derruba o servidor inteiro".
 *
 * Contexto: o Express 4 não captura erro de rota `async`. Uma exceção ali virava uma promessa rejeitada sem
 * dono (unhandledRejection) e, no Node >= 15, o PROCESSO INTEIRO caía (todos os usuários) — era o risco de
 * `/kpis` com parâmetro repetido. Agora:
 *   1) ativarCapturaDeErrosAsync(): o erro de uma rota async vira next(err) -> resposta 500 só daquela
 *      requisição (é o que o Express 5 faz nativamente);
 *   2) tratadorDeErros: o handler final de erros (responde 500 em JSON e registra no log);
 *   3) registrarTratadoresDeProcesso(): rede de segurança para o que escapar do resto.
 */
import log from './logger';

// Express não tem tipos para este arquivo interno
const Layer = require('express/lib/router/layer');

let ativado = false;

export function ativarCapturaDeErrosAsync(): void {
  if (ativado) return;
  ativado = true;
  // Igual ao Layer.prototype.handle_request original do Express 4, mais o tratamento da promessa devolvida.
  Layer.prototype.handle_request = function handleRequest(this: any, req: any, res: any, next: any) {
    const fn = this.handle;
    if (fn.length > 3) return next(); // handler de erro: não é um handler comum de requisição
    try {
      const retorno = fn(req, res, next);
      if (retorno && typeof retorno.then === 'function') retorno.then(undefined, next);
    } catch (err) {
      next(err);
    }
  };
}

/** Handler final de erros do Express: registra e responde 500 em JSON. */
export function tratadorDeErros(err: any, req: any, res: any, _next: any): void {
  log.error({ err, url: req.url, method: req.method }, 'unhandled-error');
  if (res.headersSent) return; // a resposta já saiu (rota que respondeu e falhou depois): não dá para mandar outra
  res.status(500).json({ erro: process.env.NODE_ENV === 'production' ? 'Erro interno do servidor.' : err.message });
}

/**
 * - promessa rejeitada sem dono: registra e SEGUE no ar (um erro isolado não derruba todo mundo);
 * - exceção não capturada: o estado do processo é incerto, então registra e encerra com código 1;
 *   o Railway reinicia o serviço sozinho (restartPolicyType = ON_FAILURE).
 */
export function registrarTratadoresDeProcesso(): void {
  process.on('unhandledRejection', (motivo) => {
    log.error({ err: motivo }, 'unhandled-rejection (o servidor continua no ar)');
  });
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'uncaught-exception — encerrando para o Railway reiniciar o servico');
    setTimeout(() => process.exit(1), 200); // tempo para o log sair
  });
}
