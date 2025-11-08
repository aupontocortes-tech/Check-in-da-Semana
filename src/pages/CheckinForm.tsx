import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitCheckin, sendReportWebhook, getProfile } from '../api'
import type { CheckinFormData } from '../types'

const initial: CheckinFormData = {
  nomeCompleto: '',
  semanaTexto: '',
  diasMarcados: [],
  treinosForca: '0',
  evolucaoDesempenho: 'Ainda não',
  treinoNaoCompletado: '',
  dorOuFadiga: '',
  cardioSessoes: '0',
  tipoCardio: '',
  duracaoCardio: '20',
  intensidadeCardio: 'Leve',
  energiaGeral: 'Média',
  sonoRecuperacao: 'Regular',
  alimentacaoPlano: 'Sim, em parte',
  motivacaoHumor: 'Boa',
  ajusteProximaSemana: '',
  comentariosAdicionais: '',
  whatsapp: '',
  fotoPerfil: '',
}

export default function CheckinForm() {
  const [data, setData] = useState<CheckinFormData>(initial)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // PWA: captura do evento para instalar como app
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (window.navigator as any).standalone
    try {
      if (deferredPrompt) {
        deferredPrompt.prompt()
        await deferredPrompt.userChoice
        setDeferredPrompt(null)
        return
      }
      // Instruções para iOS (não dispara beforeinstallprompt)
      if (isIOS && !isStandalone) {
        alert('No iPhone: toque em Compartilhar → Adicionar à Tela de Início.')
        return
      }
      alert('Para instalar, use o menu do navegador: “Adicionar à tela inicial”.')
    } catch {}
  }

  const handleChange = (field: keyof CheckinFormData, value: any) => {
    setData((d) => ({ ...d, [field]: value }))
  }

  // Foto fixa do site novamente
  const [sitePhoto, setSitePhoto] = useState<string | null>(null)
  const [adminWhatsappFromProfile, setAdminWhatsappFromProfile] = useState<string>('')
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    ;(async () => {
      try {
        const p = await getProfile({ signal })
        setSitePhoto(p.photo || null)
        setAdminWhatsappFromProfile((p.whatsapp || '').replace(/\D/g, ''))
      } catch {}
    })()
    return () => { controller.abort() }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      // 1) Salva o check-in
      await submitCheckin(data)

      // 2) Envia somente via WhatsApp: desativa e-mail; abre Click-to-Chat SEMPRE
      const adminEmail = '' // WhatsApp-only: não enviar e-mail
      // Sempre usa o perfil do servidor para garantir consistência em todos os links
      const adminWhatsappRaw = adminWhatsappFromProfile || ''
      const adminWhatsapp = (adminWhatsappRaw || '').replace(/\D/g, '') // sanitiza para formato esperado do wa.me
      // Chama backend para log/webhook/Cloud API (se configurado), mas não bloqueia UX
      try {
        await sendReportWebhook({
          ...data,
          tipo: 'checkin_submitted',
          adminEmail,
          adminWhatsapp,
        })
      } catch (_) {
        // Falha no webhook não impede abertura do WhatsApp nem confirmação
      }
      // Abrir WhatsApp com mensagem pré-preenchida (independente do webhook)
      if (adminWhatsapp) {
        const lines = [
          `Novo check-in: ${data.nomeCompleto} — ${data.semanaTexto}`,
          `Treinos de força: ${data.treinosForca}`,
          `Evolução: ${data.evolucaoDesempenho}`,
          `Energia: ${data.energiaGeral}`,
          `Sono: ${data.sonoRecuperacao}`,
          `Alimentação: ${data.alimentacaoPlano}`,
          `Cardio: ${data.cardioSessoes} sessões (${data.tipoCardio}, ${data.duracaoCardio} min, ${data.intensidadeCardio})`,
          data.treinoNaoCompletado ? `Treino não completado: ${data.treinoNaoCompletado}` : '',
          data.dorOuFadiga ? `Dor/fadiga: ${data.dorOuFadiga}` : '',
          data.ajusteProximaSemana ? `Ajuste próxima semana: ${data.ajusteProximaSemana}` : '',
          data.comentariosAdicionais ? `Comentários: ${data.comentariosAdicionais}` : '',
          (data.diasMarcados?.length ? `Dias marcados: ${data.diasMarcados.join(', ')}` : ''),
        ].filter(Boolean)
        const text = encodeURIComponent(lines.join('\n'))
        const phone = adminWhatsapp
        const apiUrl = `https://wa.me/${phone}?text=${text}`
        try { window.open(apiUrl, '_blank') } catch {}
      }
      navigate('/confirmation')
    } catch (err) {
      alert('Erro ao enviar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Calendário: estado e utilitários
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const monthLabel = useMemo(() => currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), [currentMonth])

  const daysMatrix = useMemo(() => {
    const start = new Date(currentMonth)
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    const totalDays = end.getDate()
    const firstWeekday = start.getDay() // 0=Dom
    const cells: (number | null)[] = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= totalDays; d++) cells.push(d)
    return cells
  }, [currentMonth])

  const fmtDate = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  const isMarked = (iso: string) => (data.diasMarcados || []).includes(iso)
  const toggleDay = (day: number | null) => {
    if (!day) return
    const y = currentMonth.getFullYear()
    const m = currentMonth.getMonth()
    const iso = fmtDate(y, m, day)
    setData((d) => {
      const set = new Set(d.diasMarcados || [])
      if (set.has(iso)) set.delete(iso)
      else set.add(iso)
      return { ...d, diasMarcados: Array.from(set).sort() }
    })
  }

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
          <img src="/profile-fixed.jpg?v=20251108-2" alt="Foto fixa de perfil" className="w-full h-full object-cover object-top" />
        </div>
        <h1 className="script-title text-3xl md:text-4xl">Personal Nat.</h1>
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span>Nome completo</span>
          <input className="px-3 py-2 rounded bg-white/5 border border-white/10" value={data.nomeCompleto} onChange={(e) => handleChange('nomeCompleto', e.target.value)} required />
        </label>
        <div className="grid gap-1">
          <h3 className="text-lg font-semibold">Semana de … até …</h3>
        </div>
        <div className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-2 w-[220px]">
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={prevMonth} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20">◀</button>
            <span className="font-semibold">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="px-1 py-0.5 rounded bg-white/10 hover:bg-white/20">▶</button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-white/70">
            {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {daysMatrix.map((d, i) => {
              if (d === null) return <div key={i} />
              const iso = fmtDate(currentMonth.getFullYear(), currentMonth.getMonth(), d)
              const selected = isMarked(iso)
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`relative w-8 h-8 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition ${selected ? 'ring-2 ring-blue-400' : ''}`}
                >
                  <span className="text-[11px]">{d}</span>
                  {selected && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-400" />
                  )}
                </button>
              )
            })}
          </div>
          {data.diasMarcados && data.diasMarcados.length > 0 && (
            <div className="text-xs text-white/70">
              Dias marcados: {data.diasMarcados.join(', ')}
            </div>
          )}
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Quantos treinos de força/hipertrofia você fez esta semana?</legend>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(['0','1-2','3-4','5+'] as const).map((opt) => (
            <label key={opt} className="flex items-center gap-2">
              <input type="radio" name="treinosForca" checked={data.treinosForca===opt} onChange={() => handleChange('treinosForca', opt)} />
              <span>{opt === '5+' ? '5 ou mais' : opt}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Sentiu evolução no desempenho (carga, repetições, técnica)?</legend>
        {(['Sim, bastante','Sim, um pouco','Ainda não'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="evolucao" checked={data.evolucaoDesempenho===opt} onChange={() => handleChange('evolucaoDesempenho', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <label className="grid gap-2">
        <span>Teve algum treino que não conseguiu completar? Qual e por quê?</span>
        <textarea className="px-3 py-2 rounded bg-white/5 border border-white/10" rows={3} value={data.treinoNaoCompletado} onChange={(e) => handleChange('treinoNaoCompletado', e.target.value)} />
      </label>

      <label className="grid gap-2">
        <span>Sentiu alguma dor, desconforto ou fadiga além do habitual? Se sim, onde/como?</span>
        <textarea className="px-3 py-2 rounded bg-white/5 border border-white/10" rows={3} value={data.dorOuFadiga} onChange={(e) => handleChange('dorOuFadiga', e.target.value)} />
      </label>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Quantas sessões de cardio você fez essa semana?</legend>
        {(['0','1-2','3-4','5+'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="cardioSessoes" checked={data.cardioSessoes===opt} onChange={() => handleChange('cardioSessoes', opt)} />
            <span>{opt === '5+' ? '5 ou mais' : opt}</span>
          </label>
        ))}
      </fieldset>

      <label className="grid gap-2">
        <span>Tipo de cardio feito</span>
        <input className="px-3 py-2 rounded bg-white/5 border border-white/10" value={data.tipoCardio} onChange={(e) => handleChange('tipoCardio', e.target.value)} />
      </label>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Duração média de cada sessão</legend>
        {(['20','30','45+'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="duracaoCardio" checked={data.duracaoCardio===opt} onChange={() => handleChange('duracaoCardio', opt)} />
            <span>{opt === '45+' ? '45+ min' : `${opt} min`}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Intensidade do cardio</legend>
        {(['Leve','Moderada','Alta'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="intensidadeCardio" checked={data.intensidadeCardio===opt} onChange={() => handleChange('intensidadeCardio', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Energia/disposição geral essa semana</legend>
        {(['Excelente','Boa','Média','Baixa'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="energiaGeral" checked={data.energiaGeral===opt} onChange={() => handleChange('energiaGeral', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Sono e recuperação</legend>
        {(['Muito bom','Bom','Regular','Ruim'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="sonoRecuperacao" checked={data.sonoRecuperacao===opt} onChange={() => handleChange('sonoRecuperacao', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Alimentação seguiu conforme o plano indicado?</legend>
        {(['Sim, totalmente','Sim, em parte','Não muito'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="alimentacaoPlano" checked={data.alimentacaoPlano===opt} onChange={() => handleChange('alimentacaoPlano', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="font-semibold">Motivação e humor para treinar na próxima semana</legend>
        {(['Muito alta','Boa','Média','Preciso de impulso'] as const).map((opt) => (
          <label key={opt} className="flex items-center gap-2">
            <input type="radio" name="motivacaoHumor" checked={data.motivacaoHumor===opt} onChange={() => handleChange('motivacaoHumor', opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </fieldset>

      <label className="grid gap-2">
        <span>Quer que eu ajuste algo para a próxima semana?</span>
        <textarea className="px-3 py-2 rounded bg-white/5 border border-white/10" rows={3} value={data.ajusteProximaSemana} onChange={(e) => handleChange('ajusteProximaSemana', e.target.value)} />
      </label>
      <label className="grid gap-2">
        <span>Comentários adicionais</span>
        <textarea className="px-3 py-2 rounded bg-white/5 border border-white/10" rows={3} value={data.comentariosAdicionais} onChange={(e) => handleChange('comentariosAdicionais', e.target.value)} />
      </label>
      <label className="grid gap-2">
        <span>WhatsApp (opcional)</span>
        <input className="px-3 py-2 rounded bg-white/5 border border-white/10" value={data.whatsapp} onChange={(e) => handleChange('whatsapp', e.target.value)} />
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={handleInstallClick} className="px-3 py-2 rounded bg-white/10 hover:bg-white/20">
          Instalar app
        </button>
        <button type="submit" className="brand-btn" disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar Check-in'}
        </button>
      </div>
    </form>
  )
}