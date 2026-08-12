import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TEKFILO_LOGO } from './logo';
import { INTER_REGULAR_TTF, INTER_BOLD_TTF } from './invoiceFont';

const FONT = 'Inter';

// Same palette as generateInvoicePDF.ts — one visual language across every
// PDF this app produces.
const SLATE_900 = [15, 23, 42] as const;
const SLATE_700 = [51, 65, 85] as const;
const SLATE_500 = [100, 116, 139] as const;
const SLATE_400 = [148, 163, 184] as const;
const SLATE_200 = [226, 232, 240] as const;
const SLATE_50 = [248, 250, 252] as const;
const AMBER_700 = [180, 83, 9] as const;
const AMBER_50 = [255, 251, 235] as const;
const WHITE = [255, 255, 255] as const;
const RED_600 = [220, 38, 38] as const;

export interface PayslipPDFLineItem {
  label: string;
  type: 'EARNING' | 'DEDUCTION';
  amount: number;
}

export interface PayslipPDFData {
  employeeName: string;
  employeeCode: string;
  department: string | null;
  designation: string | null;
  payPeriodLabel: string; // e.g. "August 2026"
  totalDays: number;
  payableDays: number;
  lopDays: number;
  lineItems: PayslipPDFLineItem[];
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  fileName: string;
}

function fmt(amount: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}

export function generatePayslipPDF(data: PayslipPDFData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
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
  doc.text('PAYSLIP', pageWidth - marginX, 20, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...AMBER_700);
  doc.text(data.payPeriodLabel, pageWidth - marginX, 26, { align: 'right' });

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.4);
  doc.line(marginX, 33, pageWidth - marginX, 33);

  // === EMPLOYEE INFO (left) & PERIOD META (right) ===
  const infoTop = 44;

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_400);
  doc.text('EMPLOYEE', marginX, infoTop);

  doc.setFontSize(12);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(data.employeeName, marginX, infoTop + 7);

  doc.setFontSize(9.5);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_700);
  let infoY = infoTop + 13;
  doc.text(data.employeeCode, marginX, infoY);
  const roleLine = [data.designation, data.department].filter(Boolean).join(', ');
  if (roleLine) { infoY += 5; doc.text(roleLine, marginX, infoY); }

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
  doc.text('PAYABLE DAYS', cardX + 5, cardY + 7);
  doc.setFontSize(9.5);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(`${data.payableDays} / ${data.totalDays}`, pageWidth - marginX - 5, cardY + 7, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_500);
  doc.text('LOP DAYS', cardX + 5, cardY + 16);
  doc.setFontSize(9.5);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(data.lopDays > 0 ? RED_600[0] : SLATE_900[0], data.lopDays > 0 ? RED_600[1] : SLATE_900[1], data.lopDays > 0 ? RED_600[2] : SLATE_900[2]);
  doc.text(String(data.lopDays), pageWidth - marginX - 5, cardY + 16, { align: 'right' });

  // === LINE ITEMS TABLE ===
  const tableBody = data.lineItems.map((li) => [
    { content: li.label, styles: { fontStyle: 'bold' as const } },
    { content: li.type === 'EARNING' ? 'Earning' : 'Deduction', styles: { textColor: (li.type === 'EARNING' ? [21, 128, 61] : RED_600) as unknown as [number, number, number] } },
    { content: `${li.type === 'DEDUCTION' ? '-' : ''}${fmt(li.amount)}`, styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
  ]);

  autoTable(doc, {
    startY: 76,
    head: [['Component', 'Type', 'Amount']],
    body: tableBody,
    theme: 'plain',
    styles: { font: FONT, lineColor: SLATE_200 as unknown as [number, number, number], lineWidth: 0.2 },
    headStyles: {
      fillColor: SLATE_900 as unknown as [number, number, number],
      textColor: WHITE as unknown as [number, number, number],
      fontStyle: 'bold',
      fontSize: 9.5,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 5 },
    },
    bodyStyles: { fontSize: 9, textColor: SLATE_700 as unknown as [number, number, number], cellPadding: { top: 5, bottom: 5, left: 6, right: 5 }, valign: 'middle' },
    alternateRowStyles: { fillColor: SLATE_50 as unknown as [number, number, number] },
    columnStyles: {
      0: { cellWidth: contentWidth - 30 - 45 },
      1: { cellWidth: 30 },
      2: { cellWidth: 45, halign: 'right' },
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
  doc.text('Gross Earnings', labelsX, ty);
  doc.text(fmt(data.grossEarnings), totalsX, ty, { align: 'right' });
  ty += 7;

  doc.text('Total Deductions', labelsX, ty);
  doc.setTextColor(...RED_600);
  doc.text(`-${fmt(data.totalDeductions)}`, totalsX, ty, { align: 'right' });
  ty += 3;

  ty += 6;
  const totalBoxW = totalsX - labelsX + 12;
  doc.setFillColor(...AMBER_50);
  doc.setDrawColor(...AMBER_700);
  doc.setLineWidth(0.4);
  doc.roundedRect(labelsX - 5, ty - 6, totalBoxW, 13, 1.5, 1.5, 'FD');
  doc.setFontSize(11);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text('Net Pay', labelsX, ty + 2);
  doc.text(fmt(data.netPay), totalsX, ty + 2, { align: 'right' });

  // === FOOTER ===
  const footerY = 283;
  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);

  doc.setFontSize(8);
  doc.setFont(FONT, 'normal');
  doc.setTextColor(...SLATE_400);
  doc.text('Tekfilo - MeghaSales CRM  |  www.tekfilo.com', pageWidth / 2, footerY + 6, { align: 'center' });
  doc.text('This is a computer-generated payslip and does not require a signature.', pageWidth / 2, footerY + 11, { align: 'center' });

  doc.save(data.fileName);
}
