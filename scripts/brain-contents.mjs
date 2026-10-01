// Reads a tracked file from the private Splee9/spencer-brain repo through the GitHub
// contents API. Shared by the build-time fetch scripts.

export const REPO = "Splee9/spencer-brain";

export async function download(token, filePath, ref) {
  const url = new URL(
    `https://api.github.com/repos/${REPO}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`,
  );
  if (ref) url.searchParams.set("ref", ref);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "running-tracker-build",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${REPO}/${filePath}: ${await res.text()}`);
  return res.text();
}
