<script lang="ts">
  import { exampleState, newProfile, offerFile, parseImport, saveTx, wipeAll, type ExportFile, type ProfileState, type Store } from '../profile';
  import type { Tx } from '../import/csv';

  let {
    store = $bindable(),
    st,
    txs,
    switchProfile,
    persist,
  }: { store: Store; st: ProfileState; txs: Tx[]; switchProfile: (id: string) => void; persist: () => void } = $props();

  let msg = $state('');
  let withTx = $state(false);
  let confirmWipe = $state(false);
  let confirmDelete = $state('');
  let pasted = $state('');

  const active = $derived(store.profiles.find((p) => p.id === store.activeId)!);

  function add(name: string, state: ProfileState, transactions: Tx[] = []) {
    const p = newProfile(name, state);
    store.profiles.push(p);
    if (transactions.length) saveTx(p.id, transactions);
    persist();
    switchProfile(p.id);
  }
  function fileName(name: string) {
    return `simulateur-famille-${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profil'}.json`;
  }
  async function exportProfile() {
    const data: ExportFile = { app: 'simulateur-famille', version: 3, name: active.name, exported: new Date().toISOString(), state: $state.snapshot(st) as ProfileState };
    if (withTx) data.transactions = $state.snapshot(txs) as Tx[];
    const r = await offerFile(fileName(active.name), JSON.stringify(data, null, 1), 'application/json');
    msg = r === 'ok' ? 'Fichier proposé à l’enregistrement. Gardez-le dans un endroit sûr : il contient vos chiffres.' : r === 'declined' ? 'Enregistrement annulé.' : 'Ce navigateur ne permet pas le téléchargement ici : utilisez « Copier en texte ».';
  }
  async function copyText() {
    const data: ExportFile = { app: 'simulateur-famille', version: 3, name: active.name, exported: new Date().toISOString(), state: $state.snapshot(st) as ProfileState };
    pasted = JSON.stringify(data);
    try {
      await navigator.clipboard.writeText(pasted);
      msg = 'Profil copié dans le presse-papiers.';
    } catch {
      msg = 'Copie automatique refusée : sélectionnez le texte ci-dessous et copiez-le.';
    }
  }
  async function importFile(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    try {
      const r = parseImport(await f.text());
      add(r.name, r.state, r.transactions);
      msg = `Profil « ${r.name} » importé${r.transactions.length ? ` avec ${r.transactions.length} opérations` : ''}. Il est maintenant enregistré dans ce navigateur.`;
    } catch {
      msg = 'Ce fichier n’est pas un profil du simulateur.';
    }
  }
  function importText() {
    try {
      const r = parseImport(pasted);
      add(r.name, r.state, r.transactions);
      msg = `Profil « ${r.name} » importé.`;
    } catch {
      msg = 'Ce texte n’est pas un profil valide.';
    }
  }
  function remove(id: string) {
    if (confirmDelete !== id) {
      confirmDelete = id;
      return;
    }
    confirmDelete = '';
    saveTx(id, []);
    store.profiles = store.profiles.filter((p) => p.id !== id);
    if (!store.profiles.length) store.profiles.push(newProfile('Exemple', exampleState()));
    persist();
    if (store.activeId === id) switchProfile(store.profiles[0].id);
  }
  function wipe() {
    if (!confirmWipe) {
      confirmWipe = true;
      return;
    }
    wipeAll();
    location.reload();
  }
</script>

<main class="wrap prof">
  <section class="panel">
    <h2>Vos profils</h2>
    <p class="hint">Un profil contient un ménage, ses scénarios, son budget, ses règles de classement et ses relevés importés. Tout est enregistré dans ce navigateur, sur cet appareil.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Profil</th><th>Modifié</th><th></th></tr></thead>
        <tbody>
          {#each store.profiles as p (p.id)}
            <tr class:sel={p.id === store.activeId}>
              <td><input aria-label="Nom du profil" bind:value={p.name} onchange={persist} /></td>
              <td class="muted">{new Date(p.updated).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}</td>
              <td class="actions">
                {#if p.id !== store.activeId}<button onclick={() => switchProfile(p.id)}>Ouvrir</button>{:else}<span class="muted">ouvert</span>{/if}
                <button class="ghost" onclick={() => remove(p.id)}>{confirmDelete === p.id ? 'Confirmer la suppression' : 'Supprimer'}</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="row">
      <button onclick={() => add('Mon ménage', exampleState())}>Nouveau profil (à partir de l’exemple)</button>
      <button onclick={() => add(`${active.name} (copie)`, structuredClone($state.snapshot(st) as ProfileState), $state.snapshot(txs) as Tx[])}>Dupliquer le profil ouvert</button>
    </div>
  </section>

  <div class="two">
    <section class="panel">
      <h2>Sauvegarder ou changer d’appareil</h2>
      <p class="hint">Le fichier exporté reste chez vous : gardez-le comme une sauvegarde, ou ouvrez-le sur un autre ordinateur avec « Importer un profil ».</p>
      <label class="check"><input type="checkbox" bind:checked={withTx} /> Inclure les {txs.length} opérations bancaires</label>
      <div class="row">
        <button onclick={exportProfile}>Exporter « {active.name} »</button>
        <button class="ghost" onclick={copyText}>Copier en texte</button>
      </div>
      <label class="filebtn">
        <span>Importer un profil (.json)</span>
        <input type="file" accept=".json,application/json" onchange={(e) => importFile(e.currentTarget.files)} />
      </label>
      <textarea rows="3" bind:value={pasted} placeholder="…ou collez ici le texte d’un profil"></textarea>
      <button onclick={importText} disabled={!pasted.trim()}>Importer le texte collé</button>
      {#if msg}<p class="hint" role="status">{msg}</p>{/if}
    </section>

    <section class="panel">
      <h2>Vos données restent chez vous</h2>
      <ul class="facts">
        <li>Le simulateur ne fait aucune requête réseau avec vos données : pas de serveur, pas de compte, pas de statistiques, pas de police ou de script externe. La version autonome l’impose au navigateur (politique de sécurité « connect-src 'none' »).</li>
        <li>Vos profils et vos relevés sont dans le stockage local de ce navigateur. Une autre personne sur un autre appareil ne les voit pas, même avec le même lien.</li>
        <li>La version publique ne contient qu’un exemple fictif. Vos chiffres n’y entrent que si vous les saisissez ou importez vous-même.</li>
        <li>Navigation privée ou nettoyage du navigateur : les données peuvent disparaître. Exportez votre profil de temps en temps.</li>
        <li>Sur un ordinateur partagé, effacez vos données après usage.</li>
      </ul>
      <button class="danger" onclick={wipe}>{confirmWipe ? 'Confirmer : tout effacer de ce navigateur' : 'Effacer toutes mes données de ce navigateur'}</button>
    </section>
  </div>
</main>

<style>
  .wrap { max-width: 1240px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  .prof { display: grid; gap: 16px; padding-block: 20px 48px; }
  .panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; display: grid; gap: 12px; min-width: 0; align-content: start; }
  .hint { font-size: 0.82rem; color: var(--muted); }
  .muted { color: var(--muted); font-size: 0.85rem; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { text-align: left; font-weight: 600; color: var(--muted); font-size: 0.78rem; border-bottom: 1px solid var(--line); padding: 6px 8px; }
  td { padding: 6px 8px; border-bottom: 1px solid var(--line); }
  tr.sel { background: var(--calc-soft); }
  td input { width: 100%; min-width: 10em; }
  .actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; white-space: nowrap; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .check { display: inline-flex; gap: 6px; align-items: center; font-size: 0.9rem; }
  .filebtn { display: grid; gap: 4px; font-size: 0.9rem; }
  textarea { width: 100%; font-family: ui-monospace, monospace; font-size: 0.78rem; }
  .facts { margin: 0; padding-left: 1.1em; display: grid; gap: 6px; font-size: 0.88rem; }
  .ghost { border-color: transparent; color: var(--muted); padding: 4px 6px; }
  .danger { color: var(--neg); border-color: var(--neg); justify-self: start; }
  h2 { font-size: 1.15rem; }
</style>
