SELECT
    id,
    siswa_id,
    tanggal,
    sebelum->>'status' AS status_sebelum,
    sesudah->>'status' AS status_sesudah,
    absensi_id,
    rev_sesudah,
    dipulihkan_at,
    dipulihkan_nama
FROM public.absensi_edit_manual
WHERE tanggal = DATE '2026-10-19'
ORDER BY siswa_id, id;