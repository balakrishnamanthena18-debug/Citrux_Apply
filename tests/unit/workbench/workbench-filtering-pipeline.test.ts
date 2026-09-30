import { describe, it, expect } from "vitest";

interface WorkbenchApplication {
  id: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  status: "DRAFT" | "SUBMITTED" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  assignedTo: string | null;
  salary: number;
  appliedDate: string;
}

const sampleData: WorkbenchApplication[] = [
  { id: "app-1", candidateName: "Sarah Connor", jobTitle: "Security Engineer", companyName: "Cyberdyne", status: "APPROVED", priority: "URGENT", assignedTo: "emp-1", salary: 140000, appliedDate: "2026-03-01T10:00:00Z" },
  { id: "app-2", candidateName: "John Doe", jobTitle: "Frontend Developer", companyName: "Acme Corp", status: "SUBMITTED", priority: "MEDIUM", assignedTo: "emp-2", salary: 110000, appliedDate: "2026-03-10T14:00:00Z" },
  { id: "app-3", candidateName: "Jane Smith", jobTitle: "Product Designer", companyName: "Acme Corp", status: "AWAITING_APPROVAL", priority: "HIGH", assignedTo: null, salary: 125000, appliedDate: "2026-03-05T09:30:00Z" },
  { id: "app-4", candidateName: "Kyle Reese", jobTitle: "DevOps Engineer", companyName: "Skynet Systems", status: "APPROVED", priority: "LOW", assignedTo: "emp-1", salary: 135000, appliedDate: "2026-02-28T16:45:00Z" },
  { id: "app-5", candidateName: "Miles Dyson", jobTitle: "AI Researcher", companyName: "Cyberdyne", status: "DRAFT", priority: "MEDIUM", assignedTo: null, salary: 160000, appliedDate: "2026-03-15T11:20:00Z" },
  { id: "app-6", candidateName: "Thomas Anderson", jobTitle: "Software Architect", companyName: "Matrix Tech", status: "REJECTED", priority: "HIGH", assignedTo: "emp-3", salary: 155000, appliedDate: "2026-01-20T08:00:00Z" },
];

describe("Workbench Deterministic Pipeline — Filter, Search, Sort, Pagination", () => {
  function runPipeline<T>(
    items: T[],
    options: {
      tabPredicate?: (item: T) => boolean;
      filterPredicates?: Array<(item: T) => boolean>;
      searchQuery?: string;
      searchExtractor?: (item: T) => string;
      sortComparator?: (a: T, b: T) => number;
      page?: number;
      pageSize?: number;
    }
  ) {
    // 1. Tab stage
    let data = options.tabPredicate ? items.filter(options.tabPredicate) : items;

    // 2. Dropdown Filters stage
    if (options.filterPredicates && options.filterPredicates.length > 0) {
      for (const pred of options.filterPredicates) {
        data = data.filter(pred);
      }
    }

    // 3. Search stage
    if (options.searchQuery && options.searchQuery.trim() && options.searchExtractor) {
      const tokens = options.searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
      data = data.filter((item) => {
        const text = options.searchExtractor!(item).toLowerCase();
        return tokens.every((tok) => text.includes(tok));
      });
    }

    // Total filtered count before pagination
    const totalFiltered = data.length;

    // 4. Sort stage
    if (options.sortComparator) {
      data = [...data].sort(options.sortComparator);
    }

    // 5. Pagination stage
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    const paginated = data.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      totalFiltered,
      totalPages,
      page,
    };
  }

  it("filters accurately across active tab and multiple dropdown dimensions", () => {
    const result = runPipeline(sampleData, {
      tabPredicate: (item) => item.status === "APPROVED",
      filterPredicates: [
        (item) => item.companyName === "Cyberdyne",
        (item) => item.priority === "URGENT",
      ],
    });

    expect(result.totalFiltered).toBe(1);
    expect(result.items[0]?.candidateName).toBe("Sarah Connor");
  });

  it("performs multi-token search in conjunction with active filters", () => {
    const result = runPipeline(sampleData, {
      searchQuery: "cyberdyne engineer",
      searchExtractor: (item) => `${item.candidateName} ${item.jobTitle} ${item.companyName}`,
    });

    expect(result.totalFiltered).toBe(1);
    expect(result.items[0]?.candidateName).toBe("Sarah Connor");
  });

  it("sorts deterministically by dates and numerical fields", () => {
    const bySalaryDesc = runPipeline(sampleData, {
      sortComparator: (a, b) => b.salary - a.salary,
    });

    expect(bySalaryDesc.items[0]?.candidateName).toBe("Miles Dyson"); // 160000
    expect(bySalaryDesc.items[5]?.candidateName).toBe("John Doe"); // 110000

    const byDateAsc = runPipeline(sampleData, {
      sortComparator: (a, b) => new Date(a.appliedDate).getTime() - new Date(b.appliedDate).getTime(),
    });

    expect(byDateAsc.items[0]?.candidateName).toBe("Thomas Anderson"); // Jan 20
  });

  it("slices array accurately during pagination transitions", () => {
    const page1 = runPipeline(sampleData, {
      page: 1,
      pageSize: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalPages).toBe(3);
    expect(page1.items[0]?.id).toBe("app-1");

    const page2 = runPipeline(sampleData, {
      page: 2,
      pageSize: 2,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0]?.id).toBe("app-3");

    const page3 = runPipeline(sampleData, {
      page: 3,
      pageSize: 2,
    });
    expect(page3.items).toHaveLength(2);
    expect(page3.items[0]?.id).toBe("app-5");
  });
});
