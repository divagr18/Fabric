import { useEffect, useRef, useState } from 'react';
import { NodeAgent } from '../transport/nodeAgent';
import { ChannelKind } from '../transport/channel';
import { deviceLabel, myPeerId } from '../transport/protocol';
import { SignalingStatus } from '../transport/signaling';
import { Log, stamp } from '../ui/Log';

export function NodePage({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState<SignalingStatus>('connecting');
  const [kind, setKind] = useState<ChannelKind>('relay');
  const [lines, setLines] = useState<string[]>([]);
  const agentRef = useRef<NodeAgent | null>(null);

  useEffect(() => {
    // Phase 2 replaces this stub with real capability consent.
    const agent = new NodeAgent(roomCode, myPeerId(), deviceLabel(), [{ name: 'echo' }]);
    agentRef.current = agent;
    agent.on('log', (l) => setLines((prev) => [...prev.slice(-199), stamp(l)]));
    agent.on('status', setStatus);
    agent.on('kind', setKind);
    agent.start();
    return () => agent.stop();
  }, [roomCode]);

  return (
    <div>
      <h1>Fabric <span className="dim">· node</span></h1>
      <p>
        <span className={`badge status-${status}`}>{status}</span>{' '}
        <span className={`badge ${kind}`}>{kind}</span>{' '}
        <span className="dim">room</span> <code>{roomCode}</code>{' '}
        <span className="dim">as</span> <code>{deviceLabel()}</code>
      </p>
      <div className="panel">
        <p style={{ margin: 0 }}>
          This browser is now a Fabric node. Keep this page open —
          the host can reach its capabilities (Phase 1: <code>echo</code>).
        </p>
      </div>
      <h2>Log</h2>
      <Log lines={lines} />
    </div>
  );
}
