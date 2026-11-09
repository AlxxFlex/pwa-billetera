/** Local-only storage. Amounts are integer centavos, never floating-point pesos. */
export const CATEGORIES = Object.freeze(['Comida', 'Transporte', 'Servicios', 'Ocio', 'Otros']);

const DATABASE_NAME = 'mi-billetera-lite';
const DATABASE_VERSION = 1;
const STORE_NAME = 'expenses';
export const MAX_AMOUNT_CENTS = 99_999_999_999;
let databasePromise;

export function validateExpense(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('El gasto no es válido.');
  }

  const concept = typeof input.concept === 'string' ? input.concept.trim() : '';
  if (!concept || concept.length > 80) {
    throw new TypeError('Escribe un concepto de entre 1 y 80 caracteres.');
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX_AMOUNT_CENTS) {
    throw new TypeError('Escribe un monto mayor a cero y de hasta $999,999,999.99.');
  }
  if (!CATEGORIES.includes(input.category)) {
    throw new TypeError('Elige una categoría válida.');
  }

  const expense = { concept, amountCents: input.amountCents, category: input.category };
  if (input.occurredAt !== undefined) {
    if (typeof input.occurredAt !== 'string' || !Number.isFinite(Date.parse(input.occurredAt))) {
      throw new TypeError('La fecha del gasto no es válida.');
    }
    expense.occurredAt = new Date(input.occurredAt).toISOString();
  }
  return expense;
}

export function calculateTotal(expenses) {
  return expenses.reduce((total, expense) => {
    if (!Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new TypeError('Hay un gasto con un monto no válido.');
    }
    const next = total + expense.amountCents;
    if (!Number.isSafeInteger(next)) {
      throw new RangeError('El total supera el límite de cálculo seguro.');
    }
    return next;
  }, 0);
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Este navegador no permite guardar datos locales. Usa un navegador compatible con IndexedDB.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    let settled = false;
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
    request.onerror = () => {
      settled = true;
      databasePromise = undefined;
      reject(request.error || new Error('No se pudieron abrir tus gastos guardados.'));
    };
    request.onblocked = () => {
      settled = true;
      databasePromise = undefined;
      reject(new Error('Cierra las otras pestañas de Mi Billetera y vuelve a intentarlo.'));
    };
  });
  return databasePromise;
}

async function transact(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try {
      request = operation(store);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    // Resolve only once the entire transaction commits, not at request success.
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error || request.error || new Error('No se pudo guardar el cambio.'));
    transaction.onabort = () => reject(transaction.error || request.error || new Error('El cambio no se guardó. Inténtalo de nuevo.'));
  });
}

export async function listExpenses() {
  const expenses = await transact('readonly', store => store.getAll());
  return expenses.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

export async function addExpense(input) {
  const validated = validateExpense(input);
  const createdAt = new Date().toISOString();
  const expense = {
    ...validated,
    id: globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt,
    occurredAt: validated.occurredAt || createdAt,
  };
  await transact('readwrite', store => store.add(expense));
  return expense;
}

export async function deleteExpense(id) {
  if (typeof id !== 'string' || !id) throw new TypeError('El gasto no es válido.');
  await transact('readwrite', store => store.delete(id));
}

/** Optional browser best effort; failure never prevents saving expenses. */
export async function requestPersistence() {
  try {
    if (!globalThis.navigator?.storage?.persist) return false;
    return await globalThis.navigator.storage.persist();
  } catch {
    return false;
  }
}
