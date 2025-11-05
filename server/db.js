import dotenv from 'dotenv'
dotenv.config()
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'

const { DATABASE_URL } = process.env
const USE_SQLITE = !DATABASE_URL && (process.env.USE_SQLITE === '1' || process.env.USE_SQLITE === 'true' || !!process.env.SQLITE_PATH)
const SQLITE_FILE = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'app.sqlite')

// Postgres pool (quando DATABASE_URL está definido)
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

let SQL = null
export let sqlite = null

async function ensureSqlite() {
  if (!USE_SQLITE) return null
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file) })
  }
  if (!sqlite) {
    try {
      const exists = fs.existsSync(SQLITE_FILE)
      if (exists) {
        const data = fs.readFileSync(SQLITE_FILE)
        sqlite = new SQL.Database(data)
      } else {
        // Garante diretório
        const dir = path.dirname(SQLITE_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        sqlite = new SQL.Database()
      }
    } catch {
      sqlite = new SQL.Database()
    }
  }
  return sqlite
}

function saveSqlite() {
  if (!sqlite) return
  const data = sqlite.export()
  fs.writeFileSync(SQLITE_FILE, Buffer.from(data))
}

export function hasDb() {
  return Boolean(pool) || Boolean(USE_SQLITE)
}

export async function initSchema() {
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkins_app (
        id SERIAL PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profile_app (
        id INTEGER PRIMARY KEY DEFAULT 1,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `)
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
    return
  }

  if (USE_SQLITE) {
    await ensureSqlite()
    // Schema em SQLite
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS checkins_app (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS profile_app (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Migração inicial de profile.json
    try {
      const stmt = sqlite.prepare('SELECT COUNT(*) AS c FROM profile_app')
      let count = 0
      if (stmt.step()) {
        const row = stmt.getAsObject()
        count = Number(row.c || 0)
      }
      stmt.free()
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
        const ins = sqlite.prepare('INSERT INTO profile_app (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
        ins.run([JSON.stringify(initial)])
        ins.free()
        saveSqlite()
      }
    } catch (e) {
      console.warn('Falha ao migrar perfil para SQLite (ignorado)', e)
    }
  }
}

export async function getAllCheckins() {
  if (USE_SQLITE) {
    await ensureSqlite()
    const res = []
    const stmt = sqlite.prepare('SELECT payload FROM checkins_app ORDER BY created_at DESC, id DESC')
    while (stmt.step()) {
      const row = stmt.getAsObject()
      try { res.push(JSON.parse(row.payload)) } catch { res.push({}) }
    }
    stmt.free()
    return res
  }
  const { rows } = await pool.query('SELECT payload FROM checkins_app ORDER BY created_at DESC, id DESC')
  return rows.map(r => r.payload)
}

export async function insertCheckin(obj) {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('INSERT INTO checkins_app (payload) VALUES (?)')
    stmt.run([JSON.stringify(obj)])
    stmt.free()
    saveSqlite()
    return
  }
  await pool.query('INSERT INTO checkins_app (payload) VALUES ($1::jsonb)', [JSON.stringify(obj)])
}

export async function clearCheckins() {
  if (USE_SQLITE) {
    await ensureSqlite()
    sqlite.run('DELETE FROM checkins_app')
    saveSqlite()
    return
  }
  await pool.query('DELETE FROM checkins_app')
}

export async function getProfileDb() {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('SELECT payload FROM profile_app WHERE id = 1')
    let p = { photo: null, email: '', whatsapp: '' }
    if (stmt.step()) {
      const row = stmt.getAsObject()
      try { p = JSON.parse(row.payload) || p } catch {}
    }
    stmt.free()
    return { photo: p.photo || null, email: p.email || '', whatsapp: p.whatsapp || '' }
  }
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
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('INSERT INTO profile_app (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP')
    stmt.run([JSON.stringify(next)])
    stmt.free()
    saveSqlite()
    return next
  }
  await pool.query(
    'INSERT INTO profile_app (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()',
    [JSON.stringify(next)]
  )
  return next
}

export async function getHealthCounts() {
  if (USE_SQLITE) {
    await ensureSqlite()
    try {
      let c1 = 0, c2 = 0
      let stmt = sqlite.prepare('SELECT COUNT(*) AS c FROM checkins_app')
      if (stmt.step()) c1 = Number(stmt.getAsObject().c || 0)
      stmt.free()
      stmt = sqlite.prepare('SELECT COUNT(*) AS c FROM profile_app')
      if (stmt.step()) c2 = Number(stmt.getAsObject().c || 0)
      stmt.free()
      return { enabled: true, checkins_count: c1, profile_rows: c2 }
    } catch (e) {
      return { enabled: true, error: 'query_failed' }
    }
  }
  if (!pool) return { enabled: false }
  try {
    const { rows: r1 } = await pool.query('SELECT COUNT(*)::int AS c FROM checkins_app')
    const { rows: r2 } = await pool.query('SELECT COUNT(*)::int AS c FROM profile_app')
    return { enabled: true, checkins_count: r1?.[0]?.c ?? 0, profile_rows: r2?.[0]?.c ?? 0 }
  } catch (e) {
    return { enabled: true, error: 'query_failed' }
  }
}