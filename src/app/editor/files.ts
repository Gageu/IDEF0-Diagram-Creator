/** Browser file helpers: the only place the editor touches downloads, file pickers and local storage. */

export function downloadText(fileName: string, text: string, mimeType: string): void {
  download(fileName, new Blob([text], { type: mimeType }));
}

export function downloadBytes(fileName: string, bytes: Uint8Array<ArrayBuffer>, mimeType: string): void {
  download(fileName, new Blob([bytes], { type: mimeType }));
}

function download(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Asks the user for one file and resolves with its text, or undefined if they cancel. */
export function pickTextFile(accept: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(undefined);
      else void file.text().then(resolve);
    };
    input.oncancel = () => resolve(undefined);
    input.click();
  });
}

export function fileNameFor(modelName: string, extension: string): string {
  const slug = modelName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'idef0-model'}.${extension}`;
}

const DRAFT_KEY = 'idef0-diagram-creator.draft';

/** The work in progress, kept across page reloads. Storage can be unavailable, so both calls may quietly do nothing. */
export function readDraft(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(DRAFT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeDraft(text: string): void {
  try {
    globalThis.localStorage?.setItem(DRAFT_KEY, text);
  } catch {
    // A full or blocked store only costs the reload convenience.
  }
}
