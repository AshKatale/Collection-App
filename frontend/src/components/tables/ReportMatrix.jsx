export default function ReportMatrix({
  columns,
  data,
  stickyFirstCol = true,
  highlightTotalRow = true,
  emptyMessage = 'No data available',
}) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((col, i) => (
              <th
                key={col.key || i}
                className={`px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b border-gray-200 ${
                  i === 0 && stickyFirstCol ? 'sticky left-0 bg-gray-50 z-10' : ''
                } ${i === 1 && stickyFirstCol ? 'sticky left-10 bg-gray-50 z-10' : ''} ${col.className || ''}`}
                style={i === 0 && stickyFirstCol ? { minWidth: '40px' } : i === 1 && stickyFirstCol ? { minWidth: '150px' } : {}}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            const isLastRow = rowIdx === data.length - 1;
            const isTotalRow = isLastRow && highlightTotalRow;
            return (
              <tr
                key={rowIdx}
                className={`${isTotalRow ? 'bg-primary-50 font-bold' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100/50`}
              >
                {columns.map((col, colIdx) => {
                  const val = typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor];
                  return (
                    <td
                      key={col.key || colIdx}
                      className={`px-3 py-2 whitespace-nowrap border-b border-gray-100 text-gray-700 ${
                        colIdx === 0 && stickyFirstCol
                          ? `sticky left-0 z-10 ${isTotalRow ? 'bg-primary-50' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`
                          : ''
                      } ${
                        colIdx === 1 && stickyFirstCol
                          ? `sticky left-10 z-10 ${isTotalRow ? 'bg-primary-50' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`
                          : ''
                      } ${col.cellClassName || ''}`}
                    >
                      {col.render ? col.render(row, rowIdx) : (typeof val === 'number' && colIdx > 1 ? (val || '') : val)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
