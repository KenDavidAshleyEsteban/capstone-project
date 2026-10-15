const { createHash } = require('crypto');
const { InputError } = require('./productValidation');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function validateSale(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Enter sale details.');
  const allowed = ['requestId', 'type', 'productId', 'name', 'category', 'offerId', 'quantity', 'unitPrice', 'date', 'deductStock'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new InputError('Unsupported sale field.');
  if (typeof body.requestId !== 'string' || !/^[\w-]{16,100}$/.test(body.requestId)) throw new InputError('A valid sale request ID is required.');
  const type = body.type || 'product';
  if (!['product', 'offer'].includes(type)) throw new InputError('Choose a product or an offer.');
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 1000000) throw new InputError('Quantity must be a whole number from 1 to 1,000,000.');
  if (typeof body.unitPrice !== 'number' || !Number.isFinite(body.unitPrice) || body.unitPrice < 0 || body.unitPrice > 10000000) throw new InputError('Enter a valid unit price.');
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)
    || !Number.isFinite(Date.parse(`${body.date}T00:00:00Z`))
    || new Date(`${body.date}T00:00:00Z`).toISOString().slice(0, 10) !== body.date
    || body.date > today() || body.date < '2000-01-01') throw new InputError('Choose a valid sale date up to today.');
  if (typeof body.deductStock !== 'boolean') throw new InputError('Choose whether to deduct stock.');
  if (type === 'product' && (typeof body.productId !== 'string' || !body.productId || body.productId.length > 100)) throw new InputError('Choose a catalog product.');
  if (type === 'offer' && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 160
    || !['Tool', 'Supply', 'Service', 'Add-on'].includes(body.category) || body.deductStock)) throw new InputError('Enter a valid offer. Offer stock is managed separately.');
  const data = { requestId: body.requestId, type, productId: type === 'product' ? body.productId : `offer:${String(body.offerId || '').slice(0, 80)}`,
    name: type === 'offer' ? body.name.trim() : '', category: type === 'offer' ? body.category : 'Kit',
    quantity: body.quantity, unitPrice: Math.round(body.unitPrice * 100) / 100, date: body.date, deductStock: body.deductStock };
  data.fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return data;
}
module.exports = { validateSale, today };
