// Ajudantes compartilhados por mais de uma parte de routes/pedidos/ (movidos sem alteracao; so ganharam "export").

// Executa `fn` um de cada vez para o mesmo item (fila de promessas por item_id).
// Usado para tornar "checa se já existe aviso + insere" atômico dentro deste processo.
export const _filaPorItem = new Map();
