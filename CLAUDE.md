# CLAUDE.md


Agent bu dosyayı sadece genel talimat gibi değil, projenin ana hafızası gibi okumalı. Yeni projeye başlamadan önce `Proje Tanımı` bölümü doldurulur; agent her task öncesinde önce burayı okuyup projenin ne olduğunu, neye dönüşmeye çalıştığını ve hangi teknik sınırların değişmez olduğunu anlamalıdır.

---

## İletişim Standardı

- Kullanıcı ile her zaman Türkçe konuş.
- Teknik kaynakları İngilizce okuyabilir, kodda/projede İngilizce isimlendirme kullanabilirsin; ancak kullanıcıya soru, açıklama ve final cevapları Türkçe olmalı.
- Bilmediğin veya emin olmadığın konuda bunu açıkça söyle.
- Tahmin yapıyorsan tahmin olduğunu belirt.
- Uydurma bilgi verme.
- Karar yanlış veya riskliyse doğrudan uyar: neyin yanlış olduğunu, neden yanlış olduğunu ve daha doğru alternatifin ne olduğunu açıkla.
- Gereksiz övgü, pohpohlama ve yapay motivasyon dili kullanma.
- Cevapları pratik tut; ama karar vermek için gereken teknik gerekçeyi eksiltme.

---

## Agent Başlangıç Protokolü

Her yeni task'a başlamadan önce:

1. `AGENTS.md` dosyasını oku.
2. Varsa `CLAUDE.md` dosyasını da oku; Claude'a özel talimatlar genel proje kurallarıyla çelişmemeli.
3. `Proje Tanımı` bölümünden projenin amacını, hedef kitlesini, sayfa yapısını, CTA'larını ve teknik kısıtlarını çıkar.
4. Repo durumunu incele: `package.json`, `bun.lock`, `src/`, `app/`, `components/`, `content/`, Tailwind ve TypeScript ayarları.
5. Mevcut kod stilini ve klasör yapısını takip et.
6. Kritik bilgi eksikse önce dosyalardan anlamaya çalış; hâlâ belirsizse kısa ve net soru sor.
7. Task sonunda bu dosyanın en altındaki `Task Günlüğü` bölümüne `Son görev:` etiketiyle, sonraki session'da gelecek agent'a bağlam aktaracak kısa bir kayıt ekle.
8. Proje içindeki `skills` klasörü skill referansıdır; global skill'ler görünmüyorsa buradan bakılabilir.

---

## Proje Tanımı

Bu bölüm yeni proje başlarken doldurulacak. Agent, proje hakkındaki temel gerçeği önce burada arayacak.

### Ana Bilgiler

- Proje adı: Say Yes Digital Memories
- Proje türü: Web app / Dashboard
- Kısa açıklama: Etsy üzerinden token alan düğün çiftlerinin, misafirlerinden QR/link ile fotoğraf, video, ses kaydı ve not topladığı özel anı stüdyosu.
- Ana amaç: Çiftin satın alma sonrası hızlıca özel linkini ve QR kodunu üretmesi, misafir medyalarını tek panelde güvenli şekilde toplaması.
- Hedef kitle: Etsy'de Say Yes Digital mağazasından dijital düğün ürünü alan evlenecek çiftler.
- Çözüldüğü problem: Misafirlerin çektiği düğün anıları WhatsApp/DM gibi dağınık kanallarda kayboluyor; çift her şeyi tek özel alanda toplamak istiyor.
- Başarı ölçütü: Token ile giriş sorunsuz çalışır, çift QR/link üretir, misafir mobilde medya yükler, çift admin panelinden medyayı yönetir.

### Ürün ve İçerik

- Ana teklif / value proposition: "Private QR wedding memory studio" - uygulama indirmeden misafir anılarını lüks ve özel bir sayfada toplama.
- Birincil CTA: Login ekranında "Create private studio", geri dönen cihazda "Stüdyoya gir".
- İkincil CTA: Admin panelde "Copy link", "PNG/SVG QR indir", misafir sayfasında "Send memory".
- Ana özellikler: Token aktivasyonu, okunabilir çift slug'ı, admin identity/profil medya alanı, QR Studio, mobil guest preview, Memory Inbox, favori/gizle/sil/indir, upload kilidi, misafir foto/video/ses/not yükleme.
- Hizmetler / paketler: V1 tek ürün: Etsy'de 50 USD dijital QR anı stüdyosu.
- Fiyatlama mantığı: Etsy üzerinden tek seferlik 50 USD satış; storage maliyeti ve üretim marjı sonraki kararda netleşecek.
- Referanslar / sosyal kanıt: V1 uygulama içinde yok; Etsy listing kapaklarında ürün ekran görüntüleri sosyal kanıt gibi kullanılacak.
- Kullanılacak medya: `public/brand` altındaki Say Yes Digital logo/banner/kapak-logo, çiftin admin panelden yüklediği profil fotoğrafı veya kısa video, lucide ikonları.

### Sayfa ve Bilgi Mimarisi

- Ana sayfa rolü: Landing page yok; `/` doğrudan `/login` sayfasına yönlenir.
- Planlanan sayfalar / route'lar: `/login`, `/admin`, `/{coupleSlug}`, API route'ları: `/api/auth/*`, `/api/weddings/*`, `/api/uploads/[slug]`, `/api/media/[id]`.
- Navigasyon yapısı: Minimal; login -> admin, admin -> guest preview/link, guest sayfası tek amaçlı upload ekranı.
- Footer içeriği: V1'de footer yok; ürün landing olmadığı için gereksiz.
- SEO hedef sayfaları: V1 public SEO hedeflemez; özel token/link ürünü.
- Blog / kaynak merkezi ihtiyacı: Yok.

### Marka ve UX

- Marka tonu: Sakin, lüks, düğün stüdyosu hissi; abartısız, premium, güven veren.
- Görsel stil: Ivory/kabartma kâğıt, pearl, champagne, siyah mürekkep, ince botanik/alyans referansı; oval profil medya rozeti imza öğe.
- Kaçınılacak tasarım / dil: Pembe/teal kalabalık gradient, emoji ağırlığı, kampanya popup'ı, ucuz SaaS dashboard görünümü, landing page şişirmesi.
- Mobil deneyimde kritik noktalar: Misafir upload ekranı tek elle kullanılabilir olmalı; file picker, ses kaydı, not alanı ve gönder butonu taşmamalı.
- Dönüşüm için kritik ekranlar: Etsy kapaklarında gösterilecek login kartı, admin QR Studio, misafir upload sayfası, teşekkür ekranı.

### Teknik Notlar

- Entegrasyonlar: Supabase Postgres, private Supabase Storage ve Supabase Realtime Broadcast.
- Formlar: Token aktivasyon formu, wedding identity formu, profil medya upload, misafir medya/not upload, ses kaydı.
- Analytics / tracking: V1'de yok; Etsy satış hunisi ve ürün içi temel event tracking sonra konuşulacak.
- Auth ihtiyacı: Token aktivasyonu + HTTP-only session cookie. Token frontend'de saklanmaz.
- Database / backend ihtiyacı: Supabase-backed store aktif; `.local-data` sadece eski/dev seed kalıntısı olarak görülmeli, production akışında kullanılmamalı.
- Deployment hedefi: Muhtemel Vercel; production storage olarak Supabase Storage, Vercel Blob veya Cloudflare R2 kıyaslanacak.
- Bilinen riskler: Supabase Storage kota/maliyet ve dosya saklama politikası net ürün marjını belirleyecek; Vercel deploy env secret'ları eksiksiz girilmeden canlıya alınmamalı.
- Bilinmeyenler: Nihai domain, medya kota limiti, Etsy teslim mail metni, token yenileme/iade politikası.

---

## Değişmez Teknoloji Kuralları

- Paket yöneticisi Bun'dır.
- Aktif lockfile `bun.lock` olmalıdır.
- `npm`, `yarn` veya `pnpm` lockfile'ı üretilmemeli; yanlışlıkla üretilirse gerekçesi yoksa kaldırılmalıdır.
- Next.js app  router
- React
- react-dom
- TypeScript
- Tailwind CSS
- Motion for React (motion paketi)
- Yeni proje kurulurken Next.js, React, TypeScript, Tailwind CSS ve Motion for React için latest stable sürümler resmi kaynaklardan veya paket registry'sinden kontrol edilip kurulmalıdır.

---

## Bun Komut Standardı

- Paket kurulumunda `bun install` kullan.
- Paket eklerken `bun add <paket>` kullan.
- Dev dependency eklerken `bun add -d <paket>` kullan.
- Script çalıştırırken `bun run <script>` kullan.
- Next.js komutları gerekiyorsa Bun üzerinden çalıştır.
- Proje scriptleri yoksa önce `package.json` yapısını kur, sonra script ekle.

Önerilen temel scriptler:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

---



## Animasyon Standardı

- Motion for React kullan.
- Section girişlerinde fade-up animasyonları olsun.
- Çocuk elemanlarda staggered animation kullan.
- Kartlarda hover scale ve shadow animasyonu olsun.
- Animasyonlar premium hissettirmeli: ölçülü, hızlı, akıcı ve amaca hizmet eden şekilde kullanılmalı.

---

## Responsive ve UX Standardı

- Tam responsive tasarla: mobil, tablet, desktop ve geniş ekran.
- Mobil deneyim sonradan sıkıştırılmış desktop gibi durmamalı.
- CTA'lar mobilde kolay ulaşılır olmalı.
- Metinler dar ekranlarda taşma, üst üste binme veya okunabilirlik sorunu yaratmamalı.
- Layout için stabil ölçüler, grid/flex kuralları ve responsive constraints kullan.

---

## Kalite Standardı

Her anlamlı geliştirme şu hedefleri birlikte korumalı:

- iyi mimari
- iyi UX
- iyi SEO
- iyi performans
- iyi dönüşüm
- iyi erişilebilirlik
- en önemlisi mobilde kusursuz, güçlü deneyim

---

## Değişiklik Disiplini

- Kullanıcı istemedikçe ilgisiz refactor yapma.
- Var olan kullanıcı değişikliklerini geri alma.
- Dosya silmeden önce bunun görev için gerekli olduğundan emin ol.
- Yeni dependency ekliyorsan neden gerektiğini bil.
- Static content değişikliğinde önce merkezi data dosyasını kullanmayı dene.
- Küçük metin değişikliklerinde gereksiz build/restart yapma; risk varsa veya kullanıcı isterse kontrol çalıştır.

---

## Final Cevap Standardı

Her task sonunda kullanıcıya kısa özet ver:

- ne değişti
- hangi dosyalar etkilendi
- hangi kontroller çalıştı
- varsa kalan risk veya bilinmeyen

Ayrıca `Task Günlüğü` bölümüne sonraki session'daki agent'a bağlam devretmek için doldur.

---

## Task Günlüğü

Bu bölüm bilerek büyüyebilir. Kullanıcıya dönük changelog değildir; sonraki session'da gelen agent'ın projeyi hızlı anlaması için bağlam devridir.

Her tamamlanan task sonunda en altı doldur. Satır; yapılan işi, etkilenen dosyaları ve sonraki agent'ın bilmesi gereken kritik kararı veya riski içermeli.
Format:

```txt
- YYYY-MM-DD HH:mm - Son görev: detaylı ve somut iş özeti. Etkilenen dosyalar: dosya1, dosya2. Sonraki agent için not: karar, risk veya devam bağlamı.
```

- 2026-05-18 21:58 - Son görev: AGENTS.md yeni proje başlangıç standardı olarak yeniden yazıldı. Etkilenen dosyalar: AGENTS.md.
- 2026-06-20 19:13 - Son görev: Say Yes Digital Memories V1 planına göre Next.js/Bun uygulama iskeleti, token aktivasyonu, admin QR stüdyosu, profil medya, misafir upload ve local dev store akışı uygulandı. Etkilenen dosyalar: package.json, src/app, src/components, src/lib, scripts/generate-tokens.ts, README.md, AGENTS.md, CLAUDE.md. Sonraki agent için not: `.local-data` sadece geliştirme store'udur; production için storage/DB kararı verilmeden canlıya alınmamalı.
- 2026-06-20 19:38 - Son görev: Login aktivasyon formundaki guest link preview kaldırıldı, Create private studio altında `/demo` bağlantılı Demoyu deneyimle CTA'sı eklendi ve Mary & John için server/storage kullanmayan dolu demo misafir deneyimi oluşturuldu. Etkilenen dosyalar: src/components/login/LoginExperience.tsx, src/components/guest/GuestExperience.tsx, src/app/demo/page.tsx, src/lib/demo-wedding.ts, AGENTS.md, CLAUDE.md. Sonraki agent için not: demo upload gerçek API'ye gitmez; sadece guest teşekkür ekranını simüle eder.
- 2026-06-20 19:56 - Son görev: Login sayfasında kullanıcı browser yorumuyla seçilen koyu sol hero/marketing paneli kaldırıldı ve aktivasyon formu tek kolon ortalı kapsayıcıya alındı. Etkilenen dosyalar: src/components/login/LoginExperience.tsx, AGENTS.md, CLAUDE.md. Sonraki agent için not: login artık landing/hero anlatımı göstermiyor; ilk görünen ana deneyim form ve demo CTA'sı.
- 2026-06-20 20:35 - Son görev: Supabase Postgres/Storage/Realtime üretim veri katmanı bağlandı, `/admin/mary-john` dolu Mary & John demo paneli eklendi, login demo CTA'sı admin demoya yönlendirildi, login/guest/admin arayüzleri browser diline göre EN/ES/FR/DE/PT/ZH metinlere bağlandı ve eski koyu login hero bloğunun kaldırıldığı doğrulandı. Etkilenen dosyalar: src/app, src/components, src/lib, supabase/migrations, package.json, bun.lock, AGENTS.md, CLAUDE.md. Sonraki agent için not: `.env.local` repo dışında kalmalı; Supabase service role sadece server tarafında kullanılıyor, demo upload localStorage simülasyonudur.













projeye başlıyoruz. prompt: https://anoraforever.com ve https://guestories.net sitesini ziyaret et. sitenin mantığını anla. bu sitenin yaptığı şeyin aynısını ve ayriyeten daha çok daha gelişmişini yapacağız. bu site biraz lovable ile düşük zekalı ai modelleri ile yapılmış gibi bi tasarımı var. tasarımı çirkin yani. senden tasarım ve mantık noktasında profesyonel bi iş bekliyorum. mevzumuz şu: etsy mağazam var benim. Say Yes Digital diye. logo banner kullanacaksan, kullanmayı uygun görürsen yolu: C:\Users\MSI\Desktop\SayYesDigital\Logo-banner

bu mağazamda 50 dolar'a satmak üzere böyle bi şey yapmak istiyorum. bu mağazamda ben düğün davetiyeleri satıyorum. evlenecek olan çiftlere hitap ediyorum yani. şu an mağaza kapalı. bu yüzden sana link atamıyorum. landing page olmayacak. etsy'den satın alan müşteri'ye bir token vereceğiz. 1000 adet token tanımlayacaksın. bu tokenlerı bana vereceksin ve ben onlardan her satın alındığında müşterinin mailine göndereceğim ve müşteri token + link vereceğim müşteri linke basınca bir login sayfası cıkacak karşısına. oraya bu tokeni yapıştırınca server backendde hızlı bi bakacak bu token tanımlıı mı doğru mu diye. doğruysa kullanıcıyı içeri alacak. doğru değilse almayacak. içeri giren kullanıcı yani çift/host bir admin paneliyle karşılaşacak. bu admin panelinde qr oluşturabilecek misafirlerine atmak için link de oluşturabilecek, qr'ı indirip masa kartına bastırıp masalarına koyabilecek. yani biz masa kartını onlara sipariş vermeyeceğiz bu bahsettiğimiz site gibi. biz sadece qr oluşturtup link verip admin panelinde o qr ile foto video ya da ses yükleyen misafirlerin medyalarının görüntülendiği güzel bi admin paneli olacak orası. yani bir adet login sayfası olacak, sonra o loginden sonra token ile giriş olacak, giriş yapılan yer admin paneli olacak. admin panelinde qr oluşturulabilecek, link yaratılabilecekk her token'e özel. ama bu linkler rastgele saçma sapan token gibi linkler olmamalı. çift login de girerken çift isminizi giriniz kısmı olacak. en üstte gelin bi altta damatın ismi inputu olacak. onun da altında token girilen input. login sayfası çok profesyonel olmalı. burada gelin ve damatın ismine göre dinamik güzel linkler oluşmalı. örnek atıyorum: damat: john gelin mary o zaman link /john-mary şeklinde olmalı. 

3 ana merkez olacak . login ekranı admin paneli ve misafirllerin qr'ı okuttuktan sonra ya da link'e bastıktan sonra yönlenecekleri yer. o yer de çok profesyonel olmalı. ultra profesyonel ve lüks. full mobil optimize tüm ios ve android cihazlarla tam uyumlu mobile responsive öncelikli olmalı. işin medya öğelerinin yüklendiği zaman nereye depolanacağı kısmını sonra konuşup tartışacağız. en uygun, ucuz fiyatlandırma konusunda konuşacağız. 

görevi bitirdikten sonra projeyle ilgili yukarıdaki boş kısımları doldur. 
