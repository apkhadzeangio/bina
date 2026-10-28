// Libraries loaded on demand from cdnjs (pinned versions).
export const LIBS = {
  three: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
};

const loading = new Map();

export function loadScript(url) {
  if (loading.has(url)) return loading.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading.delete(url);
      reject(new Error(`ვერ ჩაიტვირთა: ${url}`));
    };
    document.head.append(s);
  });
  loading.set(url, p);
  return p;
}

export async function loadThree() {
  if (window.THREE) return window.THREE;
  await loadScript(LIBS.three);
  return window.THREE;
}

export async function loadPdf() {
  if (!window.pdfjsLib) {
    // The worker script runs on the main thread ("fake worker"), so no worker file
    // has to be fetched from another origin.
    await loadScript(LIBS.pdfWorker);
    await loadScript(LIBS.pdf);
  }
  return window.pdfjsLib;
}
