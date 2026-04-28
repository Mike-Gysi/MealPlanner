import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'

function getChangelog() {
  try {
    const out = execSync('git log --pretty=format:"%H|%ad|%s" --date=short', { encoding: 'utf8' })
    return out.trim().split('\n').map(line => {
      const [hash, date, ...rest] = line.split('|')
      return { hash: hash.slice(0, 7), date, message: rest.join('|') }
    })
  } catch {
    return []
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __CHANGELOG__: JSON.stringify(getChangelog()),
  },
})
