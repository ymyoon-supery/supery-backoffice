import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard: 96 bits

function hexKey(envVar: string): Buffer {
  const key = process.env[envVar]
  if (!key || key.length !== 64) {
    throw new Error(`${envVar} must be a 64-char hex string (32 bytes)`)
  }
  return Buffer.from(key, 'hex')
}

function ssnKey() { return hexKey('EXPENSE_SSN_ENCRYPTION_KEY') }
function cardKey() { return hexKey('EXPENSE_CARD_ENCRYPTION_KEY') }

function encrypt(plaintext: string, key: Buffer): { encrypted: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

function decrypt(encryptedB64: string, ivB64: string, key: Buffer): string {
  const combined = Buffer.from(encryptedB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const data = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export function encryptSSN(ssn: string) { return encrypt(ssn, ssnKey()) }

export function decryptSSN(encryptedB64: string, ivB64: string): string {
  return decrypt(encryptedB64, ivB64, ssnKey())
}

export function encryptCardNumber(card: string) { return encrypt(card, cardKey()) }

export function decryptCardNumber(encryptedB64: string, ivB64: string): string {
  const iv = Buffer.from(ivB64, 'base64')
  // Legacy records (before H5/H6 migration) used SSN key + 16-byte IV
  if (iv.length === 16) return decrypt(encryptedB64, ivB64, ssnKey())
  return decrypt(encryptedB64, ivB64, cardKey())
}
