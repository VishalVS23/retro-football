/**
 * Save section inside the ⚙ panel: shows save info, Export (download .json) and Import.
 * Lives in the debug panel for now; it moves to a proper settings menu in a later stage.
 */
import { SaveError, exportFileName, parseSave, serializeSave } from '../save/saveFormat';
import { getSave, isPersisted, replaceSave } from '../save/saveSession';

function describe(): string {
  const s = getSave();
  const created = new Date(s.createdAt).toLocaleDateString();
  const warn = isPersisted() ? '' : ' · ⚠ not stored on this device';
  return `v${s.version} · seed ${s.seed} · opened ${s.sessions}× · since ${created}${warn}`;
}

async function exportSave(flash: (t: string) => void) {
  const text = serializeSave(getSave());
  const name = exportFileName();
  const file = new File([text], name, { type: 'application/json' });

  // On phones, the share sheet is the reliable way to "Save to Files" (esp. iPhone home-screen apps).
  // "Primary pointer is a finger" = phone/tablet; touchscreen laptops still get a normal download.
  const phone = window.matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'retro-football save' });
      flash('Save shared');
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // user closed the share sheet
      // anything else: fall through to a normal download
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  flash('Save downloaded');
}

export function addSaveControls(panel: HTMLElement, flash: (t: string) => void) {
  const section = document.createElement('div');
  section.className = 'fp-save';
  section.innerHTML = `
    <h3>Save</h3>
    <div class="fp-save-info"></div>
    <div class="fp-buttons">
      <button data-save="export">Export save</button>
      <button data-save="import">Import save</button>
    </div>
  `;
  const info = section.querySelector<HTMLDivElement>('.fp-save-info')!;
  const refresh = () => (info.textContent = describe());
  refresh();

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.hidden = true;
  section.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ''; // allow picking the same file again later
    if (!file) return;
    try {
      const save = parseSave(await file.text());
      if (!window.confirm('Replace your current save with this file? (Your current save goes into the backups.)')) return;
      await replaceSave(save);
      refresh();
      flash('Save loaded');
      // Restart so the loaded save's game in progress (if any) is offered with CONTINUE.
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      const msg = err instanceof SaveError ? err.message : 'Could not load that file.';
      window.alert(msg);
    }
  });

  section.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.save;
    if (act === 'export') void exportSave(flash);
    if (act === 'import') fileInput.click();
  });

  panel.querySelector('.fp-buttons')!.after(section);
}
