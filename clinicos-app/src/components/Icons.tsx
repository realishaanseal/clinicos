/* Minimal stroke icon set. One weight, one corner style — consistency here is
   what stops an interface looking assembled from clip art. */

type P = { size?: number; className?: string; style?: React.CSSProperties };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IcPulse = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M3 12h4l2.5-7 4 14 2.5-7H21" /></svg>
);
export const IcUsers = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7" r="3.2" /><path d="M22 20v-1.5a4 4 0 0 0-3-3.8" /><path d="M16 4.2a3.2 3.2 0 0 1 0 5.9" /></svg>
);
export const IcMic = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="9" y="2.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /></svg>
);
export const IcDoc = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" /><path d="M14 2.5v5h5" /><path d="M8.5 13h7M8.5 16.5h4.5" /></svg>
);
export const IcCheck = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M20 6.5 9.5 17 4 11.5" /></svg>
);
export const IcShield = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 22s8-3.6 8-9.5V5.5L12 2.5 4 5.5v7C4 18.4 12 22 12 22z" /><path d="M9 12l2 2 4-4" /></svg>
);
export const IcPrint = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M6.5 9V3.5h11V9" /><rect x="3" y="9" width="18" height="7.5" rx="2" /><path d="M6.5 14h11v6.5h-11z" /></svg>
);
export const IcPlus = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 5.5v13M5.5 12h13" /></svg>
);
export const IcAlert = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9.2" /><path d="M12 7.5v5.5M12 16.3v.2" /></svg>
);
export const IcStop = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none" /></svg>
);
export const IcRec = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none" /></svg>
);
export const IcSearch = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const IcArrow = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M5 12h13M12.5 5.5 19 12l-6.5 6.5" /></svg>
);
export const IcTrash = ({ size = 16 }: P) => (
  <svg {...base(size)}><path d="M4 6.5h16M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" /><path d="M6.5 6.5 7.4 20a1.3 1.3 0 0 0 1.3 1.2h6.6a1.3 1.3 0 0 0 1.3-1.2l.9-13.5" /></svg>
);

export const IcCog = ({ size = 18 }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="3.1" /><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-2.72 1.14v.16a1.9 1.9 0 1 1-3.8 0v-.09A1.6 1.6 0 0 0 7.5 19.2a1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.05A1.6 1.6 0 0 0 1.9 14.1h-.16a1.9 1.9 0 1 1 0-3.8h.09A1.6 1.6 0 0 0 4.8 7.5a1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.05.06A1.6 1.6 0 0 0 9.9 1.9v-.16a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 2.8 1.11l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.05a1.6 1.6 0 0 0 1.14 2.72h.16a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.01.79z" /></svg>
);
export const IcRupee = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M9.5 9h5M9.5 11.5h5M12.5 9c1.4 0 1.9 2.5 0 2.5h-2l3.5 3.5" /></svg>
);
export const IcCalendar = ({ size = 18 }: P) => (
  <svg {...base(size)}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8.5 14.5h2" /></svg>
);
export const IcDownload = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" /></svg>
);

/** The mark. A caduceus-free monogram: a pulse inside a rounded shield. */
export const Mark = ({ size = 20, color = "#fff" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2.8 4.6 5.6v6.2c0 5.2 7.4 9.4 7.4 9.4s7.4-4.2 7.4-9.4V5.6z"
      stroke={color}
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M7.6 12.2h2.1l1.3-3.4 2 6.6 1.3-3.2h2.1" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
