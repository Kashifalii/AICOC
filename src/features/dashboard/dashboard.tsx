"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  Package,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Store,
  Sun,
  TriangleAlert,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import demoProducts from "@/data/demo-store.json";
import type { Product, AuditIssue } from "@/lib/audit/types";
import { auditProducts } from "@/lib/audit/rules";
import { scoreStore } from "@/lib/audit/scoring";
import { mapShopifyCsv } from "@/lib/utils/csv";
import { Button } from "@/components/ui/button";
import { SuggestionTable } from "@/features/review/suggestion-table";

type ProductRecord = Product;
const originalProducts = demoProducts as ProductRecord[];

export function Dashboard() {
  const [products, setProducts] = useState<ProductRecord[]>(originalProducts);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [hasAudit, setHasAudit] = useState(false);
  const [scoreBefore, setScoreBefore] = useState<number | null>(null);
  const [auditHistory, setAuditHistory] = useState<{ day: string; score: number }[]>([]);
  const [active, setActive] = useState("Overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All issues");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<AuditIssue | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [dark, setDark] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);
  const [approvedValues, setApprovedValues] = useState<Record<string, string>>({});
  const [exported, setExported] = useState(false);
  const filteredIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          (filter === "All issues" || issue.severity === filter.toLowerCase()) &&
          `${issue.productTitle} ${issue.ruleId} ${issue.field}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [issues, filter, query],
  );
  const score = hasAudit ? scoreStore(products, issues) : null;
  const severity = ["critical", "high", "medium", "low"].map((name) => ({
    name,
    total: issues.filter((item) => item.severity === name).length,
  }));
  const runAudit = () => {
    setBusy(true);
    setMessage("");
    window.setTimeout(() => {
      const found = auditProducts(products);
      const nextScore = scoreStore(products, found);
      setIssues(found);
      setHasAudit(true);
      setScoreBefore(nextScore);
      setAuditHistory((current) => [
        ...current,
        {
          day: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          score: nextScore,
        },
      ]);
      setBusy(false);
      setActive("Overview");
      setMessage(
        `Audit complete Â· ${found.length} opportunities found across ${products.length} products`,
      );
    }, 180);
  };
  const startDemo = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Demo store could not be loaded");
      const result = (await response.json()) as { products: ProductRecord[] };
      setProducts(result.products);
      setIssues([]);
      setHasAudit(false);
      setAuditHistory([]);
      setScoreBefore(null);
      setApproved([]);
      setApprovedValues({});
      setMessage("Demo Store loaded Â· 100 products ready to audit");
    } catch {
      setMessage("Demo Store is ready locally. Run an audit to view the results.");
      setProducts(originalProducts);
    } finally {
      setBusy(false);
    }
  };
  const generateSuggestion = async (issue: AuditIssue) => {
    const product = products.find((item) => item.id === issue.productId);
    if (!product) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
        }),
      });
      const payload = (await response.json()) as {
        error?: { message: string };
        title?: string;
        meta_description?: string;
        description_html?: string;
      };
      if (response.ok) {
        const value =
          issue.field === "seoTitle"
            ? payload.title
            : issue.field === "seoDescription"
              ? payload.meta_description
              : issue.field === "description"
                ? payload.description_html
                : undefined;
        if (value && selected?.id === issue.id) setDraftValue(value);
      }
      setMessage(
        response.ok
          ? `AI draft ready for ${product.title}`
          : (payload.error?.message ?? "AI suggestions are unavailable."),
      );
    } catch {
      setMessage("AI suggestions are not configured. Add GEMINI_API_KEY to enable them.");
    } finally {
      setBusy(false);
    }
  };
  const openIssue = (issue: AuditIssue) => {
    setSelected(issue);
    setDraftValue(approvedValues[issue.id] ?? issue.currentValue);
  };
  const approveSelected = () => {
    if (!selected) return;
    if (
      !["seoTitle", "seoDescription", "description", "title", "images.alt"].includes(selected.field)
    ) {
      setMessage(
        "This issue needs a supported field edit before it can be approved. URL handle changes are advisory only.",
      );
      return;
    }
    if (!draftValue.trim() || draftValue === selected.currentValue) {
      setMessage("Edit the suggested value before approving this change.");
      return;
    }
    setApproved((current) => (current.includes(selected.id) ? current : [...current, selected.id]));
    setApprovedValues((current) => ({ ...current, [selected.id]: draftValue }));
    setMessage("Change approved for this demo session");
    setSelected(null);
  };
  const simulatePublish = () => {
    if (!approved.length) {
      setMessage("Approve a change before simulated publishing.");
      return;
    }
    const before = score ?? scoreStore(products, auditProducts(products));
    const updated = products.map((product) =>
      approved.reduce((item, id) => {
        const issue = issues.find((candidate) => candidate.id === id);
        const value = approvedValues[id];
        if (!issue || issue.productId !== item.id || value === undefined) return item;
        if (issue.field === "images.alt")
          return {
            ...item,
            images: item.images.map((image, index) =>
              index === 0 ? { ...image, alt: value } : image,
            ),
          };
        if (["title", "description", "seoTitle", "seoDescription"].includes(issue.field))
          return { ...item, [issue.field]: value };
        return item;
      }, product),
    );
    const nextIssues = auditProducts(updated);
    const after = scoreStore(updated, nextIssues);
    setProducts(updated);
    setIssues(nextIssues);
    setHasAudit(true);
    setScoreBefore(before);
    setAuditHistory((current) => [
      ...current,
      {
        day: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: after,
      },
    ]);
    setApproved([]);
    setApprovedValues({});
    setSelected(null);
    setMessage(
      `Demo changes applied Â· Content Health Score ${before} â†’ ${after} (${after - before >= 0 ? "+" : ""}${after - before})`,
    );
  };
  const exportApproved = () => {
    const approvedIssues = issues.filter((item) => approved.includes(item.id));
    if (!approvedIssues.length) {
      setMessage("Approve at least one suggestion before exporting.");
      return;
    }
    const rows = [
      ["Handle", "Title", "Description", "SEO Title", "SEO Description"],
      ...approvedIssues.map((item) => {
        const product = products.find((p) => p.id === item.productId)!;
        const value = approvedValues[item.id] ?? item.currentValue;
        return [
          product.handle,
          item.field === "title" ? value : product.title,
          item.field === "description" ? value : product.description,
          item.field === "seoTitle" ? value : product.seoTitle,
          item.field === "seoDescription" ? value : product.seoDescription,
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "approved-product-changes.csv";
    link.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setMessage(
      `Exported ${approvedIssues.length} approved change${approvedIssues.length === 1 ? "" : "s"} to CSV`,
    );
  };
  const nav = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Audit results", icon: TriangleAlert },
    { name: "Review queue", icon: FileText },
    { name: "Stores & import", icon: Store },
    { name: "Audit history", icon: Clock3 },
  ];
  const categories = [
    {
      name: "SEO & metadata",
      value: issues.filter((i) => i.category === "SEO metadata").length,
      color: "bg-primary",
    },
    {
      name: "Content quality",
      value: issues.filter((i) => i.category === "Content uniqueness").length,
      color: "bg-chart-2",
    },
    {
      name: "Image accessibility",
      value: issues.filter((i) => i.category === "Image accessibility").length,
      color: "bg-chart-3",
    },
    {
      name: "Attributes",
      value: issues.filter((i) => i.category === "Attributes").length,
      color: "bg-chart-4",
    },
  ];
  return (
    <div className={dark ? "dark min-h-screen" : "min-h-screen"}>
      <div className="app-shell min-h-screen bg-background text-foreground">
        <aside className="sidebar">
          <a href="#home" className="brand-lockup">
            <span className="brand-mark">
              <Command size={19} />
            </span>
            <span>
              orbit<span className="brand-light">commerce</span>
            </span>
          </a>
          <div className="workspace-switcher">
            <div className="workspace-avatar">N</div>
            <div className="workspace-copy">
              <strong>Northstar Goods</strong>
              <span>Free workspace</span>
            </div>
            <ChevronDown size={15} className="text-muted-foreground" />
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Main navigation" className="side-nav">
            {nav.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => {
                  setActive(name);
                  setSelected(null);
                }}
                className={`nav-item ${active === name ? "nav-active" : ""}`}
              >
                <Icon size={17} />
                <span>{name}</span>
                {name === "Review queue" && issues.length > 0 && (
                  <span className="nav-count">{issues.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="nav-label stores-label">CONNECTED STORE</div>
          <button className="store-link" onClick={() => setActive("Stores & import")}>
            <span className="store-dot" />
            <span>Northstar Goods</span>
            <span className="demo-pill">DEMO</span>
          </button>
          <div className="sidebar-bottom">
            <div className="usage-box">
              <div className="usage-title">
                <span>Monthly usage</span>
                <CircleHelp size={14} />
              </div>
              <div className="usage-number">
                <strong>{products.length}</strong>
                <span> / 100 products</span>
              </div>
              <div className="usage-track">
                <div style={{ width: `${Math.min(100, products.length)}%` }} />
              </div>
              <span className="usage-caption">Free plan Â· resets Oct 1</span>
            </div>
            <button className="nav-item settings-nav" onClick={() => setActive("Settings")}>
              <Settings2 size={17} /> Settings
            </button>
            <div className="profile-row">
              <div className="profile-avatar">JD</div>
              <div className="profile-copy">
                <strong>Jordan Davis</strong>
                <span>Store owner</span>
              </div>
              <button
                className="icon-button"
                aria-label="Toggle color theme"
                onClick={() => setDark(!dark)}
              >
                <Sun size={16} />
              </button>
            </div>
          </div>
        </aside>
        <main className="main-panel">
          <header className="topbar">
            <div className="breadcrumbs">
              <span>Northstar Goods</span>
              <ChevronRight size={14} />
              <strong>{active}</strong>
            </div>
            <div className="topbar-actions">
              <span className="connection-status">
                <span />
                Store connected
              </span>
              <Button variant="outline" size="sm" onClick={startDemo} disabled={busy}>
                <Plus size={15} /> Add products
              </Button>
              <div className="profile-avatar top-avatar">JD</div>
            </div>
          </header>
          <div className="page-content">
            <section className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-dot" /> STORE HEALTH
                </div>
                <h1>{active === "Overview" ? "Good morning, Jordan" : active}</h1>
                <p>
                  {active === "Overview"
                    ? "Hereâ€™s whatâ€™s happening with your product catalog."
                    : "Review product quality and turn opportunities into approved improvements."}
                </p>
              </div>
              <div className="heading-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDark(!dark);
                  }}
                >
                  <Sun size={15} /> Appearance
                </Button>
                <Button onClick={runAudit} disabled={busy}>
                  <span className={busy ? "animate-spin" : ""}>
                    {busy ? <LoaderCircle size={16} /> : <Sparkles size={16} />}
                  </span>
                  {busy ? "Workingâ€¦" : "Run audit"}
                </Button>
              </div>
            </section>
            {message && (
              <div role="status" className="notice">
                <span>{message}</span>
                <button onClick={() => setMessage("")} aria-label="Dismiss message">
                  <X size={15} />
                </button>
              </div>
            )}
            {active === "Stores & import" ? (
              <section className="import-card">
                <div className="import-icon">
                  <Upload size={22} />
                </div>
                <div>
                  <h2>Bring your catalog into Orbit</h2>
                  <p>Start with the 100-product demo store or import a Shopify product CSV.</p>
                </div>
                <div className="import-actions">
                  <Button onClick={startDemo} disabled={busy}>
                    <Package size={16} /> Load Demo Store
                  </Button>
                  <label className="upload-button">
                    <Upload size={15} /> Import CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setBusy(true);
                        try {
                          const mapped = mapShopifyCsv(await file.text());
                          const imported: ProductRecord[] = mapped.products.map((row, index) => ({
                            id: `csv-${index + 1}`,
                            title: row.title ?? "",
                            description: row.description ?? "",
                            vendor: row.vendor ?? "",
                            productType: row.productType ?? "",
                            handle: row.handle ?? `product-${index + 1}`,
                            seoTitle: row.seoTitle ?? "",
                            seoDescription: row.seoDescription ?? "",
                            price: row.price ?? 0,
                            sku: row.sku ?? "",
                            tags: [],
                            images: [],
                            collections: [],
                            attributes: {},
                          }));
                          if (mapped.errors.length) {
                            const errorCsv = [
                              "Row,Error",
                              ...mapped.errors.map(
                                (item) => `${item.row},"${item.message.replaceAll('"', '""')}"`,
                              ),
                            ].join("\r\n");
                            const reportUrl = URL.createObjectURL(
                              new Blob([errorCsv], { type: "text/csv" }),
                            );
                            const report = document.createElement("a");
                            report.href = reportUrl;
                            report.download = "csv-import-errors.csv";
                            report.click();
                            URL.revokeObjectURL(reportUrl);
                          }
                          setProducts(imported);
                          setIssues([]);
                          setHasAudit(false);
                          setAuditHistory([]);
                          setScoreBefore(null);
                          setApproved([]);
                          setApprovedValues({});
                          setMessage(
                            `Imported ${imported.length} products from ${file.name}${mapped.errors.length ? ` Â· ${mapped.errors.length} invalid rows exported` : ""}`,
                          );
                          setActive("Overview");
                        } catch {
                          setMessage(
                            "Could not read the CSV file. Please use a Shopify product export.",
                          );
                        } finally {
                          setBusy(false);
                          event.target.value = "";
                        }
                      }}
                    />
                  </label>
                </div>
              </section>
            ) : null}
            {active !== "Stores & import" && (
              <>
                <section className="metric-grid" aria-label="Store performance metrics">
                  <article className="metric-card score-card">
                    <div className="metric-label">
                      CONTENT HEALTH SCORE <span className="help-dot">?</span>
                    </div>
                    <div className="score-content">
                      <div
                        className="score-ring"
                        style={{ "--score": `${score ?? 0}%` } as React.CSSProperties}
                      >
                        <div>
                          <strong>{score ?? "—"}</strong>
                          <span>/100</span>
                        </div>
                      </div>
                      <div className="score-context">
                        <div className="score-change">
                          <ArrowUpRight size={15} />
                          <strong>
                            {scoreBefore !== null && score !== null
                              ? `${score - scoreBefore} pts from baseline`
                              : "Baseline pending"}
                          </strong>
                        </div>
                        <span>
                          {scoreBefore !== null
                            ? "change from audit baseline"
                            : "Run an audit to set a baseline"}
                        </span>
                        <span className="score-date">
                          {auditHistory.length
                            ? `Last audited ${auditHistory[auditHistory.length - 1].day}`
                            : "No audit run yet"}
                        </span>
                      </div>
                    </div>
                    <div className="metric-foot">
                      <span className="status-dot" />{" "}
                      {score !== null
                        ? "Score from deterministic product checks"
                        : "Run an audit to set your baseline"}
                    </div>
                  </article>
                  <article className="metric-card">
                    <div className="metric-label">
                      PRODUCTS AUDITED <Package size={15} />
                    </div>
                    <div className="metric-value">
                      {products.length}
                      <span className="metric-suffix"> / 100</span>
                    </div>
                    <div className="metric-bottom">
                      <span className="tiny-bar">
                        <i style={{ width: `${products.length}%` }} />
                      </span>
                      <span>Free plan limit</span>
                    </div>
                  </article>
                  <article className="metric-card">
                    <div className="metric-label">
                      OPEN OPPORTUNITIES <TriangleAlert size={15} />
                    </div>
                    <div className="metric-value">
                      {issues.length}
                      <span className="metric-suffix"> across catalog</span>
                    </div>
                    <div className="metric-bottom">
                      <span>{issues.length ? "Findings in latest audit" : "No audit run yet"}</span>
                    </div>
                  </article>
                  <article className="metric-card">
                    <div className="metric-label">
                      APPROVED THIS MONTH <BadgeCheck size={15} />
                    </div>
                    <div className="metric-value">
                      {approved.length}
                      <span className="metric-suffix"> changes</span>
                    </div>
                    <div className="metric-bottom">
                      <span>
                        {approved.length ? "Approved in this demo session" : "No changes approved"}
                      </span>
                    </div>
                  </article>
                </section>
                <section className="charts-grid">
                  <article className="surface trend-card">
                    <div className="card-heading">
                      <div>
                        <h2>Store health over time</h2>
                        <p>Your content quality score across recent audits</p>
                      </div>
                      <button className="range-select">
                        Last 30 days <ChevronDown size={14} />
                      </button>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i /> Health score
                      </span>
                      <strong>
                        {score ?? "—"} <small>/ 100</small>
                      </strong>
                    </div>
                    <div className="area-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={auditHistory}
                          margin={{ top: 12, right: 4, left: -22, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.01} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            stroke="var(--border)"
                            strokeDasharray="3 5"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="day"
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={12}
                          />
                          <YAxis
                            domain={[35, 85]}
                            ticks={[40, 50, 60, 70, 80]}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 12,
                              color: "var(--foreground)",
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="score"
                            stroke="var(--chart-1)"
                            strokeWidth={2.5}
                            fill="url(#scoreFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className="surface severity-card">
                    <div className="card-heading">
                      <div>
                        <h2>Issues by severity</h2>
                        <p>Prioritize what matters most</p>
                      </div>
                      <button className="more-button" aria-label="More severity options">
                        Â·Â·Â·
                      </button>
                    </div>
                    <div className="severity-summary">
                      <strong>{issues.length}</strong>
                      <span>total issues</span>
                    </div>
                    <div className="bar-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={severity.map((item) => ({ name: item.name, total: item.total }))}
                          layout="vertical"
                          margin={{ top: 0, right: 15, left: -10, bottom: 0 }}
                          barCategoryGap={13}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="name"
                            type="category"
                            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={70}
                          />
                          <Tooltip
                            cursor={{ fill: "var(--muted)" }}
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              color: "var(--foreground)",
                            }}
                          />
                          <Bar dataKey="total" radius={[0, 5, 5, 0]} fill="var(--chart-2)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </section>
                <section className="bottom-grid">
                  <article className="surface issues-card">
                    <div className="card-heading">
                      <div>
                        <h2>Top opportunities</h2>
                        <p>The highest-impact ways to improve your store</p>
                      </div>
                      <button className="text-link" onClick={() => setActive("Audit results")}>
                        View all <ArrowRight size={14} />
                      </button>
                    </div>
                    {issues.length === 0 ? (
                      <div className="empty-opportunities">
                        <div className="empty-icon">
                          <WandSparkles size={19} />
                        </div>
                        <div>
                          <strong>Find your highest-impact fixes</strong>
                          <span>Run an audit to see real opportunities from your products.</span>
                        </div>
                        <Button size="sm" onClick={runAudit} disabled={busy}>
                          <Sparkles size={14} /> Audit products
                        </Button>
                      </div>
                    ) : (
                      <div className="issues-list">
                        {[...issues]
                          .sort((a, b) => b.impact - a.impact)
                          .slice(0, 5)
                          .map((item) => (
                            <button
                              key={item.id}
                              className="issue-row"
                              onClick={() => openIssue(item)}
                            >
                              <span className={`severity-indicator severity-${item.severity}`} />
                              <span className="issue-main">
                                <strong>
                                  {item.ruleId} Â· {item.field}
                                </strong>
                                <small>{item.productTitle}</small>
                              </span>
                              <span className={`severity-tag tag-${item.severity}`}>
                                {item.severity}
                              </span>
                              <span className="impact-score">{item.impact} impact</span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                      </div>
                    )}
                  </article>
                  <article className="surface category-card">
                    <div className="card-heading">
                      <div>
                        <h2>Issues by category</h2>
                        <p>Findings from the latest audit</p>
                      </div>
                      <button className="more-button" aria-label="More category options">
                        Â·Â·Â·
                      </button>
                    </div>
                    <div className="category-list">
                      {categories.map((category, index) => (
                        <div className="category-row" key={category.name}>
                          <div className="category-info">
                            <span className={`category-icon category-icon-${index}`}>
                              {index === 0 ? (
                                <Search size={15} />
                              ) : index === 1 ? (
                                <FileText size={15} />
                              ) : index === 2 ? (
                                <Package size={15} />
                              ) : (
                                <BarChart3 size={15} />
                              )}
                            </span>
                            <span>{category.name}</span>
                            <strong>
                              {issues.length ? category.value : "—"}
                              <small>{issues.length ? " issues" : ""}</small>
                            </strong>
                          </div>
                          <div className="category-track">
                            <i
                              className={category.color}
                              style={{
                                width: `${issues.length ? Math.max(4, (category.value / Math.max(...categories.map((item) => item.value))) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="category-footer" onClick={() => setActive("Audit results")}>
                      See category breakdown <ArrowRight size={14} />
                    </button>
                  </article>
                </section>
                <section className="surface review-preview">
                  <div className="card-heading">
                    <div>
                      <h2>Needs your review</h2>
                      <p>Suggested improvements waiting for approval</p>
                    </div>
                    <button className="text-link" onClick={() => setActive("Review queue")}>
                      Open review queue <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="review-empty">
                    {approved.length
                      ? `${approved.length} changes approved in this demo session. Simulate publishing to apply them.`
                      : "No suggestions are waiting for review. Open Audit results and select an issue to create or edit a suggestion."}
                  </div>
                </section>
              </>
            )}
            {(active === "Audit results" || active === "Review queue") && (
              <section className="surface full-issues">
                <div className="card-heading">
                  <div>
                    <h2>{active === "Review queue" ? "Review suggestions" : "Audit findings"}</h2>
                    <p>
                      {issues.length
                        ? `${filteredIssues.length} of ${issues.length} opportunities`
                        : "Run an audit to calculate findings from your product catalog."}
                    </p>
                  </div>
                  <div className="table-actions">
                    <label className="search-box">
                      <Search size={14} />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search products"
                      />
                    </label>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      aria-label="Filter by severity"
                    >
                      <option>All issues</option>
                      <option>Critical</option>
                      <option>High</option>
                      <option>Medium</option>
                      <option>Low</option>
                    </select>
                    <Button variant="outline" size="sm" onClick={runAudit} disabled={busy}>
                      <Filter size={14} /> Refresh
                    </Button>
                  </div>
                </div>
                {!issues.length ? (
                  <div className="table-empty">
                    No audit results yet. Start your first audit above.
                  </div>
                ) : (
                  <SuggestionTable
                    issues={filteredIssues}
                    approvedIds={approved}
                    onSelect={openIssue}
                  />
                )}
              </section>
            )}
            {active === "Audit history" &&
              (auditHistory.length ? (
                <section className="surface history-panel">
                  <div className="card-heading">
                    <div>
                      <h2>Recent audit snapshots</h2>
                      <p>Local demo-session history</p>
                    </div>
                  </div>
                  {auditHistory.map((entry, index) => (
                    <div className="history-entry" key={`${entry.day}-${index}`}>
                      <span>
                        <Clock3 size={14} /> Audit {index + 1}
                      </span>
                      <time>{entry.day}</time>
                      <strong>
                        {entry.score}
                        <small>/100</small>
                      </strong>
                    </div>
                  ))}
                </section>
              ) : (
                <section className="surface history-empty">
                  <div className="empty-icon">
                    <Clock3 size={19} />
                  </div>
                  <h2>Your audit history will appear here</h2>
                  <p>Run an audit to create a dated snapshot and compare future improvements.</p>
                  <Button onClick={runAudit}>
                    <Sparkles size={15} /> Run first audit
                  </Button>
                </section>
              ))}
            {active === "Settings" && (
              <section className="surface settings-panel">
                <div>
                  <h2>Workspace settings</h2>
                  <p>Connect your AI provider to enable product suggestions.</p>
                </div>
                <div className="settings-row">
                  <div className="settings-symbol">
                    <Bot size={18} />
                  </div>
                  <div>
                    <strong>Gemini AI</strong>
                    <span>AI explanations, copy drafts and attributes</span>
                  </div>
                  <span className="not-configured">Not configured</span>
                </div>
                <div className="settings-row">
                  <div className="settings-symbol">
                    <Store size={18} />
                  </div>
                  <div>
                    <strong>Shopify</strong>
                    <span>Import and publish directly to your store</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setMessage(
                        "Add Shopify app credentials in your .env file to enable the OAuth connection.",
                      )
                    }
                  >
                    Connect
                  </Button>
                </div>
              </section>
            )}
            <footer className="page-footer">
              <span>Â© 2026 Orbit Commerce Â· Built for better product pages</span>
              <span>
                <a href="#privacy">Privacy</a>
                <a href="#help">Help center</a>
                <span className="footer-status">
                  <Activity size={13} /> All systems operational
                </span>
              </span>
            </footer>
          </div>
        </main>
        {selected && (
          <div className="drawer-scrim" role="presentation" onClick={() => setSelected(null)}>
            <section
              className="detail-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="drawer-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-top">
                <span className={`severity-tag tag-${selected.severity}`}>
                  {selected.severity} priority
                </span>
                <button
                  className="icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="Close details"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="drawer-rule">
                {selected.ruleId} <span>Â·</span> {selected.category}
              </div>
              <h2 id="drawer-title">{selected.field} needs attention</h2>
              <p className="drawer-description">
                This product has a catalog issue that may impact customer confidence and search
                visibility.
              </p>
              <div className="detail-product">
                <div className="product-thumb">NS</div>
                <div>
                  <strong>{selected.productTitle}</strong>
                  <span>
                    {selected.productId} Â·{" "}
                    {products.find((p) => p.id === selected.productId)?.productType}
                  </span>
                </div>
              </div>
              <div className="detail-block">
                <span className="detail-label">WHAT WE FOUND</span>
                <p>{selected.evidence}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">CURRENT VALUE</span>
                <p className="current-copy">{selected.currentValue || "(empty)"}</p>
              </div>
              <div className="detail-block">
                <label className="detail-label" htmlFor="suggested-value">
                  SUGGESTED VALUE · EDIT BEFORE APPROVAL
                </label>
                <textarea
                  id="suggested-value"
                  className="suggested-input"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  rows={5}
                  disabled={selected.field === "handle"}
                />
                {selected.field === "handle" && (
                  <span className="detail-label">
                    Handle edits are advisory only and will not be published.
                  </span>
                )}
              </div>
              <div className="ai-notice">
                <Bot size={16} />
                <p>
                  <strong>AI-generated drafts require configuration</strong>
                  <span>
                    Use Generate suggestion with a workspace session and Gemini key. Without them,
                    deterministic audits continue to work.
                  </span>
                </p>
              </div>
              <div className="drawer-actions">
                <Button
                  variant="outline"
                  onClick={() => void generateSuggestion(selected)}
                  disabled={busy || selected.field === "handle"}
                >
                  <Sparkles size={15} /> Generate suggestion
                </Button>
                <Button
                  onClick={approveSelected}
                  disabled={
                    approved.includes(selected.id) ||
                    draftValue === selected.currentValue ||
                    selected.field === "handle"
                  }
                >
                  <Check size={15} /> {approved.includes(selected.id) ? "Approved" : "Approve"}
                </Button>
              </div>
              <Button variant="outline" className="w-full" onClick={exportApproved}>
                <ArrowDownToLine size={15} />
                {exported ? "Download CSV again" : "Export approved changes"}
              </Button>
            </section>
          </div>
        )}
        {active === "Overview" && approved.length > 0 && (
          <div className="floating-export">
            <span>
              <Check size={14} /> {approved.length} approved
            </span>
            <Button size="sm" variant="outline" onClick={exportApproved}>
              <ArrowDownToLine size={14} /> Export CSV
            </Button>
            <Button size="sm" onClick={simulatePublish}>
              <BadgeCheck size={14} /> Simulate publish
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
