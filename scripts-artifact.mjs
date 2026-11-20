// Transforme dist/index.html en page pour l'Artifact claude.ai (sans doctype/html/head/body).
// La politique de sécurité (CSP) est retirée : dans claude.ai, c'est la page hôte qui l'applique.
import { readFileSync, writeFileSync } from 'node:fs';
let h = readFileSync('dist/index.html', 'utf8');
h = h.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body>/gi, '')
     .replace(/<meta charset="UTF-8" \/>/, '').replace(/<meta name="viewport"[^>]*>/, '')
     .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/<!-- Aucune donnée[^>]*-->/, '');
writeFileSync(process.argv[2], h.trim() + '\n');
