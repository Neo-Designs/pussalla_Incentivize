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

  // Copy dist/ → public/ (the committed copy may be stale).
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  execSync(`cp -r ${path.join(frontendDir, "dist", ".")} ${publicDir}/`);
  console.log("[build-frontend] ✓ Frontend built and copied to pussalla-backend/public/");
} catch (err) {
  console.error("[build-frontend] Build failed, falling back to bundled public/:", err.message);
  // Don't fail the deploy — the committed public/ copy is still served.
  process.exit(0);
}
