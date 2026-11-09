import { CATEGORIES, MAX_AMOUNT_CENTS, listExpenses, addExpense, deleteExpense, calculateTotal, requestPersistence } from './storage.js';

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const categoryStyles = {
  Comida: { icon: 'food', color: '#a88858', background: '#f1ece3' },
  Transporte: { icon: 'transport', color: '#6c8da6', background: '#eaf0f5' },
  Servicios: { icon: 'services', color: '#9d9561', background: '#f1f0e5' },
  Ocio: { icon: 'leisure', color: '#9882a7', background: '#f0ebf4' },
  Otros: { icon: 'other', color: '#7d9487', background: '#eaf0ec' },
};
let expenses = [];
let loaded = false;
let pendingDelete = null;
let installPrompt = null;
let registration = null;
let updateRequested = false;
let newerController = false;
let toastTimer;
let saving = false;
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('mi-billetera-changes') : null;

function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast-text').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3800);
}
function storageError(error) {
  console.error('No se pudo acceder al historial local:', error);
  $('#storage-error').textContent = 'No pudimos acceder a tus gastos. Comprueba que el navegador permita guardar datos y vuelve a intentarlo. No borres los datos del sitio si tienes gastos guardados.';
  $('#storage-error').hidden = false;
}
function displayDate(iso) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoy';
  if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined }).format(date);
}
function categoryIcon(category) {
  const style = categoryStyles[category];
  const holder = element('span', 'category-icon');
  holder.style.setProperty('--cat-color', style.color);
  holder.style.setProperty('--cat-bg', style.background);
  holder.append(icon(style.icon));
  return holder;
}
function renderSummary() {
  const total = calculateTotal(expenses);
  const parts = money.formatToParts(total / 100);
  const totalNode = $('#total-amount');
  totalNode.replaceChildren();
  const integerPart = parts.filter(({ type }) => !['decimal', 'fraction'].includes(type)).map(({ value }) => value).join('');
  const fractionPart = parts.filter(({ type }) => ['decimal', 'fraction'].includes(type)).map(({ value }) => value).join('');
  totalNode.append(document.createTextNode(integerPart), element('span', '', fractionPart));
  const now = new Date();
  const monthExpenses = expenses.filter((expense) => {
    const date = new Date(expense.occurredAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  $('#month-total').textContent = money.format(calculateTotal(monthExpenses) / 100);
  $('#month-caption').textContent = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(now);
  $('#expense-count').textContent = expenses.length.toLocaleString('es-MX');
  $('#history-count').textContent = expenses.length;
  $('#nav-count').textContent = expenses.length;
  $('#export-button').disabled = !expenses.length;
  renderCategories(total);
}
function renderCategories(total) {
  const grid = $('#category-grid');
  grid.replaceChildren();
  for (const category of CATEGORIES) {
    const amount = calculateTotal(expenses.filter((expense) => expense.category === category));
    const share = total ? (amount / total) * 100 : 0;
    const card = element('div', 'category-card');
    card.style.setProperty('--cat-color', categoryStyles[category].color);
    const top = element('div', 'category-card-top');
    top.append(categoryIcon(category), element('span', 'category-percent', `${Math.round(share)}%`));
    const track = element('div', 'category-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('span');
    fill.style.width = `${share}%`;
    track.append(fill);
    card.append(top, element('div', 'category-name', category), element('div', 'category-total', money.format(amount / 100)), track);
    grid.append(card);
  }
}
const initialEmptyState = $('#history-content').firstElementChild.cloneNode(true);
function renderHistory() {
  const query = $('#search').value.trim().toLocaleLowerCase('es-MX');
  const filter = $('#category-filter').value;
  const filtered = expenses.filter((expense) => expense.concept.toLocaleLowerCase('es-MX').includes(query) && (filter === 'all' || expense.category === filter));
  const content = $('#history-content');
  content.replaceChildren();
  $('#filtered-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'movimiento' : 'movimientos'}${filtered.length !== expenses.length ? ` de ${expenses.length}` : ''}`;
  if (!expenses.length) {
    content.append(initialEmptyState.cloneNode(true));
    return;
  }
  if (!filtered.length) {
    const empty = element('div', 'empty-state');
    empty.append(icon('search'), element('h3', '', 'No encontramos ese gasto.'), element('p', '', 'Prueba con otro concepto o categoría.'));
    const reset = element('button', 'text-button', 'Ver todos los movimientos');
    reset.type = 'button';
    reset.addEventListener('click', () => { $('#search').value = ''; $('#category-filter').value = 'all'; renderHistory(); });
    empty.append(reset);
    content.append(empty);
    return;
  }
  let lastDate = '';
  let list;
  for (const expense of filtered) {
    const date = displayDate(expense.createdAt);
    if (date !== lastDate) {
      content.append(element('h3', 'date-heading', date));
      list = element('ul', 'expense-list');
      content.append(list);
      lastDate = date;
    }
    const row = element('li', 'expense-row');
    const info = element('div', 'expense-info');
    const meta = element('div', 'expense-meta');
    meta.append(element('span', '', expense.category), element('span', 'meta-dot'), element('span', '', new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(expense.createdAt))));
    info.append(element('div', 'expense-concept', expense.concept), meta);
    const remove = element('button', 'delete-expense');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Eliminar gasto: ${expense.concept}`);
    remove.title = 'Eliminar gasto';
    remove.append(icon('trash'));
    remove.addEventListener('click', () => {
      pendingDelete = expense;
      $('#delete-description').textContent = `${expense.concept} · ${money.format(expense.amountCents / 100)}`;
      $('#delete-dialog').showModal();
      $('#cancel-delete').focus();
    });
    row.append(categoryIcon(expense.category), info, element('span', 'expense-amount', money.format(expense.amountCents / 100)), remove);
    list.append(row);
  }
}
async function refresh() {
  try {
    const records = await listExpenses();
    expenses = records;
    loaded = true;
    $('#storage-error').hidden = true;
    renderSummary();
    renderHistory();
  } catch (error) { storageError(error); }
}
function formError(message, field) {
  $('#form-error').textContent = message;
  $('#form-error').hidden = false;
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
}
$('#expense-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  $('#form-error').hidden = true;
  for (const field of [$('#concept'), $('#amount'), $('#category')]) field.removeAttribute('aria-invalid');
  const concept = $('#concept').value.trim();
  const rawAmount = $('#amount').value.trim().replace(',', '.');
  const category = $('#category').value;
  if (!concept) return formError('Escribe el concepto de tu gasto.', $('#concept'));
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(rawAmount)) return formError('Escribe un monto válido, con un máximo de 2 decimales. Ejemplo: 45.50.', $('#amount'));
  const [whole, decimals = ''] = rawAmount.split('.');
  const amountCents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) return formError('El monto debe ser mayor a $0 y menor a $1,000,000,000.', $('#amount'));
  if (!CATEGORIES.includes(category)) return formError('Elige una categoría para tu gasto.', $('#category'));
  saving = true;
  $('#save-button').disabled = true;
  $('#save-button span').textContent = 'Guardando…';
  try {
    await addExpense({ concept, amountCents, category });
    $('#expense-form').reset();
    $('#search').value = '';
    $('#category-filter').value = 'all';
    await refresh();
    channel?.postMessage('changed');
    showToast('Gasto guardado en este dispositivo');
    $('#concept').focus({ preventScroll: true });
    void requestPersistence();
  } catch (error) {
    formError('No pudimos guardar el gasto. Tu formulario sigue aquí; vuelve a intentarlo.');
    storageError(error);
  } finally {
    saving = false;
    $('#save-button').disabled = false;
    $('#save-button span').textContent = 'Guardar gasto';
  }
});
$('#confirm-delete').addEventListener('click', async () => {
  if (!pendingDelete) return;
  $('#confirm-delete').disabled = true;
  try {
    await deleteExpense(pendingDelete.id);
    $('#delete-dialog').close();
    pendingDelete = null;
    await refresh();
    channel?.postMessage('changed');
    showToast('Gasto eliminado');
  } catch (error) {
    $('#delete-dialog').close();
    storageError(error);
  } finally { $('#confirm-delete').disabled = false; }
});
$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
$('#delete-dialog').addEventListener('close', () => { pendingDelete = null; });
$('#search').addEventListener('input', renderHistory);
$('#category-filter').addEventListener('change', renderHistory);
$('#history-content').addEventListener('click', (event) => {
  if (event.target.closest('#first-expense')) $('#concept').focus();
});

function csvCell(value) {
  // Neutralize formulas when a concept is opened in spreadsheet software.
  const text = String(value);
  return `"${(/^[\s]*[=+\-@\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
$('#export-button').addEventListener('click', () => {
  if (!loaded || !expenses.length) return;
  const rows = [['Fecha', 'Concepto', 'Categoría', 'Monto (MXN)'], ...expenses.map((expense) => [expense.createdAt, expense.concept, expense.category, (expense.amountCents / 100).toFixed(2)])];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = element('a');
  link.href = url;
  link.download = `mi-billetera-${new Date().toLocaleDateString('sv-SE')}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Tu archivo de gastos está listo');
});
for (const button of document.querySelectorAll('[data-help]')) button.addEventListener('click', () => $('#help-dialog').showModal());
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
for (const link of document.querySelectorAll('[data-nav]')) link.addEventListener('click', () => {
  document.querySelectorAll('[data-nav]').forEach((item) => item.classList.toggle('active', item === link));
  const target = document.getElementById(link.dataset.nav);
  target?.focus({ preventScroll: true });
});

function updateConnection() {
  $('#connection-label').textContent = navigator.onLine ? 'En línea' : 'Sin conexión';
  $('#connection-status').classList.toggle('is-offline', !navigator.onLine);
  $('#connection-status').title = 'Puedes registrar gastos con o sin internet.';
}
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('#install-button').hidden = false;
});
const standalone = window.matchMedia('(display-mode: standalone)');
function updateInstallButton() { $('#install-button').hidden = standalone.matches || navigator.standalone === true; }
standalone.addEventListener('change', updateInstallButton);
window.addEventListener('appinstalled', () => { installPrompt = null; $('#install-button').hidden = true; showToast('Tu billetera ya está instalada'); });
$('#install-button').addEventListener('click', async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch { $('#install-dialog').showModal(); }
    return;
  }
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    $('#install-instructions').textContent = 'Abre esta página en Safari, toca el botón Compartir y elige “Agregar a inicio”. Confirma con “Agregar” para tener tu billetera como una app.';
  } else if (/Firefox/.test(ua)) {
    $('#install-instructions').textContent = 'En Android, abre el menú y toca “Instalar”. En una computadora, abre la app en Chrome o Edge para instalarla. Puedes usarla sin conexión también desde este navegador.';
  }
  $('#install-dialog').showModal();
});
function offerUpdate() {
  if (registration?.waiting && navigator.serviceWorker.controller) $('#update-banner').hidden = false;
}
$('#update-button').addEventListener('click', () => {
  // Keep an unfinished expense intact until the user saves it.
  if ($('#concept').value.trim() || $('#amount').value.trim()) {
    showToast('Guarda tu gasto antes de actualizar');
    return;
  }
  if (registration?.waiting) {
    updateRequested = true;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else if (newerController) {
    location.reload();
  }
});
async function prepareOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    $('#offline-status').textContent = 'Abre la app en HTTPS o localhost para habilitar el modo offline';
    return;
  }
  let refreshing = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    if (updateRequested && !$('#concept').value.trim() && !$('#amount').value.trim()) {
      refreshing = true;
      location.reload();
    } else {
      newerController = true;
      $('#update-banner').hidden = false;
    }
  });
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
    });
    await navigator.serviceWorker.ready;
    $('#offline-status').textContent = 'Lista para usar sin conexión';
  } catch (error) {
    console.error('No se pudo preparar el modo offline:', error);
    $('#offline-status').textContent = 'Conéctate y recarga para preparar el modo offline';
  }
}
channel?.addEventListener('message', () => { void refresh(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) void refresh(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && loaded) void refresh(); });
$('#current-date').textContent = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
updateConnection();
updateInstallButton();
renderCategories(0);
void refresh();
void prepareOffline();
