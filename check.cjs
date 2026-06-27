require('dotenv').config();
const { createClient } = require('@libsql/client');

async function run() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  
  try {
    const res = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
    console.log("Tables:", res.rows);
    
    for (const table of res.rows) {
      if (!table.name.startsWith('_')) {
        const info = await db.execute(`PRAGMA table_info(${table.name})`);
        console.log(`Schema for ${table.name}:`, info.rows);
      }
    }
  } catch(e) {
    console.error(e);
  }
}
run();
