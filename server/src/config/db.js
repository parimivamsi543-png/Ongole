const dns = require('dns');
const mongoose = require('mongoose');

dns.setDefaultResultOrder('ipv4first');

const connectDB = async (maxRetries = 5) => {
  const connStr = process.env.MONGODB_URI;
  if (!connStr) {
    console.error('[LedgerLine] FATAL: MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await mongoose.connect(connStr, {
        maxPoolSize: 50,
        minPoolSize: 5,
        family: 4,
        serverSelectionTimeoutMS: 20000,
        connectTimeoutMS: 20000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        maxIdleTimeMS: 60000,
        retryReads: true,
        retryWrites: true,
      });

      console.log(`[LedgerLine] Connected to MongoDB Atlas: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      console.error(`[LedgerLine] MongoDB Connection Attempt ${attempt}/${maxRetries} Error: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        throw error;
      }
    }
  }
};

module.exports = connectDB;
