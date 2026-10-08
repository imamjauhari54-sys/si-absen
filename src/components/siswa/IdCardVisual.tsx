import "./id-card.css";
import { qrUrl } from "@/lib/utils/qr";

// Ukuran font nama menyesuaikan panjang teks supaya nama panjang tetap muat
// dalam maksimal 2 baris dan tidak mendorong QR keluar dari kartu.
function kelasUkuranNama(nama: string): string {
  const n = nama.trim().length;
  if (n <= 18) return "ic-nama--l";
  if (n <= 28) return "ic-nama--m";
  return "ic-nama--s";
}

export default function IdCardVisual({
  namaSekolah,
  alamat,
  nama,
  kelas,
  nisn,
  foto,
  token,
}: {
  namaSekolah: string;
  alamat: string;
  nama: string;
  kelas: string;
  nisn: string | null;
  foto: string | null;
  token: string | null;
}) {
  return (
    <div className="id-card">
      <div className="ic-head">
        <div className="ic-logo">🎓</div>
        <div className="ic-school">{namaSekolah.toUpperCase()}</div>
        {alamat && <div className="ic-addr">{alamat}</div>}
        <div className="ic-badge">Kartu Pelajar</div>
      </div>

      <div className="ic-foto">
        {foto ? (
          <img src={foto} alt={`foto ${nama}`} />
        ) : (
          <div className="ic-foto-ph">
            <div className="ic-sil-head" />
            <div className="ic-sil-body" />
          </div>
        )}
      </div>

      <div className="ic-body">
        <div className={`ic-nama ${kelasUkuranNama(nama)}`} title={nama}>
          {nama.toUpperCase()}
        </div>
        <div className="ic-kelas">Kelas {kelas}</div>
        <div className="ic-qr-wrap">
          {token ? (
            <div className="ic-qr">
              <img src={qrUrl(token, 300)} alt="QR" />
            </div>
          ) : (
            <div className="ic-qr-empty">
              Token
              <br />
              Belum Ada
            </div>
          )}
        </div>
      </div>

      <div className="ic-foot">
        NIS: {nisn || "—"}
        <span>
          Scan QR · SI-ABSEN · {namaSekolah}
        </span>
      </div>
    </div>
  );
}
