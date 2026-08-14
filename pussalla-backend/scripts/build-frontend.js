// Builds the React frontend into pussalla-backend/public so the Express
// server can serve the SPA from the same origin in production.
//
// Runs automatically on `npm install` (postinstall). It is a no-op when the
// frontend source isn't present (e.g. Render Root Directory = pussalla-backend),
// in which case the committed copy of public/ is used as-is.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const frontendDir = path.join(repoRoot, "pussalla-frontend");
const publicDir = path.join(__dirname, "..", "public");

// Recursively copy the *contents* of `src` into `dest` (dest itself is not
// recreated as a nested folder). Replaces the previous `cp -r dist/. public/`
// shell call, which produced a nested public/dist/ on some platforms.
function copyDirContents(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDirContents(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

// Skip when the frontend source is not checked out (backend-only deploy).
if (!fs.existsSync(path.join(frontendDir, "package.json"))) {
  console.log("[build-frontend] No pussalla-frontend source found — using bundled public/ as-is.");
  process.exit(0);
}

// Skip when the bundled public/ already has a fresh build and no source change
// is detectable (avoids rebuilding on every container restart).
const bundledIndex = path.join(publicDir, "index.html");
const sourceIndex = path.join(frontendDir, "index.html");
if (fs.existsSync(bundledIndex) && fs.existsSync(path.join(frontendDir, "dist", "index.html"))) {
  console.log("[build-frontend] Bundled public/ present — skipping rebuild (committed build is used).");
  process.exit(0);
}

console.log("[build-frontend] Building React frontend into pussalla-backend/public/ ...");
try {
  // Install frontend deps if not already present.
  if (!fs.existsSync(path.join(frontendDir, "node_modules"))) {
    console.log("[build-frontend] Installing frontend dependencies ...");
    execSync("npm ci", { cwd: frontendDir, stdio: "inherit" });
  }
  // Build into dist/.
  execSync("npm run build", { cwd: frontendDir, stdio: "inherit" });

  // Copy dist/ contents → public/ (the committed copy may be stale).
  // Recreate public/ so stale assets from a previous build are removed.
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  copyDirContents(path.join(frontendDir, "dist"), publicDir);
  if (!fs.existsSync(path.join(publicDir, "index.html"))) {
    throw new Error("Frontend build produced no index.html");
  }
  console.log("[build-frontend] ✓ Frontend built and copied to pussalla-backend/public/");
} catch (err) {
  console.error("[build-frontend] Build failed, falling back to bundled public/:", err.message);
  // Don't fail the deploy — the committed public/ copy is still served.
  process.exit(0);
}
