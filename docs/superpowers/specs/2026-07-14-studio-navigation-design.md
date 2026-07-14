# Studio Navigation Design

## Amaç

Çift, stüdyoyu ilk kez açtığında anılarını, Akış Modu'nu, düğün sayfasını ve QR alanını aramak zorunda kalmadan görmelidir. Navigasyon mobilde tek elle ulaşılabilir, masaüstünde ise sürekli görünür olmalıdır.

## Tasarım yönü

- İnsan: Düğün hazırlığı arasında teknik bir panel öğrenmek istemeyen çift.
- Ana görev: Düğün sayfasını hazırlamak, QR'ı almak ve gelen anıları izlemek.
- His: Ivory kâğıt, champagne detay ve siyah mürekkep dünyasında sakin bir düğün stüdyosu.
- Ürün alanı: davetiye, masa kartı, anı albümü, QR kartı, fotoğraf rozeti ve düğün kırtasiyesi.
- İmza öğesi: Mobilde kâğıt yüzeyin üzerinde yüzen beşli pill dock; masaüstünde aynı sırayı koruyan, sayfa zemininden kopmayan sidebar.
- Kaçınılan varsayılanlar: gizli hamburger menü, koyu blok sidebar ve yalnız ikon kullanan anlaşılmaz navigasyon.

## Mobil bilgi mimarisi

`1024px` altındaki ekranlarda sayfanın altında güvenli alanı hesaba katan floating pill bar bulunur:

1. Memories — mevcut Guest Memories panelini açar.
2. Flow Mode — demo veya gerçek üyeliğe uygun sunum route'una gider.
3. Wedding Page — mevcut wedding panelini açar.
4. QR — mevcut QR + Guest Link panelini açar.
5. More — alt sheet açar.

More sheet içeriği:

- Storage — mevcut storage panelini açar.
- View Guest Page — yeni sekmede misafir sayfasını açar.
- Help — bağlama özel yardım modalını açar.
- Logout — mevcut güvenli logout akışını başlatır.

More sheet backdrop dokunuşu, Close düğmesi ve Escape ile kapanır; odak sheet içinde tutulur ve kapanınca More düğmesine döner. Alt bar içerikle çakışmasın diye ana alana güvenli alt boşluk eklenir. Aktif panel siyah mürekkep dolgulu pill ile belirtilir. Flow Mode ayrı route olduğu için stüdyo ekranında aktif panel gibi işaretlenmez.

Mockupta üstte görünen ayrı Help düğmesi uygulanmayacaktır; Help yalnızca More içindedir. Hamburger düğmesi ve eski popup menü tamamen kaldırılır.

## Masaüstü bilgi mimarisi

`1024px` ve üstünde sol sidebar sürekli görünür. Sidebar ana içerikle aynı sıcak yüzeyi kullanır; yalnız düşük kontrastlı ayırıcı çizgiyle ayrılır.

Ana sıra:

- Memories
- Flow Mode
- Wedding Page
- QR + Guest Link

Altındaki `More` grubu daraltılmaz; keşfedilebilirlik için şu seçenekler sürekli görünür:

- Storage
- View Guest Page
- Help
- Logout

Logout sidebar'ın altına yaslanır. Aktif panel aynı siyah mürekkep pill dilini kullanır. Çift fotoğrafı ve adı sidebar'ın üstünde bağlam sağlar; mevcut ana içerik kartları yeniden tasarlanmaz.

## Bileşen yapısı

- Navigasyon tanımları tek veri yapısında tutulur; mobil dock ve masaüstü sidebar aynı label, ikon ve aksiyonları kullanır.
- Panel değiştirme mevcut `activePanel` state'ini korur; Guest Memories DOM'u cache davranışı bozulmadan yerinde kalır.
- More sheet ayrı, küçük bir erişilebilir bileşen olur; eski menü konum hesapları ve hamburger state'i kaldırılır.
- Bütün müşteri metinleri `src/lib/i18n.ts` içinde `en`, `es`, `fr`, `de`, `pt`, `zh` dillerinde eşit tutulur.
- Ağır panellerin mevcut lazy/dinamik yükleme davranışı korunur; yeni navigasyon ek paket getirmez.

## Hareket ve erişilebilirlik

- Mobil dock ilk yüklemede alttan çok hafif yükselir; panel değişiminde mevcut kısa enter/exit hareketi korunur.
- More sheet kısa opacity + translate animasyonu kullanır; bounce/spring kullanılmaz.
- `prefers-reduced-motion` açıkken hareket kaldırılır.
- Dokunma alanları en az 44px, aktif öğe yalnız renkle değil `aria-current` ile de belirtilir.
- Sidebar ve dock gerçek `nav` landmark'larıdır; Flow Mode ve View Guest Page gerçek link kalır.
- Klavye odağı, Escape, ekran okuyucu adları ve logout loading durumu korunur.

## Otomatik doğrulama

- iPhone 17 Pro Max'te beş navigasyon öğesi görünür ve yatay taşma olmaz.
- More sheet dört doğru aksiyonu gösterir; Help ve Logout üst alanda yinelenmez.
- Memories → Wedding Page → QR → Storage geçişleri doğru paneli açar.
- Guest Memories panelinden çıkıp dönünce thumbnail DOM/cache korunur.
- Flow Mode doğru demo/gerçek route'una gider; View Guest Page yeni sekme hedefini korur.
- Masaüstünde sidebar görünür, floating dock görünmez ve More grubu sürekli açıktır.
- Altı dilde navigasyon anahtarları eksiksizdir.
