const PATHS: Record<string, string> = {
  logo: 'M4 17l6-6 4 4 6-8M14 7h6v6',
  send: 'M5 12h14M13 6l6 6-6 6',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z',
  alert: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  check: 'M5 12l4 4 10-10',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  db: 'M12 9c3.9 0 7-1.3 7-3s-3.1-3-7-3-7 1.3-7 3 3.1 3 7 3zM5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6',
  doc: 'M6 3h9l4 4v14H6zM9 12h6M9 16h4',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M9 15l2 2 4-4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

export function Icon({ name, size = 16, stroke = 'currentColor', width = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: `0 0 ${size}px` }}>
      <path d={PATHS[name]} />
    </svg>
  );
}
