import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Data-URL import also works before package.json declares this project as ESM.
const source = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
const { CATEGORIES, MAX_AMOUNT_CENTS, validateExpense, calculateTotal, listExpenses, requestPersistence } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const validExpense = { concept: 'Café', amountCents: 4550, category: 'Comida' };

test('normalizes text, preserves integer centavos, and does not mutate input', () => {
  const input = { ...validExpense, concept: '  Café  ' };
  assert.deepEqual(validateExpense(input), validExpense);
  assert.equal(input.concept, '  Café  ');
});

test('accepts every allowed category and the amount boundaries', () => {
  for (const category of CATEGORIES) {
    assert.equal(validateExpense({ ...validExpense, category, amountCents: 1 }).amountCents, 1);
  }
  assert.equal(validateExpense({ ...validExpense, amountCents: MAX_AMOUNT_CENTS }).amountCents, MAX_AMOUNT_CENTS);
  assert.ok(Object.isFrozen(CATEGORIES));
});

test('rejects zero, negative, fractional, unsafe, missing, and excessive amounts', () => {
  for (const amountCents of [0, -1, 45.5, NaN, Infinity, '4550', undefined, MAX_AMOUNT_CENTS + 1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateExpense({ ...validExpense, amountCents }), /monto/i);
  }
});

test('rejects empty or oversized concepts and unknown categories', () => {
  for (const concept of ['', '   ', null, 123, 'a'.repeat(81)]) {
    assert.throws(() => validateExpense({ ...validExpense, concept }), /concepto/i);
  }
  assert.equal(validateExpense({ ...validExpense, concept: 'a'.repeat(80) }).concept.length, 80);
  assert.throws(() => validateExpense({ ...validExpense, category: 'Viajes' }), /categoría/i);
  assert.throws(() => validateExpense(null), /válido/i);
});

test('normalizes an explicit expense timestamp without moving it to now', () => {
  const result = validateExpense({ ...validExpense, occurredAt: '2026-11-09T10:30:00-06:00' });
  assert.equal(result.occurredAt, '2026-11-09T16:30:00.000Z');
  assert.throws(() => validateExpense({ ...validExpense, occurredAt: 'no date' }), /fecha/i);
});

test('adds decimal currency exactly through integer centavos', () => {
  assert.equal(calculateTotal([{ amountCents: 10 }, { amountCents: 20 }, { amountCents: 15000 }]), 15030);
  assert.equal(calculateTotal([]), 0);
  assert.throws(() => calculateTotal([{ amountCents: 12.5 }]), /monto/i);
  assert.throws(() => calculateTotal([{ amountCents: Number.MAX_SAFE_INTEGER }, { amountCents: 1 }]), /seguro/i);
});

test('unsupported local storage is an explicit error instead of an empty history', async () => {
  await assert.rejects(listExpenses(), /IndexedDB/);
});

test('persistence permission is optional when unsupported', async () => {
  assert.equal(await requestPersistence(), false);
});
