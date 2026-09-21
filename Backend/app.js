const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '3mb' }));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api', (req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use(express.static(path.join(__dirname, '../Frontend')));

app.use((error, req, res, next) => {
  if (error.code === 11000) return res.status(409).json({ message: 'This SKU already exists. Choose a different SKU.', field: 'id' });
  if (error.name === 'VersionError') return res.status(409).json({ message: 'This product changed while saving. Refresh the catalog and try again.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'The photo is too large. Choose a file under 2 MB.', field: 'image' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON request.' });
  if (error.status === 400) return res.status(400).json({ message: error.message, field: error.field });
  if (error.name === 'ValidationError') return res.status(400).json({ message: 'Check your product details and try again.' });
  console.error('Request failed:', error.message);
  res.status(500).json({ message: 'Unable to access the database. Please try again.' });
});

module.exports = app;
