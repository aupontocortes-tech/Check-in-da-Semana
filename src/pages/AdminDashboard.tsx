import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCheckins, generatePdfReport, sendReportWebhook, adminLogin, clearAllData, getProfile, updateProfile, getActiveApiBase, setRuntimeApiBase, pingHealth } from '../api'
import type { CheckinFormData, SleepOption, EnergyOption, MotivationOption } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid, ResponsiveContainer } from 'recharts'

const COLORS = ['#FF7A00', '#aaa', '#666', '#fff']

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState('')
  const [adminUser, setAdminUser] = useState('')
  const [ok, setOk] = useState(false)
  const [items, setItems] = useState<CheckinFormData[]>([])
  const [nomeFiltro, setNomeFiltro] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminWhatsapp, setAdminWhatsapp] = useState('')
  const [allItems, setAllItems] = useState<CheckinFormData[]>([])
  const [selectedNome, setSelectedNome] = useState('')
  const [selectedItem, setSelectedItem] = useState<CheckinFormData | null>(null)
  const [showNamesList, setShowNamesList] = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearPass, setClearPass] = useState('')
  const [clearing, setClearing] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendEmailOpt, setSendEmailOpt] = useState(false)
  const [sendWhatsOpt, setSendWhatsOpt] = useState(false)
  const [sitePhoto, setSitePhoto] = useState<string | null>(null)
  const [newPhoto, setNewPhoto] = useState<string | null>(null)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [updateNotice, setUpdateNotice] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [savingApi, setSavingApi] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  
  useEffect(() => {
    // Exigir login sempre: não faz auto-login e limpa credenciais salvas
    localStorage.removeItem('ADMIN_KEY')
    localStorage.removeItem('ADMIN_USER')
    // Força uso do backend central removendo overrides de API no dispositivo
    try { localStorage.removeItem('API_BASE') } catch {}
    const controller = new AbortController()
    const { signal } = controller
    ;(async () => {
      try {
        const p = await getProfile({ signal })
        setSitePhoto(p.photo || null)
        // Usa exclusivamente os valores do servidor
        setAdminEmail((p.email || '').trim())
        setAdminWhatsapp((p.whatsapp || '').trim())
      } catch {
        // Em falha, zera para evitar valores antigos
        setAdminEmail('')
        setAdminWhatsapp('')
      }
    })()
    try { setApiBase(getActiveApiBase() || '') } catch {}
    return () => { controller.abort() }
  }, [])

  const fetchData = async (key: string, nome?: string) => {
    const data = await listCheckins({ adminKey: key, nome: nome || undefined })
    setItems(data)
    if (!nome) setAllItems(data)
    // Se veio de fallback local, avisa em destaque
    try {
      const origin = getActiveApiBase() || ''
      const isLocal = Array.isArray(data) && data.length && !origin
      if (!ok && Array.isArray(data) && data.length && isLocal) {
        alert('Modo offline: exibindo check-ins locais deste dispositivo. O servidor será sincronizado quando voltar.')
      }
    } catch {}
  }

  const handleLogin = async () => {
    const user = adminUser.trim()
    const pass = adminKey.trim()
    if (!user || !pass) return alert('Informe usuário e senha')
    try {
      const resp = await adminLogin({ username: user, password: pass })
      if (!resp.ok) throw new Error('invalid')
      // Entra no painel imediatamente; busca dados em segundo plano
      setOk(true)
      try { await fetchData(pass) } catch {}
    } catch (e) {
      alert('Usuário ou senha inválidos')
      setOk(false)
    }
  }

  const handleClearAll = () => {
    setClearPass('')
    setShowClearModal(true)
  }

  const confirmClearAll = async () => {
    const pass = clearPass.trim()
    if (!pass) return alert('Informe a senha do administrador.')
    try {
      setClearing(true)
      const resp = await clearAllData({ adminKey: pass })
      if (!resp.ok) throw new Error('failed')
      setItems([])
      setAllItems([])
      setSelectedItem(null)
      try { await fetchData(pass) } catch {}
      setShowClearModal(false)
      alert(`Dados excluídos. Registros removidos: ${resp.deleted}`)
    } catch (e) {
      alert('Senha inválida ou erro ao excluir os dados.')
    } finally {
      setClearing(false)
    }
  }

  // Reduz a imagem no cliente para evitar payloads grandes e falhas no backend
  const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('failed_read'))
      reader.onload = () => {
        const src = String(reader.result || '')
        const img = new Image()
        img.onload = () => {
          try {
            const maxDim = 1024
            const w = img.width
            const h = img.height
            const scale = Math.min(1, maxDim / Math.max(w, h))
            const outW = Math.max(1, Math.round(w * scale))
            const outH = Math.max(1, Math.round(h * scale))
            const canvas = document.createElement('canvas')
            canvas.width = outW
            canvas.height = outH
            const ctx = canvas.getContext('2d')
            if (!ctx) return resolve(src)
            ctx.drawImage(img, 0, 0, outW, outH)
            const out = canvas.toDataURL('image/jpeg', 0.85)
            resolve(out)
          } catch (e) {
            resolve(src)
          }
        }
        img.onerror = () => resolve(src)
        img.src = src
      }
      reader.readAsDataURL(file)
    })
  }

  const handleNewPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processImageFile(file)
      .then((dataUrl) => setNewPhoto(dataUrl))
      .catch(() => {
        const reader = new FileReader()
        reader.onload = () => setNewPhoto(String(reader.result || ''))
        reader.readAsDataURL(file)
      })
  }

  const saveSitePhoto = async () => {
    if (!newPhoto) {
      alert('Selecione uma imagem antes de salvar.')
      return
    }
    setSavingPhoto(true)
    try {
      const resp = await updateProfile({ photo: newPhoto, adminKey: adminKey.trim() })
      if (!resp.ok) throw new Error('invalid')
      setSitePhoto(newPhoto || null)
      setNewPhoto(null)
      setUpdateNotice('Foto atualizada. Todos os links exibirão a nova foto.')
      setTimeout(() => setUpdateNotice(''), 5000)
    } catch (e) {
      alert('Erro ao salvar a foto.')
    } finally {
      setSavingPhoto(false)
    }
  }

  const deleteSitePhoto = async () => {
    setSavingPhoto(true)
    try {
      const resp = await updateProfile({ photo: null, adminKey: adminKey.trim() })
      if (!resp.ok) throw new Error('invalid')
      setSitePhoto(null)
      setNewPhoto(null)
      setUpdateNotice('Foto removida do site.')
      setTimeout(() => setUpdateNotice(''), 5000)
    } catch (e) {
      alert('Erro ao remover a foto.')
    } finally {
      setSavingPhoto(false)
    }
  }

  const saveContacts = async () => {
    const email = (adminEmail || '').trim()
    const digits = (adminWhatsapp || '').replace(/\D/g, '')
    // Validação específica: DDI 55 + DDD 61 + 9 dígitos
    if (digits && !/^5561\d{9}$/.test(digits)) {
      alert('Informe o WhatsApp no formato 5561994422679 (DDI 55 + DDD 61 + número).')
      return
    }
    const whatsapp = digits
    setSavingContacts(true)
    try {
      const resp = await updateProfile({ email, whatsapp, adminKey: (adminKey || '').trim() || undefined })
      if (!resp.ok) throw new Error('invalid')
      setUpdateNotice('Contatos atualizados (e-mail e WhatsApp).')
      setTimeout(() => setUpdateNotice(''), 5000)
    } catch (e) {
      alert('Erro ao salvar contatos.')
    } finally {
      setSavingContacts(false)
    }
  }

   const groupedByNome = useMemo(() => {
    const map: Record<string, number> = {}
    for (const it of items) {
      const k = it.nomeCompleto
      const val = it.treinosForca === '0' ? 0 : it.treinosForca === '1-2' ? 2 : it.treinosForca === '3-4' ? 4 : 5
      map[k] = (map[k] || 0) + val
    }
    return Object.entries(map).map(([name, count]) => ({ name, count }))
  }, [items])

  const nomes = useMemo(() => {
    const set = new Set<string>()
    for (const it of allItems) if (it.nomeCompleto) set.add(it.nomeCompleto)
    return Array.from(set).sort((a,b)=>a.localeCompare(b))
  }, [allItems])

  const nameCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const it of allItems) {
      const n = it.nomeCompleto
      if (!n) continue
      map[n] = (map[n] || 0) + 1
    }
    return Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]))
  }, [allItems])

  const treinosPorSemana = useMemo(() => {
    const rows = items.map((it) => {
      const val = it.treinosForca === '0' ? 0 : it.treinosForca === '1-2' ? 2 : it.treinosForca === '3-4' ? 4 : 5
      const label = it.semanaTexto && it.semanaTexto.trim().length
        ? it.semanaTexto
        : (it.createdAt ? new Date(it.createdAt).toLocaleDateString('pt-BR') : '')
      return { semana: label, count: val }
    })
    return rows.reverse()
  }, [items])

  const sleepDist = useMemo(() => {
    const opts: SleepOption[] = ['Muito bom','Bom','Regular','Ruim']
    const counts: Record<SleepOption, number> = { 'Muito bom':0, 'Bom':0, 'Regular':0, 'Ruim':0 }
    for (const it of items) counts[it.sonoRecuperacao]++
    return opts.map((o) => ({ name: o, value: counts[o] }))
  }, [items])

  const energyMotivation = useMemo(() => {
    const optionsE: EnergyOption[] = ['Excelente','Boa','Média','Baixa']
    const optionsM: MotivationOption[] = ['Muito alta','Boa','Média','Preciso de impulso']
    const normalizeE = (e: EnergyOption) => optionsE.indexOf(e)
    const normalizeM = (m: MotivationOption) => optionsM.indexOf(m)
    return items.map((it, idx) => ({ idx: idx + 1, energia: normalizeE(it.energiaGeral), motivacao: normalizeM(it.motivacaoHumor), nome: it.nomeCompleto }))
  }, [items])

  const foodAdherence = useMemo(() => {
    const cats = ['Sim, totalmente', 'Sim, em parte', 'Não muito'] as const
    const colors = {
      'Sim, totalmente': '#22c55e', // verde
      'Sim, em parte': '#f59e0b',   // amarelo
      'Não muito': '#ef4444',       // vermelho
    } as const
    const counts: Record<(typeof cats)[number], number> = {
      'Sim, totalmente': 0,
      'Sim, em parte': 0,
      'Não muito': 0,
    }
    for (const it of items) counts[it.alimentacaoPlano as (typeof cats)[number]]++
    const total = items.length || 1
    return cats.map((c) => ({
      categoria: c,
      qtd: counts[c],
      pct: Math.round((counts[c] / total) * 100),
      color: colors[c],
    }))
  }, [items])

  const exportPdf = async () => {
    const nome = selectedNome || (items[0]?.nomeCompleto || '')
    if (!nome) return alert('Selecione uma aluna para exportar.')
    const blob = await generatePdfReport({ nome })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-${nome}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openSendModal = () => {
    if (!items.length) return alert('Sem dados')
    setSendEmailOpt(Boolean(adminEmail))
    setSendWhatsOpt(Boolean(adminWhatsapp))
    setShowSendModal(true)
  }

  const handleSaveApiBase = async () => {
    const v = (apiBase || '').trim()
    if (!v) return alert('Informe a URL do backend (ex: https://seu-backend.com)')
    setSavingApi(true)
    try {
      setRuntimeApiBase(v)
      const ok = await pingHealth(v)
      setUpdateNotice(ok ? 'API configurada e online.' : 'API configurada, mas saúde não respondeu.')
      setTimeout(() => setUpdateNotice(''), 5000)
    } catch {
      alert('Falha ao configurar/testar a API.')
    } finally {
      setSavingApi(false)
    }
  }

  const handleTestApi = async () => {
    try {
      const ok = await pingHealth((apiBase || undefined))
      alert(ok ? 'API OK (health retornou ok).' : 'Falha ao alcançar /health na API informada.')
    } catch {
      alert('Erro ao testar a API.')
    }
  }

  const confirmSend = async () => {
    if (!items.length) return alert('Sem dados')
    const latest = items[0]
    const useEmail = sendEmailOpt && !!adminEmail
    const useWhats = sendWhatsOpt && !!adminWhatsapp
    if (!useEmail && !useWhats) {
      return alert('Selecione pelo menos um canal (E-mail ou WhatsApp).')
    }
    try {
      // Dispara backend para e-mail/Cloud API quando disponível
      await sendReportWebhook({
        ...latest,
        tipo: 'weekly_report',
        adminEmail: useEmail ? adminEmail : '',
        adminWhatsapp: useWhats ? adminWhatsapp : '',
      })
    } catch (e) {
      // Não bloqueia o WhatsApp; segue para o fallback abaixo
    } finally {
      setShowSendModal(false)
    }

    // Fallback cliente: abrir WhatsApp Click-to-Chat independentemente do webhook
    if (useWhats) {
      const phone = (adminWhatsapp || '').replace(/\D/g, '')
      if (phone) {
        const lines = [
          `Novo check-in: ${latest.nomeCompleto} — ${latest.semanaTexto || ''}`,
          `Treinos de força: ${latest.treinosForca}`,
          `Energia: ${latest.energiaGeral}`,
          `Sono: ${latest.sonoRecuperacao}`,
          `Alimentação: ${latest.alimentacaoPlano}`,
        ].filter(Boolean)
        const text = encodeURIComponent(lines.join('\n'))
        // Usa api.whatsapp.com para compatibilidade com iOS
        const apiUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${text}&app_absent=0`
        try {
          const ua = navigator.userAgent || ''
          const isIOS = /(iPhone|iPad|iPod)/i.test(ua) || (/Macintosh/i.test(ua) && 'ontouchend' in document)
          if (isIOS) {
            window.location.assign(apiUrl)
          } else {
            const w = window.open(apiUrl, '_blank', 'noopener,noreferrer')
            if (!w) window.location.assign(apiUrl)
          }
        } catch {}
      }
    }
    alert(`Relatório enviado${useEmail ? ' por e-mail' : ''}${useWhats ? (useEmail ? ' e WhatsApp' : ' por WhatsApp') : ''}!`)
  }

  if (!ok) {
    return (
      <div className="max-w-md mx-auto px-4 space-y-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="brand-btn">Voltar</Link>
        </div>
        <h2 className="text-xl font-bold">Acesso restrito</h2>
        <p>Informe usuário e senha do professor para entrar.</p>
        <input type="text" className="px-3 py-2 rounded bg-white/5 border border-white/20 w-full text-white placeholder-white/70" placeholder="Usuário (ex: professor)" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
        <input type="password" className="px-3 py-2 rounded bg-white/5 border border-white/20 w-full text-white placeholder-white/70" placeholder="Senha" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        <button className="brand-btn" onClick={handleLogin}>Entrar</button>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 space-y-6">
      <h2 className="text-2xl font-bold">Painel de Administração</h2>
      {updateNotice && (
        <div className="px-3 py-2 rounded bg-green-600/20 border border-green-500/40 text-green-100">
          {updateNotice}
        </div>
      )}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <Link to="/" className="brand-btn">Voltar</Link>
        <div className="flex items-end gap-3 flex-wrap">
          <button
            className="px-3 py-2 rounded bg-red-600 hover:bg-red-700"
            title="Excluir todos os dados (requer senha)"
            onClick={handleClearAll}
          >
            Excluir dados
          </button>
          <button
            className="px-3 py-2 rounded bg-white/10 hover:bg-white/20"
            title="Todos os alunos"
            onClick={() => { setShowNamesList(true); setSelectedNome(''); fetchData(adminKey, undefined); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          >
            👥
          </button>
          {selectedNome && (
            <div className="flex items-center gap-2 text-sm opacity-80">
              <span>Filtrando: <span className="font-semibold">{selectedNome}</span></span>
              <button
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
                onClick={() => { setSelectedNome(''); fetchData(adminKey, undefined) }}
              >
                Limpar filtro
              </button>
            </div>
          )}
          <select className="px-3 py-2 rounded bg-white/5 border border-white/10" value={selectedNome} onChange={(e) => { const v = e.target.value; setSelectedNome(v); fetchData(adminKey, v || undefined) }}>
            <option value="">Todas alunas</option>
            {nomes.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button className="brand-btn" onClick={() => fetchData(adminKey, selectedNome || undefined)}>Atualizar</button>
          <button className="brand-btn" onClick={exportPdf}>Exportar PDF</button>
          <button className="brand-btn" onClick={openSendModal}>Enviar Relatório</button>
        </div>
      </div>
      {/* Layout principal com coluna fixa de nomes (desktop) */}
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <aside className="hidden md:block">
          <div className="bg-white rounded p-4 text-black">
            <h3 className="font-semibold mb-2">Alunas (checklists enviados)</h3>
            <div className="grid gap-2">
              {nameCounts.map(([name, count]) => (
                <button
                  key={name}
                  className="text-left px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                  onClick={() => { setSelectedNome(name); fetchData(adminKey, name); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                >
                  <span className="font-semibold">{name}</span>
                  <span className="ml-2 text-sm opacity-70">({count})</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {/* Configurações e gráficos permanecem na coluna principal */}
          <section className="bg-white/5 rounded p-4">
            <h3 className="font-semibold mb-3">Configurações de contato</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm opacity-80">E-mail do treinador</span>
                <input className="px-3 py-2 rounded bg-white/5 border border-white/10" placeholder="ex: seuemail@dominio.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm opacity-80">WhatsApp do treinador (com DDD)</span>
                <input className="px-3 py-2 rounded bg_WHITE/5 border border_WHITE/10" placeholder="ex: 5561994422679" value={adminWhatsapp} onChange={(e) => setAdminWhatsapp(e.target.value)} />
                <span className="text-xs opacity-60">Formato esperado: 5561994422679 (+55 DDI, 61 DDD)</span>
              </label>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button className="brand-btn" type="button" onClick={saveContacts} disabled={savingContacts}>
                {savingContacts ? 'Salvando…' : 'Salvar contatos'}
              </button>
              <span className="text-xs opacity-60">Usado no envio por e-mail/WhatsApp.</span>
            </div>
          </section>

          <section className="bg-white/5 rounded p-4">
            <h3 className="font-semibold mb-3">Foto do site</h3>
            <div className="grid gap-3 md:grid-cols-[auto_1fr] items-center">
              <div className="w-24 h-24 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
                <img src="/profile-fixed.jpg?v=20251108-2" alt="Foto fixa do site" className="w-24 h-24 rounded-full object-cover object-top border border-white/20" />
              </div>
              <div className="grid gap-2">
                <span className="text-sm opacity-70">Foto fixa no perfil (somente leitura). Edição desativada.</span>
              </div>
            </div>
          </section>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white/5 rounded p-4 h-[320px]">
              <h3 className="font-semibold mb-2">Treinos por semana (aluna)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={treinosPorSemana}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="semana" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#FF7A00" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          
            <div className="bg-white/5 rounded p-4 h-[320px]">
              <h3 className="font-semibold mb-2">Qualidade do sono</h3>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={sleepDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} labelLine={false}>
                    {sleepDist.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white/5 rounded p-4 h-[320px]">
              <h3 className="font-semibold mb-2">Energia x Motivação (semanas)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={energyMotivation}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="idx" stroke="#fff" />
                  <YAxis stroke="#fff" />
                  <Tooltip />
                  <Line type="monotone" dataKey="energia" stroke="#FF7A00" />
                  <Line type="monotone" dataKey="motivacao" stroke="#8884d8" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white/5 rounded p-4 h-[320px]">
              <h3 className="font-semibold mb-1">Adesão à alimentação</h3>
              <p className="text-xs opacity-75 mb-2">Percentual por resposta da aluna selecionada</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={foodAdherence}
                    dataKey="qtd"
                    nameKey="categoria"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    label={({ pct }: any) => `${pct}%`}
                    labelLine={false}
                  >
                    {foodAdherence.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any, _name: any, props: any) => [`${value} respostas (${props.payload.pct}%)`, props.payload.categoria]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <section>
            <h3 className="font-semibold mb-2">Respostas</h3>
            <div className="grid gap-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded p-3 cursor-pointer hover:bg-gray-100 transition-colors text-black"
                  onClick={() => setSelectedItem(it)}
                >
                  <div className="font-semibold flex items-center gap-3">
                    <button
                      className="underline decoration-brand text-left"
                      onClick={(e) => { e.stopPropagation(); setSelectedNome(it.nomeCompleto); fetchData(adminKey, it.nomeCompleto); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    >
                      {it.nomeCompleto}
                    </button>
                    <span>— {it.semanaTexto}</span>
                    <button
                      className="ml-auto text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={(e) => { e.stopPropagation(); setSelectedItem(it) }}
                    >
                      Detalhes
                    </button>
                  </div>
                  <div className="text-sm opacity-75">Força: {it.treinosForca} | Energia: {it.energiaGeral} | Sono: {it.sonoRecuperacao}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {showNamesList && (
        <section className="md:hidden bg-white rounded p-4 text-black">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Alunas (checklists enviados)</h3>
            <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setShowNamesList(false)}>Fechar</button>
          </div>
          <div className="grid gap-2">
            {nameCounts.map(([name, count]) => (
              <button
                key={name}
                className="text-left px-3 py-2 rounded bg-gray-100 hover:bg-gray-200"
                onClick={() => { setSelectedNome(name); fetchData(adminKey, name); setShowNamesList(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              >
                <span className="font-semibold">{name}</span>
                <span className="ml-2 text-sm opacity-70">({count})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedItem ? (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
           <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-2xl w-full mx-4 text-black">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-lg font-semibold">{selectedItem?.nomeCompleto ?? '—'} — {selectedItem?.semanaTexto || (selectedItem?.createdAt ? new Date(selectedItem?.createdAt as any).toLocaleDateString('pt-BR') : '')}</h4>
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setSelectedItem(null)}>Fechar</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="text-sm opacity-80">Criado em: {selectedItem?.createdAt ? new Date(selectedItem?.createdAt as any).toLocaleString('pt-BR') : '—'}</div>
              <div className="text-sm opacity-80">Treinos de força: {selectedItem?.treinosForca ?? '—'}</div>
              <div className="text-sm opacity-80">Evolução: {selectedItem?.evolucaoDesempenho ?? '—'}</div>
              <div className="text-sm opacity-80">Energia geral: {selectedItem?.energiaGeral ?? '—'}</div>
              <div className="text-sm opacity-80">Sono/recuperação: {selectedItem?.sonoRecuperacao ?? '—'}</div>
              <div className="text-sm opacity-80">Alimentação no plano: {selectedItem?.alimentacaoPlano ?? '—'}</div>
              <div className="text-sm opacity-80">Motivação/humor: {selectedItem?.motivacaoHumor ?? '—'}</div>
              <div className="text-sm opacity-80">Cardio sessões: {selectedItem?.cardioSessoes ?? '—'}</div>
              <div className="text-sm opacity-80">Tipo de cardio: {selectedItem?.tipoCardio ?? '—'}</div>
              <div className="text-sm opacity-80">Duração cardio: {selectedItem?.duracaoCardio ?? 0} min</div>
              <div className="text-sm opacity-80">Intensidade cardio: {selectedItem?.intensidadeCardio ?? '—'}</div>
              <div className="text-sm opacity-80">Dias marcados: {selectedItem?.diasMarcados?.length || 0}</div>
            </div>
            <div className="mt-3 text-sm">
              {selectedItem?.diasMarcados?.length ? (
                <div>
                  <div className="opacity-80 mb-1">Lista de dias selecionados:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem?.diasMarcados?.map((d, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-gray-200">{d}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="text-sm opacity-80">Treino não completado: {selectedItem?.treinoNaoCompletado || '—'}</div>
              <div className="text-sm opacity-80">Dor/fadiga: {selectedItem?.dorOuFadiga || '—'}</div>
              <div className="text-sm opacity-80">Ajuste próxima semana: {selectedItem?.ajusteProximaSemana || '—'}</div>
              <div className="text-sm opacity-80">Comentários adicionais: {selectedItem?.comentariosAdicionais || '—'}</div>
              {selectedItem?.whatsapp ? (
                <div className="text-sm opacity-80">WhatsApp informado: {selectedItem.whatsapp}</div>
              ) : null}
            </div>
          </div>
         </div>
       ) : null}
      {/* Modal de confirmação/exclusão */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded p-4 w-[340px] text-black shadow-lg">
            <h3 className="font-semibold mb-2">Excluir todos os dados</h3>
            <p className="text-sm mb-3">Digite a senha do administrador para confirmar a exclusão de TODOS os check-ins.</p>
            <input
              type="password"
              className="w-full px-3 py-2 rounded border border-gray-300 mb-3"
              placeholder="Senha do administrador"
              value={clearPass}
              onChange={(e) => setClearPass(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={() => setShowClearModal(false)}>Cancelar</button>
              <button className="px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white" onClick={confirmClearAll} disabled={clearing}>
                {clearing ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de envio de relatório (escolha de canais) */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white rounded p-4 w-[360px] text-black shadow-lg">
            <h3 className="font-semibold mb-2">Enviar Relatório</h3>
            <p className="text-sm mb-3">Selecione os canais para enviar o relatório do último check-in.</p>
            <div className="grid gap-2 mb-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sendEmailOpt} onChange={(e) => setSendEmailOpt(e.target.checked)} />
                <span>E-mail do treinador {adminEmail ? `( ${adminEmail} )` : '(não configurado)'}</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sendWhatsOpt} onChange={(e) => setSendWhatsOpt(e.target.checked)} />
                <span>WhatsApp do treinador {adminWhatsapp ? `( +${adminWhatsapp} )` : '(não configurado)'}</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300" onClick={() => setShowSendModal(false)}>Cancelar</button>
              <button className="brand-btn" onClick={confirmSend}>Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}