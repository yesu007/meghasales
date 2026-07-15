import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { INTER_REGULAR_TTF, INTER_BOLD_TTF } from './invoiceFont';

const FONT = 'Inter';
const SLATE_900 = [15, 23, 42] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_200 = [226, 232, 240] as const;
const WHITE = [255, 255, 255] as const;

export interface ReportPDFColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }

export function generateReportPDF(title: string, columns: ReportPDFColumn[], rows: Record<string, any>[], fileName: string) {
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

  const formatCell = (value: any, type?: string): string => {
    if (typeof value !== 'number') return String(value ?? '');
    if (type === 'currency') return `₹ ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return value.toLocaleString('en-IN');
  };

  autoTable(doc, {
    startY: 32,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => formatCell(row[c.key], c.type))),
    theme: 'plain',
    styles: { font: FONT, lineColor: SLATE_200 as unknown as [number, number, number], lineWidth: 0.2, fontSize: 9 },
    headStyles: { fillColor: SLATE_900 as unknown as [number, number, number], textColor: WHITE as unknown as [number, number, number], fontStyle: 'bold', cellPadding: 5 },
    bodyStyles: { textColor: [51, 65, 85], cellPadding: 5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
    margin: { left: marginX, right: marginX },
  });

  doc.save(fileName);
}
