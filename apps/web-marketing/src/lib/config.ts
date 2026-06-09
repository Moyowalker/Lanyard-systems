function resolveApiUrl(): string {
	const configuredUrl = process.env.API_URL?.trim();
	if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

	const internalHostport = process.env.API_HOSTPORT?.trim();
	if (internalHostport) {
		const prefix = (process.env.API_GLOBAL_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');
		return `http://${internalHostport}/${prefix}`;
	}

	return 'http://localhost:4000/api/v1';
}

export const API_URL = resolveApiUrl();
export const STORE_URL = process.env.STORE_URL ?? 'http://localhost:3000';
export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3002';
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
