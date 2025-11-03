import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

const dataDir = path.join(process.cwd(), 'data')
const storePath = path.join(dataDir, 'checkins.json')
const profilePath = path.join(dataDir, 'profile.json')

let pool = null

async function ensureClient() {
  const url = process.env.DATABASE_URL || ''
  if (!url) return null
  if (!pool) {
    const ssl = !/localhost|127\.0\.0\.1/.test(url)
    pool = new Pool({ connectionString: url, ssl: ssl ? { rejectUnauthorized: false } : undefined, max: 5 })
    pool.on('error', (err) => {
      console.warn('pg pool error:', err?.message || err)
    })
  }
  return pool
}

export function isDbEnabled() {
  return Boolean(process.env.DATABASE_URL)
}

export async function initDb() {
  const c = await ensureClient()
  if (!c) return
  await c.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id BIGSERIAL PRIMARY KEY,
      nome_completo TEXT,
      semana_texto TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      data JSONB NOT NULL
    );
  `)
  await c.query(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY,
      photo TEXT,
      email TEXT,
      whatsapp TEXT
    );
  `)
}

export async function saveCheckin(obj) {
  // Always ensure createdAt
  const createdAt = obj.createdAt || new Date().toISOString()
  if (isDbEnabled()) {
    const c = await ensureClient()
    await c.query(
      `INSERT INTO checkins (nome_completo, semana_texto, created_at, data) VALUES ($1, $2, $3, $4)`,
      [obj.nomeCompleto || null, obj.semanaTexto || null, createdAt, obj]
    )
    return
  }
  // Fallback: filesystem
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
    if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '[]', 'utf-8')
    const raw = fs.readFileSync(storePath, 'utf-8')
    let list = []
    try { list = JSON.parse(raw) } catch { list = [] }
    list.unshift({ ...obj, createdAt })
    fs.writeFileSync(storePath, JSON.stringify(list, null, 2), 'utf-8')
  } catch {}
}

export async function listCheckinsDb({ nome, from, to } = {}) {
  if (isDbEnabled()) {
    const c = await ensureClient()
    const where = []
    const params = []
    if (nome) { params.push(`%${nome}%`); where.push(`nome_completo ILIKE $${params.length}`) }
    if (from) { params.push(from); where.push(`created_at >= $${params.length}`) }
    if (to) { params.push(to); where.push(`created_at <= $${params.length}`) }
    const sql = `SELECT data, created_at FROM checkins${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`
    const result = await c.query(sql, params)
    return result.rows.map(r => ({ ...r.data, createdAt: new Date(r.created_at).toISOString() }))
  }
  // Fallback: filesystem
  try {
    const raw = fs.readFileSync(storePath, 'utf-8')
    let rows = []
    try { rows = JSON.parse(raw) } catch { rows = [] }
    if (nome) rows = rows.filter(r => (r.nomeCompleto || '').toLowerCase().includes(String(nome).toLowerCase()))
    if (from) rows = rows.filter(r => new Date(r.createdAt) >= new Date(from))
    if (to) rows = rows.filter(r => new Date(r.createdAt) <= new Date(to))
    return rows
  } catch { return [] }
}

export async function clearAllDb() {
  if (isDbEnabled()) {
    const c = await ensureClient()
    const count = await c.query('SELECT COUNT(*) AS n FROM checkins')
    await c.query('DELETE FROM checkins')
    return Number(count.rows[0].n || 0)
  }
  // Fallback: filesystem
  try {
    const raw = fs.readFileSync(storePath, 'utf-8')
    let prev = []
    try { prev = JSON.parse(raw) } catch { prev = [] }
    fs.writeFileSync(storePath, '[]', 'utf-8')
    return prev.length
  } catch { return 0 }
}

export async function getProfileDb() {
  if (isDbEnabled()) {
    const c = await ensureClient()
    const r = await c.query('SELECT photo, email, whatsapp FROM profile WHERE id = 1')
    if (!r.rows.length) return { photo: null, email: '', whatsapp: '' }
    const row = r.rows[0]
    return { photo: row.photo || null, email: row.email || '', whatsapp: row.whatsapp || '' }
  }
  try {
    const raw = fs.readFileSync(profilePath, 'utf-8')
    const json = JSON.parse(raw)
    return { photo: json.photo || null, email: json.email || '', whatsapp: json.whatsapp || '' }
  } catch { return { photo: null, email: '', whatsapp: '' } }
}

export async function setProfileDb({ photo, email, whatsapp }) {
  if (isDbEnabled()) {
    const c = await ensureClient()
    await c.query(
      `INSERT INTO profile (id, photo, email, whatsapp) VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET photo = EXCLUDED.photo, email = EXCLUDED.email, whatsapp = EXCLUDED.whatsapp`,
      [photo || null, email || '', whatsapp || '']
    )
    return
  }
  const current = await getProfileDb()
  const next = {
    photo: photo || current.photo || null,
    email: email || current.email || '',
    whatsapp: whatsapp || current.whatsapp || '',
  }
  fs.writeFileSync(profilePath, JSON.stringify(next, null, 2), 'utf-8')
}

export async function seedFromFilesIfEmpty() {
  if (!isDbEnabled()) return
  const c = await ensureClient()
  const r = await c.query('SELECT COUNT(*) AS n FROM checkins')
  if (Number(r.rows[0].n || 0) === 0) {
    try {
      const raw = fs.readFileSync(storePath, 'utf-8')
      let list = []
      try { list = JSON.parse(raw) } catch { list = [] }
      for (const item of list) {
        const createdAt = item.createdAt || new Date().toISOString()
        await c.query(
          `INSERT INTO checkins (nome_completo, semana_texto, created_at, data) VALUES ($1, $2, $3, $4)`,
          [item.nomeCompleto || null, item.semanaTexto || null, createdAt, item]
        )
      }
    } catch {}
  }
  const pr = await c.query('SELECT COUNT(*) AS n FROM profile WHERE id = 1')
  if (Number(pr.rows[0].n || 0) === 0) {
    try {
      const raw = fs.readFileSync(profilePath, 'utf-8')
      const json = JSON.parse(raw)
      await c.query(
        `INSERT INTO profile (id, photo, email, whatsapp) VALUES (1, $1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [json.photo || null, json.email || '', json.whatsapp || '']
      )
    } catch {
      await c.query('INSERT INTO profile (id, photo, email, whatsapp) VALUES (1, NULL, \'\', \'\') ON CONFLICT (id) DO NOTHING')
    }
  }
}