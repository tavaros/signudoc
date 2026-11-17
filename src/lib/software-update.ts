// Whether a newer SignuDoc has been released, for the SignuDoc section of
// Settings. The running version is baked in at build time (next.config.ts);
// the latest one is the newest GitHub Release of the project, read from
// GitHub's public API without a token. That API allows 60 requests an hour
// per address, and a Vercel function shares its address with others, so the
// answer is kept for a while and a failure is reported, never thrown.

export const UPSTREAM_OWNER = "NYLLON-SOFTWARE";
export const UPSTREAM_REPO = "SignuDoc";
export const UPSTREAM_SLUG = `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`;
export const UPSTREAM_RELEASES_URL = `https://github.com/${UPSTREAM_SLUG}/releases`;
export const UPDATE_WORKFLOW_FILE = "update-signudoc.yml";
export const UPDATE_WORKFLOW_PATH = `.github/workflows/${UPDATE_WORKFLOW_FILE}`;
export const UPDATE_DOCS_URL = `https://github.com/${UPSTREAM_SLUG}/blob/main/docs/self-hosting.md#keep-your-install-up-to-date`;
export const UPDATE_WORKFLOW_SOURCE_URL = `https://raw.githubusercontent.com/${UPSTREAM_SLUG}/main/${UPDATE_WORKFLOW_PATH}`;

const LATEST_RELEASE_API = `https://api.github.com/repos/${UPSTREAM_SLUG}/releases/latest`;
const SUCCESS_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
// Release notes are shown as text in Settings; a very long one is cut.
const MAX_NOTES_LENGTH = 20_000;

export type ReleaseInfo = {
  name: string;
  notes: string;
  publishedAt: string | null;
  url: string;
  version: string;
};

export type DeployRepository = {
  /** The Actions page of the update workflow in the install's own copy. */
  actionsUrl: string;
  /** Adds the update workflow to a copy made before it existed. */
  addWorkflowUrl: string;
  branch: string;
  isUpstream: boolean;
  owner: string;
  slug: string;
  url: string;
};

export type UpdateCheck =
  | {
      checkedAt: string;
      current: string;
      latest: ReleaseInfo;
      ok: true;
      updateAvailable: boolean;
    }
  | {
      checkedAt: string;
      current: string;
      error: string;
      ok: false;
    };

export type UpdateStatus = {
  check: UpdateCheck | null;
  commit: string | null;
  current: string;
  docsUrl: string;
  releasesUrl: string;
  repository: DeployRepository | null;
  workflowSourceUrl: string;
};

type Env = Record<string, string | undefined>;

/** The version this deployment was built from, from package.json. */
export function getRunningVersion(env?: Env): string {
  // Spelled out in full so the build can put the value in its place.
  const value = env
    ? env.NEXT_PUBLIC_SIGNUDOC_VERSION
    : process.env.NEXT_PUBLIC_SIGNUDOC_VERSION;

  return value?.trim() || "0.0.0";
}

/** The commit this deployment was built from, when Vercel says. */
export function getRunningCommit(env: Env = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();

  return sha && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
}

const NAME_PART = /^[A-Za-z0-9_.-]{1,100}$/;

/**
 * The GitHub repository Vercel deploys this install from: the copy the
 * Deploy button made. Vercel exposes it in its system environment
 * variables. Null when the install is not deployed from GitHub on Vercel.
 */
export function getDeployRepository(
  env: Env = process.env,
): DeployRepository | null {
  if (env.VERCEL_GIT_PROVIDER !== "github") {
    return null;
  }

  const owner = env.VERCEL_GIT_REPO_OWNER?.trim() ?? "";
  const slug = env.VERCEL_GIT_REPO_SLUG?.trim() ?? "";

  if (!NAME_PART.test(owner) || !NAME_PART.test(slug)) {
    return null;
  }

  // Production deployments are built from the production branch. A preview
  // is built from some other branch, and the workflow belongs on the
  // production one, which is main unless the deployer changed it.
  const ref = env.VERCEL_GIT_COMMIT_REF?.trim() ?? "";
  const branch =
    env.VERCEL_ENV === "production" && /^[A-Za-z0-9_./-]{1,200}$/.test(ref)
      ? ref
      : "main";
  const url = `https://github.com/${owner}/${slug}`;

  return {
    actionsUrl: `${url}/actions/workflows/${UPDATE_WORKFLOW_FILE}`,
    addWorkflowUrl: `${url}/new/${encodeURIComponent(branch)}?filename=${encodeURIComponent(UPDATE_WORKFLOW_PATH)}`,
    branch,
    isUpstream:
      `${owner}/${slug}`.toLowerCase() === UPSTREAM_SLUG.toLowerCase(),
    owner,
    slug,
    url,
  };
}

type ParsedVersion = { core: [number, number, number]; pre: string | null };

export function parseVersion(value: string): ParsedVersion | null {
  const match =
    /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value.trim(),
    );

  if (!match) {
    return null;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ?? null,
  };
}

/** Negative when a is older than b, positive when newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (!left || !right) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    const difference = left.core[index] - right.core[index];

    if (difference !== 0) {
      return difference;
    }
  }

  // 1.0.0-beta comes before 1.0.0. Pre-releases are not compared further.
  if (left.pre && !right.pre) {
    return -1;
  }

  if (!left.pre && right.pre) {
    return 1;
  }

  return 0;
}

export function toReleaseInfo(payload: unknown): ReleaseInfo | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const tag = typeof record.tag_name === "string" ? record.tag_name : "";
  const parsed = parseVersion(tag);

  if (!parsed || record.draft === true || record.prerelease === true) {
    return null;
  }

  const version = parsed.core.join(".") + (parsed.pre ? `-${parsed.pre}` : "");
  const htmlUrl = typeof record.html_url === "string" ? record.html_url : "";
  // Only ever link to the project's own releases.
  const url = htmlUrl.startsWith(`https://github.com/${UPSTREAM_SLUG}/`)
    ? htmlUrl
    : `${UPSTREAM_RELEASES_URL}/tag/${encodeURIComponent(tag)}`;
  const body = typeof record.body === "string" ? record.body.trim() : "";
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : `SignuDoc ${version}`;

  return {
    name: name.slice(0, 200),
    notes:
      body.length > MAX_NOTES_LENGTH
        ? `${body.slice(0, MAX_NOTES_LENGTH)}\n\n…`
        : body,
    publishedAt:
      typeof record.published_at === "string" ? record.published_at : null,
    url,
    version,
  };
}

type CacheEntry = { expiresAt: number; value: UpdateCheck };

const cacheHolder = globalThis as typeof globalThis & {
  __signudocUpdateCheck?: CacheEntry;
};

export function clearUpdateCheckCache() {
  delete cacheHolder.__signudocUpdateCheck;
}

/**
 * Asks GitHub for the latest release and compares it with the running
 * version. Kept for 30 minutes (5 after a failure), shared by every
 * administrator of the install.
 */
export async function checkForUpdate({
  current = getRunningVersion(),
  fetchImpl = fetch,
  now = Date.now,
}: {
  current?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): Promise<UpdateCheck> {
  const cached = cacheHolder.__signudocUpdateCheck;

  if (cached && cached.expiresAt > now() && cached.value.current === current) {
    return cached.value;
  }

  const value = await fetchLatest(current, fetchImpl, now);

  cacheHolder.__signudocUpdateCheck = {
    expiresAt: now() + (value.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
    value,
  };

  return value;
}

async function fetchLatest(
  current: string,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<UpdateCheck> {
  const checkedAt = new Date(now()).toISOString();
  const fail = (error: string): UpdateCheck => ({
    checkedAt,
    current,
    error,
    ok: false,
  });

  let response: Response;

  try {
    response = await fetchImpl(LATEST_RELEASE_API, {
      cache: "no-store",
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "SignuDoc-update-check",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return fail("GitHub could not be reached. Try again in a few minutes.");
  }

  if (response.status === 404) {
    return fail("SignuDoc has no published release yet.");
  }

  if (response.status === 403 || response.status === 429) {
    return fail(
      "GitHub is limiting how often this server can ask. Try again later, or look at the releases page.",
    );
  }

  if (!response.ok) {
    return fail(
      `GitHub answered with an error (${response.status}). Try again later.`,
    );
  }

  const latest = toReleaseInfo(await response.json().catch(() => null));

  if (!latest) {
    return fail("GitHub's answer could not be read. Try again later.");
  }

  return {
    checkedAt,
    current,
    latest,
    ok: true,
    updateAvailable: compareVersions(current, latest.version) < 0,
  };
}

export function getUpdateStatus(
  check: UpdateCheck | null,
  env?: Env,
): UpdateStatus {
  return {
    check,
    commit: getRunningCommit(env ?? process.env),
    current: getRunningVersion(env),
    docsUrl: UPDATE_DOCS_URL,
    releasesUrl: UPSTREAM_RELEASES_URL,
    repository: getDeployRepository(env ?? process.env),
    workflowSourceUrl: UPDATE_WORKFLOW_SOURCE_URL,
  };
}
