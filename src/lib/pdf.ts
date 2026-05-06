// v117 PDF helper — no external dependencies.
// Opens a clean print window for a professional certificate layout.
// Works on Vercel/Next.js without installing html2pdf.js.

export const generatePDF = (elementId: string = "certificate") => {
  if (typeof window === "undefined") return

  const element = document.getElementById(elementId)
  if (!element) {
    window.alert("Certificate content not found.")
    return
  }

  const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
    .map((node) => node.outerHTML)
    .join("\n")

  const printWindow = window.open("", "_blank", "width=1200,height=900")
  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to export the certificate.")
    return
  }

  printWindow.document.open()
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Payment Certificate</title>
        ${styles}
        <style>
          @page { size: A4; margin: 12mm; }
          body { margin: 0; background: #fff; font-family: Arial, Tahoma, sans-serif; }
          .no-print { display: none !important; }
          #certificate { width: 100%; }
        </style>
      </head>
      <body>
        ${element.outerHTML}
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
