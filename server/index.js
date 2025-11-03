import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import PDFDocument from 'pdfkit'
import dotenv from 'dotenv'
import nodemailer from 'nodemailer'
import { initDb, seedFromFilesIfEmpty, isDbEnabled, saveCheckin, listCheckinsDb, getProfileDb, setProfileDb, clearAllDb } from './db.js'

dotenv.config()

// Inicializa DB (se DATABASE_URL estiver definido) e migra dados locais, sem bloquear início do servidor
try {
  await initDb()
  await seedFromFilesIfEmpty()
  console.log(isDbEnabled() ? 'Postgres habilitado: tabelas prontas' : 'Postgres não configurado: usando filesystem')
} catch (e) {
  console.warn('Init DB falhou (continuando com filesystem):', e?.message || e)
}

const app = express()
// Aumenta limite para upload de foto em base64 (data URL)
app.use(express.json({ limit: '10mb' }))
// CORS: permitir localhost e origens definidas via env (ex.: Vercel)
const corsAllowList = [
  /^http:\/\/localhost:\d+$/,
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGIN_2,
  process.env.CORS_ORIGIN_3,
].filter(Boolean)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    // Se nenhuma origem foi configurada, permita todas (facilita primeiros deploys)
    if (!corsAllowList.length) return cb(null, true)
    const ok = corsAllowList.some((rule) =>
      rule instanceof RegExp ? rule.test(origin) : String(rule) === String(origin)
    )
    return cb(null, ok)
  },
}))

const dataDir = path.join(process.cwd(), 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)
const storePath = path.join(dataDir, 'checkins.json')
if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '[]', 'utf-8')
const profilePath = path.join(dataDir, 'profile.json')
if (!fs.existsSync(profilePath)) fs.writeFileSync(profilePath, JSON.stringify({ photo: null, email: '', whatsapp: '' }, null, 2), 'utf-8')

app.post('/api/checkin', async (req, res) => {
  const data = req.body || {}
  data.createdAt = new Date().toISOString()
  try {
    await saveCheckin(data)
    res.json({ ok: true })
  } catch (e) {
    console.warn('Falha ao salvar checkin', e)
    res.status(500).json({ error: 'save_failed' })
  }
})

// Perfil público do site (foto)
// Perfil é lido/salvo via DB com fallback para filesystem (implementado em db.js)

// Público: obter foto atual
app.get('/api/profile', async (_req, res) => {
  // Evita cache para garantir que todas as páginas/leads vejam o perfil atualizado
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  try {
    const p = await getProfileDb()
    res.json(p)
  } catch (e) {
    console.warn('Falha ao ler perfil', e)
    res.status(500).json({ error: 'read_failed' })
  }
})

// Público: atualizar foto (sem senha)
app.post('/api/profile', async (req, res) => {
  const { photo, email, whatsapp } = req.body || {}
  try {
    await setProfileDb({ photo, email, whatsapp })
    res.json({ ok: true })
  } catch (e) {
    console.warn('Falha ao salvar perfil (público)', e)
    res.status(500).json({ error: 'save_failed' })
  }
})

// Admin: atualizar foto (exige ADMIN_KEY)
app.post('/api/admin/profile', async (req, res) => {
  const { adminKey, photo, email, whatsapp } = req.body || {}
  const expectedPass = process.env.ADMIN_KEY || '0808'
  if (!adminKey || String(adminKey) !== expectedPass) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    await setProfileDb({ photo, email, whatsapp })
    res.json({ ok: true })
  } catch (e) {
    console.warn('Falha ao salvar perfil', e)
    res.status(500).json({ error: 'save_failed' })
  }
})

// Admin login: validates username and password
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {}
  const expectedUser = process.env.ADMIN_USERNAME || 'professor'
  const expectedPass = process.env.ADMIN_KEY || '0808'
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials' })
  }
  if (String(username).toLowerCase() !== String(expectedUser).toLowerCase() || String(password) !== String(expectedPass)) {
    return res.status(401).json({ error: 'invalid_credentials' })
  }
  // For simplicity we return ok; frontend will use ADMIN_KEY for authorized fetches
  res.json({ ok: true })
})

app.get('/api/checkins', async (req, res) => {
  const adminKey = req.query.adminKey
  if (!adminKey || String(adminKey) !== (process.env.ADMIN_KEY || '0808')) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const nome = req.query.nome ? String(req.query.nome) : null
  const from = req.query.from ? String(req.query.from) : null
  const to = req.query.to ? String(req.query.to) : null
  try {
    const rows = await listCheckinsDb({ nome, from, to })
    res.json(rows)
  } catch (e) {
    console.warn('Falha ao listar checkins', e)
    res.status(500).json({ error: 'list_failed' })
  }
})

// Admin: limpar todos os dados (exige apenas a senha ADMIN_KEY)
app.post('/api/admin/clear', async (req, res) => {
  const { adminKey } = req.body || {}
  const expectedPass = process.env.ADMIN_KEY || '0808'
  if (!adminKey || String(adminKey) !== expectedPass) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const n = await clearAllDb()
    return res.json({ ok: true, deleted: n })
  } catch (e) {
    console.warn('Falha ao limpar dados', e)
    return res.status(500).json({ error: 'clear_failed' })
  }
})

app.post('/api/report/pdf', async (req, res) => {
  const { nome, semanaTexto } = req.body || {}
  const doc = new PDFDocument()
  res.setHeader('Content-Type', 'application/pdf')
  doc.pipe(res)
  doc.fontSize(18).text('Relatório Semanal — Naty Personal', { align: 'center' })
  doc.moveDown()
  doc.fontSize(14).text(`Aluna: ${nome || 'N/A'}`)
  doc.text(`Semana: ${semanaTexto || 'N/A'}`)
  doc.moveDown()
  const all = await listCheckinsDb()
  const rows = (all || []).filter(r => !nome || r.nomeCompleto === nome)
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
  const { adminEmail = '', adminWhatsapp = '', tipo = 'weekly_report', ...rest } = req.body || {}
  const payload = { type: tipo, adminEmail, adminWhatsapp, ...rest }

  // 1) Tenta enviar via webhook se configurado
  const webhook = process.env.REPORT_WEBHOOK_URL
  if (webhook) {
    try {
      const resp = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      // Continua para e-mail/WhatsApp também, se configurados
    } catch (e) {
      console.warn('Webhook falhou', e)
    }
  }

  // 2) Envio de e-mail direto via SMTP se estiver configurado
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const emailFrom = process.env.EMAIL_FROM || smtpUser
  if (smtpHost && smtpPort && smtpUser && smtpPass && adminEmail) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // 465 = SSL
        auth: { user: smtpUser, pass: smtpPass },
      })
      const subject = `Novo check-in: ${rest.nomeCompleto || 'Aluno'} — ${rest.semanaTexto || ''}`
      const text = `Novo check-in enviado\n\n` +
        `Nome: ${rest.nomeCompleto}\nSemana: ${rest.semanaTexto}\n` +
        `Treinos de força: ${rest.treinosForca}\nEvolução: ${rest.evolucaoDesempenho}\n` +
        `Energia: ${rest.energiaGeral}\nSono: ${rest.sonoRecuperacao}\nAlimentação: ${rest.alimentacaoPlano}\n` +
        `Cardio: ${rest.cardioSessoes} sessões (${rest.tipoCardio}, ${rest.duracaoCardio} min, ${rest.intensidadeCardio})\n` +
        `Motivação/humor: ${rest.motivacaoHumor}\n` +
        `Treino não completado: ${rest.treinoNaoCompletado}\n` +
        `Dor/fadiga: ${rest.dorOuFadiga}\n` +
        `Ajuste próxima semana: ${rest.ajusteProximaSemana}\n` +
        `Comentários: ${rest.comentariosAdicionais}\n` +
        (rest.diasMarcados?.length ? `Dias marcados: ${rest.diasMarcados.join(', ')}` : '')
      await transporter.sendMail({ from: emailFrom, to: adminEmail, subject, text })
    } catch (e) {
      console.warn('Envio de e-mail falhou', e)
    }
  } else if (adminEmail) {
    // Fallback de teste: usa uma conta Ethereal gerada automaticamente
    try {
      const testAccount = await nodemailer.createTestAccount()
      const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
      const subject = `Novo check-in: ${rest.nomeCompleto || 'Aluno'} — ${rest.semanaTexto || ''}`
      const text = `Novo check-in enviado\n\n` +
        `Nome: ${rest.nomeCompleto}\nSemana: ${rest.semanaTexto}\n` +
        `Treinos de força: ${rest.treinosForca}\nEvolução: ${rest.evolucaoDesempenho}\n` +
        `Energia: ${rest.energiaGeral}\nSono: ${rest.sonoRecuperacao}\nAlimentação: ${rest.alimentacaoPlano}\n` +
        `Cardio: ${rest.cardioSessoes} sessões (${rest.tipoCardio}, ${rest.duracaoCardio} min, ${rest.intensidadeCardio})\n` +
        `Motivação/humor: ${rest.motivacaoHumor}\n` +
        `Treino não completado: ${rest.treinoNaoCompletado}\n` +
        `Dor/fadiga: ${rest.dorOuFadiga}\n` +
        `Ajuste próxima semana: ${rest.ajusteProximaSemana}\n` +
        `Comentários: ${rest.comentariosAdicionais}\n` +
        (rest.diasMarcados?.length ? `Dias marcados: ${rest.diasMarcados.join(', ')}` : '')
      const info = await transporter.sendMail({ from: testAccount.user, to: adminEmail, subject, text })
      const previewUrl = nodemailer.getTestMessageUrl(info)
      if (previewUrl) {
        console.log('Email de teste (Ethereal) enviado. Preview URL:', previewUrl)
      }
    } catch (e) {
      console.warn('Envio de e-mail (teste Ethereal) falhou', e)
    }
  }

  // 3) Envio via WhatsApp Cloud API se configurado
  const wabaToken = process.env.WABA_TOKEN
  const wabaPhoneId = process.env.WABA_PHONE_ID
  if (wabaToken && wabaPhoneId && adminWhatsapp) {
    try {
      const msg = `Novo check-in: ${rest.nomeCompleto || ''}\nSemana: ${rest.semanaTexto || ''}\nTreinos de força: ${rest.treinosForca}\nEnergia: ${rest.energiaGeral}\nSono: ${rest.sonoRecuperacao}\nAlimentação: ${rest.alimentacaoPlano}`
      await fetch(`https://graph.facebook.com/v17.0/${wabaPhoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wabaToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: adminWhatsapp, type: 'text', text: { body: msg } }),
      })
    } catch (e) {
      console.warn('Envio WhatsApp falhou', e)
    }
  }

  res.json({ ok: true })
})

const port = process.env.PORT || 5175
app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
})
// Healthcheck para deploys
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() })
})