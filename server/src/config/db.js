const dns = require('dns');
const mongoose = require('mongoose');

dns.setDefaultResultOrder('ipv4first');

const resolveDbName = (connStr) => {
  try {
    // Parse mongodb:// or mongodb+srv:// URL to check if a database path is specified
    const normalized = connStr.replace(/^mongodb(\+srv)?:\/\//, 'http://');
    const url = new URL(normalized);
    const dbPath = url.pathname.replace(/^\/+/, '');
    return dbPath || 'ledgerline';
  } catch {
    return 'ledgerline';
  }
};

const connectDB = async (maxRetries = 5) => {
  const connStr = process.env.MONGODB_URI;
  if (!connStr) {
    console.error('[LedgerLine] FATAL: MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  const dbName = resolveDbName(connStr);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const conn = await mongoose.connect(connStr, {
        dbName,
        maxPoolSize: 25,
        minPoolSize: 2,
        family: 4,
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        socketTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,
        maxIdleTimeMS: 60000,
        retryReads: true,
        retryWrites: true,
      });

      console.log(`[LedgerLine] Connected to MongoDB Atlas (${conn.connection.name}): ${conn.connection.host}`);
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
