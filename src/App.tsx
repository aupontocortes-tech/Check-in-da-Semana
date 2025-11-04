import React, { useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import CheckinForm from './pages/CheckinForm'
import AdminDashboard from './pages/AdminDashboard'
import Confirmation from './pages/Confirmation'
import { syncLocalCheckins } from './api'

function App() {
  useEffect(() => {
    // Sincroniza em segundo plano check-ins que foram salvos offline
    ;(async () => {
      try { await syncLocalCheckins() } catch {}
    })()
  }, [])
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gradient-to-r from-brand to-brand-dark border-b border-gray-800 shadow-brand">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            Check-in da Semana 💥
          </h1>
          <Link 
            to="/admin" 
            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            Admin
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<CheckinForm />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/confirmation" element={<Confirmation />} />
        </Routes>
      </main>
    </div>
  )
}

export default App