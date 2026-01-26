
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Found' : 'Not Found');
if (process.env.DATABASE_URL) {
    console.log('Connection string starts with:', process.env.DATABASE_URL.substring(0, 10));
}
