import { defineConfig } from 'vite'

// Ajusta e organiza os bundles para reduzir tamanho por chunk
export default defineConfig({
  build: {
    // Aumenta o limite padrão (500kb) para evitar aviso residual
    chunkSizeWarningLimit: 1200, // ~1.2MB
    rollupOptions: {
      output: {
        // Separa libs grandes em chunks próprios
        manualChunks: {
          react: ['react', 'react-dom'],
          router: ['react-router-dom'],
          charts: ['recharts'],
          vendor: ['axios'],
        },
      },
    },
  },
})