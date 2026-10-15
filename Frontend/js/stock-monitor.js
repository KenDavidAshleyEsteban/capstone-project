(() => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const key = (product) => String(product._id || product.id);

  function label(state) {
    if (state.status === 'auth') return 'Stock checks stopped. Sign in again to continue.';
    if (state.status === 'offline') return 'You are offline. Displayed stock may be out of date.';
    if (state.status === 'error') return 'Unable to check stock. Showing the last known values; retrying automatically.';
    if (state.status === 'paused') return state.reason || 'Stock checks paused while you edit.';
    if (state.status === 'checking') return 'Checking the latest stock…';
    const time = new Date(state.checkedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `Auto stock updates every 15 seconds · Checked ${time}${state.changes ? ` · ${state.changes} listings updated` : ''}`;
  }

  function create({ url, token, onData, onState = () => {}, canUpdate = () => true, interval = 15000 }) {
    let active = false;
    let suspended = false;
    let timer;
    let controller;
    let pending;
    let generation = 0;
    let lastChecked;
    const emit = (status, extra = {}) => onState({ status, checkedAt: lastChecked, ...extra });
    const clear = () => { window.clearTimeout(timer); timer = undefined; };
    const schedule = () => {
      clear();
      if (active && !suspended && !document.hidden) timer = window.setTimeout(refresh, interval);
    };

    async function refresh() {
      clear();
      if (!active || suspended) return;
      if (document.hidden) { emit('paused', { reason: 'Stock checks paused while this tab is hidden.' }); return; }
      if (pending) return pending;
      if (navigator.onLine === false) { emit('offline'); schedule(); return; }
      if (!canUpdate()) { emit('paused'); schedule(); return; }
      const version = generation;
      controller = new AbortController();
      const signal = controller.signal;
      const timeout = window.setTimeout(() => controller?.abort(), 10000);
      emit('checking');
      pending = (async () => {
        try {
          const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal, cache: 'no-store' });
          if (!active || version !== generation || signal.aborted) return;
          if ([401, 403].includes(response.status)) { stop(); emit('auth'); return; }
          if (!response.ok) throw new Error('Unable to check stock.');
          const data = await response.json();
          if (!Array.isArray(data.products)) throw new Error('Invalid stock response.');
          if (!active || version !== generation || signal.aborted || suspended || document.hidden) return;
          if (!canUpdate()) { emit('paused'); return; }
          const changes = await onData(data.products);
          if (!active || version !== generation) return;
          lastChecked = data.checkedAt || new Date().toISOString();
          emit('live', { changes: Number(changes) || 0 });
        } catch (error) {
          if (active && version === generation && !suspended && !document.hidden) emit(navigator.onLine === false ? 'offline' : 'error');
        } finally {
          window.clearTimeout(timeout);
          pending = undefined;
          controller = undefined;
          if (version === generation) schedule();
        }
      })();
      return pending;
    }

    function visibility() {
      if (document.hidden) { clear(); controller?.abort(); emit('paused', { reason: 'Stock checks paused while this tab is hidden.' }); }
      else { if (pending) pending.finally(() => { if (active) refresh(); }); else refresh(); }
    }
    function online() { refresh(); }
    function pagehide() { suspended = true; clear(); controller?.abort(); }
    function pageshow() { suspended = false; refresh(); }
    function start() {
      if (active) return;
      active = true;
      suspended = false;
      generation += 1;
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('online', online);
      window.addEventListener('pagehide', pagehide);
      window.addEventListener('pageshow', pageshow);
      if (pending) pending.finally(() => { if (active) refresh(); });
      else refresh();
    }
    function stop() {
      active = false;
      generation += 1;
      clear();
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', pageshow);
    }
    return { start, stop, refresh };
  }

  function merge(products, snapshot) {
    let changes = 0;
    const byId = new Map(snapshot.map((product) => [key(product), product]));
    products.forEach((product) => {
      const latest = byId.get(key(product));
      if (!latest) return;
      if (Object.keys(latest).some((field) => String(product[field] ?? '') !== String(latest[field] ?? ''))) changes += 1;
      Object.assign(product, latest);
    });
    return changes;
  }

  function summary(container, products) {
    if (!container) return;
    const low = products.filter((product) => product.stock > 0 && product.stock <= 5);
    const out = products.filter((product) => product.stock === 0);
    container.innerHTML = `<div class="stock-monitor-counts"><div><strong>${products.reduce((sum, product) => sum + Number(product.stock || 0), 0)}</strong><span>Units on hand</span></div><div><strong>${low.length}</strong><span>Low-stock kits · 1–5 units</span></div><div><strong>${out.length}</strong><span>Zero-stock kits</span></div></div>
      <div class="stock-monitor-alerts">${[...out, ...low].map((product) => `<div class="stock-monitor-alert"><span class="pill ${product.stock === 0 ? 'red' : 'yellow'}">${escape(product.status)}</span><strong>${escape(product.name)}</strong><span>${product.stock} units left</span></div>`).join('') || '<p>All listed kits have more than 5 units in stock.</p>'}</div>`;
    if (!products.length) container.innerHTML = '<div class="empty">Add products to start monitoring stock.</div>';
  }
  window.GUNPLA_STOCK_MONITOR = { create, merge, summary, label, key };
})();
