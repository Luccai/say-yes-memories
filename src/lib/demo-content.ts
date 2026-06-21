import type { Wedding, WeddingMedia } from "@/lib/types";

export const DEMO_GUEST_SLUG = "mary-john-demo";

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
    url: "/demo/beautiful-young-couple-hugging-great-wall-china.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    fileName: "beautiful-young-couple-hugging-great-wall-china.jpg",
    byteSize: 9057200,
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
    thumbnail: {
      id: "demo-photo-1-thumb",
      url: svgDataUrl(memorySvg("First dance", "Captured by Olivia", "#7e8f78", "#1f1712")),
      kind: "image",
      mimeType: "image/svg+xml",
      fileName: "first-dance-thumbnail.svg",
      byteSize: 1580,
      createdAt: "2027-06-14T21:12:00.000Z",
    },
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
    thumbnail: {
      id: "demo-photo-2-thumb",
      url: svgDataUrl(memorySvg("Table seven", "Dinner toast", "#8c5144", "#c7a66f")),
      kind: "image",
      mimeType: "image/svg+xml",
      fileName: "table-seven-toast-thumbnail.svg",
      byteSize: 1490,
      createdAt: "2027-06-14T20:38:00.000Z",
    },
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
    thumbnail: {
      id: "demo-video-1-thumb",
      url: svgDataUrl(memorySvg("Dance floor clip", "Video placeholder", "#1f1712", "#7e8f78")),
      kind: "image",
      mimeType: "image/svg+xml",
      fileName: "dance-floor-clip-thumbnail.svg",
      byteSize: 1580,
      createdAt: "2027-06-14T22:06:00.000Z",
    },
    approved: true,
    hidden: false,
    favorite: true,
  },
];
