import Link from "next/link";

const NAV = [
  { href: "/", label: "Plans" },
  { href: "/plans/new", label: "New plan" },
  { href: "/settings", label: "Settings" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 p-4">
        <Link href="/" className="font-semibold">
          Hevy Planner
        </Link>
        <ul className="flex items-center gap-4 text-sm">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="opacity-70 transition-opacity hover:opacity-100">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
