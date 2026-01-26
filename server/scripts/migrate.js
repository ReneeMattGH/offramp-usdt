
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

async function runMigrations() {
    console.log('--- Database Migration Tool ---');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing in server/.env');
        console.log('Please add your Supabase connection string to server/.env:');
        console.log('DATABASE_URL="postgres://postgres:[YOUR-PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres"');
        console.log('You can find this in Supabase Dashboard -> Project Settings -> Database -> Connection string');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to Database');

        // Create migrations table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Get applied migrations
        const { rows: appliedRows } = await client.query('SELECT name FROM _migrations');
        const appliedMigrations = new Set(appliedRows.map(r => r.name));

        // Read migration files
        const files = fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort(); // Ensure chronological order

        for (const file of files) {
            if (appliedMigrations.has(file)) {
                console.log(`⏩ Skipping ${file} (Already applied)`);
                continue;
            }

            console.log(`▶️  Applying ${file}...`);
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                await client.query('COMMIT');
                console.log(`✅ Applied ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`❌ Failed to apply ${file}:`, err.message);
                process.exit(1);
            }
        }

        console.log('🎉 All migrations applied successfully!');

    } catch (err) {
        console.error('❌ Migration Error:', err);
    } finally {
        await client.end();
    }
}

runMigrations();
