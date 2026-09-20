const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProduct, validateImage } = require('../utils/productValidation');

const kit = { name: 'HG Aerial', grade: 'HG', skill: 'Beginner', price: 980.50, stock: 8, storeId: 'seller-1' };

test('new products receive a SKU, placeholder photo, and stock-derived availability', () => {
  const product = validateProduct(kit);
  assert.match(product.id, /^GH-/);
  assert.equal(product.image, 'images/product-placeholder.svg');
  assert.equal(product.status, 'Available');
});

test('partial edits keep unchanged details and derive availability', () => {
  const original = validateProduct(kit);
  const updated = validateProduct({ stock: 2 }, original);
  assert.equal(updated.name, original.name);
  assert.equal(updated.price, original.price);
  assert.equal(updated.image, original.image);
  assert.equal(updated.status, 'Low Stock');
  assert.equal(validateProduct({ stock: 0 }, original).status, 'Out of Stock');
  assert.equal(validateProduct({ stock: 0, status: 'Pre-order' }, original).status, 'Pre-order');
  assert.equal(validateProduct({ stock: 0, status: 'Restock Soon' }, original).status, 'Restock Soon');
  assert.equal(validateProduct({ stock: 6, status: '' }, original).status, 'Available');
});

test('invalid quantities, prices, fields, and enum values are rejected', () => {
  for (const patch of [{ stock: -1 }, { stock: 1.5 }, { stock: '' }, { stock: null }, { price: -1 },
    { price: Infinity }, { price: 1.234 }, { price: '20' }, { price: null }, { grade: 'fake' },
    { skill: 'fake' }, { status: 'fake' }, { name: ' ' }, { name: '<'.repeat(161) },
    { id: 'bad sku' }, { role: 'admin' }, { storeId: { $ne: null } }]) {
    assert.throws(() => validateProduct({ ...kit, ...patch }), { status: 400 });
  }
});

test('photo validation accepts raster files and refuses executable or oversized content', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=';
  assert.equal(validateImage(png), png);
  assert.equal(validateImage('https://example.com/kit.jpg'), 'https://example.com/kit.jpg');
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=',
    'https://user:password@example.com/photo.jpg', 'file:///tmp/photo.png', 'images/../../file.png',
    `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`]) {
    assert.throws(() => validateImage(value), { status: 400 });
  }
});
