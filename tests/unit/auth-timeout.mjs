// Verifies the withTimeout()/authErrorMessage() logic in src/routes/auth.tsx:
// a hung auth call (a dropped connection that never rejects on its own) must
// still surface a clear message within a bounded time, rather than leaving
// the sign-in button reading "Please wait…" forever. Copied verbatim (no
// app-specific imports) since auth.tsx is a route file, not a module meant
// to be imported standalone.
class AuthTimeoutError extends Error {}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new AuthTimeoutError("Taking longer than expected — check your connection and try again.")),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
function authErrorMessage(err, fallback) {
  if (err instanceof AuthTimeoutError) return err.message;
  return err instanceof Error ? err.message : fallback;
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

// A network black hole: a promise that never settles.
const hung = new Promise(() => {});
const start = Date.now();
try {
  await withTimeout(hung, 50);
  check("a hung request rejects rather than resolving", false);
} catch (e) {
  const elapsed = Date.now() - start;
  check("a hung request rejects within the timeout window", elapsed < 500, `${elapsed}ms`);
  check("it rejects with AuthTimeoutError", e instanceof AuthTimeoutError, String(e));
  check(
    "the message names the actual problem, not a generic failure",
    authErrorMessage(e, "Authentication failed").includes("check your connection"),
    authErrorMessage(e, "Authentication failed"),
  );
}

// A fast, real response is unaffected -- no artificial delay is added.
{
  const fastStart = Date.now();
  const result = await withTimeout(Promise.resolve({ ok: true }), 5000);
  check("a fast response passes straight through", result.ok === true);
  check("...without waiting anywhere near the timeout", Date.now() - fastStart < 100);
}

// A real (non-timeout) auth error still surfaces its own message, unchanged.
{
  try {
    await withTimeout(Promise.reject(new Error("Invalid login credentials")), 5000);
    check("a rejected request actually rejects", false);
  } catch (e) {
    check(
      "a real auth error keeps its own message, not the timeout one",
      authErrorMessage(e, "fallback") === "Invalid login credentials",
      authErrorMessage(e, "fallback"),
    );
  }
}

console.log("\n" + (failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
