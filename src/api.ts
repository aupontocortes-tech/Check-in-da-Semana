import axios from 'axios'
import { CheckinFormData } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5175'

export async function adminLogin(payload: { username: string; password: string }) {
  try {
    const res = await axios.post(`${API_BASE}/api/admin/login`, payload)
    return res.data as { ok: boolean }
  } catch (e) {
    // Fallback para ambientes somente-frontend (ex.: Vercel) usando variáveis VITE_
    const viteUser = (import.meta.env.VITE_ADMIN_USERNAME as string) || 'professor'
    const viteKey = (import.meta.env.VITE_ADMIN_KEY as string) || '0808'
    const ok = payload.username.trim().toLowerCase() === viteUser.toLowerCase() && payload.password === viteKey
    return { ok }
  }
}

export async function submitCheckin(data: CheckinFormData) {
  try {
    const res = await axios.post(`${API_BASE}/api/checkin`, data)
    return res.data
  } catch (_) {
    // Fallback: sem backend, persistir localmente para não bloquear UX
    const key = 'CHECKINS'
    const arrStr = localStorage.getItem(key) || '[]'
    let arr: any[] = []
    try { arr = JSON.parse(arrStr) } catch { arr = [] }
    const item = { ...data, createdAt: new Date().toISOString() }
    arr.unshift(item)
    try { localStorage.setItem(key, JSON.stringify(arr)) } catch {}
    return { ok: true, local: true }
  }
}

export async function listCheckins(params?: { nome?: string; from?: string; to?: string; adminKey?: string }) {
  try {
    const res = await axios.get(`${API_BASE}/api/checkins`, { params })
    return res.data as CheckinFormData[]
  } catch (_) {
    // Fallback: sem backend, ler do localStorage
    const key = 'CHECKINS'
    const arrStr = localStorage.getItem(key) || '[]'
    let arr: CheckinFormData[] = []
    try { arr = JSON.parse(arrStr) } catch { arr = [] }
    // Filtragem básica por nome se fornecido
    const nome = params?.nome?.trim()
    if (nome) {
      arr = arr.filter((c) => (c.nomeCompleto || '').toLowerCase().includes(nome.toLowerCase()))
    }
    return arr
  }
}

export async function generatePdfReport(payload: { nome: string; semanaTexto?: string }) {
  const res = await axios.post(`${API_BASE}/api/report/pdf`, payload, { responseType: 'blob' })
  return res.data as Blob
}

export async function sendReportWebhook(payload: any) {
  const res = await axios.post(`${API_BASE}/api/report/send`, payload)
  return res.data
}

export async function clearAllData(payload: { adminKey: string }) {
  try {
    const res = await axios.post(`${API_BASE}/api/admin/clear`, payload)
    return res.data as { ok: boolean; deleted: number }
  } catch (_) {
    // Fallback: sem backend, valida a senha contra VITE_ADMIN_KEY e limpa localStorage
    const viteKey = (import.meta.env.VITE_ADMIN_KEY as string) || '0808'
    const ok = payload.adminKey === viteKey
    if (!ok) return { ok: false, deleted: 0 } as { ok: boolean; deleted: number }
    const key = 'CHECKINS'
    const arrStr = localStorage.getItem(key) || '[]'
    let arr: any[] = []
    try { arr = JSON.parse(arrStr) } catch { arr = [] }
    try { localStorage.setItem(key, '[]') } catch {}
    return { ok: true, deleted: arr.length } as { ok: boolean; deleted: number }
  }
}

// Perfil do site (foto fixa)
export async function getProfile() {
  try {
    const res = await axios.get(`${API_BASE}/api/profile`)
    return res.data as { photo: string | null; email?: string; whatsapp?: string }
  } catch (_) {
    const photo = localStorage.getItem('SITE_PROFILE_PHOTO')
    const email = localStorage.getItem('ADMIN_EMAIL') || ''
    const whatsapp = localStorage.getItem('ADMIN_WHATSAPP') || ''
    return { photo: photo || null, email, whatsapp }
  }
}

export async function updateProfile(payload: { photo?: string | null; email?: string; whatsapp?: string }) {
  try {
    const res = await axios.post(`${API_BASE}/api/profile`, payload)
    return res.data as { ok: boolean }
  } catch (_) {
    try {
      if (payload.photo !== undefined) {
        if (payload.photo) localStorage.setItem('SITE_PROFILE_PHOTO', payload.photo)
        else localStorage.removeItem('SITE_PROFILE_PHOTO')
      }
      if (payload.email !== undefined) localStorage.setItem('ADMIN_EMAIL', payload.email || '')
      if (payload.whatsapp !== undefined) localStorage.setItem('ADMIN_WHATSAPP', payload.whatsapp || '')
    } catch {}
    return { ok: true }
  }
}