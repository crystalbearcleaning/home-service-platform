import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">
        Home Service Operating Platform
      </h1>
      <p className="mt-2 text-sm text-gray-600">Phase 1 scaffold.</p>
      <Link
        href="/admin"
        className="mt-4 inline-block text-sm underline"
      >
        Go to admin →
      </Link>
    </main>
  );
}
