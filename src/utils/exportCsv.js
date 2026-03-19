/**
 * Generates a CSV string and triggers a browser download.
 * @param {string} filename - Name of the downloaded file (without .csv)
 * @param {string[]} headers - Column headers
 * @param {Array<Array<string|number>>} rows - Data rows
 */
export function downloadCsv(filename, headers, rows) {
  const escape = (v) => {
    const str = v == null ? "" : String(v);
    return str.includes(";") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [
    headers.map(escape).join(";"),
    ...rows.map((row) => row.map(escape).join(";")),
  ];
  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
