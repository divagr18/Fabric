import { Capability } from '../transport/protocol';

/**
 * GrantStore — what THIS node's user has explicitly chosen to share.
 * Folder grants via showDirectoryPicker (desktop), photo grants via file input (phone).
 * Every change re-advertises; nothing is readable that wasn't granted.
 */

export interface GrantedFile {
  id: string;       // `${capId}#${index}`
  name: string;
  mime: string;
  getFile(): Promise<File>;
}

export interface Grant {
  capId: string;
  name: string;
  kind: 'folder' | 'photos' | 'samples';
  files: GrantedFile[];
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
const INDEXABLE_EXT = /\.(jpe?g|png|webp|gif|bmp|pdf|txt|md|csv|json)$/i;
const MAX_FILES_PER_GRANT = 5000;
const MAX_DEPTH = 5;

export function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', pdf: 'application/pdf', txt: 'text/plain',
    md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

export function isImage(name: string): boolean {
  return IMAGE_EXT.test(name);
}

async function indexDirectory(dir: FileSystemDirectoryHandle, capId: string): Promise<GrantedFile[]> {
  const out: GrantedFile[] = [];
  async function walk(handle: FileSystemDirectoryHandle, depth: number) {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES_PER_GRANT) return;
    for await (const entry of handle.values()) {
      if (out.length >= MAX_FILES_PER_GRANT) return;
      if (entry.kind === 'file' && INDEXABLE_EXT.test(entry.name)) {
        const fileHandle = entry as FileSystemFileHandle;
        out.push({
          id: `${capId}#${out.length}`,
          name: entry.name,
          mime: guessMime(entry.name),
          getFile: () => fileHandle.getFile(),
        });
      } else if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, depth + 1);
      }
    }
  }
  await walk(dir, 0);
  return out;
}

export class GrantStore {
  private grants = new Map<string, Grant>();
  private listeners: Array<() => void> = [];

  onChange(cb: () => void) {
    this.listeners.push(cb);
  }

  private changed() {
    for (const cb of this.listeners) cb();
  }

  list(): Grant[] {
    return [...this.grants.values()];
  }

  async addFolder(): Promise<Grant> {
    const dir = await (window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    const capId = `data:${dir.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'folder'}-${this.grants.size}`;
    const files = await indexDirectory(dir, capId);
    const grant: Grant = { capId, name: `${dir.name}/`, kind: 'folder', files };
    this.grants.set(capId, grant);
    this.changed();
    return grant;
  }

  addPhotos(picked: FileList | File[]): Grant {
    return this.addFiles([...picked], 'selected photos', 'photos');
  }

  addFiles(picked: File[], label: string, kind: 'photos' | 'samples' = 'photos'): Grant {
    const capId = `data:${kind}-${this.grants.size}`;
    const files: GrantedFile[] = picked.map((f, i) => ({
      id: `${capId}#${i}`,
      name: f.name,
      mime: f.type || guessMime(f.name),
      getFile: () => Promise.resolve(f),
    }));
    const grant: Grant = { capId, name: label, kind, files };
    this.grants.set(capId, grant);
    this.changed();
    return grant;
  }

  revoke(capId: string) {
    if (this.grants.delete(capId)) this.changed();
  }

  getGrant(capId: string): Grant | undefined {
    return this.grants.get(capId);
  }

  getFile(fileId: string): GrantedFile | undefined {
    const capId = fileId.split('#')[0];
    return this.grants.get(capId)?.files.find((f) => f.id === fileId);
  }

  /** Data capabilities to advertise for current grants. */
  capabilities(): Capability[] {
    return this.list().map((g) => ({
      id: g.capId,
      kind: 'data',
      name: g.name,
      detail: `${g.files.length} file${g.files.length === 1 ? '' : 's'} shared`,
      methods: ['data.list', 'data.read', 'compute.embed', 'compute.ocr'],
    }));
  }
}

export const supportsFolders = 'showDirectoryPicker' in window;
