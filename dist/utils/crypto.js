import crypto from 'crypto';
import config from '../config/index.js';
const ENCRYPTION_KEY = config.encryptionKey;
const IV_LENGTH = 16;
export function encrypt(text) {
    if (!text)
        return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
export function decrypt(text) {
    if (!text)
        return null;
    try {
        const textParts = text.split(':');
        const ivStr = textParts.shift();
        if (!ivStr)
            return null;
        const iv = Buffer.from(ivStr, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    catch (e) {
        console.error('[CRYPTO] Decryption failed:', e);
        return null;
    }
}
//# sourceMappingURL=crypto.js.map