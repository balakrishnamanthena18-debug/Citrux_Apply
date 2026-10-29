"use client";

import React, { useState, useEffect, useCallback, useTransition, useId, useRef } from "react";
import {
  Search,
  Filter,
  SlidersHorizontal,
  Bookmark,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Building,
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  Sparkles,
  RotateCcw,
  PlusCircle,
  X,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  Trash2,
  Globe,
  Check,
  Loader2,
} from "lucide-react";
import {
  searchDiscoveredJobsAction,
  saveDiscoveredJobAction,
  unsaveDiscoveredJobAction,
  promoteDiscoveredJobToCatalogAction,
} from "@/lib/job-discovery/actions";
import { searchDeskCandidatesAction } from "@/lib/application/actions";
import type {
  DiscoveredJobSearchResult,
  JobSearchFilters,
  JobVerificationStatus,
  JobWorkArrangement,
  JobEmploymentType,
  LiveProviderExecutionStatus,
  SearchTraceData,
} from "@/lib/job-discovery/types";
import { LocationAwareAutocomplete } from "./LocationAwareAutocomplete";
import {
  JobSearchProgressBar,
  JobSearchStatusBanner,
  JobSearchSkeletonGrid,
  JobSearchErrorState,
  JobSearchPartialFailureAlert,
  JobSearchEmptyState,
  type SearchLifecyclePhase,
} from "./JobSearchFeedback";

const INDUSTRIES = [
  { value: "technology", label: "Technology & Software" },
  { value: "it_support", label: "IT Support & Services" },
  { value: "cybersecurity", label: "Cybersecurity & InfoSec" },
  { value: "cloud_enterprise", label: "Cloud, DevOps & ERP" },
  { value: "data_ai", label: "Data, AI & Analytics" },
  { value: "finance_banking", label: "Finance & Banking" },
  { value: "healthcare", label: "Healthcare & Clinical" },
  { value: "sales_marketing", label: "Sales & Marketing" },
  { value: "hr_admin", label: "HR & People Operations" },
  { value: "manufacturing_engineering", label: "Manufacturing & Engineering" },
  { value: "public_sector", label: "Public Sector & Government" },
  { value: "education_research", label: "Education & Research" },
  { value: "retail_logistics", label: "Retail & Supply Chain" },
  { value: "hospitality", label: "Hospitality & Service" },
];

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "IN", label: "India" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "CA", label: "Canada" },
  { value: "REMOTE", label: "Anywhere / Global Remote" },
];

const SENIORITIES = [
  { value: "INTERN", label: "Internship" },
  { value: "ENTRY", label: "Entry Level" },
  { value: "MID", label: "Mid Level" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Lead / Principal" },
  { value: "DIRECTOR", label: "Director" },
  { value: "EXECUTIVE", label: "Executive" },
];

const EMPLOYMENT_TYPES = [
  { value: "FULL_TIME", label: "Full Time" },
  { value: "PART_TIME", label: "Part Time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "TEMPORARY", label: "Temporary" },
  { value: "INTERNSHIP", label: "Internship" },
];

const AVAILABLE_PROVIDERS = [
  { id: "freehire", name: "FreeHire Open ATS" },
  { id: "arbeitnow", name: "Arbeitnow Open Board" },
  { id: "jobicy", name: "Jobicy Remote Feed" },
  { id: "usajobs", name: "USAJOBS Federal API" },
  { id: "direct_ats", name: "Direct ATS Career Feeds" },
];

interface SearchPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  filters: Partial<JobSearchFilters>;
}

const BUILT_IN_PRESETS: SearchPreset[] = [
  {
    id: "preset-us-remote-tech",
    name: "US Remote Software",
    isBuiltIn: true,
    filters: {
      query: "Software Engineer",
      countries: ["US"],
      workArrangements: ["REMOTE"],
      industries: ["technology"],
    },
  },
  {
    id: "preset-healthcare-us",
    name: "Healthcare & Clinical",
    isBuiltIn: true,
    filters: {
      query: "Nurse",
      countries: ["US"],
      industries: ["healthcare"],
    },
  },
  {
    id: "preset-finance-banking",
    name: "Finance, Banking & Risk",
    isBuiltIn: true,
    filters: {
      industries: ["finance_banking"],
      seniorityLevels: ["MID", "SENIOR"],
    },
  },
  {
    id: "preset-leadership",
    name: "Executive & Leadership",
    isBuiltIn: true,
    filters: {
      seniorityLevels: ["DIRECTOR", "EXECUTIVE", "LEAD"],
      sortBy: "salary_desc",
    },
  },
];

interface FilterChipsBarProps {
  query: string;
  exactPhrase: string;
  excludedKeywordsInput: string;
  companyName: string;
  requiredSkillsInput: string;
  selectedIndustry: string;
  selectedCountry: string;
  selectedArrangement: string;
  selectedSeniority: string;
  selectedEmploymentType: string;
  salaryMin: string;
  experienceMin?: string;
  experienceMax?: string;
  experienceIncludeUnspecified?: boolean;
  postedWithinDays: string;
  visaSponsored: boolean;
  hideSaved: boolean;
  savedOnly: boolean;
  onRemoveQuery: () => void;
  onRemoveExactPhrase: () => void;
  onRemoveExcludedKeywords: () => void;
  onRemoveCompanyName: () => void;
  onRemoveRequiredSkills: () => void;
  onRemoveIndustry: () => void;
  onRemoveCountry: () => void;
  onRemoveArrangement: () => void;
  onRemoveSeniority: () => void;
  onRemoveEmploymentType: () => void;
  onRemoveSalaryMin: () => void;
  onRemoveExperience?: () => void;
  onRemovePostedWithinDays: () => void;
  onRemoveVisaSponsored: () => void;
  onRemoveHideSaved: () => void;
  onRemoveSavedOnly: () => void;
  onResetAll: () => void;
}

function FilterChipsBar(props: FilterChipsBarProps) {
  const chips: Array<{ label: string; onRemove: () => void }> = [];

  if (props.query) {
    chips.push({ label: `Keywords: "${props.query}"`, onRemove: props.onRemoveQuery });
  }
  if (props.exactPhrase) {
    chips.push({ label: `Exact: "${props.exactPhrase}"`, onRemove: props.onRemoveExactPhrase });
  }
  if (props.excludedKeywordsInput) {
    chips.push({ label: `Exclude: -${props.excludedKeywordsInput}`, onRemove: props.onRemoveExcludedKeywords });
  }
  if (props.companyName) {
    chips.push({ label: `Company: "${props.companyName}"`, onRemove: props.onRemoveCompanyName });
  }
  if (props.requiredSkillsInput) {
    chips.push({ label: `Skills: ${props.requiredSkillsInput}`, onRemove: props.onRemoveRequiredSkills });
  }
  if (props.selectedIndustry !== "ALL") {
    const match = INDUSTRIES.find((i) => i.value === props.selectedIndustry);
    chips.push({ label: `Industry: ${match?.label || props.selectedIndustry}`, onRemove: props.onRemoveIndustry });
  }
  if (props.selectedCountry !== "ALL") {
    const match = COUNTRIES.find((c) => c.value === props.selectedCountry);
    chips.push({ label: `Country: ${match?.label || props.selectedCountry}`, onRemove: props.onRemoveCountry });
  }
  if (props.selectedArrangement !== "ALL") {
    chips.push({ label: `Mode: ${props.selectedArrangement}`, onRemove: props.onRemoveArrangement });
  }
  if (props.selectedSeniority !== "ALL") {
    const match = SENIORITIES.find((s) => s.value === props.selectedSeniority);
    chips.push({ label: `Seniority: ${match?.label || props.selectedSeniority}`, onRemove: props.onRemoveSeniority });
  }
  if (props.selectedEmploymentType !== "ALL") {
    const match = EMPLOYMENT_TYPES.find((e) => e.value === props.selectedEmploymentType);
    chips.push({ label: `Type: ${match?.label || props.selectedEmploymentType}`, onRemove: props.onRemoveEmploymentType });
  }
  if (props.experienceMin || props.experienceMax) {
    let label = "Experience: ";
    if (props.experienceMin && props.experienceMax) {
      label += `${props.experienceMin}–${props.experienceMax} yrs`;
    } else if (props.experienceMin) {
      label += `≥ ${props.experienceMin} yrs`;
    } else {
      label += `≤ ${props.experienceMax} yrs`;
    }
    if (props.experienceIncludeUnspecified === false) {
      label += " (explicit only)";
    }
    if (props.onRemoveExperience) {
      chips.push({ label, onRemove: props.onRemoveExperience });
    }
  }
  if (props.salaryMin) {
    chips.push({ label: `Min Salary: $${props.salaryMin}`, onRemove: props.onRemoveSalaryMin });
  }
  if (props.postedWithinDays !== "ALL") {
    chips.push({ label: `Posted: <${props.postedWithinDays}d`, onRemove: props.onRemovePostedWithinDays });
  }
  if (props.visaSponsored) {
    chips.push({ label: "Visa Sponsored", onRemove: props.onRemoveVisaSponsored });
  }
  if (props.hideSaved) {
    chips.push({ label: "Hide Saved", onRemove: props.onRemoveHideSaved });
  }
  if (props.savedOnly) {
    chips.push({ label: "Saved Only", onRemove: props.onRemoveSavedOnly });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap pt-1">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active:</span>
      {chips.map((chip, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0B3B2C]/5 text-[#0B3B2C] border border-[#0B3B2C]/15"
        >
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="hover:text-rose-600 rounded-full p-0.5 transition"
            title="Remove filter"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={props.onResetAll}
        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline pl-1"
      >
        Clear all
      </button>
    </div>
  );
}

interface Props {
  initialQuery?: string;
  onPromoted?: (jobId: string) => void;
}

export function GlobalJobDiscoveryWorkbench({ initialQuery = "", onPromoted }: Props) {
  // Primary Search Controls
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("ALL");
  const [selectedCountry, setSelectedCountry] = useState<string>("ALL");
  const [selectedArrangement, setSelectedArrangement] = useState<string>("ALL");
  const [selectedSeniority, setSelectedSeniority] = useState<string>("ALL");
  const [selectedVerification, setSelectedVerification] = useState<string>("ALL");
  const [savedOnly, setSavedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "relevance" | "salary_desc" | "quality">("relevance");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Advanced Search Controls
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exactPhrase, setExactPhrase] = useState("");
  const [excludedKeywordsInput, setExcludedKeywordsInput] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [requiredSkillsInput, setRequiredSkillsInput] = useState("");
  const [preferredSkillsInput, setPreferredSkillsInput] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string>("ALL");
  const [experienceMin, setExperienceMin] = useState<string>("");
  const [experienceMax, setExperienceMax] = useState<string>("");
  const [experienceIncludeUnspecified, setExperienceIncludeUnspecified] = useState<boolean>(true);
  const [salaryMin, setSalaryMin] = useState<string>("");
  const [salaryMax, setSalaryMax] = useState<string>("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");
  const [salaryPeriod, setSalaryPeriod] = useState("YEARLY");
  const [postedWithinDays, setPostedWithinDays] = useState<string>("ALL");
  const [visaSponsored, setVisaSponsored] = useState(false);
  const [hideSaved, setHideSaved] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  // Presets
  const [savedPresets, setSavedPresets] = useState<SearchPreset[]>(BUILT_IN_PRESETS);
  const [newPresetName, setNewPresetName] = useState("");
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);

  // Results & Live Diagnostics
  const [jobs, setJobs] = useState<DiscoveredJobSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [estimatedTotal, setEstimatedTotal] = useState<number | undefined>(undefined);
  const [totalScope, setTotalScope] = useState<"CITY" | "STATE" | "COUNTRY" | "GLOBAL" | undefined>(undefined);
  const [returnedBatchCount, setReturnedBatchCount] = useState<number | undefined>(undefined);
  const [verifiedMatchingCount, setVerifiedMatchingCount] = useState<number | undefined>(undefined);
  const [isExactTotal, setIsExactTotal] = useState(false);
  const [uniqueCount, setUniqueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<LiveProviderExecutionStatus[]>([]);
  const [appliedFiltersSummary, setAppliedFiltersSummary] = useState<{
    providerSide: string[];
    inMemory: string[];
  }>({ providerSide: [], inMemory: [] });
  const [isLiveSearch, setIsLiveSearch] = useState(true);
  const [interpretedPlan, setInterpretedPlan] = useState<{
    intentSummary: string;
    role?: string;
    city?: string;
    state?: string;
    country?: string;
    workArrangement?: string;
    salaryMin?: number;
    salaryCurrency?: string;
    isAiInterpreted: boolean;
  } | undefined>(undefined);

  // Track the actual committed search parameters that produced the current results
  const [executedQuery, setExecutedQuery] = useState("");
  const [executedCity, setExecutedCity] = useState("");
  const [executedCountry, setExecutedCountry] = useState("ALL");

  // Search Lifecycle & Latency Feedback
  const [searchPhase, setSearchPhase] = useState<SearchLifecyclePhase>("COMPLETED");
  const [activeSubmittedQuery, setActiveSubmittedQuery] = useState("");
  const [activeSubmittedLocation, setActiveSubmittedLocation] = useState<string | undefined>(undefined);
  const [searchDurationMs, setSearchDurationMs] = useState<number | undefined>(undefined);

  // Modals
  const [detailJob, setDetailJob] = useState<DiscoveredJobSearchResult | null>(null);
  const [promoteJob, setPromoteJob] = useState<DiscoveredJobSearchResult | null>(null);
  const [promoteVisibility, setPromoteVisibility] = useState<"GLOBAL" | "CANDIDATE_PRIVATE">("GLOBAL");
  const [promoteCandidateId, setPromoteCandidateId] = useState("");
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [candidateOptions, setCandidateOptions] = useState<
    Array<{ id: string; fullName: string; email: string }>
  >([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [promoteNotes, setPromoteNotes] = useState("");
  const [promoteStatus, setPromoteStatus] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();

  // Load candidate options dynamically when visibility is set to CANDIDATE_PRIVATE
  useEffect(() => {
    if (!promoteJob || promoteVisibility !== "CANDIDATE_PRIVATE") return;
    let isCancelled = false;
    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      try {
        const res = await searchDeskCandidatesAction(candidateSearchQuery);
        if (!isCancelled && res.success && res.data) {
          setCandidateOptions(res.data);
        }
      } finally {
        if (!isCancelled) setLoadingCandidates(false);
      }
    };
    const timer = setTimeout(fetchCandidates, candidateSearchQuery ? 200 : 0);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [promoteJob, promoteVisibility, candidateSearchQuery]);

  // Load custom presets from localStorage on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem("oos_job_search_presets");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSavedPresets([...BUILT_IN_PRESETS, ...parsed]);
          }
        }
      } catch {
        // ignore localStorage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Compute active advanced filters count
  const activeAdvancedCount = [
    exactPhrase,
    excludedKeywordsInput,
    companyName,
    requiredSkillsInput,
    preferredSkillsInput,
    selectedState,
    selectedCity,
    selectedEmploymentType !== "ALL",
    experienceMin,
    experienceMax,
    !experienceIncludeUnspecified,
    salaryMin,
    salaryMax,
    postedWithinDays !== "ALL",
    visaSponsored,
    hideSaved,
    selectedProviders.length > 0,
  ].filter(Boolean).length;

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const searchRequestIdRef = useRef(0);
  const [currentTrace, setCurrentTrace] = useState<SearchTraceData | null>(null);
  const latestTraceRef = useRef<SearchTraceData | null>(null);

  const fetchJobs = useCallback(async (overrideFilters?: Partial<JobSearchFilters>) => {
    const requestId = ++searchRequestIdRef.current;
    const browserSubmissionMs = Date.now();
    const correlationId = `srch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    setLoading(true);
    setSearchPhase("PREPARING");
    setError(null);
    setJobs([]);
    setEstimatedTotal(undefined);
    setTotalScope(undefined);
    setReturnedBatchCount(undefined);
    setVerifiedMatchingCount(undefined);
    setSearchDurationMs(undefined);

    const activeQuery = overrideFilters?.query !== undefined ? overrideFilters.query : queryRef.current;
    const activeCity = overrideFilters?.cities !== undefined ? (overrideFilters.cities[0] || "") : selectedCity;
    const activeCountry = overrideFilters?.countries !== undefined ? (overrideFilters.countries[0] || "ALL") : selectedCountry;
    const activePage = overrideFilters?.page !== undefined ? overrideFilters.page : page;

    setActiveSubmittedQuery(activeQuery);
    const locString = activeCity
      ? activeCountry !== "ALL"
        ? `${activeCity}, ${activeCountry}`
        : activeCity
      : activeCountry !== "ALL"
      ? activeCountry
      : undefined;
    setActiveSubmittedLocation(locString);

    const excludedKeywords = excludedKeywordsInput
      ? excludedKeywordsInput.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const requiredSkills = requiredSkillsInput
      ? requiredSkillsInput.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const preferredSkills = preferredSkillsInput
      ? preferredSkillsInput.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const filters: JobSearchFilters = {
      query: activeQuery.trim() || undefined,
      exactPhrase: exactPhrase.trim() || undefined,
      excludedKeywords,
      companyName: companyName.trim() || undefined,
      requiredSkills,
      preferredSkills,
      industries: selectedIndustry !== "ALL" ? [selectedIndustry] : undefined,
      countries: activeCountry !== "ALL" ? [activeCountry] : undefined,
      states: selectedState.trim() ? [selectedState.trim()] : undefined,
      cities: activeCity.trim() ? [activeCity.trim()] : undefined,
      workArrangements: selectedArrangement !== "ALL" ? [selectedArrangement as JobWorkArrangement] : undefined,
      seniorityLevels: selectedSeniority !== "ALL" ? [selectedSeniority] : undefined,
      employmentTypes: selectedEmploymentType !== "ALL" ? [selectedEmploymentType as JobEmploymentType] : undefined,
      verificationStatuses: selectedVerification !== "ALL" ? [selectedVerification as JobVerificationStatus] : undefined,
      experienceMin: experienceMin && (!experienceMax || parseFloat(experienceMin) <= parseFloat(experienceMax)) ? parseFloat(experienceMin) : undefined,
      experienceMax: experienceMax && (!experienceMin || parseFloat(experienceMin) <= parseFloat(experienceMax)) ? parseFloat(experienceMax) : undefined,
      experienceIncludeUnspecified,
      salaryMin: salaryMin ? parseFloat(salaryMin) : undefined,
      salaryMax: salaryMax ? parseFloat(salaryMax) : undefined,
      salaryCurrency,
      salaryPeriod,
      postedWithinDays: postedWithinDays !== "ALL" ? parseInt(postedWithinDays, 10) : undefined,
      visaSponsored: visaSponsored || undefined,
      providerIds: selectedProviders.length > 0 ? selectedProviders : undefined,
      savedOnly,
      hideSaved: hideSaved || undefined,
      sortBy,
      page: activePage,
      pageSize,
      correlationId,
      clientSubmittedAtMs: browserSubmissionMs,
    };

    setSearchPhase("QUERYING");

    try {
      const result = await searchDiscoveredJobsAction(filters);
      const browserReceivedAtMs = Date.now();

      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      if (result.success && result.data) {
        setSearchPhase("FINALIZING");
        setJobs(result.data.jobs);
        setTotal(result.data.total);
        setTotalPages(result.data.totalPages);
        setHasMore(Boolean(result.data.hasMore));
        setEstimatedTotal(result.data.estimatedTotal);
        setTotalScope(result.data.totalScope);
        setReturnedBatchCount(result.data.returnedBatchCount);
        setVerifiedMatchingCount(result.data.verifiedMatchingCount);
        setIsExactTotal(Boolean(result.data.isExactTotal));
        setUniqueCount(result.data.uniqueCount || result.data.jobs.length);
        setProviderStatuses(result.data.providerStatuses || []);
        setAppliedFiltersSummary(
          result.data.appliedFiltersSummary || { providerSide: [], inMemory: [] }
        );
        setIsLiveSearch(Boolean(result.data.isLive));
        setInterpretedPlan(result.data.interpretedPlan);
        setExecutedQuery(activeQuery);
        setExecutedCity(activeCity);
        setExecutedCountry(activeCountry);
        setSearchDurationMs(result.data.searchDurationMs);
        setSearchPhase("COMPLETED");

        const trace = result.data.trace;
        if (trace) {
          trace.browserReceivedAtMs = browserReceivedAtMs;
          trace.checkpoints.push({
            checkpoint: "BROWSER_RESPONSE_RECEIVED",
            timestampMs: browserReceivedAtMs,
          });

          requestAnimationFrame(() => {
            const firstRenderedAtMs = Date.now();
            trace.firstRenderedAtMs = firstRenderedAtMs;
            trace.browserToResultMs = firstRenderedAtMs - browserSubmissionMs;
            trace.checkpoints.push({
              checkpoint: "FIRST_USABLE_RENDER",
              timestampMs: firstRenderedAtMs,
            });
            latestTraceRef.current = trace;
            setCurrentTrace(trace);
          });
        }
      } else {
        setError(result.error || "Failed to load discovered jobs.");
        setSearchPhase("ERROR");
      }
    } catch (err: any) {
      if (requestId === searchRequestIdRef.current) {
        setError(err?.message || "An unexpected error occurred.");
        setSearchPhase("ERROR");
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    exactPhrase,
    excludedKeywordsInput,
    companyName,
    requiredSkillsInput,
    preferredSkillsInput,
    selectedIndustry,
    selectedCountry,
    selectedState,
    selectedCity,
    selectedArrangement,
    selectedSeniority,
    selectedEmploymentType,
    selectedVerification,
    experienceMin,
    experienceMax,
    experienceIncludeUnspecified,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    postedWithinDays,
    visaSponsored,
    hideSaved,
    selectedProviders,
    savedOnly,
    sortBy,
    page,
    pageSize,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchJobs();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchJobs]);

  const handleToggleSave = async (job: DiscoveredJobSearchResult) => {
    const isCurrentlySaved = job.isSaved;
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, isSaved: !isCurrentlySaved } : j))
    );

    try {
      if (isCurrentlySaved) {
        await unsaveDiscoveredJobAction(job.canonicalUrl || job.id);
      } else {
        await saveDiscoveredJobAction({
          jobId: job.id,
          jobData: job,
        });
      }
    } catch {
      // Revert on error
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, isSaved: isCurrentlySaved } : j))
      );
    }
  };

  const handleClosePromoteModal = () => {
    setPromoteJob(null);
    setPromoteVisibility("GLOBAL");
    setPromoteCandidateId("");
    setCandidateSearchQuery("");
    setPromoteNotes("");
    setPromoteStatus(null);
  };

  const handleExecutePromote = async () => {
    if (!promoteJob) return;

    if (promoteVisibility === "CANDIDATE_PRIVATE" && !promoteCandidateId) {
      setPromoteStatus("Please select an active candidate for candidate-private job leads.");
      return;
    }

    setPromoteStatus("Importing vacancy into canonical catalog...");

    startTransition(async () => {
      try {
        const res = await promoteDiscoveredJobToCatalogAction({
          discoveredJobId: promoteJob.id,
          jobData: promoteJob,
          visibility: promoteVisibility,
          ownerCandidateId:
            promoteVisibility === "CANDIDATE_PRIVATE" ? promoteCandidateId : undefined,
          qualificationNotes: promoteNotes || undefined,
        });

        if (res.success && res.jobId) {
          setPromoteStatus("Successfully promoted to OOS Job Catalog!");
          setJobs((prev) =>
            prev.map((j) =>
              j.id === promoteJob.id ? { ...j, promotedToJobId: res.jobId! } : j
            )
          );
          if (onPromoted) onPromoted(res.jobId);
          setTimeout(() => {
            handleClosePromoteModal();
          }, 1200);
        } else {
          setPromoteStatus(res.error || "Promotion failed.");
        }
      } catch (err: any) {
        setPromoteStatus(err?.message || "Unexpected failure during catalog promotion.");
      }
    });
  };

  const resetAllFilters = () => {
    setQuery("");
    setExactPhrase("");
    setExcludedKeywordsInput("");
    setCompanyName("");
    setRequiredSkillsInput("");
    setPreferredSkillsInput("");
    setSelectedIndustry("ALL");
    setSelectedCountry("ALL");
    setSelectedState("");
    setSelectedCity("");
    setSelectedArrangement("ALL");
    setSelectedSeniority("ALL");
    setSelectedEmploymentType("ALL");
    setSelectedVerification("ALL");
    setExperienceMin("");
    setExperienceMax("");
    setExperienceIncludeUnspecified(true);
    setSalaryMin("");
    setSalaryMax("");
    setPostedWithinDays("ALL");
    setVisaSponsored(false);
    setHideSaved(false);
    setSelectedProviders([]);
    setSavedOnly(false);
    setSortBy("relevance");
    setPage(1);
    fetchJobs({ query: "", cities: [], countries: ["ALL"], page: 1 });
  };

  const applyPreset = (preset: SearchPreset) => {
    setQuery(preset.filters.query || "");
    setExactPhrase(preset.filters.exactPhrase || "");
    setExcludedKeywordsInput(preset.filters.excludedKeywords?.join(", ") || "");
    setCompanyName(preset.filters.companyName || "");
    setRequiredSkillsInput(preset.filters.requiredSkills?.join(", ") || "");
    setPreferredSkillsInput(preset.filters.preferredSkills?.join(", ") || "");
    setSelectedIndustry(preset.filters.industries?.[0] || "ALL");
    setSelectedCountry(preset.filters.countries?.[0] || "ALL");
    setSelectedState(preset.filters.states?.[0] || "");
    setSelectedCity(preset.filters.cities?.[0] || "");
    setSelectedArrangement(preset.filters.workArrangements?.[0] || "ALL");
    setSelectedSeniority(preset.filters.seniorityLevels?.[0] || "ALL");
    setSelectedEmploymentType(preset.filters.employmentTypes?.[0] || "ALL");
    setSelectedVerification(preset.filters.verificationStatuses?.[0] || "ALL");
    setExperienceMin(preset.filters.experienceMin ? String(preset.filters.experienceMin) : "");
    setExperienceMax(preset.filters.experienceMax ? String(preset.filters.experienceMax) : "");
    setExperienceIncludeUnspecified(preset.filters.experienceIncludeUnspecified ?? true);
    setSalaryMin(preset.filters.salaryMin ? String(preset.filters.salaryMin) : "");
    setSalaryMax(preset.filters.salaryMax ? String(preset.filters.salaryMax) : "");
    setPostedWithinDays(preset.filters.postedWithinDays ? String(preset.filters.postedWithinDays) : "ALL");
    setVisaSponsored(Boolean(preset.filters.visaSponsored));
    setHideSaved(Boolean(preset.filters.hideSaved));
    setSelectedProviders(preset.filters.providerIds || []);
    setSavedOnly(Boolean(preset.filters.savedOnly));
    setSortBy(preset.filters.sortBy || "relevance");
    setPage(1);
    fetchJobs({ ...preset.filters, page: 1 });
  };

  const saveCurrentPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: SearchPreset = {
      id: `custom-preset-${Date.now()}`,
      name: newPresetName.trim(),
      isBuiltIn: false,
      filters: {
        query: query || undefined,
        exactPhrase: exactPhrase || undefined,
        companyName: companyName || undefined,
        industries: selectedIndustry !== "ALL" ? [selectedIndustry] : undefined,
        countries: selectedCountry !== "ALL" ? [selectedCountry] : undefined,
        workArrangements: selectedArrangement !== "ALL" ? [selectedArrangement as any] : undefined,
        seniorityLevels: selectedSeniority !== "ALL" ? [selectedSeniority] : undefined,
        sortBy,
      },
    };

    const updated = [...savedPresets, newPreset];
    setSavedPresets(updated);

    try {
      const customOnly = updated.filter((p) => !p.isBuiltIn);
      localStorage.setItem("oos_job_search_presets", JSON.stringify(customOnly));
    } catch {
      // ignore localStorage error
    }

    setNewPresetName("");
    setShowSavePresetModal(false);
  };

  const deleteCustomPreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPresets.filter((p) => p.id !== presetId);
    setSavedPresets(updated);
    try {
      const customOnly = updated.filter((p) => !p.isBuiltIn);
      localStorage.setItem("oos_job_search_presets", JSON.stringify(customOnly));
    } catch {
      // ignore
    }
  };

  const getVerificationBadge = (status: JobVerificationStatus) => {
    switch (status) {
      case "SOURCE_CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Source Confirmed
          </span>
        );
      case "NEWLY_DISCOVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Sparkles className="w-3 h-3 text-blue-600" /> Newly Discovered
          </span>
        );
      case "NEEDS_VERIFICATION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" /> Needs Verification
          </span>
        );
      case "CLOSED":
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Closed / Expired
          </span>
        );
      case "STALE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            Stale (&gt;90d)
          </span>
        );
      default:
        return null;
    }
  };

  const handleRemoveQueryChip = useCallback(() => {
    setQuery("");
    setPage(1);
    void fetchJobs({ query: "", page: 1 });
  }, [fetchJobs]);



  return (
    <div className="space-y-6">
      {/* Top Indeterminate Progress Bar */}
      <JobSearchProgressBar loading={loading} />

      {/* Search Header & Presets Bar */}
      <div className="bg-white p-5 rounded-[16px] border border-[#E5EAE7] shadow-2xs space-y-4">
        {/* Presets Quick Picker */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 text-xs border-b border-[#EDF1EF]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-[#12A150]" />
              Presets:
            </span>
            {savedPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-50 hover:bg-[#12A150]/10 text-slate-700 hover:text-[#0B3B2C] border border-[#DDE5E0] hover:border-[#12A150]/30 cursor-pointer transition"
              >
                <span>{preset.name}</span>
                {!preset.isBuiltIn && (
                  <button
                    type="button"
                    onClick={(e) => deleteCustomPreset(preset.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition"
                    title="Delete preset"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowSavePresetModal(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B3B2C] hover:text-[#12A150] whitespace-nowrap pl-2"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Save Current Search
          </button>
        </div>

        {/* Primary Search Input Row */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="relative flex-1">
            <LocationAwareAutocomplete
              value={query}
              onChange={(val) => {
                setQuery(val);
              }}
              onSelect={(suggestion) => {
                if (suggestion.category === "city") {
                  setSelectedCity(suggestion.text);
                  setQuery("");
                  setPage(1);
                  fetchJobs({ cities: [suggestion.text], query: "", page: 1 });
                } else {
                  setQuery(suggestion.text);
                  setPage(1);
                  fetchJobs({ query: suggestion.text, page: 1 });
                }
              }}
              onSubmit={() => {
                if (loading) return;
                setPage(1);
                fetchJobs({ query, page: 1 });
              }}
              onClear={() => {
                setQuery("");
                setPage(1);
                fetchJobs({ query: "", page: 1 });
              }}
              placeholder='Search keywords, title, skills, or tokens (e.g. "Staff Engineer", React -crypto)...'
              type="main"
              country={selectedCountry}
              icon={<Search className="w-4 h-4" />}
              inputClassName="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-[#DDE5E0] rounded-[12px] text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12A150]/30 transition"
            />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (loading) return;
              setPage(1);
              fetchJobs({ query, page: 1 });
            }}
            className={`px-4 py-2.5 bg-[#0B3B2C] hover:bg-[#12A150] text-white rounded-[12px] text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs whitespace-nowrap cursor-pointer ${
              loading ? "opacity-75 cursor-not-allowed" : ""
            }`}
            id="job-discovery-search-btn"
            aria-busy={loading}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>{loading ? "Searching…" : "Search"}</span>
          </button>

          {/* Quick Filter: Country */}
          <div className="w-full sm:w-40">
            <select
              value={selectedCountry}
              onChange={(e) => {
                setSelectedCountry(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 bg-white border border-[#DDE5E0] rounded-[12px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#12A150]/30"
            >
              <option value="ALL">All Countries</option>
              {COUNTRIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Filter: Work Arrangement */}
          <div className="w-full sm:w-36">
            <select
              value={selectedArrangement}
              onChange={(e) => {
                setSelectedArrangement(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2.5 bg-white border border-[#DDE5E0] rounded-[12px] text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#12A150]/30"
            >
              <option value="ALL">All Modes</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">On-site</option>
            </select>
          </div>

          {/* Advanced Search Toggle Button */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-2.5 rounded-[12px] text-xs font-semibold border flex items-center gap-1.5 transition whitespace-nowrap ${
              showAdvanced || activeAdvancedCount > 0
                ? "bg-[#0B3B2C] text-white border-[#0B3B2C] shadow-2xs"
                : "bg-white border-[#DDE5E0] text-slate-700 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Advanced</span>
            {activeAdvancedCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#12A150] text-white text-[10px] flex items-center justify-center font-bold">
                {activeAdvancedCount}
              </span>
            )}
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Saved Only Button */}
          <button
            type="button"
            onClick={() => {
              setSavedOnly(!savedOnly);
              setPage(1);
            }}
            className={`px-3 py-2.5 rounded-[12px] text-xs font-semibold border flex items-center gap-1.5 transition ${
              savedOnly
                ? "bg-amber-50 border-amber-300 text-amber-800 shadow-2xs"
                : "bg-white border-[#DDE5E0] text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${savedOnly ? "fill-amber-600 text-amber-600" : ""}`} />
            Saved Only
          </button>

          {/* Reset Action */}
          <button
            type="button"
            onClick={resetAllFilters}
            title="Reset all search criteria"
            className="p-2.5 text-slate-500 hover:text-slate-800 rounded-[12px] border border-[#DDE5E0] hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Collapsible Advanced Search Panel */}
        {showAdvanced && (
          <div className="pt-4 border-t border-[#EDF1EF] space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Exact Phrase */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Exact Phrase
                </label>
                <input
                  type="text"
                  value={exactPhrase}
                  onChange={(e) => {
                    setExactPhrase(e.target.value);
                    setPage(1);
                  }}
                  placeholder='e.g. "Staff Engineer"'
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800"
                />
              </div>

              {/* Excluded Keywords */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Excluded Keywords (Negative)
                </label>
                <input
                  type="text"
                  value={excludedKeywordsInput}
                  onChange={(e) => {
                    setExcludedKeywordsInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. crypto, intern, unpaid"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800"
                />
              </div>

              {/* Target Employer / Company */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Company / Employer
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. Stripe, Mayo Clinic"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800"
                />
              </div>

              {/* Industry Sector */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Industry Sector
                </label>
                <select
                  value={selectedIndustry}
                  onChange={(e) => {
                    setSelectedIndustry(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-700"
                >
                  <option value="ALL">All Industries</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind.value} value={ind.value}>
                      {ind.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Required Skills */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Required Skills (Comma separated)
                </label>
                <input
                  type="text"
                  value={requiredSkillsInput}
                  onChange={(e) => {
                    setRequiredSkillsInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. React, TypeScript, Python"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800"
                />
              </div>

              {/* Preferred Skills */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Preferred Skills (Bonus)
                </label>
                <input
                  type="text"
                  value={preferredSkillsInput}
                  onChange={(e) => {
                    setPreferredSkillsInput(e.target.value);
                    setPage(1);
                  }}
                  placeholder="e.g. GraphQL, AWS, Docker"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800"
                />
              </div>

              {/* Seniority Level */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Seniority Level
                </label>
                <select
                  value={selectedSeniority}
                  onChange={(e) => {
                    setSelectedSeniority(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-700"
                >
                  <option value="ALL">All Seniorities</option>
                  {SENIORITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employment Type */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Employment Type
                </label>
                <select
                  value={selectedEmploymentType}
                  onChange={(e) => {
                    setSelectedEmploymentType(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-700"
                >
                  <option value="ALL">All Employment Types</option>
                  {EMPLOYMENT_TYPES.map((et) => (
                    <option key={et.value} value={et.value}>
                      {et.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* State / Province */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  State / Region
                </label>
                <LocationAwareAutocomplete
                  value={selectedState}
                  onChange={(val) => {
                    setSelectedState(val);
                    setPage(1);
                  }}
                  onSelect={(suggestion) => {
                    setSelectedState(suggestion.text);
                    setPage(1);
                  }}
                  placeholder="e.g. California, Karnataka"
                  type="state"
                  country={selectedCountry}
                  inputClassName="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12A150]/30 transition"
                />
              </div>

              {/* City */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  City
                </label>
                <LocationAwareAutocomplete
                  value={selectedCity}
                  onChange={(val) => {
                    setSelectedCity(val);
                    setPage(1);
                  }}
                  onSelect={(suggestion) => {
                    setSelectedCity(suggestion.text);
                    setPage(1);
                  }}
                  placeholder="e.g. San Francisco, Bengaluru"
                  type="city"
                  country={selectedCountry}
                  state={selectedState}
                  inputClassName="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12A150]/30 transition"
                />
              </div>

              {/* Experience Range Selector (Enterprise Upgrade) */}
              <div className="col-span-1 sm:col-span-2 bg-slate-50/70 p-3 rounded-[12px] border border-[#DDE5E0] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      Experience Range (0–30 Years)
                    </label>
                    {(experienceMin || experienceMax) && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#12A150]/10 text-[#0B3B2C] border border-[#12A150]/20">
                        {experienceMin && experienceMax
                          ? `${experienceMin}–${experienceMax} yrs`
                          : experienceMin
                          ? `≥ ${experienceMin} yrs`
                          : `≤ ${experienceMax} yrs`}
                      </span>
                    )}
                  </div>
                  {(experienceMin || experienceMax) && (
                    <button
                      type="button"
                      onClick={() => {
                        setExperienceMin("");
                        setExperienceMax("");
                        setPage(1);
                      }}
                      className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "any", label: "Any", min: "", max: "" },
                    { id: "entry", label: "Entry (0–2)", min: "0", max: "2" },
                    { id: "junior", label: "Junior (0–3)", min: "0", max: "3" },
                    { id: "mid", label: "Mid (3–7)", min: "3", max: "7" },
                    { id: "senior", label: "Senior (7–15)", min: "7", max: "15" },
                    { id: "lead", label: "Lead (10–30)", min: "10", max: "30" },
                  ].map((preset) => {
                    const isSelected =
                      preset.id === "any"
                        ? !experienceMin && !experienceMax
                        : experienceMin === preset.min && experienceMax === preset.max;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setExperienceMin(preset.min);
                          setExperienceMax(preset.max);
                          setPage(1);
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition cursor-pointer ${
                          isSelected
                            ? "bg-[#0B3B2C] text-white border-[#0B3B2C] shadow-2xs"
                            : "bg-white text-slate-600 border-[#DDE5E0] hover:bg-slate-100"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Range Inputs */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={experienceMin}
                        onChange={(e) => {
                          setExperienceMin(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Min (0–30)"
                        className="w-full px-2.5 py-1 bg-white border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#12A150]"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400 pointer-events-none">
                        yrs
                      </span>
                    </div>
                  </div>
                  <span className="text-slate-400 text-xs font-semibold">to</span>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={experienceMax}
                        onChange={(e) => {
                          setExperienceMax(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Max (0–30)"
                        className="w-full px-2.5 py-1 bg-white border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#12A150]"
                      />
                      <span className="absolute right-2 top-1 text-[10px] text-slate-400 pointer-events-none">
                        yrs
                      </span>
                    </div>
                  </div>
                </div>

                {/* Validation notice if min > max */}
                {experienceMin && experienceMax && parseFloat(experienceMin) > parseFloat(experienceMax) && (
                  <p className="text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Warning: Minimum ({experienceMin}) cannot exceed Maximum ({experienceMax}).
                  </p>
                )}

                {/* Unspecified experience inclusion checkbox */}
                <div className="pt-1">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600 text-[11px]">
                    <input
                      type="checkbox"
                      checked={experienceIncludeUnspecified}
                      onChange={(e) => {
                        setExperienceIncludeUnspecified(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded text-[#12A150] focus:ring-[#12A150] w-3.5 h-3.5"
                    />
                    <span>Include jobs with unspecified experience requirements</span>
                  </label>
                </div>
              </div>

              {/* Minimum Salary */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Min Salary ({salaryCurrency})
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={salaryMin}
                    onChange={(e) => {
                      setSalaryMin(e.target.value);
                      setPage(1);
                    }}
                    placeholder="e.g. 100000"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium"
                  />
                </div>
              </div>

              {/* Posting Recency */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Posting Date
                </label>
                <select
                  value={postedWithinDays}
                  onChange={(e) => {
                    setPostedWithinDays(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-700"
                >
                  <option value="ALL">Anytime</option>
                  <option value="1">Past 24 Hours</option>
                  <option value="7">Past 7 Days</option>
                  <option value="14">Past 14 Days</option>
                  <option value="30">Past 30 Days</option>
                  <option value="90">Past 90 Days</option>
                </select>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Sort Order
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as any);
                    setPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-[#DDE5E0] rounded-[8px] text-[11px] font-medium text-slate-700"
                >
                  <option value="relevance">Most Relevant</option>
                  <option value="newest">Newest First</option>
                  <option value="salary_desc">Highest Salary</option>
                  <option value="quality">Highest Quality Score</option>
                </select>
              </div>

              {/* Checkboxes Row */}
              <div className="col-span-1 sm:col-span-2 flex items-center gap-4 pt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={visaSponsored}
                    onChange={(e) => {
                      setVisaSponsored(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded text-[#12A150] focus:ring-[#12A150]"
                  />
                  <span>Visa / H-1B Sponsorship Explicitly Stated</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={hideSaved}
                    onChange={(e) => {
                      setHideSaved(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded text-[#12A150] focus:ring-[#12A150]"
                  />
                  <span>Hide Previously Saved Leads</span>
                </label>
              </div>
            </div>

            {/* Provider Source Checkboxes */}
            <div className="pt-2 border-t border-[#EDF1EF]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Target External Providers:
              </span>
              <div className="flex flex-wrap gap-3">
                {AVAILABLE_PROVIDERS.map((prov) => {
                  const isChecked =
                    selectedProviders.length === 0 || selectedProviders.includes(prov.id);
                  return (
                    <label
                      key={prov.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer transition ${
                        isChecked
                          ? "bg-emerald-50/60 border-emerald-300 text-emerald-900"
                          : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(prov.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProviders([...selectedProviders, prov.id]);
                          } else {
                            setSelectedProviders(
                              selectedProviders.filter((p) => p !== prov.id)
                            );
                          }
                          setPage(1);
                        }}
                        className="rounded text-[#12A150] focus:ring-[#12A150]"
                      />
                      <span>{prov.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Applied Filter Chips */}
        <FilterChipsBar
          query={query}
          exactPhrase={exactPhrase}
          excludedKeywordsInput={excludedKeywordsInput}
          companyName={companyName}
          requiredSkillsInput={requiredSkillsInput}
          selectedIndustry={selectedIndustry}
          selectedCountry={selectedCountry}
          selectedArrangement={selectedArrangement}
          selectedSeniority={selectedSeniority}
          selectedEmploymentType={selectedEmploymentType}
          experienceMin={experienceMin}
          experienceMax={experienceMax}
          experienceIncludeUnspecified={experienceIncludeUnspecified}
          salaryMin={salaryMin}
          postedWithinDays={postedWithinDays}
          visaSponsored={visaSponsored}
          hideSaved={hideSaved}
          savedOnly={savedOnly}
          onRemoveQuery={handleRemoveQueryChip}
          onRemoveExactPhrase={() => setExactPhrase("")}
          onRemoveExcludedKeywords={() => setExcludedKeywordsInput("")}
          onRemoveCompanyName={() => setCompanyName("")}
          onRemoveRequiredSkills={() => setRequiredSkillsInput("")}
          onRemoveIndustry={() => setSelectedIndustry("ALL")}
          onRemoveCountry={() => setSelectedCountry("ALL")}
          onRemoveArrangement={() => setSelectedArrangement("ALL")}
          onRemoveSeniority={() => setSelectedSeniority("ALL")}
          onRemoveEmploymentType={() => setSelectedEmploymentType("ALL")}
          onRemoveExperience={() => {
            setExperienceMin("");
            setExperienceMax("");
            setExperienceIncludeUnspecified(true);
            setPage(1);
          }}
          onRemoveSalaryMin={() => setSalaryMin("")}
          onRemovePostedWithinDays={() => setPostedWithinDays("ALL")}
          onRemoveVisaSponsored={() => setVisaSponsored(false)}
          onRemoveHideSaved={() => setHideSaved(false)}
          onRemoveSavedOnly={() => setSavedOnly(false)}
          onResetAll={resetAllFilters}
        />
      </div>

      {/* Search Lifecycle, Active Scope & Provider Diagnostics Status Banner */}
      <JobSearchStatusBanner
        loading={loading}
        phase={searchPhase}
        activeSubmittedQuery={activeSubmittedQuery || executedQuery}
        activeLocation={activeSubmittedLocation || (executedCity ? `${executedCity}${executedCountry !== "ALL" ? `, ${executedCountry}` : ""}` : (executedCountry !== "ALL" ? executedCountry : undefined))}
        providerStatuses={providerStatuses}
        searchDurationMs={searchDurationMs}
      />

      {/* Diagnostics, Accuracy & Pagination Status Line */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 px-1 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isLiveSearch && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live External Search
            </span>
          )}

          <span>
            {loading ? (
              <span className="text-slate-400 font-medium animate-pulse">Searching live job providers...</span>
            ) : (
              <>
                Showing <span className="font-bold text-slate-800">{jobs.length}</span>{" "}
                {isExactTotal ? `of ${total} total leads (exact)` : "opportunities on this page"}
                {verifiedMatchingCount !== undefined && (
                  <span className="text-slate-500 font-medium">
                    {" "}• {verifiedMatchingCount} verified in {executedCity || interpretedPlan?.city || (executedCountry !== "ALL" ? (executedCountry === "IN" ? "India" : executedCountry === "US" ? "United States" : executedCountry) : interpretedPlan?.country === "IN" ? "India" : executedQuery.trim() || "search criteria")}
                  </span>
                )}
                {returnedBatchCount !== undefined && returnedBatchCount !== jobs.length && (!verifiedMatchingCount || (!executedCity && !interpretedPlan?.city && executedCountry === "ALL" && !interpretedPlan?.country)) && (
                  <span className="text-slate-400"> • {returnedBatchCount} returned in batch</span>
                )}
                {!isExactTotal && estimatedTotal && (
                  <span className="text-slate-400">
                    {" "}• ~{estimatedTotal >= 100000 ? `${(estimatedTotal / 100000).toFixed(0)} Lakhs (${(estimatedTotal / 1000000).toFixed(1)}M+)` : estimatedTotal.toLocaleString()} available upstream ({
                      totalScope === "CITY"
                        ? (executedCity || interpretedPlan?.city || (executedQuery && (executedQuery.toLowerCase().includes("bengaluru") || executedQuery.toLowerCase().includes("bangalore")) ? "Bengaluru" : executedQuery && executedQuery.toLowerCase().includes("hyderabad") ? "Hyderabad" : "city scope"))
                        : totalScope === "COUNTRY"
                        ? (executedCountry !== "ALL" ? (executedCountry === "IN" ? "India" : executedCountry === "US" ? "United States" : executedCountry) : interpretedPlan?.country === "IN" ? "India" : "country scope")
                        : totalScope === "GLOBAL" && !executedCity && !interpretedPlan?.city && executedCountry === "ALL" && !interpretedPlan?.country
                        ? "all regions"
                        : "provider reported"
                    })
                  </span>
                )}
                {!isExactTotal && !estimatedTotal && (
                  <span className="text-slate-400"> • {hasMore ? "More results available" : "End of results"}</span>
                )}
              </>
            )}
          </span>
        </div>

        {/* Provider Latency Diagnostics */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {providerStatuses.map((ps) => (
            <span
              key={ps.providerId}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                ps.status === "SUCCESS"
                  ? "bg-slate-50 text-slate-600 border-slate-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
              title={`${ps.providerName}: ${ps.status} (${ps.latencyMs}ms)`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  ps.status === "SUCCESS" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {ps.providerName.split(" ")[0]}: {ps.status === "SUCCESS" ? `${ps.count} live` : "Offline"}
            </span>
          ))}

          {/* Filter Scope Attribution Pill */}
          {appliedFiltersSummary.providerSide.length > 0 && (
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200"
              title={`Filters sent to upstream provider: ${appliedFiltersSummary.providerSide.join("; ")}`}
            >
              Provider: {appliedFiltersSummary.providerSide.length}
            </span>
          )}

          <span className="text-slate-400 font-medium">Page {page}</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <JobSearchErrorState error={error} onRetry={() => fetchJobs()} />
      )}

      {/* Partial Provider Failure Warning */}
      <JobSearchPartialFailureAlert
        providerStatuses={providerStatuses}
        onRetry={() => fetchJobs()}
      />

      {/* AI Interpreted Search Intent Banner */}
      {interpretedPlan && (interpretedPlan.role || interpretedPlan.city || interpretedPlan.workArrangement || interpretedPlan.salaryMin) && (
        <div className="bg-gradient-to-r from-emerald-50/80 via-white to-blue-50/50 border border-emerald-200/80 rounded-[14px] p-3 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              {interpretedPlan.isAiInterpreted ? (
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
              )}
              <span>Interpreted Search Intent:</span>
            </div>
            {interpretedPlan.role && (
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium text-[11px]">
                Role: <strong className="text-slate-900">{interpretedPlan.role}</strong>
              </span>
            )}
            {(interpretedPlan.city || interpretedPlan.country) && (
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium text-[11px]">
                Location: <strong className="text-slate-900">{[interpretedPlan.city, interpretedPlan.state, interpretedPlan.country].filter(Boolean).join(", ")}</strong>
              </span>
            )}
            {interpretedPlan.workArrangement && (
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium text-[11px]">
                Mode: <strong className="text-slate-900">{interpretedPlan.workArrangement}</strong>
              </span>
            )}
            {interpretedPlan.salaryMin && (
              <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium text-[11px]">
                Min Salary: <strong className="text-slate-900">{interpretedPlan.salaryCurrency === "INR" ? `₹${(interpretedPlan.salaryMin / 100000).toFixed(0)} LPA` : `$${(interpretedPlan.salaryMin / 1000).toFixed(0)}k`}</strong>
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-medium">
              ({interpretedPlan.isAiInterpreted ? "DeepSeek Interpreted" : "Deterministic Fallback"})
            </span>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading ? (
        <JobSearchSkeletonGrid count={6} />
      ) : jobs.length === 0 ? (
        /* Empty State */
        <JobSearchEmptyState
          query={executedQuery}
          location={executedCity || (executedCountry !== "ALL" ? executedCountry : undefined)}
          savedOnly={savedOnly}
          onResetFilters={resetAllFilters}
        />
      ) : (
        /* Job Result Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="bg-white p-5 rounded-2xl border border-[#E5EAE7] hover:border-[#12A150]/40 transition-all duration-200 shadow-2xs hover:shadow-xs flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-2.5">
                {/* Header badges */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getVerificationBadge(job.verificationStatus)}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {job.workArrangement}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSave(job)}
                    className="text-slate-400 hover:text-amber-600 transition p-1"
                    title={job.isSaved ? "Remove from saved leads" : "Save this job lead"}
                  >
                    <Bookmark
                      className={`w-4 h-4 ${
                        job.isSaved ? "fill-amber-500 text-amber-500" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Title & Employer */}
                <div>
                  <h3
                    className="text-sm font-bold text-slate-900 group-hover:text-[#0B3B2C] transition line-clamp-2 cursor-pointer"
                    onClick={() => setDetailJob(job)}
                  >
                    {job.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pt-0.5">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{job.companyName}</span>
                  </div>
                </div>

                {/* Location & Compensation */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 pt-1">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>{job.city || job.state || job.country || "Unspecified location"}</span>
                  </div>
                  {job.salaryMin || job.salaryMax ? (
                    <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                      <DollarSign className="w-3 h-3" />
                      <span>
                        {job.salaryCurrency} {job.salaryMin ? job.salaryMin.toLocaleString() : ""}
                        {job.salaryMin && job.salaryMax ? " - " : ""}
                        {job.salaryMax ? job.salaryMax.toLocaleString() : ""}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Description Snippet */}
                <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed pt-1">
                  {job.jobDescription.replace(/<[^>]+>/g, " ")}
                </p>

                {/* Skills tags */}
                {job.requiredSkills && job.requiredSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {job.requiredSkills.slice(0, 4).map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {skill}
                      </span>
                    ))}
                    {job.requiredSkills.length > 4 && (
                      <span className="text-[10px] text-slate-400 self-center">
                        +{job.requiredSkills.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Explainable Relevance Pill */}
                {job.relevance && (
                  <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-2 text-[10px] text-emerald-800 space-y-1">
                    <div className="font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        Relevance Match: {job.relevance.overallScore}%
                      </span>
                      {job.relevance.aiEvidence?.aiAssisted && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
                          AI Analyzed
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-emerald-700 leading-snug">
                      {job.relevance.aiEvidence?.matchExplanation || job.relevance.reasons[0]}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-[#EDF1EF] flex items-center justify-between gap-2">
                <span
                  className="text-[10px] text-slate-400 truncate max-w-[120px]"
                  title={job.sourceAttribution}
                >
                  {job.sourceAttribution}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDetailJob(job)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition"
                  >
                    Inspect
                  </button>

                  {!job.promotedToJobId ? (
                    <button
                      type="button"
                      onClick={() => setPromoteJob(job)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0B3B2C] hover:bg-[#082F26] transition flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Import
                    </button>
                  ) : null}

                  <a
                    href={job.canonicalUrl || job.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-600 hover:text-[#12A150] transition rounded-lg hover:bg-slate-50"
                    title="Open original job application page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-[16px] border border-[#E5EAE7]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3.5 py-1.5 rounded-lg border border-[#DDE5E0] text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasMore && page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3.5 py-1.5 rounded-lg border border-[#DDE5E0] text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-50 transition cursor-pointer disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-600">
            Page {page} {isExactTotal ? (totalPages > 1 ? `of ${totalPages}` : "") : (totalPages > 1 ? `of ${totalPages}+` : "")}
          </span>
          {hasMore && !isExactTotal && (
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              More available
            </span>
          )}
        </div>

        {/* Page Size Selector */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="text-[11px] font-medium text-slate-500">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-slate-50 border border-[#DDE5E0] rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#12A150]"
          >
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* Save Preset Modal */}
      {showSavePresetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Save Search Preset</h3>
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Save your current keywords and advanced filters for 1-click execution.
            </p>
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g. US Senior React Remote"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#12A150]/30"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSavePresetModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newPresetName.trim()}
                onClick={saveCurrentPreset}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0B3B2C] hover:bg-[#082F26] disabled:opacity-50 transition"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {detailJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                {getVerificationBadge(detailJob.verificationStatus)}
                <span className="text-xs text-slate-500">{detailJob.sourceAttribution}</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailJob(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-700">
              <div>
                <h2 className="text-base font-bold text-slate-900">{detailJob.title}</h2>
                <div className="text-sm font-semibold text-slate-600">{detailJob.companyName}</div>
              </div>

              {/* Grid attributes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Location</span>
                  <span className="font-semibold text-slate-700">
                    {detailJob.city || detailJob.country || "Unspecified"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Work Arrangement</span>
                  <span className="font-semibold text-slate-700">{detailJob.workArrangement}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Employment Type</span>
                  <span className="font-semibold text-slate-700">{detailJob.employmentType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Industry</span>
                  <span className="font-semibold text-slate-700">{detailJob.industry || "General"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Seniority</span>
                  <span className="font-semibold text-slate-700">{detailJob.seniorityLevel || "Not specified"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold uppercase text-[9px]">Quality Score</span>
                  <span className="font-semibold text-emerald-700">{detailJob.qualityScore}%</span>
                </div>
              </div>

              {/* Provenance Box */}
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-[11px] space-y-1 text-slate-600">
                <div className="font-bold text-blue-900">Provenance & Traceability</div>
                <div>
                  External ID: <code className="text-blue-800">{detailJob.externalId}</code>
                </div>
                <div>
                  Canonical URL:{" "}
                  <a
                    href={detailJob.canonicalUrl || detailJob.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline truncate block"
                  >
                    {detailJob.canonicalUrl || detailJob.externalUrl}
                  </a>
                </div>
              </div>

              {/* Job Description */}
              <div>
                <h4 className="font-bold text-slate-900 mb-1.5 uppercase text-[10px] tracking-wider">
                  Position Description
                </h4>
                <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto text-slate-600">
                  {detailJob.jobDescription}
                </div>
              </div>

              {/* Required & Preferred Skills */}
              {detailJob.requiredSkills && detailJob.requiredSkills.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5 uppercase text-[10px] tracking-wider">
                    Required Skills
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {detailJob.requiredSkills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
              <a
                href={detailJob.canonicalUrl || detailJob.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#12A150] text-white rounded-xl text-xs font-semibold hover:bg-[#0B3B2C] transition flex items-center gap-1.5"
              >
                <span>Apply on Employer Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                onClick={() => setDetailJob(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote to Catalog Modal */}
      {promoteJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-[#0B3B2C]" />
                <h3 className="text-sm font-bold text-slate-900">Import to OOS Job Catalog</h3>
              </div>
              <button
                type="button"
                onClick={handleClosePromoteModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p>
                Promoting <span className="font-bold text-slate-900">{promoteJob.title}</span> at{" "}
                <span className="font-semibold text-slate-800">{promoteJob.companyName}</span> creates a
                canonical requisition in the internal OOS Job Catalog.
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Requisition Visibility
                </label>
                <select
                  value={promoteVisibility}
                  onChange={(e) => {
                    const nextVal = e.target.value as "GLOBAL" | "CANDIDATE_PRIVATE";
                    setPromoteVisibility(nextVal);
                    if (nextVal === "GLOBAL") {
                      setPromoteCandidateId("");
                    }
                    setPromoteStatus(null);
                  }}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                >
                  <option value="GLOBAL">Global Requisition (All recruiters & operations)</option>
                  <option value="CANDIDATE_PRIVATE">Candidate Private Lead (Dedicated sourcing)</option>
                </select>
              </div>

              {promoteVisibility === "CANDIDATE_PRIVATE" && (
                <div className="space-y-2 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-amber-900">
                      Target Candidate <span className="text-rose-500">*</span>
                    </label>
                    {loadingCandidates && (
                      <span className="text-[10px] text-amber-700 font-medium">Searching...</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={candidateSearchQuery}
                    onChange={(e) => setCandidateSearchQuery(e.target.value)}
                    placeholder="Search candidate by name or email..."
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <select
                    value={promoteCandidateId}
                    onChange={(e) => {
                      setPromoteCandidateId(e.target.value);
                      setPromoteStatus(null);
                    }}
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">-- Choose Candidate --</option>
                    {candidateOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.email})
                      </option>
                    ))}
                  </select>
                  {candidateOptions.length === 0 && !loadingCandidates && (
                    <p className="text-[10px] text-slate-500 italic">
                      No active candidates found. Try searching by name or email.
                    </p>
                  )}
                  <p className="text-[10px] text-amber-800">
                    Candidate private leads are strictly isolated to the selected candidate.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Operational Notes (Optional)
                </label>
                <textarea
                  value={promoteNotes}
                  onChange={(e) => setPromoteNotes(e.target.value)}
                  placeholder="e.g. Sourced via live FreeHire ATS feed. High priority vacancy."
                  rows={3}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              {promoteStatus && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-semibold ${
                    promoteStatus.includes("Successfully")
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {promoteStatus}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleClosePromoteModal}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleExecutePromote}
                className="px-4 py-2 bg-[#0B3B2C] text-white rounded-xl text-xs font-semibold hover:bg-[#082F26] disabled:opacity-50 transition flex items-center gap-1.5"
              >
                {isPending ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
