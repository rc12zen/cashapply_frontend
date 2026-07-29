import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Saves a landscape PDF table as {pageName}_{YYYY-MM-DD}_{HH-MM-SS}.pdf */
export function downloadTablePdf(
  pageName: string,
  head: string[],
  body: (string | number)[][],
  filters?: Record<string, string | undefined>,
) {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const stamp =
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text(`${pageName.replace(/_/g, " ")} — ${stamp.replace("_", " ")}`, 14, 14);
  let startY = 20;
  const filterLine = Object.entries(filters ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("   ·   ");
  if (filterLine) {
    doc.setFontSize(9);
    doc.text(`Filters — ${filterLine}`, 14, 20);
    startY = 25;
  }
  autoTable(doc, {
    head: [head],
    body,
    startY,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [34, 34, 34] },
  });
  doc.save(`${pageName}_${stamp}.pdf`);
}
