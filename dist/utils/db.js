import pg from 'pg';
import config from '../config/index.js';
const { Pool } = pg;
const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20, // Maximum number of connections in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});
export const query = (text, params) => {
    return pool.query(text, params);
};
export const getClient = () => {
    return pool.connect();
};
export default pool;
//# sourceMappingURL=db.js.map