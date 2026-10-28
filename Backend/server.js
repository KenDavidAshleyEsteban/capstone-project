const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

try {
  require('./config/environment').validateEnvironment();
} catch (error) {
  console.error(`Startup configuration error: ${error.message}`);
  console.error('Copy Backend/.env.example to Backend/.env and set the required values before starting the server.');
  process.exit(1);
}

const app = require('./app');
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    await Promise.all(['User', 'Product', 'Sale', 'BuildVideo', 'Reservation', 'BuyerReceipt', 'LoyaltyWallet', 'PointClaim', 'RewardRedemption']
      .map((model) => require(`./models/${model}`).init()));
    await require('./utils/initializeEvents')();
    console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(async (err) => {
    console.error('Database connection failure:', err.name);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
