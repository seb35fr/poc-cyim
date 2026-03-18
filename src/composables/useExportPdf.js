import { ref } from "vue";

export function useExportPdf() {
  const exporting = ref(false);

  async function exportToPdf(element, filename) {
    exporting.value = true;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [12, 10, 12, 10],
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
          pagebreak: { mode: ["css", "legacy"], before: ".pdf-page-break" },
        })
        .from(element)
        .save();
    } catch (e) {
      console.error("PDF export failed:", e);
      alert("Erreur lors de l'export PDF : " + e.message);
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportToPdf };
}
