//* Schemas imports
import {
  cardInfoResponseSchema,
  cardSearchQuerySchema,
  type CardInfoSuccess,
  type CardSearchQuery,
  type NumericFilter,
} from "../../schemas/ygo-pro-deck";

export type {
  CardSearchQuery,
  ComparisonOperator,
  NumericFilter,
} from "../../schemas/ygo-pro-deck";

const CARD_INFO_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const MAX_REQUESTS_PER_SECOND = 16;
const RATE_LIMIT_WAIT_MS = 1000;

type FetchLike = (url: string, options?: RequestInit) => Promise<Response>;

export class YGOProDeckApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YGOProDeckApiError";
  }
}

/**
 * Sleep for the given number of milliseconds.
 * @param ms - The number of milliseconds to sleep.
 * @returns A promise that resolves when the sleep is complete.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Join a list of values with a separator.
 * @param value - The list of values to join.
 * @param separator - The separator to use.
 * @returns The joined list of values.
 */

function joinList(
  value: string | number | readonly (string | number)[] | undefined,
  separator: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const items = Array.isArray(value) ? value : [value];

  if (items.length === 0) {
    return undefined;
  }

  return items.join(separator);
}

/**
 * Format a numeric filter.
 * @param value - The numeric filter to format.
 * @returns The formatted numeric filter.
 */

function formatNumericFilter(value: NumericFilter | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return `${value.operator}${value.value}`;
}

/**
 * Set a parameter in the URL search params.
 * @param params - The URL search params to set the parameter in.
 * @param key - The key of the parameter to set.
 * @param value - The value of the parameter to set.
 */

function setParam(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value === undefined) {
    return;
  }

  params.set(key, String(value));
}

/**
 * Options for the request rate gate.
 * @param maxPerSecond - The maximum number of requests per second.
 * @param waitMs - The wait time in milliseconds between requests.
 * @param sleep - The function to sleep for the wait time.
 * @param now - The function to get the current time.
 */
type RequestRateGateOptions = {
  maxPerSecond?: number;
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * A request rate gate.
 * @param maxPerSecond - The maximum number of requests per second.
 * @param waitMs - The wait time in milliseconds between requests.
 * @param sleep - The function to sleep for the wait time.
 * @param now - The function to get the current time.
 */
export class RequestRateGate {
  private tail: Promise<void> = Promise.resolve();
  private timestamps: number[] = [];
  private readonly maxPerSecond: number;
  private readonly waitMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options?: RequestRateGateOptions) {
    this.maxPerSecond = options?.maxPerSecond ?? MAX_REQUESTS_PER_SECOND;
    this.waitMs = options?.waitMs ?? RATE_LIMIT_WAIT_MS;
    this.sleep = options?.sleep ?? sleep;
    this.now = options?.now ?? Date.now;
  }

  /**
   * Acquire a request.
   * @returns A promise that resolves when the request is acquired.
   */
  acquire(): Promise<void> {
    const run = this.tail.then(() => this.reserve());

    this.tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  /**
   * Reserve a request.
   * @returns A promise that resolves when the request is reserved.
   */
  private async reserve(): Promise<void> {
    const now = this.now();

    this.timestamps = this.timestamps.filter((timestamp) => {
      return now - timestamp < this.waitMs;
    });

    if (this.timestamps.length >= this.maxPerSecond) {
      await this.sleep(this.waitMs);
      this.timestamps = [];
    }

    this.timestamps.push(this.now());
  }
}

const sharedGate = new RequestRateGate();

type YGOProDeckApiClientOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
  gate?: RequestRateGate;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * A YGOProDeck API client.
 * @param baseUrl - The base URL of the API.
 * @param fetchImpl - The fetch implementation to use.
 * @param gate - The request rate gate to use.
 * @param sleep - The function to sleep for the wait time.
 * @param now - The function to get the current time.
 */

export class YGOProDeckApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly gate: RequestRateGate;

  constructor(options?: YGOProDeckApiClientOptions) {
    this.baseUrl = options?.baseUrl ?? CARD_INFO_URL;
    this.fetchImpl = options?.fetch ?? fetch;
    this.gate = resolveGate(options);
  }

  /**
   * Make a request to the API.
   * @param url - The URL to make the request to.
   * @returns The response body.
   */
  async apiRequest(url: string): Promise<unknown> {
    await this.gate.acquire();

    let response: Response;

    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";

      throw new YGOProDeckApiError(message);
    }

    try {
      return await response.json();
    } catch {
      throw new YGOProDeckApiError("Response body is not valid JSON");
    }
  }

  /**
   * Search for cards.
   * @param query - The query to search for.
   * @returns The cards.
   */
  async searchCards(query: CardSearchQuery): Promise<CardInfoSuccess> {
    const parsedQuery = cardSearchQuerySchema.safeParse(query);

    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0];

      throw new YGOProDeckApiError(issue?.message ?? "Invalid card search query");
    }

    const body = await this.apiRequest(this.buildSearchUrl(parsedQuery.data));
    const parsed = cardInfoResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new YGOProDeckApiError(parsed.error.message);
    }

    if ("error" in parsed.data) {
      throw new YGOProDeckApiError(parsed.data.error);
    }

    return parsed.data;
  }

  /**
   * Build a search URL.
   * @param query - The query to build the URL for.
   * @returns The built URL.
   */
  private buildSearchUrl(query: CardSearchQuery): string {
    const url = new URL(this.baseUrl);
    const params = url.searchParams;

    setParam(params, "name", joinList(query.name, "|"));
    setParam(params, "fname", query.fname);
    setParam(params, "id", joinList(query.id, ","));
    setParam(params, "type", joinList(query.type, ","));
    setParam(params, "atk", formatNumericFilter(query.atk));
    setParam(params, "def", formatNumericFilter(query.def));
    setParam(params, "level", formatNumericFilter(query.level));
    setParam(params, "race", joinList(query.race, ","));
    setParam(params, "attribute", joinList(query.attribute, ","));
    setParam(params, "link", query.link);
    setParam(params, "linkmarker", joinList(query.linkmarker, ","));
    setParam(params, "scale", query.scale);
    setParam(params, "cardset", query.cardset);
    setParam(params, "archetype", query.archetype);
    setParam(params, "banlist", query.banlist);
    setParam(params, "sort", query.sort);
    setParam(params, "format", query.format);
    setParam(params, "misc", query.misc ? "yes" : undefined);
    setParam(params, "staple", query.staple ? "yes" : undefined);
    setParam(
      params,
      "has_effect",
      query.has_effect === undefined ? undefined : String(query.has_effect),
    );
    setParam(params, "startdate", query.startdate);
    setParam(params, "enddate", query.enddate);
    setParam(params, "dateregion", query.dateregion);
    setParam(params, "language", query.language);
    setParam(params, "num", query.num);
    setParam(params, "offset", query.offset);

    return url.toString();
  }
}

/**
 * Resolve the request rate gate.
 * @param options - The options to resolve the request rate gate.
 * @returns The request rate gate.
 */
function resolveGate(options?: {
  gate?: RequestRateGate;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): RequestRateGate {
  if (options?.gate) {
    return options.gate;
  }

  if (options?.sleep || options?.now) {
    return new RequestRateGate({
      sleep: options.sleep,
      now: options.now,
    });
  }

  return sharedGate;
}
