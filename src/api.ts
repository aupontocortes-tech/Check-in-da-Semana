import axios, { AxiosRequestConfig } from 'axios'
import { CheckinFormData } from './types'

// Ambiente
const IS_DEV = Boolean((import.meta as any).env?.DEV)

// Normaliza bases: remove barras finais e sufixo /api, garante http(s)
function normalizeBase(raw?: string): string | undefined {
  if (!raw) return undefined
  let s = raw.trim()
  if (!/^(https?:)\/\//i.test(s)) return undefined
  // remove espaços e barras extras
  s = s.replace(/\s+/g, '')
  s = s.replace(/\/$/, '')
  // se terminar com /api, remove para evitar /api/api
  s = s.replace(/\/api$/i, '')
  return s
}

// Resolve possíveis bases da API: env, localhost (dev) e Render (produção)
const CANDIDATE_BASES: string[] = (() => {
  const bases: string[] = []
  // Override em runtime via localStorage/QUERY, inclusive em produção.
  // Observação: este é um modo emergência para apontar a API sem redeploy.
  // Aceitamos apenas URLs http/https simples para evitar valores inválidos.
  try {
    if (typeof window !== 'undefined') {
      // Permite configuração via query string: ?api=... ou ?api_base=...
      try {
        const url = new URL(window.location.href)
        const qApi = (url.searchParams.get('api') || url.searchParams.get('api_base') || '').trim()
        const n = normalizeBase(qApi)
        if (n) {
          window.localStorage.setItem('API_BASE', n)
        }
      } catch {}
      const rt = normalizeBase(window.localStorage.getItem('API_BASE') || '')
      if (rt) bases.push(rt)
    }
  } catch {}
  const envBase = normalizeBase((import.meta.env.VITE_API_BASE as string) || '') || ''
  if (typeof window !== 'undefined') {
    const host = window.location.host || ''
    const isLocal = /localhost|127\.0\.0\.1/.test(host)
    // Prioriza localhost em desenvolvimento para evitar tentativas na nuvem
    if (isLocal) {
      bases.push('http://localhost:5175')
    } else {
      // Em produção (ex.: Vercel), usa mesma origem para aproveitar rewrites (/api -> backend)
      bases.push(window.location.origin)
    }
  } else {
    bases.push('http://localhost:5175')
  }
  // Em seguida, qualquer base configurada via env
  if (envBase) bases.push(envBase)
  // Por fim, fallback Render somente fora do modo dev quando não houver env
  if (!envBase && !IS_DEV) bases.push('https://checkin-backend.onrender.com')
  // Remove duplicados e valores vazios
  return Array.from(new Set(bases.filter(Boolean)))
})()

// Bases em runtime (recheca localStorage sempre que chamada)
function runtimeBases(): string[] {
  const bases = CANDIDATE_BASES.slice()
  // Considera override de API_BASE do cliente sempre (emergência)
  try {
    if (typeof window !== 'undefined') {
      const rt = normalizeBase(window.localStorage.getItem('API_BASE') || '')
      if (rt) bases.unshift(rt)
    }
  } catch {}
  // Prioriza VITE_API_BASE antes de window.origin em produção
  const envBaseRt = normalizeBase((import.meta.env.VITE_API_BASE as string) || '') || ''
  if (envBaseRt) bases.unshift(envBaseRt)
  return Array.from(new Set(bases.filter(Boolean)))
}

// Utils para inspeção/diagóstico da API em tempo de execução
export function getApiBases(): string[] {
  return runtimeBases()
}

export function getActiveApiBase(): string | undefined {
  return runtimeBases()[0]
}

// Permite configurar a base da API em tempo de execução (localStorage)
export function setRuntimeApiBase(url?: string): string | undefined {
  try {
    if (typeof window !== 'undefined') {
      const v = (url || '').trim()
      if (v) {
        window.localStorage.setItem('API_BASE', v)
      } else {
        window.localStorage.removeItem('API_BASE')
      }
    }
  } catch {}
  return getActiveApiBase()
}

export async function pingHealth(base?: string): Promise<boolean> {
  const b = base || getActiveApiBase()
  if (!b) return false
  try {
    const res = await axios.get(`${b}/health`, { timeout: 4000 })
    return Boolean((res.data as any)?.ok)
  } catch {
    return false
  }
}

async function getWithFallback<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  let lastErr: any = null
  for (const base of runtimeBases()) {
    try {
      const res = await axios.get(`${base}${path}`, { timeout: 5000, ...(config || {}) })
      return res.data as T
    } catch (e) {
      lastErr = e
      continue
    }
  }
  throw lastErr || new Error('all_backends_failed')
}

async function postWithFallback<T>(path: string, payload: any): Promise<T> {
  let lastErr: any = null
  for (const base of runtimeBases()) {
    try {
      const res = await axios.post(`${base}${path}`, payload, { timeout: 12000 })
      return res.data as T
    } catch (e) {
      lastErr = e
      continue
    }
  }
  throw lastErr || new Error('all_backends_failed')
}

export async function adminLogin(payload: { username: string; password: string }) {
  try {
    const res = await postWithFallback<any>(`/api/admin/login`, payload)
    // Se a resposta não for um objeto com ok:boolean, trata como inválida para acionar fallback
    const okFlag = typeof res === 'object' && res && typeof (res as any).ok === 'boolean' ? Boolean((res as any).ok) : false
    if (!okFlag) throw new Error('invalid_response')
    return { ok: true }
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
    const res = await postWithFallback(`/api/checkin`, data)
    return res
  } catch (_) {
    // Backend indisponível: salva offline no dispositivo e segue fluxo
    try {
      const key = 'CHECKINS'
      const arrStr = localStorage.getItem(key) || '[]'
      let arr: any[] = []
      try { arr = JSON.parse(arrStr) || [] } catch { arr = [] }
      const withTs = { ...data, createdAt: new Date().toISOString() }
      arr.unshift(withTs)
      localStorage.setItem(key, JSON.stringify(arr))
      return { ok: true, offline: true }
    } catch {
      throw new Error('submit_failed')
    }
  }
}

// Tenta sincronizar check-ins salvos offline (localStorage) para o backend
export async function syncLocalCheckins(): Promise<number> {
  const key = 'CHECKINS'
  let arr: any[] = []
  try { arr = JSON.parse(localStorage.getItem(key) || '[]') || [] } catch { arr = [] }
  if (!arr.length) return 0

  let synced = 0
  const remaining: any[] = []
  for (const item of arr) {
    try {
      await postWithFallback(`/api/checkin`, item)
      synced++
    } catch {
      // Mantém itens que não conseguiram sincronizar
      remaining.push(item)
    }
  }
  try { localStorage.setItem(key, JSON.stringify(remaining)) } catch {}
  return synced
}

export async function listCheckins(params?: { nome?: string; from?: string; to?: string; adminKey?: string }) {
  try {
    const res = await getWithFallback<CheckinFormData[]>(`/api/checkins`, {
      params: {
        adminKey: params?.adminKey,
        nome: params?.nome,
        from: params?.from,
        to: params?.to,
      }
    })
    return res as CheckinFormData[]
  } catch (_) {
    // Fallback local: exibe itens do dispositivo atual para não bloquear operação
    const key = 'CHECKINS'
    try {
      const arrStr = localStorage.getItem(key) || '[]'
      const arr = JSON.parse(arrStr) || []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
}

export async function generatePdfReport(payload: { nome: string; semanaTexto?: string }) {
  const base = CANDIDATE_BASES[0]
  const res = await axios.post(`${base}/api/report/pdf`, payload, { responseType: 'blob' })
  return res.data as Blob
}

export async function sendReportWebhook(payload: any) {
  const res = await postWithFallback(`/api/report/send`, payload)
  return res
}

export async function clearAllData(payload: { adminKey: string }) {
  try {
    const res = await postWithFallback<{ ok: boolean; deleted: number }>(`/api/admin/clear`, payload)
    return res as { ok: boolean; deleted: number }
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
export async function getProfile(config?: AxiosRequestConfig) {
  // Tenta buscar do backend; em caso de falha, usa valores fixos
  try {
    const res = await getWithFallback<{ photo?: string | null; email?: string; whatsapp?: string }>(`/api/profile`, config)
    const p = (res || {}) as any
    // Sanitiza tipos
    return {
      photo: typeof p.photo === 'string' || p.photo === null ? p.photo : undefined,
      email: typeof p.email === 'string' ? p.email : '',
      whatsapp: typeof p.whatsapp === 'string' ? p.whatsapp : '',
    }
  } catch {
    const fixedPhoto = '/profile-fixed.jpg?v=20251108-2'
    const fixedWhatsapp = '5561994422679'
    return { photo: fixedPhoto, email: '', whatsapp: fixedWhatsapp }
  }
}

export async function updateProfile(payload: { photo?: string | null; email?: string; whatsapp?: string; adminKey?: string }) {
  try {
    if (payload?.adminKey) {
      try {
        const res = await postWithFallback<{ ok: boolean }>(`/api/admin/profile`, payload)
        return res as { ok: boolean }
      } catch (_) {
        const { adminKey, ...publicPayload } = payload
        const res = await postWithFallback<{ ok: boolean }>(`/api/profile`, publicPayload)
        return res as { ok: boolean }
      }
    } else {
      const res = await postWithFallback<{ ok: boolean }>(`/api/profile`, payload)
      return res as { ok: boolean }
    }
  } catch (_) {
    // Sem fallback local: falha explícita para não criar divergência entre links
    return { ok: false }
  }
}