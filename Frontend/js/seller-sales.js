(() => {
  'use strict';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
  const requestId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-sale`;
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  async function record(api, token, body) {
    try {
      const response = await fetch(`${api}/sales`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Unable to record the sale. Please try again.');
      return data;
    } catch (error) {
      if (['AbortError', 'TimeoutError'].includes(error.name)) throw new Error('The request timed out. Refresh sale history to check whether it saved. Retrying this unchanged form will not record the sale twice.');
      throw error;
    }
  }

  function mount({ container, products, receipts, api, token, onSaved }) {
    if (!container) return;
    container.innerHTML = `<div class="seller-panel-head"><div><p class="kicker">Completed sales</p><h2 id="sellerSalesTitle">Record a sale</h2><p>Enter a completed purchase to update sales analytics and predictions. Reservations are counted separately.</p></div></div>
      <form class="seller-sale-form" id="sellerSaleForm">
        <label class="sale-product">Product<select id="saleProduct" required ${products.length ? '' : 'disabled'}>${products.map((product) => `<option value="${escape(product._id)}">${escape(product.name)} (${escape(product.id)})</option>`).join('') || '<option>No products in your catalog</option>'}</select></label>
        <label>Quantity<input id="saleQuantity" type="number" min="1" max="1000000" step="1" value="1" required></label>
        <label>Unit price (PHP)<input id="saleUnitPrice" type="number" min="0" max="10000000" step="0.01" required></label>
        <label>Sale date<input id="saleDate" type="date" min="2000-01-01" max="${today()}" value="${today()}" required></label>
        <label class="sale-stock-toggle"><input id="saleDeductStock" type="checkbox" checked>Deduct quantity from current stock</label>
        <p id="saleStockHint" class="seller-note"></p>
        <div class="sale-submit"><strong id="saleTotal"></strong><button type="submit" class="primary-btn" ${products.length ? '' : 'disabled'}>Save completed sale</button></div>
      </form>
      <p class="seller-note">For a historical sale whose stock movement is already recorded, clear the stock checkbox to avoid deducting it again.</p>
      <p id="sellerSaleStatus" role="status"></p>
      <h3>Sale history · last 28 days</h3>
      <div class="seller-sale-history">${receipts.slice(0, 10).map((receipt) => `<article><div><strong>${escape(receipt.items)}</strong><small>${escape(receipt.date)} · ${escape(receipt.id)}</small></div><strong>${money(receipt.amount)}</strong></article>`).join('') || '<div class="empty">No completed sales recorded for this store yet.</div>'}</div>
      ${receipts.length > 10 ? `<p class="seller-note">Showing the 10 most recent receipts; analytics include all ${receipts.length} sales in this period.</p>` : ''}`;
    const form = container.querySelector('#sellerSaleForm');
    const byId = (id) => container.querySelector(`#${id}`);
    let id = requestId();
    let saving = false;
    const update = () => {
      const product = products.find((item) => item._id === byId('saleProduct').value);
      byId('saleStockHint').textContent = product ? `${product.stock} units currently in stock.` : 'Add a catalog product before recording sales.';
      const total = Number(byId('saleQuantity').value) * Number(byId('saleUnitPrice').value);
      byId('saleTotal').textContent = Number.isFinite(total) ? `Total: ${money(total)}` : 'Enter quantity and price.';
    };
    byId('saleProduct').addEventListener('change', () => {
      byId('saleUnitPrice').value = products.find((product) => product._id === byId('saleProduct').value)?.price ?? '';
      update();
    });
    byId('saleUnitPrice').value = products[0]?.price ?? '';
    byId('saleDate').addEventListener('change', () => { byId('saleDeductStock').checked = byId('saleDate').value === today(); });
    form.addEventListener('input', update);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving || !form.reportValidity()) return;
      const body = { requestId: id, type: 'product', productId: byId('saleProduct').value, quantity: Number(byId('saleQuantity').value),
        unitPrice: Number(byId('saleUnitPrice').value), date: byId('saleDate').value, deductStock: byId('saleDeductStock').checked };
      saving = true;
      form.dataset.saving = 'true';
      const controls = [...form.querySelectorAll('button, input, select')];
      controls.forEach((control) => { control.disabled = true; });
      byId('sellerSaleStatus').textContent = 'Saving completed sale…';
      try {
        const sale = await record(api, token, body);
        id = requestId();
        await onSaved(sale);
      } catch (error) { byId('sellerSaleStatus').textContent = error.message; }
      finally { saving = false; form.dataset.saving = 'false'; controls.forEach((control) => { control.disabled = false; }); }
    });
    update();
  }
  window.GUNPLA_SALES = { mount, record, requestId, today };
})();
