import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Hub, NodeView } from '../transport/hub';
import { deviceLabel, makeRoomCode, myPeerId } from '../transport/protocol';
import { SignalingStatus } from '../transport/signaling';
import { Log, stamp } from '../ui/Log';

function useRoomCode(): string {
  return useMemo(() => {
    const url = new URL(location.href);
    let code = url.searchParams.get('code')?.toUpperCase() ?? '';
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      code = makeRoomCode();
      url.searchParams.set('code', code);
      history.replaceState(null, '', url.toString());
    }
    return code;
  }, []);
}

export function HostPage() {
  const roomCode = useRoomCode();
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [lines, setLines] = useState<string[]>([]);
  const [qr, setQr] = useState<string>('');
  const hubRef = useRef<Hub | null>(null);

  const joinUrl = `${location.origin}/r/${roomCode}`;

  useEffect(() => {
    const hub = new Hub(roomCode, myPeerId(), deviceLabel());
    hubRef.current = hub;
    hub.on('log', (l) => setLines((prev) => [...prev.slice(-199), stamp(l)]));
    hub.on('nodes', setNodes);
    hub.on('status', setStatus);
    hub.start();
    return () => hub.stop();
  }, [roomCode]);

  useEffect(() => {
    QRCode.toDataURL(joinUrl, { width: 320, margin: 1 }).then(setQr).catch(() => {});
  }, [joinUrl]);

  const log = (l: string) => setLines((prev) => [...prev.slice(-199), stamp(l)]);

  async function run(label: string, fn: () => Promise<string>) {
    log(`${label}…`);
    const t0 = performance.now();
    try {
      const summary = await fn();
      log(`✓ ${label} in ${Math.round(performance.now() - t0)}ms — ${summary}`);
    } catch (err) {
      log(`✗ ${label}: ${(err as Error).message}`);
    }
  }

  function firstDataCap(node: NodeView): string {
    const cap = node.caps.find((c) => c.kind === 'data');
    if (!cap) throw new Error(`${node.label} shares no data`);
    return cap.id;
  }

  async function firstImageId(hub: Hub, node: NodeView): Promise<string> {
    const { files } = (await hub.rpc(node.peerId, 'data.list', { capId: firstDataCap(node) })) as
      { files: { id: string; name: string; image: boolean }[] };
    const img = files.find((f) => f.image);
    if (!img) throw new Error(`${node.label} shares no images`);
    return img.id;
  }

  const tests: Array<{ name: string; fn: (hub: Hub, n: NodeView) => Promise<string> }> = [
    {
      name: 'list',
      fn: async (hub, n) => {
        const { files } = (await hub.rpc(n.peerId, 'data.list', { capId: firstDataCap(n) })) as
          { files: { name: string }[] };
        return `${files.length} files: ${files.slice(0, 3).map((f) => f.name).join(', ')}…`;
      },
    },
    {
      name: 'read',
      fn: async (hub, n) => {
        const { files } = (await hub.rpc(n.peerId, 'data.list', { capId: firstDataCap(n) })) as
          { files: { id: string; name: string }[] };
        if (!files.length) throw new Error('no files shared');
        const meta = (await hub.rpc(n.peerId, 'data.read', { fileId: files[0].id })) as { transferId: string };
        const blob = await hub.blobs.waitFor(meta.transferId);
        return `↓ ${blob.name} ${(blob.bytes.length / 1024).toFixed(1)}KB from ${n.label} (peer transfer, not cloud)`;
      },
    },
    {
      name: 'embed×5',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'compute.embed', { capId: firstDataCap(n), limit: 5 })) as
          { items: unknown[]; backend: string; ms: number };
        return `${r.items.length} vectors on ${n.label}'s ${r.backend} in ${r.ms}ms (vectors only crossed the wire)`;
      },
    },
    {
      name: 'ocr',
      fn: async (hub, n) => {
        const id = await firstImageId(hub, n);
        const r = (await hub.rpc(n.peerId, 'compute.ocr', { fileIds: [id] })) as
          { items: { text: string; confidence: number }[] };
        return `"${r.items[0].text.slice(0, 60).replace(/\s+/g, ' ')}…" (${r.items[0].confidence}% conf)`;
      },
    },
    {
      name: 'capture',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'human.request', {
          kind: 'capture', prompt: 'Fabric needs a photo of the paper document.',
        })) as { kind: string; transferId?: string };
        if (r.kind !== 'capture' || !r.transferId) return 'declined by the human';
        const blob = await hub.blobs.waitFor(r.transferId);
        return `↓ ${blob.name} ${(blob.bytes.length / 1024).toFixed(1)}KB captured by ${n.label}'s human`;
      },
    },
    {
      name: 'approve',
      fn: async (hub, n) => {
        const r = (await hub.rpc(n.peerId, 'human.request', {
          kind: 'approve', prompt: 'Approve compiling the packet?',
        })) as { kind: string; approved?: boolean };
        return r.kind === 'approve' ? (r.approved ? 'APPROVED ✓' : 'DENIED ✗') : 'declined';
      },
    },
  ];

  return (
    <div>
      <h1>Fabric <span className="dim">· host</span></h1>
      <span className={`badge status-${status}`}>{status}</span>{' '}
      <span className="dim">room</span> <code>{roomCode}</code>

      <div className="row" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Join this fabric</h2>
          {qr && <img className="qr" src={qr} alt={`QR code for ${joinUrl}`} />}
          <p>
            <code>{joinUrl}</code>
          </p>
          <p className="dim">Scan with a phone, or open in a new tab — every browser becomes a node.</p>
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Nodes ({nodes.length})</h2>
          {nodes.length === 0 && <p className="dim">none yet — waiting</p>}
          <div className="nodes-grid">
            {nodes.map((n) => (
              <div key={n.peerId} className={`node-card${n.alive ? '' : ' stale'}`}>
                <strong>{n.label}</strong>
                <span>
                  <span className={`badge ${n.kind}`}>{n.kind}</span>{' '}
                  {!n.alive && <span className="badge">stale</span>}
                </span>
                <span>
                  {n.caps.map((c) => (
                    <span key={c.id} className="badge" title={c.detail} style={{ marginRight: 4, marginBottom: 4 }}>
                      {c.name}
                    </span>
                  ))}
                  {n.caps.length === 0 && <span className="dim">nothing shared yet</span>}
                </span>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {tests.map((t) => (
                    <button
                      key={t.name}
                      style={{ padding: '4px 8px', fontSize: 12 }}
                      onClick={() => run(`${t.name} @ ${n.label}`, () => t.fn(hubRef.current!, n))}
                    >
                      {t.name}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2>Log</h2>
      <Log lines={lines} />
    </div>
  );
}
