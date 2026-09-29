import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TEKFILO_LOGO } from './logo';
import { INTER_REGULAR_TTF, INTER_BOLD_TTF } from './invoiceFont';

const FONT = 'Inter';

// Same palette as generatePayslipPDF.ts / generateInvoicePDF.ts — one visual
// language across every PDF this app produces.
const SLATE_900 = [15, 23, 42] as const;
const SLATE_700 = [51, 65, 85] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_400 = [148, 163, 184] as const;
const SLATE_200 = [226, 232, 240] as const;
const SLATE_50 = [248, 250, 252] as const;
const AMBER_700 = [180, 83, 9] as const;
const AMBER_50 = [255, 251, 235] as const;
const WHITE = [255, 255, 255] as const;
const EMERALD_600 = [5, 150, 105] as const;
const ROSE_600 = [225, 29, 72] as const;

type RGB = [number, number, number];

export interface BillPDFItem {
  subCategory: string;
  description: string;
  itemValue: number;
  cgstAmount: number; cgstRate: number;
  sgstAmount: number; sgstRate: number;
  igstAmount: number; igstRate: number;
  gstAmount: number;
  gstType: string; // INPUT | OUTPUT
  tdsAmount: number; tdsPercent: number;
  payableAmount: number;
}

// Mirrors the Bills page's View popup: header fields, line items, totals.
export interface BillPDFData {
  billNumber: string;
  supplierName: string;
  details: { label: string; value: string }[];
  items: BillPDFItem[];
  itemTotal: number;
  gstTotal: number;
  tdsTotal: number;
  payableAmount: number;
  // Set only for a Partially Paid bill — printed under Net Payable.
  partialPayment?: { paid: number; remaining: number } | null;
  notes: string | null;
  fileName: string;
}

function fmt(amount: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

const withRate = (amount: number, rate: number) => (rate ? `${fmt(amount)}\n(${rate}%)` : '—');

export function generateBillPDF(data: BillPDFData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;

  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_TTF);
  doc.addFont('Inter-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_TTF);
  doc.addFont('Inter-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');

  // === HEADER ===
  try {
    doc.addImage(TEKFILO_LOGO, 'PNG', marginX, 14, 34, 8.85);
  } catch {
    doc.setFontSize(15);
    doc.setTextColor(...SLATE_900);
    doc.setFont(FONT, 'bold');
    doc.text('TEKFILO', marginX, 20);
  }

  doc.setFontSize(20);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text('BILL', pageWidth - marginX, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...AMBER_700);
  doc.text(`${data.billNumber} — ${data.supplierName}`, pageWidth - marginX, 26, { align: 'right' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.line(marginX, 33, pageWidth - marginX, 33);

  // === DETAILS GRID (4 columns, like the popup) ===
  const cols = 4;
  const colW = contentWidth / cols;
  let y = 42;
  data.details.forEach((d, i) => {
    const col = i % cols;
    if (i > 0 && col === 0) y += 14;
    const x = marginX + col * colW;
    doc.setFontSize(7.5);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...SLATE_500);
    doc.text(d.label.toUpperCase(), x, y);
    doc.setTextColor(...SLATE_900);
    // Long values (e.g. an attachment file name) shrink to fit the column,
    // then wrap onto a second line rather than being cut off.
    const value = d.value || '—';
    const maxW = colW - 4;
    let size = 9.5;
    doc.setFontSize(size);
    while (size > 7.5 && doc.getTextWidth(value) > maxW) { size -= 0.5; doc.setFontSize(size); }
    const lines = (doc.splitTextToSize(value, maxW) as string[]).slice(0, 2);
    doc.text(lines, x, y + 5.5);
  });

  // === LINE ITEMS TABLE ===
  autoTable(doc, {
    startY: y + 14,
    head: [['Sub Category', 'Description', 'Item Value', 'CGST', 'SGST', 'IGST', 'GST', 'TDS', 'Payable']],
    body: data.items.map((i) => [
      i.subCategory,
      i.description,
      fmt(i.itemValue),
      withRate(i.cgstAmount, i.cgstRate),
      withRate(i.sgstAmount, i.sgstRate),
      withRate(i.igstAmount, i.igstRate),
      { content: `${fmt(i.gstAmount)}\n${i.gstType === 'OUTPUT' ? 'OUTPUT' : 'INPUT'}`, gstType: i.gstType },
      `${fmt(i.tdsAmount)}\n(${i.tdsPercent}%)`,
      { content: fmt(i.payableAmount), styles: { fontStyle: 'bold' as const } },
    ]),
    theme: 'plain',
    styles: { font: FONT, lineColor: SLATE_200 as unknown as RGB, lineWidth: 0.2, overflow: 'linebreak' },
    headStyles: {
      fillColor: SLATE_900 as unknown as RGB,
      textColor: WHITE as unknown as RGB,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 3.5, bottom: 3.5, left: 2, right: 2 },
    },
    bodyStyles: { fontSize: 7.5, textColor: SLATE_700 as unknown as RGB, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }, valign: 'middle' },
    alternateRowStyles: { fillColor: SLATE_50 as unknown as RGB },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 17 },
      4: { halign: 'right', cellWidth: 17 },
      5: { halign: 'right', cellWidth: 17 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 18 },
      8: { halign: 'right', cellWidth: 20 },
    },
    // Colour the Input / Output tag under the GST amount, as in the popup.
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 6) {
        const raw = hook.cell.raw as { gstType?: string };
        hook.cell.styles.textColor = (raw.gstType === 'OUTPUT' ? ROSE_600 : EMERALD_600) as unknown as RGB;
      }
      if (hook.section === 'head' && hook.column.index >= 2) hook.cell.styles.halign = 'right';
    },
    margin: { left: marginX, right: marginX },
  });

  // === TOTALS ===
  let ty = (doc as any).lastAutoTable.finalY + 10;
  if (ty > pageHeight - 60) { doc.addPage(); ty = 25; }
  const totalsX = pageWidth - marginX;
  const labelsX = pageWidth - marginX - 70;

  doc.setFontSize(9.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_700);
  doc.text('Item Value', labelsX, ty);
  doc.text(fmt(data.itemTotal), totalsX, ty, { align: 'right' });
  ty += 7;
  doc.text('+ GST', labelsX, ty);
  doc.text(fmt(data.gstTotal), totalsX, ty, { align: 'right' });
  ty += 7;
  doc.text('- TDS', labelsX, ty); // ASCII hyphen: the embedded Inter subset has no U+2212
  doc.text(fmt(data.tdsTotal), totalsX, ty, { align: 'right' });
  ty += 9;

  doc.setFillColor(...AMBER_50);
  doc.setDrawColor(...AMBER_700);
  doc.setLineWidth(0.4);
  doc.roundedRect(labelsX - 5, ty - 6, totalsX - labelsX + 10, 13, 1.5, 1.5, 'FD');
  doc.setFontSize(11);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text('Net Payable', labelsX, ty + 2);
  doc.setTextColor(...AMBER_700);
  doc.text(fmt(data.payableAmount), totalsX, ty + 2, { align: 'right' });

  if (data.partialPayment) {
    ty += 13;
    doc.setFontSize(9.5);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...SLATE_700);
    doc.text('Paid', labelsX, ty);
    doc.text(fmt(data.partialPayment.paid), totalsX, ty, { align: 'right' });
    ty += 7;
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...AMBER_700);
    doc.text('Remaining', labelsX, ty);
    doc.text(fmt(data.partialPayment.remaining), totalsX, ty, { align: 'right' });
  }

  // === NOTES ===
  if (data.notes) {
    let ny = ty + 18;
    doc.setFontSize(7.5);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...SLATE_500);
    doc.text('NOTES', marginX, ny);
    doc.setFontSize(9);
    doc.setTextColor(...SLATE_700);
    const lines = doc.splitTextToSize(data.notes, contentWidth) as string[];
    ny += 5;
    doc.text(lines, marginX, ny);
  }

  // === FOOTER (every page) ===
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 14;
    doc.setDrawColor(...SLATE_200);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY, pageWidth - marginX, footerY);
    doc.setFontSize(8);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...SLATE_400);
    doc.text('Tekfilo - MeghaSales CRM  |  www.tekfilo.com', pageWidth / 2, footerY + 6, { align: 'center' });
  }

  doc.save(data.fileName);
}
