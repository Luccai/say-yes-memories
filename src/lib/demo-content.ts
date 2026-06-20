import type { Wedding, WeddingMedia } from "@/lib/types";

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function portraitSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 820">
  <defs>
    <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#fffaf3"/>
      <stop offset="0.48" stop-color="#eadbc9"/>
      <stop offset="1" stop-color="#b99662"/>
    </linearGradient>
    <radialGradient id="glow" cx="44%" cy="24%" r="72%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="0.44" stop-color="#d7c0a0" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#1f1712" stop-opacity="0.88"/>
    </radialGradient>
  </defs>
  <rect width="640" height="820" fill="url(#paper)"/>
  <rect width="640" height="820" fill="url(#glow)" opacity="0.62"/>
  <path d="M108 154c118-76 307-82 424 2" fill="none" stroke="#fffaf3" stroke-width="10" stroke-linecap="round" opacity="0.72"/>
  <path d="M128 630c104 74 281 88 385 0" fill="none" stroke="#fffaf3" stroke-width="8" stroke-linecap="round" opacity="0.56"/>
  <circle cx="247" cy="330" r="94" fill="#fffaf3" opacity="0.88"/>
  <circle cx="390" cy="330" r="94" fill="#efe1d0" opacity="0.9"/>
  <path d="M228 432c52 40 126 41 178 0 49 37 77 99 77 169H151c0-70 28-132 77-169Z" fill="#1f1712" opacity="0.92"/>
  <path d="M320 207c49 66 59 146 29 241" fill="none" stroke="#8b6b3f" stroke-width="7" stroke-linecap="round" opacity="0.52"/>
  <text x="320" y="704" text-anchor="middle" fill="#fffaf3" font-family="Georgia, serif" font-size="76" font-weight="700">M &amp; J</text>
  <text x="320" y="754" text-anchor="middle" fill="#fffaf3" font-family="Arial, sans-serif" font-size="23" font-weight="700" letter-spacing="7">JUNE 14 2027</text>
</svg>`;
}

function memorySvg(title: string, subtitle: string, a: string, b: string) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 640">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="shine" cx="25%" cy="18%" r="70%">
      <stop offset="0" stop-color="#fffaf3" stop-opacity="0.88"/>
      <stop offset="1" stop-color="#fffaf3" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="900" height="640" fill="url(#g)"/>
  <rect width="900" height="640" fill="url(#shine)"/>
  <path d="M80 492c134-95 271-104 410-28 115 63 226 59 333-12" fill="none" stroke="#fffaf3" stroke-width="8" stroke-linecap="round" opacity="0.62"/>
  <circle cx="706" cy="164" r="92" fill="#fffaf3" opacity="0.18"/>
  <circle cx="738" cy="190" r="92" fill="#fffaf3" opacity="0.13"/>
  <text x="76" y="114" fill="#fffaf3" font-family="Georgia, serif" font-size="64" font-weight="700">${title}</text>
  <text x="80" y="176" fill="#fffaf3" font-family="Arial, sans-serif" font-size="25" font-weight="700" opacity="0.86">${subtitle}</text>
</svg>`;
}

export const demoWedding: Wedding = {
  id: "demo-wedding-mary-john",
  slug: "mary-john",
  brideName: "Mary",
  groomName: "John",
  coupleName: "Mary & John",
  realtimeTopic: "demo-mary-john",
  demo: true,
  eventDate: "2027-06-14",
  welcomeNote:
    "Please send the moments we might miss: a quick table photo, a dance-floor clip, a voice note, or a message we can keep after the night ends.",
  uploadLocked: false,
  createdAt: "2026-06-20T17:00:00.000Z",
  updatedAt: "2026-06-20T17:00:00.000Z",
  profileMedia: {
    id: "demo-profile-media",
    url: svgDataUrl(portraitSvg()),
    kind: "image",
    mimeType: "image/svg+xml",
    fileName: "mary-john-profile.svg",
    byteSize: portraitSvg().length,
    createdAt: "2026-06-20T17:00:00.000Z",
  },
};

export const demoMedia: WeddingMedia[] = [
  {
    id: "demo-photo-1",
    weddingId: demoWedding.id,
    url: svgDataUrl(memorySvg("First dance", "Captured by Olivia", "#7e8f78", "#1f1712")),
    kind: "image",
    mimeType: "image/svg+xml",
    fileName: "first-dance.svg",
    byteSize: 1580,
    createdAt: "2027-06-14T21:12:00.000Z",
    guestName: "Olivia Harper",
    note: "The room went quiet for a second when the first dance started. This one feels like the whole night in a frame.",
    approved: true,
    hidden: false,
    favorite: true,
  },
  {
    id: "demo-photo-2",
    weddingId: demoWedding.id,
    url: svgDataUrl(memorySvg("Table seven", "Dinner toast", "#8c5144", "#c7a66f")),
    kind: "image",
    mimeType: "image/svg+xml",
    fileName: "table-seven-toast.svg",
    byteSize: 1490,
    createdAt: "2027-06-14T20:38:00.000Z",
    guestName: "Ava Bennett",
    note: "John's grandmother told the sweetest story at our table. I wrote the quote down so you would not lose it.",
    approved: true,
    hidden: false,
    favorite: false,
  },
  {
    id: "demo-video-1",
    weddingId: demoWedding.id,
    url: svgDataUrl(memorySvg("Dance floor clip", "Video placeholder", "#1f1712", "#7e8f78")),
    kind: "video",
    mimeType: "video/mp4",
    fileName: "dance-floor-clip.mp4",
    byteSize: 8240000,
    createdAt: "2027-06-14T22:06:00.000Z",
    guestName: "Noah Williams",
    note: "A 14 second clip from the exact moment everyone joined the dance floor.",
    approved: true,
    hidden: false,
    favorite: true,
  },
  {
    id: "demo-audio-1",
    weddingId: demoWedding.id,
    url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
    kind: "audio",
    mimeType: "audio/wav",
    fileName: "voice-note-from-mia.wav",
    byteSize: 44,
    createdAt: "2027-06-14T22:18:00.000Z",
    guestName: "Mia Carter",
    note: "A private voice note for the morning after the wedding.",
    approved: true,
    hidden: false,
    favorite: false,
  },
];
