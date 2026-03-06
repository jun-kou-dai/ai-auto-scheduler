#!/usr/bin/env node
/**
 * Post-build script: fixes dist/index.html after `expo export`
 * - Adds translate="no" to <html>
 * - Adds Google Translate suppression meta tags
 * - Adds cache-control meta tags
 * - Adds service worker cleanup script
 * - Sets Japanese noscript text
 * - Copies dist/ to docs/ for GitHub Pages
 */

const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const DOCS = path.join(__dirname, '..', 'docs');
const HTML_PATH = path.join(DIST, 'index.html');

if (!fs.existsSync(HTML_PATH)) {
  console.error('dist/index.html not found. Run `npx expo export --platform web` first.');
  process.exit(1);
}

let html = fs.readFileSync(HTML_PATH, 'utf-8');

// 1. Add translate="no" to <html> tag
html = html.replace(/<html\s+lang="[^"]*"/, '$& translate="no"');

// 2. Add meta tags after <meta charset="utf-8" />
const metaTags = `
    <meta name="google" content="notranslate" />
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />`;

html = html.replace(
  '<meta charset="utf-8" />',
  '<meta charset="utf-8" />' + metaTags
);

// 3. Fix httpEquiv (JSX prop name) to http-equiv (HTML attribute)
html = html.replace(/httpEquiv=/g, 'http-equiv=');

// 4. Add SW cleanup script before the <style> tag
const swScript = `
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(r) {
          r.forEach(function(reg) { reg.unregister(); });
        });
      }
      if ('caches' in window) {
        caches.keys().then(function(n) {
          n.forEach(function(name) { caches.delete(name); });
        });
      }
    </script>`;

html = html.replace('<style id="expo-reset">', swScript + '\n    <style id="expo-reset">');

// 5. Fix noscript text
html = html.replace(
  /You need to enable JavaScript to run this app\./,
  'JavaScriptを有効にしてください。'
);

// 6. Add cache-busting version parameter to JS/CSS assets
const buildVersion = Date.now().toString(36);
html = html.replace(/(src="[^"]+\.js)(")/g, `$1?v=${buildVersion}$2`);
html = html.replace(/(href="[^"]+\.css)(")/g, `$1?v=${buildVersion}$2`);

// 7. Convert absolute paths to relative for GitHub Pages subdir deployment
html = html.replace(/src="\//g, 'src="./');
html = html.replace(/href="\//g, 'href="./');

// 8. Clean up comments
html = html.replace(/\s*<!-- The `react-native-web`.*?-->/s, '');
html = html.replace(/\s*<!-- Use static rendering.*?-->/s, '');
html = html.replace(/\s*<!-- The root element.*?-->/s, '');
html = html.replace(/\s*\/\* These styles.*?\*\//g, '');

fs.writeFileSync(HTML_PATH, html);
console.log('dist/index.html patched successfully.');

// 9. Copy dist/ to docs/ for GitHub Pages
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Clean docs/ except .nojekyll
if (fs.existsSync(DOCS)) {
  for (const entry of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (entry.name === '.nojekyll') continue;
    const p = path.join(DOCS, entry.name);
    fs.rmSync(p, { recursive: true, force: true });
  }
} else {
  fs.mkdirSync(DOCS);
}

copyDirSync(DIST, DOCS);

// Ensure .nojekyll exists
const nojekyll = path.join(DOCS, '.nojekyll');
if (!fs.existsSync(nojekyll)) fs.writeFileSync(nojekyll, '');

// Create 404.html (copy of index.html for SPA routing on GitHub Pages)
fs.copyFileSync(path.join(DOCS, 'index.html'), path.join(DOCS, '404.html'));

console.log('docs/ synced from dist/ successfully.');
