import { useEffect, useState } from 'react'
import { getProfile } from '../api'

export default function Confirmation() {
  const [photo, setPhoto] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    ;(async () => {
      try {
        const p = await getProfile({ signal })
        setPhoto(p.photo || null)
      } catch {}
    })()
    return () => { controller.abort() }
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="festive-wreath-wrap">
          <div className="relative z-10 w-24 h-24 rounded-full bg-white/10 border border-white/20 overflow-hidden flex items-center justify-center">
            <img src="/profile-fixed.jpg?v=20251108-2" alt="Foto fixa de perfil" className="w-full h-full object-cover object-top" />
          </div>
        </div>
        <h2 className="script-title text-4xl md:text-5xl festive-title"><span className="festive-word"><span className="festive-p">P</span>ersonal Nat.</span></h2>
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold">💪 Obrigado pelo seu check-in!</h3>
        <p>Sua evolução está sendo registrada. Continue firme e focada! 🔥</p>
      </div>
    </div>
  )
}