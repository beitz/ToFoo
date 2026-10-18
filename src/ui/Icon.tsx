/** Small inline SVG icons (stroke-based, inherit currentColor). */
const paths: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-6h3v6h5V10',
  diary: 'M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15H7a1.5 1.5 0 0 1-1.5-1.5V4A.5.5 0 0 1 6 3.5zM9 8h6M9 12h6M5.5 18.5A1.5 1.5 0 0 1 7 17h11.5',
  recipes: 'M4 10h16v2a8 8 0 0 1-16 0zM12 4v3M8 5v2M16 5v2',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  plus: 'M12 5v14M5 12h14',
  apps: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  down: 'M12 5v13M6 12l6 6 6-6',
  alert: 'M12 7v6M12 16.5v.5',
  up: 'M12 19V6M6 12l6-6 6 6',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.5v.5',
  info: 'M12 11v6M12 7.5v.5',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
  stop: 'M7 7h10v10H7z',
  chevron: 'M9 5l7 7-7 7',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  snow: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5',
  fridge: 'M7 3h10v18H7zM7 10h10M10 6v2M10 13v3',
  pot: 'M5 9h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 9h18M10 6h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  cup: 'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2',
  share: 'M17.5 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8.7 13.2l6.6 3.6M15.3 7.2l-6.6 3.6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7zM7 10l7 7',
  camera: 'M4 8h3l1.5-2.5h7L17 8h3v11H4zM12 10.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  send: 'M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  barcode: 'M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  repeat: 'M4 12a7 7 0 0 1 12-4.9L18 9M18 4v5h-5M20 12a7 7 0 0 1-12 4.9L6 15M6 20v-5h5',
  bars: 'M5 20v-8M10 20V5M15 20v-6M20 20V9',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  half: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 4v16M12 8h4M12 12h5M12 16h4',
  minus: 'M7 12h10',
  approx: 'M5 9.5c2.3-2 4.7-2 7 0s4.7 2 7 0M5 15c2.3-2 4.7-2 7 0s4.7 2 7 0',
  skip: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM6 6l12 12',
  journal: 'M6 3.5h9l3.5 3.5v13.5H6zM15 3.5V7h3.5M9 11h6M9 14.5h6M9 18h3.5',
  bed: 'M3 6v13M3 15h18v4M21 15v-2a2 2 0 0 0-2-2h-8v4M5 11h4v3.5H5z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  drop: 'M12 3.5C9 7.5 6 10.7 6 14a6 6 0 0 0 12 0c0-3.3-3-6.5-6-10.5z',
  insights: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  tank: 'M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
};

export function Icon({ name, size = 20, title, filled }: { name: keyof typeof paths | string; size?: number; title?: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={paths[name] ?? paths.info} />
      {(name === 'alert' || name === 'question' || name === 'info') && <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
