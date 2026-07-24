/**
 * One-time re-encryption migration for H5/H6 fixes:
 *   SSN records  : same key (EXPENSE_SSN_ENCRYPTION_KEY),  IV 16 → 12 bytes
 *   Card records : key change (SSN key → EXPENSE_CARD_ENCRYPTION_KEY), IV 16 → 12 bytes
 *
 * Prerequisites:
 *   1. Add EXPENSE_CARD_ENCRYPTION_KEY to your environment:
 *      openssl rand -hex 32
 *   2. Copy .env.local values into your shell, then run:
 *      node scripts/reencrypt-sensitive-data.mjs
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const ALGORITHM = 'aes-256-gcm'

function getEnv(name) {
  const val = process.env[name]
  if (!val) throw new Error(`Missing env var: ${name}`)
  return val
}

function decryptLegacy(encryptedB64, ivB64, key) {
  const combined = Buffer.from(encryptedB64, 'base64')
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = combined.subarray(combined.length - 16)
  const data = combined.subarray(0, combined.length - 16)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function encryptNew(plaintext, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    encrypted: Buffer.concat([enc, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  }
}

async function main() {
  const ssnKey = Buffer.from(getEnv('EXPENSE_SSN_ENCRYPTION_KEY'), 'hex')
  const cardKeyBuf = Buffer.from(getEnv('EXPENSE_CARD_ENCRYPTION_KEY'), 'hex')

  const supabase = createClient(
    getEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  // ── SSN records: same key, IV 16 → 12 bytes ──────────────────────────────
  const { data: ssnRows, error: ssnFetchErr } = await supabase
    .from('expense_sensitive_data')
    .select('id, encrypted_ssn, iv')

  if (ssnFetchErr) throw new Error('SSN fetch failed: ' + ssnFetchErr.message)

  let ssnDone = 0, ssnSkipped = 0
  for (const row of ssnRows ?? []) {
    if (Buffer.from(row.iv, 'base64').length === 12) { ssnSkipped++; continue }
    const plain = decryptLegacy(row.encrypted_ssn, row.iv, ssnKey)
    const { encrypted, iv } = encryptNew(plain, ssnKey)
    const { error } = await supabase
      .from('expense_sensitive_data')
      .update({ encrypted_ssn: encrypted, iv })
      .eq('id', row.id)
    if (error) console.error(`SSN row ${row.id} failed:`, error.message)
    else ssnDone++
  }
  console.log(`SSN : migrated ${ssnDone}, already done ${ssnSkipped} (total ${(ssnRows ?? []).length})`)

  // ── Card records: SSN key → CARD key, IV 16 → 12 bytes ───────────────────
  const { data: cardRows, error: cardFetchErr } = await supabase
    .from('expense_card_sensitive_data')
    .select('id, encrypted_card_number, iv')

  if (cardFetchErr) throw new Error('Card fetch failed: ' + cardFetchErr.message)

  let cardDone = 0, cardSkipped = 0
  for (const row of cardRows ?? []) {
    if (Buffer.from(row.iv, 'base64').length === 12) { cardSkipped++; continue }
    const plain = decryptLegacy(row.encrypted_card_number, row.iv, ssnKey)
    const { encrypted, iv } = encryptNew(plain, cardKeyBuf)
    const { error } = await supabase
      .from('expense_card_sensitive_data')
      .update({ encrypted_card_number: encrypted, iv })
      .eq('id', row.id)
    if (error) console.error(`Card row ${row.id} failed:`, error.message)
    else cardDone++
  }
  console.log(`Card: migrated ${cardDone}, already done ${cardSkipped} (total ${(cardRows ?? []).length})`)
}

main().catch(e => { console.error(e); process.exit(1) })
