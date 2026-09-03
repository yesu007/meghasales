import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { INTER_REGULAR_TTF, INTER_BOLD_TTF } from './invoiceFont';
import { formatCurrency } from './currency';

const FONT = 'Inter';
const SLATE_900 = [15, 23, 42] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_200 = [226, 232, 240] as const;
const WHITE = [255, 255, 255] as const;

export interface ReportPDFColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }

export function generateReportPDF(
  title: string,
  columns: ReportPDFColumn[],
  rows: Record<string, any>[],
  fileName: string,
  // One pre-formatted row per currency, in the same column order as
  // `columns`. Optional — existing callers (Accounting, Payroll) pass
  // nothing and get exactly the PDF they got before.
  foot?: string[][]
) {
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_TTF);
  doc.addFont('Inter-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_TTF);
  doc.addFont('Inter-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');

  doc.setFontSize(16);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(title, marginX, 18);

  doc.setFontSize(9);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_500);
  doc.text(`Generated ${dayjs().format('DD MMM YYYY, h:mm A')}`, marginX, 25);

  const formatCell = (value: any, type: string | undefined, currencyCode: string): string => {
    if (typeof value !== 'number') return String(value ?? '');
    if (type === 'currency') return formatCurrency(value, currencyCode);
    return value.toLocaleString('en-IN');
  };

  // Wide reports (10+ columns) need a smaller type size, or every currency
  // cell wraps mid-number — "$243,375.0 / 0" — which is unreadable.
  const dense = columns.length >= 9;
  const bodyFontSize = dense ? 7 : 9;

  autoTable(doc, {
    startY: 32,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => formatCell(row[c.key], c.type, row.currencyCode || 'INR'))),
    theme: 'plain',
    styles: { font: FONT, lineColor: SLATE_200 as unknown as [number, number, number], lineWidth: 0.2, fontSize: bodyFontSize, overflow: 'linebreak' },
    // A row must never be split across a page boundary — half of "Individual
    // Project" landing alone at the top of page 2 reads as a stray record.
    rowPageBreak: 'avoid',
    headStyles: { fillColor: SLATE_900 as unknown as [number, number, number], textColor: WHITE as unknown as [number, number, number], fontStyle: 'bold', cellPadding: dense ? 3 : 5 },
    bodyStyles: { textColor: [51, 65, 85], cellPadding: dense ? 3 : 5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
    ...(foot && foot.length > 0
      ? {
          foot,
          // Totals belong at the END of the report, not repeated under every
          // page — a total that appears three times reads as three totals.
          showFoot: 'lastPage' as const,
          footStyles: {
            fillColor: [248, 250, 252] as [number, number, number],
            textColor: SLATE_900 as unknown as [number, number, number],
            fontStyle: 'bold' as const,
            cellPadding: dense ? 3 : 5,
            fontSize: bodyFontSize,
            lineColor: SLATE_200 as unknown as [number, number, number],
            lineWidth: 0.2,
          },
        }
      : {}),
    margin: { left: marginX, right: marginX },
  });

  doc.save(fileName);
}
