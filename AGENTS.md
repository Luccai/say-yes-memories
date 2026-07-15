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
- Kopyalama aksiyonları ortak `CopyButton` ile çalışır: ikon ve metin `Copy`den `Copied`e 1.4 saniye geçer; her ekranda ayrı clipboard state’i yazılmaz.

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
- Playwright mobil varsayılanı iPhone 17 Pro Max emülasyonudur; ek kapsama için 360 px ve 390 px Android viewportları korunur.

## Route Haritası

- `/`: `/login` sayfasına redirect eder.
- `/login`: ilk kurulumda önce Etsy tokenını sunucuda kontrol eden, sonra çift bilgileri ve şifreyi isteyen iki aşamalı aktivasyon; geri dönen cihazda stüdyoya giriş kartı ve Mary & John demo CTA'sı.
- `/admin`: HTTP-only session cookie ile gerçek çift admin paneli.
- `/admin/mary-john`: Mary & John demo admin paneli.
- `/admin/presentation`: gerçek üyeliğin tam ekran Akış Modu.
- `/admin/mary-john/presentation`: storage yazmayan demo Akış Modu.
- `/owner`: Türkçe owner kokpiti; üyelik, token, paket, temizlik, cihaz ve sistem durumunu yönetir.
- `/owner/upgrades`: eski uyumluluk route'udur ve `/owner` adresine yönlendirir.
- `/{coupleSlug}`: gerçek misafir upload sayfası.
- `/mary-john?demo=1`: demo misafir upload sayfası.

API route'ları:

- `/api/auth/activation-token`: ilk kurulumun ilk adımında normalize edilmiş tokenın aktivasyona uygunluğunu hız sınırıyla kontrol eder; tokenı ayırmaz veya tüketmez ve kullanılmış/geçersiz durum ayrıntısını dışarı açmaz.
- `/api/auth/activate`: token + iki isim + şifre + düğün tarihi + saat dilimiyle atomik ilk aktivasyon.
- `/api/auth/login`: aynı cihazda slug + şifre, yeni cihazda aktif token + şifre ile giriş.
- `/api/auth/recover`: aktif tokenla şifreyi yeniler ve bütün eski oturumları kapatır.
- `/api/auth/session`: mevcut session'daki wedding bilgisini döner.
- `/api/auth/logout`: sunucu oturumunu iptal eder ve cookie'yi temizler.
- `/api/owner/setup`: yalnızca bir kez çalışan kurulum koduyla ilk owner şifresi ve cihaz oturumu açar.
- `/api/owner/login`, `/api/owner/session`, `/api/owner/logout`: hash'li, cihaz bazlı ve kullanıldıkça 90 gün yenilenen owner oturumlarını yönetir.
- `/api/owner/*`: çift arama/detay, token, paket/düzeltme, temizlik, hareket, cihaz, şifre ve sistem durumu API'leridir.
- `/api/owner/upgrades/apply`: kaldırılmış eski Studio Code akışıdır ve `410` döner.
- `/api/uploads/[slug]`, `/prepare` ve `/complete`: kaldırılmış eski upload akışıdır ve `410` döner.
- `POST /api/uploads/[slug]/reservations`: Turnstile doğrular, atomik kota ayırır ve küçük upload hedefini ya da multipart planını döner.
- `GET/DELETE /api/uploads/[slug]/reservations/[reservationId]`: yarım upload durumunu döndürür veya güvenli biçimde iptal eder.
- `POST /api/uploads/[slug]/reservations/[reservationId]/parts/[partNumber]`: eksik multipart parçasına kısa ömürlü R2 hedefi üretir.
- `POST /api/uploads/[slug]/reservations/[reservationId]/parts/[partNumber]/complete`: parçanın ETag ve boyutunu doğrulanmış reservation'a kaydeder.
- `POST /api/uploads/[slug]/reservations/[reservationId]/complete`: staging objesini tekil final adrese taşır ve kota/media kaydını yalnız bir kez kesinleştirir.
- Archive route'ları ve `workers/archive-runner` gelecekteki toplu ZIP indirme özelliği için korunur; launch'ta UI'dan erişilemez ve environment değerleri tanımlanmaz.
- `GET /api/cron/daily-maintenance`: yalnız `CRON_SECRET` Bearer ile çalışan günlük reservation, deletion queue ve sistem sağlığı işidir.
- `/api/weddings/current`: müşteri için yalnızca welcome note ve upload lock alanlarını günceller; isim/tarih değişikliği owner'a özeldir.
- `/api/weddings/current/media`: admin memory inbox listesini döner.
- `/api/weddings/current/profile-media/prepare`: admin profil fotoğrafı için R2 presigned PUT hedefi üretir.
- `/api/weddings/current/profile-media/complete`: profil fotoğrafını doğrular ve wedding kaydına bağlar.
- `DELETE /api/weddings/current/profile-media`: mevcut profil fotoğrafını onaylı arayüz akışından kaldırır; beklenen `profile_media_id` değişmişse yeni fotoğrafa dokunmaz, R2 silme başarısız olursa metadata'yı yalnız profil alanı hâlâ boşken geri yüklemeyi dener.
- `/api/media/[id]`: admin media update/delete işlemleri.
- `/api/media/[id]/download`: admin indirme için kısa süreli signed download URL'ye redirect eder.

## Veri Modeli

Supabase migration dosyaları:

- `supabase/migrations/20260620172446_init_say_yes_schema.sql`: temel wedding, token, media ve session şeması.
- `supabase/migrations/20260621130000_add_wedding_media_thumbnails.sql`: media thumbnail alanları.
- `supabase/migrations/20260621164000_allow_more_audio_mime_types.sql`: ek audio MIME tipleri.
- `supabase/migrations/20260629120000_add_r2_quota_and_upgrades.sql`: R2 kota/access alanları, Studio Code, upgrade logları ve quota RPC'leri.
- `supabase/migrations/20260711114338_product_ready_core.sql`: şifreli müşteri üyeliği, ortak slug/alias alanı, değişmez hak hareketleri, kota rezervasyonları ve güvenli silme kuyruğu.
- `supabase/migrations/20260711180000_add_auth_rate_limits.sql`: veritabanı tabanlı giriş deneme sınırları.
- `supabase/migrations/20260711203000_add_owner_cockpit.sql`: owner kimliği, 90 günlük cihaz oturumları, token yaşam döngüsü, kokpit sorguları ve onaylı temizlik.
- `supabase/migrations/20260712120000_add_secure_multipart_uploads.sql`: 5 GiB upload, atomik kota reservation'ı, multipart parça durumu ve tek seferlik completion.
- `supabase/migrations/20260712143000_add_daily_maintenance.sql`: yarım upload/R2 cleanup durumu, güvenli deletion job claim/retry ve günlük bakım RPC'leri.
- `supabase/migrations/20260712160000_add_presentation_media_index.sql`: Akış Modu için kararlı eski-yeni medya sıralama indeksi.
- `supabase/migrations/20260714133000_add_memory_archives.sql`: sabit medya snapshot'ı, 24 saatlik ZIP işi, kaynak özeti ve güvenli R2 cleanup kaydı.

Ana tablolar:

- `weddings`: çift bilgisi, slug, studio code, plan, kota, access süresi, welcome note, upload kilidi ve profil medya metadata'sı.
- `tokens`: hash'li Etsy token kayıtları; ham token repo'ya girmez.
- `wedding_media`: misafir medya metadata'sı.
- `upgrade_logs`: owner panelden uygulanan Premium Extension kayıtları.
- `sessions`: HTTP-only cookie ile eşleşen admin session kayıtları.
- `wedding_slugs`: canonical ve eski yönlendirme adresleri; isim değişse de eski QR çalışır.
- `entitlement_events`: Classic, Premium Extension, tarih değişikliği ve kayıtlı düzeltmelerin değiştirilemeyen hareket defteri.
- `owner_credentials`, `owner_sessions`, `owner_audit_logs`: owner şifresi, cihaz oturumları ve hareket geçmişi.
- `system_health_checks`, `media_deletion_jobs`: günlük servis kontrolü ve owner onaylı R2 silme kuyruğu.
- `archive_jobs`, `archive_job_items`: satış sonrası açılacak toplu ZIP indirme özelliğinin ayrılmış veri modelidir; launch'ta kullanılmaz.
- `upload_reservations`, `upload_parts`: 24 saatlik kota ayırma, küçük/multipart staging, resume, iptal ve parça kayıtları.

Storage bucket:

- Varsayılan bucket: `say-yes-memories`.
- Bucket private olmalı.
- Misafir ve profil dosyaları doğrudan Cloudflare R2'ye presigned PUT ile yüklenir.
- Next.js API route'ları büyük dosyayı body olarak taşımamalı; Vercel serverless limitleri için bu kritik.
- Tek misafir dosyası üst sınırı 5 GiB'dir. 100 MiB ve altı tek staging PUT, daha büyük dosyalar 64 MiB multipart parçaları kullanır; mobil eşzamanlı parça sayısı en fazla 3'tür.
- Signed hedef verilmeden önce veritabanında atomik kota ayrılır. Reservation 24 saat sonra sona erer; kota yalnız bir kez geri bırakılır.
- Upload tamamlanınca staging obje tekil final adrese taşınır. Eski signed staging adresinin tekrar kullanılması tamamlanmış medyayı değiştiremez.
- Supabase yalnız metadata, `storage_used_bytes`, ayrılmış kota, access süresi ve değişmez hak hareketlerini tutar.
- Profil ve thumbnail boyutları çift kotasına girmez; `system_storage_bytes` altında ayrıca izlenir.
- Classic paket 50 GB ve düğün tarihinden itibaren 3 ay access verir. Premium Extension +50 GB ve mevcut access bitişine +6 ay ekler.
- Kota dolunca misafir upload hard stop olur. Access bitince upload kapanır; dosyalar 30 gün cleanup grace sonrası owner cleanup için adaydır.
- R2 bucket private kalır. CORS production/preview originlerini açıkça izinli saymalı, `PUT` ve `Content-Type` kabul etmeli, multipart client için `ETag` başlığını expose etmelidir.
- R2 lifecycle yalnız tamamlanmamış multipart uploadları 1 gün sonra abort eder; tamamlanmış müşteri objelerine otomatik expiry konmaz.
- Toplu ZIP indirme satış sonrası değerlendirilecek bir kolaylıktır; launch'ta ücretli Cloudflare Container planına bağımlılık oluşturmamak için kapalı tutulur. Çiftler galeriden her medyayı tek tek indirebilir.

## Auth ve Token Akışı

- Token frontend'de kalıcı saklanmaz.
- Token girişte kırpılır ve büyük harfe dönüştürülür. İlk kurulumun ön kontrolü yalnız uygun tokenı ikinci adıma geçirir; gerçek hak sahipliği ve eşzamanlı kullanım koruması yine atomik aktivasyonda kesinleşir.
- Token normalize edilip SHA-256 hash ile `tokens.token_hash` karşılaştırılır.
- İlk başarılı aktivasyon tek veritabanı işleminde wedding, canonical slug ve hash'li session oluşturur; aynı token eşzamanlı ikinci üyelik açamaz.
- Şifreler kişiye özel salt, scrypt ve sunucu `AUTH_PASSWORD_PEPPER` değeriyle korunur; açık şifre saklanmaz.
- Aynı cihaz yalnızca slug/çift adı/profil ipucunu hatırlar; token ve şifre tarayıcıda saklanmaz.
- Logout gerçek sunucu oturumunu iptal eder. Aktif tokenla recovery bütün eski oturumları kapatır.
- Admin route'ları `getCurrentWeddingFromCookie()` ile server tarafında session doğrular.

## Admin Panel Davranışı

Admin ana ekranı mobilde sade kalmalıdır:

- Mobilde üstte profil rozeti ve taşmayan çift adı; altta tek elle erişilen floating pill navigasyon bulunur.
- Varsayılan panel: Guest Memories.
- Mobil ana navigasyon: Memories, Flow Mode, Wedding Page, QR ve More. More içinde Storage, View Guest Page ve Logout bulunur.
- Masaüstünde aynı bilgi mimarisi sürekli görünen sol sidebar olarak sunulur; More bölümü açık kalır.
- Help, çift adının sağ üstündeki kompakt ikon düğmesidir; More içinde tekrar edilmez.
- Logout More bölümünde küçük aksiyon gibi görünür ve `/login` sayfasına döndürür.
- View Guest Page yeni sekmede misafir sayfasını açar; QR panelinde ayrıca ikinci bir misafir sayfası butonu tutulmaz.
- `AdminExperience.tsx` yalnız veri, realtime/demo senkronu ve API callback orkestrasyonunu tutar. Shell, header, paneller, galeri, lightbox, silme ve Premium parçaları `src/components/admin/` altındaki ayrı bileşenlerde kalmalıdır; bu sorumluluklar yeniden tek dosyada birleştirilmemelidir.
- `AdminShell` panel state/geçişlerini yönetir. Memories paneli thumbnail belleğini korumak için panel değişiminde unmount edilmez; görünmez hale getirilir. Flow Mode iç geçişleri Next.js `Link` kullanır, tam sayfa yenilemeyle bellek cache'i sıfırlanmaz.

Guest Memories:

- Misafir uploadları admin ekranında görünür Check Again butonu olmadan yenilenmelidir.
- Classic, Story ve Compact düzenleri tek tıkla döngüye girmemeli; mevcut düzeni gösteren küçük bir menüden doğrudan seçilmelidir.
- Düzen ve sıralama menüleri açıldığında seçili öğeye odaklanır; Arrow Up/Down, Home, End, Enter ve Escape ile kullanılabilir.
- Everything, Photos, Videos ve Voice filtreleri toplam medya adetini göstermeli; Newest / Oldest sıralaması doğrudan seçilebilmelidir.
- Guest Memories, küçük kare albüm grid'i olarak görünmelidir. Dikey/yatay görsel ve videolar grid'de `object-cover` kare thumbnail olur; tıklanınca lightbox'ta kendi doğal oranına yakın `object-contain` şekilde açılır.
- Görsel/video thumbnail'ları hazır olana kadar Guest Memories section'ı tek bir yükleniyor katmanı göstermeli; kartların kendi içinde ayrı scrollbar, siyah video karesi veya yarım yüklenmiş boş medya kutuları görünmemelidir.
- Supabase Realtime Broadcast upload/delete sonrası admin ekranını tetikler; görünmeyen uzun fallback sadece bağlantı uyursa toparlamak için kalır.
- Favori ve gizle butonları V1'de kaldırılmıştır; public galeri olmadığı için çifte anlamlı değer üretmiyordu.
- İndirme `/api/media/[id]/download` üzerinden signed download ile yapılır.
- Silme doğrudan çalışmaz; önce onay modalı açılır. Evet derse Storage ve DB tarafında silinir, Hayır derse işlem yapılmaz.

Akış Modu:

- Gerçek üyelik `/admin/presentation`, demo `/admin/mary-john/presentation` adresinden açılır.
- Medyalar eskiden yeniye oynar; fotoğraf 3 saniye kalır, video/ses bitince ilerler ve liste döngüye girer.
- Fotoğraf ve video tam viewport sahnede `object-contain` ile gösterilir; dikey içerikte aynı görselin yumuşak arka planı kullanılır. Ses kaydı sade, merkezlenmiş bir oynatıcı kartında kalır.
- Dokunma/tıklama durdurur veya sürdürür; ok tuşları önceki/sonraki medyaya geçer ve tam ekran desteklenir.
- Video/ses oynatma hatası görünür bir aksiyonla atlanabilir. `prefers-reduced-motion` ayarı korunur.

Private Storage:

- Mobilde More, masaüstünde sidebar'ın More bölümü altında ayrı ve minimal bir panel olarak bulunur; Guest Memories'in üstünde büyük kota kartı gösterilmez.
- Plan, kullanılan/toplam storage, access süresi, çift adı ve Premium Extension akışı burada gösterilir.
- Premium button Etsy listing URL env'i varsa listing'i açar; müşteri Etsy personalization alanına yalnızca paneldeki çift adını yazar.
- Launch'ta toplu ZIP indirme gösterilmez; ücretli altyapı gerektirmeden galeri içindeki tekil indirme aksiyonları kullanılmaya devam eder.
- Demo admin panelinde Premium modalı paket önizlemesi olarak açılır. `+50 GB` ve `+6 ay` görünür; çift adı kopyalama ve Etsy satın alma aksiyonu pasif kalır ve CTA açıkça Demo only bilgisini taşır.

Owner Kokpiti:

- `/owner` customer-facing i18n akışından ayrı ve Türkçe tutulur.
- İlk açılış `OWNER_SETUP_SECRET` ile tek kullanımlık kurulum ister; owner şifresi en az 12 karakterdir ve açık saklanmaz.
- Owner oturumu sunucuda yalnızca hash'li anahtarla tutulur, kullanıldıkça 90 gün yenilenir ve Ayarlar'dan cihaz bazında kapatılır.
- Genel Bakış, Çiftler, Tokenlar, Hareketler, Temizlik, Ayarlar ve Sistem Durumu bölümleri vardır.
- Çift araması `Fatma Mihail` ile `Fatma & Mihail` yazımını aynı üyelik için bulur; aynı isimli üyelikler slug ve açılış tarihiyle ayırt edilir.
- Premium Extension seçilen üyeliğe tam `+50 GB` ve `+6 ay` ekler. Aynı operation key yeniden gönderilirse ikinci kez uygulanmaz.
- Yanlış pakette geçmiş silinmez; zorunlu nedenli reversal hareketi eklenir ve bütün haklar yeniden hesaplanır.
- Temizlik yalnızca 30 günlük indirme dönemi bittikten sonra, tam slug yazılarak owner onayıyla başlar. R2 işleri bitmeden üyelik anonimleştirilmez.
- Gerçek müşteri kaydında write-test yapılmaz; tüm canlı doğrulama geçici wedding ve ayrı storage klasörüyle yürütülür.

Wedding Page:

- Profil fotoğrafı upload eder. Video PP kullanılmaz.
- Profil fotoğrafı varsa `Add photo` yerine `Change photo` ve onay isteyen `Remove photo` aksiyonları görünür; kaldırma metadata kaydını, R2 objesini ve cihazdaki instant/cache kopyasını temizler, eşzamanlı fotoğraf değişimini ezmez ve masaüstü/mobilde aynı davranır.
- Profil yükleme ve sayfa kaydetme hataları native tarayıcı alert'i açmaz; ortak, erişilebilir uygulama toast'ında gösterilir. Alan doğrulama hataları bağlamını kaybetmemek için inline kalır.
- Upload durumu pulse veya glow kullanmaz; açık durumda statik sage noktalı, hafif yüzeyli küçük bir pill ile gösterilir.
- Profil fotoğrafı client-side sıkıştırılır ve API tarafında 500 KB üstü profil fotoğrafı kabul edilmez.
- Profil fotoğrafı küçük olduğu için cihazda instant cache'e alınır; geri dönüş/login/admin/guest header'da mümkünse ilk render'da fotoğraf gösterilir, cache yoksa boş beyaz oval değil yükleniyor yüzeyi görünür.
- Müşteri profil fotoğrafı, welcome note ve upload lock ayarlarını yönetir; isim ve düğün tarihi güvenlik için salt okunurdur.
- İsim/tarih yalnızca owner kokpitinden değişir. Yeni canonical slug üretilir; eski slug alias olarak kaldığı için basılmış QR/link yeni adrese yönlenir.
- Salt okunur düğün tarihi ham ISO metin olarak basılmaz; ziyaretçinin aktif diliyle `formatWeddingDate()` üzerinden gösterilir.
- Profil medya da presigned upload ile R2'ye gider ancak guest storage kotasına dahil edilmez.

Demo:

- Demo çift: Mary & John.
- Demo admin route: `/admin/mary-john`.
- Demo guest route: `/mary-john?demo=1`.
- Demo profil görseli: `public/demo/demo-couple-1-thumb.webp`.
- Login ve owner ekranlarındaki marka rozeti: `public/brand/logo.png`; tarayıcı sekmesi ikonu da aynı kaynakla `src/app/icon.png` üzerinden üretilir.
- Demo stüdyo state'i localStorage ile simüle edilir; gerçek Supabase DB/Storage yazımı yapmaz. Demo misafir sayfası salt okunur önizlemedir: alanlar, dosya/ses seçimi ve Send memory pasiftir; tarayıcıya da upload kaydı yazmaz.
- Demo admin ve demo misafir sayfalarında Help modalı görünür; demo modunda gerçek storage'a yazılmadığını anlatan ek kart gösterilir.

## i18n ve Yardım Modalları

- Varsayılan dil İngilizce'dir.
- `useLocale()` tarayıcı dilinden `en`, `es`, `fr`, `de`, `pt`, `zh` dillerini seçer; desteklenmeyen diller İngilizceye düşer.
- Customer-facing login/admin/guest metinleri bu 6 dile bağlı kalmalıdır; owner panel bilinçli olarak Türkçe-only iç araçtır.
- Login Help: Etsy token'ın nerede bulunacağı, isimlerin tokenla ilişkisi, studio açıldıktan sonra yapılacaklar ve gizlilik bilgisini anlatır.
- Admin Help: Guest Memories, Wedding Page, QR + Guest Link, Private Storage/Premium akışı, View Guest Page ve Flow Mode kontrollerini açıklar.
- Guest Help: QR sonrası misafirin fotoğraf, video, ses ve not gönderme akışını, gizliliği ve uygulama gerekmediğini anlatır; demo açıklaması bunun salt okunur önizleme olduğunu ve hiçbir dosyanın yüklenmediğini netleştirir.
- Yeni sabit arayüz metni eklenirse tek dile gömülmemeli; tüm desteklenen dillerde aynı anahtar setiyle `src/lib/i18n.ts` içine eklenmelidir.

## Misafir Sayfası

Misafir sayfası `/{coupleSlug}` ile açılır.

- Üstte çiftin profil fotoğrafı rozeti, çift adı ve tarih görünür; welcome note aynı hero kartının içinde ayrı inset paper kartında okunur. Send memory, koyu ink pill ve gönderme ikonu kullanır.
- Misafir sayfasındaki Help, her ekran genişliğinde yalnız ikon olarak görünür; yerelleştirilmiş erişilebilir adı korunur ve uzun çift adının üstüne taşmaz. Açtığı modal QR ile gelen misafire ne gönderebileceğini, yüklemenin özel kaldığını ve sorun olursa dosya seçebileceğini anlatır.
- Misafir adını, opsiyonel notu ve foto/video/ses dosyasını gönderir.
- Upload; dosya seçimi/önizleme, Turnstile, kota reservation'ı, ilerleme, iptal/yeniden dene ve başarı adımlarını izler.
- Büyük uploadlarda eksik multipart parçaları yeniden seçilen aynı dosyayla sürdürülebilir; mobilde en fazla üç parça aynı anda gider.
- Ses kaydı tarayıcı MediaRecorder ile alınır, 5 dakikada otomatik durur ve mikrofon track'leri her çıkışta kapatılır; destek yoksa kullanıcı dosya seçebilir.
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
AUTH_PASSWORD_PEPPER=
AUTH_RATE_LIMIT_SECRET=
OWNER_SETUP_SECRET=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_EXPECTED_HOSTNAMES=
CRON_SECRET=
```

Vercel tarafında gerekli değerler Production, Preview ve Development ortamlarına bilinçli olarak dağıtılmalıdır. `SUPABASE_SERVICE_ROLE_KEY`, R2 secret, `AUTH_*`, `OWNER_SETUP_SECRET`, `TURNSTILE_SECRET_KEY` ve `CRON_SECRET` kesinlikle frontend'e açılmamalı; `NEXT_PUBLIC_` prefix'i almamalıdır. Archive değerleri yalnız toplu ZIP özelliği satış sonrası açılırsa eklenir.

- `AUTH_PASSWORD_PEPPER`, `AUTH_RATE_LIMIT_SECRET`, `OWNER_SETUP_SECRET` ve `CRON_SECRET` en az 32 byte olmalıdır.
- Aynı Supabase veritabanını kullanan ortamlar aynı `AUTH_PASSWORD_PEPPER` değerini kullanır; bu değeri plansız değiştirmek mevcut şifreleri geçersiz kılar.
- `OWNER_SETUP_SECRET` yalnız ilk owner kurulumuna kadar tutulur; owner şifresini belirledikten sonra Vercel'den kaldırılır.
- `TURNSTILE_EXPECTED_HOSTNAMES` şemasız, virgülle ayrılmış hostname listesidir. Preview ve production için ayrı Turnstile widget/anahtarları tercih edilir.
- Invisible Turnstile kullanımı login ekranındaki Privacy & data modalında açıklanmalı; bu metin 6 dilde eşit tutulmalıdır.
- `NEXT_PUBLIC_ETSY_PREMIUM_UPGRADE_URL` opsiyoneldir; boşsa müşteri arayüzü satın alma bağlantısını açmaz.

## Güvenlik ve Veri Notları

- Service role sadece server route ve server helper içinde kullanılır.
- R2 bucket private kalır; görüntüleme ve indirme presigned GET URL ile yapılır.
- Her guest upload önce sunucuda Turnstile doğrulamasından, sonra atomik reservation'dan geçer. Tarayıcı R2 internal path veya multipart upload ID görmez.
- Reservation secret yalnız hash'li karşılaştırılır; completion ilgili wedding ve reservation'a bağlı tekil final path kullanır.
- Dosya tipi image/video/audio ile sınırlıdır.
- Tek dosya sınırı 5 GiB'dir; 100 MiB yalnız tek PUT ile multipart arasındaki teknik eşiktir, müşteri dosya sınırı değildir.
- RLS migration'da enable edilir; uygulama server-side service role ile çalışır.
- Günlük cron 24 saati geçen reservation'ları kapatır, yarım R2 uploadlarını ve owner onaylı deletion job'larını işler, Supabase/R2 sağlığını owner paneline yazar.
- Gerçek müşteri üyeliğinde, tokenında, kotasında, paketinde veya dosyasında write-test kesinlikle yapılmaz. Canlı doğrulama benzersiz geçici üyelik ve ayrı R2 prefix ile yapılır; sonra geçici kayıtlar açıkça temizlenir.

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
- R2 CORS `ETag` expose etmeli; tamamlanmamış multipart lifecycle süresi 1 gün olmalı.
- Production Turnstile hostname, site key ve secret eşleşmeli.
- `vercel.json` içindeki `/api/cron/daily-maintenance` yalnız production deploy'da kaydolur; `CRON_SECRET` olmadan route fail-closed davranır.
- Migration'lar dosya sırasıyla ve yeni kod deploy edilmeden önce uygulanmalı; rollback eski Vercel sürümüne yapılır, eklemeli migration'lar aceleyle geri alınmaz.

Ayrıntılı canlı geçiş, geçici üyelik doğrulaması ve rollback sırası `docs/production-runbook.md` dosyasındadır.
