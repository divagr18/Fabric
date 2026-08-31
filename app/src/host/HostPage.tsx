import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Hub, NodeView } from '../transport/hub';
import { deviceLabel, makeRoomCode, myPeerId } from '../transport/protocol';
import { SignalingStatus } from '../transport/signaling';
import { WebMcpRegistry } from '../webmcp/registry';
import { installCoreSurface } from '../webmcp/surface';
import { SurfacePanel } from '../ui/SurfacePanel';
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
  const [approval, setApproval] = useState<{ what: string; resolve: (ok: boolean) => void } | null>(null);
  const [hotReloads, setHotReloads] = useState(0);
  const [stages, setStages] = useState<Array<{ id: string; method: string; node: string; status: string }>>([]);
  const hubRef = useRef<Hub | null>(null);

  const joinUrl = `${location.origin}/r/${roomCode}`;
  const registry = useMemo(() => new WebMcpRegistry(), []);

  useEffect(() => {
    const hub = new Hub(roomCode, myPeerId(), deviceLabel());
    hubRef.current = hub;
    const addLine = (l: string) => setLines((prev) => [...prev.slice(-199), stamp(l)]);
    hub.on('log', addLine);
    hub.on('nodes', setNodes);
    hub.on('status', setStatus);
    hub.start();
    registry.on((e) => {
      if (e.type === 'registered' && e.origin === 'compiled') addLine(`⚡ + ${e.name} REGISTERED via WebMCP`);
      else if (e.type === 'swapped') {
        addLine(`🔥 ${e.name} hot-swapped → v${e.version}`);
        setHotReloads((n) => n + 1);
      } else if (e.type === 'revoked') addLine(`− ${e.name} revoked`);
    });
    installCoreSurface(registry, hub, {
      onLog: addLine,
      onApprove: (what) => new Promise<boolean>((resolve) => {
        setApproval({ what, resolve: (ok) => { setApproval(null); resolve(ok); } });
      }),
      onStage: (stage, status, detail) => {
        addLine(`stage ${stage.id} [${stage.method} @ ${stage.node === 'host' ? 'host' : stage.node}] ${status}${detail ? ` — ${detail}` : ''}`);
        setStages((prev) => {
          const next = prev.filter((s) => s.id !== stage.id);
          next.push({ id: stage.id, method: stage.method, node: stage.node, status });
          return next.slice(-12);
        });
      },
      onArtifact: (a) => {
        const url = URL.createObjectURL(new Blob([a.bytes.buffer as ArrayBuffer], { type: a.mime }));
        addLine(`📄 artifact ready: ${a.name} (${(a.bytes.length / 1024).toFixed(0)}KB) — compiled locally`);
        const link = document.createElement('a');
        link.href = url;
        link.download = a.name;
        link.click();
      },
    });
    return () => hub.stop();
  }, [roomCode, registry]);

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

      <p className="dim" style={{ fontVariantNumeric: 'tabular-nums', margin: '10px 0 0' }}>
        nodes <strong style={{ color: 'var(--text)' }}>{nodes.length}</strong>
        {' · '}compiled tools <strong style={{ color: 'var(--text)' }}>{registry.list().filter((t) => t.origin === 'compiled').length}</strong>
        {' · '}hot reloads <strong style={{ color: 'var(--text)' }}>{hotReloads}</strong>
        {' · '}peer transfers <strong style={{ color: 'var(--text)' }}>{((hubRef.current?.blobs.bytesReceived ?? 0) / 1024).toFixed(0)} KB</strong>
        {' · '}raw file bytes to any cloud <strong style={{ color: 'var(--ok)' }}>0 B</strong>
      </p>

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

      <div className="row" style={{ marginTop: 16 }}>
        <SurfacePanel registry={registry} />
        {stages.length > 0 && (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Execution</h2>
            {stages.map((s) => (
              <p key={s.id} style={{ margin: '4px 0' }}>
                <span className="badge" style={{
                  color: s.status === 'done' ? 'var(--ok)' : s.status === 'failed' ? 'var(--bad)' : 'var(--accent)',
                  borderColor: s.status === 'done' ? 'var(--ok)' : s.status === 'failed' ? 'var(--bad)' : 'var(--accent)',
                }}>{s.status}</span>{' '}
                <code>{s.method}</code>{' '}
                <span className="dim">@ {s.node === 'host' ? 'host' : (nodes.find((n) => n.peerId === s.node)?.label ?? s.node)}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <h2>Log</h2>
      <Log lines={lines} />

      <div className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Try it (for reviewers)</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Open this page in <strong>ChatGPT's in-app browser</strong> (or Chrome with <code>chrome://flags/#enable-webmcp-testing</code>).</li>
          <li>Open the join link above in a <strong>new tab</strong> — that tab is now a second device. On it, click <strong>🧪 Use sample files</strong> (or share your own). A phone via the QR makes a third.</li>
          <li>Ask the agent: <em>"Call inspect_fabric — what can this fabric do?"</em></li>
          <li>Then: <em>"Compile a tool that finds photos across my devices matching a text description, and use it to find a dog."</em> Watch the tool appear in the agent's tool list mid-session, execute across the tabs, and rank the dog sample first.</li>
          <li>Close the node tab and call the tool again — it hot-reloads under the same name. That's the point.</li>
        </ol>
        <p className="dim" style={{ marginBottom: 0 }}>Every capability is explicitly shared by its device's user. Raw files never touch a server — execution goes to the data.</p>
      </div>

      {approval && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.9)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
            <h2 style={{ marginTop: 0 }}>Approval needed</h2>
            <p style={{ fontSize: 16 }}>{approval.what}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ flex: 1 }} onClick={() => approval.resolve(true)}>✓ Approve</button>
              <button style={{ flex: 1 }} onClick={() => approval.resolve(false)}>✗ Deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
