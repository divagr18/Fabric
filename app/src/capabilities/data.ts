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
  const { capId } = args as { capId?: string };
  // A stale/unknown capId (grants change between compile-time and call-time)
  // degrades to everything currently granted — still consent-only.
  const files = capId && store.getGrant(capId)
    ? store.getGrant(capId)!.files
    : store.list().flatMap((g) => g.files);
  if (files.length === 0) throw new Error('nothing is shared on this node yet');
  return {
    files: files.map((f) => ({ id: f.id, name: f.name, mime: f.mime, image: isImage(f.name) })),
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
