import { useRef, useState } from 'react';
import { Capability } from '../transport/protocol';

/**
 * human.request — the human is a capability. The agent (via the host) can ask
 * this node's person to capture a photo, decide between options, or approve an action.
 * Always explicit, always declinable.
 */

export interface HumanRequest {
  kind: 'capture' | 'decide' | 'approve';
  prompt: string;
  options?: string[];
}

export type HumanAnswer =
  | { kind: 'capture'; file: File }
  | { kind: 'decide'; choice: string }
  | { kind: 'approve'; approved: boolean }
  | { kind: 'declined' };

interface ActiveRequest {
  req: HumanRequest;
  resolve: (a: HumanAnswer) => void;
}

/** Promise-based controller; NodePage renders the card for the active request. */
export class HumanController {
  active: ActiveRequest | null = null;
  onChange: () => void = () => {};

  request(req: HumanRequest): Promise<HumanAnswer> {
    if (this.active) return Promise.reject(new Error('a human request is already pending on this node'));
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* iOS */ }
    return new Promise((resolve) => {
      this.active = {
        req,
        resolve: (a) => {
          this.active = null;
          this.onChange();
          resolve(a);
        },
      };
      this.onChange();
    });
  }
}

export function humanCapability(): Capability {
  return {
    id: 'human',
    kind: 'human',
    name: 'human',
    detail: 'capture / decide / approve — always asks first',
    methods: ['human.request'],
  };
}

export function HumanRequestCard({ active }: { active: ActiveRequest }) {
  const { req, resolve } = active;
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.92)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div className="panel" style={{ maxWidth: 420, width: '100%' }}>
        <h2 style={{ marginTop: 0 }}>Fabric requests</h2>
        <p style={{ fontSize: 16 }}>{req.prompt}</p>

        {req.kind === 'capture' && (
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setBusy(true);
                  resolve({ kind: 'capture', file });
                }
              }}
            />
            <button style={{ width: '100%', marginBottom: 8 }} disabled={busy} onClick={() => fileInput.current?.click()}>
              📷 Take / choose photo
            </button>
          </>
        )}

        {req.kind === 'decide' && (req.options ?? []).map((opt) => (
          <button key={opt} style={{ width: '100%', marginBottom: 8 }} onClick={() => resolve({ kind: 'decide', choice: opt })}>
            {opt}
          </button>
        ))}

        {req.kind === 'approve' && (
          <button style={{ width: '100%', marginBottom: 8 }} onClick={() => resolve({ kind: 'approve', approved: true })}>
            ✓ Approve
          </button>
        )}

        <button className="dim" style={{ width: '100%' }} onClick={() => resolve(req.kind === 'approve' ? { kind: 'approve', approved: false } : { kind: 'declined' })}>
          {req.kind === 'approve' ? '✗ Deny' : 'Decline'}
        </button>
      </div>
    </div>
  );
}
