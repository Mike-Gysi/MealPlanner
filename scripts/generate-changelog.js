import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const log = execSync('git log --pretty=format:"%h|%ad|%s" --date=short', {
  encoding: 'utf8',
  cwd: root,
}).trim()

const entries = log.split('\n').map(line => {
  const [hash, date, ...rest] = line.split('|')
  return { hash, date, message: rest.join('|') }
})

const content = `export interface ChangelogEntry {
  hash: string
  date: string
  message: string
}

export const CHANGELOG: ChangelogEntry[] = ${JSON.stringify(entries, null, 2)}
`

writeFileSync(resolve(root, 'src/lib/changelog.ts'), content)
console.log(`Changelog updated: ${entries.length} entries`)
