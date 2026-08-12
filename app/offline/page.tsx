import Image from "next/image";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <Image src="/icons/icon-192.png" alt="スイカ" width={96} height={96} />
      <h1>いまはオフラインです</h1>
      <p>買い物リストの更新にはインターネット接続が必要です。</p>
    </main>
  );
}
