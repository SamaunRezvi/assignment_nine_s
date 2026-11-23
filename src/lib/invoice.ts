import PDFDocument from 'pdfkit';
import type { Response } from 'express';

interface InvoiceData {
  serviceTitle: string;
  customerName: string;
  technicianName: string;
  amount: number;
  transactionId: string;
  paidAt: Date;
  bookingId: string;
}

const BRAND = '#0f3a52';
const BRAND_LIGHT = '#eef4f7';
const TEXT_MUTED = '#64748b';
const BORDER = '#e2e8f0';

export function streamInvoicePdf(res: Response, invoice: InvoiceData) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fixmate-invoice-${invoice.bookingId}.pdf"`);

  doc.pipe(res);

  const pageWidth = doc.page.width;
  const marginX = 56;
  const contentWidth = pageWidth - marginX * 2;

  // Header band
  doc.rect(0, 0, pageWidth, 120).fill(BRAND);
  doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('FixMate', marginX, 42);
  doc.fillColor('#ffffff').opacity(0.85).fontSize(10).font('Helvetica').text('Repair service invoice', marginX, 72);
  doc.opacity(1);

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('INVOICE', marginX, 42, { width: contentWidth, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#ffffff').opacity(0.85)
    .text(`#${invoice.bookingId.slice(-10).toUpperCase()}`, marginX, 64, { width: contentWidth, align: 'right' });
  doc.opacity(1);

  let y = 156;

  // Billed to / service info columns
  const colWidth = contentWidth / 2;

  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text('BILLED TO', marginX, y);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(12).text(invoice.customerName, marginX, y + 16);

  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9).text('TECHNICIAN', marginX + colWidth, y, { width: colWidth, align: 'right' });
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(12).text(invoice.technicianName, marginX + colWidth, y + 16, { width: colWidth, align: 'right' });

  y += 56;

  doc.strokeColor(BORDER).lineWidth(1).moveTo(marginX, y).lineTo(pageWidth - marginX, y).stroke();
  y += 24;

  // Meta row: paid on / transaction id
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9).text('PAID ON', marginX, y);
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(invoice.paidAt.toDateString(), marginX, y + 14);

  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9).text('TRANSACTION ID', marginX + colWidth, y, { width: colWidth, align: 'right' });
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(invoice.transactionId, marginX + colWidth, y + 14, { width: colWidth, align: 'right' });

  y += 56;

  // Service table
  const tableTop = y;
  const rowHeight = 32;

  doc.rect(marginX, tableTop, contentWidth, rowHeight).fill(BRAND_LIGHT);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9)
    .text('DESCRIPTION', marginX + 14, tableTop + 11)
    .text('AMOUNT', marginX, tableTop + 11, { width: contentWidth - 14, align: 'right' });

  y = tableTop + rowHeight;
  doc.strokeColor(BORDER).lineWidth(1).moveTo(marginX, y).lineTo(pageWidth - marginX, y).stroke();

  const serviceRowHeight = 44;
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(invoice.serviceTitle, marginX + 14, y + 14, { width: contentWidth - 160 });
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11)
    .text(`$${invoice.amount.toFixed(2)}`, marginX, y + 14, { width: contentWidth - 14, align: 'right' });

  y += serviceRowHeight;
  doc.strokeColor(BORDER).lineWidth(1).moveTo(marginX, y).lineTo(pageWidth - marginX, y).stroke();
  y += 20;

  // Total
  const totalBoxWidth = 220;
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
    .text('Total Paid', marginX + contentWidth - totalBoxWidth, y, { width: totalBoxWidth - 110, align: 'left' });
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(18)
    .text(`$${invoice.amount.toFixed(2)}`, marginX + contentWidth - 110, y - 4, { width: 110, align: 'right' });

  y += 60;

  doc.strokeColor(BORDER).lineWidth(1).moveTo(marginX, y).lineTo(pageWidth - marginX, y).stroke();
  y += 20;

  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text('This invoice confirms payment has been received in full for the service listed above.', marginX, y, { width: contentWidth });

  y += 40;

  // Footer
  doc.strokeColor(BORDER).lineWidth(1).moveTo(marginX, y).lineTo(pageWidth - marginX, y).stroke();
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text('Thank you for using FixMate.', marginX, y + 14, { width: contentWidth, align: 'center' });

  doc.end();
}
