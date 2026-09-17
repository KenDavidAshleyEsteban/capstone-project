const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

async function createAdmin() {
  const { MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_USERNAME } = process.env;
  if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12
      || ADMIN_PASSWORD === 'replace-with-a-strong-password') {
    throw new Error('Set MONGODB_URI, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters in Backend/.env.');
  }
  await mongoose.connect(MONGODB_URI);
  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log('An admin account already exists. Its credentials were not changed.');
    return;
  }
  await User.create({
    username: ADMIN_USERNAME || 'StoreAdmin',
    email: ADMIN_EMAIL,
    password: await bcrypt.hash(ADMIN_PASSWORD, 12),
    role: 'admin'
  });
  console.log('Admin account created. Sign in from /html/login.html.');
}

createAdmin().catch(() => {
  console.error('Admin setup failed. Check the required environment values, database access, and whether the email is already registered.');
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
