import { readFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Build : un seul fichier HTML autonome (GitHub Pages ou ouverture locale).
// Version personnelle : PROFIL_PRIVE=chemin/vers/profil.json npm run build
// intègre ce profil comme profil de départ. Sans cette variable (version publique), seul l'exemple fictif est livré.
const privateFile = process.env.PROFIL_PRIVE
const privateProfile = privateFile ? JSON.parse(readFileSync(privateFile, 'utf8')) : null

export default defineConfig({
  base: './',
  define: { __PRIVATE_PROFILE__: JSON.stringify(privateProfile) },
  plugins: [svelte(), viteSingleFile()],
})
