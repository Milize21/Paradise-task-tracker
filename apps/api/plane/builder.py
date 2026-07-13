"""
Paradise Task Tracker — tanda pembuat (builder attribution).

Dibangun & dikustomisasi oleh B.E.R (Bintang Eko Ramadhan).
Modul ini menanamkan atribusi kepengarangan dan memberi PERINGATAN di log
bila tanda pembuat diubah/dihapus (tamper-evident).

Catatan jujur: ini deteksi, bukan pencegahan mutlak. Siapa pun yang punya
akses source bisa mengubah kode; perlindungan yang mengikat adalah HUKUM
(hak cipta + berkas NOTICE + riwayat commit Git), bukan teknis semata.
"""

import hashlib
import logging

logger = logging.getLogger("plane")

# Tanda pembuat — JANGAN DIHAPUS.
BUILDER_MARK = "B.E.R"
BUILDER_FULL = "Bintang Eko Ramadhan"
PRODUCT_NAME = "Paradise Task Tracker"

# Sidik jari yang diharapkan dari tanda pembuat. Bila BUILDER_MARK/BUILDER_FULL
# diubah tanpa memperbarui nilai ini, verify_builder_mark() akan memperingatkan.
_EXPECTED_FINGERPRINT = "815de5564bf34b557e7165a0cd79f41ee02df6029b695a39e625efaae57b7336"


def _fingerprint() -> str:
    payload = f"{BUILDER_MARK}|{BUILDER_FULL}|{PRODUCT_NAME}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def verify_builder_mark() -> bool:
    """Log banner atribusi; peringatkan bila tanda pembuat tampak diubah."""
    ok = _fingerprint() == _EXPECTED_FINGERPRINT
    banner = f"{PRODUCT_NAME} | Built by {BUILDER_MARK} ({BUILDER_FULL})"
    print(banner, flush=True)  # selalu tampil di log startup (docker logs)
    logger.info(banner)
    if not ok:
        print(f"PERINGATAN INTEGRITAS: tanda pembuat '{BUILDER_MARK}' diubah.", flush=True)
        logger.warning(
            "PERINGATAN INTEGRITAS: tanda pembuat '%s' tampak diubah/dihapus. "
            "Atribusi kepengarangan %s tetap berlaku (lihat berkas NOTICE).",
            BUILDER_MARK, BUILDER_FULL,
        )
    return ok


if __name__ == "__main__":
    # Cetak fingerprint aktual — dipakai sekali untuk mengunci _EXPECTED_FINGERPRINT.
    print(_fingerprint())
