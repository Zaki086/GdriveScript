(async function () {
    'use strict';

    console.clear();
    console.log('%c🚀 PDF Extractor v10.0 - BLANK PAGE FIX', 'color: #4285f4; font-weight: bold; font-size: 18px');

    const TOTAL_PAGES = 165;

    const CONFIG = {
        scrollDelay: 1000,
        scrollStepSize: 500,
        maxScrollsNoChange: 8,
        minPageHeight: 300,
        minPageWidth: 300,
        captureDelay: 500
    };

    // ─── VERIFY CANVAS HAS ACTUAL CONTENT (not blank/white) ──────────────────
    function isCanvasBlank(canvas) {
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100)).data;
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++;
        }
        return nonWhite < 10; // less than 10 non-white pixels = blank
    }

    // ─── CANVAS → JPEG DATA URL ───────────────────────────────────────────────
    function canvasToJpegDataURL(canvas) {
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    // ─── DECODE BASE64 TO BYTES ───────────────────────────────────────────────
    function base64ToBytes(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    // ─── PURE JS PDF BUILDER ──────────────────────────────────────────────────
    // Structure per page:
    //   Object N*3+1 : Image XObject
    //   Object N*3+2 : Page dict  
    //   Object N*3+3 : Content stream
    // Object 1 = Catalog, Object 2 = Pages dict
    function buildPDF(pages) {
        // pages = [{jpegBytes: Uint8Array, width: number, height: number}]
        const n = pages.length;

        // ID layout:
        // 1 = Catalog
        // 2 = Pages
        // for page i (0-indexed):
        //   imgId   = 3 + i*3 + 0
        //   pageId  = 3 + i*3 + 1
        //   contId  = 3 + i*3 + 2

        const catalog_id = 1;
        const pages_id = 2;

        function imgId(i) { return 3 + i * 3 + 0; }
        function pageId(i) { return 3 + i * 3 + 1; }
        function contId(i) { return 3 + i * 3 + 2; }

        const totalObjs = 2 + n * 3; // catalog + pages + 3 per page

        // Byte assembly
        const chunks = [];
        let pos = 0;
        const offsets = new Array(totalObjs + 1).fill(0);

        function write(str) {
            const enc = new TextEncoder().encode(str);
            chunks.push(enc);
            pos += enc.length;
        }

        function writeBytes(bytes) {
            chunks.push(bytes);
            pos += bytes.length;
        }

        function mark(id) { offsets[id] = pos; }

        // ── Header ────────────────────────────────────────────────────────────
        write('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

        // ── Catalog ───────────────────────────────────────────────────────────
        mark(catalog_id);
        write(`${catalog_id} 0 obj\n<</Type /Catalog /Pages ${pages_id} 0 R>>\nendobj\n`);

        // ── Pages dict ────────────────────────────────────────────────────────
        const kids = Array.from({ length: n }, (_, i) => `${pageId(i)} 0 R`).join(' ');
        mark(pages_id);
        write(`${pages_id} 0 obj\n<</Type /Pages /Kids [${kids}] /Count ${n}>>\nendobj\n`);

        // ── Per-page objects ──────────────────────────────────────────────────
        for (let i = 0; i < n; i++) {
            const { jpegBytes, width, height } = pages[i];

            // Points at 96dpi: 1px = 0.75pt
            const ptW = (width * 72 / 96).toFixed(2);
            const ptH = (height * 72 / 96).toFixed(2);

            // Image XObject
            mark(imgId(i));
            write(
                `${imgId(i)} 0 obj\n` +
                `<</Type /XObject /Subtype /Image\n` +
                `  /Width ${width} /Height ${height}\n` +
                `  /ColorSpace /DeviceRGB /BitsPerComponent 8\n` +
                `  /Filter /DCTDecode /Length ${jpegBytes.length}>>\n` +
                `stream\n`
            );
            writeBytes(jpegBytes);
            write(`\nendstream\nendobj\n`);

            // Content stream — draws image filling the whole page
            const cs = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im${i} Do Q`;
            mark(contId(i));
            write(
                `${contId(i)} 0 obj\n` +
                `<</Length ${cs.length}>>\n` +
                `stream\n${cs}\nendstream\nendobj\n`
            );

            // Page dict (written AFTER image + content so refs are valid)
            mark(pageId(i));
            write(
                `${pageId(i)} 0 obj\n` +
                `<</Type /Page /Parent ${pages_id} 0 R\n` +
                `  /MediaBox [0 0 ${ptW} ${ptH}]\n` +
                `  /Resources <</XObject <</Im${i} ${imgId(i)} 0 R>>>>\n` +
                `  /Contents ${contId(i)} 0 R>>\n` +
                `endobj\n`
            );
        }

        // ── Cross-reference table ─────────────────────────────────────────────
        const xrefPos = pos;
        write(`xref\n0 ${totalObjs + 1}\n`);
        write('0000000000 65535 f \n');
        for (let i = 1; i <= totalObjs; i++) {
            write(offsets[i].toString().padStart(10, '0') + ' 00000 n \n');
        }

        // ── Trailer ───────────────────────────────────────────────────────────
        write(
            `trailer\n<</Size ${totalObjs + 1} /Root ${catalog_id} 0 R>>\n` +
            `startxref\n${xrefPos}\n%%EOF\n`
        );

        // ── Merge all chunks ──────────────────────────────────────────────────
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        return out;
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────
    function findScrollContainer() {
        for (const sel of ['[role="main"]', '.ndfHFb-c4YZDc-Wrql6b', '.ndfHFb-c4YZDc']) {
            const el = document.querySelector(sel);
            if (el && el.scrollHeight > el.clientHeight + 50) return el;
        }
        return window;
    }

    function getMetrics(c) {
        return c === window
            ? { top: window.scrollY, height: document.documentElement.scrollHeight, clientHeight: window.innerHeight }
            : { top: c.scrollTop, height: c.scrollHeight, clientHeight: c.clientHeight };
    }

    function scrollTo(c, pos) {
        c === window ? window.scrollTo({ top: pos, behavior: 'auto' }) : (c.scrollTop = pos);
    }

    function getAllPageImages() {
        return Array.from(document.querySelectorAll('img[src^="blob:"]'))
            .filter(img => {
                if (!img.src.includes('drive.google.com')) return false;
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                if (w < CONFIG.minPageWidth || h < CONFIG.minPageHeight) return false;
                const r = img.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            })
            .map(img => ({
                element: img,
                blobURL: img.src,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                top: img.getBoundingClientRect().top
            }))
            .sort((a, b) => a.top - b.top);
    }

    function imageToCanvas(img) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('Timeout')), 8000);
            const go = () => {
                clearTimeout(t);
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth || img.width;
                    c.height = img.naturalHeight || img.height;
                    const ctx = c.getContext('2d', { alpha: false });
                    ctx.fillStyle = '#FFF';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0);
                    resolve(c);
                } catch (e) { reject(e); }
            };
            img.complete && img.naturalWidth > 0
                ? go()
                : (img.onload = go, img.onerror = () => { clearTimeout(t); reject(new Error('Load failed')); });
        });
    }

    // ─── GENERATE & DOWNLOAD ──────────────────────────────────────────────────
    async function generatePDF(capturedPages) {
        console.log('%c📝 Converting canvases to JPEG...', 'color: #9334e9; font-weight: bold');

        const nums = Array.from(capturedPages.keys()).sort((a, b) => a - b);
        const pdfPages = [];
        let blankCount = 0;

        for (let i = 0; i < nums.length; i++) {
            const p = capturedPages.get(nums[i]);
            const canvas = p.canvas;

            // Verify canvas has content
            if (isCanvasBlank(canvas)) {
                blankCount++;
                console.warn(`  ⚠ Page ${nums[i]} canvas appears blank!`);
            }

            // Get JPEG data URL then decode to bytes
            const dataURL = canvasToJpegDataURL(canvas);
            const b64 = dataURL.split(',')[1];
            const jpegBytes = base64ToBytes(b64);

            pdfPages.push({ jpegBytes, width: canvas.width, height: canvas.height });

            if ((i + 1) % 20 === 0 || i === nums.length - 1) {
                console.log(`  JPEG: ${i + 1}/${nums.length} pages done`);
            }
        }

        if (blankCount > 0) {
            console.warn(`%c⚠ ${blankCount} blank canvases detected — those pages may appear white in PDF`, 'color: #fbbc04');
        }

        console.log('%c📄 Assembling PDF binary...', 'color: #4285f4; font-weight: bold');
        const pdfBytes = buildPDF(pdfPages);
        console.log(`   PDF size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);

        // Download
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const title = (document.title.split(' - ')[0] || 'ExtractedPDF').replace(/[^a-z0-9]/gi, '_');
        const filename = `${title}_${nums.length}pages_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        console.log(`%c🎉 Downloaded: ${filename}`, 'color: #0f9d58; font-weight: bold; font-size: 16px');
    }

    // ─── PHASE 1: PRE-SCROLL ──────────────────────────────────────────────────
    async function preScroll(container) {
        console.log('%c📜 Phase 1: Pre-scrolling to load all pages...', 'color: #fbbc04; font-weight: bold');
        let unchanged = 0, lastH = getMetrics(container).height, n = 0;
        scrollTo(container, 0);
        await new Promise(r => setTimeout(r, 500));

        while (unchanged < CONFIG.maxScrollsNoChange) {
            n++;
            const m = getMetrics(container);
            scrollTo(container, m.top + CONFIG.scrollStepSize);
            await new Promise(r => setTimeout(r, CONFIG.scrollDelay));
            const cur = getMetrics(container);
            if (cur.height > lastH) { lastH = cur.height; unchanged = 0; }
            else { unchanged++; }
            if (cur.top + cur.clientHeight >= cur.height - 50) break;
            if (n > 500) break;
        }

        await new Promise(r => setTimeout(r, 1500));
        scrollTo(container, 0);
        await new Promise(r => setTimeout(r, 800));
        console.log('%c✓ Phase 1 complete', 'color: #0f9d58');
    }

    // ─── PHASE 2: CAPTURE ─────────────────────────────────────────────────────
    async function capturePages(container, capturedPages, seenURLs) {
        console.log(`%c📸 Phase 2: Capturing (target: ${TOTAL_PAGES})...`, 'color: #4285f4; font-weight: bold');
        let pageNum = 1, noNewScrolls = 0;
        scrollTo(container, 0);
        await new Promise(r => setTimeout(r, 500));

        while (true) {
            const visible = getAllPageImages();
            let capturedThisRound = 0;

            for (const info of visible) {
                if (seenURLs.has(info.blobURL)) continue;
                try {
                    const canvas = await imageToCanvas(info.element);
                    const blank = isCanvasBlank(canvas);
                    capturedPages.set(pageNum, { pageNum, canvas, blobURL: info.blobURL, width: canvas.width, height: canvas.height });
                    seenURLs.add(info.blobURL);
                    const tag = blank ? ' ⚠ BLANK' : '';
                    console.log(`  ✓ Page ${pageNum}/${TOTAL_PAGES} (${canvas.width}×${canvas.height})${tag}`);
                    pageNum++;
                    capturedThisRound++;
                    await new Promise(r => setTimeout(r, 150));

                    if (capturedPages.size >= TOTAL_PAGES) {
                        console.log(`%c🏁 All ${TOTAL_PAGES} pages captured! Downloading...`, 'color: #0f9d58; font-weight: bold; font-size: 14px');
                        return;
                    }
                } catch (e) {
                    console.error(`  ❌ Page ${pageNum} failed:`, e.message);
                    pageNum++;
                }
            }

            if (capturedThisRound === 0) noNewScrolls++;
            else noNewScrolls = 0;

            if (noNewScrolls >= CONFIG.maxScrollsNoChange) {
                console.log(`  ⚠ No new pages after ${CONFIG.maxScrollsNoChange} scrolls. Got ${capturedPages.size}.`);
                break;
            }

            const m = getMetrics(container);
            scrollTo(container, m.top + CONFIG.scrollStepSize);
            await new Promise(r => setTimeout(r, CONFIG.captureDelay));
        }
    }

    // ─── MAIN ─────────────────────────────────────────────────────────────────
    try {
        const capturedPages = new Map();
        const seenURLs = new Set();
        window.capturedPDFPages = capturedPages;

        const container = findScrollContainer();
        console.log(`%c⚙️  Starting — auto-download at page ${TOTAL_PAGES}`, 'color: #4285f4; font-weight: bold');

        await preScroll(container);
        await capturePages(container, capturedPages, seenURLs);

        console.log(`%c📊 Captured: ${capturedPages.size} pages`, 'color: #4285f4');

        if (capturedPages.size === 0) {
            console.error('%c❌ No pages captured.', 'color: #d93025; font-weight: bold');
            return;
        }

        await generatePDF(capturedPages);

    } catch (err) {
        console.error('%c❌ Fatal error:', 'color: #d93025; font-weight: bold', err.message);
        console.error(err);
    }

})();