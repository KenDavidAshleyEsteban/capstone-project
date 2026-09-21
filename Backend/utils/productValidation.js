const { randomUUID } = require('node:crypto');

const GRADES = ['EG', 'HG', 'RG', 'MG', 'PG', 'SD', 'RE/100', 'Other'];
const SKILLS = ['Beginner', 'Intermediate', 'Advanced'];
const STATUSES = ['Available', 'Low Stock', 'Out of Stock', 'Pre-order', 'Restock Soon'];
const PLACEHOLDER = 'images/product-placeholder.svg';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

class InputError extends Error {
  constructor(message, field) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

function validateImage(value) {
  if (typeof value !== 'string') throw new InputError('Choose a product photo.', 'image');
  if (value === PLACEHOLDER || /^\.\.\/images\/[\w.-]+\.(png|jpe?g|webp|gif)$/i.test(value)) return value;
  if (value.startsWith('data:')) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new InputError('Upload a JPG, PNG, or WebP photo.', 'image');
    if (match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
      throw new InputError('Choose a photo smaller than 2 MB.', 'image');
    }
    const bytes = Buffer.from(match[2], 'base64');
    const valid = (match[1] === 'png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
      || (match[1] === 'jpeg' && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')))
      || (match[1] === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
    if (!valid || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) {
      throw new InputError('The photo is invalid. Choose a JPG, PNG, or WebP file under 2 MB.', 'image');
    }
    return value;
  }
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 2048) throw new Error();
    return url.href;
  } catch {
    throw new InputError('Enter a valid http or https photo URL.', 'image');
  }
}

function inventoryStatus(stock, status) {
  if (['Pre-order', 'Restock Soon'].includes(status)) return status;
  return stock === 0 ? 'Out of Stock' : stock <= 5 ? 'Low Stock' : 'Available';
}

function validateProduct(body, existing = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Enter product details.');
  const fields = ['id', 'name', 'grade', 'skill', 'price', 'stock', 'status', 'image', 'description', 'storeId'];
  if (Object.keys(body).some((key) => !fields.includes(key))) throw new InputError('The product contains unsupported fields.');
  const data = {};
  for (const field of fields) {
    if (Object.hasOwn(body, field)) data[field] = body[field];
    else if (existing && existing[field] !== undefined) data[field] = existing[field];
  }
  data.id ??= `GH-${randomUUID().slice(0, 8).toUpperCase()}`;
  data.description ??= '';
  data.image ??= PLACEHOLDER;
  for (const [field, max] of [['id', 64], ['name', 160], ['description', 3000], ['storeId', 100]]) {
    if (typeof data[field] !== 'string' || data[field].trim().length > max || (field !== 'description' && !data[field].trim())) {
      throw new InputError(`Enter a valid ${field === 'id' ? 'SKU' : field} (up to ${max} characters).`, field);
    }
    data[field] = data[field].trim();
  }
  if (!/^[A-Za-z0-9_-]+$/.test(data.id)) throw new InputError('Use letters, numbers, hyphens, or underscores for the SKU.', 'id');
  if (!GRADES.includes(data.grade)) throw new InputError('Choose a valid kit grade.', 'grade');
  if (!SKILLS.includes(data.skill)) throw new InputError('Choose a valid skill level.', 'skill');
  if (typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price < 0 || data.price > 10000000
      || Math.abs(data.price * 100 - Math.round(data.price * 100)) > 0.00001) {
    throw new InputError('Enter a price from 0 to 10,000,000 with at most two decimal places.', 'price');
  }
  if (!Number.isSafeInteger(data.stock) || data.stock < 0 || data.stock > 1000000) {
    throw new InputError('Enter a whole stock quantity from 0 to 1,000,000.', 'stock');
  }
  if (data.status && !STATUSES.includes(data.status)) throw new InputError('Choose a valid availability.', 'status');
  data.status = inventoryStatus(data.stock, data.status);
  data.image = validateImage(data.image);
  return data;
}

module.exports = { validateProduct, validateImage, inventoryStatus, InputError, GRADES, SKILLS, STATUSES };
