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

  async function echoTest(node: NodeView) {
    const hub = hubRef.current;
    if (!hub) return;
    setLines((prev) => [...prev, stamp(`echo → ${node.label} (${node.kind})…`)]);
    try {
      const t0 = performance.now();
      const result = await hub.rpc(node.peerId, 'echo', { hello: 'fabric', n: Math.floor(Math.random() * 1000) });
      const ms = Math.round(performance.now() - t0);
      setLines((prev) => [...prev, stamp(`echo ✓ ${node.label} in ${ms}ms: ${JSON.stringify(result)}`)]);
    } catch (err) {
      setLines((prev) => [...prev, stamp(`echo ✗ ${node.label}: ${(err as Error).message}`)]);
    }
  }

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
                <span className="dim">caps: {n.caps.map((c) => c.name).join(', ') || '—'}</span>
                <button onClick={() => echoTest(n)}>Echo test</button>
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
