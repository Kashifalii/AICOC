"use client";

import { useEffect, useMemo, useState } from "react";
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
import { demoProducts } from "@/data/demo-products";
import type { Product, AuditIssue } from "@/lib/audit/types";
import { auditProducts } from "@/lib/audit/rules";
import { scoreStore } from "@/lib/audit/scoring";
import { mapShopifyCsv } from "@/lib/utils/csv";
import { Button } from "@/components/ui/button";
import { SuggestionTable } from "@/features/review/suggestion-table";

type ProductRecord = Product;
type StoreRecord = {
  id: string;
  name: string;
  type: "demo" | "shopify" | "csv";
  domain: string | null;
};
type WorkspaceRole = "Owner" | "Editor" | "Reviewer" | "Viewer";
type IntegrationStatus = {
  supabaseConfigured: boolean;
  persistedJobsSchemaReady: boolean;
  geminiConfigured: boolean;
  shopifyConfigured: boolean;
  shopifyEncryptionConfigured: boolean;
  shopifyScopes: string[];
  shopifyWriteScopeConfigured: boolean;
};
const originalProducts = demoProducts;
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
  const [suggestionIds, setSuggestionIds] = useState<Record<string, string>>({});
  const [exported, setExported] = useState(false);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [storeId, setStoreId] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    supabaseConfigured: false,
    persistedJobsSchemaReady: false,
    geminiConfigured: false,
    shopifyConfigured: false,
    shopifyEncryptionConfigured: false,
    shopifyScopes: [],
    shopifyWriteScopeConfigured: false,
  });
  const activeStore = stores.find((store) => store.id === storeId);

  useEffect(() => {
    let cancelled = false;
    const loadSavedWorkspace = async () => {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.get("shopify") === "connected")
          setMessage("Shopify connected. Select the store below and import its catalog.");
        const statusResponse = await fetch("/api/integrations/status");
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as IntegrationStatus;
          if (!cancelled) setIntegrations(status);
        }
        const storesResponse = await fetch("/api/stores");
        if (storesResponse.status === 401) return;
        const storePayload = (await storesResponse.json()) as {
          stores?: StoreRecord[];
          role?: WorkspaceRole;
          error?: { message?: string };
        };
        if (!storesResponse.ok)
          throw new Error(storePayload.error?.message ?? "Could not load saved workspace data.");
        if (cancelled) return;
        const savedStores = storePayload.stores ?? [];
        setStores(savedStores);
        setAuthenticated(true);
        setWorkspaceRole(storePayload.role ?? null);
        const selectedStore =
          savedStores.find((store) => store.type === "shopify") ??
          savedStores.find((store) => store.type === "demo") ??
          savedStores[0];
        if (!selectedStore) return;
        setStoreId(selectedStore.id);
        const [productsResponse, auditsResponse, suggestionsResponse] = await Promise.all([
          fetch(`/api/stores/${selectedStore.id}/products`),
          fetch(`/api/audits?storeId=${selectedStore.id}`),
          fetch(`/api/suggestions?storeId=${selectedStore.id}`),
        ]);
        const productsPayload = (await productsResponse.json()) as {
          products?: ProductRecord[];
          error?: { message?: string };
        };
        if (productsResponse.ok && productsPayload.products) {
          if (!cancelled) setProducts(productsPayload.products);
        } else if (!productsResponse.ok && productsResponse.status !== 404) {
          throw new Error(productsPayload.error?.message ?? "Could not restore saved products.");
        }
        const auditsPayload = (await auditsResponse.json()) as {
          audits?: { id: string; created_at: string; score_after: number | null }[];
          issues?: AuditIssue[];
          score?: number;
          error?: { message?: string };
        };
        if (auditsResponse.ok && auditsPayload.audits?.length) {
          if (!cancelled) {
            setIssues(auditsPayload.issues ?? []);
            setHasAudit(true);
            setScoreBefore(auditsPayload.score ?? null);
            setAuditHistory(
              [...auditsPayload.audits].reverse().map((audit) => ({
                day: new Date(audit.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                }),
                score: Number(audit.score_after ?? 0),
              })),
            );
          }
        } else if (!auditsResponse.ok) {
          throw new Error(auditsPayload.error?.message ?? "Could not restore audit history.");
        }
        const suggestionsPayload = (await suggestionsResponse.json()) as {
          suggestions?: {
            id: string;
            issue_id: string | null;
            suggested_value: string;
            status: string;
          }[];
          error?: { message?: string };
        };
        if (!suggestionsResponse.ok)
          throw new Error(
            suggestionsPayload.error?.message ?? "Could not restore saved suggestions.",
          );
        if (!cancelled) {
          const currentIssueIds = new Set((auditsPayload.issues ?? []).map((issue) => issue.id));
          const linkedSuggestions = (suggestionsPayload.suggestions ?? []).filter(
            (suggestion) => suggestion.issue_id && currentIssueIds.has(suggestion.issue_id),
          );
          setSuggestionIds(
            Object.fromEntries(
              linkedSuggestions.map((suggestion) => [suggestion.issue_id!, suggestion.id]),
            ),
          );
          setApproved(
            linkedSuggestions
              .filter((suggestion) => suggestion.status === "approved")
              .map((suggestion) => suggestion.issue_id!),
          );
          setApprovedValues(
            Object.fromEntries(
              linkedSuggestions.map((suggestion) => [
                suggestion.issue_id!,
                suggestion.suggested_value,
              ]),
            ),
          );
        }
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error ? error.message : "Could not restore saved workspace data.",
          );
      }
    };
    void loadSavedWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);
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
  const runAudit = async () => {
    setBusy(true);
    setMessage("");
    try {
      const found = auditProducts(products);
      const nextScore = scoreStore(products, found);
      const previousScore = score ?? nextScore;
      let persistedIssues = found;
      let persistenceMessage = "";
      if (storeId && products.every((product) => isUuid(product.id))) {
        const response = await fetch("/api/audits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storeId,
            score: nextScore,
            issues: found.map((issue) => ({
              id: issue.id,
              productId: issue.productId,
              ruleId: issue.ruleId,
              category: issue.category,
              severity: issue.severity,
              field: issue.field,
              evidence: issue.evidence,
              impact: issue.impact,
              currentValue: issue.currentValue,
            })),
          }),
        });
        const result = (await response.json()) as {
          issueIds?: Record<string, string>;
          error?: { message?: string };
        };
        if (response.ok && result.issueIds) {
          persistedIssues = found.map((issue) => ({
            ...issue,
            id: result.issueIds![issue.id] ?? issue.id,
          }));
        } else {
          persistenceMessage = ` Saved audit history was not updated: ${result.error?.message ?? "database request failed"}.`;
        }
      }
      setIssues(persistedIssues);
      setHasAudit(true);
      setScoreBefore(previousScore);
      setAuditHistory((current) => [
        ...current,
        {
          day: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          score: nextScore,
        },
      ]);
      setActive("Overview");
      setMessage(
        `Audit complete · ${found.length} opportunities found across ${products.length} products.${persistenceMessage}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audit could not be completed.");
    } finally {
      setBusy(false);
    }
  };
  const startDemo = async () => {
    setBusy(true);
    setMessage("");
    try {
      const savedImportKey = sessionStorage.getItem("aicoc-demo-import-key") ?? crypto.randomUUID();
      sessionStorage.setItem("aicoc-demo-import-key", savedImportKey);
      const response = await fetch("/api/demo/seed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: savedImportKey }),
      });
      const seedResult = (await response.json()) as {
        storeId?: string;
        job?: { id: string; status: string; progress?: { completed?: number; failed?: number } };
        error?: { message?: string };
      };
      if (!response.ok || !seedResult.job)
        throw new Error(seedResult.error?.message ?? "Could not start saved Demo Store import");
      if (!seedResult.storeId)
        throw new Error("The saved Demo Store response did not include a store id.");
      setStoreId(seedResult.storeId);
      let job = seedResult.job;
      let attempts = 0;
      while (job.status !== "completed" && attempts < 20) {
        const batchResponse = await fetch(`/api/jobs/${job.id}/run-batch`, { method: "POST" });
        const batchResult = (await batchResponse.json()) as {
          job?: { id: string; status: string; progress?: { completed?: number; failed?: number } };
          busy?: boolean;
          error?: { message?: string };
        };
        if (!batchResponse.ok && batchResponse.status !== 202)
          throw new Error(batchResult.error?.message ?? "Demo Store import batch failed");
        if (batchResult.job) job = batchResult.job;
        attempts += 1;
        setMessage(`Saving Demo Store · ${job.progress?.completed ?? 0} / 100 products`);
        if (batchResult.busy) await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      if (job.status !== "completed")
        throw new Error(
          "Demo Store import is still running. Select Load Demo Store again to resume it.",
        );
      sessionStorage.removeItem("aicoc-demo-import-key");
      const productsResponse = await fetch("/api/demo/seed", { method: "GET" });
      const result = (await productsResponse.json()) as {
        products?: ProductRecord[];
        error?: { message?: string };
      };
      if (!productsResponse.ok || !result.products)
        throw new Error(result.error?.message ?? "Could not read saved Demo Store products");
      setProducts(result.products);
      setStores((current) => {
        const demoStore = {
          id: seedResult.storeId!,
          name: "Northstar Goods",
          type: "demo" as const,
          domain: null,
        };
        return [...current.filter((store) => store.id !== demoStore.id), demoStore];
      });
      setIssues([]);
      setHasAudit(false);
      setAuditHistory([]);
      setScoreBefore(null);
      setApproved([]);
      setApprovedValues({});
      setMessage(
        `Demo Store loaded · ${result.products.length} products ready to audit${job.progress?.failed ? ` · ${job.progress.failed} item failures` : ""}`,
      );
    } catch (error) {
      setMessage(
        `${error instanceof Error ? error.message : "Saved import unavailable"}. Using the local demo fixture.`,
      );
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
          productId: product.id,
          ...(isUuid(issue.id) ? { issueId: issue.id } : {}),
          field: issue.field,
          currentValue: issue.currentValue,
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          productType: product.productType,
        }),
      });
      const payload = (await response.json()) as {
        error?: { message: string };
        suggestion?: { id: string; status: string };
        title?: string;
        meta_description?: string;
        description_html?: string;
      };
      if (response.ok) {
        if (payload.suggestion?.id)
          setSuggestionIds((current) => ({ ...current, [issue.id]: payload.suggestion!.id }));
        const value =
          issue.field === "title" || issue.field === "seoTitle"
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI suggestion request failed.");
    } finally {
      setBusy(false);
    }
  };
  const openIssue = (issue: AuditIssue) => {
    setSelected(issue);
    setDraftValue(approvedValues[issue.id] ?? issue.currentValue);
  };
  const approveSelected = async () => {
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
    if (isUuid(selected.productId)) {
      try {
        let suggestionId = suggestionIds[selected.id];
        if (!suggestionId) {
          const createResponse = await fetch("/api/suggestions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              productId: selected.productId,
              ...(isUuid(selected.id) ? { issueId: selected.id } : {}),
              field: selected.field,
              currentValue: selected.currentValue,
              suggestedValue: draftValue,
            }),
          });
          const created = (await createResponse.json()) as {
            suggestion?: { id: string };
            error?: { message?: string };
          };
          if (!createResponse.ok || !created.suggestion)
            throw new Error(created.error?.message ?? "Could not save this draft");
          suggestionId = created.suggestion.id;
          setSuggestionIds((current) => ({ ...current, [selected.id]: suggestionId! }));
        }
        const savedDraft = await fetch(`/api/suggestions/${suggestionId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ suggestedValue: draftValue }),
        });
        const savedDraftResult = (await savedDraft.json()) as { error?: { message?: string } };
        if (!savedDraft.ok)
          throw new Error(savedDraftResult.error?.message ?? "Could not save the edited draft");
        const transition = async (status: "pending_review" | "approved") => {
          const response = await fetch(`/api/suggestions/${suggestionId}/transition`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status }),
          });
          return { response, payload: (await response.json()) as { error?: { message?: string } } };
        };
        const submitted = await transition("pending_review");
        if (!submitted.response.ok && submitted.response.status !== 409)
          throw new Error(submitted.payload.error?.message ?? "Could not submit for review");
        const approvedResult = await transition("approved");
        if (!approvedResult.response.ok) {
          setMessage(
            approvedResult.response.status === 403
              ? "Suggestion submitted for human review. A Reviewer or Owner must approve it."
              : (approvedResult.payload.error?.message ?? "Could not approve this suggestion"),
          );
          return;
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save the suggestion");
        return;
      }
    }
    setApproved((current) => (current.includes(selected.id) ? current : [...current, selected.id]));
    setApprovedValues((current) => ({ ...current, [selected.id]: draftValue }));
    setMessage(
      storeId
        ? "Change saved and approved in your workspace."
        : "Change approved for this demo session.",
    );
    setSelected(null);
  };
  const simulatePublish = async () => {
    if (!approved.length) {
      setMessage("Approve a change before simulated publishing.");
      return;
    }
    const persistedIds = approved.map((issueId) => suggestionIds[issueId]);
    if (storeId && !persistedIds.every((id): id is string => Boolean(id))) {
      setMessage(
        "Some approved changes are not saved yet. Reopen and approve them before publishing.",
      );
      return;
    }
    if (persistedIds.every((id): id is string => Boolean(id))) {
      setBusy(true);
      try {
        for (let offset = 0; offset < persistedIds.length; offset += 10) {
          const response = await fetch("/api/publish/simulated", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ suggestionIds: persistedIds.slice(offset, offset + 10) }),
          });
          const result = (await response.json()) as { error?: { message?: string } };
          if (!response.ok) throw new Error(result.error?.message ?? "Simulated publish failed");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Simulated publish failed");
        setBusy(false);
        return;
      }
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
    let nextIssues = auditProducts(updated);
    const after = scoreStore(updated, nextIssues);
    if (storeId && updated.every((product) => isUuid(product.id))) {
      try {
        const auditResponse = await fetch("/api/audits", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storeId,
            score: after,
            issues: nextIssues.map((issue) => ({
              id: issue.id,
              productId: issue.productId,
              ruleId: issue.ruleId,
              category: issue.category,
              severity: issue.severity,
              field: issue.field,
              evidence: issue.evidence,
              currentValue: issue.currentValue,
              impact: issue.impact,
            })),
          }),
        });
        const auditResult = (await auditResponse.json()) as {
          issueIds?: Record<string, string>;
          error?: { message?: string };
        };
        if (!auditResponse.ok || !auditResult.issueIds)
          throw new Error(auditResult.error?.message ?? "Updated audit could not be saved.");
        nextIssues = nextIssues.map((issue) => ({
          ...issue,
          id: auditResult.issueIds![issue.id] ?? issue.id,
        }));
      } catch (error) {
        setMessage(
          `Products were updated, but the follow-up audit was not saved: ${error instanceof Error ? error.message : "database request failed"}`,
        );
      }
    }
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
    setSuggestionIds({});
    setSelected(null);
    setMessage(
      `${storeId ? "Saved changes applied" : "Demo changes applied"} · Content Health Score ${before} → ${after} (${after - before >= 0 ? "+" : ""}${after - before})`,
    );
    setBusy(false);
  };
  const connectShopify = () => {
    const domain = shopDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
      setMessage("Enter your Shopify .myshopify.com domain, for example northstar.myshopify.com.");
      return;
    }
    if (!authenticated) {
      const next = `/api/stores/shopify/install?shop=${encodeURIComponent(domain)}`;
      window.location.assign(`/sign-in?next=${encodeURIComponent(next)}`);
      return;
    }
    if (workspaceRole !== "Owner") {
      setMessage("Only a workspace Owner can connect Shopify.");
      return;
    }
    if (!integrations.shopifyConfigured) {
      setMessage("Add SHOPIFY_API_KEY and SHOPIFY_API_SECRET to .env.local to connect a store.");
      return;
    }
    if (!integrations.shopifyEncryptionConfigured) {
      setMessage("Add a valid base64-encoded 32-byte ENCRYPTION_KEY before connecting Shopify.");
      return;
    }
    window.location.assign(`/api/stores/shopify/install?shop=${encodeURIComponent(domain)}`);
  };
  const importShopifyStore = async () => {
    if (!activeStore || activeStore.type !== "shopify") return;
    setBusy(true);
    setMessage("Starting Shopify product import…");
    try {
      const response = await fetch(`/api/stores/${activeStore.id}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const payload = (await response.json()) as {
        job?: { id: string; status: string; progress?: { completed?: number; total?: number } };
        error?: { message?: string };
      };
      if (!response.ok || !payload.job)
        throw new Error(payload.error?.message ?? "Could not start Shopify import.");
      let job = payload.job;
      let batches = 0;
      while (!["completed", "failed"].includes(job.status) && batches < 200) {
        const batchResponse = await fetch(`/api/jobs/${job.id}/run-batch`, { method: "POST" });
        const batchPayload = (await batchResponse.json()) as {
          job?: typeof job;
          busy?: boolean;
          error?: { message?: string };
        };
        if (!batchResponse.ok && batchResponse.status !== 202)
          throw new Error(batchPayload.error?.message ?? "Shopify import batch failed.");
        if (batchPayload.job) job = batchPayload.job;
        setMessage(
          `Importing ${activeStore.name} · ${job.progress?.completed ?? 0} products saved`,
        );
        if (batchPayload.busy) await new Promise((resolve) => window.setTimeout(resolve, 800));
        batches += 1;
      }
      if (job.status !== "completed")
        throw new Error("Shopify import did not finish. Retry the import to resume the job.");
      const productsResponse = await fetch(`/api/stores/${activeStore.id}/products`);
      const productsPayload = (await productsResponse.json()) as {
        products?: ProductRecord[];
        error?: { message?: string };
      };
      if (!productsResponse.ok || !productsPayload.products)
        throw new Error(
          productsPayload.error?.message ?? "Could not load imported Shopify products.",
        );
      setProducts(productsPayload.products);
      setIssues([]);
      setHasAudit(false);
      setApproved([]);
      setApprovedValues({});
      setSuggestionIds({});
      setMessage(`Imported ${productsPayload.products.length} products from ${activeStore.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopify import failed.");
    } finally {
      setBusy(false);
    }
  };
  const publishShopify = async () => {
    if (!activeStore || activeStore.type !== "shopify" || approved.length === 0) {
      setMessage("Connect a Shopify store and approve at least one saved suggestion first.");
      return;
    }
    const ids = approved.map((issueId) => suggestionIds[issueId]);
    if (!ids.every((id): id is string => Boolean(id))) {
      setMessage("All selected changes must be saved as approved suggestions before publishing.");
      return;
    }
    setBusy(true);
    try {
      for (let offset = 0; offset < ids.length; offset += 10) {
        const response = await fetch("/api/publish/shopify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storeId: activeStore.id,
            suggestionIds: ids.slice(offset, offset + 10),
          }),
        });
        const result = (await response.json()) as { error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "Shopify publishing failed.");
      }
      const productsResponse = await fetch(`/api/stores/${activeStore.id}/products`);
      const productsPayload = (await productsResponse.json()) as {
        products?: ProductRecord[];
        error?: { message?: string };
      };
      if (!productsResponse.ok || !productsPayload.products)
        throw new Error(
          productsPayload.error?.message ??
            "Shopify was updated, but refreshed products could not be loaded.",
        );
      setProducts(productsPayload.products);
      setApproved([]);
      setApprovedValues({});
      setSuggestionIds({});
      setIssues([]);
      setHasAudit(false);
      setMessage(
        "Approved changes were published to Shopify. Run an audit to verify the updated catalog.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shopify publishing failed.");
    } finally {
      setBusy(false);
    }
  };
  const exportApproved = async () => {
    const approvedIssues = issues.filter((item) => approved.includes(item.id));
    if (!approvedIssues.length) {
      setMessage("Approve at least one suggestion before exporting.");
      return;
    }
    const persistedIds = approved.map((issueId) => suggestionIds[issueId]);
    if (persistedIds.every((id): id is string => Boolean(id))) {
      try {
        const response = await fetch("/api/publish/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ suggestionIds: persistedIds }),
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: { message?: string } };
          throw new Error(result.error?.message ?? "Could not export approved changes");
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "approved-product-changes.csv";
        link.click();
        URL.revokeObjectURL(url);
        setExported(true);
        setMessage(`Exported ${approved.length} approved changes to CSV`);
        return;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not export approved changes");
        return;
      }
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
              <strong>{activeStore?.name ?? "Demo workspace"}</strong>
              <span>{authenticated ? "Supabase workspace" : "Public demo"}</span>
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
            <span>{activeStore?.name ?? "Northstar Goods"}</span>
            <span className="demo-pill">{activeStore?.type.toUpperCase() ?? "DEMO"}</span>
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
              <span className="usage-caption">Free plan · resets Oct 1</span>
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
              <span>{activeStore?.name ?? "Northstar Goods"}</span>
              <ChevronRight size={14} />
              <strong>{active}</strong>
            </div>
            <div className="topbar-actions">
              <span className="connection-status">
                <span />
                {authenticated
                  ? activeStore?.type === "shopify"
                    ? "Shopify connected"
                    : "Supabase connected"
                  : "Public demo"}
              </span>
              {!authenticated && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.assign("/sign-in")}
                >
                  Sign in
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setActive("Stores & import")}>
                <Plus size={15} /> Import products
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
                    ? "Here’s what’s happening with your product catalog."
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
                  {busy ? "Working…" : "Run audit"}
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
              <>
                <section className="import-card">
                  <div className="import-icon">
                    <Upload size={22} />
                  </div>
                  <div>
                    <h2>Bring your catalog into Orbit</h2>
                    <p>Load the demo catalog, upload a Shopify CSV, or connect a Shopify store.</p>
                  </div>
                  <div className="import-actions">
                    <Button
                      onClick={startDemo}
                      disabled={busy || (authenticated && !integrations.persistedJobsSchemaReady)}
                    >
                      <Package size={16} /> Load Demo Store
                    </Button>
                    <label className="upload-button">
                      <Upload size={15} /> Import CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        disabled={busy || (authenticated && !integrations.persistedJobsSchemaReady)}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setBusy(true);
                          try {
                            const csvText = await file.text();
                            const mapped = mapShopifyCsv(csvText);
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
                            let savedStore: StoreRecord | undefined;
                            let importedProducts = imported;
                            if (authenticated) {
                              const saveResponse = await fetch("/api/stores/csv", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ fileName: file.name, csv: csvText }),
                              });
                              const savePayload = (await saveResponse.json()) as {
                                store?: StoreRecord;
                                error?: { message?: string };
                              };
                              if (!saveResponse.ok || !savePayload.store)
                                throw new Error(
                                  savePayload.error?.message ?? "Could not save CSV products.",
                                );
                              savedStore = savePayload.store;
                              const productResponse = await fetch(
                                `/api/stores/${savedStore.id}/products`,
                              );
                              const productPayload = (await productResponse.json()) as {
                                products?: ProductRecord[];
                                error?: { message?: string };
                              };
                              if (!productResponse.ok || !productPayload.products)
                                throw new Error(
                                  productPayload.error?.message ??
                                    "CSV was saved but products could not be reloaded.",
                                );
                              importedProducts = productPayload.products;
                              setStoreId(savedStore.id);
                              setStores((current) => [...current, savedStore!]);
                            }
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
                            setStoreId("");
                            setProducts(importedProducts);
                            setIssues([]);
                            setHasAudit(false);
                            setAuditHistory([]);
                            setScoreBefore(null);
                            setApproved([]);
                            setApprovedValues({});
                            setSuggestionIds({});
                            setMessage(
                              `Imported ${importedProducts.length} products from ${file.name}${mapped.errors.length ? ` · ${mapped.errors.length} invalid rows exported` : ""}${savedStore ? " and saved to your workspace." : " for this browser session; sign in to save imports."}`,
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
                <section className="surface settings-panel">
                  <div>
                    <h2>Connected catalog</h2>
                    <p>Select a saved store to restore its products and audit history.</p>
                  </div>
                  {stores.length ? (
                    <div className="settings-row">
                      <Store size={18} />
                      <select
                        aria-label="Select connected store"
                        value={storeId}
                        onChange={async (event) => {
                          const nextStoreId = event.target.value;
                          const nextStore = stores.find((store) => store.id === nextStoreId);
                          if (!nextStore) return;
                          setStoreId(nextStoreId);
                          setBusy(true);
                          try {
                            const [productsResponse, auditsResponse, suggestionsResponse] =
                              await Promise.all([
                                fetch(`/api/stores/${nextStoreId}/products`),
                                fetch(`/api/audits?storeId=${nextStoreId}`),
                                fetch(`/api/suggestions?storeId=${nextStoreId}`),
                              ]);
                            const productData = (await productsResponse.json()) as {
                              products?: ProductRecord[];
                              error?: { message?: string };
                            };
                            if (!productsResponse.ok)
                              throw new Error(
                                productData.error?.message ?? "Could not load this store.",
                              );
                            const auditsData = (await auditsResponse.json()) as {
                              audits?: { created_at: string; score_after: number | null }[];
                              issues?: AuditIssue[];
                              error?: { message?: string };
                            };
                            const suggestionsData = (await suggestionsResponse.json()) as {
                              suggestions?: {
                                id: string;
                                issue_id: string | null;
                                suggested_value: string;
                                status: string;
                              }[];
                              error?: { message?: string };
                            };
                            if (!auditsResponse.ok)
                              throw new Error(
                                auditsData.error?.message ?? "Could not load audit history.",
                              );
                            if (!suggestionsResponse.ok)
                              throw new Error(
                                suggestionsData.error?.message ??
                                  "Could not load saved suggestions.",
                              );
                            setProducts(productData.products ?? []);
                            setIssues(auditsData.issues ?? []);
                            setHasAudit(Boolean(auditsData.audits?.length));
                            setScoreBefore(
                              Number(auditsData.audits?.[0]?.score_after ?? 0) || null,
                            );
                            setAuditHistory(
                              [...(auditsData.audits ?? [])].reverse().map((audit) => ({
                                day: new Date(audit.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                }),
                                score: Number(audit.score_after ?? 0),
                              })),
                            );
                            const issueIds = new Set(
                              (auditsData.issues ?? []).map((issue) => issue.id),
                            );
                            const linkedSuggestions = (suggestionsData.suggestions ?? []).filter(
                              (suggestion) =>
                                suggestion.issue_id && issueIds.has(suggestion.issue_id),
                            );
                            setSuggestionIds(
                              Object.fromEntries(
                                linkedSuggestions.map((suggestion) => [
                                  suggestion.issue_id!,
                                  suggestion.id,
                                ]),
                              ),
                            );
                            setApproved(
                              linkedSuggestions
                                .filter((suggestion) => suggestion.status === "approved")
                                .map((suggestion) => suggestion.issue_id!),
                            );
                            setApprovedValues(
                              Object.fromEntries(
                                linkedSuggestions.map((suggestion) => [
                                  suggestion.issue_id!,
                                  suggestion.suggested_value,
                                ]),
                              ),
                            );
                            setMessage(`${nextStore.name} is selected.`);
                          } catch (error) {
                            setMessage(
                              error instanceof Error ? error.message : "Could not load this store.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name} · {store.type}
                          </option>
                        ))}
                      </select>
                      {activeStore?.type === "shopify" && (
                        <Button
                          onClick={importShopifyStore}
                          disabled={busy || !integrations.persistedJobsSchemaReady}
                        >
                          <ArrowDownToLine size={15} /> Import products
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p>
                      {authenticated
                        ? "No saved stores yet."
                        : "Sign in to use saved Supabase data and connect Shopify."}
                    </p>
                  )}
                  {integrations.supabaseConfigured && !integrations.persistedJobsSchemaReady && (
                    <p>
                      Supabase is reachable, but its persisted-job schema is not ready. Apply
                      migrations 202609300002 through 202609300005 in order to enable saved store
                      imports and publishing.
                    </p>
                  )}
                </section>
                <section className="surface settings-panel">
                  <div>
                    <h2>Connect Shopify</h2>
                    <p>
                      Authorize access to import your product catalog and publish approved edits.
                    </p>
                  </div>
                  <div className="settings-row">
                    <label className="auth-label" htmlFor="shop-domain">
                      Store domain
                    </label>
                    <input
                      id="shop-domain"
                      type="text"
                      autoComplete="url"
                      placeholder="your-store.myshopify.com"
                      value={shopDomain}
                      onChange={(event) => setShopDomain(event.target.value)}
                    />
                    <Button
                      onClick={connectShopify}
                      disabled={
                        !integrations.shopifyConfigured ||
                        !integrations.shopifyEncryptionConfigured
                      }
                    >
                      <Store size={15} /> Authorize Shopify
                    </Button>
                  </div>
                  {(!integrations.shopifyConfigured ||
                    !integrations.shopifyEncryptionConfigured) && (
                    <p>
                      {!integrations.shopifyConfigured
                        ? "Shopify app credentials are missing."
                        : !integrations.shopifyEncryptionConfigured
                          ? "Token encryption key is missing or invalid."
                          : "OAuth requests read_products and write_products; confirm both scopes are enabled in your Shopify app."}
                    </p>
                  )}
                  {integrations.shopifyConfigured &&
                    integrations.shopifyEncryptionConfigured &&
                    !integrations.shopifyWriteScopeConfigured && (
                      <p>
                        OAuth will request write_products automatically. Confirm that Shopify has
                        enabled the read_products and write_products scopes for this app.
                      </p>
                    )}
                </section>
              </>
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
                      <span className="range-select" aria-label="Showing recent audit history">
                        Recent audits
                      </span>
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
                      <button
                        className="more-button"
                        aria-label="Review issues by severity"
                        onClick={() => setActive("Review queue")}
                      >
                        …
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
                                  {item.ruleId} · {item.field}
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
                      <button
                        className="more-button"
                        aria-label="Review issues by category"
                        onClick={() => setActive("Review queue")}
                      >
                        …
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
                  <span className="not-configured">
                    {integrations.geminiConfigured ? "Configured" : "GEMINI_API_KEY missing"}
                  </span>
                </div>
                <div className="settings-row">
                  <div className="settings-symbol">
                    <Store size={18} />
                  </div>
                  <div>
                    <strong>Shopify</strong>
                    <span>Import and publish directly to your store</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActive("Stores & import")}>
                    {activeStore?.type === "shopify" ? "Manage" : "Connect"}
                  </Button>
                </div>
                <p>
                  Supabase {integrations.supabaseConfigured ? "configured" : "not configured"} ·
                  Shopify app {integrations.shopifyConfigured ? "configured" : "missing"} · Token
                  encryption {integrations.shopifyEncryptionConfigured ? "ready" : "missing"}
                </p>
              </section>
            )}
            <footer className="page-footer">
              <span>© 2026 Orbit Commerce · Built for better product pages</span>
              <span>
                <span>Privacy</span>
                <span>Help center</span>
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
                {selected.ruleId} <span>·</span> {selected.category}
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
                    {selected.productId} ·{" "}
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
                  <strong>
                    {integrations.geminiConfigured
                      ? "Gemini suggestions are enabled"
                      : "Gemini API key is not configured"}
                  </strong>
                  <span>
                    {integrations.geminiConfigured
                      ? "Generate a fact-checked draft for this product. The generated suggestion is saved in your workspace."
                      : "Add GEMINI_API_KEY to .env.local to enable generated drafts. Deterministic audits remain available."}
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
            {activeStore?.type === "shopify" && (
              <Button
                size="sm"
                onClick={publishShopify}
                disabled={
                  busy || !integrations.shopifyEncryptionConfigured || workspaceRole !== "Owner"
                }
              >
                <Store size={14} /> Publish to Shopify
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
