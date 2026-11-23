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

export function streamInvoicePdf(res: Response, invoice: InvoiceData) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="fixmate-invoice-${invoice.bookingId}.pdf"`);

  doc.pipe(res);

  doc.fontSize(22).text('FixMate', { align: 'left' });
  doc.fontSize(10).fillColor('#666').text('Repair service invoice');
  doc.moveDown(2);

  doc.fillColor('#000').fontSize(14).text('Invoice');
  doc.moveDown(0.5);

  const rows: [string, string][] = [
    ['Service', invoice.serviceTitle],
    ['Customer', invoice.customerName],
    ['Technician', invoice.technicianName],
    ['Amount Paid', `$${invoice.amount.toFixed(2)}`],
    ['Transaction ID', invoice.transactionId],
    ['Paid On', invoice.paidAt.toDateString()],
  ];

  doc.fontSize(11);
  for (const [label, value] of rows) {
    doc.fillColor('#666').text(label, { continued: true, width: 150 });
    doc.fillColor('#000').text(`  ${value}`);
    doc.moveDown(0.5);
  }

  doc.moveDown(1.5);
  doc.fontSize(9).fillColor('#999').text('Thank you for using FixMate.', { align: 'left' });

  doc.end();
}
