# Upgrade — sinkron dengan upstream Plane

Fork ini punya remote `upstream` = `makeplane/plane`. Modifikasi kantor sengaja
diisolasi di folder `paradise/` + beberapa file rebrand kecil, supaya merge
upstream jarang bentrok.

## Ambil update upstream

```bash
git fetch upstream
git log --oneline main..upstream/main   # lihat apa yang baru
git merge upstream/main                  # atau rebase kalau lebih suka linear
```

> Repo awal di-clone shallow (`--depth 1`). Kalau `fetch upstream` minta history
> lebih dalam: `git fetch --unshallow upstream` (sekali saja).

## Titik yang mungkin konflik

Perubahan kantor menyentuh file milik upstream ini — cek saat merge:

- `package.json` (nama/desc root) — rebrand
- `apps/web/app/root.tsx` (`APP_TITLE`) — rebrand
- `apps/web/manifest.json`, `apps/web/public/manifest.json` — rebrand
- `.gitignore` — tambahan aturan office

Semua yang lain di `paradise/` dan `NOTICE.md` **milik fork**, tidak akan bentrok.

## Setelah upgrade

1. `paradise/bin/dev.sh rebuild` (dev) atau rebuild image prod.
2. Migrasi DB jalan otomatis di container `api`.
3. `paradise/bin/healthcheck.sh`.
4. Ulangi [`SECURITY-CHECKLIST.md`](SECURITY-CHECKLIST.md) bila upstream menambah env baru.
