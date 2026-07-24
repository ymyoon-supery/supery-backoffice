import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.EXPENSE_SSN_ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('EXPENSE_SSN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(key, 'hex')
}

export function encryptSSN(ssn: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(ssn, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decryptSSN(encryptedB64: string, ivB64: string): string {
  const combined = Buffer.from(encryptedB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const data = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

export const encryptCardNumber = encryptSSN
export const decryptCardNumber = decryptSSN
