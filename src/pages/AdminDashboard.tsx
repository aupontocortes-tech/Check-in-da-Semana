import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCheckins, generatePdfReport, sendReportWebhook, adminLogin } from '../api'
import type { CheckinFormData, SleepOption, EnergyOption, MotivationOption } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid } from 'recharts'

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

  useEffect(() => {
    const stored = localStorage.getItem('ADMIN_KEY')
    if (stored) {
      setAdminKey(stored)
      ;(async () => {
        try {
          await fetchData(stored)
          setOk(true)
        } catch (e) {
          setOk(false)
          localStorage.removeItem('ADMIN_KEY')
        }
      })()
    }
    const storedUser = localStorage.getItem('ADMIN_USER')
    if (storedUser) setAdminUser(storedUser)
    const storedEmail = localStorage.getItem('ADMIN_EMAIL')
    if (storedEmail) setAdminEmail(storedEmail)
    const storedWhatsapp = localStorage.getItem('ADMIN_WHATSAPP')
    if (storedWhatsapp) setAdminWhatsapp(storedWhatsapp)
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
      // Persist minimal session locally
      localStorage.setItem('ADMIN_USER', user)
      localStorage.setItem('ADMIN_KEY', pass)
      await fetchData(pass)
      setOk(true)
    } catch (e) {
      alert('Usuário ou senha inválidos')
      setOk(false)
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

  const sendEmail = async () => {
    if (!items.length) return alert('Sem dados')
    const latest = items[0]
    await sendReportWebhook({ ...latest, tipo: 'weekly_report', adminEmail, adminWhatsapp })
    alert('Relatório enviado (via webhook)!')
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
          <button className="brand-btn" onClick={sendEmail}>Enviar Relatório</button>
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
        <div className="bg-white/5 rounded p-4">
          <h3 className="font-semibold mb-2">Treinos por semana (aluna)</h3>
          <BarChart width={400} height={240} data={treinosPorSemana}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="semana" stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip />
            <Bar dataKey="count" fill="#FF7A00" />
          </BarChart>
        </div>

        <div className="bg-white/5 rounded p-4">
          <h3 className="font-semibold mb-2">Qualidade do sono</h3>
          <PieChart width={400} height={240}>
            <Pie data={sleepDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
              {sleepDist.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Legend />
          </PieChart>
        </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
        <div className="bg-white/5 rounded p-4">
          <h3 className="font-semibold mb-2">Energia x Motivação (semanas)</h3>
          <LineChart width={400} height={240} data={energyMotivation}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="idx" stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip />
            <Line type="monotone" dataKey="energia" stroke="#FF7A00" />
            <Line type="monotone" dataKey="motivacao" stroke="#8884d8" />
          </LineChart>
        </div>
        <div className="bg-white/5 rounded p-4">
          <h3 className="font-semibold mb-1">Adesão à alimentação</h3>
          <p className="text-xs opacity-75 mb-2">Percentual por resposta da aluna selecionada</p>
          <PieChart width={400} height={240}>
            <Pie
              data={foodAdherence}
              dataKey="qtd"
              nameKey="categoria"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              label={({ pct }: any) => `${pct}%`}
            >
              {foodAdherence.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any, _name: any, props: any) => [`${value} respostas (${props.payload.pct}%)`, props.payload.categoria]} />
            <Legend />
          </PieChart>
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
    </div>
  )
}