import { GrantStore, isImage } from './grants';
import { PeerLink } from '../transport/channel';
import { sendBlob } from '../transport/blob';

export interface FileEntry {
  id: string;
  name: string;
  mime: string;
  image: boolean;
}

/** data.list — file listing for one granted capability (metadata only, no bytes). */
export function dataList(store: GrantStore, args: unknown): { files: FileEntry[] } {
  const { capId } = args as { capId: string };
  const grant = store.getGrant(capId);
  if (!grant) throw new Error(`no grant ${capId} — the user has not shared it`);
  return {
    files: grant.files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, image: isImage(f.name) })),
  };
}

/** data.read — starts a blob transfer of one granted file back to the caller; returns transfer metadata. */
export async function dataRead(
  store: GrantStore,
  link: PeerLink,
  args: unknown,
): Promise<{ transferId: string; name: string; mime: string; size: number }> {
  const { fileId } = args as { fileId: string };
  const gf = store.getFile(fileId);
  if (!gf) throw new Error(`no granted file ${fileId}`);
  const file = await gf.getFile();
  const transferId = await sendBlob(link, { name: gf.name, mime: gf.mime, arrayBuffer: () => file.arrayBuffer() });
  return { transferId, name: gf.name, mime: gf.mime, size: file.size };
}
