// Ajudantes compartilhados por mais de uma parte de routes/performance-dash/ (movidos sem alteracao; so ganharam "export").
import { sqlDiaOperacional } from '../../lib/helpers';

/* Dia operacional (data do turno): quem é da Noite tem o dia contado a partir da entrada do turno
   (22h), então o que acontece de 00h às 06h47 vale pro dia anterior. Ver lib/helpers.js. */
export const TURNO_DE_NOME = (n: any) => `(SELECT u_.turno FROM usuarios u_ WHERE u_.nome = ${n} LIMIT 1)`;
export const diaSep = (a: any) => sqlDiaOperacional({
  ts: `${a}.iniciado_em`,
  civil: `COALESCE(NULLIF(LEFT(${a}.iniciado_em,10),''), NULLIF(${a}.data_distribuicao,''), ${a}.data_pedido)`,
  turno: `(SELECT COALESCE(uu_.turno, ss_.turno) FROM separadores ss_ LEFT JOIN usuarios uu_ ON uu_.id = ss_.usuario_id WHERE ss_.id = ${a}.separador_id)`,
});
export const diaCk = (a: any) => sqlDiaOperacional({ ts: `${a}.data_checkout||' '||${a}.hora_checkout`, civil: `${a}.data_checkout`, turno: TURNO_DE_NOME(`${a}.operador_nome`) });
export const EMB_DATA_PED = (a: any) => `COALESCE((SELECT eb.data_embalagem FROM embalagem eb WHERE eb.pedido_id = ${a}.id ORDER BY eb.id DESC LIMIT 1), ${a}.data_pedido)`;
// Reposição: aviso (hora_aviso, repositor_nome) ou tentativa de um repositor (hora_inicio) dentro do aviso
export const diaAv = (a: any, quem: any) => sqlDiaOperacional({ ts: `${a}.data_aviso||' '||${a}.hora_aviso`, civil: `${a}.data_aviso`, turno: TURNO_DE_NOME(quem) });
export const diaAvTent = sqlDiaOperacional({ ts: "ar.data_aviso||' '||(t.value->>'hora_inicio')", civil: 'ar.data_aviso', turno: TURNO_DE_NOME("t.value->>'repositor'") });
// Duração em minutos que cruza a meia-noite (início 23:44, fim 00:01, mesma data): a conta direta dá negativo → soma 1 dia.
export const minDia = (expr: any) => `(CASE WHEN (${expr}) < 0 THEN (${expr}) + 1440 ELSE (${expr}) END)::numeric`;
