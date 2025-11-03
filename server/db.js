import dotenv from 'dotenv'
dotenv.config()
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'

const { DATABASE_URL } = process.env

export const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
}) : null

if (pool) {
  pool.on('error', (err) => {
    console.error('Erro no pool do Postgres', err)
  })
}

export async function initSchema() {
  if (!pool) return
  // Tabela de check-ins da aplicação
  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins_app (
      id SERIAL PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `)

  // Tabela de perfil público da aplicação (apenas uma linha)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profile_app (
      id INTEGER PRIMARY KEY DEFAULT 1,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `)

  // Migra automaticamente o perfil do filesystem se existir e se o DB estiver vazio
  try {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM profile_app')
    const count = rows?.[0]?.c ?? 0
    if (count === 0) {
      const dataDir = path.join(process.cwd(), 'data')
      const profilePath = path.join(dataDir, 'profile.json')
      let initial = { photo: null, email: '', whatsapp: '' }
      if (fs.existsSync(profilePath)) {
        try {
          const raw = fs.readFileSync(profilePath, 'utf-8')
          const json = JSON.parse(raw)
          initial = {
            photo: json.photo || null,
            email: json.email || '',
            whatsapp: json.whatsapp || ''
          }
        } catch {}
      }
      await pool.query(
        'INSERT INTO profile_app (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()',
        [JSON.stringify(initial)]
      )
    }
  } catch (e) {
    console.warn('Falha ao migrar perfil para Postgres (ignorado)', e)
  }
}

export async function getAllCheckins() {
  const { rows } = await pool.query('SELECT payload FROM checkins_app ORDER BY created_at DESC, id DESC')
  return rows.map(r => r.payload)
}

export async function insertCheckin(obj) {
  // Garante que o payload seja enviado como JSONB
  await pool.query('INSERT INTO checkins_app (payload) VALUES ($1::jsonb)', [JSON.stringify(obj)])
}

export async function clearCheckins() {
  await pool.query('DELETE FROM checkins_app')
}

// Perfil em Postgres
export async function getProfileDb() {
  const { rows } = await pool.query('SELECT payload FROM profile_app WHERE id = 1')
  const p = rows?.[0]?.payload || { photo: null, email: '', whatsapp: '' }
  return { photo: p.photo || null, email: p.email || '', whatsapp: p.whatsapp || '' }
}

export async function writeProfileDb(patch) {
  const current = await getProfileDb()
  const next = {
    photo: patch && 'photo' in patch ? (patch.photo || null) : current.photo,
    email: patch && 'email' in patch ? (patch.email || '') : current.email,
    whatsapp: patch && 'whatsapp' in patch ? (patch.whatsapp || '') : current.whatsapp,
  }
  await pool.query(
    'INSERT INTO profile_app (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()',
    [JSON.stringify(next)]
  )
  return next
}