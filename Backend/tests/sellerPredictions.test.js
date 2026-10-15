const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, Intl, Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Frontend/js/seller-predictions.js'), 'utf8'), context);
const { calculate, demoReceipts, dateKey } = context.window.GUNPLA_PREDICTIONS;
const now = new Date('2026-10-15T08:00:00Z');
const product = { _id: 'mongo-kit-1', id: 'KIT-1', name: 'HG First Kit', price: 100, stock: 3 };
const sale = (date, quantity, extra = {}) => ({
  id: `sale-${date}`, source: 'sale', storeId: 'owner-1', date,
  amount: quantity * product.price, lineItems: [{ productId: product.id, quantity }], ...extra
});
const receipts = [sale('2026-10-01', 1), sale('2026-10-08', 3.5, { lineItems: [] }),
  sale('2026-10-09', 3), sale('2026-10-12', 2), sale('2026-10-15', 2)];
const forecast = (extra = {}) => calculate({ products: [product], receipts, storeId: 'owner-1', now, ...extra });

test('predicts sales, exact kit demand, days of stock, and reorder quantities', () => {
  const result = forecast();
  assert.equal(result.ready, true);
  assert.equal(result.predictedRevenue, 700);
  assert.equal(result.predictedUnits, 7);
  assert.equal(result.rows[0].daysCover, 3);
  assert.equal(result.rows[0].expectedUnits, 7);
  assert.equal(result.rows[0].reorder, 4);
  assert.equal(result.atRisk, 1);
  assert.equal(result.trend, 100);
});

test('period controls scale the same daily baseline for 7, 14, and 30 days', () => {
  for (const horizon of [7, 14, 30]) {
    const result = forecast({ horizon });
    assert.equal(result.predictedRevenue, 100 * horizon);
    assert.equal(result.predictedUnits, horizon);
    assert.equal(result.rows[0].reorder, horizon - 3);
  }
  assert.equal(forecast({ horizon: '14' }).horizon, 14);
  assert.equal(forecast({ horizon: 999 }).horizon, 7);
});

test('includes zero-sales days in the seven-day average', () => {
  const result = forecast({ receipts: [sale('2026-10-09', 1), sale('2026-10-12', 1), sale('2026-10-15', 5)] });
  assert.equal(result.observedDays, 7);
  assert.equal(result.salesDays, 3);
  assert.equal(result.series.length, 7);
  assert.equal(result.series.filter((day) => day.revenue === 0).length, 4);
  assert.equal(result.dailyRevenue, 100);
});

test('excludes other stores, reservations, simulations, cancellations, invalid and out-of-window dates', () => {
  const ignored = [
    sale('2026-10-13', 100, { storeId: 'owner-2' }),
    sale('2026-10-13', 100, { source: 'reservation' }),
    sale('2026-10-13', 100, { isDemo: true }),
    sale('2026-10-13', 100, { status: 'Cancelled' }),
    sale('2026-10-13', 100, { status: 'Refunded' }),
    sale('2026-10-13', 100, { status: 'Unpaid' }),
    sale('2026-10-16', 100), sale('2026-09-17', 100),
    sale('2026-02-30', 100), sale('invalid date', 100),
    sale('2026-10-13', 100, { amount: -1 }),
    sale('2026-10-13', 100, { amount: 'invalid' })
  ];
  const result = forecast({ receipts: [...receipts, ...ignored] });
  assert.equal(result.receiptCount, receipts.length);
  assert.equal(result.predictedRevenue, 700);
  assert.equal(result.predictedUnits, 7);
  assert.equal(forecast({ storeId: undefined }).receiptCount, 0);
});

test('duplicate receipt IDs are counted once', () => {
  assert.equal(forecast({ receipts: [...receipts, receipts[4]] }).predictedRevenue, 700);
});

test('empty and sparse history does not pretend to support a forecast', () => {
  assert.equal(forecast({ receipts: [] }).ready, false);
  assert.equal(forecast({ receipts: [sale('2026-10-08', 20)] }).ready, false);
  assert.equal(forecast({ receipts: [sale('2026-10-13', 1), sale('2026-10-14', 1), sale('2026-10-15', 1)] }).ready, false);
});

test('matches item IDs rather than kit names or grades and ignores invalid quantities', () => {
  const result = forecast({ products: [product, { ...product, id: 'KIT-2', _id: 'mongo-kit-2', name: 'HG First Kit Deluxe' }],
    receipts: [...receipts, sale('2026-10-13', 100, { amount: 0, lineItems: [
      { productId: 'HG', quantity: 50 }, { productId: 'KIT-1', quantity: -3 },
      { productId: 'KIT-1', quantity: '20' }, { productId: 'KIT-1', quantity: 0.5 }
    ] })] });
  assert.equal(result.rows.find((row) => row.id === 'KIT-1').units, 7);
  assert.equal(result.rows.find((row) => row.id === 'KIT-2').hasItemHistory, false);
});

test('missing item details supports revenue but leaves stock predictions unavailable', () => {
  const result = forecast({ receipts: receipts.map((receipt) => ({ ...receipt, lineItems: [] })) });
  assert.equal(result.ready, true);
  assert.equal(result.predictedRevenue, 700);
  assert.equal(result.hasItemHistory, false);
  assert.equal(result.rows[0].daysCover, null);
});

test('zero recent sales never produces infinite trends or stock coverage', () => {
  const result = forecast({ receipts: [sale('2026-10-01', 1), sale('2026-10-03', 1), sale('2026-10-05', 1)] });
  assert.equal(result.ready, true);
  assert.equal(result.predictedRevenue, 0);
  assert.equal(result.predictedUnits, 0);
  assert.equal(result.rows[0].daysCover, null);
  assert.equal(result.rows[0].atRisk, false);
  assert.equal(result.rows[0].reorder, 0);
});

test('uses Manila calendar days at the UTC date boundary', () => {
  const late = new Date('2026-10-14T23:30:00Z');
  assert.equal(dateKey(late), '2026-10-15');
  const result = forecast({ now: late, receipts: [sale('2026-10-01', 1), sale('2026-10-09', 1), sale('2026-10-14T23:30:00Z', 1)] });
  assert.equal(result.today, '2026-10-15');
  assert.equal(result.series[6].revenue, 100);
});

test('demo preview is isolated from recorded-sale forecasts and does not mutate source records', () => {
  const demo = demoReceipts([product], 'owner-1', now);
  assert.equal(demo.length, 28);
  assert.equal(forecast({ receipts: demo }).receiptCount, 0);
  assert.equal(forecast({ receipts: demo, includeDemo: true }).ready, true);
  assert.equal(demo.every((receipt) => receipt.isDemo), true);
  assert.equal(product.stock, 3);
  assert.equal(demoReceipts([], 'owner-1', now).length, 0);
});
