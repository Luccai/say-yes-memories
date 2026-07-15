# Production cutover runbook

Bu sıra gerçek müşteri verisine yanlışlıkla yazmamak ve gerektiğinde eski Vercel sürümüne dönebilmek için değişmez kabul edilir.

## 1. Değişiklik öncesi güvenlik

1. Supabase mantıksal yedeğini ve R2 obje listesini repo dışına al; şifrele ve SHA-256 değerini kaydet.
2. Canlı sayaçları kaydet: üyelik, medya, oturum, kullanılmamış token ve paket hareketi.
3. Mevcut production Vercel deployment kimliğini, R2 CORS ve lifecycle ayarlarını kaydet.
4. Snapshot beklenmedik biçimde değişmişse canlı geçişi durdur ve farkı incele.

Gerçek müşteri kaydı, tokenı, kotası, paketi veya dosyası üzerinde write-test yapılmaz.

## 2. Cloudflare R2 ve Turnstile

- Bucket private kalır.
- CORS yalnız bilinen production/preview/local originlerini içerir.
- İzinli yöntemler: `GET`, `HEAD`, `PUT`.
- İzinli header: `Content-Type`.
- Görünür response header: `ETag`.
- `MaxAgeSeconds`: `3600`.
- Lifecycle yalnız tamamlanmamış multipart uploadları 1 gün sonra abort eder. Tamamlanmış `weddings/` objelerine otomatik silme kuralı eklenmez.
- Production ve preview için mümkünse ayrı Turnstile widget kullanılır; hostname listesi şemasız yazılır.
- Invisible mod kullanılıyorsa login ekranındaki Privacy & data modalında Cloudflare Turnstile Privacy Addendum bağlantısı production'da görünür olmalıdır.

## 3. Vercel secret ve bağlantı kontrolü

1. Mevcut `say-yes-memories` projesi ve doğru scope açıkça doğrulanır; worktree'den körlemesine yeni proje oluşturulmaz.
2. `.env.example` içindeki değerler gereken Production/Preview/Development ortamlarına eklenir.
3. `AUTH_PASSWORD_PEPPER`, `AUTH_RATE_LIMIT_SECRET`, `OWNER_SETUP_SECRET`, `CRON_SECRET`, `ARCHIVE_DISPATCH_SECRET` ve `ARCHIVE_CALLBACK_SECRET` birbirinden bağımsız, en az 32 byte rastgele değerlerdir.
4. Aynı Supabase veritabanını kullanan deploy'lar aynı `AUTH_PASSWORD_PEPPER` değerini kullanır.
5. `NEXT_PUBLIC_` almayan secret değerler istemci bundle'ına açılmaz.

## 4. Supabase migration sırası

Dosya adına göre sırayla uygula:

1. `20260711114338_product_ready_core.sql`
2. `20260711180000_add_auth_rate_limits.sql`
3. `20260711203000_add_owner_cockpit.sql`
4. `20260712120000_add_secure_multipart_uploads.sql`
5. `20260712143000_add_daily_maintenance.sql`
6. `20260712160000_add_presentation_media_index.sql`
7. `20260714133000_add_memory_archives.sql`

Migration'lar eklemelidir. Başarısız deploy'da tabloları aceleyle geri silme; önce önceki Vercel deployment'ına dön.

## 5. Otomatik kalite kapıları

```bash
bun run verify:release
```

Bu komut lint, TypeScript, birim/kontrat testleri, production build, iPhone 17 Pro Max emülasyonu, 360/390 px Android ve masaüstü Playwright akışları ile Lighthouse mobil eşiklerini çalıştırır. Hedefler: performans en az 85, erişilebilirlik en az 95, LCP en fazla 2,5 saniye ve CLS en fazla 0,1.

Supabase SQL kontratları canlıda yalnız `BEGIN ... ROLLBACK` içinde çalıştırılır.

## 6. Preview ve geçici üyelik

1. Push edilecek main commitinden oluşturulan Preview adresini doğrula.
2. Benzersiz bir geçici token ve çift adı üret; ayrı `weddings/<temporary-id>/` R2 prefix'i kullan.
3. Aktivasyon, aynı cihaz giriş, logout, tokenlı recovery, küçük upload ve multipart upload akışlarını doğrula.
4. Geçici üyelikte galeri içindeki tekil fotoğraf, video ve ses indirmelerini doğrula; gerçek müşteri dosyasını indirme.
5. Owner aramasında geçici çifti bul; +50 GB/+6 ay paketini benzersiz işlem anahtarıyla uygula ve aynı anahtarın ikinci kez uygulanmadığını doğrula.
6. Geçici kaydı owner temizlik akışıyla sil; `weddings/<temporary-id>/` prefix'inin boşaldığını doğrula.
7. Gerçek iki test üyeliğini yalnız devre dışı bırak; dokuz eski medya kaydını kullanıcı açıkça kalıcı silme onayı verene kadar koru.

## 7. Production, owner kurulumu ve rollback

1. Preview yeşilse production dalını yalnız fast-forward ile ilerlet veya doğrulanmış deployment'ı production'a promote et.
2. `/owner` tek kullanımlık kurulum sayfasını aç; owner şifresini kullanıcı doğrudan belirler.
3. Kurulum biter bitmez `OWNER_SETUP_SECRET` değerini Vercel'den kaldır ve yeni production deployment oluştur.
4. `/api/cron/daily-maintenance` production'da `CRON_SECRET` Bearer ile çalışmalı ve sonucu owner Sistem Durumu bölümüne yazmalıdır.
5. Sorunda önceki Vercel deployment'ına rollback yap. Eklemeli Supabase alanları eski uygulamayı bozmamalıdır.
6. Doğrulama tamamlanınca snapshot'taki eski kullanılmamış tokenlar hedefli işlemle iptal edilir; yeni üretilmiş tokenlara dokunulmaz.

## 8. Bulk archive runner (satış sonrası)

Toplu ZIP indirme launch'ta kapalıdır; Cloudflare'ın ücretli Container planını
gerektirir. Ürün satışa geçip bu kolaylık gerçek ihtiyaç olursa archive runner
deploy akışı ayrıca planlanır ve geçici üyelikte uçtan uca doğrulanır.
