# Say Yes Digital Memories - Agent Dokümantasyonu

Bu dosya proje geçmişi değil, projeyi devralan bir agent'ın ürünü, mimariyi ve değişmez kararları hızlıca anlaması için yaşayan proje dokümantasyonudur.

## Proje Özeti

Say Yes Digital Memories, Etsy üzerinden token alan düğün çiftlerinin kendi özel QR/link sayfasını oluşturup misafirlerinden fotoğraf, video, ses kaydı ve not topladığı web app/dashboard ürünüdür.

- Ürün tipi: Next.js web app ve admin dashboard.
- Hedef kitle: Etsy'den Say Yes Digital ürünü satın alan evlenecek çiftler.
- Ana değer: Uygulama indirmeden, misafirlerin düğün anılarını tek özel alanda toplamak.
- Ana akış: `/login` token aktivasyonu -> `/admin` çift stüdyosu -> `/{coupleSlug}` misafir upload sayfası.
- V1 satış modeli: Etsy üzerinden tek seferlik dijital ürün.

## Marka ve UX Yönü

Arayüz sakin, sıcak ve premium hissettirmeli. Ürün ucuz SaaS dashboard gibi değil, ivory kağıt, champagne, siyah mürekkep ve düğün stüdyosu hissi taşımalı.

- Ana görsel imza: oval profil fotoğrafı veya kısa video rozeti.
- Renk dünyası: ivory, pearl, champagne, warm paper, black ink, soft rosewood.
- Kaçınılacaklar: ağır pembe/teal gradient, emoji kalabalığı, marketing popup, sert dashboard gridleri, gereksiz landing anlatımı.
- Mobil öncelik: misafir upload ekranı tek elle kullanılabilir olmalı; form, dosya seçimi, ses kaydı ve gönder butonu taşmamalı.

## Teknoloji

- Paket yöneticisi: Bun.
- Framework: Next.js App Router.
- Dil: TypeScript.
- UI: React, Tailwind CSS, Motion for React.
- İkonlar: lucide-react.
- QR üretimi: `qrcode`.
- Backend/veri: Supabase Postgres, Supabase Storage, HTTP-only session cookie.

Komutlar:

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run build
bun run check
```

`bun.lock` aktif lockfile'dır. `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` üretilmemelidir.

## Route Haritası

- `/`: `/login` sayfasına redirect eder.
- `/login`: Etsy token aktivasyonu, geri dönen cihazda stüdyoya giriş kartı ve Mary & John demo CTA'sı.
- `/admin`: HTTP-only session cookie ile gerçek çift admin paneli.
- `/admin/mary-john`: Mary & John demo admin paneli.
- `/{coupleSlug}`: gerçek misafir upload sayfası.
- `/mary-john?demo=1`: demo misafir upload sayfası.

API route'ları:

- `/api/auth/activate`: token + çift adı ile studio aktivasyonu veya aktif tokenla tekrar giriş.
- `/api/auth/session`: mevcut session'daki wedding bilgisini döner.
- `/api/auth/logout`: session'ı siler, cookie'yi temizler.
- `/api/uploads/[slug]/prepare`: misafir dosyası için Supabase signed upload hedefi üretir.
- `/api/uploads/[slug]/complete`: signed upload sonrası DB media kaydını oluşturur.
- `/api/weddings/current`: admin wedding identity ayarlarını günceller.
- `/api/weddings/current/media`: admin memory inbox listesini döner.
- `/api/weddings/current/profile-media/prepare`: admin profil foto/video için signed upload hedefi üretir.
- `/api/weddings/current/profile-media/complete`: profil medyasını doğrular ve wedding kaydına bağlar.
- `/api/media/[id]`: admin media update/delete işlemleri.
- `/api/media/[id]/download`: admin indirme için kısa süreli signed download URL'ye redirect eder.

## Veri Modeli

Supabase migration dosyası: `supabase/migrations/20260620172446_init_say_yes_schema.sql`.

Ana tablolar:

- `weddings`: çift bilgisi, slug, welcome note, upload kilidi, profil medya metadata'sı.
- `tokens`: hash'li Etsy token kayıtları; ham token repo'ya girmez.
- `wedding_media`: misafir medya metadata'sı.
- `sessions`: HTTP-only cookie ile eşleşen admin session kayıtları.

Storage bucket:

- Varsayılan bucket: `say-yes-memories`.
- Bucket private olmalı.
- Misafir ve profil dosyaları doğrudan Supabase Storage'a signed upload ile yüklenir.
- Next.js API route'ları büyük dosyayı body olarak taşımamalı; Vercel serverless limitleri için bu kritik.

## Auth ve Token Akışı

- Token frontend'de kalıcı saklanmaz.
- Token normalize edilip SHA-256 hash ile `tokens.token_hash` karşılaştırılır.
- İlk başarılı aktivasyonda wedding oluşturulur, token `active` olur ve session cookie set edilir.
- Aktif token aynı çift isimleriyle tekrar girilirse yeni wedding yaratmadan mevcut wedding session açılır.
- Farklı isimlerle aktif token kullanımı reddedilir.
- Admin route'ları `getCurrentWeddingFromCookie()` ile server tarafında session doğrular.

## Admin Panel Davranışı

Admin ana ekranı mobilde sade kalmalıdır:

- Üstte profil rozeti, taşmayan çift adı kapsülü ve hamburger menü.
- Varsayılan panel: Guest Memories.
- Hamburger menü: Guest Memories, Wedding Page, QR + Guest Link, View Guest Page ve küçük Logout aksiyonu.
- Logout menüde mini aksiyon gibi görünür ve `/login` sayfasına döndürür.
- View Guest Page yeni sekmede misafir sayfasını açar; QR panelinde ayrıca ikinci bir misafir sayfası butonu tutulmaz.

Guest Memories:

- Misafir uploadları admin ekranında görünür Check Again butonu olmadan yenilenmelidir.
- Supabase Realtime Broadcast upload/delete sonrası admin ekranını tetikler; görünmeyen uzun fallback sadece bağlantı uyursa toparlamak için kalır.
- Favori ve gizle butonları V1'de kaldırılmıştır; public galeri olmadığı için çifte anlamlı değer üretmiyordu.
- İndirme `/api/media/[id]/download` üzerinden signed download ile yapılır.
- Silme doğrudan çalışmaz; önce onay modalı açılır. Evet derse Storage ve DB tarafında silinir, Hayır derse işlem yapılmaz.

Wedding Page:

- Profil foto/video upload eder.
- Bride/groom isimleri, event date, welcome note ve upload lock ayarlarını yönetir.
- İsim değişince misafir tarafındaki görünen çift adı da güncellenir; slug aynı kalır çünkü basılmış QR/link kırılmamalıdır.
- Profil medya da signed upload ile Supabase Storage'a gider.

Demo:

- Demo çift: Mary & John.
- Demo admin route: `/admin/mary-john`.
- Demo guest route: `/mary-john?demo=1`.
- Demo profil görseli: `public/demo/beautiful-young-couple-hugging-great-wall-china.jpg`.
- Demo state localStorage ile simüle edilir; gerçek Supabase DB/Storage yazımı yapmaz.

## Misafir Sayfası

Misafir sayfası `/{coupleSlug}` ile açılır.

- Üstte çiftin profil foto/video rozeti, çift adı, tarih ve welcome note görünür.
- Misafir adını, opsiyonel notu ve foto/video/ses dosyasını gönderir.
- Ses kaydı tarayıcı MediaRecorder ile alınır; destek yoksa kullanıcı dosya seçebilir.
- Upload kapalıysa form yerine kapalı mesajı gösterilir.
- Başarılı upload sonrası teşekkür ekranı gösterilir.
- Misafirler diğer misafirlerin yüklediği medyaları görmez.

## Supabase ve Vercel Env Değerleri

Gerekli environment variable'lar:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=say-yes-memories
```

Vercel tarafında Production, Preview ve Development ortamları için bu değerler girilmelidir. `SUPABASE_SERVICE_ROLE_KEY` kesinlikle frontend'e açılmamalı; `NEXT_PUBLIC_` prefix'i almamalıdır.

## Güvenlik ve Veri Notları

- Service role sadece server route ve server helper içinde kullanılır.
- Storage bucket private kalır; görüntüleme ve indirme signed URL ile yapılır.
- Upload prepare/complete iki aşamalıdır; complete aşaması storage path'in ilgili wedding/folder altında olduğunu ve `asset_` ID formatını doğrular.
- Dosya tipi image/video/audio ile sınırlıdır.
- Dosya boyutu sınırı uygulama tarafında 100 MB'dır.
- RLS migration'da enable edilir; uygulama server-side service role ile çalışır.

## Deploy Hazırlığı

Deploy hedefi Vercel'dir.

Deploy öncesi minimum kalite kapısı:

```bash
bun run lint
bun run typecheck
bun run build
```

Vercel kontrol listesi:

- GitHub repo Vercel projesine bağlı olmalı.
- Build command Bun ile çalışmalı veya Vercel otomatik Bun algılamalı.
- Env değerleri eksiksiz olmalı.
- Production URL'de `/login`, `/admin/mary-john`, `/mary-john?demo=1` açılmalı.
- Gerçek admin için session yoksa `/admin` -> `/login` redirect çalışmalı.
- Supabase bucket ve migration production projesinde hazır olmalı.

## Kod Disiplini

- İlgisiz refactor yapma.
- Var olan kullanıcı değişikliklerini geri alma.
- Büyük medya dosyasını Next API body üzerinden geçirme; signed upload akışını koru.
- Mobilde taşma/overlap kontrolünü önemse.
- UI metinlerinde Etsy sonrası sıcak ve samimi ton korunmalı.
- Yeni özellik eklenmeden önce admin panelini şişirmeme prensibi korunmalı.
