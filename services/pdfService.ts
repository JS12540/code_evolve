import jsPDF from 'jspdf';
import { ProjectFile, Severity } from '../types';

export const generateMigrationReport = (files: ProjectFile[]): void => {
  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(22);
  doc.setTextColor(59, 130, 246); // Primary Blue
  doc.text("CodeEvolve Migration Report", 14, yPos);
  
  yPos += 10;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 14, yPos);
  
  yPos += 15;

  const analyzedFiles = files.filter(f => f.status === 'completed' && f.result);

  if (analyzedFiles.length === 0) {
    doc.text("No analyzed files to report.", 14, yPos);
    doc.save("migration-report.pdf");
    return;
  }

  analyzedFiles.forEach((file) => {
    // Check for page break
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }

    // File Header
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`File: ${file.path}`, 14, yPos);
    yPos += 8;

    if (!file.result || file.result.changes.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("No issues detected.", 20, yPos);
      yPos += 10;
      return;
    }

    // Summary
    if (file.result.summary) {
      doc.setFontSize(10);
      doc.setTextColor(80);
      const splitSummary = doc.splitTextToSize(file.result.summary, 180);
      doc.text(splitSummary, 20, yPos);
      yPos += (splitSummary.length * 5) + 5;
    }

    // Changes
    file.result.changes.forEach(change => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      // Icon/Severity Simulation
      let severityColor = [100, 116, 139]; // Slate
      if (change.severity === Severity.HIGH) severityColor = [239, 68, 68];
      if (change.severity === Severity.MEDIUM) severityColor = [249, 115, 22];

      doc.setTextColor(severityColor[0], severityColor[1], severityColor[2]);
      doc.setFontSize(9);
      doc.text(`[${change.severity}] ${change.type} (Line ${change.lineNumber})`, 20, yPos);
      yPos += 5;

      doc.setTextColor(50);
      doc.setFontSize(9);
      const desc = doc.splitTextToSize(change.description, 170);
      doc.text(desc, 25, yPos);
      yPos += (desc.length * 5) + 5;
    });

    yPos += 10; // Spacing between files
  });

  doc.save("migration-report.pdf");
};
