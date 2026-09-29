"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditIssue } from "@/lib/audit/types";

type Props = { issues: AuditIssue[]; approvedIds: string[]; onSelect: (issue: AuditIssue) => void };
export function SuggestionTable({ issues, approvedIds, onSelect }: Props) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 12 });
  const columns: ColumnDef<AuditIssue>[] = [
    {
      header: "PRIORITY",
      accessorKey: "severity",
      cell: ({ row }) => (
        <span className={`severity-tag tag-${row.original.severity}`}>{row.original.severity}</span>
      ),
    },
    {
      header: "PRODUCT",
      accessorKey: "productTitle",
      cell: ({ getValue }) => <strong>{getValue<string>()}</strong>,
    },
    { header: "ISSUE", accessorKey: "ruleId" },
    { header: "FIELD", accessorKey: "field" },
    { header: "IMPACT", accessorKey: "impact" },
    {
      header: "STATUS",
      cell: ({ row }) =>
        approvedIds.includes(row.original.id) ? (
          <span className="approved-label">
            <Check size={13} /> Approved
          </span>
        ) : (
          <span className="pending-label">Needs review</span>
        ),
    },
    { id: "open", cell: () => <ChevronRight size={15} /> },
  ];
  const table = useReactTable({
    data: issues,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} onClick={() => onSelect(row.original)}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>
          Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())} · {issues.length}{" "}
          findings
        </span>
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </>
  );
}
