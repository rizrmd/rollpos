# Petunjuk Arsitektur RollPOS

## Tahap awal: offline satu perangkat

- RollPOS saat ini adalah aplikasi frontend-only dan tidak membutuhkan backend, REST API, atau database server.
- Semua fitur dan data operasional disimpan secara lokal di satu perangkat/browser menggunakan pola TinyBase + IndexedDB yang sudah ada.
- Jangan menambahkan PostgreSQL, server Bun, layanan cloud database, sinkronisasi, atau sumber kebenaran server sampai arah produk diubah secara eksplisit.
- Jangan membuat fallback ganda. TinyBase/IndexedDB adalah satu-satunya source of truth pada tahap ini.
- Pertahankan struktur domain yang berguna seperti lot dan ledger stock movement di penyimpanan lokal agar dapat dikembangkan nanti tanpa membangun infrastruktur server sekarang.
- Keterbatasan yang diterima: data tidak tersinkron antarperangkat, hilang bila storage browser dihapus, dan hanya tersedia pada perangkat/browser yang membuatnya.

## Deployment

- Build frontend dengan Vite dan layani hasil build melalui `vite preview` pada port sandbox yang dikonfigurasi.
- Jangan menjalankan migration, seed server, atau meminta `DATABASE_URL`.
