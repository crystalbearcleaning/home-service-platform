// Empty shim. The real "server-only" package errors at build time if
// imported into a Client Component bundle; in Vitest we just need the
// import to resolve so test files can import server-side modules
// transitively. Tests must not actually call server-side network/DB
// code paths — see existing tests for the validation-only pattern.
export {};
