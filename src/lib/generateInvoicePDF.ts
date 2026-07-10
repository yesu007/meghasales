import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TEKFILO_LOGO } from './logo';

// Tekfilo brand colors (from logo - purple/magenta)
const PRIMARY = [128, 0, 128] as const;    // Purple
const PRIMARY_DARK = [90, 0, 90] as const;  // Dark purple
const ACCENT = [200, 50, 150] as const;     // Magenta/pink accent

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
  taxBreakdown: { taxName: string; rate: number; amount: number }[];
  grandTotal: number;
  currencySymbol: string;
  currencyCode: string;
  fileName: string;
}

function fmt(amount: number, symbol: string): string {
  return `${symbol} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const sym = data.currencySymbol;

  // === TOP HEADER BAR (purple diagonal design) ===
  doc.setFillColor(...PRIMARY_DARK);
  doc.triangle(0, 0, 70, 0, 0, 45, 'F');
  doc.setFillColor(...PRIMARY);
  doc.triangle(0, 0, 85, 0, 0, 55, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 3, 60, 'F');

  // Right side accent
  doc.setFillColor(...PRIMARY_DARK);
  doc.triangle(pageWidth, 0, pageWidth - 50, 0, pageWidth, 35, 'F');
  doc.setFillColor(...PRIMARY);
  doc.triangle(pageWidth, 0, pageWidth - 65, 0, pageWidth, 45, 'F');

  // === LOGO ===
  try {
    doc.addImage(TEKFILO_LOGO, 'PNG', 14, 12, 40, 10);
  } catch {
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('TEKFILO', 14, 22);
  }

  // === "INVOICE" title ===
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text('INVOICE', pageWidth - 14, 28, { align: 'right' });

  // Decorative line under INVOICE
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(2);
  doc.line(pageWidth - 65, 32, pageWidth - 14, 32);

  // === CLIENT INFO (Left) ===
  let y = 68;
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice To:', 14, y);
  y += 7;

  doc.setFontSize(13);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text(data.clientName.toUpperCase(), 14, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(data.companyName, 14, y);
  y += 6;

  if (data.clientPhone) { doc.text(`P : ${data.clientPhone}`, 14, y); y += 5; }
  if (data.clientEmail) { doc.text(`E : ${data.clientEmail}`, 14, y); y += 5; }

  // === INVOICE DETAILS (Right) ===
  const rightX = pageWidth - 14;
  let ry = 68;

  // Invoice number box
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.8);
  doc.roundedRect(rightX - 58, ry - 5, 58, 12, 1, 1, 'S');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(`INVOICE NO: #${data.quotationNumber}`, rightX - 29, ry + 2, { align: 'center' });
  ry += 16;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text('Invoice Date', rightX - 45, ry);
  doc.text(data.date, rightX, ry, { align: 'right' });

  // === TABLE ===
  const tableStartY = 108;

  // Add services/implementation rows
  const tableBody: any[] = [];
  data.modules.forEach(m => {
    tableBody.push([
      { content: m.name + (m.description ? `\n${m.description}` : ''), styles: { fontStyle: 'bold', cellPadding: { top: 5, bottom: 5, left: 6, right: 4 } } },
      { content: String(m.quantity).padStart(2, '0'), styles: { halign: 'center' } },
      { content: fmt(m.unitPrice, sym), styles: { halign: 'center' } },
      { content: fmt(m.total, sym), styles: { halign: 'center', fontStyle: 'bold' } },
    ]);
  });

  // Add implementation, training, AMC as line items if they exist
  if (data.implementationCost > 0) {
    tableBody.push([
      { content: 'Implementation & Setup', styles: { fontStyle: 'bold', cellPadding: { top: 5, bottom: 5, left: 6, right: 4 } } },
      { content: '01', styles: { halign: 'center' } },
      { content: fmt(data.implementationCost, sym), styles: { halign: 'center' } },
      { content: fmt(data.implementationCost, sym), styles: { halign: 'center', fontStyle: 'bold' } },
    ]);
  }
  if (data.trainingCost > 0) {
    tableBody.push([
      { content: 'Training', styles: { fontStyle: 'bold', cellPadding: { top: 5, bottom: 5, left: 6, right: 4 } } },
      { content: '01', styles: { halign: 'center' } },
      { content: fmt(data.trainingCost, sym), styles: { halign: 'center' } },
      { content: fmt(data.trainingCost, sym), styles: { halign: 'center', fontStyle: 'bold' } },
    ]);
  }
  if (data.annualMaintenanceCost > 0) {
    tableBody.push([
      { content: 'Annual Maintenance (AMC)', styles: { fontStyle: 'bold', cellPadding: { top: 5, bottom: 5, left: 6, right: 4 } } },
      { content: '01', styles: { halign: 'center' } },
      { content: fmt(data.annualMaintenanceCost, sym), styles: { halign: 'center' } },
      { content: fmt(data.annualMaintenanceCost, sym), styles: { halign: 'center', fontStyle: 'bold' } },
    ]);
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [['Item Description', 'Quantity', 'Unit Price', 'Total Price']],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [...PRIMARY] as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [40, 40, 40],
      lineColor: [230, 230, 230],
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: [248, 245, 252],
    },
    columnStyles: {
      0: { cellWidth: 75 },
      1: { cellWidth: 30, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 40, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  });

  // === TOTALS SECTION ===
  let ty = (doc as any).lastAutoTable.finalY + 12;
  const totalsX = pageWidth - 14;
  const labelsX = pageWidth - 80;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);

  doc.text('Sub Total', labelsX, ty);
  doc.text(fmt(data.subtotal, sym), totalsX, ty, { align: 'right' });
  ty += 8;

  // Tax
  data.taxBreakdown.forEach(t => {
    doc.text(`${t.taxName} ${t.rate}%`, labelsX, ty);
    doc.text(fmt(t.amount, sym), totalsX, ty, { align: 'right' });
    ty += 8;
  });

  // Discount
  if (data.discountAmount > 0) {
    doc.text(`Discount ${data.discountPercentage}%`, labelsX, ty);
    doc.setTextColor(0, 128, 0);
    doc.text(`-${fmt(data.discountAmount, sym)}`, totalsX, ty, { align: 'right' });
    doc.setTextColor(80);
    ty += 8;
  }

  // Grand Total bar
  ty += 4;
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(labelsX - 5, ty - 5, totalsX - labelsX + 19, 14, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Grand Total', labelsX, ty + 4);
  doc.text(fmt(data.grandTotal, sym), totalsX, ty + 4, { align: 'right' });

  // === PAYMENT & TERMS (Left bottom) ===
  ty += 28;

  // Only show if enough space
  if (ty < 240) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Terms & Conditions:', 14, ty);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('This quotation is valid for 30 days from the date of issue.', 14, ty + 6);
    doc.text('Payment terms as per agreement.', 14, ty + 12);

    ty += 26;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRIMARY);
    doc.text('Thank you for your business!', 14, ty);
  }

  // === FOOTER ===
  const footerY = 280;

  // Bottom decorative bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, footerY - 2, pageWidth, 2, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Tekfilo - MeghaJewels CRM | www.tekfilo.com', pageWidth / 2, footerY + 8, { align: 'center' });

  // Bottom corner accents
  doc.setFillColor(...PRIMARY_DARK);
  doc.triangle(0, 297, 40, 297, 0, 270, 'F');
  doc.setFillColor(...PRIMARY);
  doc.triangle(0, 297, 30, 297, 0, 278, 'F');

  doc.setFillColor(...PRIMARY_DARK);
  doc.triangle(pageWidth, 297, pageWidth - 40, 297, pageWidth, 270, 'F');
  doc.setFillColor(...PRIMARY);
  doc.triangle(pageWidth, 297, pageWidth - 30, 297, pageWidth, 278, 'F');

  // Save
  doc.save(data.fileName);
}
