# 📄 driveshot-pdf

> Capture and download any Google Drive document viewer as a fully assembled PDF — directly from your browser console. No extensions, no installs, no libraries.

![Version](https://img.shields.io/badge/version-10.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)
![Works On](https://img.shields.io/badge/works%20on-Google%20Drive-orange)

---

## ✨ What It Does

When you open a document in Google Drive's built-in viewer, the pages are rendered as `blob:` images in your browser. **driveshot-pdf** captures every one of those images, assembles them into a valid PDF binary — using zero external libraries — and downloads the file automatically.

No jsPDF. No eval. No script injection. Works even under Google's strict **Trusted Types** CSP policy.

---

## 🚀 Quick Start

1. Open your document in **Google Drive Viewer** (the built-in previewer, not Docs/Sheets)
2. Open **DevTools** → **Console** (`F12` or `Ctrl+Shift+J`)
3. Paste the contents of `pdf_extractor_v10.js` and hit **Enter**
4. Watch it scroll, capture, and auto-download your PDF ✅

---

## ⚙️ Configuration

At the top of the script, set the total page count of your document:

```js
const TOTAL_PAGES = 165; // ← change this to match your document
```

Once the script captures that many pages, it immediately builds and downloads the PDF without waiting for any command.

You can also tweak scroll behaviour:

```js
const CONFIG = {
    scrollDelay: 1000,       // ms to wait between scroll steps
    scrollStepSize: 500,     // px per scroll step
    maxScrollsNoChange: 8,   // stop after N scrolls with no new pages
    minPageHeight: 300,      // ignore images shorter than this
    minPageWidth: 300,       // ignore images narrower than this
    captureDelay: 500        // ms between page captures
};
```

---

## 🔄 How It Works

```
Phase 1 — Pre-scroll
  └─ Scrolls the entire document top to bottom
     so Google Drive pre-loads all page images into the DOM

Phase 2 — Capture
  └─ Scrolls again, finding blob: images that match Drive's page format
  └─ Draws each image onto an off-screen <canvas>
  └─ Checks canvas isn't blank before storing it
  └─ Stops as soon as TOTAL_PAGES pages are captured

PDF Assembly (pure JS, no libraries)
  └─ Each canvas → JPEG bytes via canvas.toDataURL()
  └─ Bytes assembled into a valid PDF/1.4 binary by hand:
       • Catalog object
       • Pages dictionary
       • Per page: Image XObject + Page dict + Content stream
       • Cross-reference table + Trailer
  └─ Blob URL created → <a> click → auto-download
```

---

## 🛡️ Why No Libraries?

Google Drive enforces a strict **Trusted Types** Content Security Policy that blocks:

| Method | Blocked? |
|---|---|
| `script.src = externalURL` | ✅ Blocked |
| `script.src = blobURL` | ✅ Blocked |
| `new Function(code)()` | ✅ Blocked |
| `eval(code)` | ✅ Blocked |
| `canvas`, `Blob`, `URL.createObjectURL` | ❌ **Allowed** |

So instead of loading jsPDF (or any library), this script hand-writes a spec-compliant PDF binary using only browser-native APIs — nothing for the CSP to block.

---

## 📋 Console Output

```
🚀 PDF Extractor v10.0 - BLANK PAGE FIX
⚙️  Starting — auto-download at page 165
📜 Phase 1: Pre-scrolling to load all pages...
✓ Phase 1 complete
📸 Phase 2: Capturing (target: 165)...
  ✓ Page 1/165 (1600×2264)
  ✓ Page 2/165 (1600×2264)
  ...
  ✓ Page 165/165 (1600×2264)
🏁 All 165 pages captured! Downloading...
📄 Assembling PDF binary...
   PDF size: 18.42 MB
🎉 Downloaded: MyDocument_165pages_2026-03-15.pdf
```

---

## ⚠️ Troubleshooting

| Symptom | Fix |
|---|---|
| Pages show `⚠ BLANK` | Increase `scrollDelay` to `1500` — images aren't loading fast enough |
| Stops before all pages | Increase `maxScrollsNoChange` to `15` |
| Script hangs mid-scroll | Refresh, paste script again — it starts fresh each run |
| PDF opens but is blank | Pages were captured before Drive finished rendering. Increase `captureDelay` to `800` |
| Wrong page count | Check document page count and update `TOTAL_PAGES` at top of script |

---

## 📁 File Structure

```
driveshot-pdf/
├── pdf_extractor_v10.js   # Main script — paste this into the console
└── README.md
```

---

## 📜 Version History

| Version | Change |
|---|---|
| v10.0 | Fixed blank PDF — corrected PDF object ID layout, added canvas blank-detection |
| v9.0  | Eliminated all external libraries — pure JS PDF builder |
| v8.0  | Switched to `new Function()` to bypass TrustedTypes (still blocked) |
| v7.1  | Hardcoded `TOTAL_PAGES`, auto-download trigger |
| v7.0  | Blob URL script injection attempt |
| v6.0  | Original version using jsPDF via CDN |

---

## 📄 License

MIT — do whatever you want with it.

---

## 🙏 Notes

- This tool works on the **Google Drive document previewer** only (`drive.google.com/file/d/...`)
- It does **not** work on Google Docs, Sheets, or Slides (those use a different rendering system)
- Page images are captured at whatever resolution Drive renders them — typically 1600×2264px
- Large documents (150+ pages) may take 3–5 minutes to fully capture
