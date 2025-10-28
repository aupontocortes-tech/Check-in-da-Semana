// Service Worker mínimo para habilitar instalação PWA
// Mantém o controle dos clientes sem estratégias de cache agressivas
self.addEventListener('install', (event) => {
  // Ativa imediatamente
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Assume controle de páginas abertas
  event.waitUntil(self.clients.claim())
})

// Pass-through: não intercepta requisições (pode ser expandido futuramente)
self.addEventListener('fetch', () => {})