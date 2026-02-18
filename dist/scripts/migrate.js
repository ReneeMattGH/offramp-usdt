import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const { Client } = pg;
const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
async function runMigrations() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing');
        process.exit(1);
    }
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);
        const { rows: appliedRows } = await client.query('SELECT name FROM _migrations');
        const appliedMigrations = new Set(appliedRows.map(r => r.name));
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
            process.exit(1);
        }
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort();
        for (const file of files) {
            if (appliedMigrations.has(file))
                continue;
            console.log(`Applying ${file}...`);
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
            }
            catch (err) {
                await client.query('ROLLBACK');
                console.error(`Failed to apply ${file}:`, err.message);
                process.exit(1);
            }
        }
        console.log('✅ Migrations complete');
    }
    catch (err) {
        console.error('Migration error:', err.message);
    }
    finally {
        await client.end();
    }
}
runMigrations();
//# sourceMappingURL=migrate.js.map