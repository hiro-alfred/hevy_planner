// Stand-in for the `server-only` package under vitest.
//
// That package resolves to a module whose only job is to throw when it is
// pulled into a client bundle. Vitest has no React Server Components graph, so
// importing the real thing fails every test that touches a server-only module.
// vitest.config.mts aliases the package to this empty module instead; the real
// guard still applies to the Next.js build, which is where it matters.
export {};
