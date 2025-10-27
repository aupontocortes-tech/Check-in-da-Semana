import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import PDFDocument from 'pdfkit'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/] }))

const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
const storePath = path.join(dataDir, 'checkins.json')
if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '[]', 'utf-8')

function readAll() {
  const raw = fs.readFileSync(storePath, 'utf-8')
  try { return JSON.parse(raw) } catch { return [] }
}

function appendOne(obj) {
  const list = readAll()
  list.unshift(obj)
  fs.writeFileSync(storePath, JSON.stringify(list, null, 2), 'utf-8')
}

app.post('/api/checkin', (req, res) => {
  const data = req.body || {}
  data.createdAt = new Date().toISOString()
  appendOne(data)
  res.json({ ok: true })
})

// Admin login: validates username and password
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {}
  const expectedUser = process.env.ADMIN_USERNAME || 'professor'
  const expectedPass = process.env.ADMIN_KEY || 'admin123'
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials' })
  }
  if (String(username) !== expectedUser || String(password) !== expectedPass) {
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  // For simplicity we return ok; frontend will use ADMIN_KEY for authorized fetches
  res.json({ ok: true })
})

app.get('/api/checkins', (req, res) => {
  const adminKey = req.query.adminKey
  if (!adminKey || String(adminKey) !== (process.env.ADMIN_KEY || 'admin123')) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  let rows = readAll()
  const nome = req.query.nome ? String(req.query.nome) : null
  const from = req.query.from ? String(req.query.from) : null
  const to = req.query.to ? String(req.query.to) : null
  if (nome) rows = rows.filter(r => r.nomeCompleto?.toLowerCase().includes(nome.toLowerCase()))
  if (from) rows = rows.filter(r => new Date(r.createdAt) >= new Date(from))
  if (to) rows = rows.filter(r => new Date(r.createdAt) <= new Date(to))
  res.json(rows)
})

app.post('/api/report/pdf', (req, res) => {
  const { nome, semanaTexto } = req.body || {}
  const doc = new PDFDocument()
  res.setHeader('Content-Type', 'application/pdf')
  doc.pipe(res)
  doc.fontSize(18).text('Relatório Semanal — Naty Personal', { align: 'center' })
  doc.moveDown()
  doc.fontSize(14).text(`Aluna: ${nome || 'N/A'}`)
  doc.text(`Semana: ${semanaTexto || 'N/A'}`)
  doc.moveDown()
  const rows = readAll().filter(r => !nome || r.nomeCompleto === nome)
  const latest = rows[0]
  if (latest) {
    doc.text(`Treinos de força: ${latest.treinosForca}`)
    doc.text(`Energia: ${latest.energiaGeral}`)
    doc.text(`Sono: ${latest.sonoRecuperacao}`)
    doc.text(`Alimentação: ${latest.alimentacaoPlano}`)
  }
  doc.end()
})

app.post('/api/report/send', async (req, res) => {
  const webhook = process.env.REPORT_WEBHOOK_URL
  if (!webhook) return res.json({ ok: true, note: 'REPORT_WEBHOOK_URL não configurada; operação simulada.' })
  const payload = { type: 'weekly_report', ...req.body }
  try {
    const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    res.json({ ok: true, status: resp.status })
  } catch (e) {
    res.status(500).json({ error: 'webhook_failed' })
  }
})

const port = process.env.PORT || 5174
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
})