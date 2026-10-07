import { jest } from '@jest/globals';

export type AnyFn = (...args: any[]) => any;
export type MockFn = jest.Mock<AnyFn>;

/** jest.fn sin firma estricta, para mocks de servicios y Prisma. */
export const fn = (impl?: AnyFn): MockFn =>
  impl ? jest.fn<AnyFn>(impl) : jest.fn<AnyFn>();

export type PrismaMock = Record<string, Record<string, MockFn>> & {
  $transaction: MockFn;
  $executeRaw: MockFn;
  $queryRaw: MockFn;
};

/**
 * Prisma falso: `prisma.modelo.metodo` es un jest.fn creado al primer acceso que
 * resuelve `null` (findUnique/findFirst), `[]` (findMany), `0` (count) o el
 * `data` recibido (create/update/upsert) salvo que el test lo configure.
 * `$transaction` acepta callback (recibe el mismo mock) o arreglo de promesas.
 */
export function prismaMock(): PrismaMock {
  const modelos = new Map<string, Record<string, MockFn>>();

  const porDefecto = (metodo: string): AnyFn => {
    if (metodo.startsWith('findMany') || metodo === 'groupBy')
      return () => Promise.resolve([]);
    if (metodo === 'count') return () => Promise.resolve(0);
    if (metodo === 'aggregate')
      return () =>
        Promise.resolve({ _sum: {}, _count: {}, _max: {}, _min: {} });
    if (['create', 'update', 'upsert'].includes(metodo))
      return (args: any) =>
        Promise.resolve({
          id: 'nuevo-id',
          ...(args?.data ?? args?.create ?? {}),
        });
    if (['createMany', 'updateMany', 'deleteMany'].includes(metodo))
      return () => Promise.resolve({ count: 0 });
    if (metodo === 'delete') return () => Promise.resolve({});
    return () => Promise.resolve(null);
  };

  const modelo = (nombre: string) => {
    if (!modelos.has(nombre)) {
      const metodos: Record<string, MockFn> = {};
      modelos.set(
        nombre,
        new Proxy(metodos, {
          get(target, metodo: string) {
            if (!(metodo in target)) target[metodo] = fn(porDefecto(metodo));
            return target[metodo];
          },
        }),
      );
    }
    return modelos.get(nombre)!;
  };

  const raiz: any = {
    $executeRaw: fn(() => Promise.resolve(1)),
    $queryRaw: fn(() => Promise.resolve([])),
  };
  const proxy = new Proxy(raiz, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined;
      return modelo(prop);
    },
  });
  raiz.$transaction = fn((arg: any) =>
    typeof arg === 'function' ? arg(proxy) : Promise.all(arg),
  );
  return proxy as PrismaMock;
}

/**
 * Servicio falso: cualquier método es un jest.fn que devuelve `{ metodo, args }`,
 * útil para probar que un controlador delega con los argumentos correctos.
 */
export function serviceMock<T = any>(): T & Record<string, MockFn> {
  const metodos: Record<string, MockFn> = {};
  return new Proxy(metodos, {
    get(target, metodo: string) {
      if (metodo === 'then') return undefined;
      if (!(metodo in target))
        target[metodo] = fn((...args: unknown[]) => ({ metodo, args }));
      return target[metodo];
    },
  }) as T & Record<string, MockFn>;
}
