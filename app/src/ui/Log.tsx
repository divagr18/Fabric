import { useEffect, useRef } from 'react';

export function useLogLines() {
  const ref = useRef<string[]>([]);
  return ref;
}

export function Log({ lines }: { lines: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = el.current.scrollHeight;
  }, [lines]);
  return (
    <div className="log" ref={el}>
      {lines.map((l, i) => (
        <div key={i} className={lineClass(l)}>{l}</div>
      ))}
    </div>
  );
}

function lineClass(l: string): string {
  if (l.includes('⚡') || l.includes('🔥') || l.includes('HOT-SWAPPED')) return 'l-spark';
  if (l.includes('NODE LOST') || l.includes('✗') || l.includes('DEGRADED') || l.includes('failed')) return 'l-bad';
  if (l.includes('✓') || l.includes(' done')) return 'l-ok';
  if (l.includes('NODE JOINED') || l.includes('advertises')) return 'l-node';
  return '';
}

export function stamp(line: string): string {
  return `[${new Date().toTimeString().slice(0, 8)}] ${line}`;
}
