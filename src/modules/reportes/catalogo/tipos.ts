export type TipoCampo = 'string' | 'number' | 'decimal' | 'date' | 'boolean' | 'enum' | 'relacion';

export type OperadorFiltro =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'in'
  | 'between';

export type FuncionMetrica = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface CampoReporte {
  key: string;
  label: string;
  tipo: TipoCampo;
  /** Ruta de campos a recorrer desde el modelo raíz (ej. ['proyecto', 'nombre']). */
  path: string[];
  enumValues?: string[];
  operadores: OperadorFiltro[];
  agrupable?: boolean;
  metrica?: boolean;
  relacion?: {
    /** Clave de entidad relacionada, usada por el frontend para resolver el endpoint del combobox. */
    entidad: string;
    labelField: string;
  };
  /** Campo derivado en tiempo de agregación (no es un valor crudo de la base de datos). */
  virtual?: {
    transform: 'mesTruncado';
  };
}

export interface ReporteEntidadMeta {
  entidad: string;
  label: string;
  modeloPrisma: string;
  campos: CampoReporte[];
  campoFechaDefault?: string;
}
