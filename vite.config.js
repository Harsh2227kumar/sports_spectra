import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'supabase-env-handler',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/get-supabase-env' && req.method === 'GET') {
            try {
              const envPath = path.resolve(process.cwd(), '.env')
              let url = ''
              let key = ''
              if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8')
                const urlMatch = content.match(/^VITE_SUPABASE_URL=(.*)$/m)
                const keyMatch = content.match(/^VITE_SUPABASE_ANON_KEY=(.*)$/m)
                if (urlMatch) url = urlMatch[1].trim()
                if (keyMatch) key = keyMatch[1].trim()
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ url, key }))
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: err.message }))
            }
            return
          }

          if (req.url === '/api/save-supabase-env' && req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const { url, key } = JSON.parse(body || '{}')
                const envPath = path.resolve(process.cwd(), '.env')
                let envContent = ''
                if (fs.existsSync(envPath)) {
                  envContent = fs.readFileSync(envPath, 'utf8')
                }
                const cleanUrl = (url || '').trim().replace(/\/+$/, '')
                const cleanKey = (key || '').trim()

                // Replace or append VITE_SUPABASE_URL
                if (/^VITE_SUPABASE_URL=.*/m.test(envContent)) {
                  envContent = envContent.replace(/^VITE_SUPABASE_URL=.*/m, `VITE_SUPABASE_URL=${cleanUrl}`)
                } else {
                  envContent += `\nVITE_SUPABASE_URL=${cleanUrl}`
                }

                // Replace or append VITE_SUPABASE_ANON_KEY
                if (/^VITE_SUPABASE_ANON_KEY=.*/m.test(envContent)) {
                  envContent = envContent.replace(/^VITE_SUPABASE_ANON_KEY=.*/m, `VITE_SUPABASE_ANON_KEY=${cleanKey}`)
                } else {
                  envContent += `\nVITE_SUPABASE_ANON_KEY=${cleanKey}`
                }

                fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8')
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ success: true, url: cleanUrl }))
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: err.message }))
              }
            })
            return
          }

          next()
        })
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
})
