import Link from "next/link";
import Image from "next/image";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e7e2d8] bg-[#faf9f5]/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2 text-[19px] font-black leading-none tracking-tight text-[#0e0e0c] no-underline"
          aria-label="floom — home"
        >
          <Image src="/floom-mark.svg" alt="" width={26} height={26} priority />
          floom<span className="text-emerald-500" aria-hidden="true">.</span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/login?mode=signin"
            className="rounded-md px-3 py-[7px] text-[13px] font-medium leading-none text-neutral-700 no-underline transition-colors hover:text-[#0e0e0c]"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-md bg-[#0e0e0c] px-3.5 py-[7px] text-[13px] font-semibold leading-none text-white no-underline transition-opacity hover:opacity-80"
          >
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
