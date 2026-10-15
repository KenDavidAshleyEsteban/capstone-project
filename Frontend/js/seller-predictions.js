(() => {
  "use strict";

  const DAY = 86400000;
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const keyForDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);

  function parseDay(value) {
    if (typeof value !== "string") return null;
    let key = value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      if (!/^\d{4}-\d{2}-\d{2}T/.test(key) || !Number.isFinite(Date.parse(key))) return null;
      key = dateKey(new Date(key));
    }
    const milliseconds = Date.parse(`${key}T00:00:00Z`);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === key ? milliseconds / DAY : null;
  }

  function calculate({ products = [], receipts = [], storeId, now = new Date(), horizon = 7, includeDemo = false }) {
    horizon = [7, 14, 30].includes(Number(horizon)) ? Number(horizon) : 7;
    const today = parseDay(dateKey(now));
    const seen = new Set();
    const sales = receipts.flatMap((receipt) => {
      const day = parseDay(receipt.date);
      const amount = Number(receipt.amount);
      if (!storeId || String(receipt.storeId || "") !== String(storeId)
        || !["sale", "seller-offer"].includes(receipt.source)
        || (receipt.isDemo && !includeDemo)
        || (receipt.status && !["completed", "paid"].includes(String(receipt.status).toLowerCase()))
        || day === null || day < today - 27 || day > today
        || !Number.isFinite(amount) || amount < 0 || !receipt.id || seen.has(receipt.id)) return [];
      seen.add(receipt.id);
      return [{ ...receipt, day, amount }];
    });
    const observedDays = sales.length ? today - Math.min(...sales.map((sale) => sale.day)) + 1 : 0;
    const salesDays = new Set(sales.map((sale) => sale.day)).size;
    const ready = observedDays >= 7 && salesDays >= 3;
    const recent = sales.filter((sale) => sale.day >= today - 6);
    const previous = sales.filter((sale) => sale.day >= today - 13 && sale.day < today - 6);
    const revenue = recent.reduce((sum, sale) => sum + sale.amount, 0);
    const previousRevenue = previous.reduce((sum, sale) => sum + sale.amount, 0);
    const dailyRevenue = revenue / 7;
    const series = Array.from({ length: 7 }, (_, index) => {
      const day = today - 6 + index;
      return { date: keyForDay(day), revenue: recent.filter((sale) => sale.day === day).reduce((sum, sale) => sum + sale.amount, 0) };
    });
    const rows = products.map((product) => {
      let hasItemHistory = false;
      const matches = (line) => [product.id, product._id].filter(Boolean).some((id) => String(id) === String(line.productId));
      const units = sales.reduce((sum, sale) => {
        const items = Array.isArray(sale.lineItems) ? sale.lineItems : [];
        return sum + items.reduce((quantity, line) => {
          if (!matches(line) || !Number.isInteger(line.quantity) || line.quantity <= 0) return quantity;
          hasItemHistory = true;
          return quantity + (sale.day >= today - 6 ? line.quantity : 0);
        }, 0);
      }, 0);
      const dailyUnits = units / 7;
      const stock = Math.max(0, Number(product.stock) || 0);
      const expectedUnits = Math.ceil(dailyUnits * horizon);
      const daysCover = dailyUnits > 0 ? stock / dailyUnits : null;
      return { id: product.id, name: product.name, stock, units, hasItemHistory, expectedUnits, daysCover,
        reorder: Math.max(0, expectedUnits - stock), atRisk: daysCover !== null && daysCover < horizon };
    }).sort((a, b) => Number(b.atRisk) - Number(a.atRisk) || b.expectedUnits - a.expectedUnits);
    return { ready, horizon, today: keyForDay(today), endDate: keyForDay(today + horizon), observedDays, salesDays,
      receiptCount: sales.length, dailyRevenue, predictedRevenue: dailyRevenue * horizon,
      predictedUnits: Math.ceil(rows.reduce((sum, row) => sum + row.units, 0) / 7 * horizon),
      trend: observedDays >= 14 && previousRevenue > 0 ? (revenue - previousRevenue) / previousRevenue * 100 : null,
      atRisk: rows.filter((row) => row.atRisk).length, hasItemHistory: rows.some((row) => row.hasItemHistory), rows, series };
  }

  function demoReceipts(products, storeId, now = new Date()) {
    if (!products.length) return [];
    const today = parseDay(dateKey(now));
    return Array.from({ length: 28 }, (_, index) => {
      const day = today - 27 + index;
      const product = products[index % products.length];
      const quantity = index % 4 === 0 ? 2 : 1;
      return { id: `forecast-preview-${index}`, storeId, source: "sale", isDemo: true,
        date: keyForDay(day), amount: (Number(product.price) || 0) * quantity,
        lineItems: [{ productId: product.id, quantity }] };
    });
  }

  function chart(forecast) {
    const { series, dailyRevenue, horizon } = forecast;
    const maximum = Math.max(1, dailyRevenue, ...series.map((point) => point.revenue));
    const x = (index) => 30 + index / (6 + horizon) * 700;
    const y = (amount) => 170 - amount / maximum * 140;
    const actual = series.map((point, index) => `${x(index)},${y(point.revenue)}`).join(" ");
    const predicted = `${x(6)},${y(series[6].revenue)} ${x(7)},${y(dailyRevenue)} ${x(6 + horizon)},${y(dailyRevenue)}`;
    return `<div class="prediction-chart">
      <div class="prediction-chart-key"><span>Daily revenue</span><span class="prediction-actual-key">Recorded</span><span class="prediction-estimate-key">Predicted</span></div>
      <svg viewBox="0 0 760 200" role="img" aria-label="Last seven days of daily revenue and the predicted daily average of ${escape(money(dailyRevenue))} for the next ${horizon} days">
        <path class="prediction-grid-line" d="M30 30H730M30 100H730M30 170H730" />
        <line class="prediction-divider" x1="${x(6)}" y1="20" x2="${x(6)}" y2="175" />
        <polyline class="prediction-actual-line" points="${actual}" />
        <polyline class="prediction-estimate-line" points="${predicted}" />
        <text x="30" y="195">${escape(series[0].date)}</text>
        <text x="${x(6)}" y="15" text-anchor="middle">Today</text>
        <text x="730" y="195" text-anchor="end">${escape(forecast.endDate)}</text>
      </svg>
    </div>`;
  }

  function mount({ container, products, receipts, storeId, now = new Date() }) {
    if (!container) return;
    container.innerHTML = `
      <div class="seller-panel-head prediction-heading">
        <div><p class="kicker">Look ahead</p><h2 id="sellerPredictionsTitle">Sales and stock predictions</h2><p class="seller-note">Estimate upcoming sales and spot kits that may need restocking.</p></div>
        <div class="prediction-controls">
          <label for="predictionSource">Sales history<select id="predictionSource"><option value="recorded">Saved store sales</option><option value="demo" ${products.length ? "" : "disabled"}>Demo preview</option></select></label>
          <label for="predictionHorizon">Predict ahead<select id="predictionHorizon"><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option></select></label>
        </div>
      </div>
      <div id="predictionResults" aria-live="polite"></div>`;
    const source = container.querySelector("#predictionSource");
    const horizon = container.querySelector("#predictionHorizon");
    const results = container.querySelector("#predictionResults");
    const draw = () => {
      const demo = source.value === "demo";
      const forecast = calculate({ products, storeId, now, horizon: horizon.value,
        receipts: demo ? demoReceipts(products, storeId, now) : receipts, includeDemo: demo });
      const sourceNote = demo
        ? "Demo preview — sample sales based on your catalog prices. These figures are not saved and do not represent actual sales."
        : "Based on this store's completed sales saved to the database. Reservations, simulations, other stores, and older receipts are excluded.";
      const history = `${forecast.observedDays} calendar days covered · ${forecast.salesDays} sales days · ${forecast.receiptCount} receipts`;
      if (!forecast.ready) {
        results.innerHTML = `<p class="prediction-source-note">${sourceNote}</p><div class="empty prediction-empty"><h3>More sales history needed</h3><p>Predictions need sales on at least 3 different days across 7 calendar days within the last 28 days.</p><p>${escape(history)}</p><p>${products.length ? "Choose Demo preview above to explore predictions with sample sales." : "Add products to your catalog to explore stock predictions."}</p></div>`;
        return;
      }
      results.innerHTML = `
        <p class="prediction-source-note">${sourceNote}</p>
        <div class="prediction-metrics">
          <article><span>Predicted sales</span><b>${escape(money(forecast.predictedRevenue))}</b><small>Next ${forecast.horizon} days</small></article>
          <article><span>Expected kit units</span><b>${forecast.hasItemHistory ? forecast.predictedUnits : "—"}</b><small>${forecast.hasItemHistory ? "From itemized catalog sales" : "Itemized kit sales needed"}</small></article>
          <article><span>Stockout risk</span><b>${forecast.hasItemHistory ? forecast.atRisk : "—"}</b><small>${forecast.hasItemHistory ? "Kits below predicted demand" : "Itemized kit sales needed"}</small></article>
          <article><span>Weekly sales change</span><b>${forecast.trend === null ? "—" : `${forecast.trend >= 0 ? "+" : ""}${Math.round(forecast.trend)}%`}</b><small>${forecast.trend === null ? "Two weeks of comparable history needed" : "Last 7 days vs previous 7 days"}</small></article>
        </div>
        ${chart(forecast)}
        <div class="prediction-table-wrap"><table class="prediction-table"><caption>Stock plan for the next ${forecast.horizon} days. Unit estimates are rounded up.</caption><thead><tr><th scope="col">Product</th><th scope="col">In stock</th><th scope="col">Expected units</th><th scope="col">Stock lasts</th><th scope="col">Suggested reorder</th></tr></thead><tbody>
          ${forecast.rows.map((row) => `<tr><th scope="row">${escape(row.name)}${row.atRisk ? '<span class="pill red">Restock soon</span>' : ""}</th><td>${row.stock}</td><td>${row.hasItemHistory ? row.expectedUnits : "—"}</td><td>${!row.hasItemHistory ? "No item history" : row.daysCover === null ? "No recent demand" : row.daysCover === 0 ? "Out of stock" : row.daysCover < 1 ? "Less than 1 day" : `${Math.floor(row.daysCover)} days`}</td><td>${row.hasItemHistory ? `${row.reorder} units` : "—"}</td></tr>`).join("") || '<tr><td colspan="5">Add catalog products to see a stock plan.</td></tr>'}
        </tbody></table></div>
        <p class="prediction-method">Method: the last 7 calendar days' average daily sales × the selected period, including days with no sales. Stock coverage uses exact product quantities from itemized receipts. Estimates assume the recent pace continues; they do not account for seasonality or demand hidden by stockouts.</p>
        <p class="prediction-history">${escape(history)}${forecast.observedDays < 14 ? " · Limited history; estimates may change quickly." : ""}</p>`;
    };
    source.addEventListener("change", draw);
    horizon.addEventListener("change", draw);
    draw();
  }

  window.GUNPLA_PREDICTIONS = { calculate, demoReceipts, mount, dateKey };
})();
