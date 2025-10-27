import axios from 'axios'
import { CheckinFormData } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5174'

export async function adminLogin(payload: { username: string; password: string }) {
  const res = await axios.post(`${API_BASE}/api/admin/login`, payload)
  return res.data as { ok: boolean }
}

export async function submitCheckin(data: CheckinFormData) {
  const res = await axios.post(`${API_BASE}/api/checkin`, data)
  return res.data
}

export async function listCheckins(params?: { nome?: string; from?: string; to?: string; adminKey?: string }) {
  const res = await axios.get(`${API_BASE}/api/checkins`, { params })
  return res.data as CheckinFormData[]
}

export async function generatePdfReport(payload: { nome: string; semanaTexto?: string }) {
  const res = await axios.post(`${API_BASE}/api/report/pdf`, payload, { responseType: 'blob' })
  return res.data as Blob
}

export async function sendReportWebhook(payload: any) {
  const res = await axios.post(`${API_BASE}/api/report/send`, payload)
  return res.data
}