import * as cache from "memory-cache";

import { CALCOM_PRIVATE_API_ROUTE } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import { getDeploymentKey } from "../../deployment/lib/getDeploymentKey";
import { generateNonce, createSignature } from "./private-api-utils";

export enum UsageEvent {
  BOOKING = "booking",
  USER = "user",
}

interface ILicenseKeyService {
  incrementUsage(usageEvent?: UsageEvent): Promise<any>;
  checkLicense(): Promise<boolean>;
}

class LicenseKeyService implements ILicenseKeyService {
  private readonly baseUrl = CALCOM_PRIVATE_API_ROUTE;
  private readonly licenseKey: string;
  public readonly CACHING_TIME = 86_400_000; // 24 hours in milliseconds

  // Private constructor to prevent direct instantiation
  private constructor(licenseKey: string) {
    this.baseUrl = CALCOM_PRIVATE_API_ROUTE;
    this.licenseKey = licenseKey;
  }

  // Static async factory method
  public static async create(): Promise<ILicenseKeyService> {
    const licenseKey = await getDeploymentKey(prisma);
    const useNoop = !licenseKey || process.env.NEXT_PUBLIC_IS_E2E === "1";
    return !useNoop ? new LicenseKeyService(licenseKey) : new NoopLicenseKeyService();
  }

  private async fetcher({
    url,
    body,
    options = {},
  }: {
    url: string;
    body?: Record<string, unknown>;
    options?: RequestInit;
  }): Promise<Response> {
    const nonce = generateNonce();

    const headers = {
      ...options.headers,
      "Content-Type": "application/json",
      nonce: nonce,
      "x-cal-license-key": this.licenseKey,
    } as Record<string, string>;

    const signatureToken = process.env.CAL_SIGNATURE_TOKEN;
    if (!signatureToken) {
      logger.warn("CAL_SIGNATURE_TOKEN needs to be set to increment usage.");
    } else {
      const signature = createSignature(body || {}, nonce, signatureToken);
      headers["signature"] = signature;
    }

    return await fetch(url, {
      ...options,
      headers: headers,
      body: JSON.stringify(body),
      // In case of hang, abort the operation after 2 seconds
      signal: AbortSignal.timeout(2000),
    });
  }

  async incrementUsage(usageEvent?: UsageEvent) {
    try {
      const response = await this.fetcher({
        url: `${this.baseUrl}/v1/license/usage/increment?event=${usageEvent ?? UsageEvent.BOOKING}`,
        options: {
          method: "POST",
          mode: "cors",
        },
      });
      return await response.json();
    } catch (error) {
      console.error("Incrementing usage failed:", error);
      throw error;
    }
  }

  async checkLicense(): Promise<boolean> {
    /** We skip for E2E testing */
    if (process.env.NEXT_PUBLIC_IS_E2E === "1") return true;
    /** We check first on env */
    // @HOTFIX - the old url is returning the license as invalid
    //const url = `${this.baseUrl}/v1/license/${this.licenseKey}`;
    const url = `https://console.cal.com/api/license?key=${this.licenseKey}`;
    const cachedResponse = cache.get(url);
    if (cachedResponse) return cachedResponse;
    try {
      const response = await this.fetcher({ url, options: { mode: "cors" } });
      const data = await response.json();
      cache.put(url, data.valid, this.CACHING_TIME);
      return data.valid;
    } catch (error) {
      console.error("Check license failed:", error);
      return false;
    }
  }
}

export class NoopLicenseKeyService implements ILicenseKeyService {
  async incrementUsage(_usageEvent?: UsageEvent): Promise<any> {
    // No operation
    return Promise.resolve();
  }

  async checkLicense(): Promise<boolean> {
    return Promise.resolve(process.env.NEXT_PUBLIC_IS_E2E === "1");
  }
}

export class LicenseKeySingleton {
  private static instance: ILicenseKeyService | null = null;

  // eslint-disable-next-line @typescript-eslint/no-empty-function -- Private constructor to prevent direct instantiation
  private constructor() {}

  public static async getInstance(): Promise<ILicenseKeyService> {
    if (!LicenseKeySingleton.instance) {
      const licenseKey = await getDeploymentKey(prisma);
      const useNoop = !licenseKey || process.env.NEXT_PUBLIC_IS_E2E === "1";
      LicenseKeySingleton.instance = !useNoop
        ? await LicenseKeyService.create()
        : new NoopLicenseKeyService();
    }
    return LicenseKeySingleton.instance;
  }
}

export default LicenseKeyService;
