import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
});

export const IconPlay = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><polygon points="7 4 20 12 7 20 7 4" fill="currentColor" /></svg>);
export const IconPause = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></svg>);
export const IconUpload = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
export const IconDownload = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
export const IconCheck = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><polyline points="20 6 9 17 4 12" /></svg>);
export const IconX = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
export const IconRefresh = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>);
export const IconMic = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></svg>);
export const IconStop = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>);
export const IconShield = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
export const IconTrash = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>);
export const IconArrowRight = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>);
export const IconArrowLeft = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>);
export const IconAlert = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
export const IconLoader = ({ size, className, ...p }: P) => (<svg {...base(size)} className={`spin ${className ?? ""}`} {...p}><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>);
export const IconMusic = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>);
export const IconSave = ({ size, ...p }: P) => (<svg {...base(size)} {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>);
