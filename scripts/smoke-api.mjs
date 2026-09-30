// Calls the bundled GET handlers in server-dist/ and checks the response shapes.
// Run after `npm run build`. Without BRAIN_GITHUB_TOKEN they serve the bundled snapshot.

const checks = [
  ["activities", (body) => Array.isArray(body.activities)],
  ["pulse", (body) => Array.isArray(body.recent) && body.recent.length <= 60],
];

let failed = false;
for (const [name, valid] of checks) {
  const { GET } = await import(`../server-dist/${name}.js`);
  const res = await GET(new Request(`http://localhost/api/${name}`));
  const body = await res.json();
  const ok =
    res.status === 200 &&
    /s-maxage=\d+/.test(res.headers.get("cache-control") ?? "") &&
    ["live", "snapshot"].includes(body.source) &&
    valid(body);
  console.log(`${ok ? "ok  " : "FAIL"} /api/${name} → ${res.status} ${body.source}`);
  failed ||= !ok;
}
process.exit(failed ? 1 : 0);
