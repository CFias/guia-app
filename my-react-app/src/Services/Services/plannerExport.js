// plannerExport.js

export const abrirEscalaEmNovaAba = ({
    semana = [],
    extras = {},
    agruparRegistrosPorServico,
    getTextoStatusServico,
    getClasseStatusServico,
}) => {
    try {
        const novaAba = window.open("", "_blank");

        if (!novaAba) {
            alert("O navegador bloqueou a abertura da nova aba.");
            return;
        }

        const dadosEscala = [];

        semana.forEach((dia) => {
            const registrosOrdenados = agruparRegistrosPorServico(extras[dia.date] || []);

            if (!registrosOrdenados.length) {
                dadosEscala.push({
                    data: dia.label,
                    passeio: "-",
                    guia: "-",
                    pax: "-",
                    status: "-",
                });
                return;
            }

            registrosOrdenados.forEach((item) => {
                dadosEscala.push({
                    data: dia.label,
                    passeio: item.serviceName || "-",
                    guia: item.guiaNome || "-",
                    pax: Number(item.passengers || 0),
                    status: getTextoStatusServico(item),
                    statusClass: getClasseStatusServico(item),
                });
            });
        });

        let htmlLinhas = "";
        let i = 0;

        while (i < dadosEscala.length) {
            const dataAtual = dadosEscala[i].data;
            const grupo = [];

            while (i < dadosEscala.length && dadosEscala[i].data === dataAtual) {
                grupo.push(dadosEscala[i]);
                i++;
            }

            grupo.forEach((linha, index) => {
                htmlLinhas += `
          <tr>
            ${index === 0
                        ? `<td rowspan="${grupo.length}" class="data-cell">${linha.data}</td>`
                        : ""
                    }
            <td>${linha.passeio}</td>
            <td>${linha.guia}</td>
            <td>${linha.pax}</td>
            <td class="${linha.statusClass || ""}">${linha.status}</td>
          </tr>
        `;
            });
        }

        const dadosJson = JSON.stringify(dadosEscala);

        novaAba.document.write(`
      <html>
        <head>
          <title>Escala Semanal de Passeios</title>
          <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 24px;
              background: #ebebeb;
              color: #222;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-direction: column;
            }
            h1 { margin-bottom: 18px; font-size: 16px; }
            .toolbar {
              margin-bottom: 18px;
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }
            button {
              background: #107c41;
              color: white;
              border: none;
              border-radius: 8px;
              padding: 12px 18px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
            }
            .table-wrap {
              overflow-x: auto;
              border-radius: 12px;
            }
            table { border-collapse: collapse; }
            thead {
              background: #107c41;
              color: white;
            }
            th, td {
              border: 1px solid #d9d9d9;
              padding: 6px 6px;
              text-align: left;
              font-size: 12px;
            }
            .data-cell {
              font-weight: 700;
              font-size: 18px;
              background: #f1f7f2;
              white-space: nowrap;
            }
            tbody tr:nth-child(even) { background: #fafafa; }
            .status-fechado {
              color: #b42318;
              background: #fcd9d6;
              font-weight: 700;
            }
            .status-formado {
              color: #027a48;
              background: #d1fae5;
              font-weight: 700;
            }
            .status-alerta {
              color: #b54708;
              font-weight: 700;
            }
            .status-privativo {
              color: #3730a3;
              background: #eef2ff;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <h1>Escala Semanal de Passeios</h1>
          <div class="toolbar">
            <button onclick="window.print()">Imprimir / Salvar em PDF</button>
            <button onclick="exportarExcel()">Exportar Excel</button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>DATA</th>
                  <th>PASSEIOS</th>
                  <th>GUIAS</th>
                  <th>QUANTIDADE DE PAX</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                ${htmlLinhas}
              </tbody>
            </table>
          </div>

          <script>
            const dadosEscala = ${dadosJson};

            function exportarExcel() {
              try {
                const linhas = [
                  ["DATA", "PASSEIOS", "GUIAS", "QUANTIDADE DE PAX", "STATUS"]
                ];

                const merges = [];
                let rowIndex = 1;
                let i = 0;

                while (i < dadosEscala.length) {
                  const dataAtual = dadosEscala[i].data;
                  const grupo = [];

                  while (i < dadosEscala.length && dadosEscala[i].data === dataAtual) {
                    grupo.push(dadosEscala[i]);
                    i++;
                  }

                  const inicioBloco = rowIndex;

                  grupo.forEach((item, index) => {
                    linhas.push([
                      index === 0 ? item.data : "",
                      item.passeio,
                      item.guia,
                      item.pax,
                      item.status
                    ]);
                    rowIndex++;
                  });

                  const fimBloco = rowIndex - 1;

                  if (fimBloco > inicioBloco) {
                    merges.push({
                      s: { r: inicioBloco, c: 0 },
                      e: { r: fimBloco, c: 0 }
                    });
                  }
                }

                const worksheet = XLSX.utils.aoa_to_sheet(linhas);

                worksheet["!cols"] = [
                  { wch: 24 },
                  { wch: 42 },
                  { wch: 24 },
                  { wch: 20 },
                  { wch: 20 }
                ];

                worksheet["!merges"] = merges;

                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Escala Semanal");
                XLSX.writeFile(workbook, "escala_semanal.xlsx");
              } catch (err) {
                console.error("Erro ao exportar Excel:", err);
                alert("Erro ao exportar Excel.");
              }
            }
          </script>
        </body>
      </html>
    `);

        novaAba.document.close();
    } catch (err) {
        console.error("Erro ao abrir escala em nova aba:", err);
    }
};