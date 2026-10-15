const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {}, Intl, Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../Frontend/js/seller-revenue.js'), 'utf8'), context);
const { calculate } = context.window.GUNPLA_REVENUE;
const now = new Date('2026-10-15T08:00:00Z');
const sale = (id, date, amount, extra = {}) => ({ id, date, amount, storeId: 'owner-1', status: 'Completed', source: 'sale', ...extra });
const result = (options = {}) => calculate({ storeId: 'owner-1', now, ...options });

test('daily revenue includes every calendar day and adds exact cent values', () => {
  const report = result({ receipts: [sale('a', '2026-10-15', 0.1), sale('b', '2026-10-15', 0.2), sale('c', '2026-09-18', 100)] });
  assert.equal(report.rows.length, 28);
  assert.equal(report.start, '2026-09-18');
  assert.equal(report.end, '2026-10-15');
  assert.equal(report.total, 100.3);
  assert.equal(report.count, 3);
  assert.equal(report.rows.at(-1).amount, 0.3);
  assert.equal(report.rows.filter((row) => row.amount === 0).length, 26);
});

test('weekly buckets use Monday boundaries and clip the first and current week to the range', () => {
  const report = result({ period: 'weekly', receipts: [sale('a', '2026-10-11', 10), sale('b', '2026-10-12', 20), sale('c', '2026-10-15', 30)] });
  assert.equal(report.rows[0].key, '2026-09-14');
  assert.equal(report.rows[0].start, '2026-09-18');
  assert.equal(report.rows[0].end, '2026-09-20');
  assert.equal(report.rows.at(-2).amount, 10);
  assert.equal(report.rows.at(-1).key, '2026-10-12');
  assert.equal(report.rows.at(-1).end, '2026-10-15');
  assert.equal(report.rows.at(-1).amount, 50);
});

test('monthly revenue uses year-and-month keys across a year boundary', () => {
  const report = result({ period: 'monthly', days: 90, now: new Date('2027-01-03T04:00:00Z'), receipts: [sale('a', '2026-12-31', 12), sale('b', '2027-01-01', 23)] });
  assert.equal(report.rows.at(-2).key, '2026-12');
  assert.equal(report.rows.at(-2).amount, 12);
  assert.equal(report.rows.at(-1).key, '2027-01');
  assert.equal(report.rows.at(-1).amount, 23);
  assert.match(report.rows.at(-1).label, /2027/);
  assert.equal(report.total, 35);
});

test('history ranges include their first day and exclude earlier receipts', () => {
  for (const days of [28, 90, 365]) {
    const first = result({ days }).start;
    const before = new Date(`${first}T00:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    const report = result({ days, receipts: [sale('in', first, 50), sale('out', before.toISOString().slice(0, 10), 500)] });
    assert.equal(report.total, 50);
    assert.equal(report.rows.length, days);
  }
});

test('uses the Philippine calendar date when UTC is still the previous day', () => {
  const report = result({ now: new Date('2026-10-14T16:01:00Z'), receipts: [sale('a', '2026-10-15', 50), sale('future', '2026-10-16', 500)] });
  assert.equal(report.end, '2026-10-15');
  assert.equal(report.total, 50);
});

test('excludes other stores, duplicate receipts, demos, reservations, cancelled and malformed records', () => {
  const receipt = sale('real', '2026-10-15', 50);
  const receipts = [receipt, receipt,
    sale('other', '2026-10-15', 500, { storeId: 'other-owner' }),
    sale('demo', '2026-10-15', 500, { isDemo: true }),
    sale('reserved', '2026-10-15', 500, { source: 'reservation' }),
    sale('cancelled', '2026-10-15', 500, { status: 'Cancelled' }),
    sale('unconfirmed', '2026-10-15', 500, { status: undefined }),
    sale('invalid', '2026-02-30', 500), sale('future', '2026-10-16', 500),
    sale('bad-amount', '2026-10-15', NaN), sale('negative', '2026-10-15', -1),
    sale('empty', '2026-10-15', ''), sale('null', '2026-10-15', null),
    sale('offer', '2026-10-15', 25, { source: 'seller-offer' })];
  const report = result({ receipts });
  assert.equal(report.count, 2);
  assert.equal(report.total, 75);
  assert.equal(calculate({ now, receipts }).count, 0);
});

test('leap day is retained as a real date in monthly totals', () => {
  const report = result({ now: new Date('2028-03-01T04:00:00Z'), period: 'monthly', receipts: [sale('leap', '2028-02-29', 10)] });
  assert.equal(report.rows[0].key, '2028-02');
  assert.equal(report.rows[0].amount, 10);
  assert.equal(report.rows.at(-1).amount, 0);
});
