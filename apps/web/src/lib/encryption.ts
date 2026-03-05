/**
 * encryption.ts - AES-256-GCM encryption for API keys
 * 
 * Uses Node.js crypto module for secure encryption
 * Keys are stored encrypted in the database
 */

import crypto from 'crypto';

// Encryption key from environment variable (must be 32 bytes for AES-256)
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;

    if (!key) {
        throw new Error(
            'ENCRYPTION_KEY environment variable is required. ' +
            'Generate with: openssl rand -hex 32'
        );
    }

    // If provided as 64-char hex string, convert to 32 bytes
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }

    // Otherwise, hash it to get 32 bytes
    return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns base64 encoded string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt()
 */
export function decrypt(encryptedData: string): string {
    const key = getEncryptionKey();

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Mask a key for display (show first/last 4 chars)
 */
export function maskKey(key: string): string {
    if (key.length <= 8) {
        return '****';
    }
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
