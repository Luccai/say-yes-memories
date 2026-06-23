import type { Wedding, WeddingMedia } from "@/lib/types";

export const DEMO_GUEST_SLUG = "mary-john-demo";
export const DEMO_CONTENT_VERSION = "demo-couple-png-v2";
const DEMO_STORAGE_VERSION_KEY = "sayyes.demo.content.version";
const DEMO_WEDDING_STORAGE_KEY = "sayyes.demo.wedding";
const DEMO_MEDIA_STORAGE_KEY = "sayyes.demo.media";

const demoPhotoBase = "/demo";
const demoAssetVersion = DEMO_CONTENT_VERSION;
const demoAssetUrl = (fileName: string) => `${demoPhotoBase}/${fileName}?v=${demoAssetVersion}`;
const demoPhotos = [
  {
    id: "demo-photo-1",
    fileName: "demo-couple-1.png",
    byteSize: 2242095,
    createdAt: "2027-06-14T19:18:00.000Z",
    favorite: true,
  },
  {
    id: "demo-photo-2",
    fileName: "demo-couple-2.png",
    byteSize: 2251244,
    createdAt: "2027-06-14T19:42:00.000Z",
    favorite: false,
  },
  {
    id: "demo-photo-3",
    fileName: "demo-couple-3.png",
    byteSize: 2191698,
    createdAt: "2027-06-14T20:08:00.000Z",
    favorite: false,
  },
  {
    id: "demo-photo-4",
    fileName: "demo-couple-4.png",
    byteSize: 2506715,
    createdAt: "2027-06-14T20:31:00.000Z",
    favorite: true,
  },
  {
    id: "demo-photo-5",
    fileName: "demo-couple-5.png",
    byteSize: 2151298,
    createdAt: "2027-06-14T21:03:00.000Z",
    favorite: false,
  },
  {
    id: "demo-photo-6",
    fileName: "demo-couple-6.png",
    byteSize: 2224613,
    createdAt: "2027-06-14T21:27:00.000Z",
    favorite: false,
  },
  {
    id: "demo-photo-7",
    fileName: "demo-couple-7.png",
    byteSize: 2153997,
    createdAt: "2027-06-14T22:02:00.000Z",
    favorite: true,
  },
] as const;

type DemoLocale = "en" | "es" | "fr" | "de" | "pt" | "zh";
type DemoPhotoCopy = {
  guestName: string;
  note: string;
};

const demoLocales: DemoLocale[] = ["en", "es", "fr", "de", "pt", "zh"];

const demoCopy = {
  en: {
    welcomeNote:
      "Please send the moments we might miss: a quick table photo, a dance-floor clip, a voice note, or a message we can keep after the night ends.",
    guestNote:
      "We caught your first dance from our table, and the whole room went quiet for a second. It was beautiful.",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "The quiet moment right after the ceremony. You both looked like the whole room disappeared.",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "Caught this while everyone was getting ready for portraits.",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "This one felt too sweet to keep on my phone.",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "A little in-between smile before dinner started.",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "The light was perfect here.",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "One of my favorite frames from the evening.",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "Sending this before I forget. It feels like your day.",
      },
    },
  },
  es: {
    welcomeNote:
      "Envíennos los momentos que quizá nos perdamos: una foto rápida de la mesa, un clip de la pista de baile, una nota de voz o un mensaje que podamos guardar después de la noche.",
    guestNote:
      "Vimos su primer baile desde nuestra mesa y por un segundo toda la sala quedó en silencio. Fue precioso.",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "El momento tranquilo justo después de la ceremonia. Parecía que el resto de la sala había desaparecido.",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "Tomé esta foto mientras todos se preparaban para los retratos.",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "Esta era demasiado bonita para dejarla solo en mi teléfono.",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "Una pequeña sonrisa entre momentos, justo antes de que empezara la cena.",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "La luz aquí era perfecta.",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "Uno de mis momentos favoritos de la noche.",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "Les envío esto antes de olvidarlo. Se siente como su día.",
      },
    },
  },
  fr: {
    welcomeNote:
      "Envoyez-nous les moments que nous pourrions manquer : une photo rapide de table, un court clip de la piste de danse, un message vocal ou quelques mots à garder après la soirée.",
    guestNote:
      "Nous avons vu votre première danse depuis notre table, et toute la salle s'est tue pendant un instant. C'était magnifique.",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "Le moment calme juste après la cérémonie. On aurait dit que toute la salle avait disparu autour de vous.",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "Prise pendant que tout le monde se préparait pour les portraits.",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "C'était trop beau pour rester seulement dans mon téléphone.",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "Un petit sourire entre deux moments, juste avant le dîner.",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "La lumière était parfaite ici.",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "L'un de mes moments préférés de la soirée.",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "Je vous l'envoie avant d'oublier. On sent vraiment que c'était votre journée.",
      },
    },
  },
  de: {
    welcomeNote:
      "Schickt uns bitte die Momente, die wir vielleicht verpassen: ein schnelles Tischfoto, einen kurzen Clip von der Tanzfläche, eine Sprachnachricht oder ein paar Worte, die wir nach diesem Abend behalten können.",
    guestNote:
      "Wir haben euren ersten Tanz von unserem Tisch aus gesehen, und der ganze Raum war für einen Moment ganz still. Es war wunderschön.",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "Der stille Moment direkt nach der Zeremonie. Ihr saht aus, als wäre der ganze Raum kurz verschwunden.",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "Aufgenommen, als sich alle gerade für die Porträts bereitgemacht haben.",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "Das war einfach zu schön, um es nur auf meinem Handy zu behalten.",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "Ein kleines Lächeln zwischendurch, kurz bevor das Dinner begonnen hat.",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "Das Licht war hier perfekt.",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "Einer meiner liebsten Momente von diesem Abend.",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "Ich schicke euch das direkt, bevor ich es vergesse. Es fühlt sich nach eurem Tag an.",
      },
    },
  },
  pt: {
    welcomeNote:
      "Enviem para nós os momentos que talvez a gente perca: uma foto rápida da mesa, um clipe da pista de dança, um áudio ou uma mensagem para guardar depois da noite.",
    guestNote:
      "Vimos a primeira dança de vocês da nossa mesa, e a sala inteira ficou em silêncio por um segundo. Foi lindo.",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "O momento tranquilo logo depois da cerimônia. Parecia que o resto da sala tinha desaparecido.",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "Tirei esta enquanto todo mundo se preparava para os retratos.",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "Esta ficou bonita demais para ficar só no meu celular.",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "Um sorriso pequeno entre um momento e outro, antes do jantar começar.",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "A luz aqui estava perfeita.",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "Um dos meus momentos favoritos da noite.",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "Estou mandando antes que eu esqueça. Tem muito a cara do dia de vocês.",
      },
    },
  },
  zh: {
    welcomeNote:
      "请把我们可能错过的瞬间发给我们：餐桌上的一张快照、舞池上的一小段视频、一段语音，或是一句我们想在婚礼后一直保存的话。",
    guestNote:
      "我们在自己的桌边看到了你们的第一支舞，那一刻整个房间都安静了。真的很美。",
    photos: {
      "demo-photo-1": {
        guestName: "Olivia Harper",
        note: "仪式刚结束后的安静瞬间。你们看起来像是整个房间都暂时消失了。",
      },
      "demo-photo-2": {
        guestName: "Ava Bennett",
        note: "大家准备拍合照时，我抓拍到了这一张。",
      },
      "demo-photo-3": {
        guestName: "Noah Williams",
        note: "这张太甜了，不该只留在我的手机里。",
      },
      "demo-photo-4": {
        guestName: "Emma Clarke",
        note: "晚餐开始前，一个很自然的小小笑容。",
      },
      "demo-photo-5": {
        guestName: "Mia Roberts",
        note: "这里的光线太好了。",
      },
      "demo-photo-6": {
        guestName: "Liam Turner",
        note: "这是我今晚最喜欢的画面之一。",
      },
      "demo-photo-7": {
        guestName: "Sophia Reed",
        note: "趁我还没忘，先发给你们。这张很像属于你们的一天。",
      },
    },
  },
} as const;

export function ensureFreshDemoLocalState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.localStorage.getItem(DEMO_STORAGE_VERSION_KEY) === DEMO_CONTENT_VERSION) {
      return;
    }

    window.localStorage.removeItem(DEMO_WEDDING_STORAGE_KEY);
    window.localStorage.removeItem(DEMO_MEDIA_STORAGE_KEY);
    window.localStorage.setItem(DEMO_STORAGE_VERSION_KEY, DEMO_CONTENT_VERSION);
  } catch {
    // Demo state is best-effort only. If storage is unavailable, use fresh seeded content.
  }
}

export function markDemoLocalStateFresh() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(DEMO_STORAGE_VERSION_KEY, DEMO_CONTENT_VERSION);
  } catch {
    // Demo state is best-effort only.
  }
}

function toDemoLocale(locale?: string): DemoLocale {
  const source = locale?.toLowerCase() ?? "en";
  const match = demoLocales.find((candidate) => source === candidate || source.startsWith(`${candidate}-`));

  return match ?? "en";
}

function getDemoPhotoCopy(photoId: string, locale?: string): DemoPhotoCopy | undefined {
  const localizedPhotos = demoCopy[toDemoLocale(locale)].photos as Record<string, DemoPhotoCopy>;
  const englishPhotos = demoCopy.en.photos as Record<string, DemoPhotoCopy>;

  return localizedPhotos[photoId] ?? englishPhotos[photoId];
}

function isKnownDemoWelcomeNote(note: string) {
  return Object.values(demoCopy).some((copy) => copy.welcomeNote === note);
}

function isKnownDemoGuestNote(note: string) {
  return Object.values(demoCopy).some((copy) => copy.guestNote === note);
}

export function getDemoGuestNote(locale?: string) {
  return demoCopy[toDemoLocale(locale)].guestNote;
}

export function localizeDemoGuestNote(note: string, locale?: string) {
  return !note || isKnownDemoGuestNote(note) ? getDemoGuestNote(locale) : note;
}

export function localizeDemoWedding<T extends { id: string; welcomeNote: string }>(
  wedding: T,
  locale?: string,
): T {
  if (wedding.id !== demoWedding.id || (!isKnownDemoWelcomeNote(wedding.welcomeNote) && wedding.welcomeNote)) {
    return wedding;
  }

  return {
    ...wedding,
    welcomeNote: demoCopy[toDemoLocale(locale)].welcomeNote,
  };
}

export function localizeDemoMedia(media: WeddingMedia[], locale?: string): WeddingMedia[] {
  return media.map((item) => {
    const photoCopy = getDemoPhotoCopy(item.id, locale);

    if (!photoCopy) {
      return item;
    }

    return {
      ...item,
      guestName: photoCopy.guestName,
      note: photoCopy.note,
    };
  });
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
  welcomeNote: demoCopy.en.welcomeNote,
  uploadLocked: false,
  createdAt: "2026-06-20T17:00:00.000Z",
  updatedAt: "2026-06-20T17:00:00.000Z",
  profileMedia: {
    id: "demo-profile-media",
    url: demoAssetUrl("demo-couple-1.png"),
    kind: "image",
    mimeType: "image/png",
    fileName: "demo-couple-1.png",
    byteSize: 2242095,
    createdAt: "2026-06-20T17:00:00.000Z",
  },
};

export const demoMedia: WeddingMedia[] = demoPhotos.map((photo) => ({
  id: photo.id,
  weddingId: demoWedding.id,
  url: demoAssetUrl(photo.fileName),
  kind: "image",
  mimeType: "image/png",
  fileName: photo.fileName,
  byteSize: photo.byteSize,
  createdAt: photo.createdAt,
  guestName: getDemoPhotoCopy(photo.id, "en")?.guestName ?? "",
  note: getDemoPhotoCopy(photo.id, "en")?.note,
  thumbnail: {
    id: `${photo.id}-thumb`,
    url: demoAssetUrl(photo.fileName),
    kind: "image",
    mimeType: "image/png",
    fileName: photo.fileName,
    byteSize: photo.byteSize,
    createdAt: photo.createdAt,
  },
  approved: true,
  hidden: false,
  favorite: photo.favorite,
}));
