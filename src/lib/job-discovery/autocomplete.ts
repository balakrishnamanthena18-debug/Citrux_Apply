/**
 * Global Job Discovery & Collection Engine — Location-Aware Autocomplete Engine
 *
 * Provides real-time, location-aware suggestion capabilities across:
 * 1. Job Titles (from real providers, canonical catalog, and industry taxonomy)
 * 2. Skills (programming languages, clinical, data, finance, enterprise tools)
 * 3. Employers / Companies (real ATS sources, catalog employers, enterprise organizations)
 * 4. Locations & Location-Specific State/Region and City fields (filtered by country context)
 *
 * Implements bounded results, prefix scoring, location affinity, and zero bulk storage.
 */

import { prisma } from "@/lib/db/prisma";
import { normalizeCompanyName, normalizeJobTitle } from "./normalizer";
import type { ValidatedJobAutocompleteQuery } from "./contracts";

export type AutocompleteCategory =
  | "title"
  | "skill"
  | "employer"
  | "location"
  | "state"
  | "city";

export interface AutocompleteSuggestion {
  id: string;
  text: string;
  category: AutocompleteCategory;
  subtext?: string;
  badgeLabel: string;
  source?: "provider" | "catalog" | "taxonomy";
  country?: string;
  state?: string;
  city?: string;
}

// -----------------------------------------------------------------------------
// Authoritative Geographic Taxonomy (US, IN, GB, DE, CA, Remote)
// -----------------------------------------------------------------------------

interface StateData {
  name: string;
  code?: string;
  country: string;
  cities: string[];
}

const GEOGRAPHIC_DATA: StateData[] = [
  // --- United States (US) ---
  {
    name: "California",
    code: "CA",
    country: "US",
    cities: [
      "San Francisco",
      "San Jose",
      "Los Angeles",
      "San Diego",
      "Sacramento",
      "Oakland",
      "Palo Alto",
      "Mountain View",
      "Sunnyvale",
      "Santa Clara",
      "Irvine",
      "Pasadena",
      "Fresno",
      "Long Beach",
      "Berkeley",
    ],
  },
  {
    name: "New York",
    code: "NY",
    country: "US",
    cities: [
      "New York City",
      "Brooklyn",
      "Manhattan",
      "Buffalo",
      "Albany",
      "Rochester",
      "Syracuse",
      "White Plains",
      "Yonkers",
    ],
  },
  {
    name: "Washington",
    code: "WA",
    country: "US",
    cities: ["Seattle", "Bellevue", "Redmond", "Kirkland", "Tacoma", "Spokane", "Vancouver", "Olympia"],
  },
  {
    name: "Texas",
    code: "TX",
    country: "US",
    cities: [
      "Austin",
      "Dallas",
      "Houston",
      "Plano",
      "Fort Worth",
      "San Antonio",
      "Irving",
      "Arlington",
      "El Paso",
      "Frisco",
    ],
  },
  {
    name: "Massachusetts",
    code: "MA",
    country: "US",
    cities: ["Boston", "Cambridge", "Waltham", "Worcester", "Somerville", "Burlington", "Quincy"],
  },
  {
    name: "Illinois",
    code: "IL",
    country: "US",
    cities: ["Chicago", "Naperville", "Evanston", "Schaumburg", "Peoria", "Rockford", "Springfield"],
  },
  {
    name: "Georgia",
    code: "GA",
    country: "US",
    cities: ["Atlanta", "Alpharetta", "Marietta", "Savannah", "Athens", "Roswell", "Duluth"],
  },
  {
    name: "North Carolina",
    code: "NC",
    country: "US",
    cities: ["Charlotte", "Raleigh", "Durham", "Cary", "Greensboro", "Winston-Salem", "Chapel Hill"],
  },
  {
    name: "Colorado",
    code: "CO",
    country: "US",
    cities: ["Denver", "Boulder", "Colorado Springs", "Fort Collins", "Aurora", "Lakewood"],
  },
  {
    name: "Florida",
    code: "FL",
    country: "US",
    cities: ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "St. Petersburg", "Tallahassee"],
  },
  {
    name: "Pennsylvania",
    code: "PA",
    country: "US",
    cities: ["Philadelphia", "Pittsburgh", "Allentown", "King of Prussia", "Harrisburg", "Scranton"],
  },
  {
    name: "Virginia",
    code: "VA",
    country: "US",
    cities: ["Arlington", "McLean", "Reston", "Richmond", "Alexandria", "Tysons", "Virginia Beach"],
  },
  {
    name: "Ohio",
    code: "OH",
    country: "US",
    cities: ["Columbus", "Cleveland", "Cincinnati", "Dayton", "Toledo", "Akron"],
  },
  {
    name: "Michigan",
    code: "MI",
    country: "US",
    cities: ["Detroit", "Ann Arbor", "Grand Rapids", "Lansing", "Troy", "Kalamazoo"],
  },
  {
    name: "Minnesota",
    code: "MN",
    country: "US",
    cities: ["Minneapolis", "Saint Paul", "Rochester", "Bloomington", "Duluth"],
  },
  {
    name: "New Jersey",
    code: "NJ",
    country: "US",
    cities: ["Jersey City", "Newark", "Princeton", "Hoboken", "Morristown", "Trenton"],
  },
  {
    name: "Tennessee",
    code: "TN",
    country: "US",
    cities: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Franklin"],
  },
  {
    name: "Utah",
    code: "UT",
    country: "US",
    cities: ["Salt Lake City", "Lehi", "Provo", "Sandy", "Orem", "Draper"],
  },
  {
    name: "Arizona",
    code: "AZ",
    country: "US",
    cities: ["Phoenix", "Scottsdale", "Tempe", "Chandler", "Mesa", "Tucson"],
  },
  {
    name: "Oregon",
    code: "OR",
    country: "US",
    cities: ["Portland", "Beaverton", "Hillsboro", "Eugene", "Salem", "Bend"],
  },
  {
    name: "District of Columbia",
    code: "DC",
    country: "US",
    cities: ["Washington"],
  },

  // --- India (IN) ---
  {
    name: "Karnataka",
    country: "IN",
    cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Udupi"],
  },
  {
    name: "Maharashtra",
    country: "IN",
    cities: ["Mumbai", "Pune", "Nagpur", "Navi Mumbai", "Thane", "Nashik", "Aurangabad"],
  },
  {
    name: "Telangana",
    country: "IN",
    cities: ["Hyderabad", "Warangal", "Secunderabad", "Nizamabad", "Karimnagar"],
  },
  {
    name: "Tamil Nadu",
    country: "IN",
    cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli"],
  },
  {
    name: "Delhi NCR",
    country: "IN",
    cities: ["New Delhi", "Noida", "Gurugram", "Greater Noida", "Faridabad", "Ghaziabad"],
  },
  {
    name: "Uttar Pradesh",
    country: "IN",
    cities: ["Noida", "Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj"],
  },
  {
    name: "Gujarat",
    country: "IN",
    cities: ["Ahmedabad", "Surat", "Vadodara", "Gandhinagar", "Rajkot"],
  },
  {
    name: "West Bengal",
    country: "IN",
    cities: ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol"],
  },
  {
    name: "Kerala",
    country: "IN",
    cities: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Thrissur", "Kollam"],
  },
  {
    name: "Andhra Pradesh",
    country: "IN",
    cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Kakinada"],
  },
  {
    name: "Rajasthan",
    country: "IN",
    cities: ["Jaipur", "Udaipur", "Jodhpur", "Kota", "Ajmer"],
  },
  {
    name: "Punjab",
    country: "IN",
    cities: ["Mohali", "Chandigarh", "Ludhiana", "Amritsar", "Jalandhar"],
  },
  {
    name: "Haryana",
    country: "IN",
    cities: ["Gurugram", "Faridabad", "Panchkula", "Panipat", "Ambala"],
  },

  // --- United Kingdom (GB) ---
  {
    name: "England",
    country: "GB",
    cities: [
      "London",
      "Manchester",
      "Birmingham",
      "Bristol",
      "Cambridge",
      "Oxford",
      "Leeds",
      "Liverpool",
      "Sheffield",
      "Newcastle",
      "Southampton",
      "Reading",
      "Brighton",
    ],
  },
  {
    name: "Scotland",
    country: "GB",
    cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee", "Stirling"],
  },
  {
    name: "Wales",
    country: "GB",
    cities: ["Cardiff", "Swansea", "Newport"],
  },
  {
    name: "Northern Ireland",
    country: "GB",
    cities: ["Belfast", "Derry", "Lisburn"],
  },

  // --- Germany (DE) ---
  {
    name: "Bavaria",
    country: "DE",
    cities: ["Munich", "Nuremberg", "Augsburg", "Regensburg", "Würzburg", "Erlangen"],
  },
  {
    name: "Berlin",
    country: "DE",
    cities: ["Berlin"],
  },
  {
    name: "Baden-Württemberg",
    country: "DE",
    cities: ["Stuttgart", "Karlsruhe", "Mannheim", "Heidelberg", "Freiburg", "Ulm"],
  },
  {
    name: "North Rhine-Westphalia",
    country: "DE",
    cities: ["Cologne", "Düsseldorf", "Dortmund", "Essen", "Bonn", "Münster", "Aachen"],
  },
  {
    name: "Hesse",
    country: "DE",
    cities: ["Frankfurt", "Wiesbaden", "Kassel", "Darmstadt", "Offenbach"],
  },
  {
    name: "Hamburg",
    country: "DE",
    cities: ["Hamburg"],
  },
  {
    name: "Saxony",
    country: "DE",
    cities: ["Leipzig", "Dresden", "Chemnitz"],
  },

  // --- Canada (CA) ---
  {
    name: "Ontario",
    country: "CA",
    cities: ["Toronto", "Ottawa", "Waterloo", "Mississauga", "Hamilton", "Kitchener", "London", "Markham"],
  },
  {
    name: "British Columbia",
    country: "CA",
    cities: ["Vancouver", "Victoria", "Burnaby", "Richmond", "Surrey", "Kelowna"],
  },
  {
    name: "Quebec",
    country: "CA",
    cities: ["Montreal", "Quebec City", "Laval", "Gatineau"],
  },
  {
    name: "Alberta",
    country: "CA",
    cities: ["Calgary", "Edmonton", "Red Deer", "Lethbridge"],
  },
  {
    name: "Nova Scotia",
    country: "CA",
    cities: ["Halifax", "Dartmouth", "Sydney"],
  },

  // --- Remote Global ---
  {
    name: "Global Remote",
    country: "REMOTE",
    cities: ["Worldwide", "US Remote", "EMEA Remote", "APAC Remote", "Americas Remote"],
  },
];

// -----------------------------------------------------------------------------
// Canonical Skills Taxonomy
// -----------------------------------------------------------------------------
const CANONICAL_SKILLS: string[] = [
  // Web & Frontend
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "Vue.js",
  "Angular",
  "Tailwind CSS",
  "HTML5",
  "CSS3",
  "Redux",
  "GraphQL",
  "Webpack",
  "Vite",

  // Backend & Languages
  "Node.js",
  "Python",
  "Java",
  "Go",
  "Rust",
  "C++",
  "C#",
  ".NET",
  "Ruby",
  "Ruby on Rails",
  "PHP",
  "Swift",
  "Kotlin",
  "FastAPI",
  "Django",
  "Spring Boot",
  "Express.js",

  // Cloud & DevOps
  "AWS",
  "Azure",
  "Google Cloud (GCP)",
  "Docker",
  "Kubernetes",
  "Terraform",
  "CI/CD",
  "GitHub Actions",
  "GitLab CI",
  "Linux",
  "DevOps",
  "Site Reliability (SRE)",
  "Ansible",
  "Helm",
  "Microservices",

  // Databases & Messaging
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Kafka",
  "RabbitMQ",
  "Elasticsearch",
  "DynamoDB",
  "Snowflake",
  "Databricks",

  // Data & AI
  "Machine Learning",
  "Artificial Intelligence (AI)",
  "Deep Learning",
  "PyTorch",
  "TensorFlow",
  "NLP",
  "Large Language Models (LLMs)",
  "Computer Vision",
  "Data Analysis",
  "Pandas",
  "Apache Spark",
  "PowerBI",
  "Tableau",

  // Cybersecurity
  "Cybersecurity",
  "Information Security (InfoSec)",
  "Penetration Testing",
  "SOC Analysis",
  "SIEM",
  "CISSP",
  "Zero Trust",
  "Cloud Security",
  "Identity & Access Management (IAM)",

  // Enterprise & Healthcare
  "SAP",
  "Salesforce",
  "ServiceNow",
  "Workday",
  "Epic Systems",
  "Patient Care",
  "Clinical Research",
  "BLS",
  "ACLS",
  "Nursing",
  "Healthcare Compliance",
  "HIPAA",

  // Business & Operations
  "Agile",
  "Scrum",
  "Product Management",
  "Project Management",
  "Accounting",
  "Financial Analysis",
  "Digital Marketing",
  "SEO",
  "Sales Operations",
  "Human Resources",
];

// -----------------------------------------------------------------------------
// Canonical Job Titles Taxonomy
// -----------------------------------------------------------------------------
const CANONICAL_TITLES: string[] = [
  "Software Engineer",
  "Senior Software Engineer",
  "Full Stack Developer",
  "Frontend Engineer",
  "Backend Developer",
  "Staff Software Engineer",
  "Principal Engineer",
  "DevOps Engineer",
  "Cloud Solutions Architect",
  "Site Reliability Engineer (SRE)",
  "Data Engineer",
  "Senior Data Engineer",
  "Data Scientist",
  "Machine Learning Engineer",
  "AI Engineer",
  "Cybersecurity Engineer",
  "Information Security Analyst",
  "QA Engineer",
  "SDET (Software Development Engineer in Test)",
  "Mobile Developer (iOS / Android)",
  "Technical Lead",
  "Engineering Manager",
  "Director of Engineering",
  "VP of Engineering",
  "Technical Product Manager",
  "Product Manager",
  "Scrum Master",
  "Systems Administrator",
  "Network Engineer",
  "IT Support Specialist",
  "Solutions Consultant",
  "Registered Nurse (RN)",
  "Nurse Practitioner",
  "Clinical Nurse Specialist",
  "Medical Assistant",
  "Pharmacy Technician",
  "Financial Analyst",
  "Senior Accountant",
  "Controller",
  "Tax Specialist",
  "Risk Management Analyst",
  "Account Executive",
  "Business Development Representative (BDR)",
  "Sales Operations Specialist",
  "Customer Success Manager",
  "Marketing Operations Manager",
  "Content Strategist",
  "Talent Acquisition Partner",
  "HR Generalist",
  "People Operations Specialist",
  "Operations Coordinator",
];

// -----------------------------------------------------------------------------
// Canonical Employers Taxonomy
// -----------------------------------------------------------------------------
const CANONICAL_EMPLOYERS: string[] = [
  "Stripe",
  "Google",
  "Microsoft",
  "Amazon",
  "Apple",
  "Meta",
  "Netflix",
  "Deliveroo",
  "Mayo Clinic",
  "Kaiser Permanente",
  "UnitedHealth Group",
  "JPMorgan Chase",
  "Goldman Sachs",
  "Morgan Stanley",
  "Bank of America",
  "Salesforce",
  "ServiceNow",
  "Snowflake",
  "Datadog",
  "Uber",
  "Airbnb",
  "Atlassian",
  "Shopify",
  "Cisco Systems",
  "Intel",
  "Nvidia",
  "Oracle",
  "IBM",
  "Accenture",
  "Deloitte",
  "PwC",
  "Ernst & Young (EY)",
  "KPMG",
  "Siemens",
  "SAP SE",
  "Wipro",
  "Infosys",
  "Tata Consultancy Services (TCS)",
];

export class JobDiscoveryAutocompleteEngine {
  /**
   * Search suggestions with location context, debouncing, and bounded results.
   */
  async searchAutocomplete(
    params: ValidatedJobAutocompleteQuery
  ): Promise<AutocompleteSuggestion[]> {
    const rawQuery = (params.query || "").trim();
    const type = params.type || "all";
    const country = params.country && params.country !== "ALL" ? params.country.toUpperCase() : undefined;
    const stateFilter = params.state?.trim() || undefined;
    const limit = Math.min(params.limit || 8, 25);

    // 1. Location-Specific State/Region Autocomplete
    if (type === "state") {
      return this.getStateSuggestions(rawQuery, country, limit);
    }

    // 2. Location-Specific City Autocomplete
    if (type === "city") {
      return this.getCitySuggestions(rawQuery, country, stateFilter, limit);
    }

    // 3. Main Search Box / Mixed Autocomplete
    return this.getMainSearchSuggestions(rawQuery, country, limit);
  }

  /**
   * Generates location-specific state/region suggestions
   */
  private async getStateSuggestions(
    query: string,
    countryFilter?: string,
    limit: number = 8
  ): Promise<AutocompleteSuggestion[]> {
    const qLower = query.toLowerCase();
    const results: Array<{ score: number; item: AutocompleteSuggestion }> = [];

    // Filter by geographic states
    let availableStates = GEOGRAPHIC_DATA;
    if (countryFilter) {
      availableStates = GEOGRAPHIC_DATA.filter(
        (s) => s.country.toUpperCase() === countryFilter.toUpperCase()
      );
    }

    for (const state of availableStates) {
      const nameLower = state.name.toLowerCase();
      const codeLower = (state.code || "").toLowerCase();

      let score = 0;
      if (!qLower) {
        // Return top states if query is empty
        score = 10;
      } else if (nameLower === qLower || codeLower === qLower) {
        score = 100;
      } else if (nameLower.startsWith(qLower) || codeLower.startsWith(qLower)) {
        score = 80;
      } else if (nameLower.includes(qLower)) {
        score = 40;
      }

      if (score > 0) {
        // Country affinity bonus
        if (countryFilter && state.country.toUpperCase() === countryFilter.toUpperCase()) {
          score += 20;
        }

        results.push({
          score,
          item: {
            id: `state-${state.country}-${state.name}`,
            text: state.name,
            category: "state",
            subtext: state.code ? `${state.code}, ${state.country}` : state.country,
            badgeLabel: "State / Region",
            source: "taxonomy",
            country: state.country,
            state: state.name,
          },
        });
      }
    }

    // Attempt to pull real distinct states from database if available
    try {
      if (qLower.length >= 2) {
        const dbJobs = await prisma.discoveredJob.findMany({
          where: {
            state: {
              contains: query,
              mode: "insensitive",
            },
            ...(countryFilter ? { country: countryFilter } : {}),
          },
          select: { state: true, country: true },
          take: 5,
          distinct: ["state"],
        });

        for (const job of dbJobs) {
          if (job.state) {
            const alreadyIn = results.some(
              (r) => r.item.text.toLowerCase() === job.state!.toLowerCase()
            );
            if (!alreadyIn) {
              results.push({
                score: 75,
                item: {
                  id: `state-db-${job.state}`,
                  text: job.state,
                  category: "state",
                  subtext: job.country ? `Verified in ${job.country}` : "From Verified Postings",
                  badgeLabel: "State / Region",
                  source: "catalog",
                  country: job.country || undefined,
                  state: job.state,
                },
              });
            }
          }
        }
      }
    } catch {
      // Graceful fallback if database query is unavailable
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.item);
  }

  /**
   * Generates location-specific city suggestions filtered by state & country
   */
  private async getCitySuggestions(
    query: string,
    countryFilter?: string,
    stateFilter?: string,
    limit: number = 8
  ): Promise<AutocompleteSuggestion[]> {
    const qLower = query.toLowerCase();
    const sFilterLower = stateFilter?.toLowerCase().trim();
    const results: Array<{ score: number; item: AutocompleteSuggestion }> = [];

    // Filter relevant state buckets
    let candidateStates = GEOGRAPHIC_DATA;
    if (countryFilter) {
      candidateStates = candidateStates.filter(
        (s) => s.country.toUpperCase() === countryFilter.toUpperCase()
      );
    }
    if (sFilterLower) {
      candidateStates = candidateStates.filter(
        (s) =>
          s.name.toLowerCase().includes(sFilterLower) ||
          (s.code && s.code.toLowerCase() === sFilterLower)
      );
    }

    // Collect matching cities
    for (const state of candidateStates) {
      for (const city of state.cities) {
        const cityLower = city.toLowerCase();

        let score = 0;
        if (!qLower) {
          score = 15;
        } else if (cityLower === qLower) {
          score = 100;
        } else if (cityLower.startsWith(qLower)) {
          score = 80;
        } else if (cityLower.includes(qLower)) {
          score = 40;
        }

        if (score > 0) {
          // Priority bonuses
          if (sFilterLower && state.name.toLowerCase().includes(sFilterLower)) {
            score += 30;
          }
          if (countryFilter && state.country.toUpperCase() === countryFilter.toUpperCase()) {
            score += 15;
          }

          results.push({
            score,
            item: {
              id: `city-${state.country}-${state.name}-${city}`,
              text: city,
              category: "city",
              subtext: `${state.name}, ${state.country}`,
              badgeLabel: "City",
              source: "taxonomy",
              country: state.country,
              state: state.name,
              city,
            },
          });
        }
      }
    }

    // Pull real distinct cities from database
    try {
      if (qLower.length >= 2) {
        const dbJobs = await prisma.discoveredJob.findMany({
          where: {
            city: {
              contains: query,
              mode: "insensitive",
            },
            ...(countryFilter ? { country: countryFilter } : {}),
            ...(stateFilter ? { state: { contains: stateFilter, mode: "insensitive" } } : {}),
          },
          select: { city: true, state: true, country: true },
          take: 6,
          distinct: ["city"],
        });

        for (const job of dbJobs) {
          if (job.city) {
            const alreadyIn = results.some(
              (r) => r.item.text.toLowerCase() === job.city!.toLowerCase()
            );
            if (!alreadyIn) {
              results.push({
                score: 85,
                item: {
                  id: `city-db-${job.city}`,
                  text: job.city,
                  category: "city",
                  subtext: [job.state, job.country].filter(Boolean).join(", ") || "Verified Location",
                  badgeLabel: "City",
                  source: "catalog",
                  country: job.country || undefined,
                  state: job.state || undefined,
                  city: job.city,
                },
              });
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.item);
  }

  /**
   * Generates mixed, location-aware suggestions for the main search box:
   * Job Titles, Skills, Employers, and Locations
   */
  private async getMainSearchSuggestions(
    query: string,
    countryFilter?: string,
    limit: number = 8
  ): Promise<AutocompleteSuggestion[]> {
    const qLower = query.toLowerCase();
    const suggestions: Array<{ score: number; item: AutocompleteSuggestion }> = [];

    // Helper to calculate string matching score
    const scoreMatch = (target: string, queryStr: string): number => {
      if (!queryStr) return 10;
      const tLower = target.toLowerCase();
      if (tLower === queryStr) return 100;
      if (tLower.startsWith(queryStr)) return 85;
      const words = tLower.split(/\s+/);
      if (words.some((w) => w.startsWith(queryStr))) return 65;
      if (tLower.includes(queryStr)) return 40;
      return 0;
    };

    // 1. Job Titles (Taxonomy)
    for (const title of CANONICAL_TITLES) {
      const score = scoreMatch(title, qLower);
      if (score > 0) {
        suggestions.push({
          score: score + 10, // Slight boost for title intent
          item: {
            id: `title-${title}`,
            text: title,
            category: "title",
            subtext: "Standard Occupational Title",
            badgeLabel: "Job Title",
            source: "taxonomy",
          },
        });
      }
    }

    // 2. Skills (Taxonomy)
    for (const skill of CANONICAL_SKILLS) {
      const score = scoreMatch(skill, qLower);
      if (score > 0) {
        suggestions.push({
          score: score + 5,
          item: {
            id: `skill-${skill}`,
            text: skill,
            category: "skill",
            subtext: "Required / Preferred Skill",
            badgeLabel: "Skill",
            source: "taxonomy",
          },
        });
      }
    }

    // 3. Employers / Companies (Taxonomy)
    for (const employer of CANONICAL_EMPLOYERS) {
      const score = scoreMatch(employer, qLower);
      if (score > 0) {
        suggestions.push({
          score,
          item: {
            id: `employer-${employer}`,
            text: employer,
            category: "employer",
            subtext: "Verified Employer",
            badgeLabel: "Company",
            source: "taxonomy",
          },
        });
      }
    }

    // 4. Locations (Geographic Taxonomy with Country Awareness)
    for (const state of GEOGRAPHIC_DATA) {
      // Check City matches
      for (const city of state.cities) {
        const score = scoreMatch(city, qLower);
        if (score > 0) {
          let adjusted = score;
          if (countryFilter && state.country.toUpperCase() === countryFilter.toUpperCase()) {
            adjusted += 25; // Country affinity
          }
          suggestions.push({
            score: adjusted,
            item: {
              id: `loc-${state.country}-${city}`,
              text: `${city}, ${state.code || state.name}`,
              category: "location",
              subtext: state.country,
              badgeLabel: "Location",
              source: "taxonomy",
              country: state.country,
              state: state.name,
              city,
            },
          });
        }
      }

      // Check State matches
      const stateScore = scoreMatch(state.name, qLower);
      if (stateScore > 0) {
        let adjusted = stateScore;
        if (countryFilter && state.country.toUpperCase() === countryFilter.toUpperCase()) {
          adjusted += 20;
        }
        suggestions.push({
          score: adjusted,
          item: {
            id: `loc-state-${state.country}-${state.name}`,
            text: `${state.name}, ${state.country}`,
            category: "location",
            subtext: "Region",
            badgeLabel: "Location",
            source: "taxonomy",
            country: state.country,
            state: state.name,
          },
        });
      }
    }

    // 5. Query Real Data from Database (Job and DiscoveredJob)
    try {
      if (qLower.length >= 2) {
        // Query real job titles
        const dbTitles = await prisma.job.findMany({
          where: {
            title: { contains: query, mode: "insensitive" },
          },
          select: { title: true, companyName: true },
          take: 4,
          distinct: ["title"],
        });

        for (const j of dbTitles) {
          const normTitle = normalizeJobTitle(j.title);
          const alreadyIn = suggestions.some(
            (s) => s.item.text.toLowerCase() === normTitle.toLowerCase()
          );
          if (!alreadyIn) {
            suggestions.push({
              score: 90,
              item: {
                id: `title-db-${normTitle}`,
                text: normTitle,
                category: "title",
                subtext: `Active in OOS Catalog (${j.companyName})`,
                badgeLabel: "Job Title",
                source: "catalog",
              },
            });
          }
        }

        // Query real employers
        const dbEmployers = await prisma.job.findMany({
          where: {
            companyName: { contains: query, mode: "insensitive" },
          },
          select: { companyName: true },
          take: 3,
          distinct: ["companyName"],
        });

        for (const j of dbEmployers) {
          const normComp = normalizeCompanyName(j.companyName);
          const alreadyIn = suggestions.some(
            (s) => s.item.text.toLowerCase() === normComp.toLowerCase()
          );
          if (!alreadyIn) {
            suggestions.push({
              score: 85,
              item: {
                id: `employer-db-${normComp}`,
                text: normComp,
                category: "employer",
                subtext: "OOS Catalog Employer",
                badgeLabel: "Company",
                source: "catalog",
              },
            });
          }
        }
      }
    } catch {
      // Graceful fallback if database query fails or during tests
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    // Dedup by lowercase text
    const seen = new Set<string>();
    const deduped: AutocompleteSuggestion[] = [];

    for (const entry of suggestions) {
      const key = `${entry.item.category}::${entry.item.text.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry.item);
      }
      if (deduped.length >= limit) {
        break;
      }
    }

    return deduped;
  }
}

export const jobDiscoveryAutocompleteEngine = new JobDiscoveryAutocompleteEngine();
