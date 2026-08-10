import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageExtractionResult {
  pageNumber: number;
  text: string;
  extractionMethod: 'native' | 'ocr' | 'failed';
  charCount: number;
  wordCount: number;
  ocrConfidence: number;
}

export interface ExtractionResult {
  pages: PageExtractionResult[];
  pageCount: number;
  nativeTextPages: number;
  ocrPages: number;
  failedPages: number[];
  totalChars: number;
  totalWords: number;
  fullText: string;
  pageTexts: string[];
  extractionDurationMs: number;
  ocrDurationMs: number;
  overallConfidence: number;
}

export interface ChunkResult {
  chunkId: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  charCount: number;
}

export interface ExtractionDiagnostics {
  fileSize: number;
  mimeType: string;
  pageCount: number;
  nativeTextPages: number;
  ocrPages: number;
  failedPages: number[];
  totalExtractedChars: number;
  totalWords: number;
  chunkCount: number;
  extractionDurationMs: number;
  ocrDurationMs: number;
  overallConfidence: number;
}

const MIN_TEXT_CHARS = 50;
const MIN_TEXT_DENSITY = 0.3;
const CHUNK_CHAR_LIMIT = 12000;
const CHUNK_OVERLAP_CHARS = 500;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function textDensity(text: string): number {
  if (text.length === 0) return 0;
  const printable = (text.match(/[\x20-\x7E\n\r\t]/g) || []).length;
  return printable / text.length;
}

async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<{ text: string; confidence: number }> {
  try {
    const { default: Tesseract } = await import('tesseract.js');
    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: () => {},
    });
    return {
      text: result.data.text || '',
      confidence: result.data.confidence ? result.data.confidence / 100 : 0.8,
    };
  } catch {
    return { text: '', confidence: 0 };
  }
}

export async function extractPdfText(
  file: File,
  onProgress?: (stage: string, currentPage: number, totalPages: number) => void,
): Promise<ExtractionResult> {
  const startTime = performance.now();
  const arrayBuffer = await file.arrayBuffer();
  const pdf: PDFDocumentProxy = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const pages: PageExtractionResult[] = [];
  const pageTexts: string[] = [];
  let nativeTextPages = 0;
  let ocrPages = 0;
  const failedPages: number[] = [];
  let totalChars = 0;
  let totalWords = 0;
  let ocrDurationMs = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.('extracting', i, pageCount);
    const page = await pdf.getPage(i);

    // Step 1: native text extraction
    const textContent = await page.getTextContent();
    const nativeText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const nativeChars = nativeText.length;
    const nativeDensity = textDensity(nativeText);

    if (nativeChars >= MIN_TEXT_CHARS && nativeDensity >= MIN_TEXT_DENSITY) {
      const wordCount = countWords(nativeText);
      pages.push({
        pageNumber: i,
        text: nativeText,
        extractionMethod: 'native',
        charCount: nativeChars,
        wordCount,
        ocrConfidence: 0,
      });
      pageTexts.push(nativeText);
      nativeTextPages++;
      totalChars += nativeChars;
      totalWords += wordCount;
      confidenceSum += 1.0;
      confidenceCount++;
    } else {
      // Step 2: OCR fallback for pages with insufficient native text
      onProgress?.('ocr', i, pageCount);
      const ocrStart = performance.now();
      try {
        const canvas = await renderPageToCanvas(page, 2.0);
        const { text: ocrText, confidence } = await ocrCanvas(canvas);
        ocrDurationMs += performance.now() - ocrStart;

        if (ocrText.trim().length >= MIN_TEXT_CHARS) {
          const wordCount = countWords(ocrText);
          pages.push({
            pageNumber: i,
            text: ocrText,
            extractionMethod: 'ocr',
            charCount: ocrText.length,
            wordCount,
            ocrConfidence: confidence,
          });
          pageTexts.push(ocrText);
          ocrPages++;
          totalChars += ocrText.length;
          totalWords += wordCount;
          confidenceSum += confidence;
          confidenceCount++;
        } else {
          failedPages.push(i);
          pageTexts.push('');
          pages.push({
            pageNumber: i,
            text: '',
            extractionMethod: 'failed',
            charCount: 0,
            wordCount: 0,
            ocrConfidence: 0,
          });
        }
      } catch {
        ocrDurationMs += performance.now() - ocrStart;
        failedPages.push(i);
        pageTexts.push('');
        pages.push({
          pageNumber: i,
          text: '',
          extractionMethod: 'failed',
          charCount: 0,
          wordCount: 0,
          ocrConfidence: 0,
        });
      }
    }

    page.cleanup();
  }

  await pdf.destroy();

  const fullText = pageTexts
    .map((text, idx) => (text ? `\n--- PAGE ${idx + 1} ---\n${text}` : ''))
    .join('\n')
    .trim();

  const extractionDurationMs = performance.now() - startTime;
  const overallConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;

  return {
    pages,
    pageCount,
    nativeTextPages,
    ocrPages,
    failedPages,
    totalChars,
    totalWords,
    fullText,
    pageTexts,
    extractionDurationMs,
    ocrDurationMs,
    overallConfidence,
  };
}

export function chunkDocument(
  pageTexts: string[],
  charLimit: number = CHUNK_CHAR_LIMIT,
  overlap: number = CHUNK_OVERLAP_CHARS,
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let currentText = '';
  let pageStart = 1;
  let chunkId = 0;

  for (let i = 0; i < pageTexts.length; i++) {
    const pageNum = i + 1;
    const pageText = pageTexts[i] || '';
    const pageSegment = `\n--- PAGE ${pageNum} ---\n${pageText}`;

    if (currentText.length + pageSegment.length > charLimit && currentText.length > 0) {
      chunks.push({
        chunkId,
        pageStart,
        pageEnd: pageNum - 1,
        text: currentText,
        charCount: currentText.length,
      });
      chunkId++;
      const overlapText = currentText.slice(-overlap);
      currentText = overlapText + pageSegment;
      pageStart = pageNum;
    } else {
      currentText += pageSegment;
    }
  }

  if (currentText.trim().length > 0) {
    chunks.push({
      chunkId,
      pageStart,
      pageEnd: pageTexts.length,
      text: currentText,
      charCount: currentText.length,
    });
  }

  return chunks;
}

export function getDiagnostics(
  file: File,
  extraction: ExtractionResult,
  chunkCount: number,
): ExtractionDiagnostics {
  return {
    fileSize: file.size,
    mimeType: file.type,
    pageCount: extraction.pageCount,
    nativeTextPages: extraction.nativeTextPages,
    ocrPages: extraction.ocrPages,
    failedPages: extraction.failedPages,
    totalExtractedChars: extraction.totalChars,
    totalWords: extraction.totalWords,
    chunkCount,
    extractionDurationMs: extraction.extractionDurationMs,
    ocrDurationMs: extraction.ocrDurationMs,
    overallConfidence: extraction.overallConfidence,
  };
}
