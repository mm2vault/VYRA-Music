# VYRA Music

Mor temalı, özgün bir müzik platformu arayüzü. YouTube'u içerik kaynağı olarak bağlamak için YouTube Data API + YouTube IFrame Player API eklenebilir.

Bu paket şu anda tamamen frontend demo olarak çalışır; favoriler ve playlist isimleri localStorage'da tutulur.

## YouTube entegrasyonu
- YouTube Data API ile arama sonuçlarını getir.
- Sonuçlardaki videoId değerlerini YouTube IFrame Player'a ver.
- API anahtarını doğrudan açık kaynak frontend'e gömmek yerine mümkünse küçük bir backend/proxy üzerinden sınırla.
- YouTube içeriğini indirip MP3 olarak yeniden dağıtma; resmi embed/player akışını kullan.

## Açma
index.html dosyasını aç.
