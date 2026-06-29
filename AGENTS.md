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

- Ana görsel imza: oval profil fotoğrafı rozeti. Admin profil videosu kullanılmaz.
- Renk dünyası: ivory, pearl, champagne, warm paper, black ink, soft rosewood.
- Kaçınılacaklar: ağır pembe/teal gradient, emoji kalabalığı, marketing popup, sert dashboard gridleri, gereksiz landing anlatımı.
- Mobil öncelik: misafir upload ekranı tek elle kullanılabilir olmalı; form, dosya seçimi, ses kaydı ve gönder butonu taşmamalı.
- Yardım deneyimi: Login, admin ve misafir QR sayfalarında aynı görsel dilde Help butonu ve bağlama özel yardım modalı bulunur. Bu metinler sabit İngilizce yazılmamalı; `src/lib/i18n.ts` üzerinden tüm desteklenen dillere bağlanmalıdır.

## Teknoloji

- Paket yöneticisi: Bun.
- Framework: Next.js App Router.
- Dil: TypeScript.
- UI: React, Tailwind CSS, Motion for React.
- İkonlar: lucide-react.
- QR üretimi: `qrcode`.
- Backend/veri: Supabase Postgres metadata/session/kota, Cloudflare R2 private media storage, HTTP-only session cookie.

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

Kalite komutları:

- Küçük frontend/backend düzenlemelerinde her değişiklikten sonra manuel `bun run lint`, `bun run typecheck`, `bun run build` veya `bun run check` çalıştırma.
- Commit sırasında `.githooks/pre-commit` staged JS/TS dosyalarında ESLint düzeltmesini yapar; ekstra manuel build/check koşma.
- Ağır kalite kapısı `bun run check` sadece GitHub'a push ederken `.githooks/pre-push` üzerinden çalışmalıdır.
- Kullanıcı açıkça test/check isterse veya değişiklik yüksek riskliyse önce sebebini söyle, sonra hedefli kontrol çalıştır.

## Route Haritası

- `/`: `/login` sayfasına redirect eder.
- `/login`: Etsy token aktivasyonu, geri dönen cihazda stüdyoya giriş kartı ve Mary & John demo CTA'sı.
- `/admin`: HTTP-only session cookie ile gerçek çift admin paneli.
- `/admin/mary-john`: Mary & John demo admin paneli.
- `/owner/upgrades`: owner secret cookie ile manuel Premium Extension uygulama paneli.
- `/{coupleSlug}`: gerçek misafir upload sayfası.
- `/mary-john?demo=1`: demo misafir upload sayfası.

API route'ları:

- `/api/auth/activate`: token + çift adı ile studio aktivasyonu veya aktif tokenla tekrar giriş.
- `/api/auth/session`: mevcut session'daki wedding bilgisini döner.
- `/api/auth/logout`: session'ı siler, cookie'yi temizler.
- `/api/owner/login`: owner şifresiyle `/owner/upgrades` için HTTP-only owner session açar.
- `/api/owner/logout`: owner session cookie'sini temizler.
- `/api/owner/upgrades/apply`: Studio Code + Etsy sipariş no ile Premium Extension uygular.
- `/api/uploads/[slug]/prepare`: misafir dosyası için R2 presigned PUT hedefi üretir ve kota/access kontrolü yapar.
- `/api/uploads/[slug]/complete`: signed upload sonrası DB media kaydını oluşturur.
- `/api/weddings/current`: admin wedding identity ayarlarını günceller.
- `/api/weddings/current/media`: admin memory inbox listesini döner.
- `/api/weddings/current/profile-media/prepare`: admin profil fotoğrafı için R2 presigned PUT hedefi üretir.
- `/api/weddings/current/profile-media/complete`: profil fotoğrafını doğrular ve wedding kaydına bağlar.
- `/api/media/[id]`: admin media update/delete işlemleri.
- `/api/media/[id]/download`: admin indirme için kısa süreli signed download URL'ye redirect eder.

## Veri Modeli

Supabase migration dosyaları:

- `supabase/migrations/20260620172446_init_say_yes_schema.sql`: temel wedding, token, media ve session şeması.
- `supabase/migrations/20260621130000_add_wedding_media_thumbnails.sql`: media thumbnail alanları.
- `supabase/migrations/20260621164000_allow_more_audio_mime_types.sql`: ek audio MIME tipleri.
- `supabase/migrations/20260629120000_add_r2_quota_and_upgrades.sql`: R2 kota/access alanları, Studio Code, upgrade logları ve quota RPC'leri.

Ana tablolar:

- `weddings`: çift bilgisi, slug, studio code, plan, kota, access süresi, welcome note, upload kilidi ve profil medya metadata'sı.
- `tokens`: hash'li Etsy token kayıtları; ham token repo'ya girmez.
- `wedding_media`: misafir medya metadata'sı.
- `upgrade_logs`: owner panelden uygulanan Premium Extension kayıtları.
- `sessions`: HTTP-only cookie ile eşleşen admin session kayıtları.

Storage bucket:

- Varsayılan bucket: `say-yes-memories`.
- Bucket private olmalı.
- Misafir ve profil dosyaları doğrudan Cloudflare R2'ye presigned PUT ile yüklenir.
- Next.js API route'ları büyük dosyayı body olarak taşımamalı; Vercel serverless limitleri için bu kritik.
- Supabase sadece medya metadata'sı, `storage_used_bytes`, kota, access süresi ve upgrade loglarını tutar.
- Classic paket 50 GB ve düğün tarihinden itibaren 3 ay access verir. Premium Extension +50 GB ve mevcut access bitişine +6 ay ekler.
- Kota dolunca misafir upload hard stop olur. Access bitince upload kapanır; dosyalar 30 gün cleanup grace sonrası owner cleanup için adaydır.

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
- Hamburger menü: Guest Memories, Private Storage, Wedding Page, QR + Guest Link, View Guest Page ve küçük Logout aksiyonu.
- Logout menüde mini aksiyon gibi görünür ve `/login` sayfasına döndürür.
- View Guest Page yeni sekmede misafir sayfasını açar; QR panelinde ayrıca ikinci bir misafir sayfası butonu tutulmaz.

Guest Memories:

- Misafir uploadları admin ekranında görünür Check Again butonu olmadan yenilenmelidir.
- Guest Memories, küçük kare albüm grid'i olarak görünmelidir. Dikey/yatay görsel ve videolar grid'de `object-cover` kare thumbnail olur; tıklanınca lightbox'ta kendi doğal oranına yakın `object-contain` şekilde açılır.
- Görsel/video thumbnail'ları hazır olana kadar Guest Memories section'ı tek bir yükleniyor katmanı göstermeli; kartların kendi içinde ayrı scrollbar, siyah video karesi veya yarım yüklenmiş boş medya kutuları görünmemelidir.
- Supabase Realtime Broadcast upload/delete sonrası admin ekranını tetikler; görünmeyen uzun fallback sadece bağlantı uyursa toparlamak için kalır.
- Favori ve gizle butonları V1'de kaldırılmıştır; public galeri olmadığı için çifte anlamlı değer üretmiyordu.
- İndirme `/api/media/[id]/download` üzerinden signed download ile yapılır.
- Silme doğrudan çalışmaz; önce onay modalı açılır. Evet derse Storage ve DB tarafında silinir, Hayır derse işlem yapılmaz.

Private Storage:

- Hamburger menüde ayrı, minimal bir panel olarak bulunur; Guest Memories'in üstünde büyük kota kartı gösterilmez.
- Plan, kullanılan/toplam storage, access süresi, Studio Code ve Premium Extension akışı burada gösterilir.
- Premium button Etsy listing URL env'i varsa listing'i açar; yoksa Studio Code kopyalama yönergesi gösterir.
- Demo admin panelinde gerçek para/upgrade aksiyonları çalışmaz; demo state yanıltıcı olmamalıdır.

Owner Upgrade Panel:

- `/owner/upgrades` sadece owner içindir ve customer-facing i18n akışından ayrı olarak Türkçe tutulur.
- `OWNER_ADMIN_PASSWORD` yoksa panel crash etmez; giriş formunda kontrollü hata gösterir.
- Studio Code ile gerçek galeri bulunur; upgrade uygulamak için Etsy sipariş no zorunludur.
- Etsy sipariş no ödeme kanıtı ve duplicate guard gibi davranır. Aynı sipariş no ikinci kez uygulanamaz.
- Premium Extension mevcut erişim bitiş tarihinin üstüne `+50 GB` ve `+6 ay` ekler; müşterinin Studio Code'u dışında ham token kullanılmaz.
- Gerçek müşteri kaydında test yapılırken upgrade submit edilmemeli; bağlantı testi için geçici wedding kaydı kullanılmalıdır.

Wedding Page:

- Profil fotoğrafı upload eder. Video PP kullanılmaz.
- Profil fotoğrafı client-side sıkıştırılır ve API tarafında 500 KB üstü profil fotoğrafı kabul edilmez.
- Profil fotoğrafı küçük olduğu için cihazda instant cache'e alınır; geri dönüş/login/admin/guest header'da mümkünse ilk render'da fotoğraf gösterilir, cache yoksa boş beyaz oval değil yükleniyor yüzeyi görünür.
- Bride/groom isimleri, event date, welcome note ve upload lock ayarlarını yönetir.
- İsim değişince misafir tarafındaki görünen çift adı da güncellenir; slug aynı kalır çünkü basılmış QR/link kırılmamalıdır.
- Profil medya da presigned upload ile R2'ye gider ancak guest storage kotasına dahil edilmez.

Demo:

- Demo çift: Mary & John.
- Demo admin route: `/admin/mary-john`.
- Demo guest route: `/mary-john?demo=1`.
- Demo profil görseli: `public/demo/beautiful-young-couple-hugging-great-wall-china.jpg`.
- Demo state localStorage ile simüle edilir; gerçek Supabase DB/Storage yazımı yapmaz.
- Demo admin ve demo misafir sayfalarında Help modalı görünür; demo modunda gerçek storage'a yazılmadığını anlatan ek kart gösterilir.

## i18n ve Yardım Modalları

- Varsayılan dil İngilizce'dir.
- `useLocale()` tarayıcı dilinden `en`, `es`, `fr`, `de`, `pt`, `zh` dillerini seçer; desteklenmeyen diller İngilizceye düşer.
- Customer-facing login/admin/guest metinleri bu 6 dile bağlı kalmalıdır; owner panel bilinçli olarak Türkçe-only iç araçtır.
- Login Help: Etsy token'ın nerede bulunacağı, isimlerin tokenla ilişkisi, studio açıldıktan sonra yapılacaklar ve gizlilik bilgisini anlatır.
- Admin Help: Guest Memories, Wedding Page, QR + Guest Link ve View Guest Page bölümlerini açıklar.
- Guest Help: QR sonrası misafirin fotoğraf, video, ses ve not gönderme akışını, gizliliği ve uygulama gerekmediğini anlatır.
- Yeni sabit arayüz metni eklenirse tek dile gömülmemeli; tüm desteklenen dillerde aynı anahtar setiyle `src/lib/i18n.ts` içine eklenmelidir.

## Misafir Sayfası

Misafir sayfası `/{coupleSlug}` ile açılır.

- Üstte çiftin profil fotoğrafı rozeti, çift adı, tarih ve welcome note görünür.
- Misafir sayfasında Help butonu vardır; bu modal QR ile gelen misafire ne gönderebileceğini, yüklemenin özel kaldığını ve sorun olursa dosya seçebileceğini anlatır.
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
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=say-yes-memories
NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL=
OWNER_ADMIN_PASSWORD=
```

Vercel tarafında Production, Preview ve Development ortamları için bu değerler girilmelidir. `SUPABASE_SERVICE_ROLE_KEY` ve R2 secret değerleri kesinlikle frontend'e açılmamalı; `NEXT_PUBLIC_` prefix'i almamalıdır.

## Güvenlik ve Veri Notları

- Service role sadece server route ve server helper içinde kullanılır.
- R2 bucket private kalır; görüntüleme ve indirme presigned GET URL ile yapılır.
- Upload prepare/complete iki aşamalıdır; complete aşaması storage path'in ilgili wedding/folder altında olduğunu ve `asset_` ID formatını doğrular.
- Dosya tipi image/video/audio ile sınırlıdır.
- Dosya boyutu sınırı uygulama tarafında 100 MB'dır.
- RLS migration'da enable edilir; uygulama server-side service role ile çalışır.

## Deploy Hazırlığı

Deploy hedefi Vercel'dir.

Deploy öncesi minimum kalite kapısı normalde GitHub push sırasında `pre-push` hook ile çalışır. Manuel çalıştırma sadece kullanıcı açıkça isterse veya riskli büyük değişiklik varsa yapılır:

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
