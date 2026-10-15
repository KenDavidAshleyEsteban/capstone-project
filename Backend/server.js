const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const PORT = process.env.PORT || 5000;
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  console.error('Create a .env file in the directory where you start the server, or set these values before running Node.');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    await Promise.all([require('./models/Sale').init(), require('./models/BuildVideo').init()]);
    await require('./utils/initializeEvents')();
    console.log("Connected to MongoDB database: gunpla_db");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => console.error("Database connection failure:", err));
