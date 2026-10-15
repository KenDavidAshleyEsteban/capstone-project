(() => {
  "use strict";

  const DAY = 86400000;
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const keyForDay = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  const displayDate = (key) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${key}T00:00:00Z`));

  function parseDay(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const ms = Date.parse(`${key}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === key ? ms / DAY : null;
  }

  function calculate({ receipts = [], storeId, period = "daily", days = 28, now = new Date() } = {}) {
    period = ["daily", "weekly", "monthly"].includes(period) ? period : "daily";
    days = [28, 90, 365].includes(Number(days)) ? Number(days) : 28;
    const last = parseDay(dateKey(now));
    const first = last - days + 1;
    const groups = new Map();
    const groupKey = (day) => {
      const date = new Date(day * DAY);
      if (period === "monthly") return keyForDay(day).slice(0, 7);
      if (period === "weekly") return keyForDay(day - (date.getUTCDay() + 6) % 7);
      return keyForDay(day);
    };
    // Build calendar buckets first so days without receipts remain visible.
    for (let day = first; day <= last; day++) {
      const key = groupKey(day);
      if (!groups.has(key)) groups.set(key, { key, start: keyForDay(day), end: keyForDay(day), cents: 0, count: 0 });
      groups.get(key).end = keyForDay(day);
    }
    const seen = new Set();
    for (const receipt of receipts) {
      const day = parseDay(receipt.date);
      const amount = Number(receipt.amount);
      if (!storeId || String(receipt.storeId || "") !== String(storeId)
        || receipt.status !== "Completed" || !["sale", "seller-offer"].includes(receipt.source) || receipt.isDemo
        || day === null || day < first || day > last
        || receipt.amount === null || receipt.amount === "" || !Number.isFinite(amount) || amount < 0
        || !receipt.id || seen.has(receipt.id)) continue;
      seen.add(receipt.id);
      const bucket = groups.get(groupKey(day));
      bucket.cents += Math.round(amount * 100);
      bucket.count++;
    }
    const rows = [...groups.values()].map((group) => ({ ...group, amount: group.cents / 100,
      label: period === "monthly"
        ? new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${group.start}T00:00:00Z`))
        : period === "weekly" ? `${displayDate(group.start)} – ${displayDate(group.end)}` : displayDate(group.start)
    }));
    return { period, days, start: keyForDay(first), end: keyForDay(last), rows,
      total: rows.reduce((sum, row) => sum + row.cents, 0) / 100,
      count: rows.reduce((sum, row) => sum + row.count, 0) };
  }

  function mount({ container, receipts, storeId, settings = {}, now = new Date() }) {
    if (!container) return;
    container.innerHTML = `
      <div class="seller-panel-head revenue-heading">
        <div><p class="kicker">Sales trend</p><h3 id="receiptRevenueTitle">Receipt revenue</h3></div>
        <span class="pill green">Completed store sales</span>
      </div>
      <div class="revenue-controls">
        <label for="revenuePeriod">Group by<select id="revenuePeriod"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label for="revenueHistory">History range<select id="revenueHistory"><option value="28">Last 28 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option></select></label>
      </div>
      <div id="revenueSummary" class="revenue-summary" role="status"></div>
      <p id="revenueMethod" class="revenue-method"></p>
      <div class="revenue-chart" role="region" aria-label="Receipt revenue by period" tabindex="0">
        <table class="revenue-table"><caption>Completed revenue by period, newest first</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">Revenue (PHP)</th><th scope="col">Receipts</th></tr></thead>
          <tbody id="revenueRows"></tbody>
        </table>
      </div>`;
    const period = container.querySelector("#revenuePeriod");
    const history = container.querySelector("#revenueHistory");
    period.value = ["daily", "weekly", "monthly"].includes(settings.period) ? settings.period : "daily";
    history.value = [28, 90, 365].includes(Number(settings.days)) ? String(settings.days) : "28";
    function draw() {
      settings.period = period.value;
      settings.days = Number(history.value);
      const result = calculate({ receipts, storeId, period: period.value, days: history.value, now });
      const maximum = Math.max(1, ...result.rows.map((row) => row.amount));
      container.querySelector("#receiptRevenueTitle").textContent = `${period.options[period.selectedIndex].text} receipt revenue`;
      container.querySelector("#revenueSummary").textContent = `${money(result.total)} · ${result.count} completed receipt${result.count === 1 ? "" : "s"} · ${displayDate(result.start)} – ${displayDate(result.end)}`;
      container.querySelector("#revenueMethod").textContent = `Sale dates use Philippine time (Asia/Manila). ${result.period === "weekly" ? "Weeks run Monday–Sunday. " : ""}Only dates inside the selected range are counted; the first and current periods may be partial. Days with no sales count as zero.`;
      container.querySelector("#revenueRows").innerHTML = result.rows.slice().reverse().map((row) => `
        <tr><th scope="row">${row.label}</th><td><div class="revenue-value"><span class="revenue-track" aria-hidden="true"><i style="width:${row.amount / maximum * 100}%"></i></span><strong>${money(row.amount)}</strong></div></td><td>${row.count}</td></tr>`).join("");
      const empty = container.querySelector(".revenue-empty");
      if (empty) empty.remove();
      if (!result.count) {
        const note = document.createElement("p");
        note.className = "revenue-empty";
        note.textContent = "No completed receipts in this range. Record a sale to add revenue.";
        container.querySelector(".revenue-chart").before(note);
      }
      container.querySelector(".revenue-chart").scrollTop = 0;
    }
    period.addEventListener("change", draw);
    history.addEventListener("change", draw);
    draw();
  }

  window.GUNPLA_REVENUE = { calculate, mount };
})();
