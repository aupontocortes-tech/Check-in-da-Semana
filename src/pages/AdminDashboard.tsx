import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCheckins, generatePdfReport, sendReportWebhook, adminLogin, clearAllData } from '../api'
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

  useEffect(() => {
    // Exigir login sempre: não faz auto-login e limpa credenciais salvas
    localStorage.removeItem('ADMIN_KEY')
    localStorage.removeItem('ADMIN_USER')
    const storedEmail = localStorage.getItem('ADMIN_EMAIL')
    setAdminEmail(storedEmail || (import.meta.env.VITE_DEFAULT_ADMIN_EMAIL as string) || '')
    const storedWhatsapp = localStorage.getItem('ADMIN_WHATSAPP')
    setAdminWhatsapp(storedWhatsapp || (import.meta.env.VITE_DEFAULT_ADMIN_WHATSAPP as string) || '')
  }, [])

  const fetchData = async (key: string, nome?: string) => {
    const data = await listCheckins({ adminKey: key, nome: nome || undefined })
    setItems(data)
    if (!nome) setAllItems(data)
  }

  const handleLogin = async () => {
    const user = adminUser.trim()
    const pass = adminKey.trim()
    if (!user || !pass) return alert('Informe usuário e senha')
    try {
      const resp = await adminLogin({ username: user, password: pass })
      if (!resp.ok) throw new Error('invalid')
      // Não persistir sessão: exigir login sempre
      await fetchData(pass)
      setOk(true)
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
        const msg = encodeURIComponent(lines.join('\n'))
        const url = `https://wa.me/${phone}?text=${msg}`
        try { window.location.href = url } catch {}
      }
    }
    alert(`Relatório enviado${useEmail ? ' por e-mail' : ''}${useWhats ? (useEmail ? ' e WhatsApp' : ' por WhatsApp') : ''}!`)
  }

  if (!ok) {
    return (
      <div className="max-w-md space-y-4">
        <h2 className="text-xl font-bold">Acesso restrito</h2>
        <p>Informe usuário e senha do professor para entrar.</p>
        <input type="text" className="px-3 py-2 rounded bg-white border border-gray-200 w-full text-black" placeholder="Usuário (ex: professor)" value={adminUser} onChange={(e) => setAdminUser(e.target.value)} />
        <input type="password" className="px-3 py-2 rounded bg-white border border-gray-200 w-full text-black" placeholder="Senha" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
        <button className="brand-btn" onClick={handleLogin}>Entrar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <Link to="/" className="brand-btn">Voltar</Link>
        <div className="flex items-end gap-3">
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
                <input className="px-3 py-2 rounded bg-white/5 border border-white/10" placeholder="ex: 5599999999999" value={adminWhatsapp} onChange={(e) => setAdminWhatsapp(e.target.value)} />
              </label>
            </div>
            <div className="mt-3">
              <button className="brand-btn" onClick={() => { localStorage.setItem('ADMIN_EMAIL', adminEmail); localStorage.setItem('ADMIN_WHATSAPP', adminWhatsapp); alert('Contato salvo!') }}>Salvar</button>
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
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
          </section>

          <section className="grid gap-6 md:grid-cols-2">
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
          </section>

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

      {/* Lista de nomes para mobile (abre pelo ícone 👥) */}
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

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-2xl w-full mx-4 text-black">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-lg font-semibold">{selectedItem.nomeCompleto} — {selectedItem.semanaTexto || (selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleDateString('pt-BR') : '')}</h4>
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setSelectedItem(null)}>Fechar</button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="text-sm opacity-80">Criado em: {selectedItem.createdAt ? new Date(selectedItem.createdAt).toLocaleString('pt-BR') : '—'}</div>
              <div className="text-sm opacity-80">Treinos de força: {selectedItem.treinosForca}</div>
              <div className="text-sm opacity-80">Evolução: {selectedItem.evolucaoDesempenho}</div>
              <div className="text-sm opacity-80">Energia geral: {selectedItem.energiaGeral}</div>
              <div className="text-sm opacity-80">Sono/recuperação: {selectedItem.sonoRecuperacao}</div>
              <div className="text-sm opacity-80">Alimentação no plano: {selectedItem.alimentacaoPlano}</div>
              <div className="text-sm opacity-80">Motivação/humor: {selectedItem.motivacaoHumor}</div>
              <div className="text-sm opacity-80">Cardio sessões: {selectedItem.cardioSessoes}</div>
              <div className="text-sm opacity-80">Tipo de cardio: {selectedItem.tipoCardio}</div>
              <div className="text-sm opacity-80">Duração cardio: {selectedItem.duracaoCardio} min</div>
              <div className="text-sm opacity-80">Intensidade cardio: {selectedItem.intensidadeCardio}</div>
              <div className="text-sm opacity-80">Dias marcados: {selectedItem.diasMarcados?.length || 0}</div>
            </div>
            <div className="mt-3 text-sm">
              {selectedItem.diasMarcados?.length ? (
                <div>
                  <div className="opacity-80 mb-1">Lista de dias selecionados:</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.diasMarcados.map((d, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-gray-200">{d}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2">
              <div className="text-sm opacity-80">Treino não completado: {selectedItem.treinoNaoCompletado || '—'}</div>
              <div className="text-sm opacity-80">Dor/fadiga: {selectedItem.dorOuFadiga || '—'}</div>
              <div className="text-sm opacity-80">Ajuste próxima semana: {selectedItem.ajusteProximaSemana || '—'}</div>
              <div className="text-sm opacity-80">Comentários adicionais: {selectedItem.comentariosAdicionais || '—'}</div>
              {selectedItem.whatsapp ? (
                <div className="text-sm opacity-80">WhatsApp informado: {selectedItem.whatsapp}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
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