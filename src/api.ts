import axios from 'axios'
import { CheckinFormData } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5174'

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
  const res = await axios.post(`${API_BASE}/api/checkin`, data)
  return res.data
}

export async function listCheckins(params?: { nome?: string; from?: string; to?: string; adminKey?: string }) {
  try {
    const res = await axios.get(`${API_BASE}/api/checkins`, { params })
    return res.data as CheckinFormData[]
  } catch (_) {
    // Fallback: sem backend, retorna lista vazia
    return []
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
  const res = await axios.post(`${API_BASE}/api/admin/clear`, payload)
  return res.data as { ok: boolean; deleted: number }
}