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
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export function stamp(line: string): string {
  return `[${new Date().toTimeString().slice(0, 8)}] ${line}`;
}
