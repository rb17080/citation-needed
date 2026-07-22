import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plain Vite + React. Netlify functions/edge run via `netlify dev` (or in prod);
// `vite` alone serves the front end, which is all the canned demo needs.
export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
})
