interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * UK ONS MCP — Office for National Statistics (no auth)
 *
 * UK official statistics: economy, population, labour market, public finances,
 * trade. Complement to Eurostat (which excluded UK post-Brexit).
 *
 * API: https://developer.ons.gov.uk/
 * Auth: none.
 *
 * Tools:
 * - list_datasets:    paginated dataset catalog
 * - get_dataset:      dataset metadata, latest version
 * - list_editions:    editions of a dataset
 * - get_version:      specific edition + version
 * - get_observations: filter the cube and return rows
 */


const BASE_URL = 'https://api.beta.ons.gov.uk/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'list_datasets',
    description:
      'Paginated catalog of ONS datasets. Returns id, title, description, contacts, release frequency, last release, theme.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '1-100 (default 20)' },
        offset: { type: 'number', description: '0-based offset (default 0)' },
      },
      required: [],
    },
  },
  {
    name: 'get_dataset',
    description:
      'Single dataset metadata: title, description, methodology, contacts, release frequency, latest version, related links.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'ONS dataset ID (e.g., "cpih01", "ashe-table-1")' },
      },
      required: ['dataset_id'],
    },
  },
  {
    name: 'list_editions',
    description: 'Editions of a dataset (e.g., quarterly editions, annual editions). Returns edition labels + latest versions.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'ONS dataset ID' },
      },
      required: ['dataset_id'],
    },
  },
  {
    name: 'get_version',
    description:
      'Specific edition + version. Returns dimension definitions (with codelists), download links, release date.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'ONS dataset ID' },
        edition: { type: 'string', description: 'Edition label' },
        version: { type: 'string', description: 'Version (e.g., "1", "2")' },
      },
      required: ['dataset_id', 'edition', 'version'],
    },
  },
  {
    name: 'get_observations',
    description:
      'Fetch observations from a dataset/edition/version. Pass dimension filters as `dimensions` map ({"geography": "K02000001", "time": "2023"}). Use `*` for "all values" within a dimension.',
    inputSchema: {
      type: 'object',
      properties: {
        dataset_id: { type: 'string', description: 'ONS dataset ID' },
        edition: { type: 'string', description: 'Edition label' },
        version: { type: 'string', description: 'Version' },
        dimensions: {
          type: 'object',
          description:
            'Dimension code → value (or "*" for all). Example: {"geography":"K02000001","time":"2023"}.',
        },
      },
      required: ['dataset_id', 'edition', 'version', 'dimensions'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_datasets':
      return listDatasets((args.limit as number) ?? 20, (args.offset as number) ?? 0);
    case 'get_dataset':
      return getDataset(reqStr(args, 'dataset_id', '"cpih01"'));
    case 'list_editions':
      return listEditions(reqStr(args, 'dataset_id', '"cpih01"'));
    case 'get_version':
      return getVersion(
        reqStr(args, 'dataset_id', '"cpih01"'),
        reqStr(args, 'edition', '"time-series"'),
        reqStr(args, 'version', '"1"'),
      );
    case 'get_observations':
      return getObservations(
        reqStr(args, 'dataset_id', '"cpih01"'),
        reqStr(args, 'edition', '"time-series"'),
        reqStr(args, 'version', '"1"'),
        (args.dimensions as Record<string, string>) ?? {},
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

async function onsFetch<T>(path: string, params?: URLSearchParams): Promise<T> {
  const url = `${BASE_URL}${path}${params?.toString() ? `?${params}` : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error('UK ONS: not found (HTTP 404)');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`UK ONS error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface OnsDataset {
  id?: string;
  title?: string;
  description?: string;
  next_release?: string;
  release_frequency?: string;
  license?: string;
  national_statistic?: boolean;
  state?: string;
  theme?: string;
  contacts?: { name?: string; email?: string; telephone?: string }[];
  publisher?: { name?: string; href?: string };
  links?: { self?: { href?: string }; editions?: { href?: string }; latest_version?: { href?: string; id?: string } };
  type?: string;
}

async function listDatasets(limit: number, offset: number) {
  const params = new URLSearchParams({
    limit: String(Math.min(100, Math.max(1, limit))),
    offset: String(Math.max(0, offset)),
  });
  const data = await onsFetch<{ count?: number; items?: OnsDataset[]; total_count?: number; total?: number }>(
    '/datasets',
    params,
  );
  return {
    total: data.total_count ?? data.total ?? null,
    returned: data.items?.length ?? 0,
    datasets: (data.items ?? []).map(normalizeDataset),
  };
}

function normalizeDataset(d: OnsDataset) {
  return {
    id: d.id ?? null,
    title: d.title ?? null,
    description: d.description ?? null,
    theme: d.theme ?? null,
    state: d.state ?? null,
    type: d.type ?? null,
    national_statistic: d.national_statistic ?? null,
    release_frequency: d.release_frequency ?? null,
    next_release: d.next_release ?? null,
    license: d.license ?? null,
    publisher: d.publisher?.name ?? null,
    contacts: (d.contacts ?? []).map((c) => ({ name: c.name ?? null, email: c.email ?? null })),
    latest_version_id: d.links?.latest_version?.id ?? null,
  };
}

async function getDataset(datasetId: string) {
  const data = await onsFetch<OnsDataset>(`/datasets/${encodeURIComponent(datasetId)}`);
  return normalizeDataset(data);
}

interface OnsEdition {
  edition?: string;
  release_date?: string;
  state?: string;
  links?: { self?: { href?: string }; latest_version?: { href?: string; id?: string }; versions?: { href?: string } };
}

async function listEditions(datasetId: string) {
  const data = await onsFetch<{ count?: number; items?: OnsEdition[]; total_count?: number }>(
    `/datasets/${encodeURIComponent(datasetId)}/editions`,
  );
  return {
    dataset_id: datasetId,
    total: data.total_count ?? data.count ?? 0,
    editions: (data.items ?? []).map((e) => ({
      edition: e.edition ?? null,
      release_date: e.release_date ?? null,
      state: e.state ?? null,
      latest_version_id: e.links?.latest_version?.id ?? null,
    })),
  };
}

interface OnsVersion {
  version?: number;
  release_date?: string;
  state?: string;
  dimensions?: { name?: string; id?: string; label?: string; href?: string }[];
  downloads?: { csv?: { href?: string; size?: string }; csvw?: { href?: string }; xls?: { href?: string }; xlsx?: { href?: string } };
}

async function getVersion(datasetId: string, edition: string, version: string) {
  const data = await onsFetch<OnsVersion>(
    `/datasets/${encodeURIComponent(datasetId)}/editions/${encodeURIComponent(edition)}/versions/${encodeURIComponent(version)}`,
  );
  return {
    dataset_id: datasetId,
    edition,
    version: data.version ?? Number(version),
    state: data.state ?? null,
    release_date: data.release_date ?? null,
    dimensions: (data.dimensions ?? []).map((d) => ({
      name: d.name ?? null,
      id: d.id ?? null,
      label: d.label ?? null,
    })),
    downloads: {
      csv: data.downloads?.csv?.href ?? null,
      csvw: data.downloads?.csvw?.href ?? null,
      xls: data.downloads?.xls?.href ?? null,
      xlsx: data.downloads?.xlsx?.href ?? null,
    },
  };
}

interface OnsObservationsResp {
  dimensions?: Record<string, { option?: { id?: string; href?: string } }>;
  observations?: { observation?: string; dimensions?: Record<string, { id?: string; href?: string; label?: string }> }[];
  total_observations?: number;
  unit_of_measure?: string;
  usage_notes?: { title?: string; note?: string }[];
}

async function getObservations(
  datasetId: string,
  edition: string,
  version: string,
  dimensions: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(dimensions)) {
    params.set(k, v);
  }
  const data = await onsFetch<OnsObservationsResp>(
    `/datasets/${encodeURIComponent(datasetId)}/editions/${encodeURIComponent(edition)}/versions/${encodeURIComponent(version)}/observations`,
    params,
  );
  return {
    dataset_id: datasetId,
    edition,
    version,
    total_observations: data.total_observations ?? null,
    unit_of_measure: data.unit_of_measure ?? null,
    notes: (data.usage_notes ?? []).map((n) => n.note).filter(Boolean),
    observations: (data.observations ?? []).map((o) => ({
      value: o.observation ?? null,
      dimensions: Object.fromEntries(
        Object.entries(o.dimensions ?? {}).map(([k, v]) => [k, { id: v.id ?? null, label: v.label ?? null }]),
      ),
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
