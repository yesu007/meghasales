import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TEKFILO_LOGO } from './logo';
import { INTER_REGULAR_TTF, INTER_BOLD_TTF } from './invoiceFont';
import { localeForCurrency } from './currency';

const FONT = 'Inter';

// Subtle palette matching the app's own slate + amber design system (see dashboard UI)
const SLATE_900 = [15, 23, 42] as const;
const SLATE_700 = [51, 65, 85] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_400 = [148, 163, 184] as const;
const SLATE_200 = [226, 232, 240] as const;
const SLATE_50 = [248, 250, 252] as const;
const AMBER_700 = [180, 83, 9] as const;
const AMBER_50 = [255, 251, 235] as const;
const WHITE = [255, 255, 255] as const;

interface InvoiceData {
  quotationNumber: string;
  date: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  clientPhone: string;
  modules: { name: string; description: string; quantity: number; unitPrice: number; total: number }[];
  implementationCost: number;
  trainingCost: number;
  annualMaintenanceCost: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxInclusive?: boolean;
  taxBreakdown: { taxName: string; rate: number; amount: number }[];
  grandTotal: number;
  currencySymbol: string;
  currencyCode: string;
  fileName: string;
}

// Kept as "symbol amount" (always a space) to match the PDF's existing
// visual convention exactly — only the digit grouping was ever hardcoded to
// en-IN regardless of currency; that's the one thing this fixes.
function fmt(amount: number, symbol: string, currencyCode: string): string {
  const formattedNumber = new Intl.NumberFormat(localeForCurrency(currencyCode), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${symbol} ${formattedNumber}`;
}

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;
  const sym = data.currencySymbol;

  // Embed a real Unicode font so ₹ (and other currency symbols) render as an
  // actual glyph — jsPDF's built-in Helvetica only supports WinAnsi and
  // silently substitutes a broken character for the Rupee sign.
  doc.addFileToVFS('Inter-Regular.ttf', INTER_REGULAR_TTF);
  doc.addFont('Inter-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', INTER_BOLD_TTF);
  doc.addFont('Inter-Bold.ttf', FONT, 'bold');
  doc.setFont(FONT, 'normal');

  // === HEADER ===
  try {
    // Logo aspect ratio is 165:43
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
  doc.text('INVOICE', pageWidth - marginX, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...AMBER_700);
  doc.text(`#${data.quotationNumber}`, pageWidth - marginX, 26, { align: 'right' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.line(marginX, 33, pageWidth - marginX, 33);

  // === CLIENT INFO (left) & DOCUMENT META (right) ===
  const infoTop = 44;

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_400);
  doc.text('BILL TO', marginX, infoTop);

  doc.setFontSize(12);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(data.clientName, marginX, infoTop + 7);

  doc.setFontSize(9.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_700);
  let clientY = infoTop + 13;
  doc.text(data.companyName, marginX, clientY);
  if (data.clientPhone) { clientY += 5; doc.text(data.clientPhone, marginX, clientY); }
  if (data.clientEmail) { clientY += 5; doc.text(data.clientEmail, marginX, clientY); }

  // Meta card (right)
  const cardW = 62;
  const cardX = pageWidth - marginX - cardW;
  const cardY = infoTop - 4;
  doc.setFillColor(...SLATE_50);
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.roundedRect(cardX, cardY, cardW, 22, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_500);
  doc.text('QUOTATION NO.', cardX + 5, cardY + 7);
  doc.setFontSize(9.5);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(data.quotationNumber, pageWidth - marginX - 5, cardY + 7, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_500);
  doc.text('DATE', cardX + 5, cardY + 16);
  doc.setFontSize(9.5);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(data.date, pageWidth - marginX - 5, cardY + 16, { align: 'right' });

  // === TABLE ===
  const tableBody: any[] = [];
  const addRow = (name: string, description: string, qty: number, unitPrice: number, total: number) => {
    tableBody.push([
      { content: name + (description ? `\n${description}` : ''), styles: { fontStyle: 'bold' } },
      { content: String(qty).padStart(2, '0'), styles: { halign: 'center' } },
      { content: fmt(unitPrice, sym, data.currencyCode), styles: { halign: 'right' } },
      { content: fmt(total, sym, data.currencyCode), styles: { halign: 'right', fontStyle: 'bold' } },
    ]);
  };

  data.modules.forEach(m => addRow(m.name, m.description, m.quantity, m.unitPrice, m.total));
  if (data.implementationCost > 0) addRow('Implementation & Setup', '', 1, data.implementationCost, data.implementationCost);
  if (data.trainingCost > 0) addRow('Training', '', 1, data.trainingCost, data.trainingCost);
  if (data.annualMaintenanceCost > 0) addRow('Annual Maintenance (AMC)', '', 1, data.annualMaintenanceCost, data.annualMaintenanceCost);

  autoTable(doc, {
    startY: 76,
    head: [['Item Description', 'Qty', 'Unit Price', 'Total Price']],
    body: tableBody,
    theme: 'plain',
    styles: {
      font: FONT,
      lineColor: SLATE_200 as unknown as [number, number, number],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: SLATE_900 as unknown as [number, number, number],
      textColor: WHITE as unknown as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 5 },
    },
    bodyStyles: {
      fontSize: 9,
      textColor: SLATE_700 as unknown as [number, number, number],
      cellPadding: { top: 5, bottom: 5, left: 6, right: 5 },
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: SLATE_50 as unknown as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 22 - 40 - 40 },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  // === TOTALS ===
  let ty = (doc as any).lastAutoTable.finalY + 10;
  const totalsX = pageWidth - marginX;
  const labelsX = pageWidth - marginX - 65;

  doc.setFontSize(9.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_700);

  doc.text(data.taxInclusive ? 'Sub Total (incl. tax)' : 'Sub Total', labelsX, ty);
  doc.text(fmt(data.subtotal, sym, data.currencyCode), totalsX, ty, { align: 'right' });
  ty += 7;

  // Exclusive tax is added on top of the subtotal, so it's shown as its own
  // running-total line here. Inclusive tax is already baked into the
  // subtotal above — showing it again as an addition would double-count it,
  // so it's surfaced as a non-additive note under the Grand Total instead.
  if (!data.taxInclusive) {
    data.taxBreakdown.forEach(t => {
      doc.text(`${t.taxName} (${t.rate}%)`, labelsX, ty);
      doc.text(fmt(t.amount, sym, data.currencyCode), totalsX, ty, { align: 'right' });
      ty += 7;
    });
  }

  if (data.discountAmount > 0) {
    doc.setTextColor(...SLATE_700);
    doc.text(`Discount (${data.discountPercentage}%)`, labelsX, ty);
    doc.setTextColor(21, 128, 61);
    doc.text(`-${fmt(data.discountAmount, sym, data.currencyCode)}`, totalsX, ty, { align: 'right' });
    ty += 7;
  }

  // Grand Total — emphasized but subtle (light tint + border, not a solid saturated block)
  ty += 3;
  const totalBoxW = totalsX - labelsX + 12;
  doc.setFillColor(...AMBER_50);
  doc.setDrawColor(...AMBER_700);
  doc.setLineWidth(0.4);
  doc.roundedRect(labelsX - 5, ty - 6, totalBoxW, 13, 1.5, 1.5, 'FD');
  doc.setFontSize(11);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text('Grand Total', labelsX, ty + 2);
  doc.text(fmt(data.grandTotal, sym, data.currencyCode), totalsX, ty + 2, { align: 'right' });
  ty += 13;

  if (data.taxInclusive && data.taxBreakdown.length > 0) {
    doc.setFontSize(7.5);
    doc.setFont(FONT, 'normal');
    doc.setTextColor(...SLATE_500);
    const parts = data.taxBreakdown.map(t => `${t.taxName} (${t.rate}%) ${fmt(t.amount, sym, data.currencyCode)}`).join('   |   ');
    doc.text(`Inclusive of: ${parts}`, totalsX, ty, { align: 'right' });
    ty += 6;
  }

  // === TERMS ===
  ty += 11;
  if (ty < 235) {
    doc.setFontSize(9);
    doc.setFont(FONT, 'bold');
    doc.setTextColor(...SLATE_900);
    doc.text('Terms & Conditions', marginX, ty);

    doc.setFont(FONT, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_500);
    doc.text('This quotation is valid for 30 days from the date of issue.', marginX, ty + 6);
    doc.text('Payment terms as per agreement.', marginX, ty + 11.5);

    doc.setFont(FONT, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...AMBER_700);
    doc.text('Thank you for your business!', marginX, ty + 22);
  }

  // === FOOTER ===
  const footerY = 283;
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_400);
  doc.text('Tekfilo - MeghaSales CRM  |  www.tekfilo.com', pageWidth / 2, footerY + 6, { align: 'center' });

  doc.save(data.fileName);
}
