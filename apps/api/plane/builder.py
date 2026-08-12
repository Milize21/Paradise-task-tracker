"""
Paradise Task Tracker: tanda pembuat (builder attribution).

Dibangun & dikustomisasi oleh Yorukaze Production (Bintang Eko Ramadhan).
Modul ini menanamkan atribusi kepengarangan dan memberi PERINGATAN di log
bila tanda pembuat diubah/dihapus (tamper-evident).

Catatan jujur: ini deteksi, bukan pencegahan mutlak. Siapa pun yang punya
akses source bisa mengubah kode; perlindungan yang mengikat adalah HUKUM
(hak cipta + berkas NOTICE + riwayat commit Git), bukan teknis semata.
"""

import hashlib
import logging

logger = logging.getLogger("plane")

# Tanda pembuat, JANGAN DIHAPUS.
# Nama produksi dipakai sebagai tanda yang tampil; nama pribadi tetap dibawa di
# BUILDER_FULL karena hak cipta melekat pada orang, bukan pada nama dagang.
BUILDER_MARK = "Yorukaze Production"
BUILDER_FULL = "Yorukaze Production (Bintang Eko Ramadhan)"
PRODUCT_NAME = "Paradise Task Tracker"

# Sidik jari yang diharapkan dari tanda pembuat. Bila BUILDER_MARK/BUILDER_FULL
# diubah tanpa memperbarui nilai ini, verify_builder_mark() akan memperingatkan.
# Hitung ulang dengan: python -m plane.builder
_EXPECTED_FINGERPRINT = "67d9b5148bd1b7a780f575296e68cb27e912651836de79e4d76a9b8f96589768"


def _fingerprint() -> str:
    payload = f"{BUILDER_MARK}|{BUILDER_FULL}|{PRODUCT_NAME}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def verify_builder_mark() -> bool:
    """Log banner atribusi; peringatkan bila tanda pembuat tampak diubah."""
    ok = _fingerprint() == _EXPECTED_FINGERPRINT
    # BUILDER_FULL sudah memuat BUILDER_MARK di dalamnya, jadi jangan disisipkan
    # dua-duanya, hasilnya kurung bersarang "Yorukaze Production (Yorukaze ...)".
    banner = f"{PRODUCT_NAME} | Powered by {BUILDER_FULL}"
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
    # Cetak fingerprint aktual, dipakai untuk mengunci _EXPECTED_FINGERPRINT.
    aktual = _fingerprint()
    print(aktual)
    # Pemeriksaan mandiri: gagal keras di sini jauh lebih baik daripada setiap
    # container startup diam-diam mencetak "PERINGATAN INTEGRITAS" ke log.
    assert aktual == _EXPECTED_FINGERPRINT, (
        f"_EXPECTED_FINGERPRINT usang.\n  diharapkan: {_EXPECTED_FINGERPRINT}\n  aktual    : {aktual}\n"
        "Perbarui _EXPECTED_FINGERPRINT dengan nilai aktual di atas."
    )
    assert verify_builder_mark() is True
    print("OK, tanda pembuat utuh.")
