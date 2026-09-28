/**
 * Database initialisation script — reads schema.sql and applies it.
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('./index');

try {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const db = getDb();
  db.exec(schema);
  console.log('✓ Database initialised at', require('../config').dbPath);
} catch (err) {
  console.error('✗ Database init failed:', err.message);
  process.exit(1);
} finally {
  closeDb();
}
