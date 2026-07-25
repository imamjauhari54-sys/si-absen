"use client";

/**
 * Picker kelas standar: pilih dari daftar master saja (dikelola lewat
 * menu Manajemen Kelas). Sengaja TIDAK ada opsi "tambah kelas baru" di
 * sini — biar nama kelas tetap satu sumber kebenaran dari kelas_master,
 * nggak bisa "nyelip" ditambah dari form Siswa/Pengguna.
 */
export default function KelasPicker({
  value,
  onChange,
  options,
  helperPilih,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  helperPilih?: string;
}) {
  // Kalau value sekarang (data lama/hasil import) belum ada di daftar master,
  // tetap tampilkan sebagai opsi supaya nggak "hilang" diam-diam dari form.
  const daftarOptions = value && !options.includes(value) ? [value, ...options] : options;

  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        <option value="">-- Pilih Kelas --</option>
        {daftarOptions.map((k) => (
          <option key={k} value={k}>
            Kelas {k}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1">
        {helperPilih ?? 'Kelas belum ada di daftar? Tambahkan dulu lewat menu Manajemen Kelas.'}
      </p>
    </div>
  );
}
