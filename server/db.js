import dotenv from 'dotenv'
dotenv.config()
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import initSqlJs from 'sql.js'

const { DATABASE_URL } = process.env
const USE_SQLITE = !DATABASE_URL && (process.env.USE_SQLITE === '1' || process.env.USE_SQLITE === 'true' || !!process.env.SQLITE_PATH)
const SQLITE_FILE = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'app.sqlite')
const PG_SSL = process.env.PG_SSL === '1' || process.env.PG_SSL === 'true'

// Postgres pool (quando DATABASE_URL está definido)
export const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  // SSL opcional: útil para Neon quando a URL não tem ?sslmode=require
  ...(PG_SSL ? { ssl: { rejectUnauthorized: false } } : {})
}) : null

if (pool) {
  pool.on('error', (err) => {
    console.error('Erro no pool do Postgres', err)
  })
}

let SQL = null
export let sqlite = null

// Marca se o Postgres está funcional (após initSchema)
let POSTGRES_READY = false

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
  return Boolean(POSTGRES_READY) || Boolean(USE_SQLITE)
}

export async function initSchema() {
  if (pool) {
    try {
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
      POSTGRES_READY = true
      return
    } catch (e) {
      console.error('Falha ao inicializar schema', e)
      POSTGRES_READY = false
      // Prossegue para SQLite caso habilitado; caso contrário, o backend usa filesystem
    }
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
        id INTEGER PRIMARY KEY DEFAULT 1,
        payload TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    // Migração automática do profile.json
    try {
      const stmt = sqlite.prepare('SELECT COUNT(*) AS c FROM profile_app WHERE id = 1')
      const res = stmt.getAsObject()
      stmt.free()
      const count = Number(res.c || 0)
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
        const stmt2 = sqlite.prepare('INSERT OR REPLACE INTO profile_app (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
        stmt2.run([JSON.stringify(initial)])
        stmt2.free()
        saveSqlite()
      }
    } catch (e) {
      console.warn('Falha ao migrar perfil para SQLite (ignorado)', e)
    }
    return
  }
}

export async function getAllCheckins() {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('SELECT payload, created_at FROM checkins_app ORDER BY id DESC')
    const rows = []
    while (stmt.step()) {
      const row = stmt.getAsObject()
      const payload = JSON.parse(row.payload)
      rows.push({ ...payload, createdAt: new Date(row.created_at).toISOString() })
    }
    stmt.free()
    return rows
  }
  const { rows } = await pool.query('SELECT payload, created_at FROM checkins_app ORDER BY id DESC')
  return rows.map(r => ({ ...r.payload, createdAt: new Date(r.created_at).toISOString() }))
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
    const stmt = sqlite.prepare('DELETE FROM checkins_app')
    stmt.run([])
    stmt.free()
    saveSqlite()
    return
  }
  await pool.query('DELETE FROM checkins_app')
}

export async function getProfileDb() {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('SELECT payload FROM profile_app WHERE id = 1')
    let payload = { photo: null, email: '', whatsapp: '' }
    if (stmt.step()) {
      const row = stmt.getAsObject()
      payload = JSON.parse(row.payload)
    }
    stmt.free()
    return payload
  }
  const { rows } = await pool.query('SELECT payload FROM profile_app WHERE id = 1')
  return rows?.[0]?.payload || { photo: null, email: '', whatsapp: '' }
}

export async function writeProfileDb(patch) {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('INSERT OR REPLACE INTO profile_app (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)')
    stmt.run([JSON.stringify(patch)])
    stmt.free()
    saveSqlite()
    return
  }
  await pool.query('INSERT INTO profile_app (id, payload, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()', [JSON.stringify(patch)])
}

export async function getHealthCounts() {
  if (USE_SQLITE) {
    await ensureSqlite()
    const stmt = sqlite.prepare('SELECT COUNT(*) AS c FROM checkins_app')
    const res = stmt.getAsObject()
    stmt.free()
    const stmt2 = sqlite.prepare('SELECT COUNT(*) AS c FROM profile_app')
    const res2 = stmt2.getAsObject()
    stmt2.free()
    return { enabled: true, checkins_count: Number(res.c || 0), profile_rows: Number(res2.c || 0), kind: 'sqlite', file: SQLITE_FILE }
  }
  try {
    const r1 = await pool.query('SELECT COUNT(*)::int AS c FROM checkins_app')
    const r2 = await pool.query('SELECT COUNT(*)::int AS c FROM profile_app')
    return { enabled: true, checkins_count: r1.rows?.[0]?.c ?? 0, profile_rows: r2.rows?.[0]?.c ?? 0, kind: 'postgres' }
  } catch (e) {
    return { enabled: false }
  }
}